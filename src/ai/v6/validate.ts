import type { V6Extraction } from "./schema";
import { TIMELINE_MODES } from "./schema";

/**
 * Layer 3 — deterministic repairs and failure modes.
 *
 * Each mode is incremental and recorded so diagnostics stay honest without
 * inventing memories. Modes never invent owners, dates, or commitments.
 */

export type FailureMode =
  | "schema_rejected"
  | "backend_verbs_scrubbed"
  | "timeline_confidence_gate"
  | "fabricated_date_rejected"
  | "orphan_link_repair"
  | "duplicate_compression"
  | "empty_bucket_normalized"
  | "timeline_mode_honesty"
  | "fallback_to_candidate"
  | "projection_failed";

export interface RepairEvent {
  mode: FailureMode;
  detail: string;
  count?: number;
}

export interface ValidatedV6 {
  extraction: V6Extraction;
  repairs: RepairEvent[];
}

const BACKEND_VERB =
  /\b(UPSERT|MERGE|DELETE|FLAG_CONFLICT|CLUSTER_ID|EMBEDDING|CACHE_POLICY)\b/gi;

/** Run all Layer 3 failure-handling modes, in order. */
export function validateAndRepairV6(input: V6Extraction): ValidatedV6 {
  const repairs: RepairEvent[] = [];
  let extraction = structuredClone(input);

  extraction = scrubBackendVerbs(extraction, repairs);
  extraction = normalizeEmptyBuckets(extraction, repairs);
  extraction = gateTimelineConfidence(extraction, repairs);
  extraction = rejectFabricatedDates(extraction, repairs);
  extraction = enforceTimelineModeHonesty(extraction, repairs);
  extraction = repairOrphanLinks(extraction, repairs);
  extraction = compressDuplicates(extraction, repairs);

  return { extraction, repairs };
}

/* ---------------------------------- modes ---------------------------------- */

/** Mode 1: strip persistence verbs leaked into content fields. */
function scrubBackendVerbs(extraction: V6Extraction, repairs: RepairEvent[]): V6Extraction {
  let count = 0;
  const scrub = (text: string): string => {
    const next = text.replace(BACKEND_VERB, "").replace(/\s{2,}/g, " ").trim();
    if (next !== text) count += 1;
    return next.length > 0 ? next : text.replace(BACKEND_VERB, "[redacted]").trim();
  };

  for (const item of extraction.snapshot) item.content = scrub(item.content);
  for (const item of extraction.signals) item.content = scrub(item.content);
  for (const item of extraction.timeline) item.content = scrub(item.content);
  for (const item of extraction.risks) {
    item.content = scrub(item.content);
    if (item.why_it_matters) item.why_it_matters = scrub(item.why_it_matters);
  }
  for (const item of extraction.decisions) item.content = scrub(item.content);
  for (const item of extraction.actions) item.content = scrub(item.content);

  if (count > 0) {
    repairs.push({
      mode: "backend_verbs_scrubbed",
      detail: "Removed backend persistence verbs from observation content.",
      count,
    });
  }
  return extraction;
}

/** Mode 2: guarantee all six bucket arrays exist. */
function normalizeEmptyBuckets(extraction: V6Extraction, repairs: RepairEvent[]): V6Extraction {
  const before = [
    extraction.snapshot,
    extraction.signals,
    extraction.timeline,
    extraction.risks,
    extraction.decisions,
    extraction.actions,
  ].filter((a) => !Array.isArray(a)).length;

  extraction.snapshot ??= [];
  extraction.signals ??= [];
  extraction.timeline ??= [];
  extraction.risks ??= [];
  extraction.decisions ??= [];
  extraction.actions ??= [];

  if (!TIMELINE_MODES.includes(extraction.document_meta.timeline_mode)) {
    extraction.document_meta.timeline_mode = "none";
  }

  if (before > 0) {
    repairs.push({
      mode: "empty_bucket_normalized",
      detail: "Normalized missing bucket arrays to empty lists.",
      count: before,
    });
  }
  return extraction;
}

