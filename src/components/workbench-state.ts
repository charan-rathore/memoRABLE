import type { Diagnostic } from "@/reliability/diagnostics";
import type { MemoryDocument } from "@/domain/memory/schema";
import { reorderBlocks } from "@/domain/memory/normalize";
import { renderMode, type ModeOutput } from "@/render/render-bundle";
import { OUTPUT_MODES, type OutputMode } from "@/domain/memory/types";

/**
 * Workbench state — a pure, framework-free core so every transition is
 * unit-testable: all-or-nothing imports, per-mode last-good outputs,
 * four-entry render cache, and id-preserving reorders.
 */

export interface RenderCacheEntry {
  key: string;
  output: ModeOutput;
}

export const RENDER_CACHE_SIZE = 4;

export interface WorkbenchState {
  /** Current source text (preserved verbatim after failed imports). */
  sourceText: string;
  sourceLabel: string;
  /** Canonical document. Null only before the first successful import. */
  document: MemoryDocument | null;
  /** Rendered output per mode (may contain per-mode errors). */
  outputs: Partial<Record<OutputMode, ModeOutput>>;
  /** Last fully-successful output per mode — survives later failures. */
  lastGood: Partial<Record<OutputMode, ModeOutput>>;
  /** Errors of the most recent failed import (empty when healthy). */
  errors: Diagnostic[];
  mode: OutputMode;
  selectedBlockId: string | null;
  /** Wall-clock label of the last successful import, for the journey strip. */
  importedAt: string | null;
  publishedAt: string | null;
  cache: RenderCacheEntry[];
}

export type WorkbenchAction =
  | { type: "imported"; sourceText: string; sourceLabel: string; document: MemoryDocument; at: string }
  | { type: "importFailed"; sourceText: string; sourceLabel: string; errors: Diagnostic[] }
  | { type: "reordered"; blockId: string; direction: -1 | 1 }
  | { type: "modeChanged"; mode: OutputMode }
  | { type: "blockSelected"; blockId: string | null }
  | { type: "sourceEdited"; sourceText: string }
  | { type: "published"; at: string }
  | { type: "publishClosed" }
  | {
      type: "restored";
      snapshot: {
        sourceText: string;
        sourceLabel: string;
        document: MemoryDocument | null;
        outputs: Partial<Record<OutputMode, ModeOutput>>;
        lastGood: Partial<Record<OutputMode, ModeOutput>>;
        mode: OutputMode;
      };
    }
  | { type: "lazyRendered"; outputs: Partial<Record<OutputMode, ModeOutput>>; cache: RenderCacheEntry[] };

export function initialWorkbenchState(init: {
  sourceText: string;
  sourceLabel: string;
  document: MemoryDocument;
  outputs: Record<OutputMode, ModeOutput>;
  at: string;
}): WorkbenchState {
  return {
    sourceText: init.sourceText,
    sourceLabel: init.sourceLabel,
    document: init.document,
    outputs: init.outputs,
    lastGood: pickGood(init.outputs),
    errors: [],
    mode: "document",
    selectedBlockId: null,
    importedAt: init.at,
    publishedAt: null,
    cache: [],
  };
}

function pickGood(outputs: Partial<Record<OutputMode, ModeOutput>>): Partial<Record<OutputMode, ModeOutput>> {
  const good: Partial<Record<OutputMode, ModeOutput>> = {};
  for (const mode of OUTPUT_MODES) {
    const output = outputs[mode];
    if (output && output.html !== null && output.error === null) good[mode] = output;
  }
  return good;
}

