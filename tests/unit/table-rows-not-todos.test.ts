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
