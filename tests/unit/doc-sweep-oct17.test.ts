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

describe("codex review regressions (PR #45)", () => {
  it("does not route a generic 'Security' heading to Actions outside changelogs", () => {
    const doc = `# Cache Invalidation RFC

## Proposal
- Invalidate product entries on every price write

## Security
- Write-through invalidation must not leak tenant ids in cache keys
- Signed URLs expire after 15 minutes
`;
    const result = importSource({ raw: doc, label: "rfc-cache.md" });
    if (!result.ok) throw new Error("import failed");
    // Without wholesale heading routing, plain security prose has no path to
    // Actions. (The "must not leak" line still promotes via the pre-existing
    // TODO_HINT "must" rule in understanding — unchanged by this PR.)
    const actions = result.value.blocks.find((b) => b.kind === "actions");
    const entries = (actions?.payload as { entries?: Array<{ task: string }> }).entries ?? [];
    expect(entries.some((e) => /Signed URLs expire/.test(e.task))).toBe(false);
    // The section stays unclaimed, so its lines survive in snapshot leftovers.
    const snapshot = result.value.blocks.find((b) => b.kind === "snapshot");
    const notes = (snapshot?.payload as { notes?: string[] }).notes ?? [];
    expect(notes.some((n) => /tenant ids/.test(n))).toBe(true);
    expect(notes.some((n) => /Signed URLs expire/.test(n))).toBe(true);
  });

  it("keeps every checklist line when an ordinal section has many items", () => {
    const items = Array.from({ length: 12 }, (_, i) => `- [ ] Task number ${i + 1} for the week`).join("\n");
    const doc = `# Onboarding Plan\n\n## Week 1\n${items}\n`;
    const result = importSource({ raw: doc, label: "onboarding.md" });
    if (!result.ok) throw new Error("import failed");
    const timeline = result.value.blocks.find((b) => b.kind === "timeline");
    const entries = (timeline?.payload as { entries: Array<{ date: string; details?: string[] }> }).entries;
    const week1 = entries.find((e) => e.date === "Week 1");
    const kept = (week1?.details ?? []).join("\n") + "\n" + JSON.stringify(result.value.blocks.map((b) => b.payload));
    for (let i = 2; i <= 12; i++) {
      expect(kept).toContain(`Task number ${i} for the week`);
    }
  });

  it("keeps a preposition that governs text after the date", () => {
    const out = inferTimeline([stmt("Move to March 2026 pricing")]);
    expect(out.length).toBeGreaterThan(0);
    expect(out[0]!.value.title).toMatch(/to pricing/i);
    expect(out[0]!.value.title).not.toMatch(/^Move pricing/i);
  });

  it("marks terse changelog bullets done from their section heading", () => {
    const doc = `# Acme CLI — Release Notes

## v2.5.0 — October 10, 2026

### Added
- New watch mode for builds
- TOML config support
`;
    const result = importSource({ raw: doc, label: "release-notes.md" });
    if (!result.ok) throw new Error("import failed");
    const actions = result.value.blocks.find((b) => b.kind === "actions");
    const entries = (actions?.payload as { entries: Array<{ task: string; status: string }> }).entries;
    expect(entries.some((e) => /New watch mode/.test(e.task))).toBe(true);
    const watch = entries.find((e) => /New watch mode/.test(e.task));
    expect(watch!.status).toBe("done");
    const toml = entries.find((e) => /TOML config support/.test(e.task));
    expect(toml!.status).toBe("done");
  });

  it("does not consume chapter sections as timeline phases", () => {
    const doc = `# Thinking in Systems — Book Notes

## Chapter 1: Basics
- A stock is the memory of the history of changing flows
- Feedback loops regulate the system
`;
    const result = importSource({ raw: doc, label: "book-notes.md" });
    if (!result.ok) throw new Error("import failed");
    const timeline = result.value.blocks.find((b) => b.kind === "timeline");
    const entries = (timeline?.payload as { entries?: Array<{ date: string; details?: string[] }> }).entries ?? [];
    const chapter = entries.find((e) => /^Chapter/.test(e.date));
    expect(chapter?.details ?? []).toEqual([]);
    const all = JSON.stringify(result.value.blocks.map((b) => b.payload));
    expect(all).toContain("changing flows");
  });
});
