/**
 * Two-column research PDF quality: dehyphenation, reading order, memorable projection.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildLayoutDocument, joinSoftWrap, type PdfTextItem } from "@/import/pdf/layout";
import { importSource } from "@/import/import-source";
import type {
  DecisionsPayload,
  SignalsPayload,
  SnapshotPayload,
  TimelinePayload,
} from "@/domain/memory/schema";

const PAPER = resolve("Evaluating_LLMs_on_Scientific_event_argument_extraction-v1.pdf");

async function layoutFirstPages(maxPages = 3) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(readFileSync(PAPER));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const pageItems: Array<{ page: number; items: PdfTextItem[] }> = [];
  for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const items: PdfTextItem[] = [];
    for (const item of content.items) {
      if (!("str" in item)) continue;
      items.push({
        str: String(item.str),
        transform: Array.from(item.transform ?? [1, 0, 0, 1, 0, 0]),
        width: Number(item.width ?? 0),
        height: Number(item.height ?? 0),
      });
    }
    pageItems.push({ page: i, items });
  }
  await doc.destroy();
  return buildLayoutDocument(pageItems);
}

describe("joinSoftWrap dehyphenation", () => {
  it("joins syllable wraps and keeps real compounds", () => {
    expect(joinSoftWrap("zeo-", "lite synthesis")).toBe("zeolite synthesis");
    expect(joinSoftWrap("funda-", "mental question")).toBe("fundamental question");
    expect(joinSoftWrap("domain-", "specific task")).toBe("domain-specific task");
    expect(joinSoftWrap("O4-", "mini, Claude")).toBe("O4-mini, Claude");
    expect(joinSoftWrap("state-of-the-", "art LLMs")).toBe("state-of-the-art LLMs");
  });
});

describe.skipIf(!existsSync(PAPER))("Evaluating LLMs research PDF", () => {
  it("rebuilds abstract without column mash or spaced hyphens", async () => {
    const layout = await layoutFirstPages(2);
    const md = layout.markdown;

    expect(md).toMatch(/Extracting structured information from zeolite/i);
    expect(md).toMatch(/fundamental question/i);
    expect(md).toMatch(/We focus on four key subtasks/i);
    expect(md).toMatch(/event type classification/i);

    // No classic column-shuffle fingerprints.
    expect(md).not.toMatch(/zeoin text/i);
    expect(md).not.toMatch(/\bNificant\b/);
    expect(md).not.toMatch(/sig-\s+nificant/i);
    expect(md).not.toMatch(/domainmental/i);

    // Soft-wrap hyphens should not remain as "word- word" inside a line.
    const spacedHyphens = [...md.matchAll(/[A-Za-z]{3,}-[^\S\n]+[a-z]{3,}/g)].map((m) => m[0]);
    expect(spacedHyphens).toEqual([]);
    expect(md).toMatch(/classification/i);
  }, 60000);

  it("projects memorable Research Question / Findings / Insights (not garbage fragments)", async () => {
    const layout = await layoutFirstPages(4);
    const result = importSource({
      raw: layout.markdown,
      label: "Evaluating_LLMs_on_Scientific_event_argument_extraction-v1.pdf",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.archetype?.id).toBe("research");

    const byKind = Object.fromEntries(result.value.blocks.map((b) => [b.kind, b.payload]));
    const question = byKind.snapshot as SnapshotPayload;
    const findings = byKind.timeline as TimelinePayload | undefined;
    const evidence = byKind.signals as SignalsPayload | undefined;
    const insights = byKind.decisions as DecisionsPayload | undefined;

    const allText = [
      question?.summary,
      question?.problem,
      question?.goal,
      ...(findings?.entries ?? []).map((e) => e.title),
      ...(evidence?.entries ?? []).map((e) => e.implication ?? e.label),
      ...(insights?.entries ?? []).map((e) => e.text),
    ]
      .filter(Boolean)
      .join("\n");

    // No mid-word or hyphen-shred memories.
    expect(allText).not.toMatch(/\bNificant\b/);
    expect(allText).not.toMatch(/^[a-z]{1,5}\b/m);
    expect(allText).not.toMatch(/[A-Za-z]-[^\S\n]+[a-z]/);
    expect(allText).not.toMatch(/\btion and structured\b/i);
    expect(allText).not.toMatch(/Wei et al\.,\s*2023,\s*Zhang The/i);

    // Should retain the paper's actual substance.
    expect(question.summary.toLowerCase()).toMatch(
      /prompt|extract|llm|efficacy|whether|gap|argument|zeolite|f1|zero-shot/,
    );
    const findingCount = findings?.entries?.length ?? 0;
    const evidenceCount = evidence?.entries?.length ?? 0;
    const insightCount = insights?.entries?.length ?? 0;
    // Memorable surface: question + (findings or evidence) + insights.
    expect(findingCount + evidenceCount).toBeGreaterThan(0);
    if (findingCount > 0) {
      expect(findings!.entries.every((e) => e.title.split(/\s+/).length >= 6)).toBe(true);
    }
    expect(insightCount).toBeGreaterThan(0);
    expect(
      insights!.entries.some((e) => /bottleneck|localization|grounding|prompt|extract|llm|span|hallucin/i.test(e.text)),
    ).toBe(true);
  }, 60000);
});
