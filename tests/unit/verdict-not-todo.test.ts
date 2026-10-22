/**
 * A reviewer's verdict is advice to the reader, not the owner's plan.
 *
 * Under a "## Verdict" heading, "Skip it if you need to carry it or remap on
 * a Mac" became BOTH a committed decision and a pending action — the memory
 * claimed the document's owner had decided to skip a product they were
 * reviewing, and handed them a todo about it. A verdict is the reviewer's
 * conditional advice to whoever is reading; it is preserved as text, never
 * turned into the owner's commitments.
 *
 * Scope note: "Recommendation" is deliberately NOT a verdict heading — in an
 * RFC it names the author's proposed decision, which is decision-worthy.
 */
import { describe, expect, it } from "vitest";
import { importSource } from "@/import/import-source";

const review = `# Review: Aurora Mechanical Keyboard (6 weeks in)

Bought for Rs 7,200 in September 2026. Used daily for writing and code.

## The good
- Battery genuinely lasts three weeks with backlight off

## Verdict
Keep it if you type all day at one desk. Skip it if you need to carry it or remap on a Mac.
`;

describe("verdict sections", () => {
  it("turns no verdict line into a decision", () => {
    const result = importSource({ raw: review, label: "review.md" });
    if (!result.ok) throw new Error("import failed");
    const decisions = result.value.blocks.find((b) => b.kind === "decisions");
    const entries = (decisions?.payload as { entries?: Array<{ text: string }> } | undefined)?.entries ?? [];
    expect(entries.some((e) => /Skip it if/.test(e.text))).toBe(false);
    expect(entries.some((e) => /Keep it if/.test(e.text))).toBe(false);
  });

  it("turns no verdict line into an action", () => {
    const result = importSource({ raw: review, label: "review.md" });
    if (!result.ok) throw new Error("import failed");
    const actions = result.value.blocks.find((b) => b.kind === "actions");
    const entries = (actions?.payload as { entries?: Array<{ task: string }> } | undefined)?.entries ?? [];
    expect(entries.some((e) => /Skip it if/.test(e.task))).toBe(false);
    expect(entries.some((e) => /Keep it if/.test(e.task))).toBe(false);
  });

  it("keeps the verdict text preserved", () => {
    const result = importSource({ raw: review, label: "review.md" });
    if (!result.ok) throw new Error("import failed");
    const snapshot = result.value.blocks.find((b) => b.kind === "snapshot");
    const notes = (snapshot?.payload as { notes?: string[] } | undefined)?.notes ?? [];
    expect(notes.some((n) => /Skip it if/.test(n))).toBe(true);
  });

  it("still reads real decisions and actions from their own sections", () => {
    const doc = `# Product Sync\n\n## Decisions\n- We decided to ship the onboarding revamp behind a flag\n\n## Action items\n- [ ] Rohan to draft the rollout plan by Friday\n`;
    const result = importSource({ raw: doc, label: "sync.md" });
    if (!result.ok) throw new Error("import failed");
    const decisions = result.value.blocks.find((b) => b.kind === "decisions");
    const dEntries = (decisions?.payload as { entries?: Array<{ text: string }> } | undefined)?.entries ?? [];
    expect(dEntries.some((e) => /onboarding revamp/.test(e.text))).toBe(true);
    const actions = result.value.blocks.find((b) => b.kind === "actions");
    const aEntries = (actions?.payload as { entries?: Array<{ task: string }> } | undefined)?.entries ?? [];
    expect(aEntries.some((e) => /rollout plan/.test(e.task))).toBe(true);
  });
});
