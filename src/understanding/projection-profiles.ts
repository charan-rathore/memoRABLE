/**
 * Adaptive memory projection — the last hop of:
 *
 *   Document
 *        │
 *        ▼
 *   Universal Understanding
 *        │
 *        ▼
 *   Universal Observations
 *        │
 *        ▼
 *   Archetype Detection
 *        │
 *        ▼
 *   Adaptive Memory Projection
 *        │
 *        ▼
 *   Rendered Memory Blocks
 *
 * The cognitive engine always extracts the same universal observations
 * (facts, entities, metrics, relationships, requirements, questions, events,
 * procedures) into the six storage kinds. This layer then decides — per
 * archetype — which memory blocks to render, under which labels, and what to
 * do with empty or inapplicable kinds.
 *
 * Inapplicable kinds are omitted or marked "Not applicable". They are never
 * reported as extraction failures.
 */

import { BLOCK_KINDS, type BlockKind, type BlockPayload } from "@/domain/memory/schema";
import { BLOCK_KIND_LABELS, BLOCK_KIND_SUBTITLES } from "@/domain/memory/schema";
import type { DocumentArchetype } from "./archetype";

export interface BucketView {
  /** Human label shown in Memories rail and publish headings. */
  label: string;
  /** One-line subtitle for first-time readers. */
  subtitle: string;
}

export type ProjectionProfile = Record<BlockKind, BucketView>;

/** How to treat an applicable kind that has no observations. */
export type EmptyApplicablePolicy = "omit" | "not_applicable" | "keep";

/**
 * Archetype → memory furniture + applicability.
 * Extraction is unchanged; only the rendered set adapts.
 */
export interface AdaptiveMemoryProjection {
  /** Labels / subtitles for each universal kind when it appears. */
  furniture: ProjectionProfile;
  /**
   * Kinds this archetype organizes memory into, in display order.
   * Kinds not listed are inapplicable unless they carry overflow content.
   */
  applicable: readonly BlockKind[];
  /** Applicable kinds that must appear even when empty (at least Snapshot). */
  required: readonly BlockKind[];
  /** Empty applicable (non-required) kinds. */
  emptyApplicable: EmptyApplicablePolicy;
  /**
   * Content found in an inapplicable kind:
   * - promote: still render it (never lose observations)
   * - omit: drop it (rare; prefer promote)
   */
  overflow: "promote" | "omit";
}

/** Explicit N/A note stamped onto empty blocks kept for furniture honesty. */
export const NOT_APPLICABLE_NOTE = "Not applicable for this document type.";

const CLASSIC_FURNITURE: ProjectionProfile = {
  snapshot: { label: BLOCK_KIND_LABELS.snapshot, subtitle: BLOCK_KIND_SUBTITLES.snapshot },
  signals: { label: BLOCK_KIND_LABELS.signals, subtitle: BLOCK_KIND_SUBTITLES.signals },
  decisions: { label: BLOCK_KIND_LABELS.decisions, subtitle: BLOCK_KIND_SUBTITLES.decisions },
  timeline: { label: BLOCK_KIND_LABELS.timeline, subtitle: BLOCK_KIND_SUBTITLES.timeline },
  risks: { label: BLOCK_KIND_LABELS.risks, subtitle: BLOCK_KIND_SUBTITLES.risks },
  actions: { label: BLOCK_KIND_LABELS.actions, subtitle: BLOCK_KIND_SUBTITLES.actions },
};

const ALL_KINDS = BLOCK_KINDS;

/** PRD / spec / brief — original six memories, always present. */
const PRD_FURNITURE: ProjectionProfile = {
  snapshot: { label: "Snapshot", subtitle: "What this product requirement is about" },
  signals: { label: "Signals", subtitle: "Metrics, criteria, and open questions" },
  decisions: { label: "Decisions", subtitle: "Requirements and committed product rules" },
  timeline: { label: "Timeline", subtitle: "Tickets, phases, and delivery order" },
  risks: { label: "Risks", subtitle: "Pain points and compliance concerns" },
  actions: { label: "Actions", subtitle: "User stories, personas, and next work" },
};

/**
 * Resume — recruiter memories. Not Risks / Decisions / Actions.
 * Experience is the chronological career memory (✓ Timeline semantics).
 */
const RESUME_FURNITURE: ProjectionProfile = {
  snapshot: { label: "Profile", subtitle: "Who this person is" },
  signals: { label: "Skills", subtitle: "Capabilities the resume claims" },
  decisions: { label: "Education", subtitle: "Degrees, schools, and certifications" },
  timeline: { label: "Experience", subtitle: "Roles and career timeline" },
  risks: { label: "Achievements", subtitle: "Awards, impact, and highlights" },
  actions: { label: "Projects", subtitle: "Built work and portfolio pieces" },
};

