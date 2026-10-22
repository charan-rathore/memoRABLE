/**
 * Two events that differ in their numbers are not the same event.
 *
 * A flight booking's return leg "6E 5319, Jaipur to Bengaluru, December 20,
 * 2026" was silently dropped as a "restatement" of the outbound "6E 5342,
 * Bengaluru to Jaipur, December 18, 2026": the dedupe overlap ignores digits,
 * so two legs sharing airport names collapsed into one and the memory forgot
 * the flight home. Numbers are the identity of an event - when both sides
 * carry numbers and they differ, it is not a restatement.
 *
 * And "Register complaints at 1912 (24x7 helpline)" scheduled a timeline
 * event in the year 1912: a helpline number read as a calendar date.
 */
import { describe, expect, it } from "vitest";
import { importSource } from "@/import/import-source";
import { saysTheSame } from "@/understanding/language";
import { findDateToken } from "@/import/text/patterns";

const booking = `# Booking Confirmation — IndiGo

PNR: T8KQ2L. Booked October 21, 2026.

## Outbound
- 6E 5342, Bengaluru (BLR) to Jaipur (JAI), December 18, 2026

## Return
- 6E 5319, Jaipur (JAI) to Bengaluru (BLR), December 20, 2026
`;

const bill = `# Electricity Bill

Account: 4482910065. Bill date: October 9, 2026.

## Notes
- Register complaints at 1912 (24x7 helpline)
- Late payment adds a 2% surcharge
`;

type TimelineEntry = { date: string; title: string };

function timelineOf(raw: string, label: string): TimelineEntry[] {
  const result = importSource({ raw, label });
  if (!result.ok) throw new Error("import failed");
  const block = result.value.blocks.find((b) => b.kind === "timeline");
  return (block?.payload as { entries?: TimelineEntry[] } | undefined)?.entries ?? [];
}

describe("number-aware dedupe", () => {
  it("keeps both flight legs", () => {
    const entries = timelineOf(booking, "flight.md");
    expect(entries.some((e) => /5342/.test(e.title) && /December 18/.test(e.date))).toBe(true);
    expect(entries.some((e) => /5319/.test(e.title) && /December 20/.test(e.date))).toBe(true);
  });

  it("saysTheSame is false when both sides carry different numbers", () => {
    expect(saysTheSame("6E 5342, Bengaluru to Jaipur, December 18", "6E 5319, Jaipur to Bengaluru, December 20")).toBe(false);
    expect(saysTheSame("Squat 3x5 at 40 kg", "Squat 3x5 at 42.5 kg")).toBe(false);
  });

  it("still merges true restatements, including formatted equivalents", () => {
    expect(saysTheSame("Budget around Rs 1,500 this week", "Budget around Rs 1500 this week")).toBe(true);
    expect(saysTheSame("We decided to ship behind a flag", "We decided to ship behind a flag")).toBe(true);
  });
});

describe("phone numbers are not dates", () => {
  it("does not schedule an event in the year of a helpline number", () => {
    const entries = timelineOf(bill, "bill.md");
    expect(entries.some((e) => e.date === "1912")).toBe(false);
    expect(entries.some((e) => /helpline/.test(e.title))).toBe(false);
  });

  it("still recognizes a bare year outside phone contexts", () => {
    expect(findDateToken("The treaty signed in 1912 ended the war")?.date).toBe("1912");
    expect(findDateToken("Founded 1912, restructured in 1988")?.date).toBe("1912");
    // Phone-shaped lead-ins are not calendar years.
    expect(findDateToken("Register complaints at 1912 (24x7 helpline)")).toBeNull();
    expect(findDateToken("Call 1800 425 1912 for outages")).toBeNull();
  });
});
