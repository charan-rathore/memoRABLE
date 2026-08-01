/**
 * Research projection profile v2 — configurable section rules + memory hooks.
 * Other archetypes can copy this shape with different rules/hooks.
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
import { wordCount } from "../../language";
import { PRESERVED_PREFIX } from "../quality";
import { claimsFrom, metricsFrom } from "../understand";
import type {
  DocumentWorldModel,
  ProjectedMemories,
  SectionAwareProfile,
  SectionRule,
} from "../types";

const RULES: readonly SectionRule[] = [
  { id: "abstract", patterns: [/\babstract\b/i] },
  {
    id: "introduction",
    patterns: [/\bintroduction\b/i, /\bbackground\b/i],
  },
  {
    id: "related_work",
    patterns: [/\brelated\s+work\b/i, /\bliterature\s+review\b/i, /\bprior\s+work\b/i],
  },
  {
    id: "method",
    patterns: [
      /\bmethod(?:ology)?\b/i,
      /\bmethods\b/i,
      /\bapproach\b/i,
      /\bexperimental\s+procedure\b/i,
    ],
  },
  {
    id: "experimental_setup",
    patterns: [
      /\bexperimental\s+setup\b/i,
      /\bexperiment(?:s)?\b/i,
      /\bdatasets?\b/i,
      /\bbechmarks?\b/i,
      /\bevaluation\s+setup\b/i,
    ],
  },
  {
    id: "results",
    patterns: [/\bresults?\b/i, /\bfindings?\b/i, /\bevaluation\b/i],
  },
  { id: "discussion", patterns: [/\bdiscussion\b/i] },
  {
    id: "limitations",
    patterns: [/\blimitations?\b/i, /\bthreats?\s+to\s+validity\b/i],
  },
  { id: "conclusion", patterns: [/\bconclusions?\b/i] },
  {
    id: "future_work",
    patterns: [
      /\bfuture\s+work\b/i,
      /\bfurther\s+work\b/i,
      /\bfuture\s+(?:research|directions?)\b/i,
    ],
  },
  // Back-matter — hard stop / never knowledge
  { id: "references", patterns: [/\breferences?\b/i, /\bbibliography\b/i, /\bworks\s+cited\b/i], backMatter: true },
  {
    id: "appendix",
    patterns: [/\bappendix\b/i, /\bsupplementary\b/i, /\bsupplemental\b/i],
    backMatter: true,
  },
  {
    id: "acknowledgements",
    patterns: [/\backnowledg(?:e)?ments?\b/i],
    backMatter: true,
  },
  {
    id: "biography",
    patterns: [/\bauthor\s+biograph/i, /\bbiograph(?:y|ies)\b/i],
    backMatter: true,
  },
  {
    id: "prompts",
    patterns: [/\bprompt\s+templates?\b/i, /\bjson\s+(?:schema|examples?)\b/i],
    backMatter: true,
  },
];

const GAP_RE =
  /\b(little\s+(?:is\s+)?known|gap|however|despite|remains?\s+(?:unclear|open)|prior\s+work|existing\s+work|previous\s+work|not\s+(?:well\s+)?understood|under[\s-]?explored|lack\s+of)\b/i;

const HYPOTHESIS_RE =
  /\b(hypothes[ie]s|we\s+(?:study|investigate|examine|test|ask)\s+whether|research\s+question)\b/i;

const LIMIT_RE =
  /\b(limited\s+to|only\s+(?:evaluate|evaluated|test|tested|study|studied)|untested|do\s+not\s+(?:evaluate|consider|claim)|single\s+dataset|default\s+(?:hyper)?parameters?|api\s+cost|cost\s+constraints?|threats?\s+to\s+validity)\b/i;

const FUTURE_RE =
  /\b(future\s+work|further\s+work|should\s+(?:evaluate|explore|investigate|consider)|we\s+(?:plan|aim|hope)\s+to|promising\s+directions?)\b/i;

const POOR_PERF_RE =
  /\b(low\s+f1|poor\s+(?:performance|results?)|below\s+\d|only\s+\d+(?:\.\d+)?%)\b/i;

function clamp(text: string, max: number = LIMITS.maxFieldLength): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

function dedupe(items: readonly string[]): string[] {
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

function projectResearchQuestion(model: DocumentWorldModel) {
  const pool = [
    ...claimsFrom(model, ["abstract", "introduction"]),
    model.byId.get("abstract")?.summary,
    model.byId.get("introduction")?.summary,
  ].filter((s): s is string => Boolean(s && s.trim()));

  const gap = pool.find((s) => GAP_RE.test(s));
  const hyp = pool.find((s) => HYPOTHESIS_RE.test(s) || /\bwhether\b/i.test(s));
  // Never paraphrase title / first paragraph alone.
  const parts: string[] = [];
  if (gap) parts.push(clamp(gap, 320));
  if (hyp && hyp !== gap) {
    parts.push(
      hyp.startsWith("Whether")
        ? `The work tests ${hyp.replace(/^Whether\s+/i, "whether ")}`
        : clamp(hyp, 320),
    );
  }
  if (parts.length === 0) {
    // Fall back to abstract claims that are not the title echo.
    const abstractClaim = pool.find(
      (s) => !s.toLowerCase().includes(model.title.toLowerCase().slice(0, 24).toLowerCase()),
    );
    if (abstractClaim) parts.push(clamp(abstractClaim, 400));
    else parts.push(`What scientific gap does this work close, and what hypothesis does it test?`);
  }

  return {
    summary: clamp(parts.join(" ")),
    problem: gap ? clamp(gap) : undefined,
    goal: hyp ? clamp(hyp) : undefined,
    hook: clamp(hyp ?? gap ?? parts[0]!, 300),
  };
}

function projectKeyFindings(model: DocumentWorldModel): string[] {
  // Results + Discussion + Conclusion only — never Related Work / refs / dataset-alone.
  const pool = claimsFrom(model, ["results", "discussion", "conclusion"]);
  return dedupe(
    pool.filter((s) => {
      if (/^related\s+work\b/i.test(s)) return false;
      if (/\bet\s+al\b|\(\d{4}\)/.test(s) && wordCount(s) < 12) return false;
      return wordCount(s) >= 6;
    }),
  ).slice(0, LIMITS.maxEntriesPerBlock);
}

function projectEvidence(model: DocumentWorldModel) {
  const lines = dedupe([
    ...metricsFrom(model, ["experimental_setup", "results", "method", "abstract"]),
    // Setup claims that carry numbers (dataset sizes, etc.)
    ...claimsFrom(model, ["experimental_setup"]).filter((s) => /\d/.test(s)),
  ]);

  return lines
    .filter((s) => /\d/.test(s))
    .slice(0, LIMITS.maxEntriesPerBlock)
    .map((implication) => {
      const valueMatch = implication.match(/\d+(?:\.\d+)?%?|\d+\s*(?:points?|pts?|k)/i);
      const label = clamp(
        implication.split(/[,:;]/)[0]?.replace(/\d+(?:\.\d+)?%?/g, "").trim() || "Metric",
        120,
      );
      return {
        label,
        ...(valueMatch ? { value: valueMatch[0]!.trim() } : {}),
        implication: clamp(implication, 240),
      };
    });
}

function projectInsights(model: DocumentWorldModel): string[] {
  const findings = projectKeyFindings(model);
  if (findings.length < 2) return [];

  const blob = findings.join(" ");
  const insights: string[] = [];
  const push = (text: string) => {
    const t = clamp(text);
    if (wordCount(t) < 10) return;
    // Never lightly rewrite a single finding.
    if (findings.some((f) => f.toLowerCase() === t.toLowerCase())) return;
    if (insights.some((i) => i.toLowerCase() === t.toLowerCase())) return;
    insights.push(t);
  };

  if (/\b(prompt|few[\s-]?shot|reflection)\b/i.test(blob) && /\b(span|localiz|ground)/i.test(blob)) {
    push(
      "Prompt engineering has limited leverage except for span localization — gains concentrate where models must ground predictions, not where they already understand semantics.",
    );
  }
  if (/\b(sparse|attention|latency|compute)\b/i.test(blob) && /\b(recall|quality)\b/i.test(blob)) {
    push(
      "Efficiency improvements matter only when quality stays near the dense baseline — the bottleneck is attention density under preserved recall.",
    );
  }
  if (/\b(semantics?|understand)\b/i.test(blob) && /\b(span|localiz|ground|trigger|argument)\b/i.test(blob)) {
    push(
      "Semantic understanding and extraction quality diverge: models can know the domain yet still fail at grounding spans.",
    );
  }

  // Generic pattern: require ≥2 findings, emit one higher-level implication.
  if (insights.length === 0 && findings.length >= 2) {
    push(
      `Across independent results — “${findings[0]}” and “${findings[1]}” — the paper implies a structural pattern rather than an isolated outcome.`,
    );
  }

  return insights.slice(0, 4);
}

function projectLimitations(model: DocumentWorldModel): string[] {
  const fromLimit = claimsFrom(model, ["limitations"]);
  const fromDiscuss = claimsFrom(model, ["discussion", "conclusion"]).filter((s) => LIMIT_RE.test(s));
  return dedupe(
    [...fromLimit, ...fromDiscuss].filter((s) => !POOR_PERF_RE.test(s) && (LIMIT_RE.test(s) || fromLimit.includes(s))),
  ).slice(0, LIMITS.maxEntriesPerBlock);
}

function projectFutureWork(model: DocumentWorldModel): string[] {
  const fromFuture = claimsFrom(model, ["future_work"]);
  const fromClose = claimsFrom(model, ["conclusion", "discussion"]).filter((s) => FUTURE_RE.test(s));
  return dedupe(
    [...fromFuture, ...fromClose].filter((s) => !/\?$/.test(s) && (FUTURE_RE.test(s) || fromFuture.includes(s))),
  ).slice(0, LIMITS.maxEntriesPerBlock);
}

function provenance(label: string, detail: string, excerpt: string): BlockInput["provenance"] {
  return {
    method: "local-parser",
    label,
    locator: `section-aware research v2 · ${detail}`,
    excerpt: clamp(excerpt || detail, 240),
  };
}

function toBlocks(
  projected: ProjectedMemories,
  meta: { title: string; label: string },
): Map<BlockKind, BlockInput> {
  const q = projected.researchQuestion;
  const findings: TimelineEntry[] = projected.keyFindings.map((title) => ({
    date: "Finding",
    title: clamp(title),
    state: "done" as const,
  }));
  const evidence: SignalEntry[] = projected.evidence.map((e) => ({
    label: e.label,
    ...(e.value ? { value: e.value } : {}),
    implication: e.implication,
  }));
  const insights: DecisionEntry[] = projected.insights.map((text) => ({
    text: clamp(text),
    status: "proposed" as const,
    commitment: "considered" as const,
  }));
  const limitations: RiskEntry[] = projected.limitations.map((risk) => ({ risk: clamp(risk) }));
  const future: ActionEntry[] = projected.futureWork.map((task) => ({
    task: clamp(task),
    status: "suggested" as const,
  }));

  const preservedNotes = projected.preservedFromSource
    .filter((n) => n.startsWith(PRESERVED_PREFIX))
    .slice(0, 6);

  const built = new Map<BlockKind, BlockInput>();
  built.set("snapshot", {
    kind: "snapshot",
    payload: {
      heading: clamp(meta.title),
      summary: q.summary,
      ...(q.hook ? { hook: q.hook } : {}),
      ...(q.goal ? { goal: q.goal } : {}),
      ...(q.problem ? { problem: q.problem } : {}),
      byline: "Section-aware research v2 · world model before projection",
      ...(preservedNotes.length > 0 ? { notes: preservedNotes } : {}),
    },
    provenance: provenance(meta.label, "research question", q.summary),
  });
  built.set("timeline", {
    kind: "timeline",
    payload: { entries: findings },
    provenance: provenance(meta.label, "key findings", findings[0]?.title ?? "findings"),
  });
  built.set("signals", {
    kind: "signals",
    payload: { entries: evidence },
    provenance: provenance(meta.label, "evidence", evidence[0]?.implication ?? "evidence"),
  });
  built.set("decisions", {
    kind: "decisions",
    payload: { entries: insights },
    provenance: provenance(meta.label, "insights", insights[0]?.text ?? "insights"),
  });
  built.set("risks", {
    kind: "risks",
    payload: { entries: limitations },
    provenance: provenance(meta.label, "limitations", limitations[0]?.risk ?? "limitations"),
  });
  built.set("actions", {
    kind: "actions",
    payload: { entries: future },
    provenance: provenance(meta.label, "future work", future[0]?.task ?? "future"),
  });
  return built;
}

export const RESEARCH_SECTION_PROFILE: SectionAwareProfile = {
  id: "research",
  label: "Research",
  sectionRules: RULES,
  hardStopAfter: "conclusion",
  allowAfterHardStop: ["future_work"],
  // Related Work is detected so we can skip it — never feeds Key Findings.
  skipRoles: ["related_work"],
  project: {
    researchQuestion: projectResearchQuestion,
    keyFindings: projectKeyFindings,
    evidence: projectEvidence,
    insights: projectInsights,
    limitations: projectLimitations,
    futureWork: projectFutureWork,
  },
  toBlocks,
};
