/**
 * Structure detection + hard-stop for section-aware projection.
 */

import { plainContentOf } from "@/import/text/patterns";
import type {
  DetectedSection,
  RawSectionInput,
  SectionAwareProfile,
  SectionRule,
  SemanticSectionId,
} from "./types";

function stripSectionNumbering(heading: string): string {
  return heading
    .replace(/^\s*(?:\d+(?:\.\d+)*|[IVXLC]+)[.)]?\s+/i, "")
    .replace(/^\s*section\s+\d+[.:)]?\s+/i, "")
    .trim();
}

export function matchSectionRule(
  heading: string | null,
  rules: readonly SectionRule[],
): SectionRule | null {
  if (!heading) return null;
  const normalized = stripSectionNumbering(heading);
  for (const rule of rules) {
    if (rule.patterns.some((p) => p.test(normalized) || p.test(heading))) return rule;
  }
  return null;
}

function sectionFullText(section: RawSectionInput): string {
  return section.lines
    .map((l) => plainContentOf(l.text).trim())
    .filter(Boolean)
    .join("\n");
}

function lineRangeOf(section: RawSectionInput): string {
  const first = section.lines[0]?.lineNo;
  const last = section.lines[section.lines.length - 1]?.lineNo ?? first;
  if (first == null) return "source";
  return first === last ? `line ${first}` : `lines ${first}–${last}`;
}

/**
 * Detect semantic sections and enforce the hard-stop rule:
 * stop immediately after `hardStopAfter` (e.g. Conclusion), optionally
 * allowing one follow-up role (e.g. Future Work) before References.
 * Back-matter is never included.
 */
export function detectSemanticSections(
  sections: readonly RawSectionInput[],
  profile: SectionAwareProfile,
): DetectedSection[] {
  const skip = new Set(profile.skipRoles);
  const allowAfter = new Set(profile.allowAfterHardStop);
  const out: DetectedSection[] = [];
  let seenHardStop = false;

  for (const section of sections) {
    const rule = matchSectionRule(section.headingText, profile.sectionRules);
    const id: SemanticSectionId = rule?.id ?? "other";

    if (rule?.backMatter) break; // References / Appendix / Acknowledgements / …

    if (seenHardStop) {
      if (allowAfter.has(id) && !skip.has(id)) {
        const fullText = sectionFullText(section);
        if (fullText.trim()) {
          out.push({
            id,
            heading: section.headingText,
            fullText,
            lineRange: lineRangeOf(section),
          });
        }
      }
      break; // hard stop — nothing after Conclusion (+ optional Future Work)
    }

    if (skip.has(id)) continue;

    const fullText = sectionFullText(section);
    if (!fullText.trim() && !section.headingText) continue;

    // Untitled leading body before first heading → treat as abstract-adjacent "other"
    // only when we have prose; projection hooks decide whether to use it.
    out.push({
      id,
      heading: section.headingText,
      fullText,
      lineRange: lineRangeOf(section),
    });

    if (id === profile.hardStopAfter) seenHardStop = true;
  }

  return out;
}
