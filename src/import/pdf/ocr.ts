/**
 * Client/Node OCR for embedded PDF images.
 *
 * Lazy-loads tesseract.js only when an image actually needs reading, so the
 * common text-PDF path pays nothing.
 */

export interface OcrBlock {
  page: number;
  heading: string;
  text: string;
  confidence: number;
}

export interface OcrOptions {
  /** Optional precomputed text — used by tests to avoid live OCR flakiness. */
  precomputed?: ReadonlyArray<{ page: number; text: string; heading?: string }>;
  onProgress?: (percent: number) => void;
}

let workerPromise: Promise<TesseractWorker> | null = null;

interface TesseractWorker {
  recognize: (
    image: BufferSource | string,
  ) => Promise<{ data: { text: string; confidence: number } }>;
  terminate: () => Promise<void>;
}

async function getWorker(): Promise<TesseractWorker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      return (await createWorker("eng", 1, { logger: () => {} })) as unknown as TesseractWorker;
    })();
    const pending = workerPromise;
    void pending.catch(() => {
      // A failed startup is not a reusable worker. Only clear our own attempt.
      if (workerPromise === pending) workerPromise = null;
    });
  }
  return workerPromise;
}

/** Terminate the shared worker (tests / page teardown). */
export async function disposeOcrWorker(): Promise<void> {
  if (!workerPromise) return;
  try {
    const worker = await workerPromise;
    await worker.terminate();
  } catch {
    /* ignore */
  } finally {
    workerPromise = null;
  }
}

const OCR_RECOGNIZE_TIMEOUT_MS = 30_000;
const OCR_RECOGNIZE_TIMEOUT_ERROR = "OCR recognize timed out";

/** Race one recognize against a hard cap so a wedged worker cannot stall the import. */
async function recognizeWithTimeout(
  worker: TesseractWorker,
  png: BufferSource,
): Promise<{ data: { text: string; confidence: number } }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      worker.recognize(png),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(OCR_RECOGNIZE_TIMEOUT_ERROR)),
          OCR_RECOGNIZE_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * OCR image bytes into cleaned Markdown suitable for merging beside the
 * surrounding section ("Cases – Sheet", etc.).
 */
export async function ocrImages(
  images: ReadonlyArray<{ page: number; png: Uint8Array | null; width: number; height: number }>,
  options: OcrOptions = {},
): Promise<OcrBlock[]> {
  if (options.precomputed?.length) {
    return options.precomputed.map((item) => ({
      page: item.page,
      heading: item.heading ?? "Embedded visual",
      text: structureOcrText(item.text),
      confidence: 100,
    }));
  }

  const usable = images
    .filter((img) => img.png && img.png.length > 0)
    // Prefer large captures (tables/spreadsheets) over chrome/logos.
    .slice()
    .sort((a, b) => b.width * b.height - a.width * a.height);

  if (usable.length === 0) return [];

  // Cap work so multi-image decks stay interactive in the browser.
  const MAX_OCR_IMAGES = 6;
  const selected = usable.slice(0, MAX_OCR_IMAGES);

  const blocks: OcrBlock[] = [];

  for (let i = 0; i < selected.length; i++) {
    const image = selected[i]!;
    options.onProgress?.(Math.round(((i + 0.2) / selected.length) * 100));
    // Fetched per image: a hung recognize retires the worker below, and the
    // next image must get a fresh one instead of queueing behind the wedge.
    const worker = await getWorker();
    try {
      const png = Uint8Array.from(image.png!);
      const result = await recognizeWithTimeout(worker, png);
      const text = structureOcrText(result.data.text || "");
      if (text.trim()) {
        blocks.push({
          page: image.page,
          heading: guessImageHeading(text),
          text,
          confidence: result.data.confidence ?? 0,
        });
      }
    } catch (err) {
      // OCR failure must not abort the text pipeline — image is skipped.
      if (err instanceof Error && err.message === OCR_RECOGNIZE_TIMEOUT_ERROR) {
        // A wedged worker never finishes later images either. Retire it so
        // the next image spins up a fresh worker, and reap it in the
        // background (its terminate may itself never settle).
        const stuck = workerPromise;
        workerPromise = null;
        void stuck?.then((w) => w.terminate()).catch(() => {});
      }
    }
    options.onProgress?.(Math.round(((i + 1) / selected.length) * 100));
  }

  return blocks;
}

function guessImageHeading(text: string): string {
  if (/status of contracts|indent|grn|\bpo\b/i.test(text)) {
    return "Cases – Sheet (embedded spreadsheet)";
  }
  return "Embedded visual";
}

/**
 * Turn noisy OCR into scannable Markdown: keep contract status notes and
 * numbered business rules, drop glyph soup.
 */
export function structureOcrText(raw: string): string {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const out: string[] = [];
  const rules: string[] = [];

  for (const line of lines) {
    if (/^status of contracts/i.test(line)) {
      out.push(`**${line.replace(/:$/, "")}**`);
      continue;
    }
    if (/^note:/i.test(line) || /no changes are allowed once the contract is closed/i.test(line)) {
      out.push(`- ${line.replace(/^note:\s*/i, "Note: ")}`);
      continue;
    }
    if (/^(indent|po|grn)\s*:/i.test(line)) {
      out.push(`- ${line}`);
      continue;
    }
    const numbered = /^(?:\d+\.|[●•-])\s*(.+)$/.exec(line);
    if (numbered && numbered[1]!.length > 20) {
      rules.push(numbered[1]!);
      continue;
    }
    if (
      /(cannot be (edited|reduced)|removal allowed|impacts delay|backward compatibility|advance is paid)/i.test(
        line,
      ) &&
      line.length > 24
    ) {
      rules.push(line);
      continue;
    }
    if (/^(project|module|contract|fields)\b/i.test(line) && line.length < 80) continue;
    if (/^[NYv|=\-]+$/i.test(line)) continue;
  }

  if (rules.length > 0) {
    out.push("");
    out.push("**Editability rules recovered from spreadsheet**");
    for (const rule of dedupe(rules)) out.push(`- ${rule}`);
  }

  if (out.length === 0) {
    // Fall back to cleaned paragraphs so evidence is never silently dropped.
    return lines.filter((l) => l.length > 12).slice(0, 40).map((l) => `- ${l}`).join("\n");
  }
  return out.join("\n");
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase().replace(/\s+/g, " ").slice(0, 120);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** Merge OCR blocks into layout Markdown beside the matching page/section. */
export function mergeOcrIntoMarkdown(markdown: string, blocks: readonly OcrBlock[]): string {
  if (blocks.length === 0) return markdown;

  let result = markdown;
  for (const block of blocks) {
    const section = [
      "",
      `## ${block.heading}`,
      "",
      `<!-- image:page=${block.page} confidence=${Math.round(block.confidence)} -->`,
      "",
      block.text,
      "",
    ].join("\n");

    const pageMark = `<!-- page:${block.page} -->`;
    const casesHeading = /^(#{1,3}\s+Cases\b[^\n]*)/im;
    if (casesHeading.test(result)) {
      result = result.replace(casesHeading, `$1\n${section}`);
      continue;
    }
    if (result.includes(pageMark)) {
      result = result.replace(pageMark, `${pageMark}\n${section}`);
      continue;
    }
    result += `\n${section}`;
  }
  return result;
}
