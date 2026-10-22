/**
 * A rating after a label is not a calendar date.
 *
 * "SQL and data modeling: 4/5" put an interview score on the timeline as if
 * it were April 5th — one per score line, complete with a mangled title.
 * The quantity-fraction guard covers measured quantities; ratings need the
 * same respect: a small-denominator score right after a label's colon is a
 * verdict, not a day.
 */
import { describe, expect, it } from "vitest";
import { importSource } from "@/import/import-source";

const feedback = `# Interview Feedback — Round 2

Candidate: S. Pillai. Date: October 20, 2026.

## Scores
- SQL and data modeling: 4/5 — fluent window functions, one slip on NULL handling
- Case study: 3/5 — good structure, missed the seasonality
- Communication: 5/5 — clearest walkthrough of the quarter

## Follow-ups
- Share feedback in the tracker by Friday
`;

describe("ratings after labels", () => {
  it("creates no timeline entry from a score", () => {
    const result = importSource({ raw: feedback, label: "feedback.md" });
    if (!result.ok) throw new Error("import failed");
    const timeline = result.value.blocks.find((b) => b.kind === "timeline");
    const entries = (timeline?.payload as { entries?: Array<{ date: string }> } | undefined)?.entries ?? [];
    expect(entries.some((e) => /^\d{1,2}\/(5|10)$/.test(e.date))).toBe(false);
  });

  it("keeps the score lines as preserved text", () => {
    const result = importSource({ raw: feedback, label: "feedback.md" });
    if (!result.ok) throw new Error("import failed");
    const snapshot = result.value.blocks.find((b) => b.kind === "snapshot");
    const notes = (snapshot?.payload as { notes?: string[] } | undefined)?.notes ?? [];
    expect(notes.some((n) => /4\/5/.test(n))).toBe(true);
  });

  it("treats a perfect score as a rating too", () => {
    const doc = `# Hotel Review\n\n- Cleanliness: 10/10, spotless bathrooms\n- Location: 8/10\n`;
    const result = importSource({ raw: doc, label: "hotel.md" });
    if (!result.ok) throw new Error("import failed");
    const timeline = result.value.blocks.find((b) => b.kind === "timeline");
    const entries = (timeline?.payload as { entries?: Array<{ date: string }> } | undefined)?.entries ?? [];
    expect(entries.some((e) => /10\/10|8\/10/.test(e.date))).toBe(false);
  });

  it("still reads a real numeric date that is not after a label colon", () => {
    const doc = `# Plan\n\n- Submit the expense report by 4/15 at the latest\n- Team lunch 10/10 noon\n`;
    const result = importSource({ raw: doc, label: "plan.md" });
    if (!result.ok) throw new Error("import failed");
    const timeline = result.value.blocks.find((b) => b.kind === "timeline");
    const entries = (timeline?.payload as { entries?: Array<{ date: string }> } | undefined)?.entries ?? [];
    expect(entries.some((e) => e.date === "4/15")).toBe(true);
    expect(entries.some((e) => e.date === "10/10")).toBe(true);
  });
});
