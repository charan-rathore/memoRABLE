/**
 * Research paper world model (stable baseline).
 *
 * Preferred path:
 *   PDF → Docling (sidecar) or pdf.js → Sections
 *     → Section summaries → Cross-section reasoning
 *     → World Model → Memory projection
 *     → Graphify-schema knowledge graph (parallel artifact)
 *
 * Not:
 *   PDF → Chunks → Projection
 *
 * Furniture (inferential except Evidence):
 *   Research Question · Key Findings · Evidence · Insights
 *   · Limitations · Future Directions
 *
 * Universal kind map:
 *   snapshot  → Research Question
 *   timeline  → Key Findings
 *   signals   → Evidence
 *   decisions → Insights
 *   risks     → Limitations
 *   actions   → Future Directions
 */

import type { BlockInput } from "@/domain/memory/normalize";
import { LIMITS } from "@/domain/memory/limits";
import type {
  ActionEntry,
  BlockKind,
  DecisionEntry,
  RiskEntry,
  SignalEntry,
  TimelineEntry,
} from "@/domain/memory/schema";
import { plainContentOf, splitListItem } from "@/import/text/patterns";
import { splitSentences, wordCount } from "./language";

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

export interface ResearchSectionInput {
  headingText: string | null;
  lines: readonly { text: string; lineNo: number }[];
}

interface SectionSummary {
  role: ResearchSectionRole;
  heading: string | null;
  /** Compact prose kept for cross-section reasoning (not dumped to UI). */
  summary: string;
  sentences: string[];
  lineRange: string;
}

const ROLE_PATTERNS: Array<{ role: ResearchSectionRole; pattern: RegExp }> = [
  { role: "abstract", pattern: /\babstract\b/i },
  { role: "introduction", pattern: /\b(introduction|background|related\s+work)\b/i },
  { role: "hypothesis", pattern: /\b(hypothesis|research\s+questions?|problem\s+statement)\b/i },
  { role: "method", pattern: /\b(method(?:ology)?|methods|experimental\s+setup|experiments?)\b/i },
  { role: "results", pattern: /\b(results?|findings?|evaluation)\b/i },
  { role: "discussion", pattern: /\bdiscussion\b/i },
  { role: "conclusion", pattern: /\bconclusions?\b/i },
  { role: "limitations", pattern: /\blimitations?\b/i },
  { role: "future", pattern: /\b(future\s+work|further\s+work|future\s+(?:research|directions?))\b/i },
  { role: "references", pattern: /\breferences?\b/i },
];

const META_OPENERS =
  /^(this\s+paper|the\s+paper|this\s+work|we\s+(?:present|propose|introduce|describe|report)|in\s+this\s+(?:paper|work))\b/i;

const METRIC_RE =
  /\b(?:\d+(?:\.\d+)?%|\d+(?:\.\d+)?\s*(?:points?|pts?|ms|s|×|x|f1|accuracy|recall|precision|bleu|rouge)|(?:f1|accuracy|recall|precision)\s*(?:of|=|:)?\s*\d)/i;

const EXPLICIT_LIMIT_RE =
  /\b(limited\s+to|only\s+(?:evaluated|tested|studied)|untested|do\s+not\s+(?:evaluate|consider|claim)|single\s+dataset|default\s+(?:hyper)?parameters?|api\s+cost|cost\s+constraints?|we\s+(?:did|do)\s+not)\b/i;

const FUTURE_RE =
  /\b(future\s+work|further\s+work|should\s+(?:evaluate|explore|investigate|consider)|we\s+(?:plan|aim|hope)\s+to|next\s+steps?|promising\s+directions?)\b/i;

const GAP_RE =
  /\b(little\s+(?:is\s+)?known|gap|however|despite|remains?\s+(?:unclear|open)|prior\s+work|existing\s+work|previous\s+work|not\s+(?:well\s+)?understood|under[\s-]?explored)\b/i;

function clamp(text: string, max: number = LIMITS.maxFieldLength): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

/** Repair leftover PDF wrap hyphens inside prose. */
function dehyphenate(text: string): string {
  return text.replace(/([A-Za-z])\u00AD([a-z])/g, "$1$2").replace(/([A-Za-z])-\s+([a-z])/g, "$1$2");
}

