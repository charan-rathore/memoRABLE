/**
 * Hackathon PDF ingest:
 *   1) pdf.js parses in 1–3s → show memories immediately
 *   2) optional background Docling refine (selective, non-blocking)
 *   3) Graphify-schema KG is built in TypeScript on import — never waits on Docling
 */

import { readPdfFile, pdfTruncationNote, type PdfReadResult } from "@/import/read-pdf";
import { parseWithDocGraph } from "./client";
import type { DocGraphParseResult } from "./types";
import {
  isDocgraphEnabled,
  isDoclingRefinementBetter,
  shouldRefineWithDocling,
} from "./select";

export interface ProgressivePdfQuick {
  text: string;
  pages: number;
  truncated: boolean;
  note?: string;
}

export async function readPdfQuick(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<ProgressivePdfQuick> {
  // Digital PDFs: skip OCR on the fast path (matches Docling OCR=OFF).
  const result: PdfReadResult = await readPdfFile(file, onProgress, { skipOcr: true });
  return {
    text: result.text,
    pages: result.truncated ? 40 : result.pages,
    truncated: result.truncated,
    note: result.truncated ? pdfTruncationNote(result.pages) : undefined,
  };
}

/**
 * Fire-and-forget Docling refinement. Call after the fast import has rendered.
 * Invokes `onRefine` only when the selective heuristic matches and quality improves.
 */
export function scheduleDoclingRefine(input: {
  file: File;
  quickText: string;
  pages: number;
  archetype?: string | null;
  beforeBlockCount: number;
  beforeEvidence: number;
  onRefine: (result: DocGraphParseResult) => void | Promise<void>;
  onSkip?: (reason: string) => void;
}): void {
  if (!isDocgraphEnabled()) {
    input.onSkip?.("flag off");
    return;
  }
  if (
    !shouldRefineWithDocling({
      fileName: input.file.name,
      pages: input.pages,
      text: input.quickText,
      archetype: input.archetype,
    })
  ) {
    input.onSkip?.("not selected for Docling");
    return;
  }

  void (async () => {
    try {
      // Parse only — Graphify stays on the TS import path / optional /graph.
      const refined = await parseWithDocGraph(input.file, { graph: false });
      if (!refined?.markdown) {
        input.onSkip?.("Docling unavailable");
        return;
      }
      // Cheap pre-filter: must look like research structure before we re-import.
      const looksResearch =
        /\b(abstract|references|methodology|conclusion|limitations)\b/i.test(refined.markdown) ||
        (input.archetype || "").toLowerCase() === "research";
      if (!looksResearch && input.pages <= 20) {
        input.onSkip?.("Docling result not research-like");
        return;
      }

      // Let the caller re-import; they decide via isDoclingRefinementBetter after projection.
      await input.onRefine(refined);
    } catch {
      input.onSkip?.("Docling failed");
    }
  })();
}

export { isDoclingRefinementBetter, shouldRefineWithDocling, isDocgraphEnabled };
