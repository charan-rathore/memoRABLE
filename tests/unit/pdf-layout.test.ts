import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildLayoutDocument, type PdfTextItem } from "@/import/pdf/layout";
import { structureOcrText, mergeOcrIntoMarkdown } from "@/import/pdf/ocr";
import { hybridSegment, buildDocumentGraph } from "@/understanding/segment";

describe("PDF layout reconstruction", () => {
  it(
    "rebuilds headings, lists, and ticket tables from positioned glyphs",
    async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const data = new Uint8Array(readFileSync(resolve("tests/fixtures/indent-po-grn.pdf")));
    const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
    const pageItems: Array<{ page: number; items: PdfTextItem[] }> = [];

    for (let i = 1; i <= doc.numPages; i++) {
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

    const layout = buildLayoutDocument(pageItems);
    expect(layout.markdown).toMatch(/#\s+Product Requirements Document/i);
    expect(layout.markdown).toMatch(/##?\s+Business Context/i);
    expect(layout.markdown).toMatch(/##?\s+Problem Statement/i);
    expect(layout.markdown).toMatch(/##?\s+Key Requirements/i);
    expect(layout.markdown).toMatch(/##?\s+User Stories/i);
    expect(layout.markdown).toMatch(/##?\s+Priority|& Impact Matrix|P0\s*-/i);
    expect(layout.markdown).toMatch(/##?\s+Success Metrics/i);
    expect(layout.markdown).toMatch(/##?\s+Open Questions/i);
    expect(layout.markdown).toMatch(/Cases/i);
    expect(layout.markdown).toMatch(/PSTD-5922/);
    expect(layout.markdown).toMatch(/-\s+No audit trail/i);
    // Must not be the old one-line-per-page flatten.
    expect(layout.markdown.split("\n").length).toBeGreaterThan(40);
  },
    30_000,
  );
});

describe("OCR structuring + merge", () => {
  it("recovers editability rules from the Cases sheet OCR", () => {
    const raw = readFileSync(resolve("tests/fixtures/indent-po-grn-cases-ocr.txt"), "utf8");
    const structured = structureOcrText(raw);
    expect(structured.toLowerCase()).toMatch(/no changes are allowed once the contract is closed/);
    expect(structured).toMatch(/cannot be reduced/i);
    expect(structured).toMatch(/Indent|PO|GRN/);

    const merged = mergeOcrIntoMarkdown(
      "# PRD\n\n## Cases - Sheet\n\n## User Stories\n",
      [{ page: 2, heading: "Cases – Sheet (embedded spreadsheet)", text: structured, confidence: 87 }],
    );
    expect(merged).toMatch(/embedded spreadsheet/i);
    expect(merged.indexOf("Cases – Sheet (embedded spreadsheet)")).toBeGreaterThan(
      merged.indexOf("Cases - Sheet"),
    );
  });
});

describe("hybrid semantic segmentation", () => {
  it("chunks by headings/tables/images, not fixed token windows", () => {
    const source = [
      "# Spec",
      "",
      "## Requirements",
      "",
      "- Must keep an audit trail",
      "- Auto-increment revision numbers",
      "",
      "## Priority Matrix",
      "",
      "| Priority | Feature | Impact |",
      "| --- | --- | --- |",
      "| P0 - Critical | Audit Trail | High |",
      "",
      "<!-- image:page=2 -->",
      "- No changes once closed",
    ].join("\n");

    const { segments } = hybridSegment(source);
    expect(segments.some((s) => s.kind === "section" && /requirements/i.test(s.title ?? ""))).toBe(true);
    expect(segments.some((s) => s.kind === "table")).toBe(true);
    expect(segments.some((s) => s.kind === "image")).toBe(true);

    const graph = buildDocumentGraph(segments);
    expect(graph.nodes.length).toBeGreaterThanOrEqual(3);
    expect(graph.nodes.some((n) => n.type === "table")).toBe(true);
  });
});
