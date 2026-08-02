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
    const raw = plainContentOf(line.text).trim();
    if (!raw) continue;
    const list = splitListItem(raw);
    const body = list?.text ?? raw;
    for (const sentence of splitSentences(body)) {
      const s = sentence.replace(/\s+/g, " ").trim();
      if (wordCount(s) < 4) continue;
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
  let s = sentence.trim();
  s = s.replace(META_OPENERS, "").replace(/^[,:\s-]+/, "");
  // "We study whether X" → "Whether X"
  s = s.replace(/^we\s+(?:study|investigate|examine|ask|test)\s+/i, "");
  s = s.replace(/^whether\s+/i, "Whether ");
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
  if (isMetricHeavy(sentence)) {
    // Soften metric dumps into a finding when there is still a claim.
    const soft = sentence
      .replace(/\bwithin\s+\d+(?:\.\d+)?\s*points?\b/gi, "closely")
      .replace(/\bby\s+\d+(?:\.\d+)?%\b/gi, "substantially")
      .replace(/\b\d+(?:\.\d+)?%\b/g, "")
      .replace(/\s{2,}/g, " ")
      .replace(/\s+([,.])/g, "$1")
      .trim();
    if (wordCount(soft) < 6) return null;
    return clamp(soft);
  }
  if (META_OPENERS.test(sentence)) return null;
  return clamp(stripMetaOpener(sentence));
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
  const pool = textsOf(summaries, ["abstract", "introduction", "hypothesis"]);
  const gap = pool.find((s) => GAP_RE.test(s));
  const whether = pool.find((s) => /\bwhether\b/i.test(s) || /\bwe\s+(?:study|investigate|examine|test)\b/i.test(s));
  const hypothesis = textsOf(summaries, ["hypothesis"])[0] ?? pool.find((s) => /\bhypothes/i.test(s));

  const questionCore = whether
    ? stripMetaOpener(whether)
    : gap
      ? stripMetaOpener(gap)
      : pool[0]
        ? stripMetaOpener(pool[0])
        : `What does “${title}” actually establish?`;

  const parts: string[] = [];
  if (gap && whether && gap !== whether) {
    parts.push(clamp(stripMetaOpener(gap), 220));
    parts.push(`The work tests ${clamp(stripMetaOpener(whether).replace(/^Whether\s+/i, "whether "), 220)}`);
  } else {
    parts.push(clamp(questionCore, 320));
  }
  if (hypothesis && hypothesis !== whether && hypothesis !== gap) {
    parts.push(`Hypothesis under test: ${clamp(stripMetaOpener(hypothesis), 220)}`);
  }

  return {
    summary: clamp(parts.join(" "), LIMITS.maxFieldLength),
    problem: gap ? clamp(stripMetaOpener(gap)) : undefined,
    goal: hypothesis ? clamp(stripMetaOpener(hypothesis)) : whether ? clamp(stripMetaOpener(whether)) : undefined,
    hook: clamp(questionCore, 300),
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
  const pool = textsOf(summaries, ["results", "discussion", "conclusion", "abstract"]);
  const findings: TimelineEntry[] = [];
  for (const sentence of pool) {
    if (isTableDump(sentence)) continue;
    if (/^we\s+(?:use|compare|conduct|employ)\b/i.test(sentence)) continue;
    const finding = qualitativeFinding(sentence);
    if (!finding) continue;
    if (isTableDump(finding)) continue;
    if (findings.some((f) => f.title.toLowerCase() === finding.toLowerCase())) continue;
    findings.push({ date: "Finding", title: finding, state: "done" });
    if (findings.length >= LIMITS.maxEntriesPerBlock) break;
  }
  return findings;
}

function inferEvidence(summaries: readonly SectionSummary[]): SignalEntry[] {
  const pool = textsOf(summaries, ["results", "method", "abstract", "hypothesis"]);
  const evidence: SignalEntry[] = [];
  for (const sentence of pool) {
    // Table rows → Evidence metrics (not Findings).
    if (isTableDump(sentence)) {
      for (const entry of extractMetrics(sentence)) {
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
      if (evidence.some((e) => e.label === entry.label && e.value === entry.value)) continue;
      evidence.push(entry);
      if (evidence.length >= LIMITS.maxEntriesPerBlock) return evidence;
    }
    // Dataset / setup facts without percentages still support findings.
    if (/\bdataset\b|\b\d+k[\s-]?token/i.test(sentence) && evidence.length < LIMITS.maxEntriesPerBlock) {
      evidence.push({
        label: "Experimental setup",
        implication: clamp(sentence, 240),
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

  for (const sentence of interpretive) {
    if (isMetricHeavy(sentence)) continue;
    if (isTableDump(sentence)) continue;
    push(sentence);
    if (insights.length >= 4) break;
  }

  // Cross-section synthesis when results support a compute/quality tradeoff story.
  const blob = [...findings.map((f) => f.title), ...textsOf(summaries, ["abstract", "hypothesis", "results"])].join(
    " ",
  );
  if (/\b(latency|compute|inference\s+time|sparse|dense|recall|quality)\b/i.test(blob)) {
    if (/\bsparse\b/i.test(blob) && /\b(recall|quality)\b/i.test(blob) && /\b(latency|compute|time)\b/i.test(blob)) {
      push(
        "The practical win is efficiency under preserved quality — sparsity helps when recall stays near the dense baseline.",
      );
    }
  }
  if (/\b(prompt|few[\s-]?shot|reflection)\b/i.test(blob) && /\b(span|localiz|ground)/i.test(blob)) {
    push("The bottleneck is localization/grounding rather than semantic understanding alone.");
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