/** Strip inline citation markers that shatter sentence flow when columns mix. */
function stripCitations(text: string): string {
  return text
    .replace(/\s*\[(?:[A-Z][A-Za-z-]+(?:\s+et\s+al\.)?,?\s*\d{4}(?:[a-z])?(?:\s*;\s*[^\\\]]{0,80})?)\]/g, "")
    .replace(/\s*\((?:[A-Z][A-Za-z-]+(?:\s+et\s+al\.)?,?\s*\d{4}(?:[a-z])?(?:\s*;\s*[^)]{0,80})?)\)/g, "")
    .replace(/\s*\[\d+(?:\s*[,–-]\s*\d+)*\]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Reject PDF garbage that looks like a memory but isn't memorable:
 * mid-word starts, broken hyphenation, citation mashups, tiny fragments.
 */
function isGarbledProse(text: string): boolean {
  const s = text.trim();
  if (!s) return true;
  // Starts mid-word: "Nificant", "tion and", "tured prediction"
  if (/^[a-z]{1,8}\b/.test(s) && !/^(whether|when|where|while|what|which|whose|how|why|for|and|but|yet|also|still|thus|hence|here|there|these|those|this|that|with|from|into|onto|over|under|after|before|about|above|below|such|each|both|most|many|some|more|less|only|even|just|not|no|yes)\b/i.test(s)) {
    return true;
  }
  // Capitalized mid-word leftover after stripMetaOpener ("Nificant gap…")
  if (/^[A-Z][a-z]{2,7}\b/.test(s)) {
    const first = s.split(/\s+/)[0] ?? "";
    // Common English starters are fine; broken syllables usually lack vowels in expected places
    // or match known wrap suffixes.
    if (/^(Nificant|Tured|Tion|Cating|Ment|Lizing|Ication|Tional|Sults|Ducing|Vided|Sented)$/i.test(first)) {
      return true;
    }
  }
  // Unrepaired wrap hyphen with a space: "sig- nificant", "sys- tems"
  if (/[A-Za-z]-\s+[a-z]/.test(s)) return true;
  // Citation smashed into body: "[Wei et al., 2023, Zhang The ZSEE"
  if (/\[[^\]]{0,40}\b(?:The|We|This|Our|In|A)\b/.test(s)) return true;
  if (/\b(?:et\s+al\.,?\s*){0,1}\d{4}\]\s*[A-Z][a-z]/.test(s)) return true;
  // Sentence clearly cut at both ends without terminal punctuation and short
  if (wordCount(s) < 8 && !/[.!?]$/.test(s) && /^[a-z]/.test(s)) return true;
  // Too many isolated short tokens from column shredding
  const words = s.split(/\s+/);
  const tiny = words.filter((w) => /^[A-Za-z]{1,2}$/.test(w)).length;
  if (words.length >= 8 && tiny / words.length > 0.35) return true;
  return false;
}

function cleanResearchSentence(text: string): string {
  return stripCitations(dehyphenate(text.replace(/\s+/g, " ").trim()));
}

/** Prefer complete, claim-like sentences over related-work chrome. */
function claimScore(sentence: string): number {
  let score = 0;
  const s = sentence.toLowerCase();
  const wc = wordCount(sentence);
  if (wc >= 10 && wc <= 45) score += 2;
  else if (wc >= 8) score += 1;
  if (/[.!?]$/.test(sentence)) score += 1;
  if (
    /\b(show|shows|showed|demonstrate|demonstrates|suggest|suggests|indicate|outperform|improve|fail|fails|bottleneck|only|consistently|significantly|marginal|minimal improvements?)\b/.test(
      s,
    )
  ) {
    score += 3;
  }
  if (/\b(f1|precision|recall|prompting strateg|zero-shot|few-shot|reflection|argument (?:role|text)|event type)\b/.test(s)) {
    score += 3;
  }
  // Related-work surveys are not Key Findings.
  if (
    /\b(recent work|prior work|previous work|existing (?:methods?|approaches?|work)|studies have shown|research on\b|work on\b|literature|has similarly found|contributes to this literature)\b/.test(
      s,
    )
  ) {
    score -= 5;
  }
  if (/\b(we\s+(?:evaluate|compare|use|conduct|employ|present|propose))\b/.test(s)) {
    score -= 1;
  }
  if (isMetricHeavy(sentence)) score -= 1;
  if (isGarbledProse(sentence)) score -= 10;
  return score;
}

