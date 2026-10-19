/**
 * A section full of checkboxes is a todo list no matter what its heading says.
 *
 * "## To-do" routes its "[ ]"/"[x]" lines to actions with their state. But
 * everyday checklists use section names like "Before the event" — the heading
 * claims nothing, content inference counted checkboxes only as generic
 * bullets, and the whole list dissolved into snapshot notes. The one signal a
 * checklist exists to carry (what is still open vs done) was lost.
 */
import { describe, expect, it } from "vitest";
import { importSource } from "@/import/import-source";

const checklist = `# Launch Prep — Checklist

## Before the event
- [ ] Confirm projector rental
- [ ] Print 40 badges
- [x] Book the venue
`;

describe("checkbox sections under unrecognized headings", () => {
  it("routes checkbox lists to actions with their open/done state", () => {
    const result = importSource({ raw: checklist, label: "checklist.md" });
    if (!result.ok) throw new Error("import failed");
    const actions = result.value.blocks.find((b) => b.kind === "actions");
    const entries = (actions?.payload as { entries: Array<{ task: string; status: string }> } | undefined)?.entries ?? [];
    expect(entries.some((e) => e.task === "Confirm projector rental" && e.status === "pending")).toBe(true);
    expect(entries.some((e) => e.task === "Print 40 badges" && e.status === "pending")).toBe(true);
    expect(entries.some((e) => e.task === "Book the venue" && e.status === "done")).toBe(true);
  });

  it("does not strand the open items in snapshot notes", () => {
    const result = importSource({ raw: checklist, label: "checklist.md" });
    if (!result.ok) throw new Error("import failed");
    const snapshot = result.value.blocks.find((b) => b.kind === "snapshot");
    const notes = (snapshot?.payload as { notes?: string[] } | undefined)?.notes ?? [];
    expect(notes.some((n) => /Confirm projector rental/.test(n))).toBe(false);
  });

  it("keeps ordinal schedule sections as timeline entries even with checkbox content", () => {
    const plan = `# Onboarding\n\n## Week 1\n- [ ] Get laptop and badge from IT on day one\n- [ ] Set up the sandbox account\n`;
    const result = importSource({ raw: plan, label: "onboarding.md" });
    if (!result.ok) throw new Error("import failed");
    const timeline = result.value.blocks.find((b) => b.kind === "timeline");
    const entries = (timeline?.payload as { entries: Array<{ date: string }> } | undefined)?.entries ?? [];
    expect(entries.some((e) => e.date === "Week 1")).toBe(true);
  });

  it("still reads a measured-value section as signals", () => {
    const doc = `# Lab Report\n\n## Panel numbers\n- Hemoglobin came in at 14.2 g/dL\n- Fasting glucose measured 108 mg/dL over 3 hours fasting\n`;
    const result = importSource({ raw: doc, label: "lab.md" });
    if (!result.ok) throw new Error("import failed");
    const signals = result.value.blocks.find((b) => b.kind === "signals");
    const payload = signals?.payload as { entries?: unknown[]; notes?: string[] } | undefined;
    expect((payload?.entries?.length ?? 0) + (payload?.notes?.length ?? 0)).toBeGreaterThan(0);
  });
});
