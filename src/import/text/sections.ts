import type { BlockKind } from "@/domain/memory/schema";
import { splitListItem } from "./patterns";

/**
 * Section recognition for the local text/Markdown parser.
 *
 * Two layers, tried in order:
 *  1. The heading names one of the six memories, directly or by synonym
 *     ("Implementation Rules" → decisions, "Success Criteria" → signals).
 *  2. The heading is unknown, so the *shape* of its lines decides
 *     ("Phase 3 / Task D" reads as a timeline, "Never do X" as decisions).
 *
 * Inference only ever chooses which memory a line belongs to. It never
 * fabricates a field the source did not state.
 */

const HEADING_KEYWORDS: Record<string, BlockKind> = {
  // snapshot — what this document is
  snapshot: "snapshot",
  summary: "snapshot",
  overview: "snapshot",
  brief: "snapshot",
  about: "snapshot",
  introduction: "snapshot",
  intro: "snapshot",
  abstract: "snapshot",
  objective: "snapshot",
  objectives: "snapshot",
  goal: "snapshot",
  goals: "snapshot",
  purpose: "snapshot",
  scope: "snapshot",
  context: "snapshot",
  "business context": "snapshot",
  background: "snapshot",
  mission: "snapshot",
  vision: "snapshot",
  premise: "snapshot",

  // signals — indicators, measured or qualitative
  signals: "signals",
  metrics: "signals",
  "key metrics": "signals",
  "success metrics": "signals",
  "adoption metrics": "signals",
  "efficiency metrics": "signals",
  "quality metrics": "signals",
  kpis: "signals",
  kpi: "signals",
  numbers: "signals",
  highlights: "signals",
  stats: "signals",
  statistics: "signals",
  results: "signals",
  outcomes: "signals",
  targets: "signals",
  benchmarks: "signals",
  criteria: "signals",
  "success criteria": "signals",
  "acceptance criteria": "signals",
  "definition of done": "signals",
  measurements: "signals",
  "frequency of issues": "signals",

  // decisions — rules, positions, things settled
  decisions: "decisions",
  decided: "decisions",
  "decision log": "decisions",
  "design decisions": "decisions",
  rules: "decisions",
  "implementation rules": "decisions",
  "ground rules": "decisions",
  principles: "decisions",
  guidelines: "decisions",
  conventions: "decisions",
  standards: "decisions",
  policy: "decisions",
  policies: "decisions",
  constraints: "decisions",
  requirements: "decisions",
  "key requirements": "decisions",
  priority: "decisions",
  "priority matrix": "decisions",
  "priority & impact matrix": "decisions",
  "impact matrix": "decisions",
  "cases - sheet": "decisions",
  "cases – sheet": "decisions",
  "cases – sheet (embedded spreadsheet)": "decisions",
  "embedded spreadsheet": "decisions",
  philosophy: "decisions",
  tradeoffs: "decisions",
  "trade-offs": "decisions",
  "non-goals": "decisions",

  // timeline — ordered delivery
  timeline: "timeline",
  roadmap: "timeline",
  milestones: "timeline",
  schedule: "timeline",
  dates: "timeline",
  phases: "timeline",
  plan: "timeline",
  releases: "timeline",
  sprints: "timeline",
  iterations: "timeline",
  stages: "timeline",
  "ticket breakdown": "timeline",
  "ticket breakdown by theme": "timeline",
  "po edit history & audit trail": "timeline",
  "po amendment after approval/grn": "timeline",
  "other module edit capabilities": "timeline",

  // risks — what could go wrong
  risks: "risks",
  "risk register": "risks",
  concerns: "risks",
  threats: "risks",
  blockers: "risks",
  issues: "risks",
  challenges: "risks",
  pitfalls: "risks",
  caveats: "risks",
  limitations: "risks",
  "known issues": "risks",
  "failure modes": "risks",
  problem: "risks",
  "problem statement": "risks",
  "business impact": "risks",
  "pain points": "risks",
  "current pain points": "risks",
  "open questions": "risks",
  questions: "risks",

  // actions — work to do
  actions: "actions",
  "action items": "actions",
  tasks: "actions",
  todos: "actions",
  "to-dos": "actions",
  "to do": "actions",
  "next steps": "actions",
  "follow-ups": "actions",
  "follow ups": "actions",
  workflow: "actions",
  "implementation workflow": "actions",
  steps: "actions",
  deliverables: "actions",
  backlog: "actions",
  checklist: "actions",
  "user stories": "actions",
  "user stories & acceptance criteria": "actions",
};

const MAX_KEYWORD_WORDS = 8;

export interface HeadingMatch {
  /** Visible heading text (already stripped of markdown syntax). */
  text: string;
  level: number;
}

/** Recognize a markdown or plain-text heading line. */
export function matchHeading(line: string, nextLine?: string): HeadingMatch | null {
  const atx = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
  if (atx) return { text: atx[2]!.trim(), level: atx[1]!.length };
  if (nextLine !== undefined && /^\s{0,3}(=+|-+)\s*$/.test(nextLine) && line.trim().length > 0) {
    return { text: line.trim(), level: nextLine.trim().startsWith("=") ? 1 : 2 };
  }
  // Plain keyword heading: short line, no terminal period.
  const plain = line.trim().replace(/:$/, "").trim();
  if (plain.length > 0 && plain.length <= 40 && !/[.!?]$/.test(plain)) {
    const words = plain.toLowerCase().split(/\s+/);
    if (words.length <= MAX_KEYWORD_WORDS && HEADING_KEYWORDS[words.join(" ")]) {
      return { text: plain, level: 2 };
    }
  }
  return null;
}

