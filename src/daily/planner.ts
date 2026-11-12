import { tokenize } from "./lexical";
import type { Entry, WorkspaceState } from "./types";

export interface PlanCandidate {
  entryId: string;
  score: number;
  /** Plain-language reasons, in the order they contributed. */
  reasons: string[];
}

const DAY = 86_400_000;
export const PLANNER_ID = "deterministic-v1";

/**
 * Next task, chosen without a model. Candidates are open or accepted tasks
 * and decisions still marked proposed or unresolved. Every point of score
 * has a reason the person can read, so the choice can be argued with.
 */
export function rankNext(state: WorkspaceState, now: Date, limit = 3): PlanCandidate[] {
  const nowMs = now.getTime();
  const recentTerms = new Set<string>();
  for (const e of state.entries.values()) {
    if (nowMs - Date.parse(e.createdAt) <= 2 * DAY && e.kind !== "task") for (const t of tokenize(e.text)) recentTerms.add(t);
  }
  const skippedRecently = new Set(
    state.plans.filter((p) => p.decision === "skipped" && p.candidateId && nowMs - Date.parse(p.at) < DAY).map((p) => p.candidateId as string),
  );

  const out: PlanCandidate[] = [];
  for (const e of state.entries.values()) {
    const c = score(e, nowMs, recentTerms, skippedRecently.has(e.id));
    if (c) out.push(c);
  }
  out.sort((a, b) => b.score - a.score || Date.parse(state.entries.get(a.entryId)!.createdAt) - Date.parse(state.entries.get(b.entryId)!.createdAt) || (a.entryId < b.entryId ? -1 : 1));
  return out.slice(0, limit);
}

function score(e: Entry, nowMs: number, recent: Set<string>, skipped: boolean): PlanCandidate | null {
  const reasons: string[] = [];
  let s = 0;
  if (e.kind === "task" && (e.task === "open" || e.task === "accepted")) {
    s += 3; reasons.push(e.task === "accepted" ? "a task you accepted" : "an open task");
    if (e.task === "accepted") s += 0.5;
  } else if (e.kind === "decided" && e.status === "unresolved") {
    s += 2; reasons.push("a decision still unresolved");
  } else if (e.kind === "decided" && e.status === "proposed") {
    s += 1.5; reasons.push("a proposal waiting for a call");
  } else return null;

  const overlap = tokenize(e.text).filter((t) => recent.has(t));
  if (overlap.length) { s += 1; reasons.push(`connects to recent work (${[...new Set(overlap)].slice(0, 3).join(", ")})`); }

  const ageDays = Math.min(7, Math.max(0, (nowMs - Date.parse(e.createdAt)) / DAY));
  if (ageDays >= 1) { s += 0.1 * ageDays; reasons.push(`waiting ${Math.floor(ageDays)} day${ageDays >= 2 ? "s" : ""}`); }

  if (skipped) { s -= 2; reasons.push("you skipped it in the last day"); }
  return { entryId: e.id, score: Math.round(s * 100) / 100, reasons };
}
