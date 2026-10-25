# PNG checksum throughput

Based on mergedd54167a (PDF worker image resolution).

The browser OCR PNG fallback computed Adler-32 with two modulo operations for every raster byte. Accumulate5552-byte blocks then reduce, the standard safe block bound for32-bit Adler sums. Output bytes do not change.

## Executed checks

- Actual full encodeRgbaPng on a1000x1000RGBA raster: baseline5trial median131.09ms/four encodes, candidate66.03ms. Local comparative100msbudget run separately RED on baseline, GREEN on candidate. This wall-clock gate is local evidence, not a flaky CI threshold committed to tests.
- Four committed dimensions1x1,100x100,257x129,1000x1000: actual PNG IDAT inflated with node:zlib, which validates checksum, and all scanline bytes compare equal to the input raster plus filter markers. Both baseline and candidate pass correctness controls.
- Full encoded PNG bytes compared identical across baseline/candidate for deterministic200x100raster. CandidatePNG opened and actual pixels inspected: patterned grid, no corruption.
- After rebasing onto merged85, full500tests pass2existing skips; typecheck/lint/build pass. First build hit full scratchdisk; removing only this task's rebuildable artifacts cleared it and final build passed.

No dependency, API, schema, UI or OCR recognition policy change. Timing is actual encoder-only Node measurement, not an end-to-end OCR speedup claim. CI/browser rerun and fresh reviews required before merge.