/**
 * Invoice — Vendor, Line items, Payment, Timeline, Totals.
 * No PRD Risks / Decisions / Actions branding.
 */
const INVOICE_FURNITURE: ProjectionProfile = {
  snapshot: { label: "Invoice", subtitle: "Who is billing whom" },
  signals: { label: "Line items", subtitle: "Charges, quantities, and unit prices" },
  decisions: { label: "Vendor", subtitle: "Billing party and commercial terms" },
  timeline: { label: "Timeline", subtitle: "Issue date, due date, and payment schedule" },
  risks: { label: "Totals", subtitle: "Subtotal, tax, and amount due" },
  actions: { label: "Payment", subtitle: "How and when to pay" },
};

/** Research paper — Hypothesis → Future Work. */
const RESEARCH_FURNITURE: ProjectionProfile = {
  snapshot: { label: "Paper", subtitle: "What this research is about" },
  signals: { label: "Method", subtitle: "How the study was run" },
  decisions: { label: "Hypothesis", subtitle: "What the work set out to test" },
  timeline: { label: "Results", subtitle: "What was found" },
  risks: { label: "Limitations", subtitle: "Bounds and caveats on the findings" },
  actions: { label: "Future work", subtitle: "What should be studied next" },
};

const MEETING_FURNITURE: ProjectionProfile = {
  snapshot: { label: "Meeting", subtitle: "What this conversation was for" },
  signals: { label: "Discussion", subtitle: "Topics raised and open questions" },
  decisions: { label: "Decisions", subtitle: "What the room settled" },
  timeline: { label: "Agenda", subtitle: "Order of topics and timed items" },
  risks: { label: "Blockers", subtitle: "Concerns that still need resolving" },
  actions: { label: "Actions", subtitle: "Owners and follow-ups" },
};

const TICKET_FURNITURE: ProjectionProfile = {
  snapshot: { label: "Trip", subtitle: "What this booking is for" },
  signals: { label: "Details", subtitle: "Seat, gate, PNR, and fare notes" },
  decisions: { label: "Booking", subtitle: "Fare rules and booking choices" },
  timeline: { label: "Itinerary", subtitle: "Departure and arrival" },
  risks: { label: "Alerts", subtitle: "Connections, delays, and caveats" },
  actions: { label: "Checklist", subtitle: "What to do before travel" },
};

const CONTRACT_FURNITURE: ProjectionProfile = {
  snapshot: { label: "Agreement", subtitle: "What this contract covers" },
  signals: { label: "Terms", subtitle: "Material conditions and definitions" },
  decisions: { label: "Obligations", subtitle: "What each party must do" },
  timeline: { label: "Deadlines", subtitle: "Dates that create duties" },
  risks: { label: "Liabilities", subtitle: "Indemnity, termination, and exposure" },
  actions: { label: "Next steps", subtitle: "Signatures, notices, and renewals" },
};

const MENU_FURNITURE: ProjectionProfile = {
  snapshot: { label: "Menu", subtitle: "What this menu is for" },
  signals: { label: "Dishes", subtitle: "Items, prices, and descriptions" },
  decisions: { label: "House rules", subtitle: "Service notes and substitutions" },
  timeline: { label: "Timeline", subtitle: "Not used for menus" },
  risks: { label: "Allergens", subtitle: "Dietary caveats when stated" },
  actions: { label: "Specials", subtitle: "Limited offers and chef notes" },
};

const JOB_FURNITURE: ProjectionProfile = {
  snapshot: { label: "Role", subtitle: "What this job is" },
  signals: { label: "Requirements", subtitle: "Qualifications and must-haves" },
  decisions: { label: "Scope", subtitle: "Responsibilities and level" },
  timeline: { label: "Timeline", subtitle: "Not used for job posts" },
  risks: { label: "Caveats", subtitle: "Constraints or trade-offs" },
  actions: { label: "Apply", subtitle: "How to apply and next steps" },
};

const GLOSSARY_FURNITURE: ProjectionProfile = {
  snapshot: { label: "Glossary", subtitle: "What this reference covers" },
  signals: { label: "Terms", subtitle: "Definitions and vocabulary" },
  decisions: { label: "Conventions", subtitle: "Naming and usage rules" },
  timeline: { label: "Timeline", subtitle: "Not used for glossaries" },
  risks: { label: "Ambiguities", subtitle: "Overlapping or contested terms" },
  actions: { label: "See also", subtitle: "Related entries to follow" },
};

