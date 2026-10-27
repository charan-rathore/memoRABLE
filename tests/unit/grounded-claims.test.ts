/**
 * Grounded-claims guards: a snapshot must never invent a goal or problem the
 * document does not have.
 *
 * The claim layer names a "primary goal" from the first committed decision and
 * a "primary problem" from the top risk. On personal documents that goes wrong
 * two ways: a precaution or travel checklist item is read as a settled
 * decision and presented as the document's goal ("Primary goal: Enable do not
 * eat for 2 hours before the procedure"), and a coverage clause, conditional
 * precaution, rating line, or aphorism is read as the document's problem.
 * These guards keep every claim traceable to an assertion the author made.
 */
import { describe, expect, it } from "vitest";
import { readRisk } from "@/understanding/inference";
import { importSource } from "@/import/import-source";

function snapshotOf(raw: string, label: string) {
  const r = importSource({ raw, label });
  if (!r.ok) throw new Error("import failed");
  return r.value.blocks.find((b) => b.kind === "snapshot")!.payload as {
    summary?: string;
    hook?: string;
    goal?: string;
    problem?: string;
    outcome?: string;
  };
}

describe("readRisk keeps base behavior on every probed shape", () => {
  // The risk register is the base layer and stays untouched: these shapes
  // remain register entries exactly as on the pre-patch base. Only the
  // snapshot's primary-problem claim withholds them.
  it("keeps scope, advice, rating, and aphorism entries in the register", () => {
    expect(readRisk("Accidental damage and liquid spills are excluded from coverage")).not.toBeNull();
    expect(
      readRisk("The deposit may be withheld for unpaid rent or damage beyond normal wear"),
    ).not.toBeNull();
    expect(readRisk("If knees hurt below parallel, switch to box squats")).not.toBeNull();
    expect(
      readRisk("SQL and data modeling: 4/5 — fluent window functions, one slip on NULL handling"),
    ).not.toBeNull();
    expect(
      readRisk(
        "Parameters are the weakest leverage point; the power to add and change paradigms is the strongest",
      ),
    ).not.toBeNull();
  });

  it("still reads asserted trouble, with or without a consequence", () => {
    expect(
      readRisk("Two suppliers missed delivery windows twice, causing stockouts in 14 stores"),
    ).not.toBeNull();
    expect(readRisk("Blocked nose and sinus pressure since one week")).not.toBeNull();
    expect(readRisk("Missed appointments without notice carry a Rs 500 fee")).not.toBeNull();
  });

  it("still reads a conditional that asserts a consequence, not advice", () => {
    expect(
      readRisk("If return rates keep climbing, margin guidance for Q4 is at risk"),
    ).not.toBeNull();
  });
});

describe("snapshot goal claims stay grounded and grammatical", () => {
  it("reads no goal from an appointment precaution", () => {
    const snap = snapshotOf(
      [
        "# Dental Appointment Reminder",
        "",
        "Bright Smile Dental Clinic, 45 MG Road",
        "",
        "## Your Appointment",
        "Patient: Alex Example",
        "Date: Saturday, 24 October 2026",
        "Time: 10:30 AM",
        "",
        "## Before You Come",
        "- Do not eat for 2 hours before the procedure.",
        "- Bring your previous X-ray reports.",
        "- Arrive 15 minutes early to complete paperwork.",
      ].join("\n"),
      "dental-reminder.md",
    );
    expect(snap.goal ?? "").toBe("");
    expect(snap.hook ?? "").not.toMatch(/Primary goal/i);
  });

  it("reads no goal from a travel checklist item", () => {
    const snap = snapshotOf(
      [
        "# Jaipur Weekend — December 18-20",
        "",
        "## Flights",
        "- Depart Bengaluru 06:15 on December 18, arrive Jaipur 08:40",
        "",
        "## Stay",
        "- Check in at Hotel Example House on December 18 after 14:00",
        "- Check out by 11:00 on December 20",
        "",
        "## Plan",
        "- December 18: Amber Fort in the morning, bazaar walk in the evening",
      ].join("\n"),
      "trip-itinerary.md",
    );
    expect(snap.goal ?? "").toBe("");
    expect(snap.hook ?? "").not.toMatch(/Primary goal/i);
  });

  it("renders a first-person decision as the settled action, not 'Enable we decided'", () => {
    const snap = snapshotOf(
      [
        "# Product Sync — October 14, 2026",
        "",
        "Attendees: Aarti, Rohan, Meera",
        "",
        "## Decisions",
        "- We decided to ship the onboarding revamp behind a flag",
        "- We will not change the pricing page this quarter",
        "",
        "## Action items",
        "- [ ] Rohan to draft the flag rollout plan by Friday",
      ].join("\n"),
      "product-sync.md",
    );
    expect(snap.goal).toBe("Ship the onboarding revamp behind a flag");
    expect(snap.hook).toBe("Primary goal: Ship the onboarding revamp behind a flag.");
  });

  it("does not invent a goal from proposal instructions", () => {
    // The RFC states a problem and proposes fixes; neither bullet is a goal
    // the author stated. The problem claim still frames the document.
    const snap = snapshotOf(
      [
        "# RFC: Cache Invalidation for Product Catalog",
        "",
        "## Problem",
        "Stale catalog entries served for up to 6 hours after a price change, leading to 41 pricing disputes in August.",
        "",
        "## Proposal",
        "- Invalidate product entries on every price write",
        "- Keep list pages at a 60-second TTL",
      ].join("\n"),
      "rfc-cache.md",
    );
    expect(snap.goal ?? "").toBe("");
    expect(snap.problem).toMatch(/^Stale catalog entries/);
  });

  it("keeps a well-formed enablement claim intact", () => {
    const snap = snapshotOf(
      [
        "# Search Service Spec",
        "",
        "The search service stores saved queries for every workspace.",
        "",
        "## Decisions",
        "- We will enable audit history for every saved search",
        "- We will not backfill queries from before April",
      ].join("\n"),
      "search-spec.md",
    );
    expect(snap.goal).toBe("Enable audit history for every saved search");
  });
});

