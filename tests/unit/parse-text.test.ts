import { describe, expect, it } from "vitest";
import { parseText } from "@/import/text/parse-text";
import { importSource } from "@/import/import-source";
import { ATLAS_NOTES_SOURCE } from "@/import/examples/catalog";
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

describe("parseText — Atlas launch notes", () => {
  const result = parseText({ text: ATLAS_NOTES_SOURCE, label: "atlas-launch-notes.md" });

  it("always produces exactly six blocks", () => {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.blocks.map((b) => b.kind)).toEqual([
      "snapshot",
      "signals",
      "decisions",
      "timeline",
      "risks",
      "actions",
    ]);
  });

  it("recognizes the snapshot from the first paragraph without inventing", () => {
    if (!result.ok) throw new Error("parse failed");
    const snapshot = payloadOf<SnapshotPayload>(result.value, "snapshot");
    expect(snapshot.heading).toBe("Atlas Launch Notes");
    expect(snapshot.summary).toContain("$4.2M ARR");
    expect(snapshot.byline).toBe("Prepared by A. Rathore · Reviewed by Finance · July 2026");
  });

  it("maps all six local patterns correctly", () => {
    if (!result.ok) throw new Error("parse failed");
    const signals = payloadOf<SignalsPayload>(result.value, "signals");
    expect(signals.entries).toHaveLength(4);
    expect(signals.entries[0]).toEqual({ label: "ARR", value: "$4.2M", delta: "+18%", trend: "up" });

    const timeline = payloadOf<TimelinePayload>(result.value, "timeline");
    expect(timeline.entries).toHaveLength(4);
    expect(timeline.entries[0]).toEqual({
      date: "Jul",
      title: "Fleet Analytics general availability",
      state: "shipped",
    });
    expect(timeline.entries[2]!.state).toBe("on-track");

    const risks = payloadOf<RisksPayload>(result.value, "risks");
    expect(risks.entries).toHaveLength(3);
    expect(risks.entries[0]).toEqual({
      risk: "Supply-chain lead times on actuators",
      severity: "high",
      mitigation: "dual-sourcing complete by Oct",
    });

    const decisions = payloadOf<DecisionsPayload>(result.value, "decisions");
    expect(decisions.entries).toHaveLength(3);
    expect(decisions.entries[0]).toEqual({
      ref: "D-021",
      text: "Expand the fleet-analytics pricing tier ahead of the EU launch",
      status: "approved",
    });
    expect(decisions.entries[2]!.status).toBe("requested");
    // The D-023 title keeps its em-dash detail (no truncation).
    expect(decisions.entries[2]!.text).toContain("six roles");

    const actions = payloadOf<ActionsPayload>(result.value, "actions");
    expect(actions.entries).toHaveLength(3);
    expect(actions.entries[0]).toEqual({
      task: "Sign the dual-sourcing contract",
      owner: "M. Chen",
      due: "Aug 15",
      status: "open",
    });
  });

  it("attaches per-block provenance with line ranges", () => {
    if (!result.ok) throw new Error("parse failed");
    for (const block of result.value.blocks) {
      expect(block.provenance.method).toBe("local-parser");
      expect(block.provenance.label).toBe("atlas-launch-notes.md");
      expect(block.provenance.locator.length).toBeGreaterThan(0);
      expect(block.provenance.excerpt.length).toBeLessThanOrEqual(240);
    }
    const risks = result.value.blocks.find((b) => b.kind === "risks")!;
    expect(risks.provenance.locator).toContain("heading");
    expect(risks.provenance.locator).toMatch(/lines \d+–\d+/);
  });

  it("is deterministic across repeats", () => {
    const again = parseText({ text: ATLAS_NOTES_SOURCE, label: "atlas-launch-notes.md" });
    if (!result.ok || !again.ok) throw new Error("parse failed");
    expect(again.value.contentHash).toBe(result.value.contentHash);
    expect(again.value.blocks.map((b) => b.id)).toEqual(result.value.blocks.map((b) => b.id));
  });
});

