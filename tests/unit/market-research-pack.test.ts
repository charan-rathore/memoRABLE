import { describe, expect, it } from "vitest";
import {
  GUIDANCE_RETRIEVED,
  ILLUSTRATIVE_EXAMPLE_BAN,
  UMBREX_GUIDANCE_PACK,
} from "@/understanding/market-research/guidance-pack";

describe("Umbrex guidance pack integrity", () => {
  it("covers all 10 standing-method steps in order", () => {
    expect(UMBREX_GUIDANCE_PACK.map((s) => s.id)).toEqual([
      "clarify",
      "boundary",
      "driver-tree",
      "source-plan",
      "sizing",
      "customer",
      "competition",
      "scenarios",
      "qa-gate",
      "deliver",
    ]);
  });

  it("every step has guidance and umbrex.com https source links", () => {
    for (const step of UMBREX_GUIDANCE_PACK) {
      expect(step.guidance.length).toBeGreaterThanOrEqual(2);
      expect(step.sources.length).toBeGreaterThanOrEqual(1);
      for (const url of step.sources) {
        expect(url).toMatch(/^https:\/\/umbrex\.com\//);
      }
      for (const g of step.guidance) {
        expect(g.trim().length).toBeGreaterThan(20);
      }
    }
  });

  it("steps relying on gated chapters disclose the access limit", () => {
    const gated = UMBREX_GUIDANCE_PACK.filter((s) =>
      ["customer", "scenarios", "source-plan", "deliver"].includes(s.id),
    );
    for (const step of gated) {
      expect(step.accessNotes).toBeTruthy();
    }
  });

  it("carries the retrieval stamp and the illustrative-example ban", () => {
    expect(GUIDANCE_RETRIEVED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(ILLUSTRATIVE_EXAMPLE_BAN).toContain("must not appear as market data");
  });

  it("contains no illustrative playbook example figures as data", () => {
    const all = JSON.stringify(UMBREX_GUIDANCE_PACK);
    // Malformed OOM worked example and known illustrative case numbers.
    expect(all).not.toContain("75 million");
    expect(all).not.toContain("$60/kWh");
    expect(all).not.toContain("electrolyzer capacity of");
  });
});
