import { describe, expect, it } from "vitest";
import {
  allowSlideDecision,
  blocksDecisionInference,
  obligationDateConfidence,
  projectSingleLegTimeline,
  shouldProjectInvoiceDueToTimeline,
  strongestCategory,
} from "@/understanding/projection";
import type { TimelineEntry } from "@/domain/memory/schema";

describe("projection rule 1 — single_leg Departure/Arrival ALWAYS Timeline", () => {
  it("orders Departure then Arrival and drops everything else", () => {
    const entries: TimelineEntry[] = [
      { date: "note", title: "Booking reference H7K9LM", state: "planned" },
      { date: "2026-08-12 10:55", title: "Arrival: Stockholm (ARN)", state: "planned" },
      { date: "2026-08-12 09:40", title: "Departure: Copenhagen (CPH)", state: "planned" },
      { date: "extra", title: "Seat 14A", state: "planned" },
    ];
    const projected = projectSingleLegTimeline(entries);
    expect(projected).toHaveLength(2);
    expect(projected[0]!.title).toMatch(/Departure/i);
    expect(projected[1]!.title).toMatch(/Arrival/i);
  });
});

describe("projection rule 2 — Invoice Due Date confidence gate", () => {
  it("projects ISO due dates and rejects vague ones", () => {
    expect(shouldProjectInvoiceDueToTimeline("Due date: 2026-08-14")).toBe(true);
    expect(obligationDateConfidence("Due date: 2026-08-14")).toBe("high");
    expect(shouldProjectInvoiceDueToTimeline("Due date: soon")).toBe(false);
    expect(obligationDateConfidence("Due date: soon")).toBe("none");
  });
});

describe("projection rule 3 — Risk/Action/Phase block Decisions; Requirements project in", () => {
  it("blocks risk, action, and phase delivery structure", () => {
    expect(strongestCategory("Phase 1: Capture edit history schema — planned")).toBe("requirement");
    expect(blocksDecisionInference("Phase 1: Capture edit history schema — planned")).toBe(true);

    expect(strongestCategory("Missing audit trail (high) - mitigation: ship Phase 1")).toBe("risk");
    expect(blocksDecisionInference("Missing audit trail (high) - mitigation: ship Phase 1")).toBe(true);

    expect(strongestCategory("Spec the revision number format - Platform - Aug 1")).toBe("action");
    expect(blocksDecisionInference("Spec the revision number format - Platform - Aug 1")).toBe(true);

    // A settled decision line is not blocked by precedence.
    expect(blocksDecisionInference("D-001 Expand pricing tier - approved")).toBe(false);
  });

  it("lets pure requirements project into Decisions (must/shall/required)", () => {
    expect(strongestCategory("Every PO edit must leave an audit trail")).toBe("requirement");
    expect(blocksDecisionInference("Every PO edit must leave an audit trail")).toBe(false);
    expect(blocksDecisionInference("Audit trail is mandatory on every change")).toBe(false);
  });
});

describe("projection rule 4 — Slides Problem ≠ Decision", () => {
  it("requires explicit commitment verbs; rejects problem statements", () => {
    expect(
      allowSlideDecision("Mid-market buyers cannot audit PO edits after approval", "Slide 1 — Problem"),
    ).toBe(false);
    expect(
      allowSlideDecision("We decided to ship immutable revision events", "Slide 2 — System"),
    ).toBe(true);
  });
});
