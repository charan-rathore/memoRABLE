import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseText } from "@/import/text/parse-text";
import { receiptFor } from "@/components/blocks/brief-receipt";

const SPEC = readFileSync(path.join(__dirname, "../fixtures/engineering-spec.md"), "utf8");
const doc = (() => {
  const r = parseText({ text: SPEC, label: "engineering-spec.md" });
  if (!r.ok) throw new Error("parse failed");
  return r.value;
})();
const meta = (parseStatus: string, pages: number | null = null) => ({
  filename: "spec", fileType: "Markdown", uploadedAt: "now", sizeBytes: SPEC.length, pages, parseStatus,
});

describe("brief receipt", () => {
  it("counts from the evidence contract, and every block is accounted for once", () => {
    const r = receiptFor(doc, SPEC, meta("understood"));
    expect(r.blocks).toBe(doc.blocks.length);
    expect(r.supported + r.judgment + r.unsupported).toBe(r.blocks);
    expect(r.ocr).toBe(false);
  });

  it("points the reader at the first block that needs judgment", () => {
    const r = receiptFor(doc, SPEC, meta("understood"));
    if (r.judgment + r.unsupported > 0) {
      expect(doc.blocks.map((b) => b.id)).toContain(r.firstToReview);
    } else {
      expect(r.firstToReview).toBeNull();
    }
  });

  it("treats an OCR read as needing judgment throughout", () => {
    const r = receiptFor(doc, SPEC, meta("understood - scan text via OCR, check numbers", 18));
    expect(r.ocr).toBe(true);
    expect(r.pages).toBe(18);
    expect(r.supported).toBe(0);
    expect(r.firstToReview).toBe(doc.blocks[0]!.id);
  });
});
