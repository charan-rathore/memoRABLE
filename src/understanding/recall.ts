import { LIMITS } from "@/domain/memory/limits";
import type {
  ActionEntry,
  DecisionEntry,
  RiskEntry,
  SignalEntry,
  TimelineEntry,
} from "@/domain/memory/schema";
import type { Concept } from "./concepts";
import type { Intent } from "./intent";
import {
  clampWords,
  decapitalize,
  overlap,
  readsAsFragment,
  sentenceCase,
  shorten,
  speakList,
  spellCount,
  unpunctuated,
  wordCount,
} from "./language";

/**
 * Step four: say the document back, the way a person would a week later.
 *
 * A summary describes a document. Recall describes what the document was
 * *for*, and it is a different sentence entirely. "This contains six sections"
 * is a summary. "This walks through how to break a client brief into an
 * answerable question" is recall, and only one of the two is worth reading.
 *
 * The paragraph is composed, never copied. Its clauses come from the intent,
 * the recurring concepts and the strongest memories, so its sentences did not
 * exist in the source even though every noun in them did.
 */

const KIND_NOUN: Record<Intent["kind"], string> = {
  guide: "guide",
  plan: "plan",
  review: "review",
  brief: "brief",
  spec: "spec",
  analysis: "analysis",
  notes: "set of notes",
};

/** How the opening clause is phrased, so six documents do not read as one. */
const OPENING: Record<Intent["kind"], (subject: string) => string> = {
  guide: (s) => `This guide walks through ${s}`,
  plan: (s) => `This plan lays out ${s}`,
  review: (s) => `This review takes stock of ${s}`,
  brief: (s) => `This brief brings you up to speed on ${s}`,
  spec: (s) => `This spec pins down ${s}`,
  analysis: (s) => `This analysis works through ${s}`,
  notes: (s) => `These notes record ${s}`,
};

/**
 * Recall is composed from the *finished* memories, not from the candidates.
 *
 * Composing it earlier would mean the snapshot describes what understanding
 * guessed rather than what the document ended up remembering, and the two are
 * not always the same thing. Snapshot frames everything, so it goes last.
 */
export interface RecallInput {
  intent: Intent;
  concepts: readonly Concept[];
  signals: readonly SignalEntry[];
  decisions: readonly DecisionEntry[];
  risks: readonly RiskEntry[];
  timeline: readonly TimelineEntry[];
  actions: readonly ActionEntry[];
  /** The document's own opening paragraph, used only if composition fails. */
  fallback: string;
}

export interface Recall {
  /** The snapshot paragraph. At most 120 words, by construction. */
  summary: string;
  /** True when the paragraph was composed rather than taken from the source. */
  composed: boolean;
  /** One line that earns the next line. Empty when nothing stands out. */
  hook: string;
  /** Honest reading estimate for the source, in whole minutes. */
  readingMinutes: number;
}

export function composeRecall(input: RecallInput): Recall {
  const clauses: string[] = [];

  // The subject comes from the title, which the author already cased. Forcing
  // it lower turns "Atlas Launch" into "atlas Launch", which reads as a typo.
  const subject = shorten(input.intent.subject, 12);
  const opening = subject.length > 0 ? OPENING[input.intent.kind](subject) : "";

  const method = methodClause(input.concepts);
  if (opening) clauses.push(`${opening}${method}.`);

  const commitment = commitmentClause(input.decisions);
  if (commitment) clauses.push(commitment);

  const watch = watchClause(input.risks, input.signals);
  if (watch) clauses.push(watch);

  const delivery = deliveryClause(input.timeline, input.actions);
  if (delivery) clauses.push(delivery);

  // Composition needs at least an opening and one substantive clause; a lone
  // "This guide walks through X." is a title with extra words, not recall.
  const composed = clauses.length >= 2;
  const summary = composed
    ? withinBudget(clauses)
    : clampWords(unpunctuated(input.fallback) || opening || subject, LIMITS.maxSnapshotWords);

  return {
    summary: summary.trim(),
    composed,
    hook: hookLine(input),
    readingMinutes: readingMinutes(input),
  };
}

/** ", built around decomposition, business reasoning and AI-assisted analysis" */
function methodClause(concepts: readonly Concept[]): string {
  // Only concepts the document returns to across sections belong in the
  // opening line; a term used twice in one paragraph is not what it is about.
  const recurring = concepts.filter((c) => c.spread >= 2);
  // A theme named in one word is usually a category, not a subject: "pricing"
  // could be any document, "fleet-analytics pricing" could only be this one.
  // Single words are still allowed when the document offers nothing longer.
  const named = recurring.filter((c) => wordCount(c.phrase) >= 2);
  const themes = (named.length > 0 ? named : recurring).slice(0, 3).map((c) => decapitalize(c.phrase));
  if (themes.length === 0) return "";
  return `, built around ${speakList(themes)}`;
}

/** "It settles on cleaning the data first and using many small prompts." */
function commitmentClause(decisions: readonly DecisionEntry[]): string {
  const committed = decisions
    .filter((d) => d.commitment !== "considered" && d.status !== "rejected")
    .map((d) => decapitalize(shorten(d.text, 10)))
    .filter((t) => wordCount(t) >= 2 && !readsAsFragment(t))
    .slice(0, 2);
  if (committed.length === 0) return "";
  return `It settles on ${speakList(committed)}.`;
}

