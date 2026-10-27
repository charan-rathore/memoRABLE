import { describe, expect, it } from "vitest";
import { initialWorkbenchState, workbenchReducer } from "@/components/workbench-state";
import { importSource } from "@/import/import-source";
import { renderBundle } from "@/render/render-bundle";
import { ATLAS_JSON_SOURCE } from "@/import/examples/catalog";
import type { MemoryDocument } from "@/domain/memory/schema";

function atlas(): MemoryDocument {
  const r = importSource({ raw: ATLAS_JSON_SOURCE, label: "atlas-q3-brief.json" });
  if (!r.ok) throw new Error("import failed");
  return r.value;
}
function doc(raw: string, label: string): MemoryDocument {
  const r = importSource({ raw, label });
  if (!r.ok) throw new Error("import failed");
  return r.value;
}
function exampleState() {
  const d = atlas();
  return initialWorkbenchState({
    sourceText: ATLAS_JSON_SOURCE,
    sourceLabel: "atlas-q3-brief.json",
    document: d,
    outputs: renderBundle(d).outputs,
    at: "preloaded",
  });
}

const PASTED = "# School Circular\n\nThe unit test is on November 10, 2026.\n";

describe("provenance label transitions", () => {
  it("editing the source after an example import resets the label (RED)", () => {
    const next = workbenchReducer(exampleState(), { type: "sourceEdited", sourceText: PASTED });
    expect(next.sourceLabel).toBe("Pasted notes");
  });
  it("a no-edit file import keeps the file's own name", () => {
    const d = doc("# Launch\n\nShip it November 1, 2026.\n", "launch-plan.md");
    const next = workbenchReducer(exampleState(), {
      type: "imported", sourceText: "# Launch\n\nShip it November 1, 2026.\n", sourceLabel: "launch-plan.md", document: d, at: "now",
    });
    expect(next.sourceLabel).toBe("launch-plan.md");
  });
  it("file flow: edit-reset then import restores the file's name", () => {
    const edited = workbenchReducer(exampleState(), { type: "sourceEdited", sourceText: "# Launch\n\nShip it November 1, 2026.\n" });
    expect(edited.sourceLabel).toBe("Pasted notes");
    const d = doc("# Launch\n\nShip it November 1, 2026.\n", "launch-plan.md");
    const next = workbenchReducer(edited, {
      type: "imported", sourceText: "# Launch\n\nShip it November 1, 2026.\n", sourceLabel: "launch-plan.md", document: d, at: "now",
    });
    expect(next.sourceLabel).toBe("launch-plan.md");
  });
  it("a failed import after an edit keeps the honest label and the last-good document", () => {
    const edited = workbenchReducer(exampleState(), { type: "sourceEdited", sourceText: "not importable ::: \x00" });
    const failed = workbenchReducer(edited, {
      type: "importFailed", sourceText: "not importable ::: \x00", sourceLabel: "Pasted notes",
      errors: [{ code: "unreadable", message: "no importable content", severity: "error" } as never],
    });
    expect(failed.sourceLabel).toBe("Pasted notes");
    expect(failed.document).not.toBeNull();
    expect(failed.errors.length).toBe(1);
  });
  it("a restored snapshot keeps its recorded attribution", () => {
    const s = exampleState();
    const restored = workbenchReducer(s, {
      type: "restored",
      snapshot: {
        sourceText: s.sourceText, sourceLabel: s.sourceLabel, document: s.document,
        outputs: s.outputs, lastGood: s.lastGood, mode: s.mode,
      },
    });
    expect(restored.sourceLabel).toBe("atlas-q3-brief.json");
  });
  it("clearing the source clears the label to the empty state", () => {
    const next = workbenchReducer(exampleState(), { type: "sourceEdited", sourceText: "" });
    expect(next.sourceLabel).toBe("");
  });
});
