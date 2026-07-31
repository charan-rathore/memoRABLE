import type {
  ActionEntry,
  BlockKind,
  DecisionEntry,
  MemoryBlock,
  MemoryRelation,
  RiskEntry,
  SignalEntry,
  TimelineEntry,
} from "@/domain/memory/schema";
import { LIMITS } from "@/domain/memory/limits";
import { normalizeKey, stemTokens } from "./language";

/**
 * Step five: connect the memories to each other.
 *
 * Six lists side by side are an index. The same six with edges between them
 * are an understanding of the document, and the difference is what a reader
 * feels as "it actually read this". A signal that shaped a decision, a
 * decision an action carries out, a phase that unblocks the next one: those
 * are the sentences a person says when they remember something properly.
 *
 * Edges are earned, never assumed. An explicit reference always wins; failing
 * that, two memories must share real vocabulary before they are linked, and
 * each memory keeps only its single best partner so the graph stays readable
 * instead of becoming a mesh where everything touches everything.
 */

/** Minimum shared-vocabulary score before two memories are called related. */
const LINK_THRESHOLD = 0.2;
/** Shared content words required regardless of ratio, so "the data" is not a link. */
const MIN_SHARED_TOKENS = 2;
/** Edges any one memory may own, keeping the graph legible. */
const MAX_EDGES_PER_MEMORY = 2;

export function buildRelations(blocks: readonly MemoryBlock[]): MemoryRelation[] {
  const signals = entriesOf<SignalEntry>(blocks, "signals");
  const decisions = entriesOf<DecisionEntry>(blocks, "decisions");
  const timeline = entriesOf<TimelineEntry>(blocks, "timeline");
  const risks = entriesOf<RiskEntry>(blocks, "risks");
  const actions = entriesOf<ActionEntry>(blocks, "actions");

  const relations: MemoryRelation[] = [];

  // The snapshot frames every memory that has anything in it.
  if (blocks.some((b) => b.kind === "snapshot")) {
    for (const kind of ["signals", "decisions", "timeline", "risks", "actions"] as const) {
      const block = blocks.find((b) => b.kind === kind);
      if (block && countOf(block) > 0) {
        relations.push({ from: "snapshot", to: kind, relation: "frames" });
      }
    }
  }

  // A signal that shaped a decision.
  relations.push(
    ...link(signals, decisions, "informs", signalText, (d) => d.text, "shaped by"),
  );

  // A signal that exposes a risk.
  relations.push(...link(signals, risks, "threatens", signalText, (r) => riskText(r), "shows up as"));

  // An action that carries out a decision. An explicit `from` beats any guess.
  relations.push(...linkActionsToDecisions(actions, decisions));

  // A phase that places an action in time.
  relations.push(
    ...link(timeline, actions, "schedules", (t) => `${t.title} ${t.produces ?? ""}`, (a) => a.task, "lands in"),
  );

  // A phase whose artifact the next phase needs.
  relations.push(...linkPhaseDependencies(timeline));

  return dedupe(relations).slice(0, LIMITS.maxRelations);
}

/* --------------------------------- helpers -------------------------------- */

interface Positioned<T> {
  kind: BlockKind;
  index: number;
  entry: T;
}

function entriesOf<T>(blocks: readonly MemoryBlock[], kind: BlockKind): Array<Positioned<T>> {
  const block = blocks.find((b) => b.kind === kind);
  if (!block || !("entries" in block.payload)) return [];
  return (block.payload.entries as T[]).map((entry, index) => ({ kind, index, entry }));
}

function countOf(block: MemoryBlock): number {
  if ("entries" in block.payload) return block.payload.entries.length;
  return 1;
}

function ref(kind: BlockKind, index: number): string {
  return `${kind}:${index}`;
}

function signalText(entry: SignalEntry): string {
  return [entry.label, entry.value, entry.implication].filter(Boolean).join(" ");
}

function riskText(entry: RiskEntry): string {
  return [entry.risk, entry.because, entry.consequence].filter(Boolean).join(" ");
}

/**
 * Score two memories on shared vocabulary. Ratio alone rewards very short
 * entries for accidents of phrasing, so a floor on absolute shared words runs
 * alongside it.
 */
function relatedness(a: string, b: string): number {
  const left = new Set(stemTokens(a));
  const right = new Set(stemTokens(b));
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared++;
  if (shared < MIN_SHARED_TOKENS) return 0;
  return shared / Math.min(left.size, right.size);
}