/** "The warning it keeps returning to is X, and what that costs is Y." */
function watchClause(risks: readonly RiskEntry[], signals: readonly SignalEntry[]): string {
  const ranked = [...risks].sort((a, b) => severityRank(b) - severityRank(a));
  const withConsequence = ranked.find((r) => r.consequence !== undefined);
  if (withConsequence) {
    const risk = decapitalize(shorten(withConsequence.risk, 11));
    const cost = decapitalize(shorten(withConsequence.consequence!, 11));
    return `The warning it keeps returning to is ${risk}, and what that costs is ${cost}.`;
  }
  const firstRisk = ranked[0];
  if (firstRisk) {
    const risk = decapitalize(shorten(firstRisk.risk, 12));
    return firstRisk.mitigation
      ? `It flags ${risk}, and answers it with ${decapitalize(shorten(firstRisk.mitigation, 10))}.`
      : `It flags ${risk}.`;
  }
  const pattern = signals.find((s) => s.implication !== undefined);
  if (pattern) {
    const label = decapitalize(shorten(pattern.label, 10));
    const meaning = decapitalize(shorten(pattern.implication!, 12));
    return `The pattern it leans on is that ${label} tends to mean ${meaning}.`;
  }
  const measured = signals.filter((s) => s.value !== undefined).slice(0, 2);
  if (measured.length > 0) {
    const said = measured.map((s) => `${decapitalize(s.label)} at ${String(s.value)}`);
    return `The numbers it turns on are ${speakList(said)}.`;
  }
  return "";
}

function severityRank(risk: RiskEntry): number {
  if (risk.severity === "high") return 3;
  if (risk.severity === "medium") return 2;
  if (risk.severity === "low") return 1;
  return 0;
}

/** "The work runs from Jul to Oct, and three things are still waiting." */
function deliveryClause(timeline: readonly TimelineEntry[], actions: readonly ActionEntry[]): string {
  const waiting = actions.filter((a) => a.status !== "done").length;
  const tail =
    waiting > 0 ? `, and ${spellCount(waiting)} ${waiting === 1 ? "thing is" : "things are"} still waiting` : "";
  if (timeline.length >= 2) {
    const first = unpunctuated(timeline[0]!.date || timeline[0]!.title);
    const last = unpunctuated(timeline[timeline.length - 1]!.date || timeline[timeline.length - 1]!.title);
    if (first && last && first !== last) {
      return `The work runs from ${shorten(first, 8)} to ${shorten(last, 8)}${tail}.`;
    }
  }
  return waiting > 0 ? `${sentenceCase(tail.replace(/^, and /, ""))}.` : "";
}

/** Add clauses while they fit; the budget is a hard limit, not a target. */
function withinBudget(clauses: readonly string[]): string {
  let out = "";
  for (const clause of clauses) {
    const next = out === "" ? clause : `${out} ${clause}`;
    if (wordCount(next) > LIMITS.maxSnapshotWords) break;
    out = next;
  }
  return out;
}

/**
 * The line that has to earn the second line.
 *
 * It is the single thing most worth carrying out of the document, phrased as
 * a person would hand it to a colleague. It is never invented: it is the
 * strongest memory already found, said shorter.
 */
function hookLine(input: RecallInput): string {
  const lead = "If you remember one thing:";

  const costly = input.risks.find((r) => r.consequence !== undefined && r.severity === "high")
    ?? input.risks.find((r) => r.consequence !== undefined);
  if (costly) {
    return `${lead} ${decapitalize(shorten(costly.risk, 12))} costs you ${decapitalize(shorten(costly.consequence!, 11))}.`;
  }
  const committed = input.decisions.find((d) => d.commitment !== "considered" && d.status === "approved")
    ?? input.decisions.find((d) => d.commitment !== "considered");
  if (committed) {
    return `${lead} ${decapitalize(shorten(committed.text, 16))}.`;
  }
  const pattern = input.signals.find((s) => s.implication !== undefined);
  if (pattern) {
    return `${lead} ${decapitalize(shorten(pattern.label, 12))} tends to mean ${decapitalize(shorten(pattern.implication!, 12))}.`;
  }
  const measured = input.signals.find((s) => s.value !== undefined);
  if (measured) {
    return `${lead} ${decapitalize(unpunctuated(measured.label))} is at ${String(measured.value)}.`;
  }
  const theme = input.concepts.find((c) => c.spread >= 2);
  if (theme) {
    return `${lead} this keeps coming back to ${decapitalize(theme.phrase)}.`;
  }
  return "";
}

/** 230 words a minute, rounded, floored at one. Honest, not flattering. */
function readingMinutes(input: RecallInput): number {
  const words =
    input.signals.length * 12 +
    input.decisions.length * 18 +
    input.risks.length * 22 +
    input.timeline.length * 12 +
    input.actions.length * 12 +
    80;
  return Math.max(1, Math.round(words / 230));
}

/**
 * Guard against the failure the spec cares most about: a snapshot that quietly
 * became a copy of the document's first paragraph.
 */
export function isCopyOf(summary: string, sourceParagraph: string): boolean {
  if (sourceParagraph.trim() === "") return false;
  return overlap(summary, sourceParagraph) >= 0.8;
}

/** Snapshot heading: the document's own title, said as a thing to recall. */
export function recallHeading(title: string, intent: Intent): string {
  const clean = unpunctuated(title);
  if (clean.length > 0) return sentenceCase(clean);
  return sentenceCase(`${KIND_NOUN[intent.kind]} ${intent.subject}`.trim());
}
