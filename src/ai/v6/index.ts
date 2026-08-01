export { V6_SYSTEM_PROMPT, buildV6UserPrompt } from "./prompt";
export { parseV6Extraction, v6ExtractionSchema, type V6Extraction, type V6TimelineMode } from "./schema";
export {
  validateAndRepairV6,
  shouldFallbackToCandidate,
  type FailureMode,
  type RepairEvent,
  type MemoryQualityScore,
  type ValidatedV6,
} from "./validate";
export { projectV6ToMemorySource, type ProjectResult } from "./project";
export { scoreMemorySource, scoreV6Extraction } from "./score";

import type { MemorySource } from "@/domain/memory/schema";
import { parseV6Extraction } from "./schema";
import { validateAndRepairV6, shouldFallbackToCandidate, type RepairEvent } from "./validate";
import { projectV6ToMemorySource } from "./project";
import { scoreMemorySource } from "./score";

export type CognitivePipelineResult =
  | {
      ok: true;
      improved: MemorySource;
      repairs: RepairEvent[];
      usedCandidateFallback: boolean;
    }
  | {
      ok: false;
      reason: "invalid-output" | "projection_failed";
      message: string;
      repairs: RepairEvent[];
    };

/**
 * Full Layer 2→3 pipeline: parse v6 JSON → repair failure modes → project
 * to MemorySource → optionally fall back to the local candidate.
 */
export function runCognitivePipeline(
  rawModelOutput: unknown,
  args: {
    titleHint: string;
    candidate: MemorySource;
  },
): CognitivePipelineResult {
  const parsed = parseV6Extraction(rawModelOutput);
  if (!parsed.ok) {
    return {
      ok: false,
      reason: "invalid-output",
      message: `AI output did not match the cognitive schema (${parsed.issues.slice(0, 3).join("; ")}). The local result is unchanged.`,
      repairs: [{ mode: "schema_rejected", detail: parsed.issues.join("; ") }],
    };
  }

  const validated = validateAndRepairV6(parsed.value);
  const projected = projectV6ToMemorySource(validated.extraction, args.titleHint, validated.repairs);
  if (!projected.ok) {
    return {
      ok: false,
      reason: "projection_failed",
      message: "AI memories could not be projected into the memory schema. The local result is unchanged.",
      repairs: projected.repairs,
    };
  }

  const candidateScore = scoreMemorySource(args.candidate, {
    timelineMode: validated.extraction.document_meta.timeline_mode,
  });
  const improvedScore = scoreMemorySource(projected.source, {
    timelineMode: validated.extraction.document_meta.timeline_mode,
  });

  if (shouldFallbackToCandidate(candidateScore, improvedScore)) {
    return {
      ok: true,
      improved: args.candidate,
      repairs: [
        ...projected.repairs,
        {
          mode: "fallback_to_candidate",
          detail: `Kept local candidate (AI overall ${improvedScore.overall.toFixed(2)} < local ${candidateScore.overall.toFixed(2)}).`,
        },
      ],
      usedCandidateFallback: true,
    };
  }

  return {
    ok: true,
    improved: projected.source,
    repairs: projected.repairs,
    usedCandidateFallback: false,
  };
}
