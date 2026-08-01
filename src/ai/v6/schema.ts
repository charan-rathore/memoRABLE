import { z } from "zod";

/**
 * Layer 2 emission schema (memoRABLE Cognitive Extraction Engine v6).
 *
 * This is what the model emits. Backend persistence verbs never appear here —
 * Layer 3 projects this into MemorySource for the existing UI contract.
 */

export const TIMELINE_MODES = [
  "single_leg",
  "milestone_chain",
  "obligation_deadlines",
  "narrative_sequence",
  "none",
] as const;

export const CONFIDENCE_LEVELS = ["high", "medium", "low", "none"] as const;
export const DATE_ROLES = ["event_date", "deadline", "mention_date", "authored_date"] as const;
export const SIGNAL_TYPES = [
  "pattern",
  "tone",
  "omission",
  "unresolved_temporal",
  "repetition",
] as const;

const confidence = z.enum(["high", "medium", "low", "none"]);
const confNoNone = z.enum(["high", "medium", "low"]);

export const provenanceSchema = z
  .object({
    page: z.union([z.number().int().nonnegative(), z.string(), z.null()]).optional().nullable(),
    paragraph: z.union([z.number().int().nonnegative(), z.string(), z.null()]).optional().nullable(),
    table: z.union([z.number().int().nonnegative(), z.string(), z.null()]).optional().nullable(),
    cell: z.union([z.string(), z.null()]).optional().nullable(),
    image_caption: z.union([z.string(), z.null()]).optional().nullable(),
    footnote: z.union([z.string(), z.null()]).optional().nullable(),
  })
  .passthrough()
  .optional()
  .nullable();

const resolvedDateSchema = z
  .object({
    type: z.enum(["point", "range", "recurring", "relative_unresolved"]),
    value: z.union([
      z.string(),
      z.object({
        start: z.string().optional().nullable(),
        end: z.string().optional().nullable(),
        pattern: z.string().optional().nullable(),
      }),
      z.null(),
    ]),
  })
  .passthrough()
  .optional()
  .nullable();

export const v6DocumentMetaSchema = z
  .object({
    archetype: z.string().min(1).max(120),
    timeline_mode: z.enum(TIMELINE_MODES),
    anchor_date: z.union([z.string(), z.null()]).optional().nullable(),
    anchor_confidence: confidence.optional().default("none"),
  })
  .passthrough();

export const v6SnapshotItemSchema = z
  .object({
    content: z.string().min(1).max(2000),
    provenance: provenanceSchema,
  })
  .passthrough();

export const v6SignalItemSchema = z
  .object({
    content: z.string().min(1).max(2000),
    signal_type: z.enum(SIGNAL_TYPES).optional().default("pattern"),
    source_confidence: confNoNone.optional().default("medium"),
    provenance: provenanceSchema,
  })
  .passthrough();

export const v6TimelineItemSchema = z
  .object({
    id: z.string().min(1).max(40).optional(),
    content: z.string().min(1).max(2000),
    date_role: z.enum(DATE_ROLES).optional().default("event_date"),
    raw_temporal_expression: z.string().max(240).optional().nullable(),
    resolved_date: resolvedDateSchema,
    timeline_confidence: z
      .object({
        date_resolution: confidence.optional().default("medium"),
        ordering: confNoNone.optional().default("medium"),
        overall: confNoNone.optional().default("medium"),
      })
      .passthrough()
      .optional(),
    responsible_party: z.union([z.string(), z.null()]).optional().nullable(),
    depends_on: z.array(z.string()).optional().default([]),
    provenance: provenanceSchema,
  })
  .passthrough();

export const v6RiskItemSchema = z
  .object({
    content: z.string().min(1).max(2000),
    why_it_matters: z.string().max(2000).optional().nullable(),
    source_confidence: confNoNone.optional().default("medium"),
    provenance: provenanceSchema,
  })
  .passthrough();

export const v6DecisionItemSchema = z
  .object({
    decision_id: z.string().min(1).max(40).optional(),
    content: z.string().min(1).max(2000),
    decided_by: z.union([z.string(), z.null()]).optional().nullable(),
    source_confidence: confNoNone.optional().default("medium"),
    provenance: provenanceSchema,
  })
  .passthrough();

export const v6ActionItemSchema = z
  .object({
    content: z.string().min(1).max(2000),
    owner: z.union([z.string(), z.null()]).optional().nullable(),
    due_date: z.union([z.string(), z.null()]).optional().nullable(),
    status: z.enum(["ready", "pending", "suggested", "done"]).optional().default("pending"),
    carries_out: z.union([z.string(), z.null()]).optional().nullable(),
    provenance: provenanceSchema,
  })
  .passthrough();

export const v6ExtractionSchema = z
  .object({
    document_meta: v6DocumentMetaSchema,
    snapshot: z.array(v6SnapshotItemSchema).max(20).optional().default([]),
    signals: z.array(v6SignalItemSchema).max(100).optional().default([]),
    timeline: z.array(v6TimelineItemSchema).max(100).optional().default([]),
    risks: z.array(v6RiskItemSchema).max(100).optional().default([]),
    decisions: z.array(v6DecisionItemSchema).max(100).optional().default([]),
    actions: z.array(v6ActionItemSchema).max(100).optional().default([]),
  })
  .passthrough();

export type V6Extraction = z.infer<typeof v6ExtractionSchema>;
export type V6TimelineMode = (typeof TIMELINE_MODES)[number];
export type TimelineConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

/** Soft parse: coerce missing arrays / meta so Layer 3 can repair. */
export function parseV6Extraction(raw: unknown): {
  ok: true;
  value: V6Extraction;
} | {
  ok: false;
  issues: string[];
} {
  const normalized = coerceV6Shape(raw);
  const parsed = v6ExtractionSchema.safeParse(normalized);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.slice(0, 12).map((i) => `${i.path.join(".")}: ${i.message}`),
    };
  }
  return { ok: true, value: parsed.data };
}

function coerceV6Shape(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const obj = raw as Record<string, unknown>;
  const meta =
    typeof obj.document_meta === "object" && obj.document_meta !== null
      ? (obj.document_meta as Record<string, unknown>)
      : {};
  return {
    document_meta: {
      archetype: typeof meta.archetype === "string" ? meta.archetype : "other",
      timeline_mode: TIMELINE_MODES.includes(meta.timeline_mode as V6TimelineMode)
        ? meta.timeline_mode
        : "none",
      anchor_date: meta.anchor_date ?? null,
      anchor_confidence: meta.anchor_confidence ?? "none",
    },
    snapshot: Array.isArray(obj.snapshot) ? obj.snapshot : [],
    signals: Array.isArray(obj.signals) ? obj.signals : [],
    timeline: Array.isArray(obj.timeline) ? obj.timeline : [],
    risks: Array.isArray(obj.risks) ? obj.risks : [],
    decisions: Array.isArray(obj.decisions) ? obj.decisions : [],
    actions: Array.isArray(obj.actions) ? obj.actions : [],
  };
}
