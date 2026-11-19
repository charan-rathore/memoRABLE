import { describe, expect, it } from "vitest";
import {
  findDateToken,
  isEntirelyDate,
  looksLikeDate,
  parseActionLineLenient,
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

describe("day-first calendar dates people write", () => {
  it.each([
    "18 November 2026",
    "7 December 2026",
    "15 June 2027",
    "5 November",
    "2 Dec 2026",
  ])("recognizes %s as a date", (token) => {
    expect(looksLikeDate(token)).toBe(true);
  });

  it("lifts a day-first date out of a fee line, keeping the amount", () => {
    const e = parseTimelineLine("Late fee after 18 November 2026: Rs 1,300.");
    expect(e?.date).toBe("18 November 2026");
    expect(e?.title).toBe("Late fee: Rs 1,300.");
  });

  it("lifts a day-first date out of a check-out line, keeping weekday and time", () => {
    const e = parseTimelineLine("Check-out: Sunday, 7 December 2026, until 11 AM");
    expect(e?.date).toBe("7 December 2026");
    expect(e?.title).toBe("Check-out: Sunday, until 11 AM");
  });

  it("lifts a day-first date out of a cancellation line, keeping the time", () => {
    const e = parseTimelineLine("Free cancellation until 2 December 2026, 11:59 PM.");
    expect(e?.date).toBe("2 December 2026");
    expect(e?.title).toBe("Free cancellation, 11:59 PM.");
  });

  it("lifts a day-first date out of an availability line", () => {
    const e = parseTimelineLine("Form 16 for the financial year will be available by 15 June 2027.");
    expect(e?.date).toBe("15 June 2027");
    expect(e?.title).toBe("Form 16 for the financial year will be available.");
  });

  it("lifts a day-first date out of a payroll line", () => {
    const e = parseTimelineLine("Raise any discrepancy with payroll by 5 November 2026.");
    expect(e?.date).toBe("5 November 2026");
    expect(e?.title).toBe("Raise any discrepancy with payroll.");
  });

  it("drops the comma a removed date leaves at the end of a flight leg", () => {
    const e = parseTimelineLine("- 6E 5342, Bengaluru (BLR) to Jaipur (JAI), December 18, 2026");
    expect(e?.date).toBe("December 18, 2026");
    expect(e?.title).toBe("6E 5342, Bengaluru (BLR) to Jaipur (JAI)");
  });

  it("does not repeat a day-first date in an obligation title", () => {
    const e = parseTimelineLine("Payment due date: 18 November 2026");
    expect(e?.date).toBe("18 November 2026");
    expect(e?.title).toBe("Payment Due Date");
  });

  it("does not repeat an ISO date in an obligation title", () => {
    const e = parseTimelineLine("Due date: 2026-08-14");
    expect(e?.date).toBe("2026-08-14");
    expect(e?.title).toBe("Due Date");
  });
});

describe("date removal leaves no broken punctuation", () => {
  it("collapses a separator left before the terminal period", () => {
    const e = parseTimelineLine("Next due: 3 November 2026.");
    expect(e?.date).toBe("3 November 2026");
    expect(e?.title).toBe("Next due.");
  });
});

describe("calendar-valid and unambiguous day-first dates only", () => {
  it.each([
    "Due date: 31 February 2026",
    "Due date: 32 January 2026",
    "Due date: 0 May 2026",
    "Due date: 29 February 2027",
    "Due date: February 31, 2026",
  ])("rejects the impossible date in %s", (text) => {
    expect(parseTimelineLine(text)).toBeNull();
  });

  it("accepts 29 February in a leap year", () => {
    const e = parseTimelineLine("Due date: 29 February 2028");
    expect(e?.date).toBe("29 February 2028");
    expect(e?.title).toBe("Due Date");
  });

  it.each([
    "We sold 31 May products before launch",
    "Version 1 May improve performance",
    "We shipped 18 November widgets",
  ])("does not consume a quantity plus ordinary words in %s", (text) => {
    expect(parseTimelineLine(text)).toBeNull();
  });

  it("keeps a line-initial day-first date with a year", () => {
    const e = parseTimelineLine("18 November 2026: deliver package");
    expect(e?.date).toBe("18 November 2026");
    expect(e?.title).toBe("deliver package");
  });

  it("keeps a year-less day-first date closed by punctuation", () => {
    const e = parseTimelineLine("19 October: Package picked up from Delhi warehouse.");
    expect(e?.date).toBe("19 October");
    expect(e?.title).toBe("Package picked up from Delhi warehouse.");
  });

  it("keeps a year-less day-first date closed by a comma", () => {
    const e = parseTimelineLine("2 October, Swiggy, Rs 842");
    expect(e?.date).toBe("2 October");
    expect(e?.title).toBe("Swiggy, Rs 842");
  });

  it("keeps the month-first form unchanged", () => {
    const e = parseTimelineLine("Due date: November 18, 2026");
    expect(e?.date).toBe("November 18, 2026");
    expect(e?.title).toBe("Due Date");
  });

  it("keeps an obligation with text after the date", () => {
    const e = parseTimelineLine("Payment due date: 18 November 2026, unless disputed");
    expect(e?.date).toBe("18 November 2026");
    expect(e?.title).toBe("Payment Due Date: unless disputed");
  });

  it("keeps an ISO obligation with trailing text", () => {
    const e = parseTimelineLine("Payment due: 2026-08-14 plus 30 days");
    expect(e?.date).toBe("2026-08-14");
    expect(e?.title).toBe("Payment Due: plus 30 days");
  });

  it("keeps the first of two day-first dates", () => {
    const e = parseTimelineLine("Date: 2 December 2026 and 3 December 2026");
    expect(e?.date).toBe("2 December 2026");
    expect(e?.title).toBe("Date: and 3 December 2026");
  });
});

describe("day-first dates require structural evidence, not just a token", () => {
  it.each([
    "Version 1 May, improve performance",
    "Version 1 may improve performance",
    "We sold 31 May. Revenue rose",
    "We shipped 18 November 2026 widgets",
    "18 November widgets arrived",
  ])("finds no date in %s", (text) => {
    expect(findDateToken(text)).toBeNull();
    expect(parseTimelineLine(text)).toBeNull();
  });

  it("reads a hotel label line with a year-less date and a time", () => {
    const e = parseTimelineLine("Check-in: 7 December after 14:00");
    expect(e?.date).toBe("7 December");
    expect(e?.title).toBe("Check-in: after 14:00");
  });

  it("reads a weekday-prefixed day-first date", () => {
    const e = parseTimelineLine("Check-out: Sunday, 7 December 2026, until 11 AM");
    expect(e?.date).toBe("7 December 2026");
    expect(e?.title).toBe("Check-out: Sunday, until 11 AM");
  });

  it("reads a due-led day-first date", () => {
    const e = parseTimelineLine("Hepatitis A dose 2 due 15 January 2027.");
    expect(e?.date).toBe("15 January 2027");
    expect(e?.title).toBe("Hepatitis A dose 2 due.");
  });

  it.each([
    "Due date: 29 February 1900",
    "Due date: 29 February 2100",
    "Due date: 18 November 20261",
    "Due date: 18 November 2026abc",
  ])("rejects %s", (text) => {
    expect(parseTimelineLine(text)).toBeNull();
  });

  it("accepts 29 February 2000 (divisible by 400)", () => {
    const e = parseTimelineLine("Due date: 29 February 2000");
    expect(e?.date).toBe("29 February 2000");
  });

  it("an invalid first date does not block a later valid one; its text stays visible", () => {
    // Matches the publisher-recorded 22b behavior: the first calendar-valid,
    // evidence-backed date is lifted; the impossible date's text remains in
    // the title rather than being silently erased.
    const e = parseTimelineLine("Due date: 32 January 2026 then 18 March 2026");
    expect(e?.date).toBe("18 March 2026");
    expect(e?.title).toBe("Due Date: 32 January 2026 then");
  });

  it("reads a mid-line year-ful day-first date closed by a comma", () => {
    const e = parseTimelineLine("MMR dose 2: given 12 September 2026, no reactions.");
    expect(e?.date).toBe("12 September 2026");
    expect(e?.title).toBe("MMR dose 2: given, no reactions.");
  });
});

describe("labels and prepositions are not date evidence by themselves", () => {
  it.each([
    "Version: 1 may improve performance",
    "Expected output: 1 May, improve performance",
    "Inventory: 18 November 2026 widgets shipped",
    "We shipped from 18 November 2026 widgets",
    "Change from 1 May improve throughput",
    "18 November 2026 widgets shipped",
  ])("finds no date in %s", (text) => {
    expect(findDateToken(text)).toBeNull();
    expect(parseTimelineLine(text)).toBeNull();
  });

  it("a date label governs a year-less day-first date with a time after it", () => {
    const e = parseTimelineLine("Check-in: 7 December after 14:00");
    expect(e?.date).toBe("7 December");
    expect(e?.title).toBe("Check-in: after 14:00");
  });

  it("an obligation residue drops the leading period a removed date leaves", () => {
    const e = parseTimelineLine("Due date: 18 November 2026. Other date: 31 February 2027");
    expect(e?.date).toBe("18 November 2026");
    expect(e?.title).toBe("Due Date: Other date: 31 February 2027");
  });

  it("an impossible date after the label stays visible while a later valid date lifts", () => {
    const e = parseTimelineLine("Due date: 31 February 2027. Invoice 18 November 2026.");
    expect(e?.date).toBe("18 November 2026");
    expect(e?.title).toBe("Due Date: 31 February 2027. Invoice.");
  });
});

describe("obligation heads keep every scanner guard", () => {
  it("a measured dosage after a label is not a date", () => {
    expect(findDateToken("Due: 1/2 teaspoon after meals")).toBeNull();
    expect(parseTimelineLine("Due: 1/2 teaspoon after meals")).toBeNull();
  });

  it("a numeric date after a label still parses", () => {
    const e = parseTimelineLine("Due: 1/2/2026");
    expect(e?.date).toBe("1/2/2026");
  });

  it("a label governs a year-less date closed by a comma", () => {
    const e = parseTimelineLine("Check-in: 7 December, after 14:00");
    expect(e?.date).toBe("7 December");
    expect(e?.title).toBe("Check-in: after 14:00");
  });

  it("a non-date label still cannot float a year-less token", () => {
    expect(findDateToken("Version: 1 May, after 14:00")).toBeNull();
    expect(parseTimelineLine("Version: 1 May, after 14:00")).toBeNull();
  });
});

describe("every date consumer shares the guards", () => {
  it.each(["31 February 2026", "32 January 2026", "29 February 2027"])(
    "an impossible day-first date is never entirely a date: %s",
    (text) => {
      expect(isEntirelyDate(text)).toBe(false);
      expect(looksLikeDate(text)).toBe(false);
    },
  );

  it.each([
    "31 February 2026 submit tax return",
    "32 January 2026 submit tax return",
    "29 February 2027 submit tax return",
    "1 May improve performance",
  ])("the lenient action pass lifts no due from %s", (text) => {
    expect(parseActionLineLenient(text)?.due).toBeUndefined();
  });

  it("a date-first action with a closing separator keeps its due", () => {
    expect(parseActionLineLenient("18 November 2026: submit tax return")?.due).toBe("18 November 2026");
  });
});

describe("a bare period token does not outrank a specific date in the same line", () => {
  it("lifts the specific date and keeps the quarter as words", () => {
    const e = parseTimelineLine("File Q3 GST by 10 November 2026");
    expect(e?.date).toBe("10 November 2026");
    expect(e?.title).toBe("File Q3 GST");
  });

  it("lifts the specific date past a bare half-year too", () => {
    const e = parseTimelineLine("Pay H2 invoice before 5 January 2027");
    expect(e?.date).toBe("5 January 2027");
    expect(e?.title).toBe("Pay H2 invoice");
  });

  it.each([
    ["Q3 roadmap review", "Q3"],
    ["Q3 2027 planning", "Q3 2027"],
    ["H1 budget review", "H1"],
    ["Sprint 4 retrospective", "Sprint 4"],
  ])("keeps a line-leading period marker as the date: %s", (text, date) => {
    expect(parseTimelineLine(text)?.date).toBe(date);
  });

  it("does not settle an explicit quarter label against a specific date", () => {
    expect(parseTimelineLine("Q3: file GST by 10 November 2026")?.date).toBe("Q3");
  });

  it("does not swap a quarter for a relative phrase", () => {
    expect(parseTimelineLine("File Q3 GST next week")?.date).toBe("Q3");
  });

  it.each([
    ["File Q3 report in 2 weeks", "Q3"],
    ["Review Q3 results in Week 4", "Q3"],
    ["Review H2 budget during Sprint 5", "H2"],
    ["Compare Q3 performance against FY26", "Q3"],
    ["Review Q3 results against Q4 2027", "Q3"],
    ["Discuss Q3 results from 2024 before filing in 2027", "Q3"],
  ])("never swaps a bare period for a non-calendar token: %s", (text, date) => {
    expect(parseTimelineLine(text)?.date).toBe(date);
  });

  it.each([
    ["Ship Q4 feature by 2027-03-15", "2027-03-15"],
    ["Pay H2 invoice before 05/11/2026", "05/11/2026"],
    ["Close H1 books by 03/2027", "03/2027"],
    ["File Q3 report in 2 weeks by 10 November 2026", "10 November 2026"],
  ])("still swaps a bare period for a later calendar date: %s", (text, date) => {
    expect(parseTimelineLine(text)?.date).toBe(date);
  });

  it.each([
    ["Review Q3 results with May Lee", "Q3"],
    ["File Q3 report, may improve next year", "Q3"],
    ["Review H2 plan with April Rao", "H2"],
    ["File Q3 by 31 February 2026", "Q3"],
    ["File Q3 by 2026-02-31", "Q3"],
    ["File Q3 by 32/13/2026", "Q3"],
    ["Review Q3 in March", "Q3"],
    ["Review Q3 with May", "Q3"],
    ["File Q3 report 7 December, please", "Q3"],
  ])("never swaps a bare period for an unusable or non-date token: %s", (text, date) => {
    expect(parseTimelineLine(text)?.date).toBe(date);
  });

  it.each([
    // US-style order is a known coverage limit: never promoted.
    ["File Q3 report by 12/31/2026", "Q3"],
    ["File Q3 report by 31/12/2026", "31/12/2026"],
    ["File Q3 report by 05/11/2026", "05/11/2026"],
    ["File Q3 report by 29/02/2028", "29/02/2028"],
    ["File Q3 report by 29/02/2027", "Q3"],
    ["File Q3 report by 31/04/2026", "Q3"],
    // Impossible every year, with or without a year.
    ["File Q3 report by 31/04", "Q3"],
    ["File Q3 report by 30/02", "Q3"],
    // A yearless 29/02 stays possible: leap years exist.
    ["File Q3 report by 29/02", "29/02"],
    ["File Q3 report by 02/29/2028", "Q3"],
    ["File Q3 report by 02/29/2027", "Q3"],
    ["File Q3 report by 2028-02-29", "2028-02-29"],
    ["File Q3 report by 2027-02-29", "Q3"],
    ["File Q3 report by 2026-04-31", "Q3"],
    ["File Q3 report by 2026-00-01", "Q3"],
    ["File Q3 report by 2026-12-00", "Q3"],
    ["File Q3 report by 03/2027", "03/2027"],
    ["File Q3 report by 13/2027", "Q3"],
  ])("promotes only possible calendar dates over a bare period: %s", (text, date) => {
    expect(parseTimelineLine(text)?.date).toBe(date);
  });
});
