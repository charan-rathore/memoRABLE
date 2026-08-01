import { z } from "zod";
import { LIMITS } from "./limits";

/**
 * Memory Block model — the runtime source of truth.
 *
 * Two schemas live here:
 *  - `memorySourceSchema` — the strict, all-or-nothing JSON import format
 *    (unknown keys/kinds, wrong versions and malformed fields are rejected).
 *  - `memoryDocumentSchema` — the canonical `MemoryDocumentV1` produced by
 *    every import path (JSON, local text parser, verified example, AI).
 */

export const BLOCK_KINDS = [
  "snapshot",
  "signals",
  "decisions",
  "timeline",
  "risks",
  "actions",
] as const;

export const blockKindSchema = z.enum(BLOCK_KINDS);
export type BlockKind = z.infer<typeof blockKindSchema>;

export const PROVENANCE_METHODS = [
  "deterministic-json",
  "local-parser",
  "ai",
  "recovered",
  "verified-example",
] as const;

export const provenanceMethodSchema = z.enum(PROVENANCE_METHODS);
export type ProvenanceMethod = z.infer<typeof provenanceMethodSchema>;

const textField = (max: number) => z.string().min(1).max(max);

/* ---------------------------------- payloads --------------------------------- */

/**
 * `value` is optional so a qualitative indicator ("Explainable AI") is still a
 * signal. Renderers show a measured tile when a value exists and a plain
 * criterion chip when it does not.
 *
 * `implication` is what the signal changes about future decisions, which is
 * the part a person actually carries away a week later. It is only ever
 * written when the source states or plainly implies it.
 */
export const signalEntrySchema = z
  .object({
    label: textField(120),
    value: z.union([z.string().min(1).max(120), z.number().finite()]).optional(),
    delta: z.union([z.string().max(120), z.number().finite()]).optional(),
    trend: z.enum(["up", "flat", "down"]).optional(),
    implication: textField(LIMITS.maxFieldLength).optional(),
  })
  .strict();

/**
 * `commitment` separates a position the author settled on from one they merely
 * floated. Suggestions and commitments read identically as sentences, so the
 * distinction has to be carried as data.
 */
export const decisionEntrySchema = z
  .object({
    ref: textField(40).optional(),
    text: textField(LIMITS.maxFieldLength),
    status: z.enum(["approved", "requested", "proposed", "rejected"]),
    commitment: z.enum(["committed", "considered"]).optional(),
    because: textField(LIMITS.maxFieldLength).optional(),
  })
  .strict();

/**
 * A phase is remembered by what it leaves behind and what it unblocks, not by
 * its dates. `produces` and `requires` carry those two relationships.
 */
export const timelineEntrySchema = z
  .object({
    date: textField(80),
    title: textField(LIMITS.maxFieldLength),
    state: z.enum(["shipped", "on-track", "planned", "done"]),
    produces: textField(240).optional(),
    requires: textField(240).optional(),
  })
  .strict();

/**
 * `severity` and `mitigation` are optional because most real documents state a
 * risk without grading it. Omitting a field the source never gave is honest;
 * inventing one would not be.
 *
 * `because` and `consequence` carry the reasoning a risk is actually made of:
 * the observation, why it matters, and what it costs if it goes unhandled.
 */
export const riskEntrySchema = z
  .object({
    risk: textField(LIMITS.maxFieldLength),
    severity: z.enum(["high", "medium", "low"]).optional(),
    mitigation: textField(LIMITS.maxFieldLength).optional(),
    because: textField(LIMITS.maxFieldLength).optional(),
    consequence: textField(LIMITS.maxFieldLength).optional(),
  })
  .strict();

/**
 * Action readiness, in the words a person would use.
 *
 * "Pending" is work already agreed and waiting, "Suggested" is work the source
 * floated without committing to, "Ready" is work whose prerequisites are met,
 * "Done" is finished. The older `open` is still accepted on import and
 * rewritten to `pending`, so documents saved before this distinction existed
 * keep loading.
 */
export const ACTION_STATUSES = ["pending", "suggested", "ready", "done"] as const;
export const actionStatusSchema = z.enum(ACTION_STATUSES);
export type ActionStatus = z.infer<typeof actionStatusSchema>;

