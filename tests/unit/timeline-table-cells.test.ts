import { describe, expect, it } from "vitest";
import { parseTimelineLine } from "@/import/text/patterns";

/**
 * A timeline table row whose date sits in a non-first cell fell through to
 * the prose path, which kept the raw pipe markup in the title
 * ("| 1 | Wireframes | |"). The row's cells are structure: the single
 * date-bearing cell becomes the date and the remaining cells join cleanly.
 * Rows with zero or several date cells keep today's behavior (multi-date
 * precedence is a deferred lane).
 */
describe("a timeline table row with the date in a later cell", () => {
  it("uses the date cell and joins the remaining cells as the title", () => {
    expect(parseTimelineLine("| 1 | Wireframes | November 14, 2026 |")).toMatchObject({
      date: "November 14, 2027".replace("2027", "2026"),
      title: "1 - Wireframes",
      state: "planned",
    });
    expect(parseTimelineLine("| Wireframes | Rs 12,000 | November 5, 2026 |")).toMatchObject({
      date: "November 5, 2026",
      title: "Wireframes - Rs 12,000",
    });
  });

  it("keeps date-first rows on their existing path", () => {
    expect(parseTimelineLine("| November 14, 2026 | Wireframes | planned |")).toMatchObject({
      date: "November 14, 2026",
      title: "Wireframes",
    });
  });

  it("keeps date-first multi-date rows on the existing path (deferred two-date lane)", () => {
    expect(parseTimelineLine("| November 1, 2026 | November 30, 2026 |")).toMatchObject({
      date: "November 1, 2026",
      title: "November 30, 2026",
      state: "planned",
    });
  });

  it("keeps identifier-first rows on the existing ticket path (pre-existing contract)", () => {
    // "INV-1001" is ticket-shaped: the ticket branch predates this packet
    // and owns identifier-first rows even when a later cell is a date.
    expect(parseTimelineLine("| INV-1001 | Rs 12,000 | November 5, 2026 |")).toMatchObject({
      date: "INV-1001",
      title: "Rs 12,000",
    });
  });

  it("keeps ticket rows on the ticket path even when a later cell is a date", () => {
    expect(parseTimelineLine("| PSTD-5922 | PO edit history | 2026-08-14 |")).toMatchObject({
      date: "PSTD-5922",
      title: "PO edit history",
    });
  });

  it("declines a cell holding two dates or a range (multi-date lane stays deferred)", () => {
    // Parent behavior: prose path, raw markup, leading date only.
    expect(parseTimelineLine("| 1 | Wireframes | November 1, 2026 to November 14, 2026 |")).toMatchObject({
      date: "November 1, 2026",
      title: "| 1 | Wireframes | to November 14, 2026 |",
      state: "planned",
    });
  });

  it("declines rows whose markup naive cell splitting cannot read", () => {
    // Escaped pipe: parent behavior keeps the raw row, never splits "A \| B".
    expect(parseTimelineLine("| 1 | A \\| B | November 14, 2026 |")).toMatchObject({
      date: "November 14, 2026",
      title: "| 1 | A \\| B | |",
      state: "planned",
    });
  });

  it("declines a negated trailing status cell instead of flipping state", () => {
    // "Not done" must never become done; parent behavior keeps the raw row.
    expect(parseTimelineLine("| 1 | Wireframes | November 14, 2026 | Not done |")).toMatchObject({
      date: "November 14, 2026",
      title: "| 1 | Wireframes | | Not done |",
      state: "planned",
    });
  });

  it("declines a conditional trailing status cell", () => {
    // "If approved" carries a condition the state parser cannot honor.
    expect(parseTimelineLine("| 1 | Wireframes | November 14, 2026 | If approved |")).toMatchObject({
      date: "November 14, 2026",
      title: "| 1 | Wireframes | | If approved |",
      state: "planned",
    });
  });

  it("declines when another cell carries a date token (whole-row count must be exactly one)", () => {
    // Parent behavior: prose path takes the leading date; the new path must
    // not re-date the row to the later pure cell.
    expect(parseTimelineLine("| 1 | Due before November 1, 2026 | November 14, 2026 |")).toMatchObject({
      date: "November 1, 2026",
      title: "| 1 | Due before | November 14, 2026 |",
      state: "planned",
    });
    expect(parseTimelineLine("| 1 | November 1, 2026 to November 3, 2026 | November 14, 2026 |")).toMatchObject({
      date: "November 1, 2026",
      title: "| 1 | to November 3, 2026 | November 14, 2026 |",
      state: "planned",
    });
  });

  it("repairs the title but preserves the prior planned state for status words", () => {
    // A trailing "done"/"complete" cell must not flip the entry to done;
    // the title fix may still apply with the prior state preserved.
    expect(parseTimelineLine("| 1 | Wireframes | November 14, 2026 | done |")).toMatchObject({
      date: "November 14, 2026",
      title: "1 - Wireframes - done",
      state: "planned",
    });
    expect(parseTimelineLine("| 1 | Wireframes | November 14, 2026 | complete |")).toMatchObject({
      date: "November 14, 2026",
      title: "1 - Wireframes - complete",
      state: "planned",
    });
  });

  it("declines rows with no date cell", () => {
    expect(parseTimelineLine("| ARR | $4.2M | +18% |")).toBeNull();
  });
});
