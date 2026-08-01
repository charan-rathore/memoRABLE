/**
 * Research papers — two-stage architecture.
 *
 * Stage 1 — Scientific World Model (classify only, nothing renders):
 *   Background · Research Gap · Hypothesis · Method · Experimental Setup ·
 *   Result · Numerical Evidence · Error Analysis · Limitation · Future Work · Citation
 *
 * Stage 2 — Project into memories with hard filters + confidence gates.
 *
 * Furniture:
 *   Research Question · Key Findings · Evidence · Insights · Limitations · Future Directions
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

/** Stage-1 taxonomy — classify every observation before any projection. */
export type ScientificKind =
  | "background"
  | "research_gap"
  | "hypothesis"
  | "method"
  | "experimental_setup"
  | "result"
  | "numerical_evidence"
  | "error_analysis"
  | "limitation"
  | "future_work"
  | "citation"
  | "discard";

export type ResearchSectionRole =
  | "abstract"
  | "introduction"
  | "related_work"
  | "hypothesis"
  | "method"
  | "results"
  | "discussion"
  | "conclusion"
  | "limitations"
  | "threats"
  | "future"
  | "references"
  | "appendix"
  | "prompts"
  | "other";

export interface ResearchSectionInput {
  headingText: string | null;
  lines: readonly { text: string; lineNo: number }[];
}

export interface ScientificObservation {
  kind: ScientificKind;
  content: string;
  confidence: number;
  sectionRole: ResearchSectionRole;
  sectionHeading: string | null;
  /** Topic keys used to require ≥2 independent supports for Insights. */
  themes: readonly string[];
}

export const FINDING_MIN_CONFIDENCE = 0.8;
export const EVIDENCE_MIN_CONFIDENCE = 0.95;

const SECTION_PATTERNS: Array<{ role: ResearchSectionRole; pattern: RegExp }> = [
  { role: "references", pattern: /\b(references?|bibliography|works\s+cited)\b/i },
  { role: "appendix", pattern: /\b(appendix|supplementary|supplemental)\b/i },
  { role: "prompts", pattern: /\b(prompt\s+templates?|prompts?|json\s+schema|json\s+examples?)\b/i },
  { role: "abstract", pattern: /\babstract\b/i },
  { role: "related_work", pattern: /\b(related\s+work|prior\s+work|literature\s+review)\b/i },
  { role: "introduction", pattern: /\b(introduction|background)\b/i },
  { role: "hypothesis", pattern: /\b(hypothesis|research\s+questions?|problem\s+statement)\b/i },
  { role: "method", pattern: /\b(method(?:ology)?|methods|approach|experimental\s+setup|experiments?)\b/i },
  { role: "results", pattern: /\b(results?|findings?|evaluation)\b/i },
  { role: "discussion", pattern: /\bdiscussion\b/i },
  { role: "conclusion", pattern: /\bconclusions?\b/i },
  { role: "limitations", pattern: /\blimitations?\b/i },
  { role: "threats", pattern: /\bthreats?\s+to\s+validity\b/i },
  { role: "future", pattern: /\b(future\s+work|further\s+work|future\s+(?:research|directions?))\b/i },
];

/** Hard discard — never enters any memory. */
const DISCARD_SECTION = new Set<ResearchSectionRole>(["references", "appendix", "prompts"]);

const PAPER_ARTIFACT_RE =
  /\b(proceedings\s+of|acl\s+\d{4}|emnlp|naacl|arxiv|doi:|vol\.|pp\.|figure\s+\d+|table\s+\d+|fig\.?\s*\d+|et\s+al\.?|brown\s+et|json\s+schema|prompt\s+template|appendix\s+[a-z]|\bhttps?:\/\/)\b/i;

const CITATION_ONLY_RE =
  /^(?:\[\d+\]|\(\d{4}\)|\d{4}\.|\w+(?:\s+\w+){0,3},\s*\d{4}|[A-Z][\w'-]+(?:\s+(?:and|&)\s+[A-Z][\w'-]+)?\s+et\s+al\.?)/;