export function workbenchReducer(state: WorkbenchState, action: WorkbenchAction): WorkbenchState {
  switch (action.type) {
    case "imported": {
      // Render only the active-preferred mode synchronously; the other two
      // modes are deferred so the UI responds before the heavy Elements SSR.
      const preferred: OutputMode = "web";
      const { outputs, cache } = renderAll(action.document, state.cache, preferred, preferred);
      return {
        ...state,
        sourceText: action.sourceText,
        sourceLabel: action.sourceLabel,
        document: action.document,
        outputs,
        lastGood: { ...state.lastGood, ...pickGood(outputs) },
        errors: [],
        mode: preferred,
        selectedBlockId: null,
        importedAt: action.at,
        publishedAt: null,
        cache,
      };
    }
    case "importFailed": {
      // All-or-nothing: the source is preserved, the last-good document and
      // every successful output stay exactly as they were.
      return {
        ...state,
        sourceText: action.sourceText,
        sourceLabel: action.sourceLabel,
        errors: action.errors,
      };
    }
    case "reordered": {
      if (!state.document) return state;
      const ids = state.document.blocks.map((b) => b.id);
      const index = ids.indexOf(action.blockId);
      const target = index + action.direction;
      if (index === -1 || target < 0 || target >= ids.length) return state;
      const nextIds = [...ids];
      [nextIds[index], nextIds[target]] = [nextIds[target]!, nextIds[index]!];
      const reordered = reorderBlocks(state.document, nextIds);
      // Only render the active mode synchronously; defer the other two.
      const { outputs, cache } = renderAll(reordered, state.cache, state.mode, state.mode);
      return {
        ...state,
        document: reordered,
        outputs,
        lastGood: { ...state.lastGood, ...pickGood(outputs) },
        publishedAt: null,
        cache,
      };
    }
    case "modeChanged":
      return { ...state, mode: action.mode };
    case "blockSelected":
      return { ...state, selectedBlockId: action.blockId };
    case "sourceEdited":
      return { ...state, sourceText: action.sourceText };
    case "published":
      return { ...state, publishedAt: action.at };
    case "publishClosed":
      return { ...state, publishedAt: null };
    case "restored":
      return {
        ...state,
        sourceText: action.snapshot.sourceText,
        sourceLabel: action.snapshot.sourceLabel,
        document: action.snapshot.document,
        outputs: action.snapshot.outputs,
        lastGood: action.snapshot.lastGood,
        mode: action.snapshot.mode,
        errors: [],
        selectedBlockId: null,
      };
    case "lazyRendered":
      return {
        ...state,
        outputs: { ...state.outputs, ...action.outputs },
        lastGood: { ...state.lastGood, ...pickGood(action.outputs) },
        cache: action.cache,
      };
    default:
      return state;
  }
}

/**
 * Render modes with the active mode first, using the four-entry cache.
 * When `onlyMode` is provided, only that mode is rendered synchronously;
 * the caller is expected to render the remaining modes later via
 * `lazyRendered`. This keeps imports and reorders responsive.
 */
export function renderAll(
  doc: MemoryDocument,
  cache: RenderCacheEntry[],
  activeMode: OutputMode,
  onlyMode?: OutputMode,
): { outputs: Record<OutputMode, ModeOutput>; cache: RenderCacheEntry[] } {
  const orderedModes = onlyMode
    ? [onlyMode]
    : [activeMode, ...OUTPUT_MODES.filter((m) => m !== activeMode)];
  const outputs = {} as Record<OutputMode, ModeOutput>;
  let nextCache = [...cache];
  for (const mode of orderedModes) {
    const key = `${doc.contentHash}:${mode}`;
    const hit = nextCache.find((e) => e.key === key);
    if (hit) {
      outputs[mode] = hit.output;
      nextCache = [hit, ...nextCache.filter((e) => e.key !== key)];
    } else {
      const output = renderMode(doc, mode);
      outputs[mode] = output;
      nextCache = [{ key, output }, ...nextCache].slice(0, RENDER_CACHE_SIZE);
    }
  }
  return { outputs, cache: nextCache };
}

/** The HTML to show for a mode: current output, else last-good, else null. */
export function displayHtml(state: WorkbenchState, mode: OutputMode): { html: string | null; stale: boolean; error: string | null } {
  const current = state.outputs[mode];
  if (current?.html) return { html: current.html, stale: false, error: current.error };
  const good = state.lastGood[mode];
  if (good?.html) return { html: good.html, stale: true, error: current?.error ?? null };
  return { html: null, stale: false, error: current?.error ?? "This output couldn't be rendered." };
}
