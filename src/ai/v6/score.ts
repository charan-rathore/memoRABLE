import type { MemorySource } from "@/domain/memory/schema";
import type { MemoryQualityScore } from "./validate";
import type { V6Extraction } from "./schema";

/**
 * Lightweight quality score used for fallback decisions and the eval harness.
 * Scores are 0–1. Higher is better.
 */

export function scoreMemorySource(
  source: MemorySource,
  meta?: { timelineMode?: string; expectEmptyTimeline?: boolean },
): MemoryQualityScore {
  const byKind = Object.fromEntries(source.blocks.map((b) => [b.kind, b])) as Record<
    string,
    MemorySource["blocks"][number]
  >;

  const snapshot = byKind.snapshot?.payload as { summary?: string } | undefined;
  const signals = entryCount(byKind.signals);
  const decisions = entryCount(byKind.decisions);
  const timeline = entryCount(byKind.timeline);
  const risks = entryCount(byKind.risks);
  const actions = entryCount(byKind.actions);

  const identity =
    snapshot?.summary && snapshot.summary.length >= 40 && !/nothing here reads/i.test(snapshot.summary)
      ? 1
      : snapshot?.summary && snapshot.summary.length >= 20
        ? 0.6
        : 0.2;

  const densityRaw = signals + decisions + risks + actions + (timeline > 0 ? 1 : 0);
  const memoryDensity = Math.min(1, densityRaw / 8);

  const expectEmpty =
    meta?.expectEmptyTimeline === true ||
    meta?.timelineMode === "none";
  const timelineHonesty = expectEmpty
    ? timeline === 0
      ? 1
      : timeline <= 1
        ? 0.7
        : 0.2
    : timeline > 0
      ? 0.9
      : 0.55;

  const decisionEntries =
    byKind.decisions && "entries" in byKind.decisions.payload
      ? (byKind.decisions.payload.entries as Array<{ ref?: string }>)
      : [];
  const actionEntries =
    byKind.actions && "entries" in byKind.actions.payload
      ? (byKind.actions.payload.entries as Array<{ from?: string }>)
      : [];
  const refs = new Set(decisionEntries.map((d) => d.ref).filter(Boolean) as string[]);
  const linked = actionEntries.filter((a) => a.from && (refs.has(a.from) || a.from.length > 0));
  const decisionActionLink =
    actionEntries.length === 0
      ? decisionEntries.length > 0
        ? 0.8
        : 0.7
      : linked.length / actionEntries.length;

  const overall =
    identity * 0.28 +
    memoryDensity * 0.27 +
    timelineHonesty * 0.25 +
    decisionActionLink * 0.2;

  return {
    overall,
    timelineHonesty,
    memoryDensity,
    decisionActionLink,
  };
}

export function scoreV6Extraction(extraction: V6Extraction): MemoryQualityScore {
  const expectEmpty = extraction.document_meta.timeline_mode === "none";
  const identity = Math.min(1, extraction.snapshot.length / 3);
  const density = Math.min(
    1,
    (extraction.signals.length +
      extraction.decisions.length +
      extraction.risks.length +
      extraction.actions.length +
      (extraction.timeline.length > 0 ? 1 : 0)) /
      8,
  );
  const timelineHonesty = expectEmpty
    ? extraction.timeline.length === 0
      ? 1
      : 0.25
    : extraction.timeline.length > 0
      ? 0.9
      : 0.55;

  const decisionIds = new Set(
    extraction.decisions.map((d) => d.decision_id).filter(Boolean) as string[],
  );
  const linked = extraction.actions.filter((a) => a.carries_out && decisionIds.has(a.carries_out));
  const decisionActionLink =
    extraction.actions.length === 0
      ? extraction.decisions.length > 0
        ? 0.8
        : 0.7
      : linked.length / extraction.actions.length;

  return {
    overall: identity * 0.28 + density * 0.27 + timelineHonesty * 0.25 + decisionActionLink * 0.2,
    timelineHonesty,
    memoryDensity: density,
    decisionActionLink,
  };
}

function entryCount(block: MemorySource["blocks"][number] | undefined): number {
  if (!block || !("entries" in block.payload)) return 0;
  return (block.payload.entries as unknown[]).length;
}
