/**
 * A markdown checkbox is the author's own todo marker, not a decision.
 *
 * On an onboarding checklist, "- [ ] Set up the warehouse sandbox account"
 * was remembered as a committed Decision - the memory claimed the owner had
 * settled a choice when the document only ever said "this work is open".
 * Sibling items on the same checklist became actions or plan details, so one
 * checklist produced three different memory types for identical syntax.
 *
 * Unchecked boxes are pending work; checked boxes are done work. Neither is
 * a decision.
 */
import { describe, expect, it } from "vitest";
import { importSource } from "@/import/import-source";

const checklist = `# New Hire Onboarding — Data Team

## Week 1
- [ ] Get laptop and badge from IT on day one
- [ ] Set up the warehouse sandbox account
- [x] Collect the signed NDA from HR

## Week 2
- [ ] Shadow two customer calls
- [ ] Ship a small docs fix to learn the review flow
`;

type DecisionEntry = { text: string };
type ActionEntry = { task: string; status?: string };

function blocks(raw: string) {
  const result = importSource({ raw, label: "onboarding.md" });
  if (!result.ok) throw new Error("import failed");
  const decisions = result.value.blocks.find((b) => b.kind === "decisions");
  const actions = result.value.blocks.find((b) => b.kind === "actions");
  return {
    decisions: (decisions?.payload as { entries?: DecisionEntry[] } | undefined)?.entries ?? [],
    actions: (actions?.payload as { entries?: ActionEntry[] } | undefined)?.entries ?? [],
  };
}

describe("checkbox items", () => {
  it("never turns a checkbox line into a decision", () => {
    const { decisions } = blocks(checklist);
    expect(decisions.some((e) => /sandbox account/.test(e.text))).toBe(false);
    expect(decisions.some((e) => /signed NDA/.test(e.text))).toBe(false);
    expect(decisions.some((e) => /customer calls/.test(e.text))).toBe(false);
  });

  it("reads every unchecked box as pending work", () => {
    const { actions } = blocks(checklist);
    for (const task of [
      "Get laptop and badge from IT on day one",
      "Set up the warehouse sandbox account",
      "Shadow two customer calls",
      "Ship a small docs fix to learn the review flow",
    ]) {
      const hit = actions.find((e) => e.task.includes(task.slice(0, 24)));
      expect(hit, `missing pending action: ${task}`).toBeDefined();
      expect(hit!.status ?? "pending").toBe("pending");
    }
  });

  it("reads a checked box as done work", () => {
    const { actions } = blocks(checklist);
    const hit = actions.find((e) => /signed NDA/.test(e.task));
    expect(hit, "missing done action for checked box").toBeDefined();
    expect(hit!.status).toBe("done");
  });

  it("still reads imperative rules as decisions in a prescriptive guide", () => {
    const guide = `# Warehouse Guide\n\n## Rules\n- Never store raw tokens in the warehouse\n- Prefer incremental models over full refreshes\n`;
    const { decisions } = blocks(guide);
    expect(decisions.some((e) => /Never store raw tokens/.test(e.text))).toBe(true);
  });
});

describe("checkbox items keep their metadata and content", () => {
  it("keeps explicit owner and due on a checkbox action", () => {
    const { actions } = blocks("# Plan\n\n## Week 1\n- [ ] Review rollout plan — Alice — Aug 15\n");
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ task: "Review rollout plan", owner: "Alice", due: "Aug 15", status: "pending" });
  });

  it("keeps a multi-sentence checkbox as one task, so the instruction survives", () => {
    const { actions } = blocks("# Plan\n\n## Week 1\n- [ ] The draft is attached. Send the proposal to Alice.\n");
    expect(actions).toHaveLength(1);
    expect(actions[0]!.task).toContain("Send the proposal to Alice");
  });
});
