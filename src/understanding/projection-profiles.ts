/**
 * Adaptive memory projection — the last hop of:
 *
 *   Upload
 *        │
 *        ▼
 *   Multimodal Parsing
 *        │
 *        ▼
 *   Deterministic Archetype Scoring
 *        │
 *        ├──────────────┐
 *        │              │
 *        ▼              ▼
 *   Known Archetype   Generic Knowledge
 *        │              │
 *        └──────┬───────┘
 *               ▼
 *   Universal Cognitive Engine
 *               │
 *               ▼
 *   Universal Observations
 *               │
 *               ▼
 *   Semantic Compression
 *               │
 *               ▼
 *   Adaptive Memory Projection
 *               │
 *               ▼
 *   Evidence-Linked Memory Cards
 *
 * Principle: Projection is adaptive, understanding is universal.
 *
 * The cognitive engine never changes its reasoning based on document type.
 * It always extracts the same universal observations (entities, facts,
 * relationships, metrics, events, procedures, questions, constraints,
 * evidence). Only this final projection layer adapts how those observations
 * are organized and presented.
 *
 * Specialized projections: Resume · Invoice · Research.
 * Fallback: Generic Knowledge (Snapshot, Signals, Decisions, Timeline,
 * Risks, Actions) — never an assumed PRD.
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

/** Generic Knowledge — classic six memories for everything that is not specialized. */
const GENERIC_KNOWLEDGE_FURNITURE: ProjectionProfile = {
  snapshot: { label: BLOCK_KIND_LABELS.snapshot, subtitle: BLOCK_KIND_SUBTITLES.snapshot },
  signals: { label: BLOCK_KIND_LABELS.signals, subtitle: BLOCK_KIND_SUBTITLES.signals },
  decisions: { label: BLOCK_KIND_LABELS.decisions, subtitle: BLOCK_KIND_SUBTITLES.decisions },
  timeline: { label: BLOCK_KIND_LABELS.timeline, subtitle: BLOCK_KIND_SUBTITLES.timeline },
  risks: { label: BLOCK_KIND_LABELS.risks, subtitle: BLOCK_KIND_SUBTITLES.risks },
  actions: { label: BLOCK_KIND_LABELS.actions, subtitle: BLOCK_KIND_SUBTITLES.actions },
};

const ALL_KINDS = BLOCK_KINDS;

/**
 * Resume — Experience, Projects, Skills, Education, Achievements, Profile.
 * Experience is the chronological career memory (Timeline semantics).
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
 * Invoice — Vendor, Line Items, Payments, Timeline, Totals.
 */
const INVOICE_FURNITURE: ProjectionProfile = {
  snapshot: { label: "Invoice", subtitle: "Who is billing whom" },
  signals: { label: "Line items", subtitle: "Charges, quantities, and unit prices" },
  decisions: { label: "Vendor", subtitle: "Billing party and commercial terms" },
  timeline: { label: "Timeline", subtitle: "Issue date, due date, and payment schedule" },
  risks: { label: "Totals", subtitle: "Subtotal, tax, and amount due" },
  actions: { label: "Payment", subtitle: "How and when to pay" },
};

/** Research — Hypothesis, Method, Results, Limitations, Future Work. */
const RESEARCH_FURNITURE: ProjectionProfile = {
  snapshot: { label: "Paper", subtitle: "What this research is about" },
  signals: { label: "Method", subtitle: "How the study was run" },
  decisions: { label: "Hypothesis", subtitle: "What the work set out to test" },
  timeline: { label: "Results", subtitle: "What was found" },
  risks: { label: "Limitations", subtitle: "Bounds and caveats on the findings" },
  actions: { label: "Future work", subtitle: "What should be studied next" },
};

function classicKeep(furniture: ProjectionProfile = GENERIC_KNOWLEDGE_FURNITURE): AdaptiveMemoryProjection {
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

/**
 * Only three specialized projections. Everything else → Generic Knowledge.
 */
const PROJECTIONS: Record<Exclude<DocumentArchetype, "generic">, AdaptiveMemoryProjection> = {
  // Experience → Projects → Skills → Education → Achievements → Profile.
  resume: selective({
    furniture: RESUME_FURNITURE,
    applicable: ["timeline", "actions", "signals", "decisions", "risks", "snapshot"],
    required: ["snapshot"],
    emptyApplicable: "omit",
  }),

  // Vendor → Line items → Payment → Timeline → Totals (+ Invoice).
  invoice: selective({
    furniture: INVOICE_FURNITURE,
    applicable: ["decisions", "signals", "actions", "timeline", "risks", "snapshot"],
    required: ["snapshot"],
    emptyApplicable: "omit",
  }),

  // Hypothesis → Method → Results → Limitations → Future work (+ Paper).
  research: selective({
    furniture: RESEARCH_FURNITURE,
    applicable: ["decisions", "signals", "timeline", "risks", "actions", "snapshot"],
    required: ["snapshot"],
    emptyApplicable: "omit",
  }),
};

/**
 * Default for unknown / unrecognized / non-specialized documents:
 * Generic Knowledge six-memory architecture — never an assumed PRD.
 */
const GENERIC_KNOWLEDGE_PROJECTION = classicKeep(GENERIC_KNOWLEDGE_FURNITURE);

/** Resolve the adaptive projection for an archetype. */
export function memoryProjectionFor(
  archetype: DocumentArchetype | string | null | undefined,
): AdaptiveMemoryProjection {
  if (archetype === "resume" || archetype === "invoice" || archetype === "research") {
    return PROJECTIONS[archetype];
  }
  // generic, other, prd, meeting, policy, null, unrecognized, …
  return GENERIC_KNOWLEDGE_PROJECTION;
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
