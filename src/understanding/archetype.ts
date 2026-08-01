import type { V6TimelineMode } from "@/ai/v6/schema";

/**
 * Deterministic archetype scoring for the local path.
 *
 * Three specialized archetypes are scored with integer cue weights.
 * Generic Knowledge has no score — it is only the fallback when no
 * specialized archetype wins with enough evidence and margin.
 *
 *   winner = max(resume, research, invoice)
 *   runnerUp = secondMax(...)
 *   if winner >= MIN_SCORE && (winner - runnerUp) >= MIN_MARGIN
 *     → specialized projection
 *   else
 *     → Generic Knowledge
 */

export type DocumentArchetype = "resume" | "invoice" | "research" | "generic";

/** Minimum evidence required to select a specialized archetype. */
export const MIN_SCORE = 10;
/** Winner must beat runner-up by at least this many points. */
export const MIN_MARGIN = 4;

/** @deprecated Use MIN_SCORE / MIN_MARGIN. Kept for older imports. */
export const ARCHETYPE_CONFIDENCE_THRESHOLD = MIN_SCORE;

export interface ArchetypeScores {
  resume: number;
  research: number;
  invoice: number;
}

export interface ArchetypeResult {
  archetype: DocumentArchetype;
  label: string;
  /**
   * Winner raw score when a specialized archetype is selected.
   * Omitted for Generic Knowledge (fallback has no score).
   */
  score?: number;
  /** Raw specialized scores — always present for debugging. */
  scores: ArchetypeScores;
  /** Cue labels that fired for the projected archetype (or best loser when Generic). */
  reasons: readonly string[];
  timelineMode: V6TimelineMode;
  /** True when Timeline should stay empty unless an explicit calendar date exists. */
  suppressWeakTimeline: boolean;
}

interface Cue {
  /** Stable debug label shown as "✓ Education". */
  label: string;
  weight: number;
  pattern: RegExp;
}

interface SpecializedSpec {
  archetype: Exclude<DocumentArchetype, "generic">;
  label: string;
  timelineMode: V6TimelineMode;
  cues: readonly Cue[];
}