/** Map heading text to a memory kind, if it names one of the six. */
export function classifyHeading(text: string): BlockKind | null {
  const normalized = text
    .toLowerCase()
    .replace(/^\d+(\.\d+)*\.?\s*/, "") // "3.1 Risks" / "5. Business Impact"
    .replace(/\s*\(.*\)\s*$/, "") // "Workflow (IMPORTANT)" → "workflow"
    .replace(/:$/, "")
    .replace(/\s+/g, " ")
    .trim();
  const direct = HEADING_KEYWORDS[normalized];
  if (direct) return direct;
  // Prefer longer keyword phrases first ("key requirements" before "requirements").
  const keywords = Object.entries(HEADING_KEYWORDS).sort((a, b) => b[0].length - a[0].length);
  for (const [keyword, kind] of keywords) {
    if (normalized === keyword) return kind;
    if (normalized.startsWith(keyword + " ") || normalized.endsWith(" " + keyword)) return kind;
    if (normalized.includes(" " + keyword + " ")) return kind;
  }
  // Persona user-story headings: "4.1 As a Purchase Manager"
  if (/^as an?\s+/i.test(normalized)) return "actions";
  return null;
}

/**
 * "Phase 2", "Task D", "Step 3", "Milestone 4" — an ordinal work marker. These
 * carry the delivery order of a plan even when no calendar date is present.
 */
const ORDINAL_HEADING =
  /^(phase|task|step|stage|milestone|sprint|iteration|week|day|part|chapter)\s+([0-9]{1,3}|[a-z]|[ivxlc]+)\b/i;

export function matchOrdinalHeading(text: string): { marker: string; rest: string } | null {
  const match = ORDINAL_HEADING.exec(text.trim());
  if (!match) return null;
  const marker = `${capitalize(match[1]!)} ${match[2]!.toUpperCase()}`;
  const rest = text.trim().slice(match[0].length).replace(/^\s*[:—–-]\s*/, "").trim();
  return { marker, rest };
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/* ----------------------------- content inference ---------------------------- */

/** An imperative rule: "Never introduce X", "Do NOT persist Y", "Prefer Z". */
const RULE_LINE =
  /^(never|always|do not|don't|dont|avoid|prefer|must|should|only|keep|use|ensure|require|no\b)/i;

/** A line that reads like something going wrong. */
const RISK_LINE = /\b(risk|risky|fail|failure|danger|threat|blocker|breaks?|broken|degrad|outage|vulnerab|unsafe|bottleneck)\b/i;

/** A measured value: a number with a unit, percentage or currency. */
const MEASURED = /[0-9]+\s*(%|pts?|pp\b|ms\b|s\b|x\b|k\b|m\b|bn?\b)|[$€£]\s*[0-9]|[0-9]+\s*(hours?|days?|weeks?|months?)/i;

interface Shape {
  total: number;
  rules: number;
  risks: number;
  measured: number;
  numbered: number;
  bulleted: number;
}

function shapeOf(lines: string[]): Shape {
  const shape: Shape = { total: 0, rules: 0, risks: 0, measured: 0, numbered: 0, bulleted: 0 };
  for (const raw of lines) {
    const text = raw.trim();
    if (text === "") continue;
    shape.total++;
    const item = splitListItem(raw);
    const body = item ? item.text : text;
    if (item?.marker === "number") shape.numbered++;
    if (item?.marker === "bullet" || item?.marker === "task") shape.bulleted++;
    if (RULE_LINE.test(body)) shape.rules++;
    if (RISK_LINE.test(body)) shape.risks++;
    if (MEASURED.test(body)) shape.measured++;
  }
  return shape;
}

/**
 * Choose a memory for a section whose heading we did not recognize, based on
 * how its lines read. Returns null when nothing is clear enough, in which case
 * the caller preserves the text rather than guessing.
 */
export function inferKindFromLines(lines: string[]): BlockKind | null {
  const shape = shapeOf(lines);
  if (shape.total < 2) return null;

  const ratio = (n: number) => n / shape.total;

  // Something going wrong, stated repeatedly, is a risk list.
  if (ratio(shape.risks) >= 0.4) return "risks";
  // Mostly measured values is a signal list.
  if (ratio(shape.measured) >= 0.5) return "signals";
  // Imperative rules are positions the author has settled.
  if (ratio(shape.rules) >= 0.5) return "decisions";
  // An ordered procedure is work to carry out.
  if (ratio(shape.numbered) >= 0.6) return "actions";
  return null;
}

/** True when a line is markdown structural noise that should not become notes. */
export function isStructuralLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === "") return false;
  if (/^(=+|-{3,}|\*{3,}|_{3,})$/.test(trimmed)) return true; // hr / setext underline
  if (/^```/.test(trimmed)) return true; // fence marker
  if (/^<!--\s*(page|image):/i.test(trimmed)) return true; // PDF layout / OCR markers
  return false;
}
