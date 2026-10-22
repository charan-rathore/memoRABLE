/**
 * NegEx-style topical-scope guard for risk reading.
 *
 * Classic clinical-NLP NegEx (Chapman et al.) scopes trigger terms: a term
 * inside the scope of a trigger is cited, not asserted. The same disease hits
 * keyword risk reading: "She covers the failure modes of RAG pipelines"
 * mentions failure as a *topic of talk*, while "Two suppliers missed delivery
 * windows" asserts one. A risk register full of cited topics teaches the
 * reader to stop looking — precision beats recall here by design.
 */
import { describe, expect, it } from "vitest";
import { readRisk } from "@/understanding/inference";
import { importSource } from "@/import/import-source";

describe("topical-scope guard for risk reading", () => {
  it("does not read a covered topic as a risk", () => {
    expect(
      readRisk(
        "She covers the failure modes of RAG pipelines that paraphrase without provenance, and shows the evaluation harness her team uses to catch invented memories",
      ),
    ).toBeNull();
  });

  it("does not read a discussed danger as a risk", () => {
    expect(
      readRisk("In her talk she discusses the dangers of unbounded tool loops in production agents"),
    ).toBeNull();
    expect(readRisk("The workshop explains why the migration stalled last spring")).toBeNull();
  });

  it("still reads asserted trouble", () => {
    expect(readRisk("Two suppliers missed delivery windows twice")).not.toBeNull();
    expect(
      readRisk("Stale catalog entries served for up to 6 hours after a price change, leading to 41 pricing disputes in August"),
    ).not.toBeNull();
    expect(readRisk("If return rates keep climbing, margin guidance for Q4 is at risk")).not.toBeNull();
  });

  it("a speaker bio produces no spurious risk entry", () => {
    const doc = `# Nandini Rao — Speaker Bio

Nandini Rao, Staff Engineer at Fable Systems. She maintains a popular open-source chunking library.

## Talk: Building memory that cites its sources

She covers the failure modes of RAG pipelines that paraphrase without provenance, and shows the evaluation harness her team uses to catch invented memories.
`;
    const result = importSource({ raw: doc, label: "speaker-bio.md" });
    if (!result.ok) throw new Error("import failed");
    const risks = result.value.blocks.find((b) => b.kind === "risks");
    const entries = (risks?.payload as { entries?: Array<{ risk: string }> }).entries ?? [];
    expect(entries.some((e) => /failure modes of RAG pipelines/.test(e.risk))).toBe(false);
  });
});
