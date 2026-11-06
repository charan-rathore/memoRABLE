import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildLayoutDocument,
  joinSoftWrap,
  reconstructPageLines,
  type PdfTextItem,
} from "@/import/pdf/layout";

/**
 * Source-fidelity regression from the production gauntlet (9 public research
 * PDFs uploaded through the real app, outputs compared against the sources).
 * Fixtures are the exact uploaded bytes:
 *  - bitcoin-whitepaper.pdf  sha1 8de2fdb04edce612... bitcoin.org/bitcoin.pdf
 *  - dqn-atari.pdf           sha1 667fb84bfca10bec... arXiv:1312.5602
 */

async function layoutMarkdown(fixture: string, maxPages = 3): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(readFileSync(resolve("tests/fixtures", fixture)));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const pageItems: Array<{ page: number; items: PdfTextItem[] }> = [];
  const pages = Math.min(doc.numPages, maxPages);
  for (let i = 1; i <= pages; i++) {
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
      });
    }
    pageItems.push({ page: i, items });
  }
  await doc.destroy();
  return buildLayoutDocument(pageItems).markdown;
}

const T = (str: string, x: number, y: number, w = 100, h = 10): PdfTextItem => ({
  str,
  transform: [1, 0, 0, 1, x, y],
  width: w,
  height: h,
});

