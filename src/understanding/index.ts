import type {
  ActionEntry,
  DecisionEntry,
  RiskEntry,
  SignalEntry,
  TimelineEntry,
} from "@/domain/memory/schema";
import { isDecorativeLine, isTableSeparator, plainContentOf, splitListItem } from "@/import/text/patterns";
import { classifyArchetype, type ArchetypeResult } from "./archetype";
import { extractConcepts, type Concept } from "./concepts";
import { understandIntent, type Intent } from "./intent";
import { deriveHeroInsights, type HeroInsight } from "./insights";
import {
  inferDecisions,
  inferRisks,
  inferSignals,
  type Inferred,
  type InferredDecision,
  type InferredRisk,
  type InferredSignal,
  type Statement,
} from "./inference";
import {
  inferActions,
  inferTimeline,
  type InferredAction,
  type InferredTimeline,
} from "./infer-events";
import { dedupeByMeaning, normalizeKey, splitSentences, wordCount } from "./language";
import { composeRecall, recallHeading, type Recall } from "./recall";
import { findAnchorDate, type AnchorDate } from "./temporal";

export type { Concept } from "./concepts";
export type { Intent, DocumentIntent } from "./intent";
export type {
  Inferred,
  InferredArtifact,
  InferredDecision,
  InferredRisk,
  InferredSignal,
  Statement,
} from "./inference";
export type { InferredAction, InferredTimeline } from "./infer-events";
export type { Recall } from "./recall";
export type { ArchetypeResult, DocumentArchetype } from "./archetype";
export type { AnchorDate } from "./temporal";
export {
  ARCHETYPE_CONFIDENCE_THRESHOLD,
  MIN_MARGIN,
  MIN_SCORE,
  classifyArchetype,
} from "./archetype";
export type { ArchetypeScores } from "./archetype";
export { buildResearchWorldModel, summarizeResearchSections } from "./research";
export type { ResearchSectionInput, ResearchSectionRole } from "./research";
export {
  buildResearchKnowledgeGraph,
  mergeKnowledgeGraphs,
} from "./knowledge-graph";
export {
  applyProjectionTitles,
  bucketLabel,
  bucketSubtitle,
  isEmptyMemoryPayload,
  isKindApplicable,
  isKindRequired,
  isNotApplicableBlock,
  memoryProjectionFor,
  NOT_APPLICABLE_NOTE,
  projectAdaptiveMemories,
  projectionProfileFor,
  type AdaptiveMemoryProjection,
  type BucketView,
  type EmptyApplicablePolicy,
  type ProjectionProfile,
} from "./projection-profiles";
export { findAnchorDate, gateTimelineEntries } from "./temporal";
export {
  allowSlideDecision,
  blocksDecisionInference,
  harvestSingleLegLine,
  projectSingleLegTimeline,
  shouldProjectInvoiceDueToTimeline,
  strongestCategory,
} from "./projection";
export { inferArtifact, inferReadiness } from "./inference";
export { inferActions, inferTimeline } from "./infer-events";
export { buildRelations, relationsFor, relationsFrom, relationsTo, parseRef } from "./graph";
export { recallHeading } from "./recall";
export {
  hybridSegment,
  buildDocumentGraph,
  type SemanticSegment,
  type SegmentDocument,
  type DocumentGraph,
  type GraphNode,
} from "./segment";

/**
 * The understanding layer (primary extraction signal).
 *
 * Markdown -> distill -> infer (signals/decisions/risks/timeline/actions) ->
 * structural parsers enrich and win on same-line authority.
 *
 * Structure preserves the author's filing; understanding recovers meaning from
 * prose that no heading announced. Each candidate carries the exact sentence
 * it was read from — no sentence, no memory.
 */

export interface UnderstandingSection {
  headingText: string | null;
  lines: ReadonlyArray<{ text: string; lineNo: number }>;
}

export interface UnderstandingInput {
  title: string;
  sections: readonly UnderstandingSection[];
}

export interface Understanding {
  intent: Intent;
  concepts: Concept[];
  /** Archetype steers timeline honesty (v6 Phase A.2). */
  archetype: ArchetypeResult;
  /** Temporal anchor for resolving relative dates (v6 Phase A.1). */
  anchor: AnchorDate;
  /** Every distilled sentence, redundancy already removed. */
  statements: Statement[];
  signals: Array<Inferred<InferredSignal>>;
  decisions: Array<Inferred<InferredDecision>>;
  risks: Array<Inferred<InferredRisk>>;
  /** Calendar / ordinal / mid-sentence temporal candidates. */
  timeline: Array<Inferred<InferredTimeline>>;
  /** Outstanding work / todos inferred from prose. */
  actions: Array<Inferred<InferredAction>>;
  /** Hero/aha moments synthesized from evidence for non-extractive docs. */
  heroInsights: HeroInsight[];
  /** Snapshot heading, drawn from the title. */
  heading: string;
  /** The document's own opening paragraph, for when recall cannot compose. */
  opening: string;
  /** How many source sentences survived distillation. */
  distilled: number;
  /** How many were dropped as restatements of something already kept. */
  redundant: number;
}

