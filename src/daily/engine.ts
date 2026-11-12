import { apply, handleOf, project } from "./projection";
import { rankNext, type PlanCandidate } from "./planner";
import { Recall, type RecallHit, type RecallResult } from "./recall";
import { review, type Review } from "./review";
import type { EventStore } from "./store";
import {
  DAILY_SCHEMA, type DailyEvent, type DailyEventBody, type DecisionStatus, type Entry, type EntryKind,
  type Receipt, type TaskState, type WorkspaceState,
} from "./types";

export interface EngineOptions {
  workspaceId: string;
  store: EventStore;
  now?: () => Date;
  /** High-resolution timer for receipts. */
  timer?: () => number;
  deviceId?: string;
  /** Keep at most this many receipts in memory. */
  receiptLimit?: number;
}

export interface RecallWithLinks extends RecallResult {
  /** Entries reached by one explicit link (#handle) from a hit. Not scored by BM25. */
  linked: Array<{ entryId: string; from: string }>;
}

const HANDLE_RE = /#([a-z0-9]{6})\b/gi;

/**
 * The daily memory engine: append-only events in, projections and receipts
 * out. Deterministic, no network, no model calls. Everything a UI needs to
 * open instantly and work offline.
 */
export class DailyEngine {
  private state: WorkspaceState;
  readonly recallIndex = new Recall();
  private receiptsLog: Receipt[] = [];
  private counter = 0;
  private readonly now: () => Date;
  private readonly timer: () => number;
  private readonly device: string;
  private readonly limit: number;

  private constructor(private opts: EngineOptions, state: WorkspaceState) {
    this.state = state;
    this.now = opts.now ?? (() => new Date());
    this.timer = opts.timer ?? (() => (globalThis.performance?.now?.() ?? Date.now()));
    this.device = (opts.deviceId ?? "local").replace(/[^a-z0-9]/gi, "").slice(0, 8) || "local";
    this.limit = opts.receiptLimit ?? 2000;
  }

  static async open(opts: EngineOptions): Promise<DailyEngine> {
    const t0 = (opts.timer ?? (() => (globalThis.performance?.now?.() ?? Date.now())))();
    const events = await opts.store.load(opts.workspaceId);
    const state = project(opts.workspaceId, events);
    const engine = new DailyEngine(opts, state);
    for (const e of state.entries.values()) engine.recallIndex.upsert(e);
    engine.receipt({ op: "load", started: t0, scanned: events.length, cache: "n/a", invalidated: 0 });
    return engine;
  }

  get workspace(): Readonly<WorkspaceState> { return this.state; }
  get receipts(): readonly Receipt[] { return this.receiptsLog; }
  entry(id: string): Entry | undefined { return this.state.entries.get(id); }
  findByHandle(handle: string): Entry | undefined {
    const h = handle.replace(/^#/, "").toLowerCase();
    for (const e of this.state.entries.values()) if (e.handle === h) return e;
    return undefined;
  }

  /** Newest first. */
  timeline(limit = 50): Entry[] {
    return [...this.state.entries.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? 1 : -1)).slice(0, limit);
  }

  // ── writes ────────────────────────────────────────────────────────────

  async record(input: { kind: EntryKind; text: string; tags?: string[]; sourceIds?: string[]; supersedes?: string }): Promise<Entry> {
    const text = input.text.trim();
    if (!text) throw new Error("Nothing to record.");
    const t0 = this.timer();
    let entryId = this.newId("e");
    while (this.findByHandle(handleOf(entryId))) entryId = this.newId("e");
    const refs = this.resolveRefs(text);
    let invalidated = await this.commit({ type: "entry.recorded", entryId, kind: input.kind, text, tags: normTags(input.tags), sourceIds: input.sourceIds ?? [], refs });
    if (input.supersedes && this.state.entries.has(input.supersedes)) {
      invalidated += await this.commit({ type: "entry.superseded", entryId: input.supersedes, by: entryId });
    }
    this.receipt({ op: "record", started: t0, scanned: refs.length, cache: "n/a", invalidated });
    return this.state.entries.get(entryId)!;
  }

  async revise(entryId: string, text: string, tags?: string[]): Promise<Entry> {
    const cur = this.must(entryId);
    const t0 = this.timer();
    const clean = text.trim();
    if (!clean) throw new Error("Text cannot be empty; delete the entry instead.");
    const invalidated = await this.commit({ type: "entry.revised", entryId, text: clean, tags: normTags(tags ?? cur.tags), refs: this.resolveRefs(clean, entryId) });
    this.receipt({ op: "revise", started: t0, scanned: 0, cache: "n/a", invalidated });
    return this.state.entries.get(entryId)!;
  }

  async setStatus(entryId: string, status: Exclude<DecisionStatus, "superseded">): Promise<Entry> {
    this.must(entryId);
    const t0 = this.timer();
    const invalidated = await this.commit({ type: "entry.status", entryId, status, basis: "set by you" });
    this.receipt({ op: "status", started: t0, scanned: 0, cache: "n/a", invalidated });
    return this.state.entries.get(entryId)!;
  }

  async supersede(entryId: string, by: string): Promise<void> {
    this.must(entryId); this.must(by);
    if (entryId === by) throw new Error("An entry cannot supersede itself.");
    const t0 = this.timer();
    const invalidated = await this.commit({ type: "entry.superseded", entryId, by });
    this.receipt({ op: "supersede", started: t0, scanned: 0, cache: "n/a", invalidated });
  }

