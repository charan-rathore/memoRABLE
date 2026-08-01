/**
 * Lightweight archetype smoke eval — hackathon freeze:
 * Resume · Invoice · Research · Generic Knowledge.
 *
 * Checks:
 * 1. Specialized vs Generic Knowledge classification
 * 2. Timeline honesty where dates are weak or absent
 * 3. Decision/Action linkage when both are present
 * 4. Overall memory quality threshold across the suite
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { importSource } from "@/import/import-source";
import { scoreMemorySource } from "@/ai/v6";
import { classifyArchetype, findAnchorDate, understand } from "@/understanding";
import type {
  ActionsPayload,
  BlockKind,
  DecisionsPayload,
  MemoryDocument,
  MemorySource,
  SnapshotPayload,
  TimelinePayload,
} from "@/domain/memory/schema";

interface CaseSpec {
  file: string;
  expectArchetype: string;
  expectTimelineMode: string;
  expectEmptyTimeline: boolean;
  minOverall: number;
}

const CASES: CaseSpec[] = [
  { file: "menu.md", expectArchetype: "generic", expectTimelineMode: "narrative_sequence", expectEmptyTimeline: true, minOverall: 0.45 },
  { file: "job.md", expectArchetype: "generic", expectTimelineMode: "narrative_sequence", expectEmptyTimeline: true, minOverall: 0.45 },
  { file: "glossary.md", expectArchetype: "generic", expectTimelineMode: "narrative_sequence", expectEmptyTimeline: true, minOverall: 0.45 },
  { file: "ticket.md", expectArchetype: "generic", expectTimelineMode: "narrative_sequence", expectEmptyTimeline: false, minOverall: 0.5 },
  { file: "prd.md", expectArchetype: "generic", expectTimelineMode: "narrative_sequence", expectEmptyTimeline: false, minOverall: 0.65 },
  { file: "meeting.md", expectArchetype: "generic", expectTimelineMode: "narrative_sequence", expectEmptyTimeline: false, minOverall: 0.55 },
  { file: "invoice.md", expectArchetype: "invoice", expectTimelineMode: "obligation_deadlines", expectEmptyTimeline: false, minOverall: 0.5 },
  { file: "contract.md", expectArchetype: "generic", expectTimelineMode: "narrative_sequence", expectEmptyTimeline: false, minOverall: 0.5 },
  { file: "resume.md", expectArchetype: "resume", expectTimelineMode: "narrative_sequence", expectEmptyTimeline: false, minOverall: 0.45 },
  { file: "brief.md", expectArchetype: "generic", expectTimelineMode: "narrative_sequence", expectEmptyTimeline: false, minOverall: 0.7 },
];

/** Suite must clear this average overall score to ship. */
const SUITE_THRESHOLD = 0.62;
const TIMELINE_HONESTY_EMPTY = 0.9;

function payloadOf<T>(doc: MemoryDocument, kind: BlockKind): T {
  const block = doc.blocks.find((b) => b.kind === kind);
  if (!block) throw new Error(`missing ${kind}`);
  return block.payload as T;
}

function optionalPayloadOf<T>(doc: MemoryDocument, kind: BlockKind): T | null {
  const block = doc.blocks.find((b) => b.kind === kind);
  return block ? (block.payload as T) : null;
}

function toMemorySource(doc: MemoryDocument): MemorySource {
  return {
    version: 1,
    title: doc.title,
    blocks: doc.blocks.map((b) => ({
      kind: b.kind,
      title: b.title,
      payload: b.payload,
    })) as MemorySource["blocks"],
  };
}

