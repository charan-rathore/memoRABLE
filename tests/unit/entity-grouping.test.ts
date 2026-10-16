/**
 * Entity grouping regression: a title line owns its bullets.
 *
 * Charan's resume run (2026-10-17): every bullet inside "II. Projects" became
 * its own flat "project" card marked PENDING, project title lines were dropped
 * to notes or misparsed as owner/due actions, and role bullets under
 * "Experience" fell out as "wasn't clearly recognized" notes. These tests pin
 * the fixed behavior: one entry per entity, bullets as its details, honest
 * status for retrospective work.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { importSource } from "@/import/import-source";
import type { ActionEntry, TimelineEntry } from "@/domain/memory/schema";

const fixture = readFileSync(
  resolve("tests/fixtures/archetypes/resume-grouped.md"),
  "utf8",
);

function importFixture() {
  const result = importSource({ raw: fixture, label: "resume-grouped.md" });
  if (!result.ok) throw new Error(`import failed: ${JSON.stringify(result.errors)}`);
  return result.value;
}

function blockEntries<T>(doc: ReturnType<typeof importFixture>, kind: string) {
  const block = doc.blocks.find((b) => b.kind === kind);
  if (!block || !("entries" in block.payload)) return { entries: [] as T[], notes: [] as string[] };
  const payload = block.payload as { entries: T[]; notes?: string[] };
  return { entries: payload.entries, notes: payload.notes ?? [] };
}

describe("entity grouping: heading owns its bullets", () => {
  it("groups project bullets under one entry per project", () => {
    const doc = importFixture();
    const { entries } = blockEntries<ActionEntry & { details?: string[] }>(doc, "actions");

    // Three projects, not six bullets.
    expect(entries).toHaveLength(3);
    const tasks = entries.map((e) => e.task);
    expect(tasks.some((t) => /Predictive Analytics Product/.test(t))).toBe(true);
    expect(tasks.some((t) => /ThermoSense/.test(t))).toBe(true);
    expect(tasks.some((t) => /Nirmaan/.test(t))).toBe(true);

    // No bullet was promoted to its own card.
    expect(tasks.some((t) => /Preserved source traceability/.test(t))).toBe(false);
    expect(tasks.some((t) => /^Took an AI-search idea/.test(t))).toBe(false);
    expect(tasks.some((t) => /^Shipped an IoT/.test(t))).toBe(false);

    // Bullets are preserved as details on their owning project.
    const memorable = entries.find((e) => /Predictive Analytics Product/.test(e.task))!;
    expect(memorable.details).toHaveLength(3);
    expect(memorable.details!.some((d) => /Preserved source traceability/.test(d))).toBe(true);
    const thermo = entries.find((e) => /ThermoSense/.test(e.task))!;
    expect(thermo.details).toHaveLength(2);
    const nirmaan = entries.find((e) => /Nirmaan/.test(e.task))!;
    expect(nirmaan.details).toHaveLength(1);
  });

  it("marks completed past-dated projects done, never falsely pending", () => {
    const doc = importFixture();
    const { entries } = blockEntries<ActionEntry>(doc, "actions");
    for (const entry of entries) {
      expect(entry.status).toBe("done");
    }
  });

  it("keeps project bullets out of the unrecognized notes", () => {
    const doc = importFixture();
    const { notes } = blockEntries<ActionEntry>(doc, "actions");
    expect(notes.some((n) => /Preserved source traceability/.test(n))).toBe(false);
    expect(notes.some((n) => /Shipped an IoT/.test(n))).toBe(false);
  });

  it("groups experience roles with their accomplishment bullets", () => {
    const doc = importFixture();
    const { entries } = blockEntries<TimelineEntry & { details?: string[] }>(doc, "timeline");

    const analyst = entries.find((e) => /Product Analyst/.test(e.title));
    const ta = entries.find((e) => /Teaching Assistant/.test(e.title));
    expect(analyst).toBeDefined();
    expect(ta).toBeDefined();

    // No markdown bold residue and no swallowed end date in the title.
    expect(analyst!.title).not.toContain("**");
    expect(analyst!.title).not.toContain("June 2025");

    // Role bullets ride with the role, not lost to notes.
    expect(analyst!.details).toHaveLength(3);
    expect(ta!.details).toHaveLength(1);
  });

  it("marks fully past roles done instead of planned", () => {
    const doc = importFixture();
    const { entries } = blockEntries<TimelineEntry>(doc, "timeline");
    const analyst = entries.find((e) => /Product Analyst/.test(e.title));
    const ta = entries.find((e) => /Teaching Assistant/.test(e.title));
    expect(analyst!.state).toBe("done");
    expect(ta!.state).toBe("done");
  });
});

describe("entity grouping through markdown sub-headings", () => {
  const subFixture = readFileSync(
    resolve("tests/fixtures/archetypes/resume-subheadings.md"),
    "utf8",
  );

  function importSub() {
    const result = importSource({ raw: subFixture, label: "resume-subheadings.md" });
    if (!result.ok) throw new Error(`import failed: ${JSON.stringify(result.errors)}`);
    return result.value;
  }

  it("a named sub-heading under Projects owns its bullets", () => {
    const doc = importSub();
    const { entries } = blockEntries<ActionEntry & { details?: string[] }>(doc, "actions");
    const projects = entries.filter((e) => e.details && e.details.length > 0);
    expect(projects).toHaveLength(3);
    expect(projects.every((p) => p.status === "done")).toBe(true);
    expect(entries.some((e) => /Preserved source traceability/.test(e.task))).toBe(false);
  });

  it("role sub-headings never leak back as flat owner/due todos", () => {
    const doc = importSub();
    const { entries } = blockEntries<ActionEntry>(doc, "actions");
    // The old strict-parser misread "Role — Jan 2024 – Jun 2025" as
    // task + owner + due. An owner that is a date is not a person.
    expect(entries.some((e) => /Product Analyst/.test(e.task))).toBe(false);
    expect(entries.some((e) => /Mechanical/.test(e.task))).toBe(false);
    expect(entries.every((e) => !e.owner || !/^\w+ \d{4}$/.test(e.owner))).toBe(true);
  });

  it("role sub-headings group under Experience with done state", () => {
    const doc = importSub();
    const { entries } = blockEntries<TimelineEntry & { details?: string[] }>(doc, "timeline");
    const analyst = entries.find((e) => /Product Analyst/.test(e.title));
    expect(analyst).toBeDefined();
    expect(analyst!.state).toBe("done");
    expect(analyst!.details!.length).toBeGreaterThan(0);
  });
});

describe("entity grouping: open-ended date ranges", () => {
  it("does not mark an ongoing role done or leave the open end in the title", () => {
    const raw = `## Experience

**Platform Engineer, Acme** January 2024 – Present
- Own the ingestion pipeline serving 40M daily events
- Cut p95 ingest latency by 38% through batch compaction
`;
    const result = importSource({ raw, label: "resume-present.md" });
    if (!result.ok) throw new Error(`import failed: ${JSON.stringify(result.errors)}`);
    const { entries } = blockEntries<TimelineEntry>(result.value, "timeline");

    const role = entries.find((e) => /Platform Engineer/.test(e.title));
    expect(role).toBeDefined();
    // An ongoing role is not finished work...
    expect(role!.state).not.toBe("done");
    // ...and its title does not carry the open-ended marker.
    expect(role!.title).not.toContain("Present");
    expect(role!.title).not.toContain("January 2024");
    expect(role!.details).toHaveLength(2);
  });

  it("treats Current and Ongoing the same way", () => {
    const raw = `## Experience

**Staff Engineer, Beta** March 2022 – Current
- Run the storage guild across four teams
`;
    const result = importSource({ raw, label: "resume-current.md" });
    if (!result.ok) throw new Error(`import failed: ${JSON.stringify(result.errors)}`);
    const { entries } = blockEntries<TimelineEntry>(result.value, "timeline");

    const role = entries.find((e) => /Staff Engineer/.test(e.title));
    expect(role).toBeDefined();
    expect(role!.state).not.toBe("done");
    expect(role!.title).not.toContain("Current");
  });
});