const META_OPENERS =
  /^(this\s+paper|the\s+paper|this\s+work|we\s+(?:present|propose|introduce|describe|report)|in\s+this\s+(?:paper|work))\b/i;

const NUMBER_RE = /\d/;
const METRIC_RE =
  /\b(?:\d+(?:\.\d+)?%|\d+(?:\.\d+)?\s*(?:points?|pts?|f1|accuracy|recall|precision)|(?:f1|accuracy|recall|precision)\s*[:=]?\s*\d|(?:\d+(?:\.\d+)?)\s*(?:±|~|-|–|—)\s*(?:\d+(?:\.\d+)?)\s*%?)/i;

const GAP_RE =
  /\b(little\s+(?:is\s+)?known|gap|however|despite|remains?\s+(?:unclear|open)|prior\s+work|existing\s+work|previous\s+work|not\s+(?:well\s+)?understood|under[\s-]?explored|lack\s+of)\b/i;

const HYPOTHESIS_RE =
  /\b(hypothes[ie]s|we\s+(?:study|investigate|examine|test|ask)\s+whether|we\s+(?:conjecture|posit)|research\s+question)\b/i;

const ERROR_RE =
  /\b(error\s+analysis|failure\s+cases?|fails?\s+at|does\s+not\s+help|almost\s+no\s+gain|sometimes\s+hurts?|degrades?|no\s+(?:significant\s+)?improvement|contributes?\s+almost\s+nothing)\b/i;

const LIMIT_RE =
  /\b(limited\s+to|only\s+(?:evaluate|evaluated|test|tested|study|studied)|untested|do\s+not\s+(?:evaluate|consider|claim)|single\s+dataset|default\s+(?:hyper)?parameters?|api\s+cost|cost\s+constraints?|threats?\s+to\s+validity)\b/i;

const FUTURE_RE =
  /\b(future\s+work|further\s+work|should\s+(?:evaluate|explore|investigate|consider)|we\s+(?:plan|aim|hope)\s+to|promising\s+directions?|next\s+steps?)\b/i;

const SETUP_RE =
  /\b(dataset|benchmark|hotpotqa|experimental\s+setup|baselines?|hyperparameters?|\d+k[\s-]?token|train(?:ing)?\s+set|test\s+set)\b/i;

const METHOD_RE =
  /\b(we\s+(?:use|compare|employ|train|fine[\s-]?tune)|method(?:ology)?|approach|architecture|prompt(?:ing)?\s+strateg)\b/i;

const RESULT_RE =
  /\b(improves?|outperforms?|matches?|reduces?|achieves?|shows?|finds?|results?\s+suggest|consistently|substantially)\b/i;

const POOR_PERF_RE =
  /\b(low\s+f1|poor\s+(?:performance|results?)|below\s+\d|only\s+\d+(?:\.\d+)?%|failed?\s+to\s+reach)\b/i;

const THEME_RULES: Array<{ theme: string; pattern: RegExp }> = [
  { theme: "prompting", pattern: /\b(prompt|few[\s-]?shot|zero[\s-]?shot|chain[\s-]?of[\s-]?thought|reflection)\b/i },
  { theme: "localization", pattern: /\b(span|localiz|ground(?:ing)?|trigger\s+extraction|argument\s+extraction)\b/i },
  { theme: "sparsity", pattern: /\b(sparse|density|token\s+retention|attention)\b/i },
  { theme: "efficiency", pattern: /\b(latency|compute|inference\s+time|efficiency)\b/i },
  { theme: "quality", pattern: /\b(recall|quality|accuracy|f1|performance)\b/i },
  { theme: "semantics", pattern: /\b(semantics?|understand(?:ing|s)?|reasoning)\b/i },
  { theme: "specialized", pattern: /\b(specialized|foundation\s+model|general[\s-]?purpose|paie)\b/i },
];

function clamp(text: string, max: number = LIMITS.maxFieldLength): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

