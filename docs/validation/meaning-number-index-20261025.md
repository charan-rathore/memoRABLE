# Index number identities when removing restatements

The existing `dedupeByMeaning` compared all kept statements, although its number-identity rule immediately rejects pairs with different nonempty number multisets. Index those already-required identities without changing matching thresholds, keys, number normalisation, content tokens or first-wins order.

Unnumbered statements still compare against every kept statement. Numbered statements compare with unnumbered and same-number statements. Exact-key matches remain first, including when key and number-identity rules disagree.

## Measurements

- Actual public helper, 6,000 numbered financial statements: seven-trial median 666.22 ms baseline to 32.60 ms candidate.
- Actual ordinary research import, 100 runs: 388.99 ms to 379.50 ms.
- These are local measurements, not production latency claims.

## Executed checks

Source-only revert: the 300 ms budget fails before and passes after. Eighty seeded 90-statement trials compare complete arrays with a reference using unchanged `saysTheSame`. They include numberless statements, number groups, formatting, punctuation, blank lines and key collisions.

Actual 100-quarter `importSource` complete MemoryDocument JSON, including IDs, hash and relations, is identical on baseline and candidate. Baseline SHA-256: `c37c4619e0200226a62ebc2704b5673994c51ff0f94be1563db14c687c9aef76`. The committed baseline fixture was not generated from candidate expectations.

Full suite: 503 PASS, 2 skipped before the additional golden integration test. Final focused suite: 3 PASS. Type, lint and build pass after the test typing fix. No schema, threshold or output-contract change.
