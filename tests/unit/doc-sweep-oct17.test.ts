/**
 * Document-sweep regressions (2026-10-17 corpus: itineraries, QBRs,
 * onboarding checklists, changelogs).
 */
import { describe, expect, it } from "vitest";
import { importSource } from "@/import/import-source";
import { inferTimeline } from "@/understanding/infer-events";
import type { Statement } from "@/understanding/inference";

function stmt(text: string, sectionTitle: string | null = null): Statement {
  // The real docs carry these as list items (itinerary bullets, QBR next-quarter bullets).
  return { text, sectionTitle, lineNo: 1, listItem: true };
}

describe("timeline titles after mid-sentence date removal", () => {
  it("drops the dangling preposition with the date", () => {
    const out = inferTimeline([
      stmt("Return depart Jaipur 21:05 on December 20, arrive Bengaluru 23:30"),
    ]);
    const titles = out.map((o) => o.value.title);
    expect(titles.length).toBeGreaterThan(0);
    expect(titles.some((t) => /on\s*,/.test(t))).toBe(false);
    expect(titles.some((t) => /,\s*,/.test(t))).toBe(false);
  });

  it("drops a trailing lead-in preposition left at the end", () => {
    const out = inferTimeline([
      stmt("Launch the private label pilot in 20 stores by November 15"),
    ]);
    const titles = out.map((o) => o.value.title);
    expect(titles.length).toBeGreaterThan(0);
    expect(titles[0]).not.toMatch(/\s(by|on|at|from|before|after|until|in)$/i);
  });

  it("does not glue two prepositions together", () => {
    const out = inferTimeline([
      stmt("Check in at Hotel Khetri House on December 18 after 14:00"),
    ]);
    const titles = out.map((o) => o.value.title);
    expect(titles.some((t) => /\bon\s+after\b/i.test(t))).toBe(false);
  });
});

describe("onboarding checklist: ordinal sections keep their todos", () => {
  const doc = `# New Hire Onboarding — Data Team

## Week 1
- [ ] Get laptop and badge from IT on day one
- [ ] Set up the warehouse sandbox account
- [ ] Meet your onboarding buddy

## Week 2
- [ ] Shadow two customer calls
- [ ] Ship a small docs fix to learn the review flow
`;
  it("week entries carry their checklist items as details", () => {
    const result = importSource({ raw: doc, label: "onboarding.md" });
    if (!result.ok) throw new Error("import failed");
    const timeline = result.value.blocks.find((b) => b.kind === "timeline");
    const entries = (timeline?.payload as { entries: Array<{ date: string; details?: string[] }> }).entries;
    const week1 = entries.find((e) => e.date === "Week 1");
    expect(week1).toBeDefined();
    expect(week1!.details).toBeDefined();
    expect(week1!.details!.some((d) => /Set up the warehouse sandbox/.test(d))).toBe(true);
  });

  it("checklist items are not duplicated into unrecognized snapshot notes", () => {
    const result = importSource({ raw: doc, label: "onboarding.md" });
    if (!result.ok) throw new Error("import failed");
    const snapshot = result.value.blocks.find((b) => b.kind === "snapshot");
    const notes = (snapshot?.payload as { notes?: string[] }).notes ?? [];
    expect(notes.some((n) => /Set up the warehouse sandbox/.test(n))).toBe(false);
    expect(notes.some((n) => /Shadow two customer calls/.test(n))).toBe(false);
  });
});

describe("changelog sections produce finished work, not empty memories", () => {
  const doc = `# Acme CLI — Release Notes

## v2.4.0 — September 30, 2026

### Added
- Added a --watch flag to the build command
- Added support for TOML config files

### Fixed
- Fixed a crash when the cache directory is read-only
`;
  it("extracts changelog entries as done actions", () => {
    const result = importSource({ raw: doc, label: "release-notes.md" });
    if (!result.ok) throw new Error("import failed");
    const actions = result.value.blocks.find((b) => b.kind === "actions");
    const entries = (actions?.payload as { entries: Array<{ task: string; status: string }> }).entries;
    expect(entries.length).toBeGreaterThanOrEqual(3);
    expect(entries.some((e) => /--watch flag/.test(e.task))).toBe(true);
    expect(entries.some((e) => /cache directory is read-only/.test(e.task))).toBe(true);
    expect(entries.every((e) => e.status === "done")).toBe(true);
  });
});
