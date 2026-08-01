/**
 * Generic section-aware projection runner.
 *
 * Detect → Understand sections → World model → Project memories.
 * Profiles (Research, later Legal / RFC / …) supply rules + hooks only.
 */

import type { BlockInput } from "@/domain/memory/normalize";
import type { BlockKind } from "@/domain/memory/schema";
import { detectSemanticSections } from "./detect";
import { buildWorldModel } from "./understand";
import type { ProjectedMemories, RawSectionInput, SectionAwareProfile } from "./types";

export function runSectionAwareProjection(input: {
  title: string;
  label: string;
  sections: readonly RawSectionInput[];
  profile: SectionAwareProfile;
}): Map<BlockKind, BlockInput> {
  const detected = detectSemanticSections(input.sections, input.profile);
  const worldModel = buildWorldModel(input.title, detected);

  const projected: ProjectedMemories = {
    researchQuestion: input.profile.project.researchQuestion(worldModel),
    keyFindings: input.profile.project.keyFindings(worldModel),
    evidence: input.profile.project.evidence(worldModel),
    insights: input.profile.project.insights(worldModel),
    limitations: input.profile.project.limitations(worldModel),
    futureWork: input.profile.project.futureWork(worldModel),
    preservedFromSource: worldModel.preservedFromSource,
  };

  return input.profile.toBlocks(projected, { title: input.title, label: input.label });
}
