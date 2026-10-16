/**
 * Readiness regression: past-tense accomplishment statements are finished
 * work, not pending todos. A bare imperative stays pending; a hedge stays
 * suggested.
 */
import { describe, expect, it } from "vitest";
import { inferReadiness } from "@/understanding/inference";

describe("inferReadiness on retrospective accomplishment language", () => {
  it.each([
    "Delivered pre-, mid-, and post-campaign analyses across DV360-DSP data",
    "Preserved source traceability and output consistency across Email, Web, and Doc flows",
    "Improved required-evidence recall from 36.7% to 70.0% through retrieval experiments",
    "Took an AI-search idea from problem hypothesis to deployed product",
    "Built a live accuracy leaderboard comparing SARIMA and LightGBM",
    "Increased sales by 60% while leading a 26-woman entrepreneurship initiative",
    "Reached 1.1M+ impressions writing about technology on X",
    "Awarded a 40% merit scholarship in the top 10% of the cohort",
    "Reduced student wait time by 45% by redesigning doubt resolution",
    "Shipped an IoT + ML forecasting product",
  ])("reads finished work as done: %s", (text) => {
    expect(inferReadiness(text)).toBe("done");
  });

  it.each([
    "Draft the migration plan",
    "Ship the next release",
    "Follow up with the vendor",
  ])("keeps forward-looking work pending: %s", (text) => {
    expect(inferReadiness(text)).toBe("pending");
  });

  it("keeps hedged work suggested", () => {
    expect(inferReadiness("We could migrate the store to Postgres")).toBe("suggested");
  });

  it("keeps checked items done", () => {
    expect(inferReadiness("Anything at all", { checked: true })).toBe("done");
  });
});

describe("parseActionLine on dated entity titles", () => {
  it("rejects 'Role — January 2024 – June 2025' as an action", async () => {
    const { parseActionLine } = await import("@/import/text/patterns");
    expect(parseActionLine("- Product Analyst, Acme Analytics — January 2024 – June 2025")).toBeNull();
    expect(parseActionLine("Project Leader, Nirmaan — January 2023 – May 2023")).toBeNull();
  });

  it("still parses a real owner and due", async () => {
    const { parseActionLine } = await import("@/import/text/patterns");
    const entry = parseActionLine("- Draft the report — A. Sharma — June 2025");
    expect(entry).not.toBeNull();
    expect(entry!.owner).toBe("A. Sharma");
  });
});