/** `owner` and `due` are optional for the same reason as risk severity. */
export const actionEntrySchema = z
  .object({
    task: textField(LIMITS.maxFieldLength),
    owner: textField(120).optional(),
    due: textField(80).optional(),
    status: actionStatusSchema,
    /** The decision this action carries out, by `ref` or by its exact text. */
    from: textField(LIMITS.maxFieldLength).optional(),
  })
  .strict();

const notesSchema = z.array(z.string().max(LIMITS.maxFieldLength)).max(LIMITS.maxNotesPerBlock);

/**
 * `hook` is the one line that has to earn the second line. It is composed from
 * the strongest memory already found, never written from nothing, and is
 * omitted entirely when no memory stands out enough to deserve the position.
 *
 * `goal` / `problem` / `outcome` are the three primary memories the snapshot
 * frames — preferred over a generic "if you remember one thing" line.
 */
export const snapshotPayloadSchema = z
  .object({
    heading: textField(LIMITS.maxFieldLength),
    summary: textField(LIMITS.maxFieldLength),
    hook: textField(300).optional(),
    goal: textField(LIMITS.maxFieldLength).optional(),
    problem: textField(LIMITS.maxFieldLength).optional(),
    outcome: textField(LIMITS.maxFieldLength).optional(),
    byline: textField(240).optional(),
    notes: notesSchema.optional(),
  })
  .strict();

export const signalsPayloadSchema = z
  .object({
    entries: z.array(signalEntrySchema).max(LIMITS.maxEntriesPerBlock),
    notes: notesSchema.optional(),
  })
  .strict();

export const decisionsPayloadSchema = z
  .object({
    entries: z.array(decisionEntrySchema).max(LIMITS.maxEntriesPerBlock),
    notes: notesSchema.optional(),
  })
  .strict();

export const timelinePayloadSchema = z
  .object({
    entries: z.array(timelineEntrySchema).max(LIMITS.maxEntriesPerBlock),
    notes: notesSchema.optional(),
  })
  .strict();

export const risksPayloadSchema = z
  .object({
    entries: z.array(riskEntrySchema).max(LIMITS.maxEntriesPerBlock),
    notes: notesSchema.optional(),
  })
  .strict();

export const actionsPayloadSchema = z
  .object({
    entries: z.array(actionEntrySchema).max(LIMITS.maxEntriesPerBlock),
    notes: notesSchema.optional(),
  })
  .strict();

export const blockPayloadSchema = z.union([
  snapshotPayloadSchema,
  signalsPayloadSchema,
  decisionsPayloadSchema,
  timelinePayloadSchema,
  risksPayloadSchema,
  actionsPayloadSchema,
]);

export type SnapshotPayload = z.infer<typeof snapshotPayloadSchema>;
export type SignalsPayload = z.infer<typeof signalsPayloadSchema>;
export type DecisionsPayload = z.infer<typeof decisionsPayloadSchema>;
export type TimelinePayload = z.infer<typeof timelinePayloadSchema>;
export type RisksPayload = z.infer<typeof risksPayloadSchema>;
export type ActionsPayload = z.infer<typeof actionsPayloadSchema>;
export type BlockPayload = z.infer<typeof blockPayloadSchema>;

export type SignalEntry = z.infer<typeof signalEntrySchema>;
export type DecisionEntry = z.infer<typeof decisionEntrySchema>;
export type TimelineEntry = z.infer<typeof timelineEntrySchema>;
export type RiskEntry = z.infer<typeof riskEntrySchema>;
export type ActionEntry = z.infer<typeof actionEntrySchema>;

/* ------------------------------- relationships ------------------------------ */

/**
 * A memory in isolation is a fact. A memory that points at another memory is
 * understanding. Relations are the edges between the six memories, addressed
 * as `kind:index` so they survive reordering and re-rendering.
 */
