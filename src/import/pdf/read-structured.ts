/**
 * Structured PDF → Markdown pipeline (layout + optional OCR).
 */

import { buildLayoutDocument, type PdfTextItem } from "./layout";
import { extractPageImages, type ExtractedPdfImage } from "./images";
import { mergeOcrIntoMarkdown, ocrImages, type OcrOptions } from "./ocr";

export const PDF_MAX_PAGES = 40;

export interface StructuredPdfResult {
  text: string;
  pages: number;
  truncated: boolean;
  bytes: number;
  images: number;
  ocrBlocks: number;
}

export interface ReadPdfOptions {
  maxPages?: number;
  onProgress?: (percent: number) => void;
  /** Skip OCR (layout only). */
  skipOcr?: boolean;
  ocr?: OcrOptions;
}

async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  }
  // Node/vitest: leave workerSrc unset — pdf.js uses its fake worker.
  return pdfjs;
}

/** Read a PDF from bytes — works in browser and Node. */
export async function readPdfBytes(
  data: Uint8Array,
  options: ReadPdfOptions = {},
): Promise<StructuredPdfResult> {
  const onProgress = options.onProgress;
  const maxPages = options.maxPages ?? PDF_MAX_PAGES;
  onProgress?.(4);

  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const pages = doc.numPages;
  const limit = Math.min(pages, maxPages);
  const pageItems: Array<{ page: number; items: PdfTextItem[] }> = [];
  const images: ExtractedPdfImage[] = [];

  for (let i = 1; i <= limit; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const items: PdfTextItem[] = [];
    for (const item of content.items) {
      if (!("str" in item)) continue;
      items.push({
        str: String(item.str),
        transform: Array.from(item.transform ?? [1, 0, 0, 1, 0, 0]),
        width: Number(item.width ?? 0),
        height: Number(item.height ?? 0),
        hasEOL: Boolean((item as { hasEOL?: boolean }).hasEOL),
      });
    }
    pageItems.push({ page: i, items });

    try {
      const pageImages = await extractPageImages(page, i, pdfjs.OPS);
      images.push(...pageImages);
    } catch {
      /* image extraction is best-effort */
    }

    onProgress?.(4 + Math.round((i / limit) * (options.skipOcr ? 90 : 55)));
  }

  await doc.destroy();

  const layout = buildLayoutDocument(pageItems);
  let markdown = layout.markdown;

  let ocrBlocks = 0;
  if (!options.skipOcr && (images.some((img) => img.png) || options.ocr?.precomputed?.length)) {
    const blocks = await ocrImages(images, {
      ...options.ocr,
      onProgress: (pct) => onProgress?.(60 + Math.round(pct * 0.35)),
    });
    ocrBlocks = blocks.length;
    markdown = mergeOcrIntoMarkdown(markdown, blocks);
  }

  onProgress?.(100);
  const text = markdown.trim();
  if (!text) {
    throw new Error("This PDF has no readable text. Try a text-based PDF, Markdown or plain text.");
  }

  return {
    text,
    pages,
    truncated: pages > maxPages,
    bytes: data.byteLength,
    images: images.length,
    ocrBlocks,
  };
}
