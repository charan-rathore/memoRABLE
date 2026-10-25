# PDF image object resolution

Base `689dc6c87efc70df54ccb6eb89741012747b793c`.

## Failure

pdf.js returns an operator list before all worker image objects are ready. Calling synchronous `page.objs.get(name)` at that point throws. The importer catches this and keeps a zero-dimension/null-PNG placeholder, so OCR never receives the image.

## Executed proof

A generated valid PDF contains a 200 x 100 RGB raster compressed with zlib. The real installed pdf.js reads the file, obtains the page/operator list, and passes it to actual `extractPageImages`. Baseline returned dimensions 0/0; callback-form object lookup returns 200/100 and a valid PNG. PNG IDAT is inflated with node:zlib and checked for expected orange pixels and 80,100 scanline bytes. Extracted PNG was opened and visually inspected: solid orange 200 x 100, no crop or missing raster.

Controls cover deduplicated names, immediately resolved adapters, thrown image errors, and a worker object that never resolves. The latter times out after 5 seconds rather than hanging readable-text import forever; fake timers verify cleanup. This is not a claim of actual OCR recognition quality or remote-worker deployment behavior.

## Regression

Final 495 unit/integration tests pass, 2 existing skips. Typecheck and lint pass. Production build passed before the timeout control. Desktop/mobile Chromium browser run: 30 PASS, 2 existing skips; the installed Playwright's preferred Chromium download failed, so local proof used already installed Chromium 1248 through a temporary config, not a repository dependency change. No browser test source changed.

The old source fails the actual raster test. Callback resolution does not alter synchronous resolved-image output. Full OCR throughput is not benchmarked; no speedup claimed.

## Fresh review correction

Current-head review caught global image promotion before merge: pdf.js uses `commonObjs` for `g_`-prefixed image names. Reproduced using a generated three-page PDF sharing one image XObject: page 2 failed on the first patch after the 5-second timeout. Selecting the global object pool makes all three pages pass with real pdf.js, including confirmation that a global name was observed. Full final: 496 PASS, 2 existing skips, type/lint/build pass. No public reply was posted and the initial head was not merged.

## Historical environment record

These measurements and tests ran locally. The retained qualification logs do not record the Node version or operating-system version for this run. Those historical details are unknown and must not be inferred from the current environment. Relative timings apply only to the stated local workload, not other machines or deployed services.
