import { describe, expect, it } from "vitest";
import {
  findDateToken,
  looksLikeDate,
  parseTimelineLine,
  parseTimelineLineLenient,
} from "@/import/text/patterns";
import { parseText } from "@/import/text/parse-text";
import type { TimelinePayload } from "@/domain/memory/schema";

describe("time tokens people write", () => {
  it.each([
    "today",
    "tomorrow",
    "yesterday",
    "next week",
    "this month",
    "end of quarter",
    "in 2 weeks",
    "Jan-Jun",
    "Jan–Jun",
    "January - June 2026",
    "2034",
    "H1 2026",
    "FY26",
    "Q3 2025",
    "Jul 15, 2026",
    "2026-03-01",
  ])("recognizes %s as a date", (token) => {
    expect(looksLikeDate(token)).toBe(true);
  });

  it("parses a leading relative date on a timeline line", () => {
    const entry = parseTimelineLine("Tomorrow — ship the beta release");
    expect(entry).toMatchObject({
      date: "Tomorrow",
      title: "ship the beta release",
      state: "planned",
    });
  });

  it("parses month ranges as one timeline date", () => {
    const entry = parseTimelineLine("Jan-Jun: Pilot rollout across regions");
    expect(entry).toMatchObject({
      date: "Jan-Jun",
      title: "Pilot rollout across regions",
    });
  });

  it("parses a bare year", () => {
    const entry = parseTimelineLine("2034 — Long-range platform rewrite");
    expect(entry).toMatchObject({
      date: "2034",
      title: "Long-range platform rewrite",
    });
  });

  it("finds dates mid-sentence for the lenient pass", () => {
    const found = findDateToken("Ship the beta tomorrow if QA is green");
    expect(found?.date.toLowerCase()).toBe("tomorrow");
    const entry = parseTimelineLineLenient("- Ship the beta tomorrow if QA is green");
    expect(entry).toMatchObject({
      date: "tomorrow",
      title: expect.stringContaining("Ship the beta"),
    });
  });

  it("does not treat 'May need' as a mid-line date", () => {
    expect(findDateToken("May need another review")).toBeNull();
  });
});

describe("regenerate-style re-parse catches richer timelines", () => {
  it("pulls relative and ranged dates into the timeline memory", () => {
    const source = `# Roadmap

## Timeline
- today: Kickoff with legal
- Jan-Jun: Compliance pilot
- Ship the public beta next week
- 2034: Platform rewrite
`;
    const result = parseText({ text: source, label: "roadmap.md" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const timeline = result.value.blocks.find((b) => b.kind === "timeline")!.payload as TimelinePayload;
    const dates = timeline.entries.map((e) => e.date.toLowerCase());
    expect(dates.some((d) => d.includes("today"))).toBe(true);
    expect(dates.some((d) => /jan/.test(d) && /jun/.test(d))).toBe(true);
    expect(dates.some((d) => d.includes("2034"))).toBe(true);
    expect(dates.some((d) => d.includes("next week"))).toBe(true);
  });
});
