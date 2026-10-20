/**
 * Follow-ups to the quantity-fraction guard: it must not swallow real dates
 * that follow an identifier or precede a unit-named heading, and it must also
 * cover percent, hyphenated units, table cells and the obligation fallback.
 */
import { describe, expect, it } from "vitest";
import { findDateToken, parseObligationDateLine, parseTimelineLine } from "@/import/text/patterns";

describe("quantity fraction guard follow-ups", () => {
  it("keeps a real date that follows an identifier ending in a digit", () => {
    expect(findDateToken("v2 10/24 launch")?.date).toBe("10/24");
  });

  it("keeps a real date whose heading starts with a unit word", () => {
    expect(findDateToken("10/24 Hours: 9-5")?.date).toBe("10/24");
    expect(parseTimelineLine("10/24 Hours: 9-5")?.date).toBe("10/24");
  });

  it("rejects a fraction followed by a percent sign", () => {
    expect(findDateToken("1/2% solution")).toBeNull();
    expect(findDateToken("1/2 % solution")).toBeNull();
  });

  it("rejects a fraction in a hyphenated measurement", () => {
    expect(findDateToken("chop into 1/2-inch pieces")).toBeNull();
    expect(findDateToken("add 1/2-cup flour")).toBeNull();
  });

  it("does not turn a recipe table cell into a timeline entry", () => {
    expect(parseTimelineLine("| 1/2 cup | flour |")).toBeNull();
  });

  it("does not re-accept a rejected quantity in the obligation fallback", () => {
    const entry = parseObligationDateLine("Due: 1/2 hours after submission");
    expect(entry?.date ?? "").not.toMatch(/^1\/2/);
  });

  it("still reads a mixed number as a quantity", () => {
    expect(findDateToken("Autolyse 2 1/2 hours before shaping")).toBeNull();
  });
});
