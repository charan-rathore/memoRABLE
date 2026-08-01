/**
 * Research projection v2 — thin facade over the section-aware framework.
 *
 * Does not touch the Universal Cognitive Engine, archetype detection, or
 * Resume / Invoice / Generic Knowledge projections.
 *
 * Pipeline:
 *   Detect structure → Identify semantic sections (hard-stop after Conclusion)
 *   → Whole-section understanding → World model → Memory projection
 */

import type { BlockInput } from "@/domain/memory/normalize";
import type { BlockKind } from "@/domain/memory/schema";
import {
  RESEARCH_SECTION_PROFILE,
  detectSemanticSections,
  runSectionAwareProjection,
  type RawSectionInput,
} from "./section-aware";

export type ResearchSectionInput = RawSectionInput;

/** @deprecated Prefer SemanticSectionId via section-aware profiles. */
export type ResearchSectionRole =
  | "abstract"
  | "introduction"
  | "hypothesis"
  | "method"
  | "results"
  | "discussion"
  | "conclusion"
  | "limitations"
  | "future"
  | "references"
  | "other";

export function buildResearchWorldModel(input: {
  title: string;
  label: string;
  sections: readonly ResearchSectionInput[];
}): Map<BlockKind, BlockInput> {
  return runSectionAwareProjection({
    title: input.title,
    label: input.label,
    sections: input.sections,
    profile: RESEARCH_SECTION_PROFILE,
  });
}

/** Test helper — section detection with Research hard-stop rules. */
export function summarizeResearchSections(sections: readonly ResearchSectionInput[]): Array<{
  role: string;
  heading: string | null;
  summary: string;
}> {
  const detected = detectSemanticSections(sections, RESEARCH_SECTION_PROFILE);
  return detected.map((s) => ({
    role: s.id,
    heading: s.heading,
    summary: s.fullText.slice(0, 480).replace(/\s+/g, " ").trim(),
  }));
}
