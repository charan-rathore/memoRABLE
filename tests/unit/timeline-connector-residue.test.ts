import { describe, expect, it } from "vitest";
import { parseTimelineLine } from "@/import/text/patterns";

/* A date lifted out of a clause takes its connector with it when the
 * connector governed only the date: "due at 20,000 km or <date>, whichever
 * is earlier" must not render "km or, whichever". Pre-existing garble seen
 * across service reminders, invoices, and checklists. */
describe("timeline title connector residue", () => {
  it("drops a dangling 'or' before a clause boundary", () => {
    const entry = parseTimelineLine(
      "- KA-05-MN-4821: the next service is due at 20,000 km or December 2026, whichever is earlier.",
    );
    expect(entry).not.toBeNull();
    expect(entry!.date).toBe("December 2026");
    expect(entry!.title).toBe("KA-05-MN-4821: the next service is due at 20,000 km, whichever is earlier.");
  });

  it("drops a dangling 'for' before a clause boundary", () => {
    const entry = parseTimelineLine(
      "- Little Steps: Rs 9,500 for October 2026, due November 5, 2026.",
    );
    expect(entry).not.toBeNull();
    expect(entry!.title).toBe("Little Steps: Rs 9,500, due November 5, 2026.");
  });

  it("drops a dangling 'and' before a clause boundary", () => {
    const entry = parseTimelineLine(
      "- Bank statements for October, September, and November 2026, stamped and notarized.",
    );
    expect(entry).not.toBeNull();
    expect(entry!.title).toBe("Bank statements for October, September, stamped and notarized.");
  });

  it("keeps a connector that joins surviving text", () => {
    const entry = parseTimelineLine("- Pay rent or utilities on November 1, 2026.");
    expect(entry).not.toBeNull();
    expect(entry!.title).toBe("Pay rent or utilities.");
  });

  it("keeps a preposition that governs text after the date", () => {
    const entry = parseTimelineLine("- Move to March 2026 pricing");
    expect(entry).not.toBeNull();
    expect(entry!.title).toMatch(/to pricing/i);
  });

  it("drops a dangling connector at end of line", () => {
    const entry = parseTimelineLine("- Statement for October 2026");
    expect(entry).not.toBeNull();
    expect(entry!.title).toBe("Statement");
  });
});