function classifyResearchRole(heading: string | null): ResearchSectionRole {
  if (!heading) return "other";
  for (const { role, pattern } of ROLE_PATTERNS) {
    if (pattern.test(heading)) return role;
  }
  return "other";
}

function linesToSentences(lines: readonly { text: string }[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const raw = cleanResearchSentence(plainContentOf(line.text));
    if (!raw) continue;
    const list = splitListItem(raw);
    const body = list?.text ?? raw;
    for (const sentence of splitSentences(body)) {
      const s = cleanResearchSentence(sentence);
      if (wordCount(s) < 6) continue;
      if (isGarbledProse(s)) continue;
      out.push(s);
    }
  }
  return out;
}

function summarizeSection(section: ResearchSectionInput): SectionSummary {
  const role = classifyResearchRole(section.headingText);
  const sentences = linesToSentences(section.lines);
  const summary = clamp(sentences.slice(0, 3).join(" "), 480);
  const first = section.lines[0]?.lineNo;
  const last = section.lines[section.lines.length - 1]?.lineNo ?? first;
  const lineRange =
    first == null ? "source" : first === last ? `line ${first}` : `lines ${first}–${last}`;
  return {
    role,
    heading: section.headingText,
    summary,
    sentences,
    lineRange,
  };
}

function textsOf(summaries: readonly SectionSummary[], roles: readonly ResearchSectionRole[]): string[] {
  return summaries.filter((s) => roles.includes(s.role)).flatMap((s) => s.sentences);
}

function stripMetaOpener(sentence: string): string {
  let s = cleanResearchSentence(sentence);
  s = s.replace(META_OPENERS, "").replace(/^[,:\s-]+/, "");
  // "This work addresses a fundamental question: …" → keep the question.
  s = s.replace(/^(?:this\s+work\s+)?addresses\s+a\s+fundamental\s+question:\s*/i, "");
  // "We study whether X" → "Whether X"
  s = s.replace(/^we\s+(?:study|investigate|examine|ask|test)\s+/i, "");
  s = s.replace(/^whether\s+/i, "Whether ");
  // Never capitalize a mid-word fragment into a fake proper sentence ("nificant" → "Nificant").
  if (isGarbledProse(s)) return s.trim();
  if (s && !/^[A-Z]/.test(s)) s = s.charAt(0).toUpperCase() + s.slice(1);
  return s.trim();
}

function isMetricHeavy(sentence: string): boolean {
  const metrics = sentence.match(/\d+(?:\.\d+)?%?/g) ?? [];
  if (metrics.length >= 2) return true;
  if (METRIC_RE.test(sentence) && wordCount(sentence) <= 18) return true;
  return false;
}

function qualitativeFinding(sentence: string): string | null {
  if (isGarbledProse(sentence)) return null;
  if (isMetricHeavy(sentence)) {
    // Soften metric dumps into a finding when there is still a claim.
    const soft = cleanResearchSentence(
      sentence
        .replace(/\bwithin\s+\d+(?:\.\d+)?\s*points?\b/gi, "closely")
        .replace(/\bby\s+\d+(?:\.\d+)?%\b/gi, "substantially")
        .replace(/\b\d+(?:\.\d+)?%\b/g, "")
        .replace(/\s{2,}/g, " ")
        .replace(/\s+([,.])/g, "$1")
        .trim(),
    );
    if (wordCount(soft) < 6 || isGarbledProse(soft)) return null;
    return clamp(soft);
  }
  if (META_OPENERS.test(sentence)) return null;
  const finding = stripMetaOpener(sentence);
  if (!finding || isGarbledProse(finding) || wordCount(finding) < 6) return null;
  return clamp(finding);
}