  /**
   * Explicit deletion: the entry leaves every view, index and cached answer,
   * and its text is redacted from stored events. A tombstone records that a
   * deletion happened. This removes stored and derived data held here; it is
   * not machine unlearning, and copies synced elsewhere are out of scope.
   */
  async delete(entryId: string): Promise<{ redactedEvents: number; invalidated: number }> {
    this.must(entryId);
    const t0 = this.timer();
    const invalidated = await this.commit({ type: "entry.deleted", entryId });
    const redactedEvents = await this.opts.store.redact(this.state.workspaceId, entryId);
    this.receipt({ op: "delete", started: t0, scanned: redactedEvents, cache: "n/a", invalidated });
    return { redactedEvents, invalidated };
  }

  async attachSource(input: { name: string; mime: string; text: string; bytes?: number }): Promise<string> {
    const t0 = this.timer();
    const sourceId = this.newId("s");
    const contentHash = await sha256(input.text);
    await this.commit({ type: "source.attached", sourceId, name: input.name, mime: input.mime, bytes: input.bytes ?? new TextEncoder().encode(input.text).length, contentHash, excerpt: input.text.slice(0, 280) });
    this.receipt({ op: "attach", started: t0, scanned: 0, cache: "n/a", invalidated: 0 });
    return sourceId;
  }

  async setTask(entryId: string, state: TaskState): Promise<void> {
    const e = this.must(entryId);
    if (e.kind !== "task") throw new Error("Only tasks have a task state.");
    await this.commit({ type: "task.state", entryId, state });
  }

  // ── reads ─────────────────────────────────────────────────────────────

  recall(query: string, k = 8): RecallWithLinks {
    const t0 = this.timer();
    const r = this.recallIndex.query(this.state, { query, k });
    const seen = new Set(r.hits.map((h) => h.entryId));
    const linked: RecallWithLinks["linked"] = [];
    for (const h of r.hits) {
      const e = this.state.entries.get(h.entryId);
      if (!e) continue;
      const neighbours = [...e.refs, ...e.supersedes, ...(e.supersededBy ? [e.supersededBy] : [])];
      for (const n of neighbours) if (!seen.has(n) && this.state.entries.has(n)) { seen.add(n); linked.push({ entryId: n, from: h.entryId }); }
    }
    this.receipt({ op: "recall", started: t0, scanned: r.scanned, cache: r.cache, invalidated: 0 });
    return { ...r, linked };
  }

  next(limit = 3): PlanCandidate[] {
    const t0 = this.timer();
    const c = rankNext(this.state, this.now(), limit);
    this.receipt({ op: "plan", started: t0, scanned: this.state.entries.size, cache: "n/a", invalidated: 0 });
    return c;
  }

  /** Accept, revise (records a replacement task), or skip the suggestion. */
  async decide(candidateId: string | null, decision: "accepted" | "revised" | "skipped", revisedText?: string): Promise<Entry | undefined> {
    let revised: Entry | undefined;
    if (decision === "revised") {
      if (!revisedText?.trim()) throw new Error("A revision needs the new task text.");
      revised = await this.record({ kind: "task", text: revisedText });
      if (candidateId && this.state.entries.get(candidateId)?.kind === "task") await this.setTask(candidateId, "dropped");
    }
    if (decision === "accepted" && candidateId && this.state.entries.get(candidateId)?.kind === "task") await this.setTask(candidateId, "accepted");
    await this.commit({ type: "plan.decided", candidateId, decision, ...(revised ? { revisedEntryId: revised.id } : {}) });
    return revised;
  }

  review(lastDays = 7): Review { return review(this.state, this.receiptsLog, lastDays, this.now()); }

  // ── internals ─────────────────────────────────────────────────────────

  private async commit(body: DailyEventBody): Promise<number> {
    const event = { ...body, id: this.newId("v"), seq: this.state.lastSeq + 1, at: this.now().toISOString(), workspaceId: this.state.workspaceId, schema: DAILY_SCHEMA } as DailyEvent;
    await this.opts.store.append(event);
    const touched = apply(this.state, event);
    let invalidated = 0;
    for (const id of new Set(touched)) {
      const e = this.state.entries.get(id);
      invalidated += e ? this.recallIndex.upsert(e) : this.recallIndex.remove(id);
    }
    return invalidated;
  }

  private resolveRefs(text: string, self?: string): string[] {
    const out = new Set<string>();
    for (const m of text.matchAll(HANDLE_RE)) {
      const e = this.findByHandle(m[1]!);
      if (e && e.id !== self) out.add(e.id);
    }
    return [...out];
  }

  private must(id: string): Entry {
    const e = this.state.entries.get(id);
    if (!e) throw new Error(this.state.deleted.has(id) ? "That entry was deleted." : "No such entry.");
    return e;
  }

  private newId(prefix: string): string {
    this.counter = (this.counter + 1) % 1_679_616;
    return `${prefix}${this.now().getTime().toString(36)}${this.counter.toString(36).padStart(4, "0")}${this.device}`;
  }

  private receipt(r: { op: Receipt["op"]; started: number; scanned: number; cache: Receipt["cache"]; invalidated: number }) {
    this.receiptsLog.push({ op: r.op, ms: Math.max(0, this.timer() - r.started), scanned: r.scanned, cache: r.cache, invalidated: r.invalidated, modelCalls: 0, costUsd: 0, at: this.now().toISOString() });
    if (this.receiptsLog.length > this.limit) this.receiptsLog.splice(0, this.receiptsLog.length - this.limit);
  }
}

export { handleOf };
export type { RecallHit, PlanCandidate, Review };

function normTags(tags?: string[]): string[] {
  return [...new Set((tags ?? []).map((t) => t.trim().toLowerCase().replace(/^#/, "")).filter(Boolean))].slice(0, 12);
}

async function sha256(text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return "unavailable";
  const buf = await subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
