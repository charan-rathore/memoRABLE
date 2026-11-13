/**
 * Numbers shown on the homepage. Copied from the github-dups-v1 benchmark run
 * (tests/unit/search-bench.test.ts and search-dense.test.ts in the search-lab
 * workflow, 2026-11-13); update them only from a new run, never by hand-tuning.
 * R@10 = share of queries whose maintainer-marked original is in the top 10.
 */
export const BENCH = {
  version: "github-dups-v1",
  measuredOn: "2026-11-13",
  queries: 179,
  rows: [
    { label: "Plain keyword search (BM25), whole issue", r10: 0.726, ours: false },
    { label: "memoRABLE keyword, whole issue", r10: 0.832, ours: true },
    { label: "memoRABLE semantic, on-device model, whole issue", r10: 0.966, ours: true },
    { label: "Plain keyword search (BM25), title only", r10: 0.883, ours: false },
    { label: "memoRABLE semantic + keyword, title only", r10: 0.916, ours: true },
  ],
  note: "Keyword arms run in CI on every change; semantic arms (bge-small-en-v1.5, int8, in your browser) run in the search lab. Turn semantic search on in your workspace.",
} as const;