describe("gauntlet source fidelity", () => {
  it("preserves inline arXiv citations (mid-page, horizontal)", () => {
    const items: PdfTextItem[] = [
      T("Some Paper Title", 100, 700, 300, 14),
      T("Prior work builds on", 100, 600, 160),
      T("the approach of", 100, 580, 120),
      T("arXiv:1406.2661", 230, 580, 90),
      T("applied widely.", 330, 580, 110),
      T("More body prose follows here.", 100, 560, 200),
    ];
    const md = buildLayoutDocument([{ page: 1, items }]).markdown;
    expect(md).toContain("arXiv:1406.2661");
  });

  it("drops a topmost-row running header with its date/category tokens", () => {
    const items: PdfTextItem[] = [
      T("arXiv:1406.2661v2", 350, 750, 90),
      T("[cs.LG]", 450, 750, 40),
      T("6 Jun 2015", 500, 750, 60),
      T("Body prose begins on this page.", 100, 700, 220),
      T("And continues here.", 100, 680, 150),
    ];
    const md = buildLayoutDocument([{ page: 2, items }]).markdown;
    expect(md).not.toMatch(/arXiv:/i);
    expect(md).not.toContain("[cs.LG]");
    expect(md).not.toContain("6 Jun 2015");
    expect(md).toContain("Body prose begins on this page.");
  });

  it("drops a rotated page-1 margin stamp", () => {
    const items: PdfTextItem[] = [
      { str: "arXiv:1312.5602v1 [cs.LG] 19 Dec 2013", transform: [0, 1, -1, 0, 32, 237], width: 200, height: 8 },
      T("similar tech-", 108, 238.5, 300),
      T("niques could also help.", 108, 227.5, 300),
    ];
    const md = buildLayoutDocument([{ page: 1, items }]).markdown;
    expect(md).toMatch(/similar techniques could also help/);
    expect(md).not.toMatch(/arXiv:/i);
  });

  it("keeps wrapped compound chains: peer- + to-peer stays peer-to-peer", () => {
    expect(joinSoftWrap("A purely peer-", "to-peer version")).toBe("A purely peer-to-peer version");
    expect(joinSoftWrap("kept up-", "to-date records")).toBe("kept up-to-date records");
    // Review-driven controls: a syllable wrap into a compound-start must still join.
    expect(joinSoftWrap("inter-", "net-based model")).toBe("internet-based model");
    expect(joinSoftWrap("docu-", "ment-level API")).toBe("document-level API");
    // Existing behavior must not regress: syllable wraps still join.
    expect(joinSoftWrap("zeo-", "lite synthesis")).toBe("zeolite synthesis");
    expect(joinSoftWrap("funda-", "mental question")).toBe("fundamental question");
    expect(joinSoftWrap("domain-", "specific task")).toBe("domain-specific task");
  });

  it("bitcoin abstract keeps peer-to-peer", async () => {
    const md = await layoutMarkdown("bitcoin-whitepaper.pdf", 1);
    expect(md).toContain("peer-to-peer");
    expect(md).not.toContain("peerto-peer");
  }, 30_000);

  it("math subscripts attach to their base instead of splicing into prose", async () => {
    const data = new Uint8Array(readFileSync(resolve("tests/fixtures/gan.pdf")));
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
    const page = await doc.getPage(3);
    const content = await page.getTextContent();
    const items: PdfTextItem[] = [];
    for (const item of content.items) {
      if (!("str" in item)) continue;
      items.push({
        str: String(item.str),
        transform: Array.from(item.transform ?? [1, 0, 0, 1, 0, 0]),
        width: Number(item.width ?? 0),
        height: Number(item.height ?? 0),
      });
    }
    await doc.destroy();
    const md = buildLayoutDocument([{ page: 3, items }]).markdown;
    expect(md).toMatch(/p_g\s*=\s*p_data/);
    expect(md).toMatch(/We will then show/);
    expect(md).not.toMatch(/We will\s+g\s+data\s+then show/);
  }, 30_000);

  it("script picks the cleanly abutting base over an overlapping one", () => {
    // "bb" ends exactly at the script's left edge; "aa" ends 0.5pt past it.
    const items: PdfTextItem[] = [
      T("bb", 90, 500, 20),
      T("aa", 100, 500, 10.7),
      T("2", 110.2, 498.5, 3, 6),
      T("Body text above.", 100, 530, 200),
      T("Body text below.", 100, 470, 200),
    ];
    const md = buildLayoutDocument([{ page: 1, items }]).markdown;
    expect(md).toContain("bb_2");
    expect(md).not.toContain("aa_2");
  });

  it("multiple scripts on one base compose deterministically regardless of extraction order", () => {
    const base = T("x", 100, 500, 5);
    const sup = T("2", 105.3, 502, 3, 6); // superscript: y above baseline
    const sub = T("i", 105.1, 498, 3, 6); // subscript: y below baseline
    const pad = [T("Pad above.", 100, 530, 200), T("Pad below.", 100, 470, 200)];
    const md1 = buildLayoutDocument([{ page: 1, items: [base, sup, sub, ...pad] }]).markdown;
    const md2 = buildLayoutDocument([{ page: 1, items: [base, sub, sup, ...pad] }]).markdown;
    expect(md1).toBe(md2);
    expect(md1).toMatch(/x[_^][a-z0-9][_^][a-z0-9]/);
  });

  it("two-column pages keep columns separate: no cross-column wrap splice", async () => {
    const md = await layoutMarkdown("p18-short2.pdf", 5);
    expect(md).toContain("mapping frequent words to distinct matrices");
    expect(md).not.toMatch(/we ping frequent words/);
    expect(md).not.toMatch(/map-\s*K\. As K increases/);
  }, 30_000);

  it("right-column hanging indents stay in the right column (gutter straddle control)", () => {
    // Left column x=80 w=170 (right edge 250); dominant right starts x=310
    // w=200; a minority of right-column lines hang at x=260 w=240.
    // 20 lines per column (left right-edges <= 226); 6 right-column lines
    // hang at x=240 (a substantial minority, per review). The lowest-mass-bin
    // rule cuts at ~260 and files them left; the straddle sweep keeps them
    // right.
    const items: PdfTextItem[] = [];
    let y = 900;
    for (let i = 0; i < 20; i++) {
      const jitter = (i % 4) * 7; // real pages do not share one exact left edge
      items.push(T(`Left column line number ${i} of the body text.`, 80 + jitter, y, 125));
      items.push(T(`Right column line number ${i} of the body text.`, 310 - jitter, y, 180));
      y -= 14;
    }
    for (let i = 0; i < 6; i++) {
      items.push(T(`Hanging indent right line ${i} continues far right.`, 240, y, 200));
      y -= 14;
    }
    const lines = reconstructPageLines(1, items);
    const hanging = lines.filter((l) => l.text.includes("Hanging indent"));
    expect(hanging.length).toBe(6);
    for (const l of hanging) expect(l.column).toBe("right");
    const leftLines = lines.filter((l) => l.column === "left");
    for (const l of leftLines) expect(l.text).toContain("Left column line");
  });

  it("short right-column outdents ending before the right peak stay right", () => {
    // Review B1 counterexample: short outdented runs straddle nothing, so
    // straddle count alone cuts right of them; clearance keeps them right.
    const items: PdfTextItem[] = [];
    let y = 900;
    for (let i = 0; i < 20; i++) {
      const jitter = (i % 4) * 7;
      items.push(T(`Left column line number ${i} of the body text.`, 80 + jitter, y, 125));
      items.push(T(`Right column line number ${i} of the body text.`, 310 - jitter, y, 180));
      y -= 14;
    }
    for (let i = 0; i < 6; i++) {
      items.push(T(`Short outdent ${i}.`, 240, y, 45));
      y -= 14;
    }
    const lines = reconstructPageLines(1, items);
    const outdents = lines.filter((l) => l.text.includes("Short outdent"));
    expect(outdents.length).toBe(6);
    for (const l of outdents) expect(l.column).toBe("right");
  });

  it("arXiv running headers never interleave into body prose", async () => {
    const md = await layoutMarkdown("dqn-atari.pdf", 2);
    expect(md).toMatch(/similar techniques could also be beneficial/);
    expect(md).not.toMatch(/techarXiv/i);
    expect(md).not.toMatch(/arXiv:\d{4}\.\d{4,5}v?\d*\s+\[cs\.LG\]\s+19 Dec 2013\s+niques/i);
  }, 30_000);
});
