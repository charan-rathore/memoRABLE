import { describe, expect, it } from "vitest";
import { parseTimelineLine } from "@/import/text/patterns";

/**
 * A fiscal token ("FY 2025", "FY26") or a bare year ("2027") is a period,
 * not a usable calendar date — the same weakest-date class as the bare
 * quarter/half of Lane 2. Written alone it stays the date; it never
 * outranks a specific calendar date later in the same line, and the whole
 * range token ("FY 2025-26", "2027-28") stays in the title as words —
 * admitting the fiscal half also left the "-26" residue dangling.
 */
describe("a fiscal or bare-year token never outranks a later usable calendar date", () => {
  it.each([
    ["Interest for FY 2025-26 at 8.25% credited October 10, 2026", "October 10, 2026", "Interest for FY 2025-26 at 8.25% credited"],
    ["Renewal for 2027-28 requires 85% aggregate in the March 2027 annual exams", "March 2027", "Renewal for 2027-28 requires 85% aggregate in the annual exams"],
    ["Budget for FY 2026 locked by 15 March 2026", "15 March 2026", "Budget for FY 2026 locked"],
    ["Targets for 2026 due 1 April 2026", "1 April 2026", "Targets for 2026 due"],
  ])("the calendar date wins and the range stays as words: %s", (text, date, title) => {
    const e = parseTimelineLine(text);
    expect(e?.date).toBe(date);
    expect(e?.title).toBe(title);
  });
});

describe("a lone fiscal or bare-year token stays the date", () => {
  it.each([
    ["FY26 results declared in the review", "FY26", "results declared in the review"],
    ["FY 2025 results were strong", "FY 2025", "results were strong"],
    ["Target 2027 for the full rollout", "2027", "Target for the full rollout"],
  ])("unchanged: %s", (text, date, title) => {
    const e = parseTimelineLine(text);
    expect(e?.date).toBe(date);
    expect(e?.title).toBe(title);
  });
});

describe("displacement rules are unchanged", () => {
  it("the original Lane 2 quarter contract still holds", () => {
    const e = parseTimelineLine("File Q3 GST by 10 November 2026");
    expect(e?.date).toBe("10 November 2026");
    expect(e?.title).toBe("File Q3 GST");
  });

  it("a leading calendar date is never displaced by a later bare year", () => {
    const e = parseTimelineLine("Launch March 2027, revisit in 2028");
    expect(e?.date).toBe("March 2027");
    expect(e?.title).toBe("Launch, revisit in 2028");
  });

  it("a later non-calendar token never displaces the fiscal token", () => {
    const e = parseTimelineLine("FY 2025 budget grows in 2 weeks");
    expect(e?.date).toBe("FY 2025");
  });

  it("a line-LEADING fiscal token is a marker and stays untouched — the Lane 2 boundary", () => {
    const e = parseTimelineLine("FY 2026 budget locked by 15 March 2026");
    expect(e?.date).toBe("FY 2026");
    expect(e?.title).toBe("budget locked by 15 March 2026");
  });

  it("a later impossible date never displaces the fiscal token", () => {
    const e = parseTimelineLine("FY 2025 report due 31 February 2026");
    expect(e?.date).toBe("FY 2025");
  });
});
