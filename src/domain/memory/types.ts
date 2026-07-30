/**
 * Public type surface for the memory domain. All types are inferred from the
 * Zod schemas in `./schema`, so runtime validation and compile-time types can
 * never drift apart.
 */
export type {
  ActionEntry,
  ActionsPayload,
  BlockKind,
  BlockPayload,
  BlockProvenance,
  DecisionEntry,
  DecisionsPayload,
  ImportWarning,
  MemoryBlock,
  MemoryDocument,
  MemorySource,
  ProvenanceMethod,
  RiskEntry,
  RisksPayload,
  SignalEntry,
  SignalsPayload,
  SnapshotPayload,
  SourceBlock,
  TimelineEntry,
  TimelinePayload,
} from "./schema";
export type { Diagnostic, DiagnosticCode } from "@/reliability/diagnostics";
export type { Result } from "@/reliability/result";

/** Render output modes supported by the Elements bundle. */
export const OUTPUT_MODES = ["web", "email", "document"] as const;
export type OutputMode = (typeof OUTPUT_MODES)[number];

export const OUTPUT_MODE_LABELS: Record<OutputMode, string> = {
  web: "Web page",
  email: "Email",
  document: "Document",
};
