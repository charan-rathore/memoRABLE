import { kindClaimedByHeading } from "@/import/text/sections";
import type { Concept } from "./concepts";
import { labelFor } from "./concepts";
import type { DocumentArchetype } from "./archetype";
import type { Intent } from "./intent";
import {
  allowSlideDecision,
  blocksDecisionInference,
  isProblemStatement,
} from "./projection";
import {
  clampWords,
  decapitalize,
  readsAsFragment,
  sentenceCase,
  unpunctuated,
  wordCount,
} from "./language";

/**
 * Step three of understanding: read what the document means, not what it says.
 *
 * Every inference here is a *reading* of a sentence the author actually wrote.
 * The sentence is carried along as `evidence` on every candidate, and nothing
 * reaches a memory block without one. That is the whole hallucination policy
 * in one structural rule: if there is no sentence, there is no memory.
 *
 * The rules are deliberately narrow. A pattern that fires on ambiguous prose
 * would gain recall and lose the thing the product is for, which is a reader
 * trusting that what they are looking at was really in their document.
 */

export interface Statement {
  /** The sentence, cleaned of markdown but otherwise verbatim. */
  text: string;
  /** Heading the sentence sat under, when it had one. */
  sectionTitle: string | null;
  /** 1-based line number in the source. */
  lineNo: number;
  /** True when the author marked this line as a list item. */
  listItem: boolean;
}

export interface Inferred<T> {
  value: T;
  evidence: Statement;
}

export interface InferredSignal {
  label: string;
  value?: string;
  trend?: "up" | "flat" | "down";
  implication?: string;
}

export interface InferredDecision {
  text: string;
  commitment: "committed" | "considered";
  because?: string;
}

export interface InferredRisk {
  risk: string;
  because?: string;
  consequence?: string;
}

export interface InferredArtifact {
  produces?: string;
  requires?: string;
}

/* -------------------------------- signals --------------------------------- */

/** "If X, then Y" and its plainer cousins. The strongest signal shape there is. */
const CONDITIONAL = [
  /^if\s+(.{6,160}?),?\s+then\s+(.{4,200})$/i,
  /^if\s+(.{6,160}?),\s+(.{6,200})$/i,
  /^when(?:ever)?\s+(.{6,160}?),\s+(.{6,200})$/i,
  /^(.{6,160}?)\s+(?:usually |often |generally )?means\s+(?:that\s+)?(.{4,200})$/i,
  /^(.{6,160}?),\s+which\s+(?:means|signals|indicates|tells you)\s+(?:that\s+)?(.{4,200})$/i,
];

/** "A outperforms B" — a comparison the reader will carry as a preference. */
const COMPARISON = [
  /^(.{4,140}?)\s+(?:consistently\s+)?(?:beat|beats|outperform|outperforms|outperformed|win|wins against|works better than|work better than|is better than|are better than|is more effective than|are more effective than|matters more than|matter more than)\s+(.{3,160})$/i,
  /^(?:prefer|favour|favor|choose|pick)\s+(.{3,140}?)\s+(?:over|rather than|instead of)\s+(.{3,160})$/i,
  /^(.{4,140}?)\s+(?:rather than|instead of)\s+(.{3,160})$/i,
];

/** "X leads to Y" — cause stated forwards. */
const CAUSE_FORWARD =
  /^(.{6,160}?)\s+(?:leads to|lead to|results in|result in|causes|cause|drives|drive|produces|produce|creates|create|triggers|trigger|unlocks|unlock)\s+(.{4,200})$/i;

/** "Y because X" — cause stated backwards, so the halves are swapped. */
const CAUSE_BACKWARD = /^(.{6,160}?)\s+(?:because|since|as)\s+(.{6,200})$/i;

/** Sentences where the author steps out and states the lesson directly. */
const LESSON =
  /^(?:the\s+)?(?:key|trick|point|lesson|takeaway|insight|rule of thumb|most important (?:rule|thing|part)|whole point|real \w+)\b|^remember\b|^note that\b|^in practice\b|\bwhat (?:really )?matters(?: most)? is\b|\bthe difference (?:is|comes from)\b/i;

