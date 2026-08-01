import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { readPdfBuffer } from "../src/import/read-pdf";
import { importSource } from "../src/import/import-source";

async function main() {
  const bytes = new Uint8Array(readFileSync(resolve("tests/fixtures/indent-po-grn.pdf")));
  const ocrText = readFileSync(resolve("tests/fixtures/indent-po-grn-cases-ocr.txt"), "utf8");
  const pdf = await readPdfBuffer(bytes, {
    ocr: { precomputed: [{ page: 2, heading: "Cases – Sheet (embedded spreadsheet)", text: ocrText }] },
  });

  mkdirSync("tmp", { recursive: true });
  writeFileSync("tmp/indent-po-grn-parsed.txt", pdf.text);

  const result = importSource({ raw: pdf.text, label: "PRD for Indent_PO_GRN.pdf" });
  if (!result.ok) {
    console.error(result);
    process.exit(1);
  }
  const doc = result.value;
  writeFileSync("tmp/indent-po-grn-memories.json", JSON.stringify(doc, null, 2));

  for (const b of doc.blocks) {
    const p = b.payload as {
      summary?: string;
      hook?: string;
      notes?: string[];
      entries?: Array<Record<string, unknown>>;
    };
    console.log(`\n==== ${b.kind} (${b.provenance.locator}) ====`);
    if (p.summary) console.log("summary:", p.summary.slice(0, 280));
    if (p.hook) console.log("hook:", p.hook);
    for (const e of (p.entries ?? []).slice(0, 20)) console.log(" -", JSON.stringify(e));
    if (p.notes?.length) {
      console.log("notes count", p.notes.length);
      for (const n of p.notes.slice(0, 25)) console.log("  note:", n.slice(0, 160));
    }
  }

  // Presence checks for the richness the user cares about.
  const blob = JSON.stringify(doc).toLowerCase();
  const checks = [
    ["user story / persona", /user story|as a |purchase manager|site engineer/],
    ["cases sheet rules", /cannot be reduced|no changes are allowed|contract is closed/],
    ["priority p0/p1", /\bp0\b|\bp1\b/],
    ["open questions", /open question|who owns|unresolved|\?/],
    ["decision status", /approved|proposed|committed|considered|requested/],
    ["acceptance criteria", /acceptance|given |when |then /],
    ["metrics", /adoption|efficien|satisfaction|traceable/],
    ["tickets", /pstd-\d+/],
  ] as const;
  console.log("\n==== richness checks ====");
  for (const [name, re] of checks) {
    console.log(re.test(blob) ? "OK " : "MISS", name);
  }
}

main();
