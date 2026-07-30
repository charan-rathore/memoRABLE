import type { BlockKind } from "@/domain/memory/schema";

/**
 * Section recognition for the local text/Markdown parser: markdown headings,
 * setext underlines and plain keyword headings ("Risks:", "Action items").
 */

const HEADING_KEYWORDS: Record<string, BlockKind> = {
  snapshot: "snapshot",
  summary: "snapshot",
  overview: "snapshot",
  brief: "snapshot",
  about: "snapshot",
  introduction: "snapshot",
  intro: "snapshot",
  signals: "signals",
  metrics: "signals",
  "key metrics": "signals",
  kpis: "signals",
  kpi: "signals",
  numbers: "signals",
  highlights: "signals",
  stats: "signals",
  statistics: "signals",
  results: "signals",
  decisions: "decisions",
  decided: "decisions",
  "decision log": "decisions",
  timeline: "timeline",
  roadmap: "timeline",
  milestones: "timeline",
  schedule: "timeline",
  dates: "timeline",
  risks: "risks",
  "risk register": "risks",
  concerns: "risks",
  threats: "risks",
  actions: "actions",
  "action items": "actions",
  tasks: "actions",
  todos: "actions",
  "to-dos": "actions",
  "to do": "actions",
  "next steps": "actions",
  "follow-ups": "actions",
  "follow ups": "actions",
};

const MAX_KEYWORD_WORDS = 3;

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
    .replace(/^\d{1,2}\s*[-.).:]\s*/, "") // "3. Risks" → "risks"
    .replace(/:$/, "")
    .trim();
  const direct = HEADING_KEYWORDS[normalized];
  if (direct) return direct;
  // "Q3 Risks & Mitigations" → starts-with match on a keyword phrase.
  for (const [keyword, kind] of Object.entries(HEADING_KEYWORDS)) {
    if (normalized === keyword) return kind;
  }
  for (const [keyword, kind] of Object.entries(HEADING_KEYWORDS)) {
    if (normalized.startsWith(keyword + " ") || normalized.endsWith(" " + keyword)) return kind;
  }
  return null;
}

/** True when a line is markdown structural noise that should not become notes. */
export function isStructuralLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === "") return false;
  if (/^(=+|-{3,}|\*{3,}|_{3,})$/.test(trimmed)) return true; // hr / setext underline
  if (/^```/.test(trimmed)) return true; // fence marker
  return false;
}