/**
 * Mode 3: Timeline confidence gate.
 * low/none date_resolution → Signals as unresolved_temporal (never fabricated Timeline).
 */
function gateTimelineConfidence(extraction: V6Extraction, repairs: RepairEvent[]): V6Extraction {
  const kept: typeof extraction.timeline = [];
  let moved = 0;

  for (const item of extraction.timeline) {
    const resolution = item.timeline_confidence?.date_resolution ?? "medium";
    if (resolution === "low" || resolution === "none") {
      moved += 1;
      extraction.signals.push({
        content: `Unresolved temporal reference: ${item.content}${
          item.raw_temporal_expression ? ` (“${item.raw_temporal_expression}”)` : ""
        }`,
        signal_type: "unresolved_temporal",
        source_confidence: "medium",
        provenance: item.provenance ?? null,
      });
      continue;
    }
    kept.push(item);
  }

  extraction.timeline = kept;
  if (moved > 0) {
    repairs.push({
      mode: "timeline_confidence_gate",
      detail: "Moved low-confidence temporal items from Timeline to Signals.",
      count: moved,
    });
  }
  return extraction;
}

/**
 * Mode 4: reject fabricated / unusable resolved dates.
 * relative_unresolved or null value with medium+ claim → demote.
 */
function rejectFabricatedDates(extraction: V6Extraction, repairs: RepairEvent[]): V6Extraction {
  const kept: typeof extraction.timeline = [];
  let rejected = 0;

  for (const item of extraction.timeline) {
    const resolved = item.resolved_date;
    const type = resolved?.type;
    const value = resolved?.value;
    const useless =
      type === "relative_unresolved" ||
      value === null ||
      value === undefined ||
      (typeof value === "string" && value.trim() === "") ||
      (typeof value === "object" &&
        value !== null &&
        !value.start &&
        !value.end &&
        !value.pattern);

    if (useless) {
      rejected += 1;
      extraction.signals.push({
        content: `Temporal pattern without a safe date: ${item.content}`,
        signal_type: "unresolved_temporal",
        source_confidence: "low",
        provenance: item.provenance ?? null,
      });
      continue;
    }
    kept.push(item);
  }

  extraction.timeline = kept;
  if (rejected > 0) {
    repairs.push({
      mode: "fabricated_date_rejected",
      detail: "Rejected timeline items without a safely resolved date.",
      count: rejected,
    });
  }
  return extraction;
}

/**
 * Mode 5: timeline_mode honesty.
 * mode "none" → clear Timeline (items become signals if they carried content).
 * single_leg → keep at most departure+arrival style pair (first two high-conf).
 */
function enforceTimelineModeHonesty(extraction: V6Extraction, repairs: RepairEvent[]): V6Extraction {
  const mode = extraction.document_meta.timeline_mode;

  if (mode === "none" && extraction.timeline.length > 0) {
    const count = extraction.timeline.length;
    for (const item of extraction.timeline) {
      extraction.signals.push({
        content: item.content,
        signal_type: "unresolved_temporal",
        source_confidence: "medium",
        provenance: item.provenance ?? null,
      });
    }
    extraction.timeline = [];
    repairs.push({
      mode: "timeline_mode_honesty",
      detail: "timeline_mode is none — cleared fabricated Timeline fill.",
      count,
    });
    return extraction;
  }

  if (mode === "single_leg" && extraction.timeline.length > 2) {
    const overflow = extraction.timeline.slice(2);
    extraction.timeline = extraction.timeline.slice(0, 2);
    for (const item of overflow) {
      extraction.signals.push({
        content: item.content,
        signal_type: "pattern",
        source_confidence: "medium",
        provenance: item.provenance ?? null,
      });
    }
    repairs.push({
      mode: "timeline_mode_honesty",
      detail: "single_leg mode kept at most two timeline entries.",
      count: overflow.length,
    });
  }

  return extraction;
}