/** A stated contrast, which is where uncomfortable truths usually hide. */
const CONTRAST = /^(.{8,160}?),?\s+(?:but|yet|however|although|though|while)\s+(.{6,200})$/i;

/** Directional vocabulary, used only to colour a signal the source described. */
const UP = /\b(high|higher|up|rising|rose|grew|growth|increase[ds]?|strong|more|surge|spike|improv)\w*\b/i;
const DOWN = /\b(low|lower|down|falling|fell|drop(?:ped|ping)?|decline[ds]?|weak|fewer|less|poor|slow)\w*\b/i;

export function inferSignals(
  statements: readonly Statement[],
  concepts: readonly Concept[],
): Array<Inferred<InferredSignal>> {
  const collected: Array<Inferred<InferredSignal>> = [];
  const out = {
    push(candidate: Inferred<InferredSignal>) {
      // A clipped half-sentence reads as a mistake, so it is dropped whole
      // rather than shown with the missing part guessed at.
      const { label, implication, trend } = candidate.value;
      if (readsAsFragment(label)) return;
      if (implication !== undefined && readsAsFragment(implication)) {
        collected.push({ ...candidate, value: { label, ...(trend ? { trend } : {}) } });
        return;
      }
      collected.push(candidate);
    },
  };

  for (const statement of statements) {
    const text = unpunctuated(statement.text);
    if (wordCount(text) < 4) continue;

    const conditional = firstMatch(text, CONDITIONAL);
    if (conditional) {
      out.push({
        value: {
          label: sentenceCase(clampWords(unpunctuated(conditional[1]!), 14)),
          implication: sentenceCase(clampWords(unpunctuated(conditional[2]!), 20)),
        },
        evidence: statement,
      });
      continue;
    }

    const comparison = firstMatch(text, COMPARISON);
    if (comparison) {
      const winner = unpunctuated(comparison[1]!);
      const loser = unpunctuated(comparison[2]!);
      out.push({
        value: {
          label: sentenceCase(clampWords(winner, 12)),
          implication: `Preferred over ${decapitalize(clampWords(loser, 12))}`,
        },
        evidence: statement,
      });
      continue;
    }

    const forward = CAUSE_FORWARD.exec(text);
    if (forward) {
      out.push({
        value: {
          label: sentenceCase(clampWords(unpunctuated(forward[1]!), 14)),
          implication: sentenceCase(clampWords(unpunctuated(forward[2]!), 18)),
          ...directionOf(text),
        },
        evidence: statement,
      });
      continue;
    }

    const backward = CAUSE_BACKWARD.exec(text);
    if (backward && wordCount(backward[2]!) >= 3) {
      out.push({
        value: {
          label: sentenceCase(clampWords(unpunctuated(backward[2]!), 14)),
          implication: sentenceCase(clampWords(unpunctuated(backward[1]!), 18)),
        },
        evidence: statement,
      });
      continue;
    }

    const contrast = CONTRAST.exec(text);
    if (contrast && bothSidesDirectional(contrast[1]!, contrast[2]!)) {
      out.push({
        value: {
          label: sentenceCase(clampWords(unpunctuated(contrast[1]!), 12)),
          implication: `But ${decapitalize(clampWords(unpunctuated(contrast[2]!), 16))}`,
          ...directionOf(contrast[2]!),
        },
        evidence: statement,
      });
      continue;
    }

    if (LESSON.test(text) && wordCount(text) >= 5) {
      const label = labelFor(text, concepts, 5);
      out.push({
        value: {
          label: sentenceCase(label || clampWords(text, 10)),
          implication: sentenceCase(clampWords(text, 24)),
        },
        evidence: statement,
      });
    }
  }

  return collected;
}

/** A contrast is only a signal when both halves actually point somewhere. */
function bothSidesDirectional(left: string, right: string): boolean {
  const leftUp = UP.test(left);
  const leftDown = DOWN.test(left);
  const rightUp = UP.test(right);
  const rightDown = DOWN.test(right);
  if (!(leftUp || leftDown) || !(rightUp || rightDown)) return false;
  // "High X but low Y" is a signal. "High X and higher Y" is just a list.
  return (leftUp && rightDown) || (leftDown && rightUp);
}

