# Prepare deduplication comparison forms once

Baseline: `5d3291ebc13bf0a0641176cafe7c7fea1c66b6ee`. Linux x64, Node 22.23.3.

The importer compared each retained text with every new text, repeatedly normalizing and tokenizing the retained text. This change prepares its key, number multiset, and content-token set once. The pairwise matching rule stays the same: equal normalized keys, distinct nonempty numbers, then the existing 0.72 Jaccard threshold. Pair count is still quadratic; this is not an asymptotic-complexity claim.

## Verification

- A real 3,000-task `importSource()` regression exceeded its 3-second budget on baseline and passed after preparation. Exact phrasing, number identity, grouping separators, and blank/punctuation controls passed on both versions.
- The second independent concept-preparation patch was tested privately alongside this one, not included in this PR. Together, baseline scale tests had 2 failures and 4 passing controls; patched tests had 6 passes. Combined full suite: 491 passed, 2 skipped; lint, typecheck, production build pass.
- The combined pair was also checked through actual `importSource()` over 44 authored synthetic documents. All imports passed. Both the detailed sweep and the outcome views were byte-identical against baseline: SHA-256 `28d4bb4b2c38a2b82f3293327825c5d379d84a8d109dea6ecf09d301fc5dae43` and `7ecf3cf6a0620b432faf15e8268d36ec54be30c49e418ae5aca12c983c6983a1`.

The evidence above checks output preservation, not improved semantic extraction. The 44 documents are synthetic, not a production-user sample. Timing budgets depend on machine load. No provider calls or paid generation were used. Separate commit/PR evidence below records checks on this patch alone before publication.

### This patch alone

Before publication, with the concept code restored to baseline: focused 5 tests passed; full suite 490 passed, 2 skipped; lint and typecheck passed. The same 44-document sweep and outcome checks were re-run and matched the baseline hashes above byte-for-byte.
