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
 */
export const signalEntrySchema = z
  .object({
    label: textField(120),
    value: z.union([z.string().min(1).max(120), z.number().finite()]).optional(),
    delta: z.union([z.string().max(120), z.number().finite()]).optional(),
    trend: z.enum(["up", "flat", "down"]).optional(),
  })
  .strict();

export const decisionEntrySchema = z
  .object({
    ref: textField(40).optional(),
    text: textField(LIMITS.maxFieldLength),
    status: z.enum(["approved", "requested", "proposed", "rejected"]),
  })
  .strict();

export const timelineEntrySchema = z
  .object({
    date: textField(80),
    title: textField(LIMITS.maxFieldLength),
    state: z.enum(["shipped", "on-track", "planned", "done"]),
  })
  .strict();

/**
 * `severity` and `mitigation` are optional because most real documents state a
 * risk without grading it. Omitting a field the source never gave is honest;
 * inventing one would not be.
 */
export const riskEntrySchema = z
  .object({
    risk: textField(LIMITS.maxFieldLength),
    severity: z.enum(["high", "medium", "low"]).optional(),
    mitigation: textField(LIMITS.maxFieldLength).optional(),
  })
  .strict();

/** `owner` and `due` are optional for the same reason as risk severity. */
export const actionEntrySchema = z
  .object({
    task: textField(LIMITS.maxFieldLength),
    owner: textField(120).optional(),
    due: textField(80).optional(),
    status: z.enum(["open", "done"]),
  })
  .strict();

const notesSchema = z.array(z.string().max(LIMITS.maxFieldLength)).max(LIMITS.maxNotesPerBlock);

export const snapshotPayloadSchema = z
  .object({
    heading: textField(LIMITS.maxFieldLength),
    summary: textField(LIMITS.maxFieldLength),
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

/* ------------------------------- source blocks ------------------------------ */

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
    warnings: z.array(importWarningSchema).max(200),
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
