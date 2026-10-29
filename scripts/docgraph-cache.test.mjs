import { test } from "node:test";
import assert from "node:assert/strict";
import { ResultCache } from "../src/import/docgraph/result-cache.ts";

const options = { ttlMs: 100, maxEntries: 2, maxBytes: 32, maxPending: 2,
  weight: value => value?.length ?? 0, cacheable: value => value !== null };

test("coalesces concurrent extraction and expires from completion", async () => {
  let time = 0, calls = 0, release;
  const cache = new ResultCache({ ...options, now: () => time });
  const load = () => { calls++; return new Promise(resolve => { release = resolve; }); };
  const first = cache.get("a", load), second = cache.get("a", load);
  await Promise.resolve(); time = 90; release("graph");
  assert.deepEqual(await Promise.all([first, second]), ["graph", "graph"]);
  time = 150; assert.equal(await cache.get("a", async () => "wrong"), "graph");
  time = 191; assert.equal(await cache.get("a", async () => "fresh"), "fresh");
  assert.equal(calls, 1);
});
test("evicts least recently used entries and bypasses oversized values", async () => {
  const cache = new ResultCache(options);
  await cache.get("a", async () => "A"); await cache.get("b", async () => "B");
  await cache.get("a", async () => "wrong"); await cache.get("c", async () => "C");
  assert.equal(await cache.get("b", async () => "new B"), "new B");
  await cache.get("large", async () => "x".repeat(33));
  assert.equal(await cache.get("large", async () => "small"), "small");
});
test("failed and empty extractions can be retried", async () => {
  const cache = new ResultCache(options);
  await assert.rejects(cache.get("a", async () => { throw new Error("offline"); }));
  assert.equal(await cache.get("a", async () => null), null);
  assert.equal(await cache.get("a", async () => "recovered"), "recovered");
});
