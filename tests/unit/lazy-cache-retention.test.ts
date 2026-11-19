import { describe, expect, it, vi } from "vitest";
import { ATLAS_NOTES_SOURCE } from "@/import/examples/catalog";
import { OUTPUT_MODES } from "@/domain/memory/types";
import { importSource } from "@/import/import-source";
import { initialWorkbenchState, workbenchReducer, RENDER_CACHE_SIZE, type WorkbenchState } from "@/components/workbench-state";
import * as rendering from "@/render/render-bundle";

function importAction(sourceText = ATLAS_NOTES_SOURCE) {
  const imported = importSource({ raw: sourceText, label: "notes.md" });
  if (!imported.ok) throw new Error("fixture import");
  return { type: "imported" as const, document: imported.value, sourceText, sourceLabel: "notes.md", at: "import" };
}

function importedState() {
  const action = importAction();
  const initial = initialWorkbenchState({
    sourceText: action.sourceText,
    sourceLabel: action.sourceLabel,
    document: action.document,
    outputs: rendering.renderBundle(action.document).outputs,
    at: "initial",
  });
  return workbenchReducer(initial, action);
}

/** Match scheduleLazyRenders: three non-active modes, then an empty cache. */
function completeDeferred(state: WorkbenchState) {
  const outputs = Object.fromEntries(OUTPUT_MODES.filter((mode) => mode !== "document").map((mode) => [
    mode, rendering.renderMode(state.document!, mode, state.theme, state.sourceText),
  ]));
  return workbenchReducer(state, {
    type: "lazyRendered", documentHash: state.document!.contentHash,
    theme: state.theme, sourceText: state.sourceText, outputs, cache: [],
  });
}

describe("deferred rendering retains the active render cache", () => {
  it("reuses the active output after production-shaped completion and a fresh parse", () => {
    const state = importedState();
    const afterLazy = completeDeferred(state);
    const action = importAction();
    expect(action.document).not.toBe(state.document);
    expect(action.document.contentHash).toBe(state.document!.contentHash);
    const spy = vi.spyOn(rendering, "renderMode");
    try {
      const repeated = workbenchReducer(afterLazy, action);
      expect(repeated.outputs.document).toBe(state.outputs.document);
      expect(spy).not.toHaveBeenCalled();
    } finally { spy.mockRestore(); }
  });

  it("still renders when raw source differs even if the canonical document is identical", () => {
    const state = completeDeferred(importedState());
    const action = { ...importAction(), sourceText: ATLAS_NOTES_SOURCE + "\n" };
    const spy = vi.spyOn(rendering, "renderMode");
    try {
      const next = workbenchReducer(state, action);
      expect(next.outputs.document).not.toBe(state.outputs.document);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally { spy.mockRestore(); }
  });

  it("retains active entries, prefers incoming entries with identical keys, and caps at four", () => {
    const state = importedState();
    const incoming = Array.from({ length: 4 }, (_, i) => ({ key: `deferred-${i}`, output: state.outputs.document! }));
    const action = {
      type: "lazyRendered" as const, documentHash: state.document!.contentHash,
      theme: state.theme, sourceText: state.sourceText, outputs: {}, cache: incoming.slice(0, 2),
    };
    const merged = workbenchReducer(state, action);
    expect(merged.cache.map((entry) => entry.key)).toEqual([...incoming.slice(0, 2).map((entry) => entry.key), state.cache[0]!.key]);
    expect(workbenchReducer(state, { ...action, cache: incoming }).cache).toHaveLength(RENDER_CACHE_SIZE);
    const replacement = { ...state.cache[0]! };
    const deduplicated = workbenchReducer(state, { ...action, cache: [replacement] });
    expect(deduplicated.cache).toEqual([replacement]);
    expect(deduplicated.cache[0]).toBe(replacement);
  });

  it.each(["html", "json"] as const)("retries a prior %s render failure on the next identical import", (failure) => {
    const state = importedState();
    const failedOutput = {
      ...state.outputs.document!,
      ...(failure === "html" ? { html: null, error: "transient HTML failure" } : { designJson: null, designJsonError: "transient JSON failure" }),
    };
    state.outputs.document = failedOutput;
    state.cache = state.cache.map((entry) => ({ ...entry, output: failedOutput }));
    const afterLazy = completeDeferred(state);
    const spy = vi.spyOn(rendering, "renderMode");
    try {
      const repeated = workbenchReducer(afterLazy, importAction());
      expect(spy).toHaveBeenCalledTimes(1);
      expect(repeated.outputs.document!.error).toBeNull();
      expect(repeated.outputs.document!.designJsonError).toBeNull();
    } finally { spy.mockRestore(); }
  });

  it("still ignores source-, theme-, and document-stale deferred completions", () => {
    const state = importedState();
    const action = {
      type: "lazyRendered" as const, documentHash: state.document!.contentHash,
      theme: state.theme, sourceText: state.sourceText, outputs: {}, cache: [],
    };
    expect(workbenchReducer(state, { ...action, sourceText: "other source" })).toBe(state);
    expect(workbenchReducer(state, { ...action, documentHash: "other document" })).toBe(state);
    expect(workbenchReducer(state, { ...action, theme: "academic" })).toBe(state);
  });
});
