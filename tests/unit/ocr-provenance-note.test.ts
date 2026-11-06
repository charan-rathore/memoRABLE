import { describe, expect, it } from "vitest";
import { composePdfReadNote, ocrProvenanceNote } from "@/import/docgraph/progressive-pdf";

describe("ocrProvenanceNote", () => {
  it("warns when OCR blocks were used, without claiming fidelity", () => {
    const note = ocrProvenanceNote(2);
    expect(note).toBeTruthy();
    expect(note).toMatch(/scan|photo/i);
    expect(note).toMatch(/OCR/);
    expect(note).toMatch(/check|verify/i);
    expect(note).toMatch(/number/i);
    // Never presents OCR output as preserved, validated, or confidence-backed.
    expect(note).not.toMatch(/preserved|validated|verified correct|accuracy|confidence/i);
  });

  it("stays silent for pure text PDFs", () => {
    expect(ocrProvenanceNote(0)).toBeUndefined();
  });
});

describe("composePdfReadNote", () => {
  const base = { pages: 3, truncated: false, ocrBlocks: 0 };

  it("is undefined for a clean text PDF", () => {
    expect(composePdfReadNote({ ...base, text: "hello world" })).toBeUndefined();
  });

  it("warns when the PDF has no readable text at all", () => {
    const note = composePdfReadNote({ ...base, text: "   " });
    expect(note).toMatch(/[Nn]o readable text/);
    const markerOnly = composePdfReadNote({ ...base, text: "<!-- page:1 -->\n<!-- page:2 -->" });
    expect(markerOnly).toMatch(/[Nn]o readable text/);
    expect(note).toMatch(/[Nn]o readable text/);
    expect(note).toMatch(/scan or photo/);
    expect(note).not.toMatch(/preserved|validated|confidence/i);
  });

  it("combines truncation, OCR and no-text notes without duplication", () => {
    const note = composePdfReadNote({ pages: 90, truncated: true, ocrBlocks: 2, text: "partial" })!;
    expect(note).toMatch(/scan or photo/);
    expect(note).toMatch(/[Cc]heck names and numbers/);
  });

  it("OCR note still wins over the no-text note when blocks produced text", () => {
    const note = composePdfReadNote({ ...base, text: "", ocrBlocks: 1 })!;
    expect(note).toMatch(/[Cc]heck names and numbers/);
    expect(note).not.toMatch(/[Nn]o readable text/);
  });
});