function classicKeep(furniture: ProjectionProfile = CLASSIC_FURNITURE): AdaptiveMemoryProjection {
  return {
    furniture,
    applicable: ALL_KINDS,
    required: ALL_KINDS,
    emptyApplicable: "keep",
    overflow: "promote",
  };
}

function selective(opts: {
  furniture: ProjectionProfile;
  applicable: readonly BlockKind[];
  required?: readonly BlockKind[];
  emptyApplicable?: EmptyApplicablePolicy;
}): AdaptiveMemoryProjection {
  return {
    furniture: opts.furniture,
    applicable: opts.applicable,
    required: opts.required ?? (["snapshot"] as const),
    emptyApplicable: opts.emptyApplicable ?? "omit",
    overflow: "promote",
  };
}

const PROJECTIONS: Partial<Record<DocumentArchetype, AdaptiveMemoryProjection>> = {
  // Spec documents — classic six memories, always present.
  prd: classicKeep(PRD_FURNITURE),
  brief: classicKeep(PRD_FURNITURE),
  // Unidentified / weak-type decks still use PRD architecture as the safe default.
  slides: classicKeep(PRD_FURNITURE),

  // Resume: Experience, Projects, Skills, Education, Achievements (+ Profile).
  // No Risks / Decisions / Actions labels — those kinds hold Achievements / Education / Projects.
  resume: selective({
    furniture: RESUME_FURNITURE,
    // Order matches recruiter reading: Experience → Projects → Skills → Education → Achievements.
    applicable: ["snapshot", "timeline", "actions", "signals", "decisions", "risks"],
    required: ["snapshot"],
    emptyApplicable: "omit",
  }),

  // Invoice: Vendor, Line items, Payment, Timeline, Totals.
  invoice: selective({
    furniture: INVOICE_FURNITURE,
    applicable: ["snapshot", "decisions", "signals", "actions", "timeline", "risks"],
    required: ["snapshot"],
    emptyApplicable: "omit",
  }),

  // Research: Hypothesis, Method, Results, Limitations, Future work.
  research: selective({
    furniture: RESEARCH_FURNITURE,
    applicable: ["snapshot", "decisions", "signals", "timeline", "risks", "actions"],
    required: ["snapshot"],
    emptyApplicable: "omit",
  }),

  // Meeting: discussion + decisions + actions; agenda/blockers when present.
  meeting: selective({
    furniture: MEETING_FURNITURE,
    applicable: ["snapshot", "signals", "decisions", "actions"],
    required: ["snapshot"],
    emptyApplicable: "omit",
  }),

  ticket: selective({
    furniture: TICKET_FURNITURE,
    applicable: ["snapshot", "signals", "timeline", "actions"],
    required: ["snapshot", "timeline"],
    emptyApplicable: "omit",
  }),

  contract: selective({
    furniture: CONTRACT_FURNITURE,
    applicable: ["snapshot", "signals", "decisions", "timeline", "risks", "actions"],
    required: ["snapshot"],
    emptyApplicable: "omit",
  }),
  policy: selective({
    furniture: CONTRACT_FURNITURE,
    applicable: ["snapshot", "signals", "decisions", "timeline", "risks", "actions"],
    required: ["snapshot"],
    emptyApplicable: "omit",
  }),

  // Timeline has no semantic meaning for these — omit, never fail extraction.
  menu: selective({
    furniture: MENU_FURNITURE,
    applicable: ["snapshot", "signals", "decisions", "risks", "actions"],
    required: ["snapshot"],
    emptyApplicable: "omit",
  }),
  glossary: selective({
    furniture: GLOSSARY_FURNITURE,
    applicable: ["snapshot", "signals", "decisions"],
    required: ["snapshot", "signals"],
    emptyApplicable: "not_applicable",
  }),
  job: selective({
    furniture: JOB_FURNITURE,
    applicable: ["snapshot", "signals", "decisions", "actions"],
    required: ["snapshot"],
    emptyApplicable: "omit",
  }),
};

/**
 * Default when archetype is unknown or unrecognized: PRD six-memory architecture.
 * Prefer this over inventing furniture for an unidentified document.
 */
const DEFAULT_PRD_PROJECTION = classicKeep(PRD_FURNITURE);

/** Resolve the adaptive projection for an archetype. */
export function memoryProjectionFor(
  archetype: DocumentArchetype | string | null | undefined,
): AdaptiveMemoryProjection {
  if (!archetype || archetype === "other") return DEFAULT_PRD_PROJECTION;
  return PROJECTIONS[archetype as DocumentArchetype] ?? DEFAULT_PRD_PROJECTION;
}

/** @deprecated Prefer memoryProjectionFor — kept for call sites that only need labels. */
export function projectionProfileFor(
  archetype: DocumentArchetype | string | null | undefined,
): ProjectionProfile {
  return memoryProjectionFor(archetype).furniture;
}