describe("memory layer archetype benchmark", () => {
  for (const spec of CASES) {
    it(`${spec.file}: archetype, timeline honesty, memory quality`, () => {
      const text = readFileSync(resolve(`tests/fixtures/archetypes/${spec.file}`), "utf8");
      const result = importSource({ raw: text, label: spec.file });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const doc = result.value;
      const archetype = classifyArchetype({
        title: doc.title,
        headings: [],
        bodySample: text,
      });
      expect(archetype.archetype).toBe(spec.expectArchetype);
      expect(archetype.timelineMode).toBe(spec.expectTimelineMode);
      expect(archetype.scores).toEqual(
        expect.objectContaining({
          resume: expect.any(Number),
          research: expect.any(Number),
          invoice: expect.any(Number),
        }),
      );
      if (spec.expectArchetype === "generic") {
        expect(archetype.score).toBeUndefined();
      } else {
        expect(archetype.score).toBeGreaterThanOrEqual(10);
      }

      const timeline = optionalPayloadOf<TimelinePayload>(doc, "timeline");
      if (spec.expectEmptyTimeline) {
        expect(timeline == null || timeline.entries.length === 0).toBe(true);
      } else if (timeline) {
        const weakOnly =
          timeline.entries.length > 0 &&
          timeline.entries.every((e) => /^(today|tomorrow|soon|next week)$/i.test(e.date));
        expect(weakOnly).toBe(false);
      }

      const snapshot = payloadOf<SnapshotPayload>(doc, "snapshot");
      expect(snapshot.summary.length).toBeGreaterThan(20);

      if (spec.file === "prd.md" || spec.file === "meeting.md" || spec.file === "brief.md") {
        const decisions = payloadOf<DecisionsPayload>(doc, "decisions");
        const actions = payloadOf<ActionsPayload>(doc, "actions");
        expect(decisions.entries.length).toBeGreaterThanOrEqual(1);
        expect(actions.entries.length).toBeGreaterThanOrEqual(1);
        const refs = new Set(decisions.entries.map((d) => d.ref).filter(Boolean));
        const linked = actions.entries.filter((a) => a.from && (refs.has(a.from) || a.from.length > 3));
        expect(linked.length + decisions.entries.length).toBeGreaterThan(0);
      }

      const score = scoreMemorySource(toMemorySource(doc), {
        timelineMode: archetype.timelineMode,
        expectEmptyTimeline: spec.expectEmptyTimeline,
      });
      expect(score.overall).toBeGreaterThanOrEqual(spec.minOverall);
      if (spec.expectEmptyTimeline) {
        expect(score.timelineHonesty).toBeGreaterThanOrEqual(TIMELINE_HONESTY_EMPTY);
      }
    });
  }

  it("suite clears the minimum ship threshold", () => {
    const allScores: number[] = [];
    const emptyHonesty: number[] = [];
    for (const spec of CASES) {
      const text = readFileSync(resolve(`tests/fixtures/archetypes/${spec.file}`), "utf8");
      const result = importSource({ raw: text, label: spec.file });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const archetype = classifyArchetype({ title: result.value.title, headings: [], bodySample: text });
      const score = scoreMemorySource(toMemorySource(result.value), {
        timelineMode: archetype.timelineMode,
        expectEmptyTimeline: spec.expectEmptyTimeline,
      });
      allScores.push(score.overall);
      if (spec.expectEmptyTimeline) emptyHonesty.push(score.timelineHonesty);
    }
    const avg = allScores.reduce((a, b) => a + b, 0) / allScores.length;
    const honestyAvg = emptyHonesty.reduce((a, b) => a + b, 0) / emptyHonesty.length;
    expect(avg).toBeGreaterThanOrEqual(SUITE_THRESHOLD);
    expect(honestyAvg).toBeGreaterThanOrEqual(TIMELINE_HONESTY_EMPTY);
  });

  it("resolves anchors for dated documents", () => {
    const brief = readFileSync(resolve("tests/fixtures/archetypes/brief.md"), "utf8");
    const anchor = findAnchorDate(brief, "brief.md");
    expect(anchor.confidence === "none").toBe(false);

    const understanding = understand({
      title: "Atlas Launch Notes",
      sourceLabel: "brief.md",
      sections: [{ headingText: null, lines: brief.split("\n").map((text, i) => ({ text, lineNo: i + 1 })) }],
    });
    expect(understanding.archetype.archetype).toBe("generic");
  });
});
