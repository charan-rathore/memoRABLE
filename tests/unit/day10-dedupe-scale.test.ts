import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { dedupeByMeaning } from "@/understanding/language";
import { importSource } from "@/import/import-source";

// dedupeByMeaning re-tokenized both sides of every pairwise comparison, so a
// few thousand distinct lines (a long task dump) took ~15s to import and the
// time quadrupled per doubling of the line count.
describe("dedupeByMeaning keeps its meaning rules", () => {
  it("drops exact restatements, keeps the first phrasing", () => {
    const out = dedupeByMeaning(
      ["Pay the EMI of Rs 42,500", "Pay the EMI of Rs 42,500.", "Call the dentist"],
      (x) => x,
    );
    expect(out).toEqual(["Pay the EMI of Rs 42,500", "Call the dentist"]);
  });

  it("treats differing numbers as different events", () => {
    const out = dedupeByMeaning(
      ["6E 5342 Bengaluru to Jaipur December 18", "6E 5319 Jaipur to Bengaluru December 20"],
      (x) => x,
    );
    expect(out).toHaveLength(2);
  });

  it("normalizes number grouping separators", () => {
    expect(dedupeByMeaning(["1,500 seats booked", "1500 seats booked"], (x) => x)).toHaveLength(1);
  });

  it("skips blank texts and empty-token strings", () => {
    expect(dedupeByMeaning(["", "   ", "!!!", "!!!"], (x) => x)).toEqual(["!!!"]);
  });

  it("imports a long task dump in linear-ish time", () => {
    const doc = Array.from({ length: 3000 }, (_, i) => `- Task ${i} due October ${(i % 28) + 1}, 2026`).join("\n");
    const t0 = performance.now();
    const r = importSource({ raw: doc, label: "perf-budget" });
    const ms = performance.now() - t0;
    expect(r.ok).toBe(true);
    // Base: ~8.5s here (quadratic). Fixed: ~0.2s. Budget 3s splits them.
    expect(ms).toBeLessThan(3000);
  });
});
