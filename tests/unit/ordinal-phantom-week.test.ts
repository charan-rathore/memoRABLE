/**
 * Ordinal-owned sections must not sprout phantom phase entries.
 *
 * In a 4-week plan, "## Week 3" owns its lines (they ride as the Week 3
 * entry's title/details). But the deload line "- Deload: 60% of Week 2
 * weights" mentions "Week 2" as a *reference* — and timeline inference read
 * it as scheduling the line FOR a phantom "Week 2" the document never had.
 * Worse, the phantom then deduped the real Week 3 entry out of existence:
 * a phase that does not exist appeared, and a phase that does disappeared.
 */
import { describe, expect, it } from "vitest";
import { importSource } from "@/import/import-source";

const plan = `# 4-Week Strength Plan — Beginner

Coach: Asha Verma. Start week of November 3, 2026.

## Week 1
- Squat 3x5 at 40 kg, bench 3x5 at 30 kg, row 3x8 at 25 kg
- Add 2.5 kg to squat every session if all reps pass

## Week 3
- Deload: 60% of Week 2 weights, same sets
- If knees hurt below parallel, switch to box squats
`;

describe("phantom phase entries from ordinal references", () => {
  it("does not invent a Week 2 the document never scheduled", () => {
    const result = importSource({ raw: plan, label: "workout-plan.md" });
    if (!result.ok) throw new Error("import failed");
    const timeline = result.value.blocks.find((b) => b.kind === "timeline");
    const entries = (timeline?.payload as { entries: Array<{ date: string; title: string; details?: string[] }> }).entries;
    expect(entries.some((e) => e.date === "Week 2")).toBe(false);
  });

  it("keeps the real Week 3 entry with its deload content", () => {
    const result = importSource({ raw: plan, label: "workout-plan.md" });
    if (!result.ok) throw new Error("import failed");
    const timeline = result.value.blocks.find((b) => b.kind === "timeline");
    const entries = (timeline?.payload as { entries: Array<{ date: string; title: string; details?: string[] }> }).entries;
    const week3 = entries.find((e) => e.date === "Week 3");
    expect(week3).toBeDefined();
    const text = `${week3!.title} ${(week3!.details ?? []).join(" ")}`;
    expect(/Deload/.test(text)).toBe(true);
  });

  it("still extracts the real Week 1 schedule entry", () => {
    const result = importSource({ raw: plan, label: "workout-plan.md" });
    if (!result.ok) throw new Error("import failed");
    const timeline = result.value.blocks.find((b) => b.kind === "timeline");
    const entries = (timeline?.payload as { entries: Array<{ date: string }> }).entries;
    expect(entries.some((e) => e.date === "Week 1")).toBe(true);
  });
});
