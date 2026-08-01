export type {
  DetectedSection,
  DocumentWorldModel,
  ProjectedMemories,
  RawSectionInput,
  SectionAwareProfile,
  SectionRule,
  SectionUnderstanding,
  SemanticSectionId,
} from "./types";
export { detectSemanticSections, matchSectionRule } from "./detect";
export { passesShortClaimGate, passesTextQualityGate, PRESERVED_PREFIX } from "./quality";
export { buildWorldModel, claimsFrom, metricsFrom, understandSection } from "./understand";
export { runSectionAwareProjection } from "./run";
export { RESEARCH_SECTION_PROFILE } from "./profiles/research";