function link<A, B>(
  from: ReadonlyArray<Positioned<A>>,
  to: ReadonlyArray<Positioned<B>>,
  relation: MemoryRelation["relation"],
  textOfA: (entry: A) => string,
  textOfB: (entry: B) => string,
  note: string,
): MemoryRelation[] {
  const out: MemoryRelation[] = [];
  for (const source of from) {
    const scored = to
      .map((target) => ({ target, score: relatedness(textOfA(source.entry), textOfB(target.entry)) }))
      .filter((s) => s.score >= LINK_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_EDGES_PER_MEMORY);
    for (const { target } of scored) {
      out.push({
        from: ref(source.kind, source.index),
        to: ref(target.kind, target.index),
        relation,
        note,
      });
    }
  }
  return out;
}

/**
 * Actions to decisions. When the parser recorded a `from` reference the link
 * is a fact rather than an inference, so it is taken as written.
 */
function linkActionsToDecisions(
  actions: ReadonlyArray<Positioned<ActionEntry>>,
  decisions: ReadonlyArray<Positioned<DecisionEntry>>,
): MemoryRelation[] {
  const out: MemoryRelation[] = [];
  for (const action of actions) {
    const stated = action.entry.from;
    if (stated) {
      const key = normalizeKey(stated);
      const exact = decisions.find(
        (d) => (d.entry.ref && normalizeKey(d.entry.ref) === key) || normalizeKey(d.entry.text) === key,
      );
      if (exact) {
        out.push({
          from: ref(action.kind, action.index),
          to: ref(exact.kind, exact.index),
          relation: "implements",
          note: "carries out",
        });
        continue;
      }
    }
    const best = decisions
      .map((decision) => ({ decision, score: relatedness(action.entry.task, decision.entry.text) }))
      .filter((s) => s.score >= LINK_THRESHOLD)
      .sort((a, b) => b.score - a.score)[0];
    if (best) {
      out.push({
        from: ref(action.kind, action.index),
        to: ref(best.decision.kind, best.decision.index),
        relation: "implements",
        note: "carries out",
      });
    }
  }
  return out;
}

/** Phase A produces what phase B requires, so A unblocks B. */
function linkPhaseDependencies(timeline: ReadonlyArray<Positioned<TimelineEntry>>): MemoryRelation[] {
  const out: MemoryRelation[] = [];
  for (const later of timeline) {
    const needs = later.entry.requires;
    if (!needs) continue;
    const provider = timeline
      .filter((earlier) => earlier.index !== later.index && earlier.entry.produces)
      .map((earlier) => ({ earlier, score: relatedness(earlier.entry.produces!, needs) }))
      .filter((s) => s.score >= LINK_THRESHOLD)
      .sort((a, b) => b.score - a.score)[0];
    if (provider) {
      out.push({
        from: ref(provider.earlier.kind, provider.earlier.index),
        to: ref(later.kind, later.index),
        relation: "unblocks",
        note: `required before ${later.entry.title}`,
      });
    }
  }
  return out;
}

function dedupe(relations: readonly MemoryRelation[]): MemoryRelation[] {
  const seen = new Set<string>();
  const out: MemoryRelation[] = [];
  for (const relation of relations) {
    if (relation.from === relation.to) continue;
    const key = `${relation.from}>${relation.relation}>${relation.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(relation);
  }
  return out;
}

/* ------------------------------- reading the graph ------------------------- */

export interface ResolvedRef {
  kind: BlockKind;
  index: number | null;
}

export function parseRef(value: string): ResolvedRef | null {
  const [kind, index] = value.split(":");
  if (!kind) return null;
  return { kind: kind as BlockKind, index: index === undefined ? null : Number(index) };
}

/** Every edge touching a memory, in either direction. */
export function relationsFor(
  relations: readonly MemoryRelation[],
  kind: BlockKind,
  index?: number,
): MemoryRelation[] {
  const self = index === undefined ? kind : ref(kind, index);
  return relations.filter((r) => r.from === self || r.to === self);
}

/** Every edge starting at a memory. */
export function relationsFrom(
  relations: readonly MemoryRelation[],
  kind: BlockKind,
  index: number,
): MemoryRelation[] {
  return relations.filter((r) => r.from === ref(kind, index));
}

/** Every edge arriving at a memory. */
export function relationsTo(
  relations: readonly MemoryRelation[],
  kind: BlockKind,
  index: number,
): MemoryRelation[] {
  return relations.filter((r) => r.to === ref(kind, index));
}
