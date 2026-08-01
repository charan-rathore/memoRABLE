/**
 * Whole-section reasoning — read the entire section, build one coherent
 * representation. Never emit half-sentences or chunk fragments.
 */

import { splitListItem } from "@/import/text/patterns";
import { splitSentences, wordCount } from "../language";
import { passesShortClaimGate, passesTextQualityGate, PRESERVED_PREFIX } from "./quality";
import type { DetectedSection, DocumentWorldModel, SectionUnderstanding } from "./types";

const METRIC_RE =
  /\b(?:\d+(?:\.\d+)?%|\d+(?:\.\d+)?\s*(?:points?|pts?|f1|accuracy|recall|precision)|(?:f1|accuracy|recall|precision)\s*[:=]?\s*\d|\d+k[\s-]?token)/i;

const META_OPENERS =
  /^(this\s+paper|the\s+paper|this\s+work|we\s+(?:present|propose|introduce|describe|report)|in\s+this\s+(?:paper|work))\b/i;

function clamp(text: string, max = 2000): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

function stripMeta(sentence: string): string {
  let s = sentence.trim();
  s = s.replace(META_OPENERS, "").replace(/^[,:\s-]+/, "");
  s = s.replace(/^we\s+(?:study|investigate|examine|ask|test)\s+/i, "");
  s = s.replace(/^whether\s+/i, "Whether ");
  if (s && !/^[A-Z]/.test(s)) s = s.charAt(0).toUpperCase() + s.slice(1);
  return s.trim();
}

function sentencesFromSection(fullText: string): string[] {
  const out: string[] = [];
  for (const line of fullText.split("\n")) {
    const raw = line.trim();
    if (!raw) continue;
    const list = splitListItem(raw);
    const body = list?.text ?? raw;
    for (const sentence of splitSentences(body)) {
      const s = sentence.replace(/\s+/g, " ").trim();
      if (s) out.push(s);
    }
  }
  return out;
}

/**
 * Understand one complete section. Quality failures go to `preserved`, not memories.
 */
export function understandSection(section: DetectedSection): {
  understanding: SectionUnderstanding;
  preserved: string[];
} {
  const preserved: string[] = [];
  const claims: string[] = [];
  const metrics: string[] = [];
  const summaryParts: string[] = [];

  for (const raw of sentencesFromSection(section.fullText)) {
    const cleaned = stripMeta(raw);
    const isMetric = METRIC_RE.test(cleaned) && /\d/.test(cleaned);
    const shortOk =
      (section.id === "limitations" || section.id === "future_work") && passesShortClaimGate(cleaned);

    if (!passesTextQualityGate(cleaned) && !shortOk) {
      if (wordCount(cleaned) >= 4 && /[A-Za-z]{3,}/.test(cleaned)) {
        preserved.push(`${PRESERVED_PREFIX}: ${clamp(cleaned, 240)}`);
      }
      continue;
    }

    if (isMetric) {
      metrics.push(clamp(cleaned, 320));
      continue;
    }

    const claim = clamp(cleaned);
    if (wordCount(claim) < 5 && !shortOk) continue;
    claims.push(claim);
    if (summaryParts.length < 4) summaryParts.push(claim);
  }

  return {
    understanding: {
      id: section.id,
      heading: section.heading,
      summary: clamp(summaryParts.join(" ")),
      claims,
      metrics,
      lineRange: section.lineRange,
    },
    preserved,
  };
}

/** Build the full world model before any memory projection. */
export function buildWorldModel(
  title: string,
  sections: readonly DetectedSection[],
): DocumentWorldModel {
  const understandings: SectionUnderstanding[] = [];
  const preservedFromSource: string[] = [];
  const byId = new Map<string, SectionUnderstanding>();

  for (const section of sections) {
    const { understanding, preserved } = understandSection(section);
    understandings.push(understanding);
    preservedFromSource.push(...preserved.slice(0, 3));
    // Last writer wins for duplicate roles (e.g. two Results blocks) — merge claims.
    const existing = byId.get(understanding.id);
    if (existing) {
      byId.set(understanding.id, {
        ...existing,
        summary: clamp([existing.summary, understanding.summary].filter(Boolean).join(" ")),
        claims: [...existing.claims, ...understanding.claims],
        metrics: [...existing.metrics, ...understanding.metrics],
      });
    } else {
      byId.set(understanding.id, understanding);
    }
  }

  return {
    title,
    sections: understandings,
    byId,
    preservedFromSource: preservedFromSource.slice(0, 8),
  };
}

export function claimsFrom(
  model: DocumentWorldModel,
  ids: readonly string[],
): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const section = model.byId.get(id);
    if (!section) continue;
    for (const claim of section.claims) out.push(claim);
  }
  return out;
}

export function metricsFrom(
  model: DocumentWorldModel,
  ids: readonly string[],
): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const section = model.byId.get(id);
    if (!section) continue;
    for (const metric of section.metrics) out.push(metric);
  }
  return out;
}
