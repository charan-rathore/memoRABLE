/**
 * Section-aware projection framework — shared by Research and future
 * document archetypes (legal papers, whitepapers, RFCs, …).
 *
 * Pipeline:
 *   Detect structure → Identify semantic sections → Understand each section
 *   → Build world model → Project memories
 */

import type { BlockInput } from "@/domain/memory/normalize";
import type { BlockKind } from "@/domain/memory/schema";

/** Stable section id used by projection profiles (not paper-specific numbering). */
export type SemanticSectionId = string;

export interface SectionRule {
  id: SemanticSectionId;
  /** Heading matchers — ignore numbering ("3 Methodology", "Method", …). */
  patterns: readonly RegExp[];
  /** When true, this role is back-matter and triggers the hard stop. */
  backMatter?: boolean;
}

export interface RawSectionInput {
  headingText: string | null;
  lines: readonly { text: string; lineNo: number }[];
}

export interface DetectedSection {
  id: SemanticSectionId;
  heading: string | null;
  /** Full section body — never a partial chunk. */
  fullText: string;
  lineRange: string;
}

/** Whole-section understanding (concept-level, not chunk-level). */
export interface SectionUnderstanding {
  id: SemanticSectionId;
  heading: string | null;
  /** Coherent multi-sentence digest of the whole section. */
  summary: string;
  /** Quality-gated claims extracted from the section. */
  claims: readonly string[];
  /** Numeric / experimental evidence lines. */
  metrics: readonly string[];
  lineRange: string;
}

/** Complete document world model — built before any memory is emitted. */
export interface DocumentWorldModel {
  title: string;
  sections: readonly SectionUnderstanding[];
  byId: ReadonlyMap<SemanticSectionId, SectionUnderstanding>;
  /** Quality-failed text kept honestly instead of corrupted memories. */
  preservedFromSource: readonly string[];
}

export interface MemoryProjectionHooks {
  researchQuestion(model: DocumentWorldModel): {
    summary: string;
    problem?: string;
    goal?: string;
    hook?: string;
  };
  keyFindings(model: DocumentWorldModel): readonly string[];
  evidence(model: DocumentWorldModel): readonly { label: string; value?: string; implication: string }[];
  insights(model: DocumentWorldModel): readonly string[];
  limitations(model: DocumentWorldModel): readonly string[];
  futureWork(model: DocumentWorldModel): readonly string[];
}

/**
 * Configurable profile — Research today; Legal / Whitepaper / RFC later
 * by swapping rules + hooks without touching the cognitive engine.
 */
export interface SectionAwareProfile {
  id: string;
  label: string;
  sectionRules: readonly SectionRule[];
  /**
   * After this section id is seen, only `allowAfterHardStop` roles may follow
   * (and only before back-matter). Then extraction stops.
   */
  hardStopAfter: SemanticSectionId;
  /** Roles still accepted after the hard-stop section (e.g. future_work). */
  allowAfterHardStop: readonly SemanticSectionId[];
  /** Roles never included in the world model even before the stop. */
  skipRoles: readonly SemanticSectionId[];
  project: MemoryProjectionHooks;
  /** Map projected content onto universal BlockKinds. */
  toBlocks(
    projected: ProjectedMemories,
    meta: { title: string; label: string },
  ): Map<BlockKind, BlockInput>;
}

export interface ProjectedMemories {
  researchQuestion: {
    summary: string;
    problem?: string;
    goal?: string;
    hook?: string;
  };
  keyFindings: readonly string[];
  evidence: readonly { label: string; value?: string; implication: string }[];
  insights: readonly string[];
  limitations: readonly string[];
  futureWork: readonly string[];
  preservedFromSource: readonly string[];
}
