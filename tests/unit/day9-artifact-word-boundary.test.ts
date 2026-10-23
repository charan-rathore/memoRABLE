import { describe, expect, it } from "vitest";
import { inferArtifact } from "@/understanding/inference";

// The PRODUCES/REQUIRES verb alternations lacked a trailing word boundary,
// so "delivery" matched "deliver" and captured the word's tail as the
// artifact: "Out for delivery at 9:15 AM." produced "Y at 9:15 AM".
describe("artifact verbs must end at a word boundary", () => {
  it.each([
    ["Out for delivery at 9:15 AM.", "produces"],
    ["Free delivery on orders over Rs 499.", "produces"],
    ["The producer shared the cut.", "produces"],
    ["Document required for pickup.", "requires"],
    ["Created a cleaned table.", "produces"], // "created" is not a listed verb; must not capture "d ..."
  ])("does not invent %s from %s", (input, field) => {
    const artifact = inferArtifact(input) as Record<string, string | undefined>;
    expect(artifact[field]).toBeUndefined();
  });

  // Positive controls: real artifact language still extracts.
  it("extracts genuine produces", () => {
    expect(inferArtifact("The script produces a cleaned table.").produces).toBe("Cleaned table");
    expect(inferArtifact("Output: a weekly summary.").produces).toBe("Weekly summary");
    expect(inferArtifact("It yields the final report.").produces).toBe("Final report");
  });

  it("extracts genuine requires", () => {
    expect(inferArtifact("This depends on the data dictionary.").requires).toBe("Data dictionary");
    expect(inferArtifact("Import requires a valid token.").requires).toBe("Valid token");
  });
});

describe("plural label forms keep their item", () => {
  it("extracts the item after plural labels, not the plural s", () => {
    expect(inferArtifact("Prerequisites: install node.").requires).toBe("Install node");
    expect(inferArtifact("Deliverables: a PDF report.").produces).toBe("PDF report");
    expect(inferArtifact("Outputs: a weekly summary.").produces).toBe("Weekly summary");
    expect(inferArtifact("Prerequisite: data dictionary.").requires).toBe("Data dictionary");
    expect(inferArtifact("Deliverable: a PDF.").produces).toBe("PDF");
  });
});
