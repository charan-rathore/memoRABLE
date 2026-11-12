# ADR 002: Daily memory engine

Status: accepted · 2026-11-13

## Context

memoRABLE is meant to be opened every day to:

- capture what someone worked on, learned or decided;
- recover earlier decisions together with their context;
- see what to do next.

The workspace has to open with no model call, work offline, and show what each operation cost.

## Decision

`src/daily` is a pure TypeScript engine that has storage and the clock injected.

- **Events (Layer 1).** An append-only log in the `daily/1` schema, one per workspace and monotonic by `seq`. All state is a projection of this log and can be rebuilt from it at any time.
- **Status from evidence.** A decision gets `proposed`, `approved` or `unresolved` only when a named rule matches its text, or when the user sets it. Otherwise it has no status. `superseded` comes only from an explicit link.
- **Retrieval (Layer 2).** BM25 is the baseline, with an incremental inverted index. Corpus statistics are frozen in epochs so that cached answers stay exact. Explicit `#handle` links provide one-hop expansion. Superseded entries stay findable, but they are flagged, demoted, and preceded by their replacement.
- **Selective invalidation.** Each cached answer depends on its query terms and its result entries. A write drops only the answers that depend on what changed, and an epoch roll clears all of them. The cache key covers workspace, permission, normalised query, k, retrieval config and epoch.
- **Planner (Layer 3).** Deterministic scoring with a readable reason for every point. Accept, revise and skip are recorded as events. A model planner can be added only if the benchmark shows a better accepted-task rate within budget.
- **Receipts.** Every operation records measured ms, postings scanned, cache hit or miss, answers invalidated, model calls and USD. All of these are measured; in this engine model calls and USD are always 0.
- **Deletion.**
  - Deletion is a tombstone event plus redaction of the entry's text from every stored event, removal from the index and dropping of the dependent cached answers.
  - This removes stored and derived data held locally. It is not machine unlearning, and it does not reach copies that were synced elsewhere.
  - Supersession is different: it keeps the old entry, flagged.

## Consequences

- The UI can open from IndexedDB and answer recall in well under a millisecond on the benchmark fixture.
- Any new retrieval arm must be compared with `bench/daily-memory/v1` before it ships.
- Sync is out of scope. The UI states "local only" until a sync backend actually exists.