export function understand(input: UnderstandingInput & { sourceLabel?: string }): Understanding {
  const headings = input.sections.map((s) => s.headingText).filter((h): h is string => h !== null);
  const sectionLines = input.sections.map((s) => s.lines.map((l) => plainContentOf(l.text)));
  const flatLines = sectionLines.flat().filter((l) => l.trim() !== "");
  const bodySample = flatLines.slice(0, 80).join("\n");

  const intent = understandIntent({ title: input.title, headings, lines: flatLines });
  const concepts = extractConcepts({ headings, sections: sectionLines });
  const archetype = classifyArchetype({ title: input.title, headings, bodySample });
  const anchor = findAnchorDate(`${input.title}\n${bodySample}`, input.sourceLabel);

  const { statements, redundant } = distill(input.sections);

  const signals = dedupeByMeaning(inferSignals(statements, concepts), (s) => s.value.label);
  const decisions = dedupeByMeaning(
    inferDecisions(statements, intent, archetype.archetype),
    (d) => d.value.text,
  );
  const risks = dedupeByMeaning(inferRisks(statements), (r) => r.value.risk);
  // Timeline/Actions are first-class understanding outputs — not structure-only.
  const timeline =
    archetype.timelineMode === "none"
      ? []
      : dedupeByMeaning(inferTimeline(statements), (t) => `${t.value.date} ${t.value.title}`);
  const actions = dedupeByMeaning(inferActions(statements), (a) => a.value.task);
  const heroInsights = deriveHeroInsights({
    archetype: archetype.archetype,
    statements,
    concepts,
    existingSignals: signals.map((s) => s.value),
  });

  return {
    intent,
    concepts,
    archetype,
    anchor,
    statements,
    signals,
    decisions,
    risks,
    timeline,
    actions,
    heroInsights,
    heading: recallHeading(input.title, intent),
    opening: firstProseParagraph(input.sections),
    distilled: statements.length,
    redundant,
  };
}

/**
 * Say the finished memories back as one paragraph a person would speak.
 *
 * Called after the other five blocks exist, because a snapshot that frames
 * everything has to have seen everything first.
 */
export function recallFrom(
  understanding: Understanding,
  memories: {
    signals: readonly SignalEntry[];
    decisions: readonly DecisionEntry[];
    risks: readonly RiskEntry[];
    timeline: readonly TimelineEntry[];
    actions: readonly ActionEntry[];
  },
): Recall {
  return composeRecall({
    intent: understanding.intent,
    concepts: understanding.concepts,
    ...memories,
    fallback: understanding.opening,
  });
}

/* ------------------------------- distillation ------------------------------ */

/** Sentences shorter than this carry no reading worth inferring from. */
const MIN_STATEMENT_WORDS = 3;
/** Sentences longer than this are usually a whole paragraph run together. */
const MAX_STATEMENT_WORDS = 60;

/**
 * Turn source lines into statements for projection.
 *
 * Order matters: extract ALL observations first (exact duplicates only), then
 * project into buckets, then compress *inside* each bucket. Meaning-dedupe
 * before routing merges a User Story with a Decision that share vocabulary —
 * different cognitive categories that must stay distinct.
 */
function distill(sections: readonly UnderstandingSection[]): {
  statements: Statement[];
  redundant: number;
} {
  const raw: Statement[] = [];

  for (const section of sections) {
    for (const line of section.lines) {
      const text = line.text;
      if (text.trim() === "") continue;
      if (isDecorativeLine(text) || isTableSeparator(text)) continue;
      const listItem = splitListItem(text) !== null;
      const content = plainContentOf(text);
      if (content.trim() === "") continue;

      for (const sentence of splitSentences(content)) {
        const words = wordCount(sentence);
        if (words < MIN_STATEMENT_WORDS || words > MAX_STATEMENT_WORDS) continue;
        raw.push({
          text: sentence,
          sectionTitle: section.headingText,
          lineNo: line.lineNo,
          listItem,
        });
      }
    }
  }

  const statements = dedupeExact(raw, (s) => s.text);
  return { statements, redundant: raw.length - statements.length };
}

/** Exact-key dedupe only — never merge near-paraphrases across categories. */
function dedupeExact<T>(items: readonly T[], textOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  const kept: T[] = [];
  for (const item of items) {
    const key = normalizeKey(textOf(item));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    kept.push(item);
  }
  return kept;
}

/** The document's own first real paragraph, used only when composition fails. */
function firstProseParagraph(sections: readonly UnderstandingSection[]): string {
  for (const section of sections) {
    const prose: string[] = [];
    for (const line of section.lines) {
      const text = line.text;
      if (text.trim() === "") {
        if (prose.length > 0) break;
        continue;
      }
      if (splitListItem(text) || isTableSeparator(text) || isDecorativeLine(text)) {
        if (prose.length > 0) break;
        continue;
      }
      prose.push(plainContentOf(text));
    }
    const joined = prose.join(" ").trim();
    if (wordCount(joined) >= 3) return joined;
  }
  return "";
}
