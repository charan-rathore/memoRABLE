import { describe, expect, it } from "vitest";
import fixture from "../../bench/daily-memory/v1/fixture.json";
import { runBench, type BenchFixture } from "@/daily/bench";

/**
 * daily-memory-bench/v1. Hard gates are correctness properties that must
 * never regress. Quality floors sit just under the measured lexical baseline
 * so a change that loses recall fails, while any arm that wants to replace
 * the baseline has to beat these numbers in its own PR.
 */
describe("daily-memory-bench/v1 (lexical baseline)", () => {
  it("meets correctness gates and the baseline floors", async () => {
    const r = await runBench(fixture as BenchFixture);
    console.log(JSON.stringify({ ...r, failures: r.failures }, null, 2));

    // correctness: never regress
    expect(r.deletionLeaks).toBe(0);
    expect(r.staleCacheErrors).toBe(0);
    expect(r.staleUnflagged).toBe(0);
    expect(r.plannerValid).toBe(true);
    expect(r.plannerSkipRespected).toBe(true);
    expect(r.modelCalls).toBe(0);
    expect(r.costUsd).toBe(0);

    // quality floors for the baseline
    expect(r.recallAtK.all).toBeGreaterThanOrEqual(0.9);
    expect(r.multihopReach).toBe(1);
    expect(r.staleAboveCurrent).toBe(0);
    expect(r.cacheHitRate).toBeGreaterThanOrEqual(0.5);
  });
});