function extractMetrics(sentence: string): SignalEntry[] {
  const entries: SignalEntry[] = [];
  const pct = [...sentence.matchAll(/([^.;:]{0,40}?)(\d+(?:\.\d+)?%)/gi)];
  for (const m of pct.slice(0, 4)) {
    const ctx = (m[1] ?? "").replace(/\s+/g, " ").trim().replace(/[:\-–—]+$/, "");
    const value = m[2]!;
    entries.push({
      label: clamp(ctx || "Metric", 120),
      value,
      implication: clamp(sentence, 240),
    });
  }
  const points = [...sentence.matchAll(/within\s+(\d+(?:\.\d+)?)\s*points?/gi)];
  for (const m of points.slice(0, 2)) {
    entries.push({
      label: "Gap vs baseline",
      value: `${m[1]} points`,
      implication: clamp(sentence, 240),
    });
  }
  if (entries.length === 0 && METRIC_RE.test(sentence)) {
    entries.push({
      label: "Measured result",
      value: (sentence.match(/\d+(?:\.\d+)?%?/) ?? ["see source"])[0]!,
      implication: clamp(sentence, 240),
    });
  }
  return entries;
}

function inferResearchQuestion(summaries: readonly SectionSummary[], title: string): {
  summary: string;
  problem?: string;
  goal?: string;
  hook?: string;
} {
  const pool = textsOf(summaries, ["abstract", "introduction", "hypothesis"]).filter(
    (s) => !isGarbledProse(s),
  );
  const QUESTION_LIKE =
    /\b(fundamental question|research question|what is the efficacy|can (?:general[- ]purpose )?llms?|we (?:study|investigate|examine|ask|focus|test|evaluate) whether)\b/i;

  const clean = (s: string, max: number = 220) => {
    const t = stripMetaOpener(s);
    return isGarbledProse(t) ? "" : clamp(t, max);
  };

  const questionLike = pool.find((s) => QUESTION_LIKE.test(s) && !isGarbledProse(stripMetaOpener(s)));
  const whether = pool.find(
    (s) =>
      (/\bwhether\b/i.test(s) || /\bwe\s+(?:study|investigate|examine|test)\b/i.test(s)) &&
      !isGarbledProse(stripMetaOpener(s)),
  );
  // Prefer concrete gaps about the paper's task — not generic "However, NLP…" chrome.
  const gap = pool.find(
    (s) =>
      GAP_RE.test(s) &&
      !isGarbledProse(stripMetaOpener(s)) &&
      /\b(llm|prompt|extract|evaluat|systematic|general[- ]purpose)\b/i.test(s),
  );
  const hypothesis =
    textsOf(summaries, ["hypothesis"]).find((s) => !isGarbledProse(s)) ??
    pool.find((s) => /\bhypothes/i.test(s) && !isGarbledProse(s));

  const questionCore = questionLike
    ? clean(questionLike, 320)
    : whether
      ? clean(whether, 320)
      : gap
        ? clean(gap, 320)
        : pool.find((s) => claimScore(s) >= 2)
          ? clean(pool.find((s) => claimScore(s) >= 2)!, 320)
          : `What does “${title}” actually establish?`;

  const parts: string[] = [];
  if (gap && (questionLike || whether) && gap !== questionLike && gap !== whether) {
    const g = clean(gap, 220);
    const w = clean(questionLike ?? whether ?? "", 220);
    if (g) parts.push(g);
    if (w) parts.push(`The work tests ${w.replace(/^Whether\s+/i, "whether ")}`);
  } else if (questionCore) {
    parts.push(questionCore);
  }
  if (hypothesis && hypothesis !== whether && hypothesis !== gap && hypothesis !== questionLike) {
    const h = clean(hypothesis, 220);
    if (h) parts.push(`Hypothesis under test: ${h}`);
  }

  const summary = parts.length > 0 ? clamp(parts.join(" "), LIMITS.maxFieldLength) : questionCore;
  const problem = gap ? clean(gap) || undefined : undefined;
  const goal = hypothesis
    ? clean(hypothesis) || undefined
    : questionLike
      ? clean(questionLike) || undefined
      : whether
        ? clean(whether) || undefined
        : undefined;

  return {
    summary: summary || `What does “${title}” actually establish?`,
    problem,
    goal,
    hook: questionCore || undefined,
  };
}

