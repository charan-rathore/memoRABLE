import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LEXICAL_ARMS, SearchIndex } from "@/search/engine";
import { answerable, buildIndex, summarize, markdownTable, runArm, type ArmReport, type BenchSet } from "@/search/eval";

/**
 * github-dups-v1, lexical arms. Runs in every CI build (no network, no model).
 * Floors sit just under the measured baseline so a regression fails the
 * build; dense arms are measured in the search-lab workflow.
 */
const FILE = "bench/search/github-dups-v1.json";

describe.skipIf(!existsSync(FILE))("github-dups-v1 · lexical arms", () => {
  it("runs every lexical arm in both query modes and holds the floors", async () => {
    const set = answerable(JSON.parse(readFileSync(FILE, "utf8")) as BenchSet);
    const index = new SearchIndex();
    const build = buildIndex(set, index);
    const reports: ArmReport[] = [];
    for (const mode of ["short", "full"] as const) for (const arm of LEXICAL_ARMS) reports.push(await runArm(set, index, arm, mode));

    const table = markdownTable(reports);
    console.log(`\n${set.version}: ${set.docs.length} docs, ${set.queries.length} queries, index build ${build.ms.toFixed(0)} ms\n${table}\n`);
    const out = process.env.SEARCH_EVAL_OUT;
    if (out) {
      mkdirSync(out, { recursive: true });
      writeFileSync(`${out}/lexical.json`, JSON.stringify({ build, reports: reports.map(summarize) }, null, 2));
      writeFileSync(`${out}/summary.md`, `### ${set.version} · lexical\n\n${set.docs.length} docs, ${set.queries.length} queries, index build ${build.ms.toFixed(0)} ms\n\n${table}\n`);
    }

    const get = (arm: string, mode: string) => reports.find((r) => r.arm === arm && r.mode === mode)!;
    // Floors (set from the first measured run; see bench/search/README.md).
    expect(get("bm25f+sig", "full").recall10).toBeGreaterThanOrEqual(FLOORS.fullR10);
    expect(get("bm25f+sig", "short").recall10).toBeGreaterThanOrEqual(FLOORS.shortR10);
    for (const r of reports) expect(r.p95ms).toBeLessThan(FLOORS.p95ms);
  }, 300_000);
});

// Measured 2026-11-13 (bm25f+sig): short R@10 0.883, full R@10 0.832, p95 < 2 ms (bun, dev container).
const FLOORS = { fullR10: 0.8, shortR10: 0.86, p95ms: 50 };
