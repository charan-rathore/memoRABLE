import { LIMITS } from "@/domain/memory/limits";
import type {
  ActionEntry,
  DecisionEntry,
  RiskEntry,
  SignalEntry,
  TimelineEntry,
} from "@/domain/memory/schema";
import type { Concept } from "./concepts";
import { IMPERATIVE } from "./inference";
import type { Intent } from "./intent";
import {
  clampWords,
  decapitalize,
  overlap,
  readsAsFragment,
  sentenceCase,
  shorten,
  shortenWholeSentences,
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
  /** Document archetype; a resume frames a person, not a product initiative. */
  archetype?: string;
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
  // A resume frames a person, not a product initiative: there is no goal,
  // problem, or outcome to name, and its achievements or education must not
  // be relabeled as one. Keep the source's own opening as the summary.
  if (input.archetype === "resume") {
    return {
      summary: clampWords(unpunctuated(input.fallback), LIMITS.maxSnapshotWords),
      composed: false,
      hook: "",
      goal: "",
      problem: "",
      outcome: "",
      readingMinutes: readingMinutes(input),
    };
  }
  const goal = primaryGoal(input);
  const problem = primaryProblem(input);
  const outcome = primaryOutcome(input);

  const clauses: string[] = [];
  const framed = Boolean(goal || problem || outcome);
  // Goal / problem / outcome render as labeled fields; summary keeps domain
  // framing from the opening and names outstanding work.
  // Compatibility visibility (temporary output-compatibility boundary):
  // with no corrected framing, the waiting clause is visible only when the
  // exact be99d40 claim selection would have framed the same input — never
  // to render a rejected claim, only to preserve the baseline's visibility.
  const waitingAll = outstandingWorkClause(input.timeline, input.actions);
  const waiting = framed || baselineFramed(input) ? waitingAll : "";

  if (!framed) {
    // Unstructured notes: keep the author's opening — don't invent a title sentence.
    if (input.fallback.trim()) {
      // Keep the author's opening — but outstanding work stays visible even
      // when no claim frames the document. Withholding a shaky claim must
      // not hide "call 24 hours before your slot". The complete waiting
      // clause is reserved first; the opening takes the remaining budget.
      // An opening that would leave under eight words is dropped whole —
      // a presentation default, never a partial condition.
      const waitingWords = waiting ? wordCount(waiting) : 0;
      const openingBudget = LIMITS.maxSnapshotWords - waitingWords;
      const opening =
        openingBudget >= 8
          ? clampWords(unpunctuated(input.fallback), openingBudget)
          : "";
      return {
        summary: waiting
          ? joinClauses(opening, waiting)
          : clampWords(unpunctuated(input.fallback), LIMITS.maxSnapshotWords),
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
    // Same reservation as above: waiting first, then opening and commitment
    // within the remaining budget, each whole or not at all.
    let budget = LIMITS.maxSnapshotWords - (waiting ? wordCount(waiting) : 0);
    if (opening && wordCount(opening) <= budget) {
      clauses.unshift(opening);
      budget -= wordCount(opening);
    }
    const commitment = commitmentClause(input.decisions);
    if (commitment && wordCount(commitment) <= budget) {
      clauses.push(commitment);
      budget -= wordCount(commitment);
    }
    if (waiting) clauses.push(waiting);
  } else {
    if (input.fallback.trim()) {
      const framing = sentenceCase(shortenWholeSentences(input.fallback, 22));
      if (framing && !readsAsFragment(framing)) clauses.push(framing);
    } else if (goal) {
      clauses.push(`This ${KIND_NOUN[input.intent.kind]} remembers ${decapitalize(goal)}.`);
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

/**
 * A precaution, prohibition, or reader-logistics line is never the document's
 * goal, however settled it sounds: "Do not eat for 2 hours" and "Check in at
 * the hotel" instruct the reader; they name no aim the document pursues.
 */
const NOT_A_GOAL =
  /^(?:do not|don't|dont|never|always|avoid)\b|^(?:check[- ]in|check out|arrive|depart|board|land|pick up|drop off)\b/i;

/**
 * "We decided to ship X" — strip the reporting prefix, keep the settled
 * action. The prefix remembers two things a reader of the remainder needs:
 * whether a promise form ("will", "going to") or an infinitive "to" means
 * the remainder is a verb phrase ("hold the launch"), and a "decided on"
 * preposition is consumed so its noun phrase stands alone ("daily
 * standups"). No verb list can carry that distinction - "Enable freeze"
 * and "Enable on daily standups" are what hand-kept lists produced.
 */
const DECIDED_PREFIX =
  /^(?:we|i|the team)\s+(?:have\s+)?(?:(?:decided|chose|chosen)(?:\s+on)?|will|are going to|'re going to|am going to)\s+(?!not\b)(?:to\s+)?/i;
/** Did the consumed decision marker govern an infinitive verb phrase? */
const VERB_PHRASE_MARKER =
  /(?:will|are going to|'re going to|am going to|to)\s+$/i;

/**
 * A bare promise ("we will X") is weaker provenance than an explicit
 * decision ("we decided X"): it backs a goal claim only for a clean,
 * unconditional action. A hedged ("we will probably ship"), negated, or
 * conditional ("we will ship if security approves", "we will miss the
 * deadline unless...") promise is not a goal the author settled.
 */
const PROMISE_PREFIX =
  /^(?:we|i|the team)\s+(?:will|are going to|'re going to|am going to)\b/i;
const HEDGED_OR_CONDITIONAL =
  /\b(?:probably|possibly|maybe|perhaps|likely)\b/i;

/**
 * A projected failure ("we will miss the deadline") is a warning, not
 * something the author works toward — it can never be the document's goal.
 */
const MISFORTUNE_OPEN = /^(?:miss|fail|lose|slip|overrun|exceed|breach)\b/i;

/** Lowercase a leading article/determiner when a clause joins mid-sentence. */
const MID_SENTENCE_ARTICLE = /^(?:A|An|The|This|That|These|Those|Some|Any)\b/;

/**
 * An imperative line with no stated decision behind it instructs the reader
 * ("Add 2.5 kg ...", "Check in at the kiosk"); it is not a goal the author
 * set or a choice they settled. Prohibition and reader-logistics markers
 * instruct too. Provenance lives in the source phrasing itself: "We decided
 * to X" reports a settled choice; a bare imperative reports nothing.
 */
function instructsReader(text: string): boolean {
  const t = text.trim();
  if (NOT_A_GOAL.test(t)) return true;
  return IMPERATIVE.test(t) && !DECIDED_PREFIX.test(t);
}

/**
 * Render a committed decision as a goal claim, or "" when the line is not a
 * goal at all. "We decided to ship X" reads as "Ship X"; a bare imperative
 * with no stated decision behind it is an instruction, not a goal; a stated
 * requirement keeps its own words; only a noun phrase earns "Enable …".
 */
/** The settled product intent an enablement verb names. */
const ENABLEMENT = /^(?:enable|deliver|provide|support|build|create)\b/i;

/**
 * A claim that still opens with a pronoun, hedge, or modal of uncertainty
 * was never reduced to an action the author settled: "We will not ship",
 * "Probably ship next month", "We decided not to ship". No goal claim is
 * better than a shaky one.
 */
const UNSETTLED_OPEN =
  /^(?:we|i|the team|you|they|he|she|it|probably|possibly|maybe|perhaps|likely|not|won't|will|would|can|can't|cannot|should|could|might)\b/i;

/**
 * A stated requirement ("must", "shall", "required to", "needs to") keeps
 * its own words when a claim survives every guard — "Enable the system
 * must keep" is not English.
 */
const STATED_REQUIREMENT = /\b(?:must|shall|is required to|are required to|needs? to)\b/i;
/**
 * A stated affirmative requirement names the same obligation whoever the
 * subject is: "We must encrypt …" obliges exactly as "The system must
 * encrypt …" does. Narrow on purpose: the modal must directly follow the
 * subject (a hedge in between — "We probably must …" — unsettles it), and
 * hedged or negated claims stay rejected (a prohibition or a negated
 * decision is no goal). Reader instructions ("You must …") never match.
 */
const AFFIRMATIVE_REQUIREMENT = /^(?:we|i|the team)\s+(?:must|shall|needs? to|are required to)\b/i;
const NEGATED_CLAIM = /\b(?:not|never)\b|n't\b/i;


function goalClaim(text: string): string {
  if (NOT_A_GOAL.test(text)) return "";
  const marker = DECIDED_PREFIX.exec(text);
  const stated = marker !== null;
  const settled = stated ? text.slice(marker[0].length) : text;
  if (settled.trim().length === 0) return "";
  // A promise backs a claim only for a clean, unconditional action.
  if (PROMISE_PREFIX.test(text) && HEDGED_OR_CONDITIONAL.test(settled)) return "";
  const claim = sentenceCase(settled);
  if (readsAsFragment(claim)) return "";
  if (
    UNSETTLED_OPEN.test(claim.trim()) &&
    !(
      AFFIRMATIVE_REQUIREMENT.test(claim.trim()) &&
      !HEDGED_OR_CONDITIONAL.test(claim) &&
      !NEGATED_CLAIM.test(claim)
    )
  )
    return "";
  if (MISFORTUNE_OPEN.test(claim.trim())) return "";
  // Whole or not at all: a claim that needs truncating is omitted, because a
  // cut condition reads as unconditional. Conditions stay verbatim.
  if (wordCount(claim) > 30) return "";
  // A stated requirement keeps its own words — "Enable the system must keep"
  // is not English.
  if (STATED_REQUIREMENT.test(claim)) return claim;
  // A stated decision whose marker governs a verb phrase ("We will hold
  // ...", "We decided to freeze ...") reads as its settled action; only a
  // noun-phrase remainder earns "Enable ...".
  if (stated && VERB_PHRASE_MARKER.test(marker[0])) return claim;
  // Any bare verb-first line — including an enablement verb like "Provide
  // your passport" — instructs the reader unless the author stated the
  // decision behind it.
  if (IMPERATIVE.test(claim.trim()) || ENABLEMENT.test(claim.trim())) {
    return stated ? claim : "";
  }
  return `Enable ${decapitalize(claim)}`;
}

/** Enable / deliver / provide — the settled product intent. */
function primaryGoal(input: RecallInput): string {
  const committed = input.decisions.filter(
    (d) => d.commitment === "committed" && d.status !== "rejected" && !/^p\d\b/i.test(d.text),
  );
  // Prefer audit / editability goals over matrix chrome, then the first
  // claimable decision in order — an instruction heading the list must not
  // veto the settled decision below it.
  const preferred = committed.find((d) =>
    /\b(audit|edit history|amend|traceable|editable)\b/i.test(d.text),
  );
  const candidates = preferred
    ? [preferred, ...committed.filter((d) => d !== preferred)]
    : committed;
  for (const candidate of candidates) {
    // Full text in: shortening before the claim check could cut a condition
    // ("...only when security approves") and read the rest as unconditional.
    const claim = goalClaim(candidate.text);
    if (claim) return claim;
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
  const ranked = [...input.risks]
    .sort((a, b) => severityRank(b) - severityRank(a));
  const withCost = ranked.find((r) => r.consequence);
  if (withCost?.consequence) {
    // The consequence joins mid-sentence; drop the standalone-line capital
    // only on an article or determiner — "causing a growing backlog", not
    // "causing A growing backlog". Anything else keeps the source's casing,
    // because a capital may be a name: "Alice losing access", "London
    // operations stopping".
    const consequence = withCost.consequence.replace(MID_SENTENCE_ARTICLE, (m) =>
      m.toLowerCase(),
    );
    return sentenceCase(
      shorten(`${withCost.risk}, causing ${consequence}`, 22),
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
    // "It settles on check in at the kiosk" cites an instruction as a
    // settled commitment. Only lines that are not reader instructions may
    // be cited here.
    .filter((d) => !instructsReader(d.text))
    // Whole within the established bound, or not cited at all: shortening
    // "…only when security approves…" to ten words drops the condition and
    // reads the rest as settled. The decision register keeps the full text
    // either way.
    .map((d) => decapitalize(d.text))
    .filter((t) => wordCount(t) >= 2 && wordCount(t) <= 10 && !readsAsFragment(t))
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

  // A statusless card (e.g. a resume project) makes no outstanding-work
  // claim, so it never feeds the outstanding-work summary.
  const waitingActions = actions.filter(
    (a) =>
      a.status !== undefined &&
      a.status !== "done" &&
      !/^persona:/i.test(a.task) &&
      !/^user story:/i.test(a.task),
  );

  if (uniqueTickets.length > 0) {
    const shown = uniqueTickets.slice(0, 6);
    const more = uniqueTickets.length - shown.length;
    const list = speakList(shown);
    const tally = spellCount(uniqueTickets.length);
    return `Outstanding work (${tally}): ${list}${more > 0 ? `, +${more} more` : ""}.`;
  }

  if (waitingActions.length > 0) {
    // An outstanding action is quoted whole or not at all. Truncating
    // "Call us at least 24 hours before your slot if you need to move it"
    // to "…24 hours" drops what the deadline is for; truncating "Add 2.5 kg
    // …if all reps pass" to "…every session" turns conditional advice into
    // an unconditional instruction. The count stays honest either way.
    const presentable = waitingActions
      .map((a) => unpunctuated(a.task))
      .filter((t) => t !== "" && wordCount(t) <= ACTION_CLAUSE_MAX_WORDS);
    const shown = presentable.slice(0, 4);
    const more = waitingActions.length - shown.length;
    if (shown.length === 0) {
      return `Outstanding work (${spellCount(waitingActions.length)}).`;
    }
    const list = `${speakList(shown)}${more > 0 ? `, +${more} more` : ""}`;
    // A task may itself end in a question mark; never stack punctuation.
    return `Outstanding work (${spellCount(waitingActions.length)}): ${list}${/[.!?]$/.test(list) ? "" : "."}`;
  }

  return "";
}

/**
 * TEMPORARY output-compatibility boundary — not semantic truth.
 * Exact copies of the be99d40 goal/problem/outcome selection, used ONLY to
 * decide whether an unframed summary may show the outstanding-work clause:
 * the baseline showed it exactly when its own claim selection framed the
 * document. Extraction status handling is deferred; these predicates gate
 * nothing else and never render a claim. Remove with the deferred work.
 */
function baselineGoalClaim(text: string): string {
  if (NOT_A_GOAL.test(text)) return "";
  const settled = text.replace(DECIDED_PREFIX, "");
  if (settled.trim().length === 0) return "";
  const claim = sentenceCase(settled);
  if (readsAsFragment(claim)) return "";
  if (/^(?:enable|deliver|provide|support|build|create)\b/i.test(claim)) return claim;
  if (IMPERATIVE.test(claim.trim())) return claim;
  return `Enable ${decapitalize(claim)}`;
}

function baselinePrimaryGoal(input: RecallInput): string {
  const committed = input.decisions.filter(
    (d) => d.commitment === "committed" && d.status !== "rejected" && !/^p\d\b/i.test(d.text),
  );
  const preferred =
    committed.find((d) => /\b(audit|edit history|amend|traceable|editable)\b/i.test(d.text)) ??
    committed[0];
  if (preferred) {
    const text = sentenceCase(shorten(preferred.text, 18));
    if (!readsAsFragment(text)) {
      const claim = baselineGoalClaim(text);
      if (claim) return claim;
    }
  }
  const story = input.actions.find((a) => /^user story:/i.test(a.task));
  if (story) {
    const want = story.task.replace(/^user story:\s*/i, "");
    return sentenceCase(shorten(want.replace(/^i want (?:to\s+)?/i, ""), 18));
  }
  return "";
}


function baselinePrimaryProblem(input: RecallInput): string {
  const ranked = [...input.risks]
    .sort((a, b) => severityRank(b) - severityRank(a));
  const withCost = ranked.find((r) => r.consequence);
  if (withCost) {
    return sentenceCase(shorten(`${withCost.risk}, causing ${withCost.consequence}`, 22));
  }
  if (ranked[0]) return sentenceCase(shorten(ranked[0].risk, 20));
  return "";
}

function baselineFramed(input: RecallInput): boolean {
  return Boolean(
    baselinePrimaryGoal(input) || baselinePrimaryProblem(input) || primaryOutcome(input),
  );
}

/**
 * Whole actions read out in a summary; longer ones are named by count only.
 * The bound matches the codebase's established claim-clause length.
 */
const ACTION_CLAUSE_MAX_WORDS = 18;

/**
 * Join two clauses with a sentence boundary when the left side lacks
 * terminal punctuation — "…560001 Outstanding work" reads as a run-on.
 * Existing terminal marks, question marks and ellipses are preserved
 * untouched; a boundary is never doubled. Presentation only.
 */
function joinClauses(left: string, right: string): string {
  const trimmed = left.trimEnd();
  if (trimmed === "") return right;
  return /[.!?…]$/.test(trimmed) ? `${trimmed} ${right}` : `${trimmed}. ${right}`;
}

/** Add clauses while they fit; the budget is a hard limit, not a target. */
function withinBudget(clauses: readonly string[]): string {
  let out = "";
  for (const clause of clauses) {
    const next = joinClauses(out, clause);
    if (wordCount(next) > LIMITS.maxSnapshotWords) break;
    out = next;
  }
  return out;
}

/**
 * Fallback hook when no primary goal could be composed.
 */
function hookLine(input: RecallInput): string {
  const eligible = input.risks;
  const costly =
    eligible.find((r) => r.consequence !== undefined && r.severity === "high") ??
    eligible.find((r) => r.consequence !== undefined);
  if (costly) {
    return `Primary problem: ${decapitalize(shorten(costly.risk, 14))}.`;
  }
  const committed =
    input.decisions.find((d) => d.commitment !== "considered" && d.status === "approved") ??
    input.decisions.find((d) => d.commitment !== "considered");
  if (committed) {
    const claim = goalClaim(committed.text);
    if (claim) return `Primary goal: ${decapitalize(claim)}.`;
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