describe("parseText — lossless recovery", () => {
  it("preserves unclear text as notes with an honest warning", () => {
    const text = [
      "# Random notes",
      "",
      "Some opening thought that is a paragraph.",
      "",
      "## Signals",
      "",
      "- ARR: $4.2M (+18%)",
      "- this line is not a metric at all",
      "",
      "## Actions",
      "",
      "nothing parseable here either",
    ].join("\n");
    const result = parseText({ text, label: "notes.md" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const signals = payloadOf<SignalsPayload>(result.value, "signals");
    expect(signals.entries).toHaveLength(1);
    expect(signals.notes).toContain("this line is not a metric at all");
    const actions = payloadOf<ActionsPayload>(result.value, "actions");
    expect(actions.entries).toHaveLength(0);
    expect(actions.notes).toContain("nothing parseable here either");
    // Warnings are honest and specific.
    const messages = result.value.warnings.map((w) => w.message).join("\n");
    expect(messages).toContain("kept as-is");
    // Blocks with only notes are labeled as recovered.
    const actionsBlock = result.value.blocks.find((b) => b.kind === "actions")!;
    expect(actionsBlock.provenance.method).toBe("recovered");
  });

  it("never invents owners, dates, metrics, severities or risks", () => {
    const text = [
      "## Risks",
      "",
      "- something might go wrong but no severity or mitigation is given",
      "",
      "## Actions",
      "",
      "- call the client sometime",
    ].join("\n");
    const result = parseText({ text, label: "notes.md" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const risks = payloadOf<RisksPayload>(result.value, "risks");
    expect(risks.entries).toHaveLength(0);
    expect(risks.notes?.join(" ")).toContain("something might go wrong");
    const actions = payloadOf<ActionsPayload>(result.value, "actions");
    expect(actions.entries).toHaveLength(0);
    expect(actions.notes?.join(" ")).toContain("call the client sometime");
  });

  it("warns when a section is entirely missing and keeps the block empty", () => {
    const result = parseText({ text: "Just one paragraph with no structure.", label: "Pasted notes" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.blocks).toHaveLength(6);
    const risks = payloadOf<RisksPayload>(result.value, "risks");
    expect(risks.entries).toHaveLength(0);
    const messages = result.value.warnings.map((w) => w.message).join("\n");
    expect(messages).toContain("No risks were recognized");
    // The paragraph still became the snapshot — nothing disappeared.
    const snapshot = payloadOf<SnapshotPayload>(result.value, "snapshot");
    expect(snapshot.summary).toContain("Just one paragraph");
  });

  it("keeps unrecognized headings as preserved content", () => {
    const text = ["# Doc", "", "## Appendix Q", "", "some appendix text"].join("\n");
    const result = parseText({ text, label: "doc.md" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const all = JSON.stringify(result.value.blocks.map((b) => b.payload));
    expect(all).toContain("Appendix Q");
    expect(all).toContain("some appendix text");
  });

  it("parses markdown tables for signals and risks", () => {
    const text = [
      "## Signals",
      "",
      "| Metric | Value | Change |",
      "| --- | --- | --- |",
      "| ARR | $4.2M | +18% |",
      "",
      "## Risks",
      "",
      "| Risk | Severity | Mitigation |",
      "| --- | --- | --- |",
      "| Lead times | High | Dual-sourcing |",
    ].join("\n");
    const result = parseText({ text, label: "t.md" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const signals = payloadOf<SignalsPayload>(result.value, "signals");
    expect(signals.entries[0]).toMatchObject({ label: "ARR", value: "$4.2M", delta: "+18%" });
    const risks = payloadOf<RisksPayload>(result.value, "risks");
    expect(risks.entries[0]).toEqual({ risk: "Lead times", severity: "high", mitigation: "Dual-sourcing" });
  });
});

describe("importSource routing", () => {
  it("routes JSON to the strict path and text to the local parser", () => {
    const json = importSource({ raw: ATLAS_NOTES_SOURCE.startsWith("{") ? "" : "{}", label: "x" });
    expect(json.ok).toBe(false); // "{}" is invalid strict JSON
    const text = importSource({ raw: ATLAS_NOTES_SOURCE, label: "atlas-launch-notes.md" });
    expect(text.ok).toBe(true);
    if (text.ok) expect(text.value.sourceMethod).toBe("local-parser");
  });
});
