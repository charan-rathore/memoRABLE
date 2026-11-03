import { describe, expect, it } from "vitest";
import { importSource } from "../../src/import/import-source";
import { parseTimelineLine, spanState } from "../../src/import/text/patterns";

describe("timeline lines that start with a year span", () => {
  it("keeps the span as the date and out of the title", () => {
    const e = parseTimelineLine("- 2019–2022 Senior Engineer, Meridian Ports — built port telemetry platform");
    expect(e?.date).toBe("2019–2022");
    expect(e?.title).toBe("Senior Engineer, Meridian Ports — built port telemetry platform");
    expect(e?.state).toBe("done");
  });

  it("never calls work that has already begun planned", () => {
    expect(parseTimelineLine("- Mar 2021 - present Lead, Northwind")?.state).toBe("on-track");
    expect(spanState("2022", "2026", 2026)).toBe("on-track");
    expect(spanState("2019", "2022", 2026)).toBe("done");
    expect(spanState("2028", "2030", 2026)).toBe("planned");
  });

  it("an explicit state in the line wins", () => {
    const e = parseTimelineLine("- 2019–2022 Migration (shipped)");
    expect(e?.title).toBe("Migration");
    expect(e?.state).toBe("shipped");
  });

  it("leaves ISO dates and phases alone", () => {
    expect(parseTimelineLine("- 2026-08-14 Ship beta")?.date).toBe("2026-08-14");
    expect(parseTimelineLine("- Phase 1: Capture schema — planned")?.date).toBe("Phase 1");
  });

  it("reads the resume fixture's experience without a phantom planned role", () => {
    const raw = `# A. Rathore — Curriculum Vitae

## Experience
- 2022–2026 Staff Engineer, Atlas Robotics — led fleet-analytics launch
- 2019–2022 Senior Engineer, Meridian Ports — built port telemetry platform
`;
    const r = importSource({ raw, label: "resume.md" });
    if (!r.ok) throw new Error("import failed");
    const tl = r.value.blocks.find((b) => b.kind === "timeline");
    const entries = (tl?.payload as { entries: { date: string; title: string; state?: string }[] }).entries;
    expect(entries.map((x) => x.date)).toEqual(["2022–2026", "2019–2022"]);
    expect(entries.every((x) => !/^20\d\d /.test(x.title))).toBe(true);
    expect(entries.find((x) => x.date === "2019–2022")?.state).toBe("done");
    expect(entries.some((x) => x.state === "planned")).toBe(false);
  });
});
