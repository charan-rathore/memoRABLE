/**
 * Client-side PDF → text. First 40 pages only — intentional product limit.
 * Uses pdf.js without a worker so nothing leaves the browser.
 */

export const PDF_MAX_PAGES = 40;

export interface PdfReadResult {
  text: string;
  pages: number;
  truncated: boolean;
  bytes: number;
}

export function isPdfFile(file: File): boolean {
  if (file.type === "application/pdf") return true;
  return /\.pdf$/i.test(file.name);
}

export async function readPdfFile(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<PdfReadResult> {
  const data = new Uint8Array(await file.arrayBuffer());
  onProgress?.(8);

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Local worker (copied to /public) — nothing leaves the browser, CSP-safe.
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const pages = doc.numPages;
  const limit = Math.min(pages, PDF_MAX_PAGES);
  const chunks: string[] = [];

  for (let i = 1; i <= limit; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const line = content.items
      .map((item) => ("str" in item ? String(item.str) : ""))
      .filter(Boolean)
      .join(" ");
    if (line.trim()) chunks.push(line.trim());
    onProgress?.(8 + Math.round((i / limit) * 90));
  }

  await doc.destroy();
  onProgress?.(100);

  const text = chunks.join("\n\n").trim();
  if (!text) {
    throw new Error("This PDF has no readable text. Try a text-based PDF, Markdown or plain text.");
  }

  return {
    text,
    pages,
    truncated: pages > PDF_MAX_PAGES,
    bytes: file.size,
  };
}

export function pdfTruncationNote(pages: number): string {
  return `Only the first ${PDF_MAX_PAGES} of ${pages} pages are remembered. Need more? Split the document.`;
}
