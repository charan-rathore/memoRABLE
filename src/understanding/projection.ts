import type { TimelineEntry } from "@/domain/memory/schema";
import {
  parseLegTimelineLine,
  parseObligationDateLine,
  findDateToken,
  looksLikeDate,
} from "@/import/text/patterns";
import type { DocumentArchetype } from "./archetype";

/**
 * Archetype projection priorities — localized rules used before submission.
 *
 * These are intentional hard priorities, not soft heuristics:
 *  1. Ticket / single_leg → Departure + Arrival ALWAYS Timeline
 *  2. Invoice → Due Date → Timeline unless confidence is below threshold
 *  3. PRD → Requirement > Risk > Action > Decision (never Decision if stronger)
 *  4. Slides → Problem ≠ Decision; require explicit commitment verbs
 */

export type ProjectionConfidence = "high" | "medium" | "low" | "none";

/** Hard calendar / ISO / labeled due dates clear the invoice threshold. */
/** Exported for unit tests and invoice confidence gating. */
export function obligationDateConfidence(text: string): ProjectionConfidence {
  const line = text.trim();
  const obligation = parseObligationDateLine(line);
  if (!obligation) {
    // Bare "Due date" + value shape handled by callers.
    if (/^due(?:\s+date)?$/i.test(line)) return "none";
    return "none";
  }
  const date = obligation.date.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(date)) return "high";
  if (looksLikeDate(date) && findDateToken(date)) return "medium";
  if (/^(soon|eventually|asap|tbd|tba)$/i.test(date)) return "none";
  return "low";
}

/** Invoice rule: promote only when confidence ≥ medium. */
export function shouldProjectInvoiceDueToTimeline(text: string): boolean {
  const conf = obligationDateConfidence(text);
  return conf === "high" || conf === "medium";
}

/**
 * Ticket / single_leg priority:
 * Departure then Arrival always win Timeline slots — never demote them.
 */
export function projectSingleLegTimeline(entries: readonly TimelineEntry[]): TimelineEntry[] {
  const departures = entries.filter((e) => /\bdepart/i.test(e.title));
  const arrivals = entries.filter((e) => /\barriv/i.test(e.title));

  const ordered: TimelineEntry[] = [];
  if (departures[0]) ordered.push(departures[0]);
  if (arrivals[0]) ordered.push(arrivals[0]);

  // If parsers only produced leg-shaped lines later, keep any remaining hard legs.
  if (ordered.length < 2) {
    for (const entry of entries) {
      if (ordered.includes(entry)) continue;
      if (/\b(depart|arriv)/i.test(entry.title) && ordered.length < 2) {
        ordered.push(entry);
      }
    }
  }

  return ordered.slice(0, 2);
}

/** Extract a leg from raw text for single_leg harvest. */
export function harvestSingleLegLine(text: string): TimelineEntry | null {
  return parseLegTimelineLine(text);
}

/**
 * Memory-kind precedence for PRD-style classification.
 * Stronger categories win; Decision is the weakest inferred claim.
 */
export const KIND_PRECEDENCE = ["requirement", "risk", "action", "decision"] as const;
export type PrecedenceKind = (typeof KIND_PRECEDENCE)[number];

const ACTION_SHAPE =
  /^(?:[-*•]\s*)?(?:\[[ xX]?\]\s*)?(?:spec|implement|draft|chase|sign|ship|build|write|run|send|add|fix|create|update|deploy)\b/i;
const ACTION_META = /\b(@?\w[\w.\s]{0,40})\s*[—–-]\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d)/i;

const RISK_SHAPE =
  /\b(risk|blocker|blocked|mitigation|exposure|compliance gap|failure|threat)\b/i;

const REQUIREMENT_SHAPE =
  /\b(must|shall|required|mandatory|non-negotiable|acceptance criteria|every\s+\w+\s+must)\b/i;

const PHASE_SHAPE = /^(?:phase|step|stage|milestone)\s+\d+/i;

/**
 * Strongest category a line already matches.
 * Returns null when nothing stronger than a possible Decision is present.
 */
export function strongestCategory(text: string): PrecedenceKind | null {
  const t = text.trim();
  if (!t) return null;
  // Phases are timeline/requirement-adjacent delivery structure — never Decisions.
  if (PHASE_SHAPE.test(t)) return "requirement";
  if (RISK_SHAPE.test(t) && /\bmitigation\b|\(high\)|\(medium\)|\(low\)/i.test(t)) return "risk";
  if (RISK_SHAPE.test(t) && !REQUIREMENT_SHAPE.test(t)) return "risk";
  if (ACTION_SHAPE.test(t) || ACTION_META.test(t)) return "action";
  if (REQUIREMENT_SHAPE.test(t)) return "requirement";
  return null;
}

/**
 * Decision inference is forbidden when a stronger *non-decision* category matches.
 *
 * Precedence for *routing away* from Decisions: Risk > Action > Decision.
 * Requirements project *into* Decisions (Generic Knowledge furniture for
 * "must/shall/required" product rules). Delivery phases stay on Timeline.
 */
export function blocksDecisionInference(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  // Phases are timeline delivery structure — never Decisions.
  if (PHASE_SHAPE.test(t)) return true;
  const strong = strongestCategory(text);
  return strong === "risk" || strong === "action";
}

/** Explicit commitment verbs required for Slides (and problem sections). */
const EXPLICIT_COMMITMENT =
  /\b(we (?:have )?(?:decided|approved|chose|chosen|committed|agreed)|decision\s*[:—-]|approved\b|committed to|will ship|will adopt|we're going with|we are going with)\b/i;

export function hasExplicitCommitmentVerb(text: string): boolean {
  return EXPLICIT_COMMITMENT.test(text);
}

export function isProblemStatement(text: string, sectionTitle: string | null): boolean {
  if (sectionTitle && /\b(problem|open questions?|pain points?)\b/i.test(sectionTitle)) return true;
  // Capability gaps without a settled position are problems, not decisions.
  if (/\bcannot\b|\bcan't\b|\bunable to\b|\bfail(?:s|ed|ing)? to\b/i.test(text) && !hasExplicitCommitmentVerb(text)) {
    return true;
  }
  return false;
}

/**
 * Slides rule: Problem ≠ Decision. Only explicit commitment verbs may create Decisions.
 */
export function allowSlideDecision(text: string, sectionTitle: string | null): boolean {
  if (isProblemStatement(text, sectionTitle)) return false;
  return hasExplicitCommitmentVerb(text);
}

export function isInvoiceArchetype(archetype: DocumentArchetype): boolean {
  return archetype === "invoice";
}
