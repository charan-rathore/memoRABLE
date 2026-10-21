/**
 * A table is only a todo list in a section that is about todos.
 *
 * An expense report's "| Train tickets | Rs 2,400 | Booked September 30 |"
 * became a pending task whose owner is the amount and whose due date is the
 * note — and the header row "| Item | Amount | Notes |" became a task too.
 * Understanding-level action inference must leave table rows alone unless
 * the section claims actions, and even a real task table's header row is
 * furniture, not an entry.
 */
import { describe, expect, it } from "vitest";
import { importSource } from "@/import/import-source";
import { understand } from "@/understanding";

const expense = `# October Travel Expenses

Submitted by: K. Desai. Trip dates: October 6-8, 2026.

## Expenses
| Item | Amount | Notes |
| --- | --- | --- |
| Train tickets (2 way) | Rs 2,400 | Booked September 30 |
| Hotel, 2 nights | Rs 5,600 | Client-negotiated rate |
`;

const actionTable = `# Sync Notes

## Action items
| Task | Owner | Due |
| --- | --- | --- |
| Draft the proposal | Rohan | Friday |
| Review budget | Meera | October 30 |
`;

describe("non-action tables are not todo lists", () => {
  it("creates no action entries from an expense table", () => {
    const result = importSource({ raw: expense, label: "expense.md" });
    if (!result.ok) throw new Error("import failed");
    const actions = result.value.blocks.find((b) => b.kind === "actions");
    const entries = (actions?.payload as { entries?: Array<{ task: string }> } | undefined)?.entries ?? [];
    expect(entries.length).toBe(0);
  });

  it("keeps the expense rows as preserved text", () => {
    const result = importSource({ raw: expense, label: "expense.md" });
    if (!result.ok) throw new Error("import failed");
    const snapshot = result.value.blocks.find((b) => b.kind === "snapshot");
    const notes = (snapshot?.payload as { notes?: string[] } | undefined)?.notes ?? [];
    expect(notes.some((n) => /Train tickets/.test(n))).toBe(true);
  });
});

describe("real task tables", () => {
  it("still extracts rows from an actions-section table", () => {
    const result = importSource({ raw: actionTable, label: "sync.md" });
    if (!result.ok) throw new Error("import failed");
    const actions = result.value.blocks.find((b) => b.kind === "actions");
    const entries = (actions?.payload as { entries?: Array<{ task: string; owner?: string }> } | undefined)?.entries ?? [];
    expect(entries.some((e) => e.task === "Draft the proposal" && e.owner === "Rohan")).toBe(true);
    expect(entries.some((e) => e.task === "Review budget" && e.owner === "Meera")).toBe(true);
  });

  it("never turns the header row into a task", () => {
    const result = importSource({ raw: actionTable, label: "sync.md" });
    if (!result.ok) throw new Error("import failed");
    const actions = result.value.blocks.find((b) => b.kind === "actions");
    const entries = (actions?.payload as { entries?: Array<{ task: string }> } | undefined)?.entries ?? [];
    expect(entries.some((e) => /^(task|owner|due)$/i.test(e.task.trim()))).toBe(false);
  });
});

describe("header-shaped rows only", () => {
  it("keeps a task whose owner shares a name with a column header", () => {
    const doc = `# Sync Notes

## Action items
| Task | Owner | Due |
| --- | --- | --- |
| Draft report | Price | Friday |
`;
    const result = importSource({ raw: doc, label: "sync-owner.md" });
    if (!result.ok) throw new Error("import failed");
    const actions = result.value.blocks.find((b) => b.kind === "actions");
    const entries = (actions?.payload as { entries?: Array<{ task: string; owner?: string }> } | undefined)?.entries ?? [];
    expect(entries.some((e) => e.task === "Draft report" && e.owner === "Price")).toBe(true);
  });
});

describe("a document titled as actions", () => {
  it("reads an unheaded task table under an actions document title", () => {
    const doc = `# Action Items

| Task | Owner | Due |
| --- | --- | --- |
| Draft the proposal | Rohan | Friday |
`;
    const result = importSource({ raw: doc, label: "titled-actions.md" });
    if (!result.ok) throw new Error("import failed");
    const actions = result.value.blocks.find((b) => b.kind === "actions");
    const entries = (actions?.payload as { entries?: Array<{ task: string; owner?: string }> } | undefined)?.entries ?? [];
    expect(entries.some((e) => e.task === "Draft the proposal" && e.owner === "Rohan")).toBe(true);
  });
});

