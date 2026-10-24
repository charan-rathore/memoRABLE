# Preserve readable PDF text when optional OCR startup fails

Base: bdd38b4f736710088f32fb1cde8dfbd7ef4a2fcf (main after #83).

The PDF reader treats image extraction as best-effort, but awaited ocrImages without catching startup failures. A Tesseract initialization rejection therefore discarded already parsed layout text. Catch optional OCR failure at the readPdfBytes caller and continue with the layout and zero OCR blocks.

Do not change the lower-level ocrImages rejection contract. Existing ocr-worker-recovery tests explicitly require startup rejection to reach direct callers, concurrent callers to share failure, and a later attempt to retry. An initial private helper-level proposal failed those two existing tests and was abandoned before publication. The final change does not modify ocr.ts or its recovery/ownership/timeout tests.

## Executed proof

The new test generates valid PDF bytes containing readable text and a 200x200 RGB image. It runs actual pdf.js parsing, image extraction/PNG encoding, layout, readPdfBytes and ocrImages. Only Tesseract worker creation is stubbed to reject. Baseline rejects instead of returning parsed text; patched returns readable text, one extracted image and zero OCR blocks. A second import with a working stub recovers image text and one OCR block, proving the failed worker slot is not poisoned.

This is actual PDF-pipeline proof with a worker-start failure seam, not live Tesseract or browser OCR proof. The existing repository PDF did not enter OCR in this Node path, so it was not used to claim failure coverage.

- Full regression: 492 PASS, 2 existing skips, 75 files.
- Final affected OCR tests: 6 PASS, including all unchanged recovery/ownership/timeout controls and the expanded real-PDF regression.
- Final lint and typecheck PASS; production build PASS.

No layout/extraction/semantic policy, dependencies or worker retry contracts changed. No claim that a forever-pending startup is bounded, or that partial OCR blocks survive a later rejected call. If a PDF has no readable text and OCR yields no blocks, the existing no-readable-text error remains.
