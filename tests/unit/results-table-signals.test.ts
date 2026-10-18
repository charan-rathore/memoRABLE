/**
 * Measurement tables under "## Results" are signals, not timeline furniture
 * (2026-10-19 nightly pass; table-as-evidence lineage from Docling's table
 * structure model, already this project's sidecar).
 *
 * "results" routes to Timeline for research-paper prose findings. But a lab
 * report's Results is a measurement table: rows like
 * | Hemoglobin | 14.2 g/dL | 13.0 - 17.0 | failed every timeline parser and
 * landed as unrecognized notes while Signals stayed empty. When the section
 * body is table-shaped measurements, the rows take the existing signals
 * table-row contract (label / value / third cell).
 */
import { describe, expect, it } from "vitest";
import { importSource } from "@/import/import-source";

const labReport = `# Lab Report — Metabolic Panel

Report date: October 10, 2026. Fasting glucose is above the reference range.

## Results
| Test | Value | Reference |
| Hemoglobin | 14.2 g/dL | 13.0 - 17.0 |
| Fasting glucose | 108 mg/dL | 70 - 99 |
| Vitamin D | 22 ng/mL | 30 - 100 |

## Notes
- Repeat the glucose test in 3 months
`;

const research = `# Retrieval Calibration Under Distribution Shift

## Abstract
We study whether retrieval quality degrades when enterprise documents drift from the training distribution of the embedding model.

## Method
- We sampled 40,000 paragraphs from 12 internal wikis across 6 quarters
- We measured recall at 10 for three embedding models per quarter

## Results
- Recall fell by 8 to 14 points for models older than two quarters
- A lightweight adapter recovered 70% of the drop

## Conclusion
Retrieval pipelines need scheduled recalibration, not one-time tuning.
`;

describe("measurement tables under Results", () => {
  it("extracts rows as signals", () => {
    const result = importSource({ raw: labReport, label: "lab-report.md" });
    if (!result.ok) throw new Error("import failed");
    const signals = result.value.blocks.find((b) => b.kind === "signals");
    const entries = (signals?.payload as { entries?: Array<{ label: string; value?: string }> }).entries ?? [];
    expect(entries.length).toBeGreaterThanOrEqual(3);
    const hb = entries.find((e) => e.label === "Hemoglobin");
    expect(hb).toBeDefined();
    expect(hb!.value).toBe("14.2 g/dL");
  });

  it("does not leave the rows as unrecognized notes", () => {
    const result = importSource({ raw: labReport, label: "lab-report.md" });
    if (!result.ok) throw new Error("import failed");
    const timeline = result.value.blocks.find((b) => b.kind === "timeline");
    const notes = (timeline?.payload as { notes?: string[] }).notes ?? [];
    expect(notes.some((n) => /Hemoglobin/.test(n))).toBe(false);
  });

  it("keeps prose research findings on the timeline path", () => {
    const result = importSource({ raw: research, label: "research-abstract.md" });
    if (!result.ok) throw new Error("import failed");
    const timeline = result.value.blocks.find((b) => b.kind === "timeline");
    const entries = (timeline?.payload as { entries?: Array<{ title: string }> }).entries ?? [];
    expect(entries.some((e) => /Recall fell/.test(e.title))).toBe(true);
  });
});
