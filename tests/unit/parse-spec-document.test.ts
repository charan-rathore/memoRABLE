import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseText } from "@/import/text/parse-text";
import type {
  ActionsPayload,
  BlockKind,
  DecisionsPayload,
  MemoryDocument,
  SignalsPayload,
  SnapshotPayload,
  TimelinePayload,
} from "@/domain/memory/schema";

/**
 * A real engineering specification — headings like "Implementation Rules",
 * "Phase 3" and "Success Criteria" rather than board-brief vocabulary. This is
 * the document class that used to yield five empty memories.
 */
const SPEC = readFileSync(path.join(__dirname, "../fixtures/engineering-spec.md"), "utf8");

function payloadOf<T>(doc: MemoryDocument, kind: BlockKind): T {
  const block = doc.blocks.find((b) => b.kind === kind);
  if (!block) throw new Error(`missing block ${kind}`);
  return block.payload as T;
}

describe("parseText — engineering specification", () => {
  const result = parseText({ text: SPEC, label: "engineering-spec.md" });

  it("parses successfully into six blocks", () => {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.blocks).toHaveLength(6);
  });

  it("takes the title and summary from the document, not the filename", () => {
    if (!result.ok) throw new Error("parse failed");
    expect(result.value.title).toBe("Finsight v3 — Portfolio Implementation Specification");
    const snapshot = payloadOf<SnapshotPayload>(result.value, "snapshot");
    expect(snapshot.summary).toContain("financial advisor");
  });

  it("reads 'Implementation Rules' and 'Engineering Philosophy' as decisions", () => {
    if (!result.ok) throw new Error("parse failed");
    const decisions = payloadOf<DecisionsPayload>(result.value, "decisions");
    expect(decisions.entries.length).toBeGreaterThanOrEqual(5);
    const all = decisions.entries.map((e) => e.text).join(" | ");
    expect(all).toMatch(/unnecessary abstraction/i);
  });

  it("reads 'Success Criteria' as signals, keeping qualitative ones unvalued", () => {
    if (!result.ok) throw new Error("parse failed");
    const signals = payloadOf<SignalsPayload>(result.value, "signals");
    expect(signals.entries.length).toBeGreaterThanOrEqual(5);
    const labels = signals.entries.map((e) => e.label).join(" | ");
    expect(labels).toMatch(/Reliability Engineering|Explainable AI/i);
    // A criterion with no measurement carries no invented value.
    expect(signals.entries.some((e) => e.value === undefined)).toBe(true);
  });

  it("turns the Phase and Task headings into an ordered timeline", () => {
    if (!result.ok) throw new Error("parse failed");
    const timeline = payloadOf<TimelinePayload>(result.value, "timeline");
    expect(timeline.entries.length).toBeGreaterThanOrEqual(5);
    const dates = timeline.entries.map((e) => e.date);
    expect(dates).toContain("Phase 0");
    expect(dates.some((d) => d.startsWith("Task"))).toBe(true);
  });

  it("reads the numbered workflow as actions with no invented owners", () => {
    if (!result.ok) throw new Error("parse failed");
    const actions = payloadOf<ActionsPayload>(result.value, "actions");
    expect(actions.entries.length).toBeGreaterThanOrEqual(5);
    expect(actions.entries.every((e) => e.owner === undefined)).toBe(true);
  });

  it("leaves at most one memory empty and never invents to fill them", () => {
    if (!result.ok) throw new Error("parse failed");
    const counts = result.value.blocks.map((b) => ({
      kind: b.kind,
      n: (b.payload as { entries?: unknown[] }).entries?.length ?? 0,
    }));
    const populated = counts.filter((c) => c.kind === "snapshot" || c.n > 0);
    expect(populated.length).toBeGreaterThanOrEqual(5);
  });

  it("is deterministic across repeats", () => {
    const again = parseText({ text: SPEC, label: "engineering-spec.md" });
    if (!result.ok || !again.ok) throw new Error("parse failed");
    expect(again.value.contentHash).toBe(result.value.contentHash);
  });
});
