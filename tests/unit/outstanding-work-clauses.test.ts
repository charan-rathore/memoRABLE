/**
 * Outstanding-work clauses quote an action whole or not at all.
 *
 * Truncating "Add 2.5 kg to squat every session if all reps pass" to
 * "…every session" turns conditional advice into an unconditional
 * instruction; truncating "Call us at least 24 hours before your slot…"
 * to "…24 hours" drops what the deadline is for; truncating "Never retry
 * the payment until the previous attempt is reconciled" to "Never retry
 * the payment" hides the exit condition. The reader cannot see any of
 * these losses, so the clause keeps the whole action, condition and time
 * anchor included, or omits it from the named list while keeping the count.
 */
import { describe, expect, it } from "vitest";
import { composeRecall } from "@/understanding/recall";
import type { Intent } from "@/understanding/intent";

const INTENT: Intent = {
  kind: "notes",
  verb: "records",
  subject: "",
  instructional: false,
  measured: false,
  sequenced: false,
};

function summaryFor(tasks: string[]): string {
  return composeRecall({
    intent: INTENT,
    concepts: [],
    signals: [],
    decisions: [],
    timeline: [],
    actions: tasks.map((task) => ({ task, status: "pending" as const })),
    // A grounded problem frames the document; outstanding-work clauses only
    // compose on framed documents.
    risks: [{ risk: "Vendor lead times slipped", severity: "medium" as const }],
    fallback: "Field notes from the week.",
  }).summary;
}

describe("outstanding work keeps conditions and time anchors", () => {
  it("keeps a conditional progression rule conditional", () => {
    const s = summaryFor(["Add 2.5 kg to squat every session if all reps pass"]);
    expect(s).toContain("if all reps pass");
    expect(s).not.toMatch(/every session\./);
  });

  it("keeps what a deadline is for", () => {
    const s = summaryFor(["Call us at least 24 hours before your slot if you need to move it"]);
    expect(s).toContain("before your slot");
    expect(s).toContain("if you need to move it");
  });

  it("keeps a negation's exit condition", () => {
    const s = summaryFor(["Never retry the payment until the previous attempt is reconciled"]);
    expect(s).toContain("until the previous attempt is reconciled");
    expect(s).not.toMatch(/Never retry the payment\./);
  });

  it("keeps an only-after gate", () => {
    const s = summaryFor(["Delete the backup only after recovery has been verified"]);
    expect(s).toContain("only after recovery has been verified");
  });

  it("omits an over-long action from the named list but keeps the count", () => {
    const long =
      "Coordinate with the payment gateway vendor and reconcile the settlement report if the finance team confirms the discrepancy by Thursday";
    const s = summaryFor([long]);
    expect(s).toMatch(/Outstanding work \(one\)/);
    expect(s).not.toMatch(/if the finance\./);
  });

  it("keeps an ordinary task's own time anchor instead of cutting it", () => {
    const s = summaryFor(["Rohan to draft the flag rollout plan by Friday"]);
    expect(s).toContain("Rohan to draft the flag rollout plan by Friday");
  });
});
