import { LIMITS } from "@/domain/memory/limits";
import type { SignalEntry } from "@/domain/memory/schema";
import type { DocumentArchetype } from "./archetype";
import type { Concept } from "./concepts";
import { clampWords, readsAsFragment, sentenceCase, unpunctuated, wordCount } from "./language";
import type { Statement } from "./inference";

/**
 * Hero insights are the local parser's deterministic approximation of an
 * "aha moment": a compact interpretation of why a source sentence matters.
 *
 * They are intentionally disabled for extractive archetypes (resume/invoice),
 * where adding interpretation is worse than preserving the stated fields.
 */
export interface HeroInsight {
  entry: SignalEntry;
  evidence: Statement;
  score: number;
}

const EXTRACTIVE_ARCHETYPES = new Set<DocumentArchetype>(["resume", "invoice"]);

const LEVERAGE = /\b(therefore|so that|because|means|signals|indicates|suggests|points to|drives|unlocks|enables|prevents|avoids|instead of|rather than|but|however|yet|while|although|trade[- ]?off|constraint|root cause|bottleneck|non-negotiable|key|takeaway|insight|lesson|aha|matters)\b/i;
const PRODUCT_PHILOSOPHY = /\b(memory|recall|understand|semantic|source[- ]?linked|evidence|trust|audit|trace|workflow|decision|risk|action|timeline|block|projection|classification|architecture|reliability|failure)\b/i;
const EXTRACTIVE_CHROME = /\b(email|phone|address|invoice\s*(?:no|number|#)|amount due|total|subtotal|tax|gpa|education|experience|skills)\b/i;

export function deriveHeroInsights(input: {
  archetype: DocumentArchetype;
  statements: readonly Statement[];
  concepts: readonly Concept[];
  existingSignals: readonly SignalEntry[];
}): HeroInsight[] {
  if (EXTRACTIVE_ARCHETYPES.has(input.archetype)) return [];

  const ranked = input.statements
    .map((statement) => scoreStatement(statement, input.concepts))
    .filter((candidate): candidate is ScoredStatement => candidate !== null)
    .sort((a, b) => b.score - a.score || a.statement.lineNo - b.statement.lineNo);

  const out: HeroInsight[] = [];
  for (const candidate of ranked) {
    if (out.length >= 3) break;
    const entry = insightEntry(candidate, input.concepts);
    if (!entry) continue;
    if (input.existingSignals.some((s) => overlapsSignal(s, entry))) continue;
    if (out.some((i) => overlapsSignal(i.entry, entry))) continue;
    out.push({ entry, evidence: candidate.statement, score: candidate.score });
  }
  return out;
}

interface ScoredStatement {
  statement: Statement;
  score: number;
}

function scoreStatement(statement: Statement, concepts: readonly Concept[]): ScoredStatement | null {
  const text = unpunctuated(statement.text);
  const words = wordCount(text);
  if (words < 8 || words > 42) return null;
  if (EXTRACTIVE_CHROME.test(text)) return null;
  let score = 0;
  if (LEVERAGE.test(text)) score += 5;
  if (PRODUCT_PHILOSOPHY.test(text)) score += 3;
  if (/\b(?:not|never|without|only|instead|rather than)\b/i.test(text)) score += 2;
  if (/\b(?:fail|failure|risk|core|primary|highest|single|must|cannot)\b/i.test(text)) score += 2;
  score += Math.min(4, concepts.filter((c) => containsPhrase(text, c.phrase)).length);
  if (statement.sectionTitle && /\b(problem|insight|lesson|strategy|architecture|requirement|philosophy|why)\b/i.test(statement.sectionTitle)) {
    score += 2;
  }
  return score >= 6 ? { statement, score } : null;
}

function insightEntry(candidate: ScoredStatement, concepts: readonly Concept[]): SignalEntry | null {
  const text = unpunctuated(candidate.statement.text);
  const theme = concepts.find((c) => containsPhrase(text, c.phrase))?.phrase;
  const label = sentenceCase(clampWords(theme || candidate.statement.sectionTitle || "Hero insight", 8));
  const implication = synthesizeImplication(text);
  if (!implication || readsAsFragment(implication)) return null;
  return {
    label,
    implication: implication.slice(0, LIMITS.maxFieldLength),
  };
}

function synthesizeImplication(text: string): string {
  const clean = sentenceCase(clampWords(text, 26));
  const because = /(.{6,180})\s+because\s+(.{6,180})/i.exec(text);
  if (because) return sentenceCase(`The important part is ${clampWords(because[1]!, 14)}; the reason is ${clampWords(because[2]!, 12)}`);
  const contrast = /(.{6,180})\s+(?:but|however|yet|while|although)\s+(.{6,180})/i.exec(text);
  if (contrast) return sentenceCase(`The aha is the tension: ${clampWords(contrast[1]!, 12)} vs ${clampWords(contrast[2]!, 12)}`);
  const means = /(.{6,180})\s+(?:means|signals|indicates|suggests|points to)\s+(.{6,180})/i.exec(text);
  if (means) return sentenceCase(`${clampWords(means[1]!, 12)} is evidence that ${clampWords(means[2]!, 14)}`);
  return clean;
}

function containsPhrase(text: string, phrase: string): boolean {
  return phrase.length >= 4 && text.toLowerCase().includes(phrase.toLowerCase());
}

function overlapsSignal(a: SignalEntry, b: SignalEntry): boolean {
  const left = `${a.label} ${a.implication ?? ""}`.toLowerCase();
  const right = `${b.label} ${b.implication ?? ""}`.toLowerCase();
  const l = new Set(left.split(/\W+/).filter((w) => w.length > 4));
  const r = right.split(/\W+/).filter((w) => w.length > 4);
  if (l.size === 0 || r.length === 0) return false;
  return r.filter((w) => l.has(w)).length / Math.min(l.size, r.length) >= 0.6;
}
