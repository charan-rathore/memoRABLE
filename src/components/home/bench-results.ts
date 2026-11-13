/**
 * Numbers shown on the homepage. Copied from the github-dups-v1 benchmark run
 * (tests/unit/search-bench.test.ts, search-lab workflow); update them only
 * from a new run, never by hand-tuning. R@10 = share of queries whose
 * maintainer-marked original is in the top 10.
 */
export const BENCH = {
  version: "github-dups-v1",
  measuredOn: "2026-11-13",
  queries: 179,
  rows: [
    { label: "Plain keyword search (BM25), whole issue", r10: 0.726, ours: false },
    { label: "memoRABLE, whole issue as the query", r10: 0.832, ours: true },
    { label: "Plain keyword search (BM25), title only", r10: 0.883, ours: false },
    { label: "memoRABLE, title only", r10: 0.883, ours: true },
  ],
  note: "Keyword arms, run in CI on every change. Semantic (embedding) arms are measured separately in the search lab.",
} as const;
