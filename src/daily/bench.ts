import { DailyEngine } from "./engine";
import { percentile } from "./review";
import { MemoryStore } from "./store";
import type { DecisionStatus, EntryKind, TaskState } from "./types";

/**
 * daily-memory-bench/v1 runner. Pure and deterministic apart from measured
 * latency. Every number it reports is counted, never estimated.
 */
export interface BenchFixture {
  version: string;
  workspaceId: string;
  start: string;
  entries: Array<{ key: string; day: number; kind: EntryKind; text: string; tags?: string[]; supersedes?: string }>;
  deletes: string[];
  taskStates: Array<{ key: string; state: TaskState }>;
  statusSets?: Array<{ key: string; status: Exclude<DecisionStatus, "superseded"> }>;
  queries: Array<{
    id: string;
    category: "recovery" | "update" | "multihop" | "deletion";
    q: string;
    expect?: string[];
    stale?: string[];
    linked?: string[];
    forbid?: string[];
    forbidText?: string;
  }>;
  plan: { atDay: number; allowed: string[]; neverSuggest: string[] };
  k: number;
  repeatQueries: number;
  /** Queries are warmed into the cache after this day, before later updates. */
  warmAfterDay: number;
}

export interface BenchReport {
  version: string;
  baseline: string;
  entries: number;
  queries: number;
  recallAtK: Record<"recovery" | "update" | "multihop" | "all", number>;
  mrr: number;
  multihopReach: number;
  staleAboveCurrent: number;
  staleUnflagged: number;
  staleCacheErrors: number;
  deletionLeaks: number;
  plannerValid: boolean;
  plannerSkipRespected: boolean;
  latencyMs: { recallP50: number; recallP95: number; recordP95: number };
  indexCostMs: { build: number; perUpdateP95: number };
  invalidatedPerUpdate: number;
  cacheHitRate: number;
  modelCalls: number;
  costUsd: number;
  failures: string[];
}

const DAY = 86_400_000;