const SPECIALIZED: readonly SpecializedSpec[] = [
  {
    archetype: "resume",
    label: "Resume",
    timelineMode: "narrative_sequence",
    cues: [
      {
        label: "Education",
        weight: 4,
        pattern: /\b(education|academic\s+background|academics?|education\s+history)\b/i,
      },
      {
        label: "Experience",
        weight: 4,
        // Synonyms: Experience, Employment, Work History, Professional Experience, …
        pattern:
          /\b(work\s+experience|professional\s+experience|employment(?:\s+history)?|work\s+history|career\s+history|experience)\b/i,
      },
      {
        label: "Projects",
        weight: 3,
        pattern: /\b(projects?|portfolio|personal\s+projects?|selected\s+projects?)\b/i,
      },
      {
        label: "Skills",
        weight: 3,
        pattern: /\b(technical\s+skills|core\s+skills|skills|competencies|technologies)\b/i,
      },
      {
        label: "Achievements",
        weight: 2,
        pattern: /\b(achievements?|awards?|accomplishments?|honou?rs?)\b/i,
      },
      {
        label: "Email",
        weight: 1,
        pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
      },
      {
        label: "Phone",
        weight: 1,
        pattern: /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{3,4}\b/,
      },
      {
        label: "GPA",
        weight: 1,
        pattern: /\b(?:c?gpa|g\.?p\.?a\.?)\b/i,
      },
    ],
  },
  {
    archetype: "research",
    label: "Research",
    timelineMode: "narrative_sequence",
    cues: [
      { label: "Abstract", weight: 4, pattern: /\babstract\b/i },
      {
        label: "Method",
        weight: 4,
        pattern: /\b(method(?:ology)?|methods)\b/i,
      },
      { label: "Results", weight: 4, pattern: /\bresults?\b/i },
      {
        label: "Discussion",
        weight: 3,
        pattern: /\b(discussion|conclusion|conclusions)\b/i,
      },
      { label: "References", weight: 3, pattern: /\breferences?\b/i },
      {
        label: "Dataset",
        weight: 2,
        pattern: /\b(dataset|data\s+set|experiment(?:s|al)?)\b/i,
      },
      { label: "Hypothesis", weight: 2, pattern: /\bhypothes[ie]s\b/i },
    ],
  },
  {
    archetype: "invoice",
    label: "Invoice",
    timelineMode: "obligation_deadlines",
    cues: [
      {
        label: "Invoice Number",
        weight: 5,
        pattern: /\b(?:invoice\s*(?:number|no\.?|#)|inv[#:\s-]*\w+|receipt\s*(?:number|no\.?|#))\b/i,
      },
      {
        label: "Vendor",
        weight: 4,
        pattern: /\b(vendor|supplier|bill\s+to|sold\s+by|from:)\b/i,
      },
      {
        label: "Total Amount",
        weight: 4,
        pattern: /\b(total\s+amount|amount\s+due|grand\s+total|balance\s+due|total\s+due)\b/i,
      },
      {
        label: "Due Date",
        weight: 3,
        pattern: /\b(due\s+date|payment\s+due|pay\s+by)\b/i,
      },
      {
        label: "Line Items",
        weight: 3,
        pattern: /\b(line\s+items?|unit\s+price|qty|quantity)\b/i,
      },
      {
        label: "Tax",
        weight: 2,
        pattern: /\b(gst|vat|sales\s+tax|tax\s+amount|tax)\b/i,
      },
      {
        label: "Payment Terms",
        weight: 2,
        pattern: /\b(payment\s+terms|net\s+\d+|terms\s+of\s+payment)\b/i,
      },
    ],
  },
];

interface ScoreBreakdown {
  spec: SpecializedSpec;
  score: number;
  reasons: string[];
}

function scoreSpec(haystack: string, spec: SpecializedSpec): ScoreBreakdown {
  let score = 0;
  const reasons: string[] = [];
  for (const cue of spec.cues) {
    if (cue.pattern.test(haystack)) {
      score += cue.weight;
      reasons.push(cue.label);
    }
  }
  return { spec, score, reasons };
}

function rankScores(breakdowns: readonly ScoreBreakdown[]): {
  winner: ScoreBreakdown;
  runnerUp: ScoreBreakdown;
} {
  const sorted = [...breakdowns].sort((a, b) => b.score - a.score);
  return {
    winner: sorted[0]!,
    runnerUp: sorted[1]!,
  };
}

export function classifyArchetype(input: {
  title: string;
  headings: readonly string[];
  bodySample: string;
}): ArchetypeResult {
  // Prefer headings for section cues; body still catches email/phone/invoice #.
  const haystack = `${input.title}\n${input.headings.join("\n")}\n${input.bodySample.slice(0, 4000)}`;

  const breakdowns = SPECIALIZED.map((spec) => scoreSpec(haystack, spec));
  const scores: ArchetypeScores = {
    resume: breakdowns.find((b) => b.spec.archetype === "resume")!.score,
    research: breakdowns.find((b) => b.spec.archetype === "research")!.score,
    invoice: breakdowns.find((b) => b.spec.archetype === "invoice")!.score,
  };

  const { winner, runnerUp } = rankScores(breakdowns);
  const margin = winner.score - runnerUp.score;
  const winsSpecialized = winner.score >= MIN_SCORE && margin >= MIN_MARGIN;

  if (winsSpecialized) {
    return {
      archetype: winner.spec.archetype,
      label: winner.spec.label,
      score: winner.score,
      scores,
      reasons: winner.reasons,
      timelineMode: winner.spec.timelineMode,
      suppressWeakTimeline: winner.spec.timelineMode === "none",
    };
  }

  // Generic Knowledge — fallback only; no score of its own.
  return {
    archetype: "generic",
    label: "Generic Knowledge",
    scores,
    reasons: winner.score > 0 ? winner.reasons : [],
    timelineMode: "narrative_sequence",
    suppressWeakTimeline: false,
  };
}
