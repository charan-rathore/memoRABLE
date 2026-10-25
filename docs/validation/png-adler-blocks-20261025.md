# PNG checksum throughput

Based on merged #85, commit `d54167a` (PDF worker image resolution).

The browser OCR PNG fallback computed Adler-32 with two modulo operations for every raster byte. Accumulate 5,552-byte blocks, then reduce: the standard safe block bound for 32-bit Adler sums. Output bytes do not change.

## Executed checks

- Actual full `encodeRgbaPng` on a 1,000 x 1,000 RGBA raster: baseline five-trial median 131.09 ms for four encodes; candidate 66.03 ms. A separate local comparative 100 ms budget was RED on baseline and GREEN on candidate. This is local evidence, not a timing threshold committed to CI.
- Four committed dimensions (1 x 1, 100 x 100, 257 x 129, 1,000 x 1,000): actual PNG IDAT inflated with `node:zlib`, which validates the checksum. All scanline bytes equal the input raster plus filter markers. Both baseline and candidate pass correctness controls.
- Full encoded PNG bytes were identical on baseline and candidate for a deterministic 200 x 100 raster. The candidate PNG was opened and its actual pixels inspected: patterned grid, no corruption.
- After rebasing onto merged #85, the full suite had 500 PASS and 2 existing skips. Typecheck, lint and build passed. The first build hit a full scratch disk; removing only this task's rebuildable artifacts cleared it and the final build passed.

## Limits

No dependency, API, schema, UI or OCR recognition-policy change. Timing is an actual encoder-only Node measurement, not an end-to-end OCR speedup claim. CI, browser checks and fresh reviews remained required before merge.

## Historical environment record

These measurements and tests ran locally. The retained qualification logs do not record the Node version or operating-system version for this run. Those historical details are unknown and must not be inferred from the current environment. Relative timings apply only to the stated local workload, not other machines or deployed services.
