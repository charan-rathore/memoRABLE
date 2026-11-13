import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SearchIndex, embedText } from "@/search/engine";
import { answerable, buildIndex, summarize, markdownTable, queryText, runArm, type ArmReport, type BenchSet } from "@/search/eval";
import { MODELS, createEmbedder } from "@/search/models";

/**
 * Dense and hybrid arms with real model weights. Needs the network to fetch
 * the models, so it only runs in the search-lab workflow (SEARCH_EVAL_DENSE=1).
 */
const FILE = "bench/search/github-dups-v1.json";
const ENABLED = process.env.SEARCH_EVAL_DENSE === "1" && existsSync(FILE);

describe.skipIf(!ENABLED)("github-dups-v1 · dense and hybrid arms", () => {
  it("measures each model: quality, embedding throughput, query latency", async () => {
    const set = answerable(JSON.parse(readFileSync(FILE, "utf8")) as BenchSet);
    const out = process.env.SEARCH_EVAL_OUT ?? "bench/search/results";
    mkdirSync(out, { recursive: true });
    const all: Record<string, unknown> = {};
    let md = "";

    for (const spec of Object.values(MODELS)) {
      const embedder = await createEmbedder(spec, {
        dtype: "q8",
        configure: (env) => { if (process.env.HF_CACHE) env.cacheDir = process.env.HF_CACHE; },
      });
      for (const quantize of [false, true]) {
        if (quantize && spec.key !== "bge-small-en-v1.5") continue;
        const index = new SearchIndex(embedder, quantize);
        buildIndex(set, index);
        const t0 = performance.now();
        await index.embed(set.docs.map((d) => d.id), 32);
        const embedDocsMs = performance.now() - t0;

        // Query vectors once per mode, so arms are timed on retrieval alone.
        const qv = new Map<string, Float32Array>();
        const tq = performance.now();
        for (const mode of ["short", "full"] as const) {
          const texts = set.queries.map((q) => queryText(q, mode));
          for (let i = 0; i < texts.length; i += 32) {
            const vecs = await embedder.embedQueries(texts.slice(i, i + 32).map((t) => t.slice(0, 1800)));
            vecs.forEach((v, j) => qv.set(`${mode}:${set.queries[i + j]!.id}`, v));
          }
        }
        const perQueryEmbedMs = (performance.now() - tq) / (set.queries.length * 2);

        const reports: ArmReport[] = [];
        for (const mode of ["short", "full"] as const) {
          reports.push(await runArm(set, index, "bm25", mode));
          for (const arm of ["dense", "hybrid-rrf", "hybrid-wsum"] as const) reports.push(await runArm(set, index, arm, mode, qv));
        }
        const label = `${embedder.id}${quantize ? " · int8 vectors" : ""}`;
        const table = markdownTable(reports);
        const docsPerSec = (set.docs.length / embedDocsMs) * 1000;
        md += `\n### ${label}\n\nembed ${set.docs.length} docs: ${(embedDocsMs / 1000).toFixed(1)} s (${docsPerSec.toFixed(1)} docs/s, CPU, q8); query embed ≈ ${perQueryEmbedMs.toFixed(1)} ms; vectors ${(index.vectors!.bytes / 1024).toFixed(0)} KiB\n\n${table}\n`;
        all[label] = { embedDocsMs, perQueryEmbedMs, vectorBytes: index.vectors!.bytes, reports: reports.map(summarize), embedTextChars: embedText(set.docs[0]!).length };
        console.log(`\n${label}: embed ${set.docs.length} docs ${(embedDocsMs / 1000).toFixed(1)} s (${docsPerSec.toFixed(1)} docs/s), query embed ${perQueryEmbedMs.toFixed(1)} ms, vectors ${(index.vectors!.bytes / 1024).toFixed(0)} KiB\n${table}`);
      }
    }
    writeFileSync(`${out}/dense.json`, JSON.stringify(all, null, 2));
    appendFileSync(`${out}/summary.md`, `\n## Dense and hybrid arms\n${md}`);
    expect(Object.keys(all).length).toBeGreaterThan(0);
  }, 3_600_000);
});
