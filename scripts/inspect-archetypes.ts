/**
 * Manual-inspection dump for archetype memory quality.
 * Run: npx tsx scripts/inspect-archetypes.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { importSource } from "../src/import/import-source";
import { classifyArchetype } from "../src/understanding/archetype";

const CASES = [
  "resume.md",
  "prd.md",
  "research.md",
  "invoice.md",
  "meeting.md",
  "policy.md",
  "ticket.md",
  "menu.md",
  "job.md",
  "slides.md",
] as const;

const outDir = resolve("tmp/archetype-inspection");
mkdirSync(outDir, { recursive: true });

const reports = [];

for (const file of CASES) {
  const text = readFileSync(resolve(`tests/fixtures/archetypes/${file}`), "utf8");
  const result = importSource({ raw: text, label: file });
  if (!result.ok) {
    reports.push({ file, error: result.errors });
    console.log(`FAIL ${file}`);
    continue;
  }
  const doc = result.value;
  const arch = classifyArchetype({ title: doc.title, headings: [], bodySample: text });
  const blocks: Record<string, unknown> = {};
  for (const b of doc.blocks) {
    blocks[b.kind] = {
      provenance: b.provenance,
      payload: b.payload,
    };
  }
  const report = {
    file,
    title: doc.title,
    archetype: arch.archetype,
    timelineMode: arch.timelineMode,
    suppressWeakTimeline: arch.suppressWeakTimeline,
    warnings: doc.warnings,
    blocks,
    sourceText: text,
  };
  reports.push(report);
  writeFileSync(resolve(outDir, file.replace(".md", ".json")), JSON.stringify(report, null, 2));

  const tl = (blocks.timeline as { payload: { entries: unknown[] } }).payload.entries.length;
  const dec = (blocks.decisions as { payload: { entries: unknown[] } }).payload.entries.length;
  const act = (blocks.actions as { payload: { entries: unknown[] } }).payload.entries.length;
  const sig = (blocks.signals as { payload: { entries: unknown[] } }).payload.entries.length;
  const risk = (blocks.risks as { payload: { entries: unknown[] } }).payload.entries.length;
  console.log(
    `${file.padEnd(14)} arch=${arch.archetype.padEnd(10)} mode=${arch.timelineMode.padEnd(20)} TL=${tl} DEC=${dec} ACT=${act} SIG=${sig} RISK=${risk}`,
  );
}

writeFileSync(resolve(outDir, "all.json"), JSON.stringify(reports, null, 2));
console.log(`\nWrote ${reports.length} reports to ${outDir}`);