describe("snapshot problem claims stay grounded", () => {
  it("claims a conjoined exclusion it cannot prove is pure policy", () => {
    // Oct 27 boundary doctrine: a conjoined subject ("damage and spills") is
    // structurally identical to a conjoined incident clause ("Two users were
    // harmed and late returns are subject to a charge"), which MUST be claimed.
    // The whole-line policy veto cannot safely cover "and"-joined subjects,
    // so this returns to the public ed4c60c baseline claim (verified against
    // public output).
    const snap = snapshotOf(
      [
        "# Extended Warranty Card",
        "",
        "Product: ExampleNoise Headphones, serial EX-2211.",
        "",
        "## Coverage",
        "- Two-year coverage for manufacturing defects.",
        "- Accidental damage and liquid spills are excluded.",
      ].join("\n"),
      "warranty-card.md",
    );
    expect(snap.problem ?? "").toBe("Accidental damage and liquid spills are excluded");
  });

  it("claims a scored interview rating, as the public baseline does", () => {
    // Public-baseline parity: the score-footnote veto was part of the
    // withdrawn suppression family (no regex guard can certify the rest of
    // the line harmless), so the scored line claims exactly as on ed4c60c.
    const snap = snapshotOf(
      [
        "# Interview Feedback — Data Analyst Loop",
        "",
        "Candidate: Alex Example. Panel: Priya, Sana.",
        "",
        "## Scores",
        "- SQL and data modeling: 4/5 — fluent window functions, one slip on NULL handling",
        "- Communication: 5/5 — crisp, structured answers",
      ].join("\n"),
      "interview-feedback.md",
    );
    expect(snap.problem ?? "").toBe(
      "SQL and data modeling: 4/5 — fluent window functions, one slip on NULL handling",
    );
  });

  it("keeps a grounded problem with a stated consequence", () => {
    const snap = snapshotOf(
      [
        "# RFC: Cache Invalidation for Product Catalog",
        "",
        "## Problem",
        "Stale catalog entries served for up to 6 hours after a price change, leading to 41 pricing disputes in August.",
        "",
        "## Proposal",
        "- Invalidate product entries on every price write",
        "- Keep list pages at a 60-second TTL",
      ].join("\n"),
      "rfc-cache.md",
    );
    expect(snap.problem).toBe(
      "Stale catalog entries served for up to 6 hours after a price change, causing 41 pricing disputes in August",
    );
  });

  it("keeps a presenting complaint as the problem of a clinical note", () => {
    const snap = snapshotOf(
      [
        "# OPD Consultation Note",
        "",
        "Dr. Anjali Rao, ENT. Patient: Alex Example, 29M.",
        "",
        "Blocked nose and sinus pressure since one week.",
        "Continue the nasal spray for 2 weeks.",
      ].join("\n"),
      "opd-note.md",
    );
    expect(snap.problem).toBe("Blocked nose and sinus pressure");
  });
});

describe("guards never hide asserted trouble (publisher probe set)", () => {
  it("reads a failure whose condition mentions exclusion", () => {
    expect(
      readRisk("The service fails when expired users are excluded from the access list"),
    ).not.toBeNull();
  });

  it("preserves base behavior on a test-coverage phrasing", () => {
    // Already null on the pre-patch base; this patch neither fixes nor
    // regresses it. Whether such gaps should read as risks is separate scope.
    expect(readRisk("Errors are not covered by the current tests")).toBeNull();
  });

  it("reads a contingency instruction exactly as the base does", () => {
    expect(readRisk("If the service fails, call the incident team")).not.toBeNull();
  });

  it("reads a failing score backed by asserted outages", () => {
    expect(
      readRisk("Availability scored 1/5 because repeated outages blocked customer checkouts"),
    ).not.toBeNull();
  });

  it("reads a superlative that reports a caused event", () => {
    expect(
      readRisk("The weakest node caused the largest outage in the cluster"),
    ).not.toBeNull();
  });
});

describe("problem claims survive structured evidence of asserted trouble", () => {
  it("claims a failing score whose because-clause carries real outages", () => {
    const snap = snapshotOf(
      [
        "# Statuspage Review",
        "",
        "Weekly reliability readout for the checkout service.",
        "",
        "## Risks",
        "- Availability scored 1/5 because repeated outages blocked customer checkouts",
      ].join("\n"),
      "statuspage-review.md",
    );
    expect(snap.problem).toBe("Availability scored 1/5");
  });

  it("claims an exclusion that carries a stated cost, in problem and hook alike", () => {
    const snap = snapshotOf(
      [
        "# Warranty Review",
        "",
        "Quarterly look at the extended warranty book.",
        "",
        "## Risks",
        "- Accidental damage is excluded, leading to uncovered repair costs",
      ].join("\n"),
      "warranty-review.md",
    );
    expect(snap.problem).toBe("Accidental damage is excluded, causing Uncovered repair costs");
    expect(snap.hook).toBe("Primary problem: accidental damage is excluded.");
  });

  it("claims a conditional that asserts a consequence, not advice", () => {
    const snap = snapshotOf(
      [
        "# Growth Review",
        "",
        "Monthly look at acquisition and retention.",
        "",
        "## Risks",
        "- If return rates keep climbing, margin guidance for Q4 is at risk",
      ].join("\n"),
      "growth-review.md",
    );
    expect(snap.problem).toBe("If return rates keep climbing, margin guidance for Q4 is at risk");
  });
});
