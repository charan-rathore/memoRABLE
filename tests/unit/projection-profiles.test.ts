/**
 * Adaptive memory projection: universal observations → archetype blocks.
 * Specialized: Resume · Invoice · Research. Fallback: Generic Knowledge.
 */
import { describe, expect, it } from "vitest";
import { importSource } from "@/import/import-source";
import {
  applyProjectionTitles,
  bucketLabel,
  isKindApplicable,
  memoryProjectionFor,
  projectAdaptiveMemories,
  projectionProfileFor,
} from "@/understanding/projection-profiles";
import { classifyHeading } from "@/import/text/sections";
import { classifyArchetype } from "@/understanding/archetype";

describe("adaptive memory projection", () => {
  it("keeps Generic Knowledge on the classic six memories", () => {
    const spec = memoryProjectionFor("generic");
    expect(spec.applicable).toEqual([
      "snapshot",
      "signals",
      "decisions",
      "timeline",
      "risks",
      "actions",
    ]);
    expect(spec.emptyApplicable).toBe("keep");
    expect(projectionProfileFor("generic").signals.label).toBe("Signals");
    expect(bucketLabel("generic", "decisions")).toBe("Decisions");
    expect(bucketLabel("generic", "risks")).toBe("Risks");
    expect(bucketLabel("generic", "actions")).toBe("Actions");
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
    expect(memoryProjectionFor("resume").applicable).toEqual([
      "timeline",
      "actions",
      "signals",
      "decisions",
      "risks",
      "snapshot",
    ]);
  });

  it("projects former specialized types (menu/job/prd) as Generic Knowledge", () => {
    expect(isKindApplicable("menu", "timeline")).toBe(true);
    expect(isKindApplicable("job", "timeline")).toBe(true);
    expect(isKindApplicable("prd", "timeline")).toBe(true);
    expect(bucketLabel("prd", "signals")).toBe("Signals");
    expect(memoryProjectionFor("prd").emptyApplicable).toBe("keep");
  });

  it("projects invoice as Vendor / Line items / Payment / Timeline / Totals", () => {
    const spec = memoryProjectionFor("invoice");
    expect(bucketLabel("invoice", "decisions")).toBe("Vendor");
    expect(bucketLabel("invoice", "signals")).toBe("Line items");
    expect(bucketLabel("invoice", "actions")).toBe("Payment");
    expect(bucketLabel("invoice", "timeline")).toBe("Timeline");
    expect(bucketLabel("invoice", "risks")).toBe("Totals");
    expect(spec.applicable).toEqual([
      "decisions",
      "signals",
      "actions",
      "timeline",
      "risks",
      "snapshot",
    ]);
  });

  it("projects research as Hypothesis / Method / Results / Limitations / Future work", () => {
    expect(bucketLabel("research", "decisions")).toBe("Hypothesis");
    expect(bucketLabel("research", "signals")).toBe("Method");
    expect(bucketLabel("research", "timeline")).toBe("Results");
    expect(bucketLabel("research", "risks")).toBe("Limitations");
    expect(bucketLabel("research", "actions")).toBe("Future work");
  });

  it("defaults unidentified documents to Generic Knowledge, never PRD", () => {
    expect(memoryProjectionFor("other").furniture.signals.label).toBe("Signals");
    expect(memoryProjectionFor("other").applicable).toHaveLength(6);
    expect(memoryProjectionFor(null).furniture.decisions.label).toBe("Decisions");
    expect(memoryProjectionFor("not-a-real-type").emptyApplicable).toBe("keep");
    expect(memoryProjectionFor("generic").furniture.snapshot.label).toBe("Snapshot");
  });

  it("stamps titles without changing kinds", () => {
    const stamped = applyProjectionTitles([{ kind: "signals" as const }, { kind: "timeline" as const }], "resume");
    expect(stamped[0]).toEqual({ kind: "signals", title: "Skills" });
    expect(stamped[1]).toEqual({ kind: "timeline", title: "Experience" });
  });

  it("omits empty resume kinds and keeps Profile", () => {
    const projected = projectAdaptiveMemories(
      [
        {
          kind: "snapshot" as const,
          title: "",
          payload: { heading: "Jane", summary: "Engineer" },
        },
        {
          kind: "signals" as const,
          title: "",
          payload: { entries: [{ label: "TypeScript", implication: "Primary language" }] },
        },
        { kind: "decisions" as const, title: "", payload: { entries: [] } },
        {
          kind: "timeline" as const,
          title: "",
          payload: { entries: [{ date: "2021–Present", title: "Staff Engineer", state: "done" }] },
        },
        { kind: "risks" as const, title: "", payload: { entries: [] } },
        { kind: "actions" as const, title: "", payload: { entries: [] } },
      ],
      "resume",
    );
    expect(projected.map((b) => b.kind)).toEqual(["timeline", "signals", "snapshot"]);
    expect(projected.map((b) => b.title)).toEqual(["Experience", "Skills", "Profile"]);
  });

  it("keeps all six Generic Knowledge buckets even when empty", () => {
    const projected = projectAdaptiveMemories(
      [
        { kind: "snapshot" as const, title: "", payload: { heading: "Notes", summary: "Meeting notes" } },
        { kind: "signals" as const, title: "", payload: { entries: [] } },
        { kind: "decisions" as const, title: "", payload: { entries: [] } },
        { kind: "timeline" as const, title: "", payload: { entries: [] } },
        { kind: "risks" as const, title: "", payload: { entries: [] } },
        { kind: "actions" as const, title: "", payload: { entries: [] } },
      ],
      "generic",
    );
    expect(projected.map((b) => b.kind)).toEqual([
      "snapshot",
      "signals",
      "decisions",
      "timeline",
      "risks",
      "actions",
    ]);
    expect(projected.map((b) => b.title)).toEqual([
      "Snapshot",
      "Signals",
      "Decisions",
      "Timeline",
      "Risks",
      "Actions",
    ]);
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

  it("classifies with raw scores, margin, and Generic Knowledge fallback", () => {
    const resume = classifyArchetype({
      title: "Jane Doe",
      headings: ["Work Experience", "Education", "Projects", "Skills"],
      bodySample: "jane@example.com\n+1 (415) 555-0100\nBuilt systems at Acme",
    });
    expect(resume.archetype).toBe("resume");
    expect(resume.score).toBeGreaterThanOrEqual(10);
    expect(resume.scores.resume).toBeGreaterThan(resume.scores.research);
    expect(resume.scores.resume - Math.max(resume.scores.research, resume.scores.invoice)).toBeGreaterThanOrEqual(4);
    expect(resume.reasons).toEqual(expect.arrayContaining(["Education", "Experience", "Projects", "Skills"]));
    expect(resume.label).toBe("Resume");

    const meeting = classifyArchetype({
      title: "Sprint planning notes",
      headings: ["Attendees", "Action items"],
      bodySample: "Meeting notes\nAttendees: Alice, Bob\nAction items follow-ups",
    });
    expect(meeting.archetype).toBe("generic");
    expect(meeting.label).toBe("Generic Knowledge");
    expect(meeting.score).toBeUndefined();
    expect(meeting.scores).toEqual({ resume: 0, research: 0, invoice: 0 });

    const prd = classifyArchetype({
      title: "Product Requirements",
      headings: ["User Stories", "Acceptance Criteria"],
      bodySample: "PRD with functional requirements and non-functional goals",
    });
    expect(prd.archetype).toBe("generic");
    expect(prd.label).toBe("Generic Knowledge");
    expect(prd.score).toBeUndefined();
  });

  it("accepts resume heading synonyms (Employment / Work History)", () => {
    const result = classifyArchetype({
      title: "Alex Rivera",
      headings: ["Employment", "Education", "Technical Skills", "Portfolio"],
      bodySample: "alex@school.edu",
    });
    expect(result.archetype).toBe("resume");
    expect(result.reasons).toEqual(
      expect.arrayContaining(["Experience", "Education", "Skills", "Projects", "Email"]),
    );
  });

  it("keeps hybrid resume+research as Generic when margin is thin", () => {
    const hybrid = classifyArchetype({
      title: "Research intern CV",
      headings: ["Experience", "Education", "Abstract", "Methodology", "Results", "References"],
      bodySample: "Hypothesis tested on a dataset",
    });
    // Resume cues: Experience 4 + Education 4 = 8 (maybe Projects/Skills absent)
    // Research: Abstract 4 + Method 4 + Results 4 + References 3 + Hypothesis 2 + Dataset 2 = high
    // If research wins with enough margin → research; if close → generic.
    // Either specialized-with-margin or Generic is fine; never a weak mislabel.
    if (hybrid.archetype !== "generic") {
      expect(hybrid.score).toBeGreaterThanOrEqual(10);
      const scores = [hybrid.scores.resume, hybrid.scores.research, hybrid.scores.invoice].sort(
        (a, b) => b - a,
      );
      expect(scores[0]! - scores[1]!).toBeGreaterThanOrEqual(4);
    } else {
      expect(hybrid.score).toBeUndefined();
    }
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
    expect(typeof result.value.archetype?.score).toBe("number");
    expect(result.value.archetype?.scores?.resume).toBeGreaterThanOrEqual(10);
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

  it("projects job posts as Generic Knowledge, not a specialized archetype", () => {
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
    expect(result.value.archetype?.id).toBe("generic");
    expect(result.value.archetype?.label).toBe("Generic Knowledge");
    expect(result.value.blocks.map((b) => b.title)).toEqual([
      "Snapshot",
      "Signals",
      "Decisions",
      "Timeline",
      "Risks",
      "Actions",
    ]);
  });
});
