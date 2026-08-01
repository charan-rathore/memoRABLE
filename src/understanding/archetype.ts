import type { V6TimelineMode } from "@/ai/v6/schema";

/**
 * Document archetype classification for the local (deterministic) path.
 * Mirrors Phase A.2 of the cognitive engine so timeline honesty works without AI.
 */

export type DocumentArchetype =
  | "resume"
  | "prd"
  | "research"
  | "contract"
  | "invoice"
  | "ticket"
  | "job"
  | "menu"
  | "meeting"
  | "policy"
  | "glossary"
  | "slides"
  | "brief"
  | "other";

export interface ArchetypeResult {
  archetype: DocumentArchetype;
  label: string;
  timelineMode: V6TimelineMode;
  /** True when Timeline should stay empty unless an explicit calendar date exists. */
  suppressWeakTimeline: boolean;
}

interface Rule {
  archetype: DocumentArchetype;
  label: string;
  timelineMode: V6TimelineMode;
  pattern: RegExp;
  suppressWeakTimeline?: boolean;
}

const RULES: Rule[] = [
  {
    archetype: "menu",
    label: "Menu",
    timelineMode: "none",
    suppressWeakTimeline: true,
    pattern: /\b(menu|appetizer|entree|entrée|dessert|beverage|prix\s*fixe|chef'?s?\s+special)\b/i,
  },
  {
    archetype: "glossary",
    label: "Glossary / reference",
    timelineMode: "none",
    suppressWeakTimeline: true,
    pattern: /\b(glossary|dictionary|definitions?|terminology|lexicon)\b/i,
  },
  {
    archetype: "ticket",
    label: "Ticket / itinerary",
    timelineMode: "single_leg",
    pattern: /\b(boarding\s+pass|itinerary|departure|arrival|gate\s+[A-Z]?\d|seat\s+\d|pnr|booking\s+ref)\b/i,
  },
  {
    archetype: "contract",
    label: "Legal contract",
    timelineMode: "obligation_deadlines",
    pattern: /\b(master\s+services\s+agreement|this\s+agreement|hereinafter|indemnif|governing\s+law|termination\s+(?:clause|with)|either\s+party\s+may)\b/i,
  },
  {
    archetype: "invoice",
    label: "Invoice / receipt",
    timelineMode: "obligation_deadlines",
    // Require billing-document cues — plain "invoice(s)" in contracts must not win.
    pattern: /\b(invoice\s+#?\w|amount\s+due|bill\s+to|subtotal|receipt\s+#)\b/i,
  },
  {
    archetype: "resume",
    label: "Resume / CV",
    timelineMode: "narrative_sequence",
    pattern: /\b(curriculum\s+vitae|\bresum[eé]\b|work\s+experience|education\s+history|linkedin\.com\/in)\b/i,
  },
  {
    archetype: "job",
    label: "Job description",
    timelineMode: "none",
    suppressWeakTimeline: true,
    pattern: /\b(job\s+description|we'?re\s+hiring|responsibilities|qualifications|reports?\s+to|compensation|apply\s+by)\b/i,
  },
  {
    archetype: "meeting",
    label: "Meeting notes",
    timelineMode: "milestone_chain",
    pattern: /\b(meeting\s+notes|attendees|action\s+items|follow[\s-]?ups?|minutes\s+of)\b/i,
  },
  {
    archetype: "policy",
    label: "Policy / handbook",
    timelineMode: "obligation_deadlines",
    pattern: /\b(policy|handbook|code\s+of\s+conduct|effective\s+date|employees?\s+must)\b/i,
  },
  {
    archetype: "research",
    label: "Research paper",
    timelineMode: "narrative_sequence",
    pattern: /\b(abstract|hypothesis|methodology|dataset|related\s+work|future\s+work|references)\b/i,
  },
  {
    archetype: "prd",
    label: "PRD / Spec",
    timelineMode: "milestone_chain",
    pattern: /\b(prd|product\s+requirements?|user\s+stor(?:y|ies)|acceptance\s+criteria|functional\s+requirements?|non[\s-]?functional)\b/i,
  },
  {
    archetype: "slides",
    label: "Slide deck",
    timelineMode: "none",
    suppressWeakTimeline: true,
    pattern: /\b(slide\s+\d|deck\s+outline|architecture\s+diagram)\b/i,
  },
  {
    archetype: "brief",
    label: "Brief / update",
    timelineMode: "narrative_sequence",
    pattern: /\b(brief|q[1-4]\s+\d{4}|quarterly|launch\s+notes|status\s+update)\b/i,
  },
];

export function classifyArchetype(input: {
  title: string;
  headings: readonly string[];
  bodySample: string;
}): ArchetypeResult {
  const haystack = `${input.title}\n${input.headings.join("\n")}\n${input.bodySample.slice(0, 4000)}`;

  for (const rule of RULES) {
    if (rule.pattern.test(haystack)) {
      return {
        archetype: rule.archetype,
        label: rule.label,
        timelineMode: rule.timelineMode,
        suppressWeakTimeline: rule.suppressWeakTimeline === true || rule.timelineMode === "none",
      };
    }
  }

  return {
    archetype: "other",
    label: "Other",
    timelineMode: "narrative_sequence",
    suppressWeakTimeline: false,
  };
}
