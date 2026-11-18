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

## Keeping decisions true over time

Two problems recur in how engineers talk about decision records: the *why* fades while the *what* survives, and a record of a decision you have since reversed is worse than no record, because it still reads as authoritative. The engine answers both from the event log, with no model and no new storage.

**Re-confirmation (`src/daily/fsrs.ts`).** Every decision and lesson carries an FSRS-5 memory state: difficulty, stability and last review (Ye et al., KDD 2022; FSRS-5 default weights). Retrievability follows the power forgetting curve `R(t) = (1 + 19/81 · t/S)^-0.5`, so `R = 90%` exactly one stability after a review. `dueForReconfirm()` returns entries whose predicted recall is below 90%, weakest first. The "Still true?" panel offers three answers, each stored as an `entry.reviewed` event:

| Answer | FSRS grade | Effect |
|---|---|---|
| Still holds | 3 (Good) | stability grows, next check moves out (shown before you click) |
| Not sure | 2 (Hard) | smaller growth, higher difficulty, comes back sooner |
| Changed / Forgot | 1 (Again) | stability falls; a decision is also reopened as *unresolved*, so it moves into Next until you write what replaces it |

Superseded entries, tasks, and decisions that are still proposed or unresolved never come up for re-confirmation, because the planner already handles those. The default weights were fitted on flashcard reviews, not on decisions. They give a principled, explainable schedule (days, then weeks, then months), not a validated model of how fast a decision's rationale decays.

**Look back (`projectAsOf`).** The log already records when every fact was written and when a supersession was recorded, which is the validity window that temporal memory graphs such as Zep/Graphiti keep on their edges. `engine.asOf(date)` replays only the events up to that date and returns the workspace as it stood: which decisions were in force, and which have since been replaced, revised or reopened. Deletion still wins in every past view, so time travel cannot resurrect deleted text. This is transaction time (when it was recorded). Valid time stated in the text ("from Q3 onward") is not modelled.

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
