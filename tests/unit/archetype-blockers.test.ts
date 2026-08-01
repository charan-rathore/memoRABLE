/**
 * Regression: the four blockers from the manual archetype audit.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { importSource } from "@/import/import-source";
import type {
  ActionsPayload,
  BlockKind,
  DecisionsPayload,
  MemoryDocument,
  RisksPayload,
  SignalsPayload,
  TimelinePayload,
} from "@/domain/memory/schema";

function load(file: string) {
  const text = readFileSync(resolve(`tests/fixtures/archetypes/${file}`), "utf8");
  const result = importSource({ raw: text, label: file });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`import failed: ${file}`);
  return result.value;
}

function payloadOf<T>(doc: MemoryDocument, kind: BlockKind): T {
  const block = doc.blocks.find((b) => b.kind === kind);
  if (!block) throw new Error(`missing ${kind}`);
  return block.payload as T;
}

describe("archetype blockers — Ticket single_leg Timeline", () => {
  it("puts departure and arrival on Timeline, not only Snapshot notes", () => {
    const doc = load("ticket.md");
    const timeline = payloadOf<TimelinePayload>(doc, "timeline");
    expect(timeline.entries.length).toBe(2);
    const blob = timeline.entries.map((e) => `${e.date} ${e.title}`).join("\n").toLowerCase();
    expect(blob).toMatch(/depart/);
    expect(blob).toMatch(/arriv/);
    expect(blob).toMatch(/2026-08-12/);
    // No invented carrier beyond source — seat/gate may appear in titles.
    expect(blob).toMatch(/copenhagen|cph/);
    expect(blob).toMatch(/stockholm|arn/);
  });
});

describe("archetype blockers — Invoice obligation Timeline", () => {
  it("projects due date (and invoice date) into Timeline", () => {
    const doc = load("invoice.md");
    const timeline = payloadOf<TimelinePayload>(doc, "timeline");
    const dates = timeline.entries.map((e) => e.date).join(" ");
    expect(dates).toMatch(/2026-08-14/);
    // Invoice dated line should also surface when present.
    expect(dates).toMatch(/2026-07-15/);

    const signals = payloadOf<SignalsPayload>(doc, "signals");
    // Due date must not remain only as a signal after harvest.
    expect(signals.entries.some((e) => /^due(?:\s+date)?$/i.test(e.label))).toBe(false);
  });
});

describe("archetype blockers — PRD Timeline + Decision pollution", () => {
  it("structures Phase lines on Timeline and keeps Decisions clean", () => {
    const doc = load("prd.md");
    const timeline = payloadOf<TimelinePayload>(doc, "timeline");
    expect(timeline.entries.length).toBeGreaterThanOrEqual(3);
    const phaseDates = timeline.entries.map((e) => e.date).join(" ");
    expect(phaseDates).toMatch(/Phase 1/i);
    expect(phaseDates).toMatch(/Phase 2/i);
    expect(phaseDates).toMatch(/Phase 3/i);

    const decisions = payloadOf<DecisionsPayload>(doc, "decisions");
    const decisionText = decisions.entries.map((e) => e.text).join("\n");
    expect(decisionText).toMatch(/D-001|edit history is mandatory/i);
    expect(decisionText).toMatch(/D-002|quantity reductions|finance re-approval/i);
    // Pollution: Phase / mitigation / action lines must not be Decisions.
    expect(decisionText).not.toMatch(/^Phase \d/m);
    expect(decisionText).not.toMatch(/mitigation:/i);
    expect(decisionText).not.toMatch(/Spec the revision number format/i);

    const risks = payloadOf<RisksPayload>(doc, "risks");
    expect(risks.entries.some((e) => /Phase 2/i.test(e.risk))).toBe(false);

    const actions = payloadOf<ActionsPayload>(doc, "actions");
    expect(actions.entries.length).toBeGreaterThanOrEqual(2);
  });
});

describe("archetype blockers — Slides problem ≠ Decision", () => {
  it("does not invent a Decision from a problem statement", () => {
    const doc = load("slides.md");
    const decisions = payloadOf<DecisionsPayload>(doc, "decisions");
    expect(decisions.entries.length).toBe(0);

    const timeline = payloadOf<TimelinePayload>(doc, "timeline");
    expect(timeline.entries.length).toBe(0);

    // Problem / open question should land as Risks notes or entries, not Decisions.
    const risks = payloadOf<RisksPayload>(doc, "risks");
    const riskBlob = [
      ...risks.entries.map((e) => e.risk),
      ...(risks.notes ?? []),
    ]
      .join("\n")
      .toLowerCase();
    expect(riskBlob).toMatch(/audit|retention|24 months|mid-market/);
  });
});