export const MEMORY_RELATIONS = [
  /** A signal that shaped a decision. */
  "informs",
  /** Evidence that backs a decision or requirement. */
  "supports",
  /** A risk or need that drives a decision. */
  "motivates",
  /** A decision or action that lessens a risk. */
  "mitigates",
  /** Causal pressure from one memory onto another. */
  "causes",
  /** An unresolved question or dependency a decision waits on. */
  "depends_on",
  /** Something that prevents settling or shipping. */
  "blocks",
  /** An action that carries out a decision. */
  "implements",
  /** A timeline phase that places an action in time. */
  "schedules",
  /** A signal that exposes a risk. */
  "threatens",
  /** The snapshot framing everything under it. */
  "frames",
  /** A phase that leaves an artifact another phase needs. */
  "unblocks",
] as const;

export const memoryRelationKindSchema = z.enum(MEMORY_RELATIONS);
export type MemoryRelationKind = z.infer<typeof memoryRelationKindSchema>;

/** `snapshot`, or `signals:2` — a memory kind with an optional entry index. */
const MEMORY_REF = /^(snapshot|signals|decisions|timeline|risks|actions)(:\d{1,3})?$/;
export const memoryRefSchema = z.string().regex(MEMORY_REF).max(24);

export const memoryRelationSchema = z
  .object({
    from: memoryRefSchema,
    to: memoryRefSchema,
    relation: memoryRelationKindSchema,
    /** Short human phrasing shown in the UI, e.g. "because lead times slipped". */
    note: textField(200).optional(),
  })
  .strict();

export type MemoryRelation = z.infer<typeof memoryRelationSchema>;

export const MEMORY_RELATION_LABELS: Record<MemoryRelationKind, string> = {
  informs: "informs",
  supports: "supports",
  motivates: "motivates",
  mitigates: "mitigates",
  causes: "causes",
  depends_on: "depends on",
  blocks: "blocks",
  implements: "carries out",
  schedules: "is scheduled by",
  threatens: "points at",
  frames: "frames",
  unblocks: "unblocks",
};

/* ------------------------------- source blocks ------------------------------ */

/**
 * Detected document archetype — drives UI bucket projection only.
 * Universal observation kinds stay fixed; this selects the furniture.
 * Principle: Projection is adaptive, understanding is universal.
 */
export const documentArchetypeInfoSchema = z
  .object({
    id: z.string().min(1).max(40),
    label: z.string().min(1).max(80),
    /**
     * Winner raw cue score when specialized.
     * Omitted for Generic Knowledge (fallback has no score).
     */
    score: z.number().min(0).max(100).optional(),
    /** Raw specialized scores for debugging. */
    scores: z
      .object({
        resume: z.number().min(0).max(100),
        research: z.number().min(0).max(100),
        invoice: z.number().min(0).max(100),
      })
      .optional(),
    /** Cue labels that fired for the projected (or best) archetype. */
    reasons: z.array(z.string().min(1).max(80)).max(24).optional(),
    /** @deprecated AI-path 0–1 confidence; prefer `score` for local detector. */
    confidence: z.number().min(0).max(1).optional(),
  })
  .strict();

export type DocumentArchetypeInfo = z.infer<typeof documentArchetypeInfoSchema>;

/**
 * The strict JSON import format. A discriminated union on `kind` validates
 * each payload against exactly its own schema, so malformed fields produce
 * exact paths. One entry per kind; kinds are unique; all six kinds are
 * required (checked semantically during import for actionable errors).
 */
const sourceBlockBase = {
  title: textField(LIMITS.maxBlockTitleLength).optional(),
};

export const sourceBlockSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("snapshot"), ...sourceBlockBase, payload: snapshotPayloadSchema }).strict(),
  z.object({ kind: z.literal("signals"), ...sourceBlockBase, payload: signalsPayloadSchema }).strict(),
  z.object({ kind: z.literal("decisions"), ...sourceBlockBase, payload: decisionsPayloadSchema }).strict(),
  z.object({ kind: z.literal("timeline"), ...sourceBlockBase, payload: timelinePayloadSchema }).strict(),
  z.object({ kind: z.literal("risks"), ...sourceBlockBase, payload: risksPayloadSchema }).strict(),
  z.object({ kind: z.literal("actions"), ...sourceBlockBase, payload: actionsPayloadSchema }).strict(),
]);

