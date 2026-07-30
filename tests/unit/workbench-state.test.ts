import { describe, expect, it } from "vitest";
import {
  displayHtml,
  initialWorkbenchState,
  renderAll,
  workbenchReducer,
  RENDER_CACHE_SIZE,
} from "@/components/workbench-state";
import { importSource } from "@/import/import-source";
import { renderBundle } from "@/render/render-bundle";
import { ATLAS_JSON_SOURCE, ATLAS_NOTES_SOURCE } from "@/import/examples/catalog";
import type { MemoryDocument } from "@/domain/memory/schema";
import type { Diagnostic } from "@/reliability/diagnostics";

function atlas(): MemoryDocument {
  const result = importSource({ raw: ATLAS_JSON_SOURCE, label: "atlas-q3-brief.json" });
  if (!result.ok) throw new Error("import failed");
  return result.value;
}

function initialState() {
  const doc = atlas();
  return initialWorkbenchState({
    sourceText: ATLAS_JSON_SOURCE,
    sourceLabel: "atlas-q3-brief.json",
    document: doc,
    outputs: renderBundle(doc).outputs,
    at: "preloaded",
  });
}

describe("workbenchReducer — imports", () => {
  it("successful import replaces document and clears errors", () => {
    const state = initialState();
    const notes = importSource({ raw: ATLAS_NOTES_SOURCE, label: "atlas-launch-notes.md" });
    if (!notes.ok) throw new Error("notes import failed");
    const next = workbenchReducer(state, {
      type: "imported",
      sourceText: ATLAS_NOTES_SOURCE,
      sourceLabel: "atlas-launch-notes.md",
      document: notes.value,
      at: "now",
    });
    expect(next.document!.contentHash).toBe(notes.value.contentHash);
    expect(next.errors).toEqual([]);
    expect(next.mode).toBe("web"); // web becomes primary after your own import
    expect(next.outputs.web!.html).toContain("Atlas Launch Notes");
  });

  it("failed import is all-or-nothing: source kept, document and outputs untouched", () => {
    const state = initialState();
    const errors: Diagnostic[] = [{ code: "json.syntax", message: "broken", line: 3 }];
    const next = workbenchReducer(state, {
      type: "importFailed",
      sourceText: "{ broken",
      sourceLabel: "broken.json",
      errors,
    });
    expect(next.document).toBe(state.document);
    expect(next.outputs).toBe(state.outputs);
    expect(next.sourceText).toBe("{ broken");
    expect(next.errors).toHaveLength(1);
    // The last-good outputs still render.
    expect(displayHtml(next, "document").html).toContain("Momentum, with room to compound.");
  });
});

describe("workbenchReducer — arrange", () => {
  it("reorder preserves ids/provenance and re-renders", () => {
    const state = initialState();
    const first = state.document!.blocks[0]!;
    const second = state.document!.blocks[1]!;
    const next = workbenchReducer(state, { type: "reordered", blockId: second.id, direction: -1 });
    expect(next.document!.blocks[0]!.id).toBe(second.id);
    expect(next.document!.blocks[1]!.id).toBe(first.id);
    // Provenance moved with the block.
    expect(next.document!.blocks[0]!.provenance).toEqual(second.provenance);
    expect(next.document!.contentHash).not.toBe(state.document!.contentHash);
    // Only the active mode ("document") renders synchronously; web/email are deferred.
    expect(next.outputs.document!.error).toBeNull();
    // web is stale from initial state until lazyRendered fires.
    expect(displayHtml(next, "web").html).toBeTruthy();
  });

  it("ignores out-of-range moves", () => {
    const state = initialState();
    const firstId = state.document!.blocks[0]!.id;
    const lastId = state.document!.blocks[5]!.id;
    expect(workbenchReducer(state, { type: "reordered", blockId: firstId, direction: -1 })).toBe(state);
    expect(workbenchReducer(state, { type: "reordered", blockId: lastId, direction: 1 })).toBe(state);
    expect(workbenchReducer(state, { type: "reordered", blockId: "nope", direction: 1 })).toBe(state);
  });
});

describe("render cache", () => {
  it("reuses cached outputs for identical content and caps at four entries", () => {
    const doc = atlas();
    const first = renderAll(doc, [], "web");
    const htmlA = first.outputs.web!.html;
    expect(first.cache).toHaveLength(3);
    // Re-render same document: cache hit, identical object reuse.
    const second = renderAll(doc, first.cache, "web");
    expect(second.outputs.web).toBe(first.outputs.web);
    expect(htmlA).toBe(second.outputs.web!.html);
    // Render different documents until the cache overflows.
    let cache = second.cache;
    const notes = importSource({ raw: ATLAS_NOTES_SOURCE, label: "notes.md" });
    if (!notes.ok) throw new Error("notes failed");
    cache = renderAll(notes.value, cache, "web").cache;
    expect(cache.length).toBeLessThanOrEqual(RENDER_CACHE_SIZE);
  });
});

describe("renderAll — onlyMode", () => {
  it("renders only the requested mode when onlyMode is set", () => {
    const doc = atlas();
    const result = renderAll(doc, [], "web", "web");
    expect(result.outputs.web!.html).toBeTruthy();
    expect(result.outputs.web!.error).toBeNull();
    // email and document were not rendered.
    expect(result.outputs.email).toBeUndefined();
    expect(result.outputs.document).toBeUndefined();
    expect(result.cache).toHaveLength(1); // Only web was cached.
  });
});

describe("lazyRendered action", () => {
  it("fills in deferred modes without affecting active mode", () => {
    const state = initialState();
    // Simulate a reorder that only rendered the active mode (document).
    const afterReorder = workbenchReducer(state, {
      type: "reordered",
      blockId: state.document!.blocks[1]!.id,
      direction: -1,
    });
    // document was rendered, web/email were not.
    expect(afterReorder.outputs.document!.html).toBeTruthy();
    expect(afterReorder.outputs.web).toBeUndefined();
    expect(afterReorder.outputs.email).toBeUndefined();
    // Now lazy-render the remaining modes.
    const afterLazy = workbenchReducer(afterReorder, {
      type: "lazyRendered",
      outputs: {
        web: afterReorder.outputs.document!, // reuse for test purposes
        email: afterReorder.outputs.document!,
      },
      cache: [],
    });
    expect(afterLazy.outputs.web!.html).toBeTruthy();
    expect(afterLazy.outputs.email!.html).toBeTruthy();
    expect(afterLazy.outputs.document!.html).toBeTruthy();
  });
});

describe("displayHtml — last-good per mode", () => {
  it("falls back to last-good output marked stale", () => {
    const state = initialState();
    const brokenOutputs = { ...state.outputs, web: { ...state.outputs.web!, html: null, error: "boom" } };
    const withBroken = { ...state, outputs: brokenOutputs };
    const shown = displayHtml(withBroken, "web");
    expect(shown.stale).toBe(true);
    expect(shown.html).toContain("Momentum, with room to compound.");
    expect(shown.error).toBe("boom");
  });
});
