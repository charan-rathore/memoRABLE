import { describe, expect, it } from "vitest";
import { importSource } from "@/import/import-source";
import type { ActionsPayload } from "@/domain/memory/schema";

function actions(raw: string) {
  const result = importSource({ raw, label: "a.md" });
  if (!result.ok) throw new Error("import failed");
  const block = result.value.blocks.find((b) => b.kind === "actions");
  return (block?.payload as ActionsPayload | undefined)?.entries ?? [];
}

describe("numbered task-list items carry their checkbox state", () => {
  it("1. [x] is done and the checkbox is not part of the task text; entries exact and in order", () => {
    const entries = actions("# A\n\n## Actions\n1. [x] Sam booked venue\n2. [ ] Priya to send contract\n3. [x] Lee paid deposit\n");
    expect(entries.map(({ task, status }) => ({ task, status }))).toEqual([
      { task: "Sam booked venue", status: "done" },
      { task: "Priya to send contract", status: "pending" },
      { task: "Lee paid deposit", status: "done" },
    ]);
  });
  it("1) paren-numbered checkbox works too", () => {
    const entries = actions("# A\n\n## Actions\n1) [X] Lee finalized pricing\n");
    expect(entries.map(({ task, status }) => ({ task, status }))).toEqual([{ task: "Lee finalized pricing", status: "done" }]);
  });
  it("bullet checkboxes are unchanged", () => {
    const entries = actions("# A\n\n## Actions\n- [x] Sam booked venue\n- [ ] Priya to send contract\n");
    expect(entries.map((e) => e.status)).toEqual(["done", "pending"]);
  });
  it("the bullet glyph the importer already reads as a list marker carries checkbox state too", () => {
    const entries = actions("# A\n\n## Actions\n• [x] Send invitations\n• [ ] Order flowers\n");
    expect(entries.map(({ task, status }) => ({ task, status }))).toEqual([
      { task: "Send invitations", status: "done" },
      { task: "Order flowers", status: "pending" },
    ]);
  });
  it("a numbered line whose text merely starts with brackets stays text", () => {
    const entries = actions("# A\n\n## Actions\n1. [draft] Sam to write FAQ\n");
    expect(entries.map((e) => e.task)).toEqual(["[draft] Sam to write FAQ"]);
  });
});