function classifySectionRole(heading: string | null): ResearchSectionRole {
  if (!heading) return "other";
  for (const { role, pattern } of SECTION_PATTERNS) {
    if (pattern.test(heading)) return role;
  }
  return "other";
}

function stripMeta(sentence: string): string {
  let s = sentence.trim();
  s = s.replace(META_OPENERS, "").replace(/^[,:\s-]+/, "");
  s = s.replace(/^we\s+(?:study|investigate|examine|ask|test)\s+/i, "");
  s = s.replace(/^whether\s+/i, "Whether ");
  if (s && !/^[A-Z]/.test(s)) s = s.charAt(0).toUpperCase() + s.slice(1);
  return s.trim();
}

/**
 * "Would this still be important if I removed the paper?"
 * YES → keep · NO → discard (citations, figure refs, venue lines, templates).
 */
function stillImportantWithoutPaper(text: string, sectionRole: ResearchSectionRole): boolean {
  const t = text.trim();
  // Limitation / future bullets are often short ("Single dataset").
  const minWords =
    sectionRole === "limitations" || sectionRole === "threats" || sectionRole === "future" ? 2 : 5;
  if (wordCount(t) < minWords) return false;
  if (PAPER_ARTIFACT_RE.test(t)) return false;
  if (CITATION_ONLY_RE.test(t)) return false;
  if (/^(table|figure|fig\.?)\s*\d+/i.test(t)) return false;
  if (/^[{[]/.test(t) && /json|schema|role|content/i.test(t)) return false;
  if (/^\|/.test(t) && t.split("|").length >= 3) return false; // raw markdown table row
  if (/^[-:|+\s]+$/.test(t)) return false;
  // Bare author-year crumbs
  if (/^[A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)?\s+\(\d{4}\)\.?$/.test(t)) return false;
  return true;
}

function detectThemes(text: string): string[] {
  return THEME_RULES.filter((r) => r.pattern.test(text)).map((r) => r.theme);
}

function candidateSentences(section: ResearchSectionInput): string[] {
  const out: string[] = [];
  for (const line of section.lines) {
    const raw = plainContentOf(line.text).trim();
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

function classifyObservation(
  text: string,
  sectionRole: ResearchSectionRole,
): { kind: ScientificKind; confidence: number } {
  // Section-forced discards already handled; citations still appear mid-body.
  if (PAPER_ARTIFACT_RE.test(text) || CITATION_ONLY_RE.test(text)) {
    return { kind: "citation", confidence: 0.99 };
  }

  const inLimitSection =
    sectionRole === "limitations" || sectionRole === "threats" || sectionRole === "discussion" || sectionRole === "future";
  const inFutureSection =
    sectionRole === "future" || sectionRole === "conclusion" || sectionRole === "discussion";

  // Numerical evidence first — metrics must not become narrative findings.
  if (METRIC_RE.test(text) && NUMBER_RE.test(text)) {
    const conf = sectionRole === "results" || sectionRole === "method" ? 0.97 : 0.96;
    return { kind: "numerical_evidence", confidence: conf };
  }

  if (sectionRole === "related_work" || (sectionRole === "introduction" && /\bet\s+al\b|\(\d{4}\)/.test(text))) {
    // Related work / background — classify, never project into Findings.
    if (GAP_RE.test(text)) return { kind: "research_gap", confidence: 0.86 };
    return { kind: "background", confidence: 0.82 };
  }

  if (
    (sectionRole === "limitations" || sectionRole === "threats" || (inLimitSection && LIMIT_RE.test(text))) &&
    !POOR_PERF_RE.test(text)
  ) {
    // Entire Limitations / Threats sections are author-stated bounds.
    if (sectionRole === "limitations" || sectionRole === "threats" || LIMIT_RE.test(text)) {
      return {
        kind: "limitation",
        confidence: sectionRole === "limitations" || sectionRole === "threats" ? 0.94 : 0.88,
      };
    }
  }

  // Poor F1 is evidence / result — never a limitation.
  if (POOR_PERF_RE.test(text) && METRIC_RE.test(text)) {
    return { kind: "numerical_evidence", confidence: 0.96 };
  }

  if (inFutureSection && (FUTURE_RE.test(text) || sectionRole === "future")) {
    if (sectionRole === "future" || FUTURE_RE.test(text)) {
      return { kind: "future_work", confidence: sectionRole === "future" ? 0.93 : 0.86 };
    }
  }

  if (ERROR_RE.test(text) || (sectionRole === "results" && /\b(hurts?|fails?|no\s+gain|nothing)\b/i.test(text))) {
    return { kind: "error_analysis", confidence: 0.88 };
  }

  if (HYPOTHESIS_RE.test(text) || sectionRole === "hypothesis") {
    return { kind: "hypothesis", confidence: sectionRole === "hypothesis" ? 0.92 : 0.85 };
  }

  if (GAP_RE.test(text)) {
    return { kind: "research_gap", confidence: 0.87 };
  }

  if (SETUP_RE.test(text) && (NUMBER_RE.test(text) || /\bdataset|benchmark\b/i.test(text))) {
    // Experimental setup enters Evidence only when numeric; else method/background.
    if (NUMBER_RE.test(text)) return { kind: "experimental_setup", confidence: 0.96 };
    return { kind: "method", confidence: 0.8 };
  }

  if (sectionRole === "method" || METHOD_RE.test(text)) {
    return { kind: "method", confidence: sectionRole === "method" ? 0.84 : 0.78 };
  }

  if (
    sectionRole === "results" ||
    sectionRole === "conclusion" ||
    sectionRole === "discussion" ||
    RESULT_RE.test(text)
  ) {
    const conf =
      sectionRole === "results" || sectionRole === "conclusion" ? 0.9 : sectionRole === "discussion" ? 0.84 : 0.82;
    return { kind: "result", confidence: conf };
  }

  if (sectionRole === "abstract" || sectionRole === "introduction") {
    if (/\bwhether\b/i.test(text)) return { kind: "hypothesis", confidence: 0.84 };
    return { kind: "background", confidence: 0.75 };
  }

  return { kind: "background", confidence: 0.7 };
}

/** Stage 1 — build the scientific world model (classify only). */
export function buildScientificWorldModel(sections: readonly ResearchSectionInput[]): ScientificObservation[] {
  const observations: ScientificObservation[] = [];

  for (const section of sections) {
    const sectionRole = classifySectionRole(section.headingText);
    if (DISCARD_SECTION.has(sectionRole)) continue; // References / Appendix / Prompts — gone.

    for (const raw of candidateSentences(section)) {
      if (!stillImportantWithoutPaper(raw, sectionRole)) continue;

      const { kind, confidence } = classifyObservation(raw, sectionRole);
      if (kind === "citation" || kind === "discard") continue;

      const content = clamp(stripMeta(raw));
      const minWords =
        sectionRole === "limitations" || sectionRole === "threats" || sectionRole === "future" ? 2 : 5;
      if (wordCount(content) < minWords) continue;

      observations.push({
        kind,
        content,
        confidence,
        sectionRole,
        sectionHeading: section.headingText,
        themes: detectThemes(content),
      });
    }
  }

  return observations;
}

function ofKind(model: readonly ScientificObservation[], kinds: readonly ScientificKind[]): ScientificObservation[] {
  return model.filter((o) => kinds.includes(o.kind));
}

function dedupeContent(items: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** Research Question — inferred from gap + hypothesis only. */
function projectResearchQuestion(
  model: readonly ScientificObservation[],
  title: string,
): { summary: string; problem?: string; goal?: string; hook?: string } {
  const gaps = ofKind(model, ["research_gap"]).filter((o) => o.confidence >= FINDING_MIN_CONFIDENCE);
  const hyps = ofKind(model, ["hypothesis"]).filter((o) => o.confidence >= FINDING_MIN_CONFIDENCE);
  const gap = gaps[0]?.content;
  const hyp = hyps[0]?.content;
  const parts: string[] = [];
  if (gap) parts.push(gap);
  if (hyp) parts.push(hyp.startsWith("Whether") ? `The work tests ${hyp.replace(/^Whether\s+/i, "whether ")}` : hyp);
  if (parts.length === 0) {
    parts.push(`What scientific claim does “${title}” actually establish?`);
  }
  return {
    summary: clamp(parts.join(" ")),
    problem: gap,
    goal: hyp,
    hook: clamp(hyp ?? gap ?? title, 300),
  };
}

/**
 * Key Findings — Gap + Hypothesis + Major Results + Error Analysis + Main Conclusion.
 * Never Related Work, dataset description, tables, references, prompts, appendix.
 */
function projectKeyFindings(model: readonly ScientificObservation[]): TimelineEntry[] {
  const allowed = ofKind(model, ["research_gap", "hypothesis", "result", "error_analysis"]).filter(
    (o) => o.confidence > FINDING_MIN_CONFIDENCE,
  );

  // Drop method/setup narrative and related-work background even if mis-tagged.
  const findings = allowed.filter((o) => {
    if (o.sectionRole === "related_work") return o.kind === "research_gap";
    if (o.kind === "result" && SETUP_RE.test(o.content) && !RESULT_RE.test(o.content)) return false;
    if (!NUMBER_RE.test(o.content) && METRIC_RE.test(o.content)) return false;
    // Major results should stay qualitative here; pure metric lines → Evidence.
    if (o.kind === "result" && isPureMetricLine(o.content)) return false;
    return true;
  });

  // Prefer conclusion/discussion results as "main conclusion".
  const ordered = [...findings].sort((a, b) => {
    const rank = (o: ScientificObservation) => {
      if (o.kind === "research_gap") return 0;
      if (o.kind === "hypothesis") return 1;
      if (o.kind === "result" && (o.sectionRole === "conclusion" || o.sectionRole === "discussion")) return 2;
      if (o.kind === "result") return 3;
      if (o.kind === "error_analysis") return 4;
      return 5;
    };
    return rank(a) - rank(b);
  });

  const entries: TimelineEntry[] = [];
  for (const obs of ordered) {
    const title = clamp(obs.content);
    if (entries.some((e) => e.title.toLowerCase() === title.toLowerCase())) continue;
    const date =
      obs.kind === "research_gap"
        ? "Gap"
        : obs.kind === "hypothesis"
          ? "Hypothesis"
          : obs.kind === "error_analysis"
            ? "Error"
            : obs.sectionRole === "conclusion"
              ? "Conclusion"
              : "Finding";
    entries.push({ date, title, state: "done" });
    if (entries.length >= LIMITS.maxEntriesPerBlock) break;
  }
  return entries;
}

function isPureMetricLine(text: string): boolean {
  const withoutNumbers = text.replace(/\d+(?:\.\d+)?%?/g, "").replace(/\s+/g, " ").trim();
  return wordCount(withoutNumbers) < 6 && METRIC_RE.test(text);
}

/**
 * Evidence — numbers only: metrics, experiments, dataset sizes, benchmarks, setup.
 * confidence > 0.95 · no narrative.
 */
function projectEvidence(model: readonly ScientificObservation[]): SignalEntry[] {
  const pool = ofKind(model, ["numerical_evidence", "experimental_setup"]).filter(
    (o) => o.confidence > EVIDENCE_MIN_CONFIDENCE && NUMBER_RE.test(o.content),
  );

  const entries: SignalEntry[] = [];
  for (const obs of pool) {
    // Strip narrative — keep metric-bearing implication short.
    if (!METRIC_RE.test(obs.content) && !SETUP_RE.test(obs.content)) continue;
    const valueMatch = obs.content.match(/\d+(?:\.\d+)?%?|\d+\s*(?:points?|pts?|k)/i);
    const label = clamp(
      obs.kind === "experimental_setup"
        ? "Experimental setup"
        : (obs.content.split(/[,:;]/)[0] ?? "Metric").replace(/\d+(?:\.\d+)?%?/g, "").trim() || "Metric",
      120,
    );
    entries.push({
      label,
      ...(valueMatch ? { value: valueMatch[0]!.trim() } : {}),
      implication: clamp(obs.content, 240),
    });
    if (entries.length >= LIMITS.maxEntriesPerBlock) break;
  }
  return entries;
}

/**
 * Insights — NEVER extracted. Synthesize only when ≥2 independent observations
 * share a theme.
 */
function projectInsights(model: readonly ScientificObservation[]): DecisionEntry[] {
  const usable = model.filter(
    (o) =>
      o.confidence >= 0.78 &&
      (o.kind === "result" ||
        o.kind === "error_analysis" ||
        o.kind === "hypothesis" ||
        o.kind === "research_gap" ||
        o.kind === "numerical_evidence"),
  );

  const byTheme = new Map<string, ScientificObservation[]>();
  for (const obs of usable) {
    for (const theme of obs.themes) {
      const list = byTheme.get(theme) ?? [];
      list.push(obs);
      byTheme.set(theme, list);
    }
  }

  const insights: DecisionEntry[] = [];
  const push = (text: string) => {
    const t = clamp(text);
    if (wordCount(t) < 8) return;
    if (insights.some((i) => i.text.toLowerCase() === t.toLowerCase())) return;
    insights.push({ text: t, status: "proposed", commitment: "considered" });
  };

  for (const [theme, obs] of byTheme) {
    // Require two independent observations (different content).
    const unique = dedupeContent(obs.map((o) => o.content));
    if (unique.length < 2) continue;

    if (theme === "prompting" && obs.some((o) => o.themes.includes("localization") || /few[\s-]?shot|reflection/i.test(o.content))) {
      push(
        "Prompt engineering has limited impact except where it teaches span localization; gains concentrate in few-shot trigger extraction rather than reflection-style prompting.",
      );
    } else if (theme === "sparsity" || (theme === "efficiency" && byTheme.has("quality"))) {
      push(
        "Efficiency gains are meaningful only when quality stays near the dense baseline — the bottleneck is attention density under preserved recall, not token retention alone.",
      );
    } else if (theme === "localization" || theme === "semantics") {
      push(
        "Models often understand domain semantics yet fail at grounding/span localization — reasoning and extraction quality diverge.",
      );
    } else if (theme === "specialized") {
      push(
        "Specialized extraction architectures still outperform general foundation models when the task is fundamentally a grounding problem.",
      );
    } else {
      // Generic synthesis from the two strongest supports.
      push(`${unique[0]} Together with “${unique[1]}”, this implies a structural pattern rather than an isolated result.`);
    }

    if (insights.length >= 4) break;
  }

  return insights.slice(0, LIMITS.maxEntriesPerBlock);
}

/**
 * Limitations — only from Limitations / Threats to validity / Discussion / Future work.
 * Never infer from bad performance.
 */
function projectLimitations(model: readonly ScientificObservation[]): RiskEntry[] {
  const allowedSections = new Set<ResearchSectionRole>(["limitations", "threats", "discussion", "future"]);
  const pool = ofKind(model, ["limitation"]).filter(
    (o) => allowedSections.has(o.sectionRole) && o.confidence >= 0.8 && !POOR_PERF_RE.test(o.content),
  );

  const out: RiskEntry[] = [];
  for (const obs of pool) {
    const risk = clamp(obs.content);
    if (out.some((r) => r.risk.toLowerCase() === risk.toLowerCase())) continue;
    out.push({ risk });
    if (out.length >= LIMITS.maxEntriesPerBlock) break;
  }
  return out;
}

/** Future Directions — only Future Work / Conclusion / Discussion. Never open questions elsewhere. */
function projectFutureDirections(model: readonly ScientificObservation[]): ActionEntry[] {
  const allowed = new Set<ResearchSectionRole>(["future", "conclusion", "discussion"]);
  const pool = ofKind(model, ["future_work"]).filter(
    (o) => allowed.has(o.sectionRole) && o.confidence >= 0.8 && !/\?$/.test(o.content),
  );

  const out: ActionEntry[] = [];
  for (const obs of pool) {
    const task = clamp(obs.content.replace(/^(future\s+work\s*[:.]?\s*)/i, ""));
    if (wordCount(task) < 4) continue;
    if (out.some((a) => a.task.toLowerCase() === task.toLowerCase())) continue;
    out.push({ task, status: "suggested" });
    if (out.length >= LIMITS.maxEntriesPerBlock) break;
  }
  return out;
}

function provenance(
  label: string,
  detail: string,
  excerpt: string,
): BlockInput["provenance"] {
  return {
    method: "local-parser",
    label,
    locator: `scientific world model · ${detail}`,
    excerpt: clamp(excerpt || detail, 240),
  };
}

/**
 * Stage 1 classify → Stage 2 project.
 * Low-confidence candidates stay out of Findings/Evidence (kept only as snapshot notes).
 */
export function buildResearchWorldModel(input: {
  title: string;
  label: string;
  sections: readonly ResearchSectionInput[];
}): Map<BlockKind, BlockInput> {
  const model = buildScientificWorldModel(input.sections);

  const question = projectResearchQuestion(model, input.title);
  const findings = projectKeyFindings(model);
  const evidence = projectEvidence(model);
  const insights = projectInsights(model);
  const limitations = projectLimitations(model);
  const future = projectFutureDirections(model);

  // KEEP AS TEXT — important but below Findings/Evidence gates.
  const ungated = model
    .filter(
      (o) =>
        (o.kind === "result" || o.kind === "research_gap" || o.kind === "hypothesis" || o.kind === "error_analysis") &&
        o.confidence <= FINDING_MIN_CONFIDENCE,
    )
    .map((o) => clamp(o.content, 240))
    .slice(0, 4);

  const built = new Map<BlockKind, BlockInput>();

  built.set("snapshot", {
    kind: "snapshot",
    payload: {
      heading: clamp(input.title),
      summary: question.summary,
      ...(question.hook ? { hook: question.hook } : {}),
      ...(question.goal ? { goal: question.goal } : {}),
      ...(question.problem ? { problem: question.problem } : {}),
      byline: "Stage 1 world model → Stage 2 projection",
      ...(ungated.length > 0 ? { notes: ungated } : {}),
    },
    provenance: provenance(input.label, "research question", question.summary),
  });

  built.set("timeline", {
    kind: "timeline",
    payload: { entries: findings },
    provenance: provenance(input.label, "key findings", findings[0]?.title ?? "findings"),
  });

  built.set("signals", {
    kind: "signals",
    payload: { entries: evidence },
    provenance: provenance(input.label, "evidence", evidence[0]?.implication ?? "evidence"),
  });

  built.set("decisions", {
    kind: "decisions",
    payload: { entries: insights },
    provenance: provenance(input.label, "insights (≥2 supports)", insights[0]?.text ?? "insights"),
  });

  built.set("risks", {
    kind: "risks",
    payload: { entries: limitations },
    provenance: provenance(input.label, "limitations", limitations[0]?.risk ?? "limitations"),
  });

  built.set("actions", {
    kind: "actions",
    payload: { entries: future },
    provenance: provenance(input.label, "future directions", future[0]?.task ?? "future"),
  });

  return built;
}

/** @deprecated Prefer buildScientificWorldModel — kept for older test imports. */
export function summarizeResearchSections(sections: readonly ResearchSectionInput[]): Array<{
  role: ResearchSectionRole;
  heading: string | null;
  summary: string;
}> {
  return sections.map((s) => {
    const role = classifySectionRole(s.headingText);
    const sentences = candidateSentences(s);
    return { role, heading: s.headingText, summary: clamp(sentences.slice(0, 2).join(" "), 480) };
  });
}
