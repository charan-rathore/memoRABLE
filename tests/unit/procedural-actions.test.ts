/**
 * Output-compatibility contract (publisher ruling, packet A).
 *
 * Extraction status alteration is DEFERRED: every action row and status is
 * byte-identical to the be99d40 register, including plain recipe steps under
 * an explicit procedure section. The outstanding-work clause is visible in
 * an unframed summary only when the exact be99d40 claim selection would
 * have framed the same input — a temporary compatibility boundary, never a
 * rendering of a rejected claim.
 */
import { describe, expect, it } from "vitest";
import { importSource } from "@/import/import-source";

function doc(raw: string) {
  const r = importSource({ raw, label: "probe.md" });
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error("import failed");
  return r.value.blocks;
}

function actionsOf(raw: string) {
  const block = doc(raw).find((b) => b.kind === "actions")?.payload as
    | { entries: Array<{ task: string; status?: string }> }
    | undefined;
  return block?.entries ?? [];
}

function summaryOf(raw: string) {
  const block = doc(raw).find((b) => b.kind === "snapshot")?.payload as
    | { summary: string; problem?: string }
    | undefined;
  return block;
}

describe("the register is byte-identical to baseline (B deferred)", () => {
  it("plain recipe steps keep their baseline pending status", () => {
    const entries = actionsOf(
      "# Masala Khichdi\n\n## Steps\n1. Heat ghee, splutter cumin, soften onion for 3 minutes\n2. Add tomato and carrot, cook until soft\n",
    );
    expect(entries).toEqual([
      { task: "Heat ghee, splutter cumin, soften onion for 3 minutes", status: "pending" },
      { task: "Add tomato and carrot, cook until soft", status: "pending" },
    ]);
  });

  it("deadline-looking tasks keep their baseline pending status", () => {
    for (const line of [
      "Send the report by noon",
      "Send the report before midnight",
      "Send the report by the morning of Friday",
      "Heat soup by noon",
      "Rotate production credentials within 2 hours",
    ]) {
      const entries = actionsOf(`# Tasks\n\n## Steps\n- ${line}\n`);
      expect(entries[0]?.status, line).toBe("pending");
    }
  });
});

describe("outstanding-work visibility follows the compatibility boundary", () => {
  it("a baseline-unframed document with tasks shows no new clause", () => {
    const snap = summaryOf(
      "# Masala Khichdi\n\nServes 3. Prep 10 minutes, cook 25 minutes\n\n## Steps\n1. Heat ghee, splutter cumin, soften onion for 3 minutes\n",
    );
    expect(snap?.summary).toBe("Serves 3. Prep 10 minutes, cook 25 minutes");
  });

  it("a policy-claiming document stays framed and keeps the notice whole", () => {
    // Public-baseline parity: the policy veto family is withdrawn, so the
    // policy line claims exactly as on ed4c60c; the notice stays visible.
    const snap = summaryOf(
      "# Dental Appointment\n\nPatient: R. Sharma\nMissed appointments without notice carry a Rs 500 fee\n\n## Before you come\n- Call us at least 24 hours before your slot if you need to move it\n",
    );
    expect(snap?.problem ?? "").toBe(
      "Missed appointments without notice carry a Rs 500 fee",
    );
    expect(snap?.summary).toContain(
      "Call us at least 24 hours before your slot if you need to move it.",
    );
  });

  it("a framed document shows outstanding work with the claim", () => {
    const snap = summaryOf(
      "# Release Plan\n\n## Decisions\n- We decided to ship the onboarding revamp behind a flag\n\n## Action items\n- [ ] Rohan to draft the rollout plan by Friday\n",
    );
    expect(snap?.summary).toContain("Outstanding work (one): Rohan to draft the rollout plan by Friday.");
  });
});
