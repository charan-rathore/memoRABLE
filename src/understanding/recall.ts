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
 * *for*, and it is a different sentence entirely. Snapshot frames primary
 * goal, problem, and business outcome — then names outstanding work.
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
  /** Primary product goal, when memories support one. */
  goal: string;
  /** Primary problem the document exists to solve. */
  problem: string;
  /** Primary business outcome the work unlocks. */
  outcome: string;
  /** Honest reading estimate for the source, in whole minutes. */
  readingMinutes: number;
}

export function composeRecall(input: RecallInput): Recall {
  const goal = primaryGoal(input);
  const problem = primaryProblem(input);
  const outcome = primaryOutcome(input);

  const clauses: string[] = [];
  const framed = Boolean(goal || problem || outcome);
  // Goal / problem / outcome render as labeled fields; summary keeps domain
  // framing from the opening and names outstanding work.
  const waiting = outstandingWorkClause(input.timeline, input.actions);

  if (!framed) {
    // Unstructured notes: keep the author's opening — don't invent a title sentence.
    if (input.fallback.trim()) {
      return {
        summary: clampWords(unpunctuated(input.fallback), LIMITS.maxSnapshotWords),
        composed: false,
        hook: hookLine(input),
        goal: "",
        problem: "",
        outcome: "",
        readingMinutes: readingMinutes(input),
      };
    }
    const subject = shorten(input.intent.subject, 12);
    const opening =
      subject.length > 0 ? `This ${KIND_NOUN[input.intent.kind]} pins down ${subject}.` : "";
    if (opening) clauses.unshift(opening);
    const commitment = commitmentClause(input.decisions);
    if (commitment) clauses.push(commitment);
  } else {
    if (input.fallback.trim()) {
      const framing = sentenceCase(shorten(unpunctuated(input.fallback), 22));
      if (framing && !readsAsFragment(framing)) clauses.push(framing);
    } else if (goal) {
      clauses.push(`This ${KIND_NOUN[input.intent.kind]} remembers ${decapitalize(shorten(goal, 16))}.`);
    }
    if (waiting) clauses.push(waiting);
  }

  const composed = framed || clauses.length >= 1;
  const summary = composed
    ? withinBudget(clauses)
    : clampWords(unpunctuated(input.fallback) || goal || subjectFallback(input), LIMITS.maxSnapshotWords);

  return {
    summary: summary.trim() || (goal ? `Primary goal: ${goal}.` : ""),
    composed,
    hook: goal ? `Primary goal: ${goal}.` : hookLine(input),
    goal,
    problem,
    outcome,
    readingMinutes: readingMinutes(input),
  };
}

function subjectFallback(input: RecallInput): string {
  return shorten(input.intent.subject, 12);
}

/** Enable / deliver / provide — the settled product intent. */
function primaryGoal(input: RecallInput): string {
  const committed = input.decisions.filter(
    (d) => d.commitment === "committed" && d.status !== "rejected" && !/^p\d\b/i.test(d.text),
  );
  // Prefer audit / editability goals over matrix chrome.
  const preferred =
    committed.find((d) => /\b(audit|edit history|amend|traceable|editable)\b/i.test(d.text)) ??
    committed[0];
  if (preferred) {
    const text = sentenceCase(shorten(preferred.text, 18));
    if (!readsAsFragment(text)) {
      if (/^(enable|deliver|provide|support|build|create)\b/i.test(text)) return text;
      return `Enable ${decapitalize(text)}`;
    }
  }
  const story = input.actions.find((a) => /^user story:/i.test(a.task));
  if (story) {
    const want = story.task.replace(/^user story:\s*/i, "");
    return sentenceCase(shorten(want.replace(/^i want (?:to\s+)?/i, ""), 18));
  }
  // Never invent a goal from the filename alone — leave the source opening.
  return "";
}

function primaryProblem(input: RecallInput): string {
  const ranked = [...input.risks].sort((a, b) => severityRank(b) - severityRank(a));
  const withCost = ranked.find((r) => r.consequence);
  if (withCost) {
    return sentenceCase(
      shorten(`${withCost.risk}, causing ${withCost.consequence}`, 22),
    );
  }
  if (ranked[0]) return sentenceCase(shorten(ranked[0].risk, 20));
  return "";
}

function primaryOutcome(input: RecallInput): string {
  const measured = input.signals.find(
    (s) => s.value !== undefined && !/^open question$/i.test(s.label),
  );
  if (measured?.implication && measured.implication !== "Target") {
    return sentenceCase(shorten(`${measured.label}: ${measured.implication}`, 18));
  }
  const theme = input.concepts.find((c) =>
    /\b(mid-market|compliance|audit|onboarding|procurement)\b/i.test(c.phrase),
  );
  if (theme) {
    return sentenceCase(`Support ${decapitalize(shorten(theme.phrase, 12))} through traceable workflows`);
  }
  const committed = input.decisions.find((d) => /\b(compliance|audit|mid-market|accountab)/i.test(d.text));
  if (committed) return sentenceCase(shorten(committed.text, 18));
  return "";
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

function severityRank(risk: RiskEntry): number {
  if (risk.severity === "high") return 3;
  if (risk.severity === "medium") return 2;
  if (risk.severity === "low") return 1;
  return 0;
}

/**
 * Name the outstanding work — never "eight things" without saying which.
 * Prefer ticket IDs from Timeline; fall back to action tasks.
 */
function outstandingWorkClause(
  timeline: readonly TimelineEntry[],
  actions: readonly ActionEntry[],
): string {
  const tickets = timeline
    .map((t) => {
      const fromDate = /^(PSTD-\d+|[A-Z]{2,5}-\d+)/i.exec(t.date)?.[1];
      const fromTitle = /^(PSTD-\d+|[A-Z]{2,5}-\d+)/i.exec(t.title)?.[1];
      return fromDate ?? fromTitle ?? null;
    })
    .filter((t): t is string => Boolean(t));
  const uniqueTickets = [...new Set(tickets.map((t) => t.toUpperCase()))];

  const waitingActions = actions.filter(
    (a) => a.status !== "done" && !/^persona:/i.test(a.task) && !/^user story:/i.test(a.task),
  );

  if (uniqueTickets.length > 0) {
    const shown = uniqueTickets.slice(0, 6);
    const more = uniqueTickets.length - shown.length;
    const list = speakList(shown);
    const tally = spellCount(uniqueTickets.length);
    return `Outstanding work (${tally}): ${list}${more > 0 ? `, +${more} more` : ""}.`;
  }

  if (waitingActions.length > 0) {
    const shown = waitingActions.slice(0, 4).map((a) => shorten(a.task, 8));
    const more = waitingActions.length - shown.length;
    return `Outstanding work (${spellCount(waitingActions.length)}): ${speakList(shown)}${more > 0 ? `, +${more} more` : ""}.`;
  }

  return "";
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
 * Fallback hook when no primary goal could be composed.
 */
function hookLine(input: RecallInput): string {
  const costly =
    input.risks.find((r) => r.consequence !== undefined && r.severity === "high") ??
    input.risks.find((r) => r.consequence !== undefined);
  if (costly) {
    return `Primary problem: ${decapitalize(shorten(costly.risk, 14))}.`;
  }
  const committed =
    input.decisions.find((d) => d.commitment !== "considered" && d.status === "approved") ??
    input.decisions.find((d) => d.commitment !== "considered");
  if (committed) {
    return `Primary goal: ${decapitalize(shorten(committed.text, 16))}.`;
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
