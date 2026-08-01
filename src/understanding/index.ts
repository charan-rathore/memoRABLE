import type {
  ActionEntry,
  DecisionEntry,
  RiskEntry,
  SignalEntry,
  TimelineEntry,
} from "@/domain/memory/schema";
import { isDecorativeLine, isTableSeparator, plainContentOf, splitListItem } from "@/import/text/patterns";
import { extractConcepts, type Concept } from "./concepts";
import { understandIntent, type Intent } from "./intent";
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
import { dedupeByMeaning, splitSentences, wordCount } from "./language";
import { composeRecall, recallHeading, type Recall } from "./recall";

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
export type { Recall } from "./recall";
export { inferArtifact, inferReadiness } from "./inference";
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
 * The understanding layer.
 *
 * Markdown -> understanding -> distillation -> candidate memories, run before
 * a single line is classified. Classification on raw paragraphs can only ever
 * preserve structure; running it after this stage means the six memories are
 * built from what the document *meant*, and the paragraph it happened to sit
 * in is demoted to provenance, which is all it was ever good for.
 *
 * Everything produced here is conservative by construction. Each candidate
 * carries the exact sentence it was read from, so nothing can enter a memory
 * that was not in the source, and anything unclear is simply not produced.
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
  /** Every distilled sentence, redundancy already removed. */
  statements: Statement[];
  signals: Array<Inferred<InferredSignal>>;
  decisions: Array<Inferred<InferredDecision>>;
  risks: Array<Inferred<InferredRisk>>;
  /** Snapshot heading, drawn from the title. */
  heading: string;
  /** The document's own opening paragraph, for when recall cannot compose. */
  opening: string;
  /** How many source sentences survived distillation. */
  distilled: number;
  /** How many were dropped as restatements of something already kept. */
  redundant: number;
}

export function understand(input: UnderstandingInput): Understanding {
  const headings = input.sections.map((s) => s.headingText).filter((h): h is string => h !== null);
  const sectionLines = input.sections.map((s) => s.lines.map((l) => plainContentOf(l.text)));
  const flatLines = sectionLines.flat().filter((l) => l.trim() !== "");

  const intent = understandIntent({ title: input.title, headings, lines: flatLines });
  const concepts = extractConcepts({ headings, sections: sectionLines });

  const { statements, redundant } = distill(input.sections);

  const signals = dedupeByMeaning(inferSignals(statements, concepts), (s) => s.value.label);
  const decisions = dedupeByMeaning(inferDecisions(statements, intent), (d) => d.value.text);
  const risks = dedupeByMeaning(inferRisks(statements), (r) => r.value.risk);

  return {
    intent,
    concepts,
    statements,
    signals,
    decisions,
    risks,
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
 * Turn source lines into clean, non-repeating statements.
 *
 * Markdown chrome goes first, then each line is split into sentences, then
 * restatements are dropped. Documents restate themselves constantly, in
 * summaries, recaps and closing sections, and a memory system that keeps every
 * copy has recorded the document rather than understood it.
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

  const statements = dedupeByMeaning(raw, (s) => s.text);
  return { statements, redundant: raw.length - statements.length };
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
