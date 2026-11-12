import { describe, expect, it } from "vitest";
import { DailyEngine } from "@/daily/engine";
import { tokenize } from "@/daily/lexical";
import { inferStatus, project } from "@/daily/projection";
import { MemoryStore } from "@/daily/store";

function clock(start = "2026-11-10T09:00:00.000Z") {
  let t = Date.parse(start);
  return { now: () => new Date(t), advance: (ms: number) => { t += ms; } };
}

async function engine() {
  const c = clock();
  const store = new MemoryStore();
  const e = await DailyEngine.open({ workspaceId: "w", store, now: c.now, deviceId: "t" });
  return { e, c, store };
}

describe("daily engine: capture", () => {
  it("records entries as events and rebuilds the same state from the log", async () => {
    const { e, store } = await engine();
    const a = await e.record({ kind: "worked", text: "Wired the composer", tags: ["#UX", "ux"] });
    await e.revise(a.id, "Wired the composer with Cmd+Enter");
    expect(e.entry(a.id)).toMatchObject({ version: 2, tags: ["ux"], text: "Wired the composer with Cmd+Enter" });
    expect(e.entry(a.id)!.history.map((h) => h.text)).toEqual(["Wired the composer", "Wired the composer with Cmd+Enter"]);

    const rebuilt = project("w", await store.load("w"));
    expect(rebuilt.entries.get(a.id)).toEqual(e.entry(a.id));
  });

  it("rejects empty text", async () => {
    const { e } = await engine();
    await expect(e.record({ kind: "worked", text: "   " })).rejects.toThrow();
  });

  it("every receipt reports zero model calls and zero cost", async () => {
    const { e } = await engine();
    await e.record({ kind: "learned", text: "BM25 first" });
    e.recall("bm25");
    e.next();
    expect(e.receipts.length).toBeGreaterThanOrEqual(4);
    expect(e.receipts.every((r) => r.modelCalls === 0 && r.costUsd === 0)).toBe(true);
  });
});

describe("daily engine: decision status", () => {
  it("infers status only from text evidence and records the rule", () => {
    expect(inferStatus("decided", "Should we cache reranker scores?").status).toBe("unresolved");
    expect(inferStatus("decided", "Propose a $20 cap").status).toBe("proposed");
    expect(inferStatus("decided", "Decided to keep BM25 as default").status).toBe("approved");
    expect(inferStatus("decided", "BM25 for search")).toEqual({});
    expect(inferStatus("worked", "Decided nothing, just coded")).toEqual({});
  });

  it("a status you set wins over later inference", async () => {
    const { e } = await engine();
    const d = await e.record({ kind: "decided", text: "BM25 for search" });
    expect(d.status).toBeUndefined();
    await e.setStatus(d.id, "approved");
    await e.revise(d.id, "maybe BM25 for search");
    expect(e.entry(d.id)).toMatchObject({ status: "approved", statusBasis: "set by you" });
  });

  it("supersession keeps the old decision findable but flagged", async () => {
    const { e } = await engine();
    const old = await e.record({ kind: "decided", text: "Decided to store embeddings in pgvector" });
    const neu = await e.record({ kind: "decided", text: "Decided to store embeddings in SQLite", supersedes: old.id });
    expect(e.entry(old.id)).toMatchObject({ status: "superseded", supersededBy: neu.id });
    const r = e.recall("store embeddings");
    expect(r.hits[0]!.entryId).toBe(neu.id);
    expect(r.hits.find((h) => h.entryId === old.id)).toMatchObject({ stale: true, supersededBy: neu.id });
  });
});

describe("daily engine: recall cache and invalidation", () => {
  it("serves repeated queries from cache and drops only affected answers", async () => {
    const { e } = await engine();
    for (let i = 0; i < 12; i++) await e.record({ kind: "worked", text: `Routine note number ${i} about deploys and logs` });
    await e.record({ kind: "learned", text: "OCR is slow; prefer the text layer" });
    const b = await e.record({ kind: "learned", text: "Cache keys include permission state" });
    expect(e.recall("ocr text layer").cache).toBe("miss");
    expect(e.recall("cache permission").cache).toBe("miss");
    expect(e.recall("ocr text layer").cache).toBe("hit");

    await e.revise(b.id, "Cache keys include permission state and source version");
    expect(e.recall("ocr text layer").cache).toBe("hit"); // unrelated answer survives
    const again = e.recall("cache permission");
    expect(again.cache).toBe("miss");
    expect(e.recallIndex.index.stats.epoch).toBeGreaterThan(0);
  });

  it("rolls the statistics epoch as the corpus grows and never serves a stale score", async () => {
    const { e } = await engine();
    await e.record({ kind: "learned", text: "Reranker helps paraphrased questions" });
    const before = e.recallIndex.index.stats.epoch;
    e.recall("reranker");
    for (let i = 0; i < 20; i++) await e.record({ kind: "worked", text: `Filler ${i}` });
    expect(e.recallIndex.index.stats.epoch).toBeGreaterThan(before);
    const r = e.recall("reranker");
    expect(r.hits).toEqual(e.recallIndex.compute(e.workspace, "reranker", 8).hits);
  });

  it("a new entry matching a cached query invalidates it", async () => {
    const { e } = await engine();
    await e.record({ kind: "worked", text: "Tuned reranker" });
    e.recall("reranker");
    const n = await e.record({ kind: "learned", text: "Reranker helps paraphrases" });
    const r = e.recall("reranker");
    expect(r.cache).toBe("miss");
    expect(r.hits.map((h) => h.entryId)).toContain(n.id);
  });

  it("follows explicit #handle links one hop", async () => {
    const { e } = await engine();
    const cap = await e.record({ kind: "decided", text: "Propose a monthly spending cap" });
    const t = await e.record({ kind: "task", text: `Follow up on #${cap.handle} before the demo opens` });
    expect(t.refs).toEqual([cap.id]);
    const r = e.recall("follow up demo");
    expect(r.hits[0]!.entryId).toBe(t.id);
    expect(r.linked).toContainEqual({ entryId: cap.id, from: t.id });
  });
});

