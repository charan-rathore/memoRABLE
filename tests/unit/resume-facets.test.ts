import { describe, expect, it } from "vitest";
import { importSource } from "@/import/import-source";
import { memoryDocumentSchema } from "@/domain/memory/schema";
import { decisionEntrySchema, timelineEntrySchema, actionEntrySchema } from "@/domain/memory/schema";
import { parseDecisionLineLenient } from "@/import/text/patterns";
import type { ActionsPayload, DecisionsPayload, RisksPayload, TimelinePayload } from "@/domain/memory/schema";

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

## Awards
- Best Paper, Logistics Systems Conference 2020

## Skills
TypeScript, distributed systems, product-minded platform design
`;

function blocks() {
  const r = importSource({ raw: RESUME, label: "resume.md" });
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error("import failed");
  const get = <T>(k: string) => r.value.blocks.find((b) => b.kind === k)?.payload as T | undefined;
  return { doc: r.value, decisions: get<DecisionsPayload>("decisions"), timeline: get<TimelinePayload>("timeline"), actions: get<ActionsPayload>("actions"), risks: get<RisksPayload>("risks") };
}

describe("a resume is records, not a project plan", () => {
  it("education and credentials are not proposed decisions", () => {
    const { decisions } = blocks();
    const entries = decisions?.entries ?? [];
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      expect(["education", "credential"]).toContain(e.facet);
      expect(e.status).toBeUndefined();
      expect(e.commitment).toBeUndefined();
    }
    expect(entries.some((e) => e.facet === "education" && /ETH Zurich/.test(e.text))).toBe(true);
    expect(entries.some((e) => e.facet === "credential" && /AWS/.test(e.text))).toBe(true);
  });

  it("jobs carry their stated dates and no plan state derived from them", () => {
    const { timeline } = blocks();
    const jobs = (timeline?.entries ?? []).filter((e) => e.facet === "employment");
    expect(jobs.length).toBe(2);
    for (const j of jobs) expect(j.state).toBeUndefined();
    expect(jobs.map((j) => j.date)).toEqual(["2022–2026", "2019–2022"]);
  });

  it("projects are not pending work and awards are not risks", () => {
    const { actions, risks } = blocks();
    for (const a of actions?.entries ?? []) {
      expect(a.facet).toBe("project");
      expect(a.status).toBeUndefined();
    }
    for (const r of risks?.entries ?? []) {
      expect(r.facet).toBe("achievement");
      expect(r.severity).toBeUndefined();
    }
  });

  it("the snapshot never frames a degree as the primary goal", () => {
    const { doc } = blocks();
    const snap = doc.blocks.find((b) => b.kind === "snapshot")!.payload as { hook?: string; goal?: string };
    expect(`${snap.hook ?? ""} ${snap.goal ?? ""}`).not.toMatch(/ETH Zurich|MSc/);
  });

  it("the whole document still validates", () => {
    const { doc } = blocks();
    expect(memoryDocumentSchema.safeParse(doc).success).toBe(true);
  });
});

describe("statuses are only what the source states", () => {
  it("a bare decision bullet gets no workflow status", () => {
    const e = parseDecisionLineLenient("- Use Postgres for the event store");
    expect(e?.status).toBeUndefined();
  });

  it("a faceted record cannot carry a workflow field", () => {
    expect(decisionEntrySchema.safeParse({ text: "MSc, ETH", facet: "education", status: "proposed" }).success).toBe(false);
    expect(timelineEntrySchema.safeParse({ date: "2019", title: "Job", facet: "employment", state: "done" }).success).toBe(false);
    expect(actionEntrySchema.safeParse({ task: "Harbor Sim", facet: "project", status: "pending" }).success).toBe(false);
    expect(actionEntrySchema.safeParse({ task: "Ship it" }).success).toBe(false);
    expect(actionEntrySchema.safeParse({ task: "Harbor Sim", facet: "project" }).success).toBe(true);
    expect(decisionEntrySchema.safeParse({ text: "Use Postgres" }).success).toBe(true);
  });
});