/** Mode 6: repair orphan carries_out / depends_on references. */
function repairOrphanLinks(extraction: V6Extraction, repairs: RepairEvent[]): V6Extraction {
  let count = 0;

  // Ensure decision IDs exist and are unique.
  const decisionIds = new Set<string>();
  extraction.decisions.forEach((d, i) => {
    const id = d.decision_id?.trim() || `D-${String(i + 1).padStart(3, "0")}`;
    d.decision_id = id;
    decisionIds.add(id);
  });

  const timelineIds = new Set<string>();
  extraction.timeline.forEach((t, i) => {
    const id = t.id?.trim() || `T-${String(i + 1).padStart(3, "0")}`;
    t.id = id;
    timelineIds.add(id);
  });

  for (const action of extraction.actions) {
    if (action.carries_out && !decisionIds.has(action.carries_out)) {
      action.carries_out = null;
      count += 1;
    }
  }

  for (const item of extraction.timeline) {
    const before = item.depends_on?.length ?? 0;
    item.depends_on = (item.depends_on ?? []).filter((id) => timelineIds.has(id));
    count += before - item.depends_on.length;
  }

  if (count > 0) {
    repairs.push({
      mode: "orphan_link_repair",
      detail: "Cleared carries_out / depends_on links that pointed nowhere.",
      count,
    });
  }
  return extraction;
}

/** Mode 7: merge near-duplicate content within each bucket. */
function compressDuplicates(extraction: V6Extraction, repairs: RepairEvent[]): V6Extraction {
  let removed = 0;

  const dedupe = <T extends { content: string }>(items: T[]): T[] => {
    const out: T[] = [];
    for (const item of items) {
      const key = normalizeKey(item.content);
      if (out.some((kept) => normalizeKey(kept.content) === key || similar(kept.content, item.content))) {
        removed += 1;
        continue;
      }
      out.push(item);
    }
    return out;
  };

  extraction.snapshot = dedupe(extraction.snapshot);
  extraction.signals = dedupe(extraction.signals);
  extraction.timeline = dedupe(extraction.timeline);
  extraction.risks = dedupe(extraction.risks);
  extraction.decisions = dedupe(extraction.decisions);
  extraction.actions = dedupe(extraction.actions);

  if (removed > 0) {
    repairs.push({
      mode: "duplicate_compression",
      detail: "Collapsed near-duplicate observations after projection.",
      count: removed,
    });
  }
  return extraction;
}

function normalizeKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function similar(a: string, b: string): boolean {
  const ta = new Set(normalizeKey(a).split(" ").filter((w) => w.length > 2));
  const tb = new Set(normalizeKey(b).split(" ").filter((w) => w.length > 2));
  if (ta.size === 0 || tb.size === 0) return false;
  let overlap = 0;
  for (const w of ta) if (tb.has(w)) overlap += 1;
  const denom = Math.min(ta.size, tb.size);
  return overlap / denom >= 0.85 && Math.abs(ta.size - tb.size) <= 3;
}

/**
 * Mode 8 (caller-side): decide whether projected AI output should replace the
 * local candidate. Prefer candidate when AI emptied identity memories without
 * improving others — never ship a hollow "improvement".
 */
export function shouldFallbackToCandidate(
  candidateScore: MemoryQualityScore,
  improvedScore: MemoryQualityScore,
): boolean {
  // AI made things clearly worse on memory density or timeline honesty.
  if (improvedScore.timelineHonesty < candidateScore.timelineHonesty - 0.05) return true;
  if (improvedScore.overall + 0.08 < candidateScore.overall) return true;
  if (improvedScore.memoryDensity === 0 && candidateScore.memoryDensity > 0) return true;
  return false;
}

export interface MemoryQualityScore {
  overall: number;
  timelineHonesty: number;
  memoryDensity: number;
  decisionActionLink: number;
}
