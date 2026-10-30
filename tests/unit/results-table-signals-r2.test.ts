/**
 * Codex review round 2 on Results-table routing (PR #51): the re-route must
 * only fire for a section that IS a measurement table — dominant rows, a real
 * markdown table (header + separator), no date columns — and it must recognize
 * numbered / colon-terminated Results headings.
 */
import { describe, expect, it } from "vitest";
import { importSource } from "@/import/import-source";

function blocks(doc: string) {
  const result = importSource({ raw: doc, label: "doc.md" });
  if (!result.ok) throw new Error("import failed");
  const signals = result.value.blocks.find((b) => b.kind === "signals");
  const timeline = result.value.blocks.find((b) => b.kind === "timeline");
  return {
    signalEntries: (signals?.payload as { entries?: Array<{ label: string; value?: string }> }).entries ?? [],
    timelineEntries: (timeline?.payload as { entries?: Array<{ title: string }> }).entries ?? [],
    timelineNotes: (timeline?.payload as { notes?: string[] }).notes ?? [],
  };
}

describe("codex r2: measurement rows must dominate the section", () => {
  it("a small table inside prose results does not reroute", () => {
    const doc = `# Study Summary

## Results
Recall fell by 8 to 14 points for models older than two quarters. A lightweight adapter recovered most of the drop. The effect held across all six quarters of the sample. Scheduled recalibration beat one-time tuning in every configuration we tried.

| Model | Score |
| Alpha | 91 |
| Beta | 87 |
`;
    const { signalEntries } = blocks(doc);
    expect(signalEntries.some((e) => e.label === "Alpha")).toBe(false);
    expect(signalEntries.some((e) => e.label === "Model")).toBe(false);
  });
});

describe("codex r2: numbered and colon-terminated Results headings", () => {
  it("'## 4. Results' reroutes", () => {
    const doc = `# Lab Report

## 4. Results
| Test | Value | Reference |
| --- | --- | --- |
| Hemoglobin | 14.2 g/dL | 13.0 - 17.0 |
| Fasting glucose | 108 mg/dL | 70 - 99 |
`;
    const { signalEntries } = blocks(doc);
    expect(signalEntries.some((e) => e.label === "Hemoglobin")).toBe(true);
  });

  it("'## Results:' reroutes", () => {
    const doc = `# Lab Report

## Results:
| Test | Value | Reference |
| --- | --- | --- |
| Hemoglobin | 14.2 g/dL | 13.0 - 17.0 |
| Fasting glucose | 108 mg/dL | 70 - 99 |
`;
    const { signalEntries } = blocks(doc);
    expect(signalEntries.some((e) => e.label === "Hemoglobin")).toBe(true);
  });
});

describe("codex r2: separator-less pipe rows are not a table", () => {
  it("a header without a separator is never emitted as a signal", () => {
    const doc = `# Lab Report

## Results
| Test | Value | Reference |
| Hemoglobin | 14.2 g/dL | 13.0 - 17.0 |
| Fasting glucose | 108 mg/dL | 70 - 99 |
`;
    const { signalEntries } = blocks(doc);
    expect(signalEntries.some((e) => e.label === "Test")).toBe(false);
    expect(signalEntries.some((e) => e.value === "Value")).toBe(false);
  });
});

describe("codex r2: date columns are not measurements", () => {
  it("a date/event table under Results stays off Signals", () => {
    const doc = `# Program Outcomes

## Results
| Milestone | Date | Owner |
| --- | --- | --- |
| Beta launch | March 3, 2027 | Priya |
| GA release | 2027-05-14 | Rohan |
`;
    const { signalEntries, timelineEntries, timelineNotes } = blocks(doc);
    expect(signalEntries.some((e) => e.label === "Beta launch")).toBe(false);
    // Untouched by the reroute: the rows remain visible somewhere.
    const visible = JSON.stringify([timelineEntries, timelineNotes]);
    expect(/Beta launch/.test(visible) || signalEntries.length === 0).toBe(true);
  });
});
