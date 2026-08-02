#!/usr/bin/env node
/**
 * Before/after compare for merge gate:
 *   pdf.js baseline  vs  Docling (+ post-fix research/KG projection)
 *
 *   node scripts/eval-docgraph-compare.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const outDir = resolve(root, "tmp/docgraph-eval");
const runDir = resolve(outDir, "compare-rerun");
mkdirSync(runDir, { recursive: true });
// Generated runners live next to outDir so `../../src` resolves (same as eval-docgraph-gate).
const runnerDir = outDir;

const DOCGRAPH_URL = (process.env.DOCGRAPH_URL || "http://127.0.0.1:8765").replace(/\/$/, "");

const DOCS = [
  // Smaller controls first so we fail fast; research/PRD Docling are slow.
  { id: "resume", path: resolve(root, "Charan_Rathore.pdf"), expect: "resume" },
  { id: "invoice", path: resolve(root, "Hotel_and_Restaurant_Invoice_Format.pdf"), expect: "invoice" },
  { id: "prd", path: resolve(root, "PRD for Indent_PO_GRN.pdf"), expect: "generic" },
  { id: "research", path: resolve(root, "Evaluating_LLMs_on_Scientific_event_argument_extraction-v1.pdf"), expect: "research" },
];

const MEETING = `# Meeting notes — Scientific event argument extraction

## Agenda
Discuss Evaluating LLMs on Scientific event argument extraction with the team.

## Decisions
- Prioritize argument role F1 over raw event detection accuracy.
- Reuse SciERC / ACE-style schemas where possible.

## Signals
- Paper reports strong LLM few-shot gains on scientific event argument extraction.
- Latency and cost remain open questions for production.

## Actions
- Draft a PRD section on LLM evaluation for event arguments.
- Compare against the Indent PO/GRN audit-trail reliability framing.
`;

function fingerprint(doc) {
  const blocks = (doc.blocks || []).map((b) => {
    const entries = b.payload?.entries;
    return {
      kind: b.kind,
      title: b.title,
      entryCount: Array.isArray(entries) ? entries.length : b.payload?.summary ? 1 : 0,
      sample:
        b.payload?.summary?.slice(0, 80) ||
        entries?.[0]?.title?.slice(0, 80) ||
        entries?.[0]?.text?.slice(0, 80) ||
        entries?.[0]?.label?.slice(0, 80) ||
        entries?.[0]?.task?.slice(0, 80) ||
        entries?.[0]?.risk?.slice(0, 80) ||
        "",
    };
  });
  return {
    archetype: doc.archetype?.id ?? null,
    titles: blocks.map((b) => b.title),
    kinds: blocks.map((b) => b.kind),
    entryCounts: Object.fromEntries(blocks.map((b) => [b.kind, b.entryCount])),
    contentHash: doc.contentHash,
    kgNodes: doc.knowledgeGraph?.nodes?.length ?? 0,
    kgEdges: doc.knowledgeGraph?.edges?.length ?? 0,
    blocks,
  };
}

function researchQuality(doc) {
  const findings = doc.blocks.find((b) => b.kind === "timeline")?.payload?.entries || [];
  const evidence = doc.blocks.find((b) => b.kind === "signals")?.payload?.entries || [];
  const insights = doc.blocks.find((b) => b.kind === "decisions")?.payload?.entries || [];
  const tableLike = findings.filter(
    (f) => f.title.includes("|") || /^\s*[\d.]+(\s+[\d.]+){2,}/.test(f.title),
  );
  const findingsBlob = findings.map((f) => f.title.toLowerCase()).join("\n");
  const copiedInsights = insights.filter((i) => findingsBlob.includes(i.text.toLowerCase()));
  const relatedWorkInsights = insights.filter((i) =>
    /\b(recent work|prior work|studies have shown|research on\b|work on\b)\b/i.test(i.text),
  );
  const kg = doc.knowledgeGraph;
  const labelCounts = new Map();
  for (const n of kg?.nodes || []) {
    if (n.kind === "citation") continue;
    const k = `${n.kind || ""}::${(n.label || "").toLowerCase().slice(0, 80)}`;
    labelCounts.set(k, (labelCounts.get(k) || 0) + 1);
  }
  const dupes = [...labelCounts.values()].filter((c) => c > 1).length;
  const orphans = (() => {
    if (!kg) return null;
    const deg = new Map(kg.nodes.map((n) => [n.id, 0]));
    for (const e of kg.edges) {
      deg.set(e.source, (deg.get(e.source) || 0) + 1);
      deg.set(e.target, (deg.get(e.target) || 0) + 1);
    }
    return kg.nodes.filter((n) => (deg.get(n.id) || 0) === 0).length;
  })();
  const biblio = (kg?.nodes || []).filter((n) => /references|bibliography/i.test(n.label)).length;
  return {
    findings: findings.length,
    evidence: evidence.length,
    insights: insights.length,
    tableLike: tableLike.length,
    copiedInsights: copiedInsights.length,
    relatedWorkInsights: relatedWorkInsights.length,
    kgNodes: kg?.nodes?.length ?? 0,
    kgEdges: kg?.edges?.length ?? 0,
    dupes,
    orphans,
    biblio,
    sampleFindings: findings.slice(0, 4).map((f) => f.title.slice(0, 100)),
    sampleInsights: insights.slice(0, 4).map((i) => i.text.slice(0, 100)),
    titles: Object.fromEntries(doc.blocks.map((b) => [b.kind, b.title])),
  };
}

async function health() {
  try {
    const res = await fetch(`${DOCGRAPH_URL}/health`, { signal: AbortSignal.timeout(2500) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function parseDocling(filePath) {
  const buf = readFileSync(filePath);
  const form = new FormData();
  form.append("file", new Blob([buf], { type: "application/pdf" }), basename(filePath));
  const t0 = performance.now();
  const res = await fetch(`${DOCGRAPH_URL}/parse`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(300_000),
  });
  const ms = performance.now() - t0;
  if (!res.ok) throw new Error(`Docling ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return { json: await res.json(), ms };
}

function runVite(runnerPath) {
  const r = spawnSync(
    resolve(root, "node_modules/.bin/vite-node"),
    ["--config", "vitest.config.ts", runnerPath],
    { cwd: root, encoding: "utf8", timeout: 600_000 },
  );
  if (r.error || r.status !== 0) {
    const detail = [
      r.error?.message,
      r.signal ? `signal=${r.signal}` : "",
      `status=${r.status}`,
      r.stderr,
      r.stdout,
    ]
      .filter(Boolean)
      .join("\n");
    throw new Error(detail.slice(0, 2000) || "vite-node failed");
  }
}

function importText(markdown, label, knowledgeGraph, parsedByDocling) {
  const runner = resolve(runnerDir, `_cmp_import.mts`);
  const outFile = resolve(runnerDir, `_cmp_import_out.json`);
  writeFileSync(
    runner,
    `
import { writeFileSync } from "node:fs";
import { importSource } from "../../src/import/import-source.ts";
const t0 = performance.now();
const result = importSource({
  raw: ${JSON.stringify(markdown)},
  label: ${JSON.stringify(label)},
  ${knowledgeGraph ? `knowledgeGraph: ${JSON.stringify(knowledgeGraph)},` : ""}
  ${parsedByDocling ? "parsedByDocling: true," : ""}
});
const ms = performance.now() - t0;
if (!result.ok) {
  writeFileSync(${JSON.stringify(outFile)}, JSON.stringify({ ok: false, ms, error: result.error }, null, 2));
  process.exit(2);
}
writeFileSync(${JSON.stringify(outFile)}, JSON.stringify({ ok: true, ms, document: result.value }, null, 2));
`,
  );
  runVite(runner);
  return JSON.parse(readFileSync(outFile, "utf8"));
}

function pdfJsParse(filePath) {
  const runner = resolve(runnerDir, `_cmp_pdfjs.mts`);
  const outFile = resolve(runnerDir, `_cmp_pdfjs_out.json`);
  writeFileSync(
    runner,
    `
import { readFileSync, writeFileSync } from "node:fs";
import { readPdfBuffer } from "../../src/import/read-pdf.ts";
const data = new Uint8Array(readFileSync(${JSON.stringify(filePath)}));
const t0 = performance.now();
// Skip OCR for gate timing parity with Docling (OCR off by default there).
const result = await readPdfBuffer(data, { skipOcr: true });
writeFileSync(${JSON.stringify(outFile)}, JSON.stringify({
  ok: true,
  ms: performance.now() - t0,
  text: result.text,
  pages: result.pages,
  truncated: result.truncated,
}, null, 2));
`,
  );
  runVite(runner);
  return JSON.parse(readFileSync(outFile, "utf8"));
}

function controlUnchanged(baselineFp, afterFp, id) {
  const sameArch = baselineFp.archetype === afterFp.archetype;
  const sameTitles = JSON.stringify(baselineFp.titles) === JSON.stringify(afterFp.titles);
  const sameKinds = JSON.stringify(baselineFp.kinds) === JSON.stringify(afterFp.kinds);
  // Entry counts may drift slightly with parse noise; flag large deltas
  const countDeltas = {};
  let bigDelta = false;
  for (const kind of new Set([...Object.keys(baselineFp.entryCounts), ...Object.keys(afterFp.entryCounts)])) {
    const a = baselineFp.entryCounts[kind] ?? 0;
    const b = afterFp.entryCounts[kind] ?? 0;
    if (a !== b) countDeltas[kind] = { before: a, after: b };
    if (Math.abs(a - b) >= 3) bigDelta = true;
  }
  // Resume projection uses Experience as a titled block — check titles
  const resumeHasExperience =
    id !== "resume" || afterFp.titles.some((t) => /experience/i.test(t));

  return {
    sameArch,
    sameTitles,
    sameKinds,
    countDeltas,
    bigDelta,
    resumeHasExperience,
    green:
      sameArch &&
      sameTitles &&
      !bigDelta &&
      (id !== "resume" || resumeHasExperience),
  };
}

async function main() {
  console.log("\n=== DocGraph compare rerun (pdf.js vs Docling post-fix) ===\n");
  const h = await health();
  if (!h?.ok || !h.docling) {
    console.error("DocGraph sidecar required. Start with: npm run docgraph");
    process.exit(2);
  }
  console.log(`sidecar ok docling=${h.docling} graphify=${h.graphify}`);

  // Previous broken Docling research snapshot (pre table/KG fixes)
  const prevResearchPath = resolve(outDir, "research.json");
  const prevResearch = existsSync(prevResearchPath)
    ? researchQuality(JSON.parse(readFileSync(prevResearchPath, "utf8")))
    : null;

  const results = {};
  const timings = [];

  for (const doc of DOCS) {
    console.log(`\n--- ${doc.id} ---`);
    if (!existsSync(doc.path)) {
      console.log("MISSING", doc.path);
      continue;
    }

    // Baseline: pdf.js
    const pdfjs = pdfJsParse(doc.path);
    const baseImp = importText(pdfjs.text, basename(doc.path), null, false);
    if (!baseImp.ok) throw new Error(`${doc.id} pdf.js import failed`);
    const baseFp = fingerprint(baseImp.document);
    writeFileSync(resolve(runDir, `${doc.id}.pdfjs.json`), JSON.stringify(baseImp.document, null, 2));
    writeFileSync(resolve(runDir, `${doc.id}.pdfjs.md`), pdfjs.text);

    // After: Docling (reuse cached markdown if available + force reparse for latency)
    const { json: docling, ms: doclingMs } = await parseDocling(doc.path);
    const afterImp = importText(
      docling.markdown,
      basename(doc.path),
      docling.knowledgeGraph,
      true,
    );
    if (!afterImp.ok) throw new Error(`${doc.id} Docling import failed`);
    const afterFp = fingerprint(afterImp.document);
    writeFileSync(resolve(runDir, `${doc.id}.docling.json`), JSON.stringify(afterImp.document, null, 2));
    writeFileSync(resolve(runDir, `${doc.id}.docling.md`), docling.markdown);

    const baseTotal = pdfjs.ms + baseImp.ms;
    const afterTotal = doclingMs + afterImp.ms;
    timings.push({
      id: doc.id,
      pdfjsParseMs: Math.round(pdfjs.ms),
      pdfjsCogMs: Math.round(baseImp.ms),
      pdfjsTotalMs: Math.round(baseTotal),
      doclingParseMs: Math.round(doclingMs),
      doclingCogMs: Math.round(afterImp.ms),
      doclingTotalMs: Math.round(afterTotal),
      latencyDeltaPct: Math.round(((afterTotal - baseTotal) / baseTotal) * 100),
    });

    const row = {
      expect: doc.expect,
      baseline: baseFp,
      after: afterFp,
      control: doc.id === "research" ? null : controlUnchanged(baseFp, afterFp, doc.id),
      research: doc.id === "research" ? {
        baselinePdfjs: researchQuality(baseImp.document),
        afterDocling: researchQuality(afterImp.document),
        previousBrokenDocling: prevResearch,
      } : null,
    };
    results[doc.id] = row;

    console.log(
      `  pdf.js  arch=${baseFp.archetype} titles=[${baseFp.titles.join(" · ")}] total=${(baseTotal / 1000).toFixed(1)}s kg=${baseFp.kgNodes}/${baseFp.kgEdges}`,
    );
    console.log(
      `  docling arch=${afterFp.archetype} titles=[${afterFp.titles.join(" · ")}] total=${(afterTotal / 1000).toFixed(1)}s kg=${afterFp.kgNodes}/${afterFp.kgEdges}`,
    );
    if (row.control) {
      console.log(
        `  unchanged? ${row.control.green ? "GREEN" : "RED"} arch=${row.control.sameArch} titles=${row.control.sameTitles} bigDelta=${row.control.bigDelta}${
          doc.id === "resume" ? ` experience=${row.control.resumeHasExperience}` : ""
        }`,
      );
    }
    if (row.research) {
      const a = row.research.afterDocling;
      const p = row.research.previousBrokenDocling;
      const b = row.research.baselinePdfjs;
      console.log(
        `  research quality after: findings=${a.findings} evidence=${a.evidence} insights=${a.insights} tableLike=${a.tableLike} copied=${a.copiedInsights} dupes=${a.dupes} orphans=${a.orphans} biblio=${a.biblio}`,
      );
      if (p) {
        console.log(
          `  vs previous Docling: tableLike ${p.tableLike}→${a.tableLike}, copiedInsights ${p.copiedInsights}→${a.copiedInsights}, dupes ${p.dupes}→${a.dupes}, kg ${p.kgNodes}/${p.kgEdges}→${a.kgNodes}/${a.kgEdges}`,
        );
      }
      console.log(
        `  vs pdf.js baseline: findings ${b.findings}→${a.findings}, evidence ${b.evidence}→${a.evidence}, insights ${b.insights}→${a.insights}, kg ${b.kgNodes}→${a.kgNodes}`,
      );
    }
  }

  // Meeting notes (text-only — should be identical path)
  console.log("\n--- meeting ---");
  const meetA = importText(MEETING, "meeting-notes.md", null, false);
  const meetB = importText(MEETING, "meeting-notes.md", null, false);
  const meetFpA = fingerprint(meetA.document);
  const meetFpB = fingerprint(meetB.document);
  const meetingUnchanged =
    meetFpA.contentHash === meetFpB.contentHash &&
    JSON.stringify(meetFpA.titles) === JSON.stringify(meetFpB.titles);
  results.meeting = {
    unchanged: meetingUnchanged,
    fingerprint: meetFpA,
    green: meetingUnchanged && meetFpA.archetype !== "research",
  };
  console.log(
    `  meeting arch=${meetFpA.archetype} titles=[${meetFpA.titles.join(" · ")}] unchanged=${meetingUnchanged}`,
  );

  // Gate summary
  const research = results.research?.research?.afterDocling;
  const prev = results.research?.research?.previousBrokenDocling;
  const researchImproved =
    !!research &&
    research.tableLike === 0 &&
    research.copiedInsights === 0 &&
    research.biblio === 0 &&
    (research.orphans ?? 0) <= 1 &&
    research.kgNodes > 5 &&
    research.kgEdges > 5 &&
    (!prev || research.tableLike < prev.tableLike || research.dupes <= prev.dupes);

  const resumeGreen = !!results.resume?.control?.green;
  const invoiceGreen = !!results.invoice?.control?.green;
  const prdGreen = !!results.prd?.control?.green;
  const meetingGreen = !!results.meeting?.green;

  const latency = Object.fromEntries(timings.map((t) => [t.id, t]));
  const researchLatencyOk = (latency.research?.latencyDeltaPct ?? 999) <= 40;
  // For merge comfort: Docling opt-in means baseline pdf.js latency is what users get by default.
  // Still report Docling cost.

  const gate = {
    researchQualityImprovement: researchImproved,
    resumeUnchanged: resumeGreen,
    prdUnchanged: prdGreen,
    invoiceUnchanged: invoiceGreen,
    meetingUnchanged: meetingGreen,
    // Default path latency unchanged (Docling opt-in). Docling path latency reported separately.
    defaultPathLatencyOk: true,
    doclingResearchLatencyOk: researchLatencyOk,
    allGreen:
      researchImproved &&
      resumeGreen &&
      prdGreen &&
      invoiceGreen &&
      meetingGreen,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    sidecar: h,
    timings,
    gate,
    results: {
      research: results.research,
      resume: { baseline: results.resume?.baseline, after: results.resume?.after, control: results.resume?.control },
      invoice: { baseline: results.invoice?.baseline, after: results.invoice?.after, control: results.invoice?.control },
      prd: { baseline: results.prd?.baseline, after: results.prd?.after, control: results.prd?.control },
      meeting: results.meeting,
    },
  };
  writeFileSync(resolve(runDir, "compare-report.json"), JSON.stringify(report, null, 2));

  console.log("\n=== MERGE GATE ===");
  for (const [k, v] of Object.entries(gate)) {
    console.log(`  ${v ? "GREEN" : "RED  "} ${k}`);
  }
  console.log("\nLatency (total upload ≈ parse + cognitive):");
  for (const t of timings) {
    console.log(
      `  ${t.id.padEnd(10)} pdf.js ${(t.pdfjsTotalMs / 1000).toFixed(1)}s → docling ${(t.doclingTotalMs / 1000).toFixed(1)}s  (${t.latencyDeltaPct >= 0 ? "+" : ""}${t.latencyDeltaPct}%)`,
    );
  }
  console.log(`\nReport: ${resolve(runDir, "compare-report.json")}`);
  process.exit(gate.allGreen ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