describe("compound table headers", () => {
  it("never turns an Action Item header row into a task", () => {
    const doc = `# Sync Notes

## Action items
| Action Item | Owner | Due Date |
| --- | --- | --- |
| Draft the proposal | Rohan | Friday |
`;
    const result = importSource({ raw: doc, label: "compound-header.md" });
    if (!result.ok) throw new Error("import failed");
    const actions = result.value.blocks.find((b) => b.kind === "actions");
    const entries = (actions?.payload as { entries?: Array<{ task: string; owner?: string }> } | undefined)?.entries ?? [];
    expect(entries.some((e) => /action item|owner|due/i.test(e.task))).toBe(false);
    expect(entries.some((e) => e.task === "Draft the proposal" && e.owner === "Rohan")).toBe(true);
  });
});

describe("filename-derived titles do not claim", () => {
  it("still extracts a soft todo from an H1-less note named risks.md", () => {
    const result = importSource({ raw: "Someone should draft the customer email for Meera", label: "risks.md" });
    if (!result.ok) throw new Error("import failed");
    const actions = result.value.blocks.find((b) => b.kind === "actions");
    const entries = (actions?.payload as { entries?: Array<{ task: string }> } | undefined)?.entries ?? [];
    expect(entries.some((e) => /draft the customer email/i.test(e.task))).toBe(true);
  });
});

describe("round 3 follow-ups", () => {
  it("an H1 matching the filename stem still claims its section", () => {
    const result = importSource({
      raw: "# risks\n\nSomeone should draft the customer email",
      label: "risks.md",
    });
    if (!result.ok) throw new Error("import failed");
    const actions = result.value.blocks.find((b) => b.kind === "actions");
    const entries = (actions?.payload as { entries?: Array<{ task: string }> } | undefined)?.entries ?? [];
    expect(entries.some((e) => /draft the customer email/i.test(e.task))).toBe(false);
  });

  it("recovers a todo from an action-table row with blank owner and due", () => {
    const doc = `# Plan

## Action items
| Task | Owner | Due |
| --- | --- | --- |
| Someone should draft the customer email | | |
`;
    const result = importSource({ raw: doc, label: "plan.md" });
    if (!result.ok) throw new Error("import failed");
    const actions = result.value.blocks.find((b) => b.kind === "actions");
    const entries = (actions?.payload as { entries?: Array<{ task: string }> } | undefined)?.entries ?? [];
    expect(entries.some((e) => /draft the customer email/i.test(e.task))).toBe(true);
  });
});

describe("round 4 follow-ups", () => {
  it("a two-column Action Item header row is furniture too", () => {
    const doc = `# Plan

## Action items
| Action Item | Owner |
| --- | --- |
| Chase the landlord about the deposit | Rohan |
`;
    const result = importSource({ raw: doc, label: "plan2.md" });
    if (!result.ok) throw new Error("import failed");
    const actions = result.value.blocks.find((b) => b.kind === "actions");
    const entries = (actions?.payload as { entries?: Array<{ task: string; owner?: string }> } | undefined)?.entries ?? [];
    expect(entries.some((e) => /action item|owner/i.test(e.task))).toBe(false);
    expect(entries.some((e) => /chase the landlord/i.test(e.task) && e.owner === "Rohan")).toBe(true);
  });

  it("maps recovered cells by the table's own header schema", () => {
    const doc = `# Plan

## Action items
| Task | Status | Notes |
| --- | --- | --- |
| Send the customer email to Meera | Ready | draft sits in drive |
`;
    const result = importSource({ raw: doc, label: "plan3.md" });
    if (!result.ok) throw new Error("import failed");
    const actions = result.value.blocks.find((b) => b.kind === "actions");
    const entries = (actions?.payload as { entries?: Array<{ task: string; owner?: string; due?: string; status?: string }> } | undefined)?.entries ?? [];
    const entry = entries.find((e) => /customer email to meera/i.test(e.task));
    expect(entry).toBeDefined();
    expect(entry?.owner).toBeUndefined();
    expect(entry?.due).toBeUndefined();
    expect(entry?.status).toBe("ready");
  });

  it("keeps an explicit Done status when recovering an incomplete row", () => {
    const doc = `# Plan

## Action items
| Task | Owner | Due | Status |
| --- | --- | --- | --- |
| Send the customer email to Meera | | | Done |
`;
    const result = importSource({ raw: doc, label: "plan4.md" });
    if (!result.ok) throw new Error("import failed");
    const actions = result.value.blocks.find((b) => b.kind === "actions");
    const entries = (actions?.payload as { entries?: Array<{ task: string; status?: string }> } | undefined)?.entries ?? [];
    const entry = entries.find((e) => /customer email to meera/i.test(e.task));
    expect(entry?.status).toBe("done");
  });

  it("understand() without provenance still treats its title as a heading", () => {
    const u = understand({
      title: "Risks",
      sections: [{ headingText: null, lines: [{ text: "Someone should draft the customer email", lineNo: 1 }] }],
    });
    expect(u.actions.length).toBe(0);
  });
});
