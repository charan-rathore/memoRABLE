import { describe, expect, it } from "vitest";
import { importSource } from "../../src/import/import-source";
import { buildRelations } from "../../src/understanding/graph";
import { understand } from "../../src/understanding/index";
import type { DecisionsPayload } from "../../src/domain/memory/schema";

// Resume-shaped document: classified "resume", so Education/Certifications
// entries are faceted records living in the decisions display slot.
const RESUME = `# A. Rathore — Curriculum Vitae

## Experience
- 2022–2026 Staff Engineer, Atlas Robotics — led fleet-analytics launch
- 2019–2022 Senior Engineer, Meridian Ports — built port telemetry platform

## Education
- MSc Computer Science, ETH Zurich — 2019

## Certifications
- AWS Certified Solutions Architect — 2021

## Projects
- Harbor Sim: open-source port congestion simulator

## Skills
TypeScript, distributed systems, product-minded platform design

## Open questions
- computer science certification path
`;

describe("faceted records are not plan semantics downstream", () => {
  it("the resume fixture really does facet its decisions-slot records", () => {
    const r = importSource({ raw: RESUME, label: "resume.md" });
    if (!r.ok) throw new Error("import failed");
    const decisions = r.value.blocks.find((b) => b.kind === "decisions")?.payload as DecisionsPayload | undefined;
    expect(decisions && decisions.entries.length).toBeGreaterThan(0);
    expect(decisions!.entries.every((e) => e.facet !== undefined && e.commitment === undefined)).toBe(true);
  });

  it("buildRelations never relates a faceted record as a decision or action", () => {
    const r = importSource({ raw: RESUME, label: "resume.md" });
    if (!r.ok) throw new Error("import failed");
    const relations = buildRelations(r.value.blocks);
    const entryRefs = relations.filter((rel) =>
      [rel.from, rel.to].some((ref) => /^(decisions|actions):\d+$/.test(ref)),
    );
    expect(entryRefs).toEqual([]);
  });

  it("understand() never mines a commitment from a resume's record sections", () => {
    const u = understand({
      title: "A. Rathore — Curriculum Vitae",
      sections: [
        { headingText: "Experience", lines: [{ text: "Staff Engineer, Atlas Robotics", lineNo: 3 }] },
        { headingText: "Education", lines: [
          { text: "MSc Computer Science, ETH Zurich", lineNo: 6 },
          { text: "We decided to adopt Rust for the thesis compiler", lineNo: 7 },
        ] },
        { headingText: "Certifications", lines: [{ text: "AWS Certified Solutions Architect", lineNo: 10 }] },
        { headingText: "Projects", lines: [{ text: "Harbor Sim: port congestion simulator", lineNo: 13 }] },
        { headingText: "Skills", lines: [{ text: "TypeScript, distributed systems", lineNo: 16 }] },
      ],
    });
    expect(u.archetype.archetype).toBe("resume");
    expect(u.decisions).toEqual([]);
  });
});
