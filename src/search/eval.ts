import { SearchIndex, type Arm, type SearchDoc } from "./engine";
import { mean, mrrAt, ndcgAt, pairedBootstrap, percentile, recallAt } from "./metrics";

/**
 * Retrieval evaluation over a duplicate-issue benchmark.
 *
 * Realistic setting (Rakha, Bezemer & Hassan, TSE 2017): each query only sees
 * documents from the same repository that were created before it, the way a
 * maintainer triaging a new report would. Two query modes:
 *   short: the title only, like a search box
 *   full:  title + body, like duplicate detection on a newly filed issue
 */

export interface BenchDoc { id: string; repo: string; title: string; body: string; labels: string[]; isPr: boolean; createdAt: string; state?: string }
export interface BenchQuery { id: string; repo: string; title: string; body: string; createdAt: string; relevant: string[] }
export interface BenchSet { version: string; docs: BenchDoc[]; queries: BenchQuery[] }

export type QueryMode = "short" | "full";

export interface ArmReport {
  arm: Arm;
  mode: QueryMode;
  n: number;
  recall1: number; recall5: number; recall10: number; mrr10: number; ndcg10: number;
  p50ms: number; p95ms: number;
  embedP50ms?: number;
  perQueryNdcg: number[];
}

export function toSearchDoc(d: BenchDoc): SearchDoc {
  return { id: d.id, kind: d.isPr ? "pr" : "issue", title: d.title, body: d.body, labels: d.labels, source: d.repo, createdAt: d.createdAt, ...(d.state ? { state: d.state } : {}) };
}

export const queryText = (q: BenchQuery, mode: QueryMode) => (mode === "short" ? q.title : `${q.title}\n${q.body}`);

export function buildIndex(set: BenchSet, index: SearchIndex): { ms: number } {
  const t0 = performance.now();
  for (const d of set.docs) index.upsert(toSearchDoc(d));
  return { ms: performance.now() - t0 };
}

export async function runArm(
  set: BenchSet,
  index: SearchIndex,
  arm: Arm,
  mode: QueryMode,
  queryVectors?: Map<string, Float32Array>,
): Promise<ArmReport> {
  const created = new Map(set.docs.map((d) => [d.id, Date.parse(d.createdAt)]));
  const repoOf = new Map(set.docs.map((d) => [d.id, d.repo]));
  const r1: number[] = [], r5: number[] = [], r10: number[] = [], mrr: number[] = [], ndcg: number[] = [], ms: number[] = [], emb: number[] = [];
  for (const q of set.queries) {
    const before = Date.parse(q.createdAt);
    const allow = (id: string) => repoOf.get(id) === q.repo && (created.get(id) ?? 0) < before;
    const qv = queryVectors?.get(`${mode}:${q.id}`);
    const res = await index.search(queryText(q, mode), { arm, k: 10, allow, ...(qv ? { queryVector: qv } : {}) });
    const ranked = res.hits.map((h) => h.id);
    const rel = new Set(q.relevant);
    r1.push(recallAt(ranked, rel, 1)); r5.push(recallAt(ranked, rel, 5)); r10.push(recallAt(ranked, rel, 10));
    mrr.push(mrrAt(ranked, rel)); ndcg.push(ndcgAt(ranked, rel));
    ms.push(res.ms); if (res.embedMs !== undefined) emb.push(res.embedMs);
  }
  const r = (x: number) => Math.round(x * 1000) / 1000;
  return {
    arm, mode, n: set.queries.length,
    recall1: r(mean(r1)), recall5: r(mean(r5)), recall10: r(mean(r10)), mrr10: r(mean(mrr)), ndcg10: r(mean(ndcg)),
    p50ms: r(percentile(ms, 50)), p95ms: r(percentile(ms, 95)),
    ...(emb.length ? { embedP50ms: r(percentile(emb, 50)) } : {}),
    perQueryNdcg: ndcg,
  };
}

export function markdownTable(reports: ArmReport[], baseline: Arm = "bm25"): string {
  const lines = [
    "| arm | queries | R@1 | R@5 | R@10 | MRR@10 | nDCG@10 | Δ nDCG vs bm25 (95% CI) | p50 ms | p95 ms |",
    "|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const mode of ["short", "full"] as const) {
    const base = reports.find((r) => r.arm === baseline && r.mode === mode);
    for (const rep of reports.filter((r) => r.mode === mode)) {
      let delta = "baseline";
      if (base && rep !== base) {
        const b = pairedBootstrap(base.perQueryNdcg, rep.perQueryNdcg);
        delta = `${b.diff >= 0 ? "+" : ""}${b.diff.toFixed(3)} (${b.lo.toFixed(3)}, ${b.hi.toFixed(3)})`;
      }
      lines.push(`| ${rep.arm} (${mode}) | ${rep.n} | ${rep.recall1} | ${rep.recall5} | ${rep.recall10} | ${rep.mrr10} | ${rep.ndcg10} | ${delta} | ${rep.p50ms} | ${rep.p95ms} |`);
    }
  }
  return lines.join("\n");
}
