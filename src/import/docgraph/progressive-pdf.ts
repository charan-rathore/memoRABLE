/**
 * Product PDF ingest:
 *   1) pdf.js layout parse → memories quickly
 *   2) Selective OCR for embedded images (spreadsheets/screenshots) — pure
 *      text PDFs skip OCR work because no PNG payloads exist
 *   3) optional background Docling refine (selective, non-blocking)
 *   4) Graphify-schema KG is built in TypeScript on import — never waits on Docling
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
  /** Embedded images detected in the PDF (including those without OCR text). */
  images?: number;
  /** Successful OCR blocks merged into markdown. */
  ocrBlocks?: number;
}

export async function readPdfQuick(
  file: File,
  onProgress?: (percent: number) => void,
  options: { skipOcr?: boolean } = {},
): Promise<ProgressivePdfQuick> {
  // Default: OCR on. Pure text PDFs pay nothing (no PNGs). Spreadsheet
  // screenshots (Indent Cases sheet, etc.) become first-class evidence.
  const result: PdfReadResult = await readPdfFile(file, onProgress, {
    skipOcr: options.skipOcr === true,
  });
  return {
    text: result.text,
    pages: result.truncated ? 40 : result.pages,
    truncated: result.truncated,
    note: composePdfReadNote(result),
    images: result.images,
    ocrBlocks: result.ocrBlocks,
  };
}

/**
 * User-facing provenance when any text came from OCR of a scan or photo.
 * States the origin and tells the user to check names and numbers against
 * the original; never presents OCR output as preserved, validated, or
 * backed by a confidence score.
 */
export function ocrProvenanceNote(ocrBlocks: number): string | undefined {
  if (ocrBlocks <= 0) return undefined;
  return "Part of this PDF was read from a scan or photo using OCR. Check names and numbers against the original before relying on them.";
}

/**
 * User-facing reading notes for a quick PDF pass: truncation, OCR
 * provenance, and the empty-text case where nothing could be read at all.
 * Notes state what happened and what to check; they never claim the
 * extracted text is preserved, validated, or confidence-backed.
 */
/** True when extracted PDF text has real content, not only page markers. */
export function hasReadablePdfText(text: string): boolean {
  return text.replace(/<!--\s*page:\d+\s*-->/g, "").trim() !== "";
}

export function composePdfReadNote(result: {
  text: string;
  pages: number;
  truncated: boolean;
  ocrBlocks?: number;
}): string | undefined {
  const parts: string[] = [];
  if (result.truncated) parts.push(pdfTruncationNote(result.pages));
  const ocr = ocrProvenanceNote(result.ocrBlocks ?? 0);
  if (ocr) {
    parts.push(ocr);
  } else if (!hasReadablePdfText(result.text)) {
    parts.push("No readable text found in this PDF. If it is a scan or photo, its text could not be read.");
  }
  return parts.length ? parts.join(" ") : undefined;
}

/**
 * Reading note to carry across a Docling refinement. A refine is accepted on
 * structural heuristics only; it never proves scan/OCR limitations are gone.
 * Keep the no-text note while the refined output still has no readable text,
 * and keep the verify-numbers warning whenever the quick pass used OCR.
 */
export function refinedReadNote(
  quick: { note?: string; ocrBlocks?: number },
  refinedMarkdown: string,
): string | undefined {
  const refinedEmpty = !hasReadablePdfText(refinedMarkdown);
  if (refinedEmpty) return quick.note;
  return ocrProvenanceNote(quick.ocrBlocks ?? 0);
}

/**
 * Fire-and-forget Docling refinement. Call after the fast import has rendered.
 * Invokes `onRefine` only when the selective heuristic matches and quality improves.
 */
export function scheduleDoclingRefine(input: {
  file: File;
  signal?: AbortSignal;
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
      const refined = await parseWithDocGraph(input.file, { graph: false, signal: input.signal });
      if (input.signal?.aborted) return;
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