export const memorySourceSchema = z
  .object({
    version: z.literal(1),
    title: textField(LIMITS.maxTitleLength),
    blocks: z.array(sourceBlockSchema).min(1).max(LIMITS.maxBlocks),
    /** Optional: edges between memories, recomputed when absent. */
    relations: z.array(memoryRelationSchema).max(LIMITS.maxRelations).optional(),
    /** Optional: drives UI bucket labels after projection. */
    archetype: documentArchetypeInfoSchema.optional(),
  })
  .strict();

export type SourceBlock = z.infer<typeof sourceBlockSchema>;
export type MemorySource = z.infer<typeof memorySourceSchema>;

/* ------------------------------- provenance --------------------------------- */

export const blockProvenanceSchema = z
  .object({
    method: provenanceMethodSchema,
    /** Sanitized human source label, e.g. "atlas-q3-brief.json" or "Pasted notes". */
    label: z.string().max(LIMITS.maxSourceLabelLength),
    /** Exact JSON path ("blocks[1]") or heading / 1-based line range ("lines 6–9"). */
    locator: z.string().max(200),
    /** Plain-text source excerpt, capped at 240 characters. Escaped at render. */
    excerpt: z.string().max(LIMITS.maxExcerptLength),
  })
  .strict();

export type BlockProvenance = z.infer<typeof blockProvenanceSchema>;

/* ------------------------------ canonical model ----------------------------- */

export const memoryBlockSchema = z
  .object({
    id: z.string().min(1).max(80),
    kind: blockKindSchema,
    title: z.string().min(1).max(LIMITS.maxBlockTitleLength),
    sourceOrder: z.number().int().nonnegative(),
    provenance: blockProvenanceSchema,
    payload: blockPayloadSchema,
  })
  .strict();

export const importWarningSchema = z
  .object({
    code: z.string().min(1).max(60),
    message: z.string().min(1).max(500),
  })
  .strict();

export const memoryDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    title: z.string().min(1).max(LIMITS.maxTitleLength),
    /** Stable, content-derived document id. */
    documentId: z.string().min(1).max(80),
    sourceMethod: provenanceMethodSchema,
    sourceLabel: z.string().max(LIMITS.maxSourceLabelLength),
    /** SHA-256 of the stable canonical serialization. */
    contentHash: z.string().min(1).max(80),
    blocks: z.array(memoryBlockSchema).min(1).max(LIMITS.maxBlocks),
    /** Edges between memories. Always present, possibly empty. */
    relations: z.array(memoryRelationSchema).max(LIMITS.maxRelations),
    warnings: z.array(importWarningSchema).max(200),
    /** Optional: which adaptive projection selected and labeled the memories. */
    archetype: documentArchetypeInfoSchema.optional(),
  })
  .strict();

export type MemoryBlock = z.infer<typeof memoryBlockSchema>;
export type MemoryDocument = z.infer<typeof memoryDocumentSchema>;
export type ImportWarning = z.infer<typeof importWarningSchema>;

/* --------------------------------- helpers ---------------------------------- */

export const BLOCK_KIND_LABELS: Record<BlockKind, string> = {
  snapshot: "Snapshot",
  signals: "Signals",
  decisions: "Decisions",
  timeline: "Timeline",
  risks: "Risks",
  actions: "Actions",
};

/** One-line subtitles so first-time users understand each memory type. */
export const BLOCK_KIND_SUBTITLES: Record<BlockKind, string> = {
  snapshot: "What this document is about",
  signals: "Patterns the document suggests",
  decisions: "Commitments inside the document",
  timeline: "Important chronological events",
  risks: "Potential concerns or blockers",
  actions: "What someone should do next",
};

/** Human provenance method labels for the primary UI ("Remembered from"). */
export const PROVENANCE_METHOD_LABELS: Record<ProvenanceMethod, string> = {
  "deterministic-json": "Exact JSON",
  "local-parser": "Recognized locally",
  ai: "Improved with AI",
  recovered: "Kept as text",
  "verified-example": "Verified example",
};

export function isBlockKind(value: string): value is BlockKind {
  return (BLOCK_KINDS as readonly string[]).includes(value);
}
