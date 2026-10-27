import { describe, expect, it } from "vitest";
import { findDateToken, parseTimelineLine } from "@/import/text/patterns";
import { importSource } from "@/import/import-source";

/**
 * Lane B (bounded publisher contract): a year-bearing day-first date
 * followed by a complete, valid clock ("at HH:MM", 00:00-23:59) counts as
 * structurally closed when the clock ends the line or meets the existing
 * punctuation closure. The clock text stays in the title; time recognition
 * is not schedule promotion — the unheaded-prose DELIVERY gate is
 * unchanged. Locations, AM/PM, timezones, partial clocks, and further
 * words after the clock are NOT admitted.
 */
describe("a year-bearing day-first date closed by a complete valid clock", () => {
  it.each([
    ["Return flight 17 November 2026 at 19:45", "17 November 2026", "Return flight at 19:45"],
    ["Flight departs 14 November 2026 at 06:10", "14 November 2026", "Flight departs at 06:10"],
    ["Window opens 1 January 2027 at 00:00", "1 January 2027", "Window opens at 00:00"],
    ["Window closes 31 December 2026 at 23:59", "31 December 2026", "Window closes at 23:59"],
    ["Flight departs 14 November 2026 at 06:10.", "14 November 2026", "Flight departs at 06:10."],
  ])("reads the date and keeps the clock in the title: %s", (text, date, title) => {
    const e = parseTimelineLine(text);
    expect(e?.date).toBe(date);
    expect(e?.title).toBe(title);
  });

  it.each([
    ["Flight departs 14 November 2026 at 06:10, gate info follows", "Flight departs at 06:10, gate info follows"],
    ["Return flight 17 November 2026 at 06:10, from HYD", "Return flight at 06:10, from HYD"],
    ["Return flight 17 November 2026 at 06:10: approval needed", "Return flight at 06:10: approval needed"],
    ["Return flight 17 November 2026 at 06:10; if approved", "Return flight at 06:10; if approved"],
    ["Return flight 17 November 2026 at 06:10. We discussed it", "Return flight at 06:10. We discussed it"],
  ])("accepts a clock followed by the existing punctuation closure, source words complete: %s", (text, title) => {
    const e = parseTimelineLine(text);
    expect(e?.date).toBe(text.includes("14 November") ? "14 November 2026" : "17 November 2026");
    expect(e?.title).toBe(title);
  });
});

describe("a clock that is invalid, partial, or followed by more words never closes the date", () => {
  it.each([
    // Invalid clocks: 24:00, 25:90, 12:60.
    "Return flight 17 November 2026 at 24:00",
    "Return flight 17 November 2026 at 25:90",
    "Return flight 17 November 2026 at 12:60",
    // One-digit hour: the bounded contract is exactly two-digit HH:MM.
    "Return flight 17 November 2026 at 6:10",
    // Not a standalone clock token: seconds, malformed colon extensions,
    // decimal or range extensions, and a dangling terminal colon.
    "Return flight 17 November 2026 at 06:10:30",
    "Return flight 17 November 2026 at 06:10:99",
    "Return flight 17 November 2026 at 06:10:",
    "Return flight 17 November 2026 at 06:10:1234",
    "Return flight 17 November 2026 at 06:10.123",
    "Return flight 17 November 2026 at 06:10-99",
    // Partial clocks.
    "Flight departs 14 November 2026 at 06:",
    "Flight departs 14 November 2026 at 6",
    // Quantity, not a clock.
    "Return flight 17 November 2026 at least 3 days early",
    // Deferred: location, arbitrary words, conditionals, AM/PM, timezone,
    // and a question mark (not in the existing punctuation closure).
    "Return flight 17 November 2026 at 06:10 from HYD",
    "Return flight 17 November 2026 at 06:10 widgets",
    "Return flight 17 November 2026 at 06:10 we discussed the plan",
    "Return flight 17 November 2026 at 06:10 if approval arrives",
    "Return flight 17 November 2026 at 7:45 PM",
    "Return flight 17 November 2026 at 06:10 IST",
    "Return flight 17 November 2026 at 06:10?",
    // Existing guards unchanged: malformed year, impossible named date,
    // modal "may", year-less day-first mid-line.
    "Flight departs 14 November 20261 at 06:10",
    "Flight departs 31 February 2026 at 06:10",
    "Version 1 may improve performance at 06:10",
    "Flight departs 14 November at 06:10",
  ])("finds no date in %s", (text) => {
    expect(findDateToken(text)).toBeNull();
    expect(parseTimelineLine(text)).toBeNull();
  });
});

describe("clock recognition is not schedule promotion", () => {
  const raw = (body: string) => `# Trip\n\n${body}\n`;
  const timelineOf = (doc: string) => {
    const result = importSource({ raw: doc, label: "trip.md" });
    if (!result.ok) throw new Error("import failed");
    const block = result.value.blocks.find((b) => b.kind === "timeline");
    return ((block?.payload as { entries?: Array<{ date: string; title: string }> })?.entries ?? []);
  };

  it("an explicit Timeline section lists the flight with its clock", () => {
    const entries = timelineOf(raw("## Timeline\n\n- Return flight 17 November 2026 at 19:45"));
    expect(entries.map((e) => [e.date, e.title])).toContainEqual([
      "17 November 2026",
      "Return flight at 19:45",
    ]);
  });

  it("unheaded prose still needs delivery language: the DELIVERY gate is unchanged", () => {
    const entries = timelineOf(raw("Return flight 17 November 2026 at 19:45."));
    expect(entries).toEqual([]);
  });
});

describe("whitespace around the clock boundary does not smuggle in a numeric extension", () => {
  it.each([
    // A numeric continuation after clock punctuation is a malformed
    // extension however it is spaced: colon+space+digits, or whitespace
    // between the clock and a colon/decimal/range extension. These are
    // the same family as the pinned "06:10:30" / "06:10.123" / "06:10-99"
    // rejects; seconds and fractional forms stay deferred.
    "Return flight 17 November 2026 at 06:10: 30",
    "Return flight 17 November 2026 at 06:10 :30",
    "Return flight 17 November 2026 at 06:10 :99",
    "Return flight 17 November 2026 at 06:10 .123",
    "Return flight 17 November 2026 at 06:10 -99",
    // A dangling terminal colon is malformed with or without a space
    // before it, same family as the pinned "06:10:" reject.
    "Return flight 17 November 2026 at 06:10 :",
  ])("finds no date in %s", (text) => {
    expect(findDateToken(text)).toBeNull();
    expect(parseTimelineLine(text)).toBeNull();
  });

  it.each([
    // Punctuation + prose controls are preserved across spacing: the
    // boundary inspection normalizes whitespace only to classify what
    // follows the clock, never to alter source or title.
    ["Return flight 17 November 2026 at 06:10:  approval needed", "Return flight at 06:10: approval needed"],
    ["Return flight 17 November 2026 at 06:10 , gate info", "Return flight at 06:10, gate info"],
  ])("accepts a clock followed by punctuation and prose, source words complete: %s", (text, title) => {
    const e = parseTimelineLine(text);
    expect(e?.date).toBe("17 November 2026");
    expect(e?.title).toBe(title);
  });
});
