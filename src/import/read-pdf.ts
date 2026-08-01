/**
 * Client-side PDF → structured text. First 40 pages only — intentional product limit.
 * Layout-aware reconstruction + OCR for embedded images (RFC Stages 1–2).
 */

import {
  PDF_MAX_PAGES,
  readPdfBytes,
  type ReadPdfOptions,
  type StructuredPdfResult,
} from "./pdf/read-structured";

export { PDF_MAX_PAGES };
export type { StructuredPdfResult as PdfReadResult };

export function isPdfFile(file: File): boolean {
  if (file.type === "application/pdf") return true;
  return /\.pdf$/i.test(file.name);
}

export async function readPdfFile(
  file: File,
  onProgress?: (percent: number) => void,
  options: Omit<ReadPdfOptions, "onProgress"> = {},
): Promise<StructuredPdfResult> {
  const data = new Uint8Array(await file.arrayBuffer());
  return readPdfBytes(data, { ...options, onProgress });
}

/** Node/tests entry: read from a path or byte buffer. */
export async function readPdfBuffer(
  data: Uint8Array,
  options: ReadPdfOptions = {},
): Promise<StructuredPdfResult> {
  return readPdfBytes(data, options);
}

export function pdfTruncationNote(pages: number): string {
  return `Only the first ${PDF_MAX_PAGES} of ${pages} pages are remembered. Need more? Split the document.`;
}