export function bucketLabel(
  archetype: DocumentArchetype | string | null | undefined,
  kind: BlockKind,
): string {
  return memoryProjectionFor(archetype).furniture[kind].label;
}

export function bucketSubtitle(
  archetype: DocumentArchetype | string | null | undefined,
  kind: BlockKind,
): string {
  return memoryProjectionFor(archetype).furniture[kind].subtitle;
}

export function isKindApplicable(
  archetype: DocumentArchetype | string | null | undefined,
  kind: BlockKind,
): boolean {
  return memoryProjectionFor(archetype).applicable.includes(kind);
}

export function isKindRequired(
  archetype: DocumentArchetype | string | null | undefined,
  kind: BlockKind,
): boolean {
  return memoryProjectionFor(archetype).required.includes(kind);
}

export function isEmptyMemoryPayload(payload: BlockPayload): boolean {
  if ("entries" in payload) {
    const notes = payload.notes ?? [];
    return payload.entries.length === 0 && notes.length === 0;
  }
  // Snapshot: always considered non-empty if heading/summary exist (they always do).
  const notes = payload.notes ?? [];
  const substantive =
    Boolean(payload.hook) ||
    Boolean(payload.goal) ||
    Boolean(payload.problem) ||
    Boolean(payload.outcome) ||
    notes.some((n) => n !== NOT_APPLICABLE_NOTE);
  return !substantive && !payload.summary.trim() && !payload.heading.trim();
}

export function isNotApplicableBlock(block: {
  payload: BlockPayload;
}): boolean {
  const notes = "notes" in block.payload ? (block.payload.notes ?? []) : [];
  return notes.includes(NOT_APPLICABLE_NOTE);
}

function markNotApplicable<T extends { payload: BlockPayload }>(block: T): T {
  const payload = block.payload;
  const existing = "notes" in payload ? (payload.notes ?? []) : [];
  if (existing.includes(NOT_APPLICABLE_NOTE)) return block;
  return {
    ...block,
    payload: { ...payload, notes: [...existing, NOT_APPLICABLE_NOTE] },
  };
}

/**
 * Stamp archetype-aware titles onto universal blocks (no filtering).
 * Prefer projectAdaptiveMemories for the full adaptive hop.
 */
export function applyProjectionTitles<T extends { kind: BlockKind; title?: string }>(
  blocks: readonly T[],
  archetype: DocumentArchetype | string | null | undefined,
): T[] {
  const furniture = memoryProjectionFor(archetype).furniture;
  return blocks.map((block) => ({
    ...block,
    title: furniture[block.kind].label,
  }));
}

type ProjectableBlock = {
  kind: BlockKind;
  title?: string;
  payload: BlockPayload;
};

/**
 * Adaptive Memory Projection: select, label, and shape rendered blocks from
 * universal observations. Does not change extraction — only the view.
 */
export function projectAdaptiveMemories<T extends ProjectableBlock>(
  blocks: readonly T[],
  archetype: DocumentArchetype | string | null | undefined,
): T[] {
  const spec = memoryProjectionFor(archetype);
  const byKind = new Map<BlockKind, T>();
  for (const block of blocks) byKind.set(block.kind, block);

  const out: T[] = [];
  const consumed = new Set<BlockKind>();

  for (const kind of spec.applicable) {
    const block = byKind.get(kind);
    if (!block) continue;
    consumed.add(kind);
    const titled = { ...block, title: spec.furniture[kind].label };
    const empty = isEmptyMemoryPayload(titled.payload);
    const required = spec.required.includes(kind);

    if (empty && !required) {
      if (spec.emptyApplicable === "omit") continue;
      if (spec.emptyApplicable === "not_applicable") {
        out.push(markNotApplicable(titled));
        continue;
      }
      // keep — leave empty payload as-is
    }

    if (empty && required && spec.emptyApplicable === "not_applicable") {
      out.push(markNotApplicable(titled));
      continue;
    }

    out.push(titled);
  }

  // Overflow: never lose observations that landed in an "inapplicable" kind.
  if (spec.overflow === "promote") {
    for (const kind of ALL_KINDS) {
      if (consumed.has(kind)) continue;
      const block = byKind.get(kind);
      if (!block || isEmptyMemoryPayload(block.payload)) continue;
      out.push({ ...block, title: spec.furniture[kind].label });
    }
  }

  // Guarantee at least Snapshot so finalizeDocument never receives [].
  if (out.length === 0) {
    const snap = byKind.get("snapshot");
    if (snap) {
      out.push({ ...snap, title: spec.furniture.snapshot.label });
    }
  }

  return out;
}
