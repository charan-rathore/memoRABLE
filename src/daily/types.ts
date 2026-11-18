/**
 * Daily memory · daily/1
 *
 * Layer 1 (source and event foundation): every change is an immutable,
 * versioned event. Everything the user sees is a projection of the log, so
 * any view can be rebuilt, audited, or invalidated precisely.
 */

import type { MemoryState } from "./fsrs";

export const DAILY_SCHEMA = "daily/1" as const;

export type EntryKind = "worked" | "learned" | "decided" | "task";
/** Only set when the text or the user supports it; otherwise left unstated. */
export type DecisionStatus = "proposed" | "approved" | "unresolved" | "superseded";
export type TaskState = "open" | "accepted" | "done" | "dropped";

interface EventBase {
  /** Sortable, unique per device: `${ms base36}-${counter}-${device}`. */
  id: string;
  /** Monotonic position in this workspace's log. */
  seq: number;
  at: string;
  workspaceId: string;
  schema: typeof DAILY_SCHEMA;
}

export type DailyEventBody =
  | { type: "entry.recorded"; entryId: string; kind: EntryKind; text: string; tags: string[]; sourceIds: string[]; refs: string[] }
  | { type: "entry.revised"; entryId: string; text: string; tags: string[]; refs: string[] }
  | { type: "entry.status"; entryId: string; status: Exclude<DecisionStatus, "superseded">; basis: string }
  | { type: "entry.superseded"; entryId: string; by: string }
  /** Explicit deletion. Earlier events for the entry are redacted in storage. */
  | { type: "entry.deleted"; entryId: string }
  | { type: "source.attached"; sourceId: string; name: string; mime: string; bytes: number; contentHash: string; excerpt: string }
  | { type: "task.state"; entryId: string; state: TaskState }
  | { type: "plan.decided"; candidateId: string | null; decision: "accepted" | "revised" | "skipped"; revisedEntryId?: string }
  /** A re-confirmation answer: 3 still holds, 2 unsure, 1 no longer holds. Drives the FSRS schedule. */
  | { type: "entry.reviewed"; entryId: string; grade: 1 | 2 | 3 | 4 };

export type DailyEvent = EventBase & DailyEventBody & { redacted?: boolean };

export interface SourceRef {
  id: string;
  name: string;
  mime: string;
  bytes: number;
  contentHash: string;
  excerpt: string;
  attachedAt: string;
}

export interface Entry {
  id: string;
  /** Short handle a person can type: `#a1b2c3`. */
  handle: string;
  kind: EntryKind;
  text: string;
  tags: string[];
  refs: string[];
  sourceIds: string[];
  createdAt: string;
  updatedAt: string;
  version: number;
  status?: DecisionStatus;
  /** Why the status holds: a rule that fired on the text, or "set by you". */
  statusBasis?: string;
  supersededBy?: string;
  /** When the supersession was recorded: the end of this entry's validity window. */
  supersededAt?: string;
  supersedes: string[];
  /** FSRS memory state for decisions and lessons; drives re-confirmation. */
  memory?: MemoryState;
  task?: TaskState;
  history: Array<{ version: number; at: string; text: string }>;
}

export interface WorkspaceState {
  workspaceId: string;
  entries: Map<string, Entry>;
  sources: Map<string, SourceRef>;
  /** Entry ids removed by explicit deletion; kept so views can say "deleted". */
  deleted: Set<string>;
  plans: Array<{ at: string; candidateId: string | null; decision: "accepted" | "revised" | "skipped" }>;
  lastSeq: number;
}

/** Every operation reports what it actually cost. Never estimated. */
export interface Receipt {
  op: "record" | "revise" | "status" | "supersede" | "delete" | "attach" | "recall" | "plan" | "load" | "reconfirm" | "asof";
  ms: number;
  scanned: number;
  cache: "hit" | "miss" | "n/a";
  invalidated: number;
  modelCalls: number;
  costUsd: number;
  at: string;
}
