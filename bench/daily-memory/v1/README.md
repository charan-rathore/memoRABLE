# daily-memory-bench/v1

A versioned benchmark for the daily memory engine (`src/daily`). It is run by `tests/unit/daily-bench.test.ts`, which prints the full report.

The fixture is a synthetic 10-day engineering journal: 38 entries (one is deleted during the run), 18 queries and a planner check. Fixtures in this folder are never edited in place. A changed fixture becomes `v2`, so the numbers stay comparable across versions.

## What it measures

| Area | Measure | Gate |
|---|---|---|
| Recovery | recall@5 for 10 direct "what did we decide / learn" questions | floor |
| Updates | the current decision ranks above the one it superseded, and superseded hits are flagged | `staleAboveCurrent = 0`, `staleUnflagged = 0` |
| Multi-hop | entries reached through one explicit `#handle` link or supersession edge | `multihopReach = 1` |
| Deletion | the deleted entry is absent from results, linked results, cached answers and stored event text | `deletionLeaks = 0` |
| Cache correctness | every answer served, cached or not, equals an uncached computation on the same index. Queries are warmed before later updates, so invalidation is exercised. | `staleCacheErrors = 0` |
| Planner | suggestions are open tasks or open decisions only, and a skip is respected | must hold |
| Efficiency | p50/p95 recall latency, p95 update cost, index build time, answers invalidated per update, cache hit rate | reported |
| Spend | model calls and USD from receipts | `0` for this baseline |

## Baseline (bm25-v1, run in bun 1.4 on the dev container)

`recall@5 = 1.0` (recovery, update and multi-hop), `MRR = 0.938` (0.927 before the stopword list was extended in the workspace PR), `multihopReach = 1`, and every correctness gate is at 0.

Measured performance: recall p95 is under 0.1 ms, index build is about 3 ms for 38 entries, about 0.46 cached answers are invalidated per update, the cache hit rate is 0.5, and there are 0 model calls.

The latencies come from one small fixture on one machine. They show that the engine never waits on a network or model. They are not a scaling claim.

## Failed first run (kept on purpose)

The first run failed in two ways:

- **2 stale-cache errors.** BM25's corpus statistics (N and average length) changed on every write, so a cached score could differ from a fresh one even when nothing it matched had changed. The fix freezes the statistics in epochs: an epoch rolls after more than 10% drift or 8 documents, and rolling clears the cache. Within an epoch, invalidating by term and by entry is exact.
- **1 superseded decision outranked its replacement.** For "where do we store embeddings", the old decision matched more words. The fix is the replacement-first rule: a superseded hit pulls its live replacement in directly above it.

## Adding an experiment arm

Typed-graph traversal, vectors, RRF and Personalized PageRank each go in as a separate arm behind their own config id. A PR that adds one must:

- run this fixture and report the same table next to the baseline;
- include indexing and update cost;
- show that it beats the baseline on accepted outcomes before it becomes the default.

Dependencies such as a graph database, a model provider or an orchestration framework need that reproducible justification first.