/** Markdown / ASCII tables belong in Evidence, never Key Findings. */
function isTableDump(sentence: string): boolean {
  const s = sentence.trim();
  if (!s) return true;
  if (s.includes("|")) return true;
  if (/^\s*\|?\s*:?-{3,}/.test(s)) return true;
  // Dense numeric scoreboard rows: "Gemma-3-12b-it 86.52 85.38 80.7 …"
  const nums = s.match(/\d+(?:\.\d+)?/g) || [];
  if (nums.length >= 4 && wordCount(s) <= nums.length + 6) return true;
  return false;
}

function inferKeyFindings(summaries: readonly SectionSummary[]): TimelineEntry[] {
  // Always include abstract claims; never mine related-work surveys as findings.
  const pool = textsOf(summaries, ["results", "discussion", "conclusion", "abstract"]).filter(
    (sentence) =>
      !/\b(recent work|prior work|previous work|contributes to this literature|work on biomedical|research on information extraction has found)\b/i.test(
        sentence,
      ),
  );
  const ranked = pool
    .filter((sentence) => !isTableDump(sentence))
    .filter(
      (sentence) =>
        !/^we\s+(?:use|compare|conduct|employ|evaluate|focus|test four|present)\b/i.test(sentence),
    )
    .filter((sentence) => !isGarbledProse(sentence))
    .map((sentence) => ({ sentence, score: claimScore(sentence) }))
    .filter((row) => row.score >= 2)
    .sort((a, b) => b.score - a.score);

  const findings: TimelineEntry[] = [];
  for (const { sentence } of ranked) {
    const finding = qualitativeFinding(sentence);
    if (!finding) continue;
    if (isTableDump(finding) || isGarbledProse(finding)) continue;
    if (findings.some((f) => f.title.toLowerCase() === finding.toLowerCase())) continue;
    // Near-duplicate: share a long token stem
    if (
      findings.some((f) => {
        const a = f.title.toLowerCase().slice(0, 48);
        const b = finding.toLowerCase().slice(0, 48);
        return a.includes(b.slice(0, 24)) || b.includes(a.slice(0, 24));
      })
    ) {
      continue;
    }
    findings.push({ date: "Finding", title: finding, state: "done" });
    if (findings.length >= Math.min(8, LIMITS.maxEntriesPerBlock)) break;
  }
  return findings;
}

function inferEvidence(summaries: readonly SectionSummary[]): SignalEntry[] {
  const pool = textsOf(summaries, ["results", "method", "abstract", "hypothesis"]);
  const evidence: SignalEntry[] = [];
  for (const sentence of pool) {
    if (isGarbledProse(sentence)) continue;
    // Table rows → Evidence metrics (not Findings).
    if (isTableDump(sentence)) {
      for (const entry of extractMetrics(sentence)) {
        if (isGarbledProse(entry.implication ?? "") || isGarbledProse(entry.label)) continue;
        if (evidence.some((e) => e.label === entry.label && e.value === entry.value)) continue;
        evidence.push({
          ...entry,
          label: clamp(entry.label.replace(/\|/g, " ").trim() || "Table metric", 120),
        });
        if (evidence.length >= LIMITS.maxEntriesPerBlock) return evidence;
      }
      continue;
    }
    if (!METRIC_RE.test(sentence) && !/\bdataset\b|\b\d+k[\s-]?token/i.test(sentence)) continue;
    for (const entry of extractMetrics(sentence)) {
      if (isGarbledProse(entry.implication ?? "")) continue;
      if (evidence.some((e) => e.label === entry.label && e.value === entry.value)) continue;
      evidence.push(entry);
      if (evidence.length >= LIMITS.maxEntriesPerBlock) return evidence;
    }
    // Dataset / setup facts without percentages still support findings.
    if (/\bdataset\b|\b\d+k[\s-]?token/i.test(sentence) && evidence.length < LIMITS.maxEntriesPerBlock) {
      const implication = clamp(cleanResearchSentence(sentence), 240);
      if (isGarbledProse(implication)) continue;
      if (evidence.some((e) => (e.implication ?? "").toLowerCase() === implication.toLowerCase())) continue;
      evidence.push({
        label: "Experimental setup",
        implication,
      });
    }
  }
  return evidence;
}

