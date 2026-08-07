/**
 * PR1: understanding + graph as primary extraction; OCR product path wiring.
 */
import { describe, expect, it } from "vitest";
import { importSource } from "@/import/import-source";
import { understand, hybridSegment, buildDocumentGraph, blocksDecisionInference } from "@/understanding";
import type {
  ActionsPayload,
  BlockKind,
  DecisionsPayload,
  MemoryDocument,
  TimelinePayload,
} from "@/domain/memory/schema";

function payloadOf<T>(doc: MemoryDocument, kind: BlockKind): T {
  const block = doc.blocks.find((b) => b.kind === kind);
  if (!block) throw new Error(`missing ${kind}`);
  return block.payload as T;
}

const UNSTRUCTURED = `# Atlas Launch Notes

We decided to ship Phase 1 before the conference because waiting would burn the budget.
Revenue is up 12% but conversion dropped 3 points, which usually means pricing is wrong.
If the partner deal slips, we will miss Q3 and lose the pilot.
Legal might block the EU terms — that is a real risk.
Next Friday is the freeze. By August 15 we need the API ready.
Someone should draft the customer email and chase design for the hero image.
The key takeaway is that speed matters more than polish for this launch.
`;

describe("semantic primary — unstructured prose", () => {
  it("fills Timeline and Actions from meaning without memory headings", () => {
    const result = importSource({ raw: UNSTRUCTURED, label: "notes.md" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const doc = result.value;
    const timeline = payloadOf<TimelinePayload>(doc, "timeline");
    const actions = payloadOf<ActionsPayload>(doc, "actions");
    const decisions = payloadOf<DecisionsPayload>(doc, "decisions");

    expect(timeline.entries.length).toBeGreaterThanOrEqual(1);
    const timelineBlob = timeline.entries.map((e) => `${e.date} ${e.title}`).join(" ");
    expect(timelineBlob).toMatch(/friday|august|aug|15|freeze|api/i);

    expect(actions.entries.length).toBeGreaterThanOrEqual(1);
    const actionBlob = actions.entries.map((e) => e.task).join(" ");
    expect(actionBlob).toMatch(/draft|email|chase|hero|design/i);

    expect(decisions.entries.length).toBeGreaterThanOrEqual(1);
    expect(decisions.entries.some((e) => /ship phase 1|phase 1/i.test(e.text))).toBe(true);

    const understood = (doc.warnings ?? []).some(
      (w) => w.code === "text.understood" && /inferred \d+ memories from meaning/i.test(w.message),
    );
    expect(understood).toBe(true);
  });

  it("understand() itself produces timeline and action candidates", () => {
    const lines = UNSTRUCTURED.split("\n").map((text, i) => ({ text, lineNo: i + 1 }));
    const u = understand({
      title: "Atlas Launch Notes",
      sections: [{ headingText: null, lines }],
    });
    expect(u.timeline.length).toBeGreaterThanOrEqual(1);
    expect(u.actions.length).toBeGreaterThanOrEqual(1);
    expect(u.decisions.length + u.risks.length + u.signals.length).toBeGreaterThanOrEqual(1);
  });
});

describe("semantic primary — requirements project into Decisions", () => {
  it("must/shall requirements are not blocked from decision inference", () => {
    expect(blocksDecisionInference("Every PO edit must leave an audit trail")).toBe(false);
  });

  it("imports unheaded requirement bullets as decisions", () => {
    const text = `# Goals

- Every PO edit must leave an audit trail
- Amended quantities cannot silently reduce approved spend
`;
    const result = importSource({ raw: text, label: "goals.md" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const decisions = payloadOf<DecisionsPayload>(result.value, "decisions");
    const blob = decisions.entries.map((e) => e.text).join(" ");
    expect(blob).toMatch(/audit trail|approved spend|amended/i);
  });
});

describe("semantic primary — document graph assigns kinds", () => {
  it("builds graph nodes that classify requirements and risks", () => {
    const md = `# Spec

## Key Requirements
- Must record edit history

## Problem Statement
- Missing audit trail causes compliance risk
`;
    const seg = hybridSegment(md);
    const graph = buildDocumentGraph(seg.segments);
    const types = new Set(graph.nodes.map((n) => n.type));
    expect(types.has("decision") || types.has("requirement")).toBe(true);
    expect(types.has("risk") || types.has("section")).toBe(true);
  });
});

describe("product PDF path — OCR defaults on", () => {
  it("readPdfQuick no longer hardcodes skipOcr (module contract)", async () => {
    // Source-level contract: progressive-pdf must not force skipOcr: true.
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("src/import/docgraph/progressive-pdf.ts", "utf8"),
    );
    expect(src).not.toMatch(/skipOcr:\s*true/);
    expect(src).toMatch(/skipOcr:\s*options\.skipOcr\s*===\s*true/);
  });
});
