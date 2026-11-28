import { describe, expect, it } from "vitest";
import { DailyEngine } from "@/daily/engine";
import { MemoryStore } from "@/daily/store";

async function engine() {
  const e = await DailyEngine.open({ workspaceId: "w", store: new MemoryStore(), now: () => new Date("2026-11-10T09:00:00Z"), deviceId: "t" });
  for (const text of ["Decided to cache sessions in Redis", "Learned retries need idempotency keys", "Worked on the reranker latency"])
    await e.record({ kind: "decided", text });
  return e;
}

describe("recall cache stays bounded and keeps hot queries", () => {
  it("prunes reverse links with evicted answers (live typing makes thousands of one-off queries)", async () => {
    const e = await engine();
    for (let i = 0; i < 3000; i++) e.recall(`redis cache q${i} idempotency`);
    const r = e.recallIndex;
    expect(r.cacheSize).toBeLessThanOrEqual(400);
    // At most (query terms + hits) links per cached answer.
    expect(r.reverseLinks).toBeLessThanOrEqual(400 * (4 + 8));
  });

  it("evicts the least recently used answer, not the oldest one", async () => {
    const e = await engine();
    e.recall("redis sessions");
    for (let i = 0; i < 399; i++) e.recall(`filler${i}`);
    expect(e.recall("redis sessions").cache).toBe("hit"); // now most recent
    e.recall("one more");
    expect(e.recall("redis sessions").cache).toBe("hit");
    expect(e.recall("filler0").cache).toBe("miss");
  });

  it("still invalidates exactly after evictions", async () => {
    const e = await engine();
    for (let i = 0; i < 500; i++) e.recall(`noise${i}`);
    expect(e.recall("redis").hits).toHaveLength(1);
    await e.record({ kind: "learned", text: "Redis eviction policy must be noeviction" });
    const after = e.recall("redis");
    expect(after.cache).toBe("miss");
    expect(after.hits).toEqual(e.recallIndex.compute(e.workspace, "redis", 8).hits);
  });
});
