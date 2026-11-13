# Daily memory system: architecture and ownership

This document describes the **implemented** daily-workspace pipeline. The separate document-to-brief flow is in [../architecture.md](../architecture.md), and the retrieval measurements are in [../search/ARCHITECTURE.md](../search/ARCHITECTURE.md).

## User journey: one captured decision

1. A note is written in the [today composer](../../src/components/today/composer.tsx) and assigned a kind: worked, learned, decided or task.
2. The [daily engine](../../src/daily/engine.ts) records the operation in an append-only event history. Storage is [IndexedDB](../../src/daily/idb-store.ts) on this browser, with explicit failure states when storage is denied.
3. The [projection](../../src/daily/projection.ts) rebuilds the current view of entries. A decision is superseded **only through an explicit link**, not because another sentence sounds newer.
4. [Recall](../../src/daily/recall.ts) searches an incrementally maintained local index; a changed note invalidates affected cached retrieval. Query results keep current decisions ahead of their explicitly superseded predecessors.
5. [Planner](../../src/daily/planner.ts) ranks potential next actions by inspectable, deterministic rules. Accept, revise and skip produce new events.
6. [Review](../../src/daily/review.ts) reports recorded work, timing measurements and local cache behavior—not model-generated guesses about productivity.

The interface begins at [the live home page](https://memo-rable.vercel.app/), which embeds the real [TodayApp](../../src/components/today/today-app.tsx), not a duplicate playground.

## Four layers, with explicit dependencies

| Boundary | Owns | Must not claim |
| --- | --- | --- |
| Source & event | IDs, local persistence, immutable event history, attachments and user actions | Cloud synchronization or global deletion |
| Memory & retrieval | Projections, explicit replacement, BM25F, local vector index and GitHub corpus | A general temporal knowledge graph or ANN at scale |
| Execution | Local deterministic recall, cache invalidation, simple next-action policy | A model agent's goals or fully automated actions |
| Experience & evaluation | Search, briefs, review, accessibility, benchmark and error receipts | Verified learning from users or measured production ROI |

These are logical boundaries inside the existing application, not four services. Authentication and hosted multitenancy are not implemented in the daily browser workspace.

## Memory versus a graph

There are two distinct notions of graph in the repository:

- The **daily workspace** has one-hop links using entry handles, explicit replacement and local index dependencies. This is cheap, inspectable and enough for the current user journey.
- The **document pipeline** contains additional structural/knowledge-graph experiments. These are not evidence that the daily memory pipeline uses a semantic entity graph.

Only add typed multi-hop edges or Personalized PageRank after an evaluation shows better recall or accepted task completion at a measured ingestion/update/query cost. A simple baseline may win.

## Search isolation and costs

[SearchIndex](../../src/search/engine.ts) keeps named retrieval arms, including BM25F, optional quantized embeddings and fusion. The selected local semantic model uses a worker and self-hosted assets. Query embedding cost and initial model load must be reported separately from index scan latency.

A cache hit is permissible only when the input, model, relevant source identity and policy match. A source modification must not silently reuse a stale answer or vector. A local device cache cannot be called a shared inference cache.

The [179-query frozen benchmark](../search/ARCHITECTURE.md) uses issue creation time to prevent a future issue from leaking into its earlier duplicate's search corpus. Record both wins and losing experiment arms.

## Privacy and deletion

Notes and local search state live in this browser. Repository sync is a direct GitHub API request; the optional token stays in browser storage and is not encrypted. Use narrow-scoped tokens. The system has no account or cloud synchronization.

Deleting a note tombstones/redacts it in the local history and clears its dependent index/cache entries. This is local data removal, **not** machine unlearning, GitHub deletion or proof of removal from external backups. Supersession preserves historical context and is not deletion.

The app should distinguish storage unavailable, offline-but-local, and sync-not-configured states. Do not imply a server copy was made.

## Verification and evolution

~~~sh
npm run verify
npm run test:e2e
~~~

For local-only engine changes, start with [daily engine unit tests](../../tests/unit/daily-engine.test.ts) and [the frozen daily benchmark](../../bench/daily-memory/v1). For search arm changes, run the [search benchmark](../search/ARCHITECTURE.md) with the same corpus, query mode, context and evaluation metric; preserve pairwise bootstrap uncertainty.

Failures must be recorded with a reproducible input, the observed versus expected result, root cause, fix and non-regression test. Example: an empty workspace previously left the semantic model stuck in a loading state even after successful initialization; [PR #112](https://github.com/charan-rathore/memoRABLE/pull/112) records the production discovery and regression test.

## Why these boundaries matter

The daily system should be useful without neural inference. A model can provide optional semantic recall but must not become the authority for explicit user decisions, local deletion, permissions or observed performance. More elaborate memory graphs and inference routers are hypotheses to benchmark, not prerequisites to using the product each day.
