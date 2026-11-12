import type { DecisionStatus, EntryKind, Receipt, WorkspaceState } from "./types";

export interface OpStats { op: Receipt["op"]; count: number; p50: number; p95: number }

export interface Review {
  days: Array<{ day: string; counts: Record<EntryKind, number> }>;
  decisions: Record<DecisionStatus | "unstated", number>;
  tasks: { open: number; accepted: number; done: number; dropped: number };
  system: {
    ops: OpStats[];
    recallCacheHitRate: number | null;
    invalidatedPerUpdate: number | null;
    modelCalls: number;
    costUsd: number;
    receipts: number;
  };
}

export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[i]!;
}

const dayOf = (iso: string) => iso.slice(0, 10);

/** Personal progress and measured system performance, both from real records. */
export function review(state: WorkspaceState, receipts: Receipt[], lastDays = 7, now = new Date()): Review {
  const days: Review["days"] = [];
  for (let i = lastDays - 1; i >= 0; i--) {
    const day = dayOf(new Date(now.getTime() - i * 86_400_000).toISOString());
    days.push({ day, counts: { worked: 0, learned: 0, decided: 0, task: 0 } });
  }
  const byDay = new Map(days.map((d) => [d.day, d]));
  const decisions: Review["decisions"] = { proposed: 0, approved: 0, unresolved: 0, superseded: 0, unstated: 0 };
  const tasks = { open: 0, accepted: 0, done: 0, dropped: 0 };
  for (const e of state.entries.values()) {
    const d = byDay.get(dayOf(e.createdAt));
    if (d) d.counts[e.kind]++;
    if (e.kind === "decided") decisions[e.status ?? "unstated"]++;
    if (e.kind === "task" && e.task) tasks[e.task]++;
  }

  const groups = new Map<Receipt["op"], number[]>();
  for (const r of receipts) (groups.get(r.op) ?? groups.set(r.op, []).get(r.op)!).push(r.ms);
  const ops = [...groups].map(([op, ms]) => ({ op, count: ms.length, p50: round(percentile(ms, 50)), p95: round(percentile(ms, 95)) }));
  const recalls = receipts.filter((r) => r.op === "recall");
  const updates = receipts.filter((r) => r.op === "record" || r.op === "revise" || r.op === "status" || r.op === "supersede" || r.op === "delete");
  return {
    days, decisions, tasks,
    system: {
      ops,
      recallCacheHitRate: recalls.length ? round(recalls.filter((r) => r.cache === "hit").length / recalls.length) : null,
      invalidatedPerUpdate: updates.length ? round(updates.reduce((a, r) => a + r.invalidated, 0) / updates.length) : null,
      modelCalls: receipts.reduce((a, r) => a + r.modelCalls, 0),
      costUsd: receipts.reduce((a, r) => a + r.costUsd, 0),
      receipts: receipts.length,
    },
  };
}

const round = (n: number) => Math.round(n * 1000) / 1000;
