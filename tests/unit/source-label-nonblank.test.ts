import { expect, it, vi } from "vitest";
import { initialWorkbenchState, workbenchReducer } from "@/components/workbench-state";

import { importSource } from "@/import/import-source";
import { renderBundle } from "@/render/render-bundle";
function fixture() {
  const result = importSource({ raw: "# Notes\n\nKeep the source intact.\n", label: "notes.md" });
  if (!result.ok) throw new Error("fixture import failed");
  return initialWorkbenchState({ sourceText: "notes", sourceLabel: "notes.md", document: result.value, outputs: renderBundle(result.value).outputs, at: "test" });
}
it("does not trim the full source just to choose an edit label", () => {
  const state = fixture();
  const trim = vi.spyOn(String.prototype, "trim");
  let label: string;
  let calls: number;
  try {
    label = workbenchReducer(state, { type: "sourceEdited", sourceText: " ".repeat(10000) + "x" + " ".repeat(10000) }).sourceLabel;
    calls = trim.mock.calls.length;
  } finally { trim.mockRestore(); }
  expect(label).toBe("Pasted notes");
  expect(calls).toBe(0);
});

it("matches trim-based emptiness for ECMAScript whitespace and neighboring nonspace", () => {
  const state = fixture();
  const spaces = [9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279];
  const inputs = ["", " ", "x", "\u200b", "\u0085", ...spaces.flatMap((code) => {
    const value = String.fromCharCode(code); return [value.repeat(20), value + "x" + value];
  })];
  for (const sourceText of inputs) {
    expect(workbenchReducer(state, { type: "sourceEdited", sourceText }).sourceLabel).toBe(sourceText.trim().length ? "Pasted notes" : "");
  }
});
