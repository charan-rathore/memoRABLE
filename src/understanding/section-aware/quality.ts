/**
 * Text quality gate — reject corrupted / citation / incomplete candidates
 * before they become memories. Prefer PRESERVED FROM SOURCE over bad semantics.
 */

import { wordCount } from "../language";

const OCR_CORRUPTION =
  /\b(?:[a-z]{1,2}[A-Z]{2,}[a-z]+|[A-Z]{5,}|[^\s]{40,}|ﬁ|ﬂ|\uFFFD|�)\b|(\w)\1{4,}/;

const BROKEN_WORD = /\b[a-z]+-\s*$/i;

const CITATION_ONLY =
  /^(?:\[\d+\]|\(\d{4}\)|\d{4}\.?|[A-Z][\w'-]+(?:\s+(?:and|&)\s+[A-Z][\w'-]+)?\s+et\s+al\.?|[A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)?\s+\(\d{4}\)\.?)/;

const PAPER_ARTIFACT =
  /\b(proceedings\s+of|acl\s+\d{4}|emnlp|naacl|arxiv|doi:|vol\.|pp\.|https?:\/\/|prompt\s+template|json\s+schema)\b/i;

const TABLE_HEADER_ONLY = /^(?:table\s+\d+|figure\s+\d+|fig\.?\s*\d+)(?:[:.]|$)/i;

const INCOMPLETE =
  /^(?:and|or|but|the|of|to|in|for|with|as|by)\b/i;

/** True when the candidate is safe to emit as a semantic memory. */
export function passesTextQualityGate(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (wordCount(t) < 5) return false;
  if (!/[.!?]$/.test(t) && wordCount(t) < 8 && !/\d/.test(t)) {
    // Allow metric fragments with digits; otherwise require a complete thought.
    if (!/[A-Za-z].*[A-Za-z]/.test(t)) return false;
  }
  if (OCR_CORRUPTION.test(t)) return false;
  if (BROKEN_WORD.test(t)) return false;
  if (CITATION_ONLY.test(t)) return false;
  if (PAPER_ARTIFACT.test(t)) return false;
  if (TABLE_HEADER_ONLY.test(t)) return false;
  if (INCOMPLETE.test(t) && wordCount(t) < 8) return false;
  if (/^\|/.test(t) && t.split("|").length >= 3) return false;
  if (/^[-:|+\s]+$/.test(t)) return false;
  // Truncated mid-word / dangling hyphenation from OCR wraps
  if (/\b[a-z]{2,}-[a-z]{1,2}\b/i.test(t) && wordCount(t) < 10) return false;
  return true;
}

/** Softer gate for short explicit limitation / future-work bullets. */
export function passesShortClaimGate(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (wordCount(t) < 2) return false;
  if (CITATION_ONLY.test(t) || PAPER_ARTIFACT.test(t) || TABLE_HEADER_ONLY.test(t)) return false;
  if (OCR_CORRUPTION.test(t)) return false;
  return true;
}

export const PRESERVED_PREFIX = "PRESERVED FROM SOURCE";
