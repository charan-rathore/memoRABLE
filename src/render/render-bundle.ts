import { renderToHtml, renderToJson } from "@unlayer/react-elements";
import type { MemoryDocument } from "@/domain/memory/schema";
import { OUTPUT_MODES, type OutputMode } from "@/domain/memory/types";
import { buildRoot } from "./build-root";
import { validateDesignJson, type DesignJsonSummary } from "./compatibility";
import type { PublishThemeId } from "./themes";
import { resolveTheme } from "./themes";

/**
 * Independent render bundle (reliability layer 6). Each mode renders on its
 * own: one mode's failure never removes the successful outputs, and the
 * per-mode last-good output is kept by the caller.
 */

export interface ModeOutput {
  mode: OutputMode;
  html: string | null;
  error: string | null;
  /** True when at least one block used the safe recovery row. */
  usedRecoveryRows: boolean;
  designJson: unknown | null;
  designJsonSummary: DesignJsonSummary | null;
  designJsonError: string | null;
}

export interface RenderBundle {
  contentHash: string;
  title: string;
  blockCount: number;
  outputs: Record<OutputMode, ModeOutput>;
}

/** Render every mode independently. Never throws. */
export function renderBundle(doc: MemoryDocument): RenderBundle {
  const outputs = {} as Record<OutputMode, ModeOutput>;
  for (const mode of OUTPUT_MODES) {
    outputs[mode] = renderMode(doc, mode);
  }
  return {
    contentHash: doc.contentHash,
    title: doc.title,
    blockCount: doc.blocks.length,
    outputs,
  };
}

/** Render a single mode (HTML + validated design JSON). Never throws. */
export function renderMode(
  doc: MemoryDocument,
  mode: OutputMode,
  themeId: PublishThemeId = "editorial",
): ModeOutput {
  const base: ModeOutput = {
    mode,
    html: null,
    error: null,
    usedRecoveryRows: false,
    designJson: null,
    designJsonSummary: null,
    designJsonError: null,
  };
  try {
    const built = buildRoot(doc, mode, resolveTheme(themeId));
    base.usedRecoveryRows = built.blocks.some((b) => b.recovered);
    base.html = renderToHtml(built.root);
    try {
      const json = renderToJson(built.root);
      const validation = validateDesignJson(json);
      if (validation.ok) {
        base.designJson = json;
        base.designJsonSummary = validation.value;
      } else {
        base.designJsonError = validation.errors[0]?.message ?? "Design JSON is not compatible.";
      }
    } catch (jsonError) {
      base.designJsonError = jsonError instanceof Error ? jsonError.message : String(jsonError);
    }
  } catch (error) {
    base.error = error instanceof Error ? error.message : String(error);
  }
  return base;
}

/**
 * Minimal safe output used when a mode fails and no last-good output exists.
 * Contains no imported content.
 */
export function minimalFallbackHtml(title: string): string {
  const escaped = title.replace(/[&<>"']/g, (ch) =>
    ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : ch === '"' ? "&quot;" : "&#39;",
  );
  return [
    "<!DOCTYPE html>",
    '<html lang="en"><head><meta charset="utf-8"><title>' + escaped + "</title></head>",
    '<body style="font-family:-apple-system,Arial,sans-serif;background:#FAF9F5;color:#14130F;padding:48px;line-height:1.5">',
    "<h1>" + escaped + "</h1>",
    "<p>This output couldn't be rendered. Your source and the other outputs are unaffected.</p>",
    "</body></html>",
  ].join("");
}
