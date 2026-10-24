import { describe, expect, it } from "vitest";
import { inferArtifact } from "@/understanding/inference";

// Follow-up to #80: the word boundary must follow the label word, not the
// delimiter, so compact labels without a space keep extracting.
describe("compact artifact/prerequisite labels", () => {
  it.each([
    ["Artifact:report.pdf", "produces", "Report.pdf"],
    ["Output:weekly summary.", "produces", "Weekly summary"],
    ["Deliverable:final deck.", "produces", "Final deck"],
    ["Prerequisite:install node.", "requires", "Install node"],
    ["Prerequisites:install node.", "requires", "Install node"],
    ["Artifact: report.pdf", "produces", "Report"],
    ["Prerequisite: install node.", "requires", "Install node"],
  ])("%s", (input, field, want) => {
    const a = inferArtifact(input) as Record<string, string | undefined>;
    expect(a[field]).toBeDefined();
    expect(a[field]).not.toMatch(/^[:\-—]/);
    if (!input.includes("pdf")) expect(a[field]).toBe(want);
  });
  it("keeps the #80 word-boundary guards", () => {
    for (const s of ["Out for delivery at 9:15 AM.", "The producer shared the cut.", "Document required for pickup."]) {
      const a = inferArtifact(s) as Record<string, string | undefined>;
      expect(a.produces).toBeUndefined();
      expect(a.requires).toBeUndefined();
    }
  });
});