export async function runBench(fx: BenchFixture, timer: () => number = () => performance.now()): Promise<BenchReport> {
  let clock = Date.parse(fx.start);
  const store = new MemoryStore();
  const engine = await DailyEngine.open({ workspaceId: fx.workspaceId, store, now: () => new Date(clock), timer, deviceId: "bench" });
  const ids = new Map<string, string>();
  const keyOf = (id: string) => [...ids].find(([, v]) => v === id)?.[0] ?? id;
  const failures: string[] = [];

  const buildStart = timer();
  const ordered = [...fx.entries].sort((a, b) => a.day - b.day);
  let warmed = false;
  for (const [i, e] of ordered.entries()) {
    if (!warmed && e.day > fx.warmAfterDay) {
      for (const q of fx.queries) engine.recall(q.q, fx.k);
      warmed = true;
    }
    clock = Date.parse(fx.start) + e.day * DAY + i * 60_000;
    const text = e.text.replace(/\{\{(\w+)\}\}/g, (_, k: string) => `#${engine.entry(ids.get(k) ?? "")?.handle ?? k}`);
    const supersedes = e.supersedes ? ids.get(e.supersedes) : undefined;
    const rec = await engine.record({ kind: e.kind, text, tags: e.tags ?? [], ...(supersedes ? { supersedes } : {}) });
    ids.set(e.key, rec.id);
  }
  const buildMs = timer() - buildStart;

  for (const s of fx.statusSets ?? []) await engine.setStatus(ids.get(s.key)!, s.status);
  for (const t of fx.taskStates) await engine.setTask(ids.get(t.key)!, t.state);
  for (const d of fx.deletes) await engine.delete(ids.get(d)!);

  clock = Date.parse(fx.start) + fx.plan.atDay * DAY;

  // ── retrieval quality, with a cache-correctness check: every answer served
  // (cached or not) must equal an uncached computation on the same index ──
  const cat = { recovery: [0, 0], update: [0, 0], multihop: [0, 0], all: [0, 0] } as Record<string, [number, number]>;
  let rr = 0, rrN = 0, reach = 0, reachN = 0, staleAbove = 0, staleUnflagged = 0, staleCache = 0, leaks = 0;

  for (let rep = 0; rep < fx.repeatQueries; rep++) {
    for (const q of fx.queries) {
      const r = engine.recall(q.q, fx.k);
      if (rep > 0) {
        const fresh = engine.recallIndex.compute(engine.workspace, q.q, fx.k);
        if (JSON.stringify(r.hits) !== JSON.stringify(fresh.hits)) { staleCache++; failures.push(`${q.id}: repeat ${r.cache} answer differs`); }
        continue;
      }
      const fresh = engine.recallIndex.compute(engine.workspace, q.q, fx.k);
      if (JSON.stringify(r.hits) !== JSON.stringify(fresh.hits)) { staleCache++; failures.push(`${q.id}: ${r.cache} answer differs from an uncached computation`); }

      const order = r.hits.map((h) => keyOf(h.entryId));
      for (const h of r.hits) {
        const e = engine.entry(h.entryId);
        if (e?.status === "superseded" && !h.stale) staleUnflagged++;
      }
      if (q.expect) {
        const pos = order.findIndex((k) => q.expect!.includes(k));
        const ok = pos >= 0;
        if (q.category !== "deletion") { cat[q.category]![0]++; cat[q.category]![1] += ok ? 1 : 0; cat.all![0]++; cat.all![1] += ok ? 1 : 0; }
        rrN++; rr += ok ? 1 / (pos + 1) : 0;
        if (!ok) failures.push(`${q.id}: expected ${q.expect.join("|")} in top ${fx.k}, got ${order.join(",") || "nothing"}`);
        for (const s of q.stale ?? []) {
          const sp = order.indexOf(s);
          if (sp >= 0 && (pos < 0 || sp < pos)) { staleAbove++; failures.push(`${q.id}: superseded ${s} ranked above current`); }
        }
      }
      if (q.linked) {
        reachN++;
        const reached = new Set([...order, ...r.linked.map((l) => keyOf(l.entryId))]);
        if (q.linked.every((k) => reached.has(k))) reach++; else failures.push(`${q.id}: linked ${q.linked.join(",")} not reached`);
      }
      for (const f of q.forbid ?? []) if (order.includes(f) || r.linked.some((l) => keyOf(l.entryId) === f)) { leaks++; failures.push(`${q.id}: deleted ${f} returned`); }
      if (q.forbidText && JSON.stringify(r).includes(q.forbidText)) { leaks++; failures.push(`${q.id}: deleted text in answer`); }
    }
  }
  for (const q of fx.queries) if (q.forbidText && store.dump(fx.workspaceId).includes(q.forbidText)) { leaks++; failures.push(`${q.id}: deleted text still in stored events`); break; }

  // ── planner ──
  const next = engine.next(3);
  const plannerValid = next.length > 0 && next.every((c) => fx.plan.allowed.includes(keyOf(c.entryId)) && !fx.plan.neverSuggest.includes(keyOf(c.entryId)));
  if (!plannerValid) failures.push(`planner suggested ${next.map((c) => keyOf(c.entryId)).join(",")}`);
  const top = next[0]?.entryId ?? null;
  await engine.decide(top, "skipped");
  const after = engine.next(3);
  const plannerSkipRespected = !!top && after[0]?.entryId !== top;
  if (!plannerSkipRespected) failures.push("planner re-suggested a task skipped a moment ago");

  // ── receipts ──
  const receipts = engine.receipts;
  const ms = (op: string) => receipts.filter((r) => r.op === op).map((r) => r.ms);
  const updates = receipts.filter((r) => ["record", "revise", "status", "supersede", "delete"].includes(r.op));
  const recalls = receipts.filter((r) => r.op === "recall");
  const ratio = (a: [number, number]) => (a[0] ? round(a[1] / a[0]) : 1);

  return {
    version: fx.version,
    baseline: "bm25-v1 lexical + explicit links; no vectors, no graph ranking, no model",
    entries: engine.workspace.entries.size,
    queries: fx.queries.length,
    recallAtK: { recovery: ratio(cat.recovery!), update: ratio(cat.update!), multihop: ratio(cat.multihop!), all: ratio(cat.all!) },
    mrr: rrN ? round(rr / rrN) : 0,
    multihopReach: reachN ? round(reach / reachN) : 1,
    staleAboveCurrent: staleAbove,
    staleUnflagged,
    staleCacheErrors: staleCache,
    deletionLeaks: leaks,
    plannerValid,
    plannerSkipRespected,
    latencyMs: { recallP50: round(percentile(ms("recall"), 50)), recallP95: round(percentile(ms("recall"), 95)), recordP95: round(percentile(ms("record"), 95)) },
    indexCostMs: { build: round(buildMs), perUpdateP95: round(percentile(updates.map((u) => u.ms), 95)) },
    invalidatedPerUpdate: updates.length ? round(updates.reduce((a, u) => a + u.invalidated, 0) / updates.length) : 0,
    cacheHitRate: recalls.length ? round(recalls.filter((r) => r.cache === "hit").length / recalls.length) : 0,
    modelCalls: receipts.reduce((a, r) => a + r.modelCalls, 0),
    costUsd: receipts.reduce((a, r) => a + r.costUsd, 0),
    failures,
  };
}

const round = (n: number) => Math.round(n * 1000) / 1000;
