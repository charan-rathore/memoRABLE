/**
 * Adaptive memory projection: universal observations → archetype blocks.
 */
import { describe, expect, it } from "vitest";
import { importSource } from "@/import/import-source";
import {
  applyProjectionTitles,
  bucketLabel,
  isKindApplicable,
  memoryProjectionFor,
  NOT_APPLICABLE_NOTE,
  projectAdaptiveMemories,
  projectionProfileFor,
} from "@/understanding/projection-profiles";
import { classifyHeading } from "@/import/text/sections";

describe("adaptive memory projection", () => {
  it("keeps PRD on the classic six memories", () => {
    const spec = memoryProjectionFor("prd");
    expect(spec.applicable).toEqual([
      "snapshot",
      "signals",
      "decisions",
      "timeline",
      "risks",
      "actions",
    ]);
    expect(spec.emptyApplicable).toBe("keep");
    expect(projectionProfileFor("prd").signals.label).toBe("Signals");
  });

  it("declares resume furniture without Risks / Decisions / Actions labels", () => {
    expect(bucketLabel("resume", "signals")).toBe("Skills");
    expect(bucketLabel("resume", "timeline")).toBe("Experience");
    expect(bucketLabel("resume", "actions")).toBe("Projects");
    expect(bucketLabel("resume", "decisions")).toBe("Education");
    expect(bucketLabel("resume", "risks")).toBe("Achievements");
    expect(bucketLabel("resume", "risks")).not.toBe("Risks");
    expect(bucketLabel("resume", "decisions")).not.toBe("Decisions");
    expect(bucketLabel("resume", "actions")).not.toBe("Actions");
    expect(memoryProjectionFor("resume").emptyApplicable).toBe("omit");
  });

  it("marks timeline inapplicable for menu / job / glossary", () => {
    expect(isKindApplicable("menu", "timeline")).toBe(false);
    expect(isKindApplicable("job", "timeline")).toBe(false);
    expect(isKindApplicable("glossary", "timeline")).toBe(false);
    expect(isKindApplicable("prd", "timeline")).toBe(true);
  });

  it("projects invoice as Vendor / Line items / Payment / Timeline / Totals", () => {
    const spec = memoryProjectionFor("invoice");
    expect(bucketLabel("invoice", "decisions")).toBe("Vendor");
    expect(bucketLabel("invoice", "signals")).toBe("Line items");
    expect(bucketLabel("invoice", "actions")).toBe("Payment");
    expect(bucketLabel("invoice", "timeline")).toBe("Timeline");
    expect(bucketLabel("invoice", "risks")).toBe("Totals");
    expect(spec.applicable).toEqual([
      "snapshot",
      "decisions",
      "signals",
      "actions",
      "timeline",
      "risks",
    ]);
  });

  it("projects research as Hypothesis / Method / Results / Limitations / Future work", () => {
    expect(bucketLabel("research", "decisions")).toBe("Hypothesis");
    expect(bucketLabel("research", "signals")).toBe("Method");
    expect(bucketLabel("research", "timeline")).toBe("Results");
    expect(bucketLabel("research", "risks")).toBe("Limitations");
    expect(bucketLabel("research", "actions")).toBe("Future work");
  });

  it("defaults unidentified documents to the PRD six-memory architecture", () => {
    expect(memoryProjectionFor("other").furniture.signals.label).toBe("Signals");
    expect(memoryProjectionFor("other").applicable).toHaveLength(6);
    expect(memoryProjectionFor(null).furniture.decisions.label).toBe("Decisions");
    expect(memoryProjectionFor("not-a-real-type").emptyApplicable).toBe("keep");
  });

  it("stamps titles without changing kinds", () => {
    const stamped = applyProjectionTitles([{ kind: "signals" as const }, { kind: "timeline" as const }], "resume");
    expect(stamped[0]).toEqual({ kind: "signals", title: "Skills" });
    expect(stamped[1]).toEqual({ kind: "timeline", title: "Experience" });
  });

  it("omits empty inapplicable kinds and promotes overflow content", () => {
    const projected = projectAdaptiveMemories(
      [
        {
          kind: "snapshot" as const,
          title: "",
          payload: { heading: "Lunch", summary: "Seasonal menu" },
        },
        {
          kind: "signals" as const,
          title: "",
          payload: { entries: [{ label: "Soup", implication: "Cup 6" }] },
        },
        { kind: "decisions" as const, title: "", payload: { entries: [] } },
        { kind: "timeline" as const, title: "", payload: { entries: [] } },
        {
          kind: "risks" as const,
          title: "",
          payload: { entries: [{ risk: "Contains peanuts" }] },
        },
        { kind: "actions" as const, title: "", payload: { entries: [] } },
      ],
      "menu",
    );
    expect(projected.map((b) => b.kind)).toEqual(["snapshot", "signals", "risks"]);
    expect(projected.map((b) => b.title)).toEqual(["Menu", "Dishes", "Allergens"]);
    expect(
      projected.every((b) => {
        const notes = "notes" in b.payload ? ((b.payload.notes as string[] | undefined) ?? []) : [];
        return !notes.includes(NOT_APPLICABLE_NOTE);
      }),
    ).toBe(true);
  });

  it("marks empty required glossary terms as not applicable", () => {
    const projected = projectAdaptiveMemories(
      [
        { kind: "snapshot" as const, payload: { heading: "Terms", summary: "API glossary" } },
        { kind: "signals" as const, payload: { entries: [] } },
        { kind: "decisions" as const, payload: { entries: [] } },
        { kind: "timeline" as const, payload: { entries: [] } },
        { kind: "risks" as const, payload: { entries: [] } },
        { kind: "actions" as const, payload: { entries: [] } },
      ],
      "glossary",
    );
    // Snapshot + required Terms (N/A) + empty Conventions kept as N/A under glossary policy.
    expect(projected.map((b) => b.kind)).toEqual(["snapshot", "signals", "decisions"]);
    expect(projected.find((b) => b.kind === "signals")!.payload).toMatchObject({
      notes: [NOT_APPLICABLE_NOTE],
    });
    expect(projected.find((b) => b.kind === "decisions")!.payload).toMatchObject({
      notes: [NOT_APPLICABLE_NOTE],
    });
    expect(projected.some((b) => b.kind === "timeline")).toBe(false);
  });

  it("routes resume / invoice / research headings into universal kinds", () => {
    expect(classifyHeading("Work Experience")).toBe("timeline");
    expect(classifyHeading("Education")).toBe("decisions");
    expect(classifyHeading("Skills")).toBe("signals");
    expect(classifyHeading("Projects")).toBe("actions");
    expect(classifyHeading("Awards")).toBe("risks");
    expect(classifyHeading("Vendor")).toBe("decisions");
    expect(classifyHeading("Line items")).toBe("signals");
    expect(classifyHeading("Totals")).toBe("risks");
    expect(classifyHeading("Payment")).toBe("actions");
    expect(classifyHeading("Hypothesis")).toBe("decisions");
    expect(classifyHeading("Methodology")).toBe("signals");
    expect(classifyHeading("Limitations")).toBe("risks");
    expect(classifyHeading("Future Work")).toBe("actions");
  });

  it("applies resume adaptive projection end-to-end on import", () => {
    const resume = `# Jane Doe — Resume

## Summary
Product engineer with a bias for shipping.

## Work Experience
- Acme Corp — Staff Engineer — 2021–Present

## Education
- B.S. Computer Science, State University

## Skills
- TypeScript, Systems design

## Projects
- Built an open-source memory layer
`;
    const result = importSource({ raw: resume, label: "jane-doe-resume.md" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.archetype?.id).toBe("resume");
    const kinds = result.value.blocks.map((b) => b.kind);
    const titles = result.value.blocks.map((b) => b.title);
    expect(titles).toContain("Profile");
    expect(titles).toContain("Skills");
    expect(titles).toContain("Experience");
    expect(titles).toContain("Education");
    expect(titles).toContain("Projects");
    // No Awards section → Achievements omitted, not an extraction failure.
    expect(titles).not.toContain("Achievements");
    expect(kinds).not.toContain("risks");
    expect(
      result.value.warnings.some(
        (w) => w.code === "text.no-blocks-recognized" && /achievement|risk/i.test(w.message),
      ),
    ).toBe(false);
  });

  it("does not treat missing timeline as failure for a job post", () => {
    const job = `# Staff Engineer

We're hiring a Staff Engineer for the platform team.

## Job description
Own the memory layer end to end.

## Responsibilities
- Ship the memory layer

## Qualifications
- 5+ years TypeScript

## Compensation
Competitive salary and equity.

## Apply by
Email careers@example.com with your portfolio link.
`;
    const result = importSource({ raw: job, label: "staff-engineer-jd.md" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.archetype?.id).toBe("job");
    expect(result.value.blocks.some((b) => b.kind === "timeline")).toBe(false);
    expect(
      result.value.warnings.some(
        (w) => w.code === "text.no-blocks-recognized" && /timeline/i.test(w.message),
      ),
    ).toBe(false);
  });
});