function directionOf(text: string): { trend?: "up" | "flat" | "down" } {
  const up = UP.test(text);
  const down = DOWN.test(text);
  if (up && !down) return { trend: "up" };
  if (down && !up) return { trend: "down" };
  return {};
}

/* ------------------------------- decisions -------------------------------- */

/** The author has settled this. First person, or a stated rule. */
const COMMITTED =
  /^(?:we|i|the team)\s+(?:will|won't|will not|are going to|'re going to|am going to|have decided|decided|chose|choose|are using|use|are adopting|adopt|are standardi[sz]ing|standardi[sz]e)\b|^decision\s*[:—-]|^(?:always|never|do not|don't|dont)\b|\b(?:must|shall|is required to|are required to|required|cannot|can't|need to|needs to)\b|\bwe(?:'|’)?re going with\b|\bthe rule is\b|\bnon-negotiable\b/i;

/** PRD-style requirements / editability rules stated as product commitments. */
const REQUIREMENT_RULE =
  /\b(edit history|audit trail|revision number|approval workflow|amend|editable|traceable|auto-increment|edited on|edited by)\b/i;

/** The author floated this. It is a suggestion, and must not read as settled. */
const CONSIDERED =
  /\b(?:could|might|may want to|consider|perhaps|maybe|one option|another option|optionally|if you (?:like|prefer|want)|worth (?:trying|considering)|possibly|it (?:can|may) help|you can also|feel free to|ideally)\b/i;

/** An instruction in a document whose whole job is to instruct. */
const IMPERATIVE =
  /^(use|build|create|write|run|start|open|clean|check|add|remove|keep|make|set|pick|choose|avoid|prefer|ensure|define|split|group|send|ship|test|map|draft|treat|store|apply|focus|begin|repeat|validate|verify|export|document|measure|track|break|combine|separate|standardi[sz]e|expand|reduce|extend|move|migrate|adopt|retire|replace|enforce|restrict|allow|require|drop|cache|batch|isolate|centrali[sz]e|deprecate)\b/i;

/** "so that X" / "to avoid Y" — the reason a decision was taken. */
const RATIONALE = /\b(?:so that|so as to|in order to|to avoid|to prevent|because|since|which keeps|which avoids|which prevents)\s+(.{4,160})$/i;

/**
 * Settled, or merely floated?
 *
 * The two read identically as English. "We use Python" and "you could use
 * Python" describe the same tool and mean entirely different things, and a
 * memory system that flattens them hands the reader a decision nobody made.
 * An explicit hedge always wins over confident-sounding phrasing around it.
 */
export function readCommitment(text: string): "committed" | "considered" {
  if (CONSIDERED.test(text)) return "considered";
  if (COMMITTED.test(text)) return "committed";
  return IMPERATIVE.test(text.trim()) ? "committed" : "considered";
}

export function inferDecisions(
  statements: readonly Statement[],
  intent: Intent,
  archetype?: DocumentArchetype,
): Array<Inferred<InferredDecision>> {
  const out: Array<Inferred<InferredDecision>> = [];

  // Only a document that exists to prescribe may read a bare instruction as a
  // commitment. In a status report, "check the dashboard" is an aside.
  const prescriptive = intent.kind === "guide" || intent.kind === "spec" || intent.instructional;

  for (const statement of statements) {
    // A line already filed under Timeline / Risks / Actions / Signals is not a
    // Decision. Inferring across buckets is how PRD Phases polluted Decisions.
    const claimed = kindClaimedByHeading(statement.sectionTitle);
    if (claimed && claimed !== "decisions" && claimed !== "snapshot") continue;

    const text = unpunctuated(statement.text);
    if (wordCount(text) < 3) continue;

    // Precedence: Requirement > Risk > Action > Decision.
    // Never classify as Decision if a stronger category already matches.
    if (blocksDecisionInference(text)) continue;

    // Slides / problem statements: Problem ≠ Decision; need explicit commitment verbs.
    if (archetype === "slides" || isProblemStatement(text, statement.sectionTitle)) {
      if (!allowSlideDecision(text, statement.sectionTitle)) continue;
    }

    const considered = CONSIDERED.test(text);
    const committed = COMMITTED.test(text);
    const imperative = prescriptive && statement.listItem && IMPERATIVE.test(text);
    const requirement =
      statement.listItem &&
      REQUIREMENT_RULE.test(text) &&
      (prescriptive ||
        /\b(requirement|criteria|scope|audit|amend|history)\b/i.test(statement.sectionTitle ?? ""));

    if (!committed && !considered && !imperative && !requirement) continue;
    // An explicit hedge always wins: "we could use Python" is not a decision
    // to use Python, however imperative the rest of the sentence sounds.
    const commitment: InferredDecision["commitment"] = considered ? "considered" : "committed";

    const rationale = RATIONALE.exec(text);
    const reason = rationale ? sentenceCase(clampWords(unpunctuated(rationale[1]!), 18)) : undefined;
    const because = reason && !readsAsFragment(reason) ? reason : undefined;
    const body = rationale ? unpunctuated(text.slice(0, rationale.index)) : text;
    if (wordCount(body) < 3) continue;

    const settled = sentenceCase(clampWords(body, 30));
    if (readsAsFragment(settled)) continue;

    out.push({
      value: {
        text: settled,
        commitment,
        ...(because ? { because } : {}),
      },
      evidence: statement,
    });
  }

  return out;
}

/* --------------------------------- risks ---------------------------------- */

/** Something is going wrong, or could. Required before a risk is considered. */
const TROUBLE =
  /\b(risk|risky|fail|fails|failure|danger|dangerous|threat|blocker|blocked|breaks?|broken|degrad\w*|outage|vulnerab\w*|unsafe|bottleneck|slip|slipped|delay\w*|shortfall|gap|miss\w*|wasted?|waste|lose|lost|losing|churn|overrun|exposure|weak\w*|poor|insufficient|unclear|conflict|error|bug|debt|stall\w*|hurt|damage|penal\w*)\b/i;

/** "leading to X" — what it will cost if nothing changes. */
const CONSEQUENCE =
  /\b(?:leading to|leads to|lead to|resulting in|results in|result in|which (?:means|costs|wastes|delays|blocks)|so you(?:'|’)?ll|so we(?:'|’)?ll|you end up|we end up|ends up|at the cost of|costing|risking|and (?:you|we) (?:lose|waste|miss))\s+(.{4,180})$/i;

/** "because X" — why the observation matters at all. */
const WHY =
  /\b(?:because|since|which (?:signals|indicates|suggests|points to)|a sign(?:al)? of|usually means|typically means|driven by|caused by|due to)\s+(.{4,180})/i;

/** "high impressions but low conversion" — the classic diagnostic shape. */
const DIAGNOSTIC = /^(.{8,160}?),?\s+(?:but|yet|however|while|with)\s+(.{6,180})$/i;

/**
 * Read one sentence as observation, why it matters, and what it costs.
 *
 * Returns null when the sentence is not describing something going wrong,
 * which is most sentences. That is the point: a risk register full of neutral
 * statements is worse than an empty one, because it teaches the reader to
 * stop looking.
 */
export function readRisk(text: string): InferredRisk | null {
  const flat = unpunctuated(text);
  if (wordCount(flat) < 4) return null;

  const consequenceMatch = CONSEQUENCE.exec(flat);
  const whyMatch = WHY.exec(flat);
  const diagnostic = DIAGNOSTIC.exec(flat);

  // A risk needs trouble somewhere in it, or a stated consequence that makes
  // the trouble explicit. Neither present means this is just a sentence.
  if (!TROUBLE.test(flat) && !consequenceMatch) return null;

  let observation = flat;
  let consequence: string | undefined;
  let because: string | undefined;

  if (consequenceMatch) {
    observation = unpunctuated(flat.slice(0, consequenceMatch.index));
    consequence = sentenceCase(clampWords(unpunctuated(consequenceMatch[1]!), 18));
  }
  if (whyMatch && whyMatch.index > 0) {
    const reason = sentenceCase(clampWords(unpunctuated(whyMatch[1]!), 18));
    // Only keep the reason when it is not simply the consequence restated.
    if (!consequence || reason !== consequence) because = reason;
    if (!consequenceMatch) observation = unpunctuated(flat.slice(0, whyMatch.index));
  }
  if (!because && diagnostic && TROUBLE.test(diagnostic[2]!)) {
    // "High impressions but low conversion": the second half is the tell.
    observation = sentenceCase(clampWords(unpunctuated(diagnostic[1]!), 14));
    because = sentenceCase(clampWords(unpunctuated(diagnostic[2]!), 16));
  }

  observation = observation.replace(
    /^(?:there is|there's|we have|we see|this is)\s+(?:a\s+)?(?:risk|danger|chance)\s+(?:that|of)\s+/i,
    "",
  );
  if (wordCount(observation) < 3) return null;
  const stated = sentenceCase(clampWords(observation, 26));
  if (readsAsFragment(stated)) return null;

  return {
    risk: stated,
    ...(because && !readsAsFragment(because) ? { because } : {}),
    ...(consequence && !readsAsFragment(consequence) ? { consequence } : {}),
  };
}

/** Just the reasoning halves, for enriching a risk another pass already found. */
export function riskReasoning(text: string): { because?: string; consequence?: string } {
  const read = readRisk(text);
  if (!read) return {};
  return {
    ...(read.because ? { because: read.because } : {}),
    ...(read.consequence ? { consequence: read.consequence } : {}),
  };
}

export function inferRisks(statements: readonly Statement[]): Array<Inferred<InferredRisk>> {
  const out: Array<Inferred<InferredRisk>> = [];
  for (const statement of statements) {
    const claimed = kindClaimedByHeading(statement.sectionTitle);
    // Do not re-home Timeline / Actions / Decisions lines as Risks.
    if (claimed && claimed !== "risks" && claimed !== "snapshot") continue;
    const value = readRisk(statement.text);
    if (value) out.push({ value, evidence: statement });
  }
  return out;
}

/* ------------------------- artifacts and readiness ------------------------- */

/** "produces a data dictionary" / "output: a cleaned table". */
const PRODUCES =
  /\b(?:produces?|produced|outputs?|delivers?|yields?|creates?|results? in|you(?:'|’)?ll have|leaves you with|ends with|deliverable\s*[:—-]|output\s*[:—-]|artifact\s*[:—-])\s*(?:a|an|the)?\s*(.{3,120}?)(?:[.;]|$)/i;

/** "required before cleaning" / "depends on the data dictionary". */
const REQUIRES =
  /\b(?:required before|needed before|must happen before|depends on|dependent on|blocked by|prerequisite\s*[:—-]?|requires?|after you have|once you have|only after)\s*(?:a|an|the)?\s*(.{3,120}?)(?:[.;]|$)/i;

export function inferArtifact(text: string): InferredArtifact {
  const artifact: InferredArtifact = {};
  const produces = PRODUCES.exec(text);
  if (produces) artifact.produces = sentenceCase(clampWords(unpunctuated(produces[1]!), 10));
  const requires = REQUIRES.exec(text);
  if (requires) artifact.requires = sentenceCase(clampWords(unpunctuated(requires[1]!), 10));
  return artifact;
}

/** Work that is finished. */
const FINISHED = /\b(done|complete|completed|closed|shipped|delivered|finished|landed)\b/i;
/** Work whose prerequisites are stated as met. */
const READY = /\b(ready|ready to (?:go|start|ship)|good to go|unblocked|approved to start|cleared)\b/i;

/**
 * How ready an action is, in the words a person would use.
 *
 * "Pending" is the honest default for work the source recorded without saying
 * anything about its state; the word makes no claim the source did not.
 */
export function inferReadiness(
  text: string,
  options: { checked?: boolean } = {},
): "pending" | "suggested" | "ready" | "done" {
  if (options.checked === true) return "done";
  if (FINISHED.test(text)) return "done";
  if (READY.test(text)) return "ready";
  if (CONSIDERED.test(text)) return "suggested";
  return "pending";
}

/* --------------------------------- shared --------------------------------- */

function firstMatch(text: string, patterns: readonly RegExp[]): RegExpExecArray | null {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) return match;
  }
  return null;
}
