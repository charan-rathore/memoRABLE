import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  isDoclingRefinementBetter,
  shouldRefineWithDocling,
} from "@/import/docgraph/select";

describe("Docling selective refine", () => {
  const prev = process.env.NEXT_PUBLIC_DOCGRAPH;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_DOCGRAPH = "1";
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_DOCGRAPH;
    else process.env.NEXT_PUBLIC_DOCGRAPH = prev;
  });

  it("never selects Resume / Invoice after fast archetype win", () => {
    expect(
      shouldRefineWithDocling({
        fileName: "Charan_Rathore.pdf",
        pages: 1,
        text: "Experience Education Skills",
        archetype: "resume",
      }),
    ).toBe(false);
    expect(
      shouldRefineWithDocling({
        fileName: "invoice.pdf",
        pages: 2,
        text: "Invoice Total Due",
        archetype: "invoice",
      }),
    ).toBe(false);
  });

  it("selects long research-like PDFs", () => {
    expect(
      shouldRefineWithDocling({
        fileName: "paper.pdf",
        pages: 24,
        text: "Abstract Methods Results",
        archetype: "research",
      }),
    ).toBe(true);
  });

  it("is off when feature flag is unset", () => {
    delete process.env.NEXT_PUBLIC_DOCGRAPH;
    expect(
      shouldRefineWithDocling({
        fileName: "paper.pdf",
        pages: 30,
        text: "Abstract",
        archetype: "research",
      }),
    ).toBe(false);
  });

  it("rejects refinements that would regress Resume/Invoice", () => {
    expect(
      isDoclingRefinementBetter({
        beforeArchetype: "resume",
        afterArchetype: "resume",
        beforeBlockCount: 5,
        afterBlockCount: 6,
        beforeEvidence: 1,
        afterEvidence: 2,
        beforeText: "a",
        afterText: "b",
      }),
    ).toBe(false);
  });

  it("accepts research refinements with more blocks or evidence", () => {
    expect(
      isDoclingRefinementBetter({
        beforeArchetype: "research",
        afterArchetype: "research",
        beforeBlockCount: 4,
        afterBlockCount: 6,
        beforeEvidence: 1,
        afterEvidence: 1,
        beforeText: "# A\n",
        afterText: "# A\n## B\n## C\n## D\n",
      }),
    ).toBe(true);
  });
});