describe("daily engine: deletion", () => {
  it("removes the entry from views, index, cache and stored text; says it is not unlearning", async () => {
    const { e, store } = await engine();
    const secret = await e.record({ kind: "worked", text: "Pasted key sk-test-SECRET into notes" });
    await e.revise(secret.id, "Pasted key sk-test-SECRET into notes (oops)");
    e.recall("pasted key");
    const res = await e.delete(secret.id);
    expect(res.redactedEvents).toBe(2);
    expect(res.invalidated).toBeGreaterThan(0);
    expect(e.entry(secret.id)).toBeUndefined();
    expect(e.recall("pasted key").hits).toHaveLength(0);
    expect(store.dump("w")).not.toContain("SECRET");
    expect(store.dump("w")).toContain("entry.deleted");
    await expect(e.revise(secret.id, "x")).rejects.toThrow(/deleted/);

    const reopened = await DailyEngine.open({ workspaceId: "w", store });
    expect(reopened.entry(secret.id)).toBeUndefined();
    expect(reopened.recall("pasted key").hits).toHaveLength(0);
  });

  it("deleting the newer decision un-supersedes the older one", async () => {
    const { e } = await engine();
    const a = await e.record({ kind: "decided", text: "Decided on pgvector" });
    const b = await e.record({ kind: "decided", text: "Decided on SQLite", supersedes: a.id });
    await e.delete(b.id);
    expect(e.entry(a.id)).toMatchObject({ status: "approved" });
    expect(e.entry(a.id)!.supersededBy).toBeUndefined();
  });
});

describe("daily engine: next task", () => {
  it("ranks open work with readable reasons and respects skip / accept / revise", async () => {
    const { e, c } = await engine();
    const t1 = await e.record({ kind: "task", text: "Write the sync conflict policy" });
    const q = await e.record({ kind: "decided", text: "Open question: expose receipts to everyone?" });
    c.advance(86_400_000 * 2);
    await e.record({ kind: "worked", text: "Prototyped sync between two devices" });
    const done = await e.record({ kind: "task", text: "Rotate secret" });
    await e.setTask(done.id, "done");

    const [first, second] = e.next();
    expect(first!.entryId).toBe(t1.id);
    expect(first!.reasons).toEqual(expect.arrayContaining(["an open task", expect.stringMatching(/connects to recent work \(.*sync/), "waiting 2 days"]));
    expect(second!.entryId).toBe(q.id);
    expect(e.next().map((x) => x.entryId)).not.toContain(done.id);

    await e.decide(t1.id, "skipped");
    expect(e.next()[0]!.entryId).not.toBe(t1.id);

    const revised = await e.decide(q.id, "revised", "Decide receipts visibility with two users");
    expect(revised?.kind).toBe("task");
    await e.decide(revised!.id, "accepted");
    expect(e.entry(revised!.id)!.task).toBe("accepted");
  });
});

describe("daily engine: review", () => {
  it("counts progress per day and reports measured system numbers", async () => {
    const { e } = await engine();
    await e.record({ kind: "worked", text: "A" });
    await e.record({ kind: "decided", text: "Decided B" });
    await e.record({ kind: "decided", text: "Should we C?" });
    e.recall("b"); e.recall("b");
    const r = e.review(7);
    expect(r.days.at(-1)!.counts).toMatchObject({ worked: 1, decided: 2 });
    expect(r.decisions).toMatchObject({ approved: 1, unresolved: 1 });
    expect(r.system.recallCacheHitRate).toBe(0.5);
    expect(r.system.modelCalls).toBe(0);
  });
});

describe("tokenizer", () => {
  it("normalises simple inflections so cache / caching / cached meet", () => {
    expect(tokenize("cache caching cached caches")).toEqual(["cach", "cach", "cach", "cach"]);
    expect(tokenize("The queries were stored")).toEqual(["query", "stor"]);
  });
});