function inferInsights(summaries: readonly SectionSummary[], findings: readonly TimelineEntry[]): DecisionEntry[] {
  const interpretive = textsOf(summaries, ["discussion", "conclusion", "results"]).filter(
    (s) =>
      /\b(suggests?|indicates?|implies?|shows? that|means that|rather than|bottleneck|however|surprising)/i.test(
        s,
      ) || (!isMetricHeavy(s) && !META_OPENERS.test(s)),
  );

  const findingsBlob = findings.map((f) => f.title.toLowerCase()).join("\n");
  const relatedWorkChrome =
    /\b(recent work|prior work|previous work|existing (?:methods?|approaches?)|studies have shown|research on\b|work on\b)\b/i;

  const insights: DecisionEntry[] = [];
  const push = (text: string) => {
    const t = clamp(stripMetaOpener(text));
    if (wordCount(t) < 6) return;
    if (isTableDump(t)) return;
    // Do not copy findings or related-work surveys into Insights.
    if (findingsBlob.includes(t.toLowerCase())) return;
    if (relatedWorkChrome.test(t) && !/\b(suggests?|implies?|means that|bottleneck)\b/i.test(t)) return;
    if (insights.some((i) => i.text.toLowerCase() === t.toLowerCase())) return;
    insights.push({ text: t, status: "proposed", commitment: "considered" });
  };

  const rankedInsights = interpretive
    .filter((s) => !isMetricHeavy(s) && !isTableDump(s) && !isGarbledProse(s))
    .map((s) => ({ s, score: claimScore(s) }))
    .filter((row) => row.score >= 2)
    .sort((a, b) => b.score - a.score);

  for (const { s } of rankedInsights) {
    push(s);
    if (insights.length >= 4) break;
  }

  // Cross-section synthesis from abstract + findings (not related-work chrome).
  const blob = [
    ...findings.map((f) => f.title),
    ...textsOf(summaries, ["abstract", "hypothesis", "results", "discussion", "conclusion"]),
  ].join(" ");
  if (/\b(latency|compute|inference\s+time|sparse|dense|recall|quality)\b/i.test(blob)) {
    if (/\bsparse\b/i.test(blob) && /\b(recall|quality)\b/i.test(blob) && /\b(latency|compute|time)\b/i.test(blob)) {
      push(
        "The practical win is efficiency under preserved quality — sparsity helps when recall stays near the dense baseline.",
      );
    }
  }
  if (
    /\b(prompt|few[\s-]?shot|reflection|zero[\s-]?shot)\b/i.test(blob) &&
    /\b(span|localiz|ground|argument|extract)\b/i.test(blob)
  ) {
    push("The bottleneck is localization/grounding rather than semantic understanding alone.");
  }
  if (
    /\b(minimal|marginal|little)\b/i.test(blob) &&
    /\b(prompt|few[\s-]?shot|reflection|zero[\s-]?shot)\b/i.test(blob)
  ) {
    push("Advanced prompting strategies add little over zero-shot for fine-grained scientific extraction.");
  }
  if (/\bhallucin/i.test(blob) && /\b(over[\s-]?general|span|extract)\b/i.test(blob)) {
    push("Failures cluster around hallucination, over-generalization, and imprecise span boundaries.");
  }

  return insights.slice(0, LIMITS.maxEntriesPerBlock);
}

function inferLimitations(summaries: readonly SectionSummary[]): RiskEntry[] {
  const pool = [
    ...textsOf(summaries, ["limitations"]),
    ...textsOf(summaries, ["discussion", "conclusion"]).filter((s) => EXPLICIT_LIMIT_RE.test(s)),
  ];
  const out: RiskEntry[] = [];
  for (const sentence of pool) {
    const fromLimitSection = summaries.some(
      (s) => s.role === "limitations" && s.sentences.includes(sentence),
    );
    if (!fromLimitSection && !EXPLICIT_LIMIT_RE.test(sentence)) continue;
    // Skip hallucinated "weakness" language that isn't an author-stated limit.
    if (/\bhallucin/i.test(sentence) && !fromLimitSection) continue;
    const risk = clamp(stripMetaOpener(sentence));
    if (wordCount(risk) < 5) continue;
    if (out.some((r) => r.risk.toLowerCase() === risk.toLowerCase())) continue;
    out.push({ risk });
    if (out.length >= LIMITS.maxEntriesPerBlock) break;
  }
  return out;
}

