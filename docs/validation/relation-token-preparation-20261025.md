# Prepare link vocabulary once per pass

Based on merged #86, main `762766c`. The relation-link pass stemmed each source and target string again for every pair. With 100 entries in each kind, the deterministic JSON import spent most time repeating unchanged tokenisation.

Prepare target vocabulary once, and source tokens once per row. Keep the same two-shared-token floor, 0.2 threshold, minimum-size denominator, stable sort and two-edge cap. Empty-side early return does no extra work. No change to special action/phase paths, graph semantics or source content.

## Executed checks

- Actual full six-block JSON import, 100 entries per kind: median 822.38 ms baseline to 87.62 ms candidate for two imports across five trials. A local comparative 300 ms budget was RED before and GREEN after. Initial measurements of 769 ms to 91 ms were consistent.
- The full serialized MemoryDocument, including all IDs, hashes, provenance and relations, was byte-identical. A committed baseline fingerprint checks this.
- Ordinary Atlas fixture, seven-trial median for 100 imports: 88.80 ms baseline to 78.13 ms candidate.
- Full suite: 501 PASS, 2 existing skips. Typecheck, lint and build passed.

## Followthrough and limits

These are local Node actual-import timings, not deployed-browser latency claims. Fresh CI, browser checks and review were still required before merge. The validation note records the local qualification stage; current PR state is tracked in #87. No schema, threshold, relation-order or output-contract change.

## Historical environment record

These measurements and tests ran locally. The retained qualification logs do not record the Node version or operating-system version for this run. Those historical details are unknown and must not be inferred from the current environment. Relative timings apply only to the stated local workload, not other machines or deployed services.
