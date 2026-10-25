# Incremental topic bucket vocabulary

Based on main `825f991`. Long, soft-wrapped unheaded prose rebuilt its entire growing vocabulary and word count for every next line. Cohesive prose never split, causing quadratic repeated text processing.

Keep the exact bucket vocabulary union and word count incrementally. Reset both when a topic split starts a fresh bucket. The Jaccard formula, 0.12 threshold, 80-word minimum and structural rules are unchanged.

## Executed checks

- Actual `hybridSegment`, 1,200 lines of prose: five-trial median for two runs, 3,999.84 ms baseline to 21.17 ms candidate. A local 500 ms budget was RED before and GREEN after; no timing threshold was committed.
- Ordinary 40-line path, seven-trial median for 100 runs: 175.53 ms to 17.95 ms.
- Complete output was byte-identical for 1,200 lines and 12 structural/reset fixtures, including 7/8/20/100-line inputs, topic changes, headings and paragraph boundaries.
- Actual `importSource` on 90 lines produced a byte-identical full result, including IDs, hash and provenance. Committed fingerprints came from baseline, not candidate expectations.
- Full suite: 503 PASS, 2 existing skips before the additional 12-fixture control. That control passed separately. Typecheck, lint and build passed.
- Private integration on merged #89: 507 PASS, 2 skips; typecheck passed. This is an additional local integration check, not a claim that the ongoing review finished.

## Limits

Actual CI, browser checks and fresh review remain required before merge. Local Node performance is not a deployed timing claim. No API, schema, UI, inference-threshold or dependency change.

## Historical environment record

These measurements and tests ran locally. The retained qualification logs do not record the Node version or operating-system version for this run. Those historical details are unknown and must not be inferred from the current environment. Relative timings apply only to the stated local workload, not other machines or deployed services.