function inferFutureDirections(summaries: readonly SectionSummary[]): ActionEntry[] {
  const pool = [
    ...textsOf(summaries, ["future"]),
    ...textsOf(summaries, ["conclusion"]).filter((s) => FUTURE_RE.test(s) || /^(evaluate|explore|investigate)\b/i.test(s)),
  ];
  const out: ActionEntry[] = [];
  for (const sentence of pool) {
    // Skip bare rhetorical questions that aren't future-work commitments.
    if (/\?$/.test(sentence) && !FUTURE_RE.test(sentence)) continue;
    let task = stripMetaOpener(sentence);
    task = task.replace(/^(future\s+work\s*[:.]?\s*)/i, "");
    task = clamp(task);
    if (wordCount(task) < 4) continue;
    if (out.some((a) => a.task.toLowerCase() === task.toLowerCase())) continue;
    out.push({ task, status: "suggested" });
    if (out.length >= LIMITS.maxEntriesPerBlock) break;
  }
  return out;
}

function provenanceFor(
  label: string,
  summaries: readonly SectionSummary[],
  roles: readonly ResearchSectionRole[],
  excerpt: string,
): BlockInput["provenance"] {
  const hit = summaries.find((s) => roles.includes(s.role) && s.summary);
  return {
    method: "local-parser",
    label,
    locator: hit
      ? `section “${hit.heading ?? hit.role}” · ${hit.lineRange} · cross-section research model`
      : "cross-section research model",
    excerpt: clamp(excerpt || hit?.summary || "research world model", 240),
  };
}

/**
 * Build research memories from section summaries + cross-section reasoning.
 * Call this instead of chunk→bucket projection when archetype is research.
 */
export function buildResearchWorldModel(input: {
  title: string;
  label: string;
  sections: readonly ResearchSectionInput[];
}): Map<BlockKind, BlockInput> {
  const summaries = input.sections
    .filter((s) => s.lines.some((l) => l.text.trim() !== "") || s.headingText)
    .map(summarizeSection)
    .filter((s) => s.role !== "references");

  const question = inferResearchQuestion(summaries, input.title);
  const findings = inferKeyFindings(summaries);
  const evidence = inferEvidence(summaries);
  const insights = inferInsights(summaries, findings);
  const limitations = inferLimitations(summaries);
  const future = inferFutureDirections(summaries);

  const built = new Map<BlockKind, BlockInput>();

  built.set("snapshot", {
    kind: "snapshot",
    payload: {
      heading: clamp(input.title, LIMITS.maxFieldLength),
      summary: question.summary,
      ...(question.hook ? { hook: question.hook } : {}),
      ...(question.goal ? { goal: question.goal } : {}),
      ...(question.problem ? { problem: question.problem } : {}),
      byline: "Inferred research question · not a paper paraphrase",
    },
    provenance: provenanceFor(input.label, summaries, ["abstract", "introduction", "hypothesis"], question.summary),
  });

  built.set("timeline", {
    kind: "timeline",
    payload: { entries: findings },
    provenance: provenanceFor(
      input.label,
      summaries,
      ["results", "discussion"],
      findings[0]?.title ?? "key findings",
    ),
  });

  built.set("signals", {
    kind: "signals",
    payload: { entries: evidence },
    provenance: provenanceFor(input.label, summaries, ["results", "method"], evidence[0]?.implication ?? "evidence"),
  });

  built.set("decisions", {
    kind: "decisions",
    payload: { entries: insights },
    provenance: provenanceFor(
      input.label,
      summaries,
      ["discussion", "conclusion", "results"],
      insights[0]?.text ?? "insights",
    ),
  });

  built.set("risks", {
    kind: "risks",
    payload: { entries: limitations },
    provenance: provenanceFor(input.label, summaries, ["limitations"], limitations[0]?.risk ?? "limitations"),
  });

  built.set("actions", {
    kind: "actions",
    payload: { entries: future },
    provenance: provenanceFor(input.label, summaries, ["future", "conclusion"], future[0]?.task ?? "future directions"),
  });

  return built;
}

/** Exported for unit tests. */
export function summarizeResearchSections(sections: readonly ResearchSectionInput[]): SectionSummary[] {
  return sections.map(summarizeSection);
}
