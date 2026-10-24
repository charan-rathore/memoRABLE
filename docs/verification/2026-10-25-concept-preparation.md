# Prepare retained concept comparison forms once

This follows dedupe preparation in PR #82 but changes a different hot path: concept containment filtering in `dropContainedPhrases()`. It repeatedly normalized and stemmed every retained concept inside each comparison. This change stores each retained concept's normalized key and stems once. The same key inclusion and two-common-stem rules are used in the same order.

No concept output or matching threshold change is intended. The number of pairwise comparisons is still quadratic. It does not make a universal linear-time claim.

## Verification

Baseline before both optimizations: main `5d3291ebc13bf0a0641176cafe7c7fea1c66b6ee`. Linux x64, Node 22.23.3.

- Actual `importSource()` header-heavy 4,000-heading regression: baseline 3,951 ms, fails 2,000 ms budget; both patched 646 ms, passes. These are individual local observations, not portable speed guarantees.
- Combined full suite: 491 pass, 2 skip; lint, typecheck, production build pass.
- Actual public importer, 44 authored synthetic documents: 0 import failures. Detailed sweep SHA-256 `28d4bb4b2c38a2b82f3293327825c5d379d84a8d109dea6ecf09d301fc5dae43`; outcome-view SHA-256 `7ecf3cf6a0620b432faf15e8268d36ec54be30c49e418ae5aca12c983c6983a1`. Each is byte-identical against baseline.

No paid generation or provider calls. The corpus is synthetic, not production traffic. This evidence checks output preservation rather than semantic-quality gains. The separate dedupe change has its own decision and proof in `2026-10-25-dedupe-preparation.md`.
