/**
 * Canonical RFC regression: Indent/PO/GRN PRD.
 *
 * A failure such as "No decisions recognized" on this document is a pipeline
 * failure, not an LLM failure.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readPdfBuffer } from "@/import/read-pdf";
import { importSource } from "@/import/import-source";
import type {
  ActionsPayload,
  BlockKind,
  DecisionsPayload,
  MemoryDocument,
  RisksPayload,
  SignalsPayload,
  SnapshotPayload,
  TimelinePayload,
} from "@/domain/memory/schema";

function payloadOf<T>(doc: MemoryDocument, kind: BlockKind): T {
  const block = doc.blocks.find((b) => b.kind === kind);
  if (!block) throw new Error(`missing block ${kind}`);
  return block.payload as T;
}

function allText(doc: MemoryDocument): string {
  const parts: string[] = [doc.title];
  for (const block of doc.blocks) {
    const p = block.payload as {
      summary?: string;
      hook?: string;
      notes?: string[];
      entries?: Array<Record<string, unknown>>;
    };
    if (p.summary) parts.push(p.summary);
    if (p.hook) parts.push(p.hook);
    if (p.notes) parts.push(...p.notes);
    for (const entry of p.entries ?? []) {
      parts.push(...Object.values(entry).map((v) => String(v ?? "")));
    }
  }
  return parts.join("\n");
}

describe("Indent_PO_GRN PRD — semantic understanding regression", () => {
  it("parses text, tables, and embedded spreadsheet end-to-end", async () => {
    const bytes = new Uint8Array(readFileSync(resolve("tests/fixtures/indent-po-grn.pdf")));
    const ocrText = readFileSync(resolve("tests/fixtures/indent-po-grn-cases-ocr.txt"), "utf8");

    const pdf = await readPdfBuffer(bytes, {
      ocr: {
        precomputed: [
          {
            page: 2,
            heading: "Cases – Sheet (embedded spreadsheet)",
            text: ocrText,
          },
        ],
      },
    });

    expect(pdf.pages).toBe(4);
    expect(pdf.text).toMatch(/Business Context/i);
    expect(pdf.text).toMatch(/PSTD-5922/);
    expect(pdf.text).toMatch(/embedded spreadsheet|Cases/i);
    expect(pdf.text).toMatch(/cannot be reduced|No changes are allowed/i);
    expect(pdf.ocrBlocks).toBeGreaterThanOrEqual(1);

    const result = importSource({ raw: pdf.text, label: "PRD for Indent_PO_GRN.pdf" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const doc = result.value;
    const blob = allText(doc).toLowerCase();

    // RFC expected understanding — presence, not exact wording.
    expect(blob).toMatch(/mid-market|onboarding|audit/);
    expect(blob).toMatch(/audit trail|revision|amend/);
    expect(blob).toMatch(
      /purchase manager|project manager|site engineer|finance|accountant|user story:\s*i want/i,
    );
    expect(blob).toMatch(/compliance|accountab|efficien/);
    expect(blob).toMatch(/p0|audit trail/);
    expect(blob).toMatch(/p1|amend/);
    expect(blob).toMatch(/adoption|efficien|quality|satisfaction|traceable/);
    expect(blob).toMatch(/amended after approval|approval workflow|permissions|time limit|uneditable/);
    expect(blob).toMatch(/cannot be reduced|contract is closed|indent|grn/);

    const snapshot = payloadOf<SnapshotPayload>(doc, "snapshot");
    expect(snapshot.summary.toLowerCase()).not.toMatch(/nothing here reads as a summary/);
    expect(snapshot.summary.length).toBeGreaterThan(40);

    const decisions = payloadOf<DecisionsPayload>(doc, "decisions");
    expect(decisions.entries.length).toBeGreaterThanOrEqual(3);
    const decisionText = decisions.entries.map((e) => e.text).join(" ").toLowerCase();
    expect(decisionText).toMatch(/edit history|audit|revision|amend|p0|p1/);

    // The exact failure the RFC forbids.
    const emptyDecisionWarning = (doc.warnings ?? []).some((w) =>
      /no decisions were recognized/i.test(w.message),
    );
    expect(emptyDecisionWarning).toBe(false);

    const risks = payloadOf<RisksPayload>(doc, "risks");
    expect(risks.entries.length).toBeGreaterThanOrEqual(2);
    const riskText = [
      ...risks.entries.map((e) => e.risk),
      ...(risks.notes ?? []),
    ]
      .join(" ")
      .toLowerCase();
    expect(riskText).toMatch(/audit|compliance|accountab|dispute|question|amend/);

    const signals = payloadOf<SignalsPayload>(doc, "signals");
    expect(signals.entries.length + (signals.notes?.length ?? 0)).toBeGreaterThanOrEqual(3);

    const actions = payloadOf<ActionsPayload>(doc, "actions");
    expect(actions.entries.length + (actions.notes?.length ?? 0)).toBeGreaterThanOrEqual(2);

    const timeline = payloadOf<TimelinePayload>(doc, "timeline");
    const timelineText = [
      ...timeline.entries.map((e) => `${e.date} ${e.title}`),
      ...(timeline.notes ?? []),
    ].join(" ");
    // Tickets may land in timeline entries or preserved notes after table parse.
    expect(`${timelineText}\n${blob}`).toMatch(/PSTD-\d+/);
    expect(timeline.entries.length + (timeline.notes?.length ?? 0)).toBeGreaterThanOrEqual(1);

    // Provenance must cite evidence — never ungrounded memories.
    for (const block of doc.blocks) {
      if (block.kind === "snapshot") continue;
      const entries = "entries" in block.payload ? block.payload.entries : [];
      if (entries.length === 0) continue;
      expect(block.provenance.locator).not.toBe("not found in source");
      expect((block.provenance.excerpt ?? "").length).toBeGreaterThan(0);
    }
  }, 60_000);
});
