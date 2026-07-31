import type {
  ActionEntry,
  DecisionEntry,
  RiskEntry,
  SignalEntry,
  TimelineEntry,
} from "@/domain/memory/schema";
import { inferArtifact, inferReadiness, readCommitment, readRisk } from "@/understanding/inference";

/**
 * Conservative line patterns for the local text/Markdown parser.
 *
 * Every function returns `null` when the line is not clearly recognized —
 * the parser NEVER invents owners, dates, metrics, severities or statuses.
 * Unrecognized material is preserved by the caller as plain-text notes.
 */

export interface ListItem {
  marker: "bullet" | "number" | "task";
  done?: boolean;
  text: string;
}

const BULLET = /^\s*(?:[-*•])\s+(.*)$/;
const NUMBERED = /^\s*(\d{1,3})[.)]\s+(.*)$/;
const TASK = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/;

export function splitListItem(line: string): ListItem | null {
  const task = TASK.exec(line);
  if (task) return { marker: "task", done: task[1]!.toLowerCase() === "x", text: task[2]!.trim() };
  const bullet = BULLET.exec(line);
  if (bullet) return { marker: "bullet", text: bullet[1]!.trim() };
  const numbered = NUMBERED.exec(line);
  if (numbered) return { marker: "number", text: numbered[2]!.trim() };
  return null;
}

/** Markdown table row → trimmed cells, or null. Separator rows return null. */
export function splitTableRow(line: string): string[] | null {
  if (!line.includes("|")) return null;
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  if (/^[\s:|-]+$/.test(trimmed)) return null; // separator row
  const cells = trimmed.split("|").map((c) => c.trim());
  return cells.length >= 2 && cells.some((c) => c.length > 0) ? cells : null;
}

/** True for markdown table separator rows like `| --- | :---: |`. */
export function isTableSeparator(line: string): boolean {
  if (!line.includes("|")) return false;
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.length > 0 && /^[\s:|-]+$/.test(trimmed);
}

/** Strip a recognized list marker for clean plain-text preservation. */
export function stripListMarker(line: string): string {
  const item = splitListItem(line);
  return item ? item.text : line.trim();
}

/** Leading glyphs authors use as bullets that markdown does not define. */
const GLYPH_PREFIX = /^\s*[✓✔✅×✗✘→⇒▸▪▫◦·+]\s*/;

/** Remove markdown emphasis so rendered output never shows raw `**` or backticks. */
export function stripEmphasis(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(^|\W)\*(\S(?:.*?\S)?)\*(?=\W|$)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

/** Normalize a line to its human content: list marker, glyph and emphasis removed. */
export function plainContentOf(line: string): string {
  return stripEmphasis(stripListMarker(line).replace(GLYPH_PREFIX, "").trim());
}

/** A line carrying no content of its own — a lone arrow or divider in a diagram. */
export function isDecorativeLine(line: string): boolean {
  const text = line.trim();
  if (text === "") return true;
  return /^[↓↑→←⇒⇓|+/\\_.·•\-–—=]{1,4}$/.test(text);
}

/**
 * True when the author marked this line as an item — a markdown bullet, a
 * number, a checkbox, or a glyph like "✓". Only such lines are eligible for
 * the lenient passes, so ordinary prose is never mistaken for an entry.
 */
export function isListLike(line: string): boolean {
  if (splitListItem(line) !== null) return true;
  return GLYPH_PREFIX.test(line);
}

const MONTH = "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const DATE_TOKEN = new RegExp(
  `^(${MONTH}\\.?\\s+\\d{1,2}(?:,\\s*\\d{4})?|${MONTH}\\.?|Q[1-4](?:[ /]?\\d{4})?|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2,4})?|Week\\s+\\d{1,2}|Sprint\\s+\\d{1,2})\\b`,
  "i",
);

export function looksLikeDate(text: string): boolean {
  return DATE_TOKEN.test(text.trim());
}

const SEPARATOR = /\s*[:—–]\s+|\s+-\s+/;

function splitOnFirstSeparator(text: string): [string, string] | null {
  const match = SEPARATOR.exec(text);
  if (!match || match.index === 0) return null;
  return [text.slice(0, match.index).trim(), text.slice(match.index + match[0].length).trim()];
}

/** Match a TRAILING status/state segment only ("text — approved"), keeping the title intact. */
function splitTrailingKeyword(text: string, pattern: RegExp): { body: string; keyword: string } | null {
  const match = /^(.*?)\s+[—–-]\s+(\S[\s\S]{0,40}?)\.?\s*$/.exec(text);
  if (!match) return null;
  const tail = match[2]!.trim();
  const kw = pattern.exec(tail);
  if (!kw) return null;
  return { body: match[1]!.trim(), keyword: kw[0] };
}

function extractParenSuffix(text: string): { body: string; suffix: string | null } {
  const match = /^(.*?)\s*\(([^()]{1,80})\)\s*$/.exec(text);
  if (!match) return { body: text, suffix: null };
  return { body: match[1]!.trim(), suffix: match[2]!.trim() };
}

function trendOf(text: string): "up" | "flat" | "down" | undefined {
  const lower = text.toLowerCase();
  if (/(^|\s)(up|grew|growth|increase|increased|▲|\+)/.test(lower)) return "up";
  if (/(^|\s)(down|fell|decline|declined|decrease|decreased|▼|-\d)/.test(lower)) return "down";
  if (/(^|\s)(flat|steady|unchanged|→|holds?)\b/.test(lower)) return "flat";
  return undefined;
}

/* --------------------------------- signals ---------------------------------- */

export function parseSignalLine(raw: string): SignalEntry | null {
  const cells = splitTableRow(raw);
  if (cells && cells.length >= 2 && cells[0] && cells[1]) {
    const entry: SignalEntry = { label: cells[0], value: cells[1] };
    if (cells[2]) entry.delta = cells[2];
    const trend = trendOf(cells.slice(1).join(" "));
    if (trend) entry.trend = trend;
    return entry;
  }
  const item = splitListItem(raw);
  const text = item ? item.text : raw;
  const { body, suffix } = extractParenSuffix(text);
  const parts = splitOnFirstSeparator(body);
  if (!parts) return null;
  const [label, value] = parts;
  if (label.length < 1 || label.length > 60 || value.length < 1) return null;
  // A signal value should contain a number or unit — otherwise it is prose.
  if (!/[0-9%$€£#]/.test(value)) return null;
  const entry: SignalEntry = { label, value };
  if (suffix && /[0-9%$€£]|up|down|flat|pts?|pp\b/i.test(suffix)) entry.delta = suffix;
  const trend = trendOf(`${value} ${suffix ?? ""}`);
  if (trend) entry.trend = trend;
  return entry;
}

/* --------------------------------- decisions -------------------------------- */

const DECISION_STATUS = /\b(approved|requested|proposed|rejected)\b/i;
const REF_TOKEN = /^([A-Z]{1,5}-\d{1,4})\s+/;

export function parseDecisionLine(raw: string): DecisionEntry | null {
  const item = splitListItem(raw);
  const text = (item ? item.text : raw).trim();
  if (text.length < 3) return null;
  let rest = text;
  let ref: string | undefined;
  const refMatch = REF_TOKEN.exec(rest);
  if (refMatch) {
    ref = refMatch[1];
    rest = rest.slice(refMatch[0].length).trim();
  }
  let status: DecisionEntry["status"] = "proposed";
  let foundStatus = false;
  const { body, suffix } = extractParenSuffix(rest);
  if (suffix && DECISION_STATUS.test(suffix)) {
    status = suffix.match(DECISION_STATUS)![1]!.toLowerCase() as DecisionEntry["status"];
    rest = body;
    foundStatus = true;
  } else {
    const trailing = splitTrailingKeyword(rest, DECISION_STATUS);
    if (trailing) {
      status = trailing.keyword.toLowerCase() as DecisionEntry["status"];
      rest = trailing.body;
      foundStatus = true;
    }
  }
  // Require a ref, a list marker or an explicit status — bare prose is not a decision.
  if (!ref && !item && !foundStatus) return null;
  // A short noun phrase in a list ("Redis", "Docker Swarm") is something the
  // author enumerated, not a position they took. Without a reference or an
  // explicit status, a decision has to read like a statement.
  if (!ref && !foundStatus && rest.split(/\s+/).length < 3 && !/[.!?]$/.test(rest)) return null;
  if (rest.length < 2) return null;
  // An approved decision is settled by definition; the wording no longer gets
  // a vote. Anything still awaiting a yes is read from how it was written.
  const commitment = status === "approved" ? "committed" : readCommitment(rest);
  const entry: DecisionEntry = { text: rest, status, commitment };
  if (ref) entry.ref = ref;
  return entry;
}

/* --------------------------------- timeline --------------------------------- */

const TIMELINE_STATE: Array<[RegExp, TimelineEntry["state"]]> = [
  [/\b(shipped|released|launched|live)\b/i, "shipped"],
  [/\b(done|complete|completed|closed)\b/i, "done"],
  [/\b(on[\s-]?track|in\s+progress|underway)\b/i, "on-track"],
  [/\b(planned|planned|upcoming|scheduled|next|todo)\b/i, "planned"],
];

const TRAILING_STATE = /\b(shipped|released|launched|live|done|complete|completed|closed|on[\s-]?track|in\s+progress|underway|planned|upcoming|scheduled)\b/i;

export function parseTimelineLine(raw: string): TimelineEntry | null {
  const item = splitListItem(raw);
  const cells = splitTableRow(raw);
  if (cells && cells.length >= 2 && cells[0] && looksLikeDate(cells[0])) {
    const state = stateFromText(cells[2] ?? "") ?? "planned";
    return { date: cells[0], title: cells[1]!, state, ...inferArtifact(cells.slice(1).join(". ")) };
  }
  const text = (item ? item.text : raw).trim();
  const dateMatch = DATE_TOKEN.exec(text);
  if (!dateMatch) return null;
  const date = dateMatch[1]!.replace(/\.$/, "");
  let rest = text.slice(dateMatch[0].length).replace(/^\s*[:—–-]\s*/, "").trim();
  if (rest.length < 2) return null;
  let state: TimelineEntry["state"] | undefined;
  const { body, suffix } = extractParenSuffix(rest);
  if (suffix) {
    state = stateFromText(suffix);
    if (state) rest = body;
  }
  if (!state) {
    // Only a TRAILING state word is treated as the state — titles keep their text.
    const trailing = splitTrailingKeyword(rest, TRAILING_STATE);
    if (trailing && trailing.keyword.length <= 24) {
      state = stateFromText(trailing.keyword);
      if (state) rest = trailing.body;
    }
  }
  if (!state) state = "planned";
  return rest.length >= 2 ? { date, title: rest, state, ...inferArtifact(rest) } : null;
}

function stateFromText(text: string): TimelineEntry["state"] | undefined {
  for (const [pattern, state] of TIMELINE_STATE) {
    if (pattern.test(text)) return state;
  }
  return undefined;
}

/* ---------------------------------- risks ----------------------------------- */

const SEVERITY = /\b(high|medium|med|low)\b/i;

export function parseRiskLine(raw: string): RiskEntry | null {
  const cells = splitTableRow(raw);
  if (cells && cells.length >= 2) {
    const sevCell = cells.findIndex((c) => SEVERITY.test(c));
    if (sevCell > 0 && cells[0]) {
      const severity = normalizeSeverity(cells[sevCell]!);
      const mitigation = cells.slice(sevCell + 1).join(" · ").trim();
      if (mitigation.length === 0) return null;
      return { ...splitReasoning(cells[0]), severity, mitigation };
    }
    return null;
  }
  const item = splitListItem(raw);
  const text = (item ? item.text : raw).trim();
  const { body, suffix } = extractParenSuffix(text);
  let severity: RiskEntry["severity"] | null = null;
  let rest = text;
  if (suffix && SEVERITY.test(suffix)) {
    severity = normalizeSeverity(suffix);
    rest = body;
  }
  const parts = splitOnFirstSeparator(rest);
  if (!parts) return null;
  let [risk, mitigation] = parts;
  const mitigationMarker = /^mitigation\s*[:—–-]\s*/i.exec(mitigation);
  if (mitigationMarker) mitigation = mitigation.slice(mitigationMarker[0].length).trim();
  if (!severity) {
    const sevInRisk = /[[(](high|medium|med|low)[\])]/i.exec(risk);
    if (sevInRisk) {
      severity = normalizeSeverity(sevInRisk[1]!);
      risk = risk.replace(sevInRisk[0], "").trim();
    }
  }
  // A risk MUST carry an explicit severity and mitigation, never invented.
  if (!severity || risk.length < 3 || mitigation.length < 2) return null;
  return { ...splitReasoning(risk), severity, mitigation };
}

/**
 * Separate an observation from the consequence trailing it, so a risk reads as
 * "what we see" and "what it costs" instead of one long sentence. When the
 * line states no consequence the observation is returned untouched.
 */
function splitReasoning(text: string): RiskEntry {
  const read = readRisk(text);
  if (!read) return { risk: text };
  return read;
}

function normalizeSeverity(text: string): RiskEntry["severity"] {
  const match = SEVERITY.exec(text);
  const word = (match?.[1] ?? "medium").toLowerCase();
  return word === "med" ? "medium" : (word as RiskEntry["severity"]);
}

/* ---------------------------------- actions --------------------------------- */

export function parseActionLine(raw: string): ActionEntry | null {
  const cells = splitTableRow(raw);
  if (cells && cells.length >= 3 && cells[0] && cells[1] && cells[2]) {
    const status = inferReadiness(cells.slice(3).join(" ") || cells[0]);
    return { task: cells[0], owner: cells[1], due: cells[2], status };
  }
  const item = splitListItem(raw);
  const text = (item ? item.text : raw).trim();
  if (text.length < 3) return null;
  const status = inferReadiness(text, { checked: item?.done });
  // "Task, Owner, Aug 15" in parentheses, or separated segments.
  const { body, suffix } = extractParenSuffix(text);
  if (suffix && suffix.includes(",")) {
    const [owner, due] = suffix.split(",").map((s) => s.trim());
    if (owner && due && looksLikeDate(due)) {
      return { task: body, owner, due, status };
    }
  }
  const segments = text.split(/\s+[—–]\s+|\s+-\s+/).map((s) => s.trim()).filter(Boolean);
  if (segments.length >= 3) {
    const due = segments[segments.length - 1]!;
    const owner = segments[segments.length - 2]!;
    const task = segments.slice(0, -2).join(", ");
    if (looksLikeDate(due) && owner.length <= 60 && task.length >= 3) {
      return { task, owner, due, status };
    }
  }
  if (segments.length === 2) {
    const [task, tail] = segments;
    if (looksLikeDate(tail!) && task!.length >= 3) {
      // A due date with no owner: recorded as-is by the lenient pass, which
      // omits the owner rather than guessing one.
      return null;
    }
    const ownerMatch = /^@?([A-Z][\w.]*(?:\s+[A-Z][\w.]*){0,2})/.exec(tail!);
    const dueMatch = DATE_TOKEN.exec(tail!);
    if (ownerMatch && dueMatch && task!.length >= 3) {
      return {
        task: task!,
        owner: ownerMatch[1]!,
        due: tail!.slice(dueMatch.index).trim(),
        status,
      };
    }
  }
  return null;
}

/* --------------------------------- lenient ---------------------------------- */

/**
 * Lenient passes, used only once a section has been confidently identified as
 * a given memory. They record exactly what the line states and leave every
 * unstated field undefined — the strict passes above still run first, so a
 * fully specified line keeps its owner, severity, date and status.
 */

const MIN_ENTRY_LENGTH = 3;
const MAX_ENTRY_LENGTH = 300;

function entryText(raw: string): string | null {
  const text = plainContentOf(raw);
  if (text.length < MIN_ENTRY_LENGTH || text.length > MAX_ENTRY_LENGTH) return null;
  return text;
}

export function parseSignalLineLenient(raw: string): SignalEntry | null {
  const text = entryText(raw);
  if (!text) return null;
  const parts = splitOnFirstSeparator(text);
  if (parts) {
    const [label, value] = parts;
    if (label.length >= 1 && label.length <= 120 && value.length >= 1) {
      const entry: SignalEntry = { label, value: value.slice(0, 120) };
      const trend = trendOf(value);
      if (trend) entry.trend = trend;
      return entry;
    }
  }
  // A criterion with no measured value is still an indicator.
  return { label: text.slice(0, 120) };
}

export function parseDecisionLineLenient(raw: string): DecisionEntry | null {
  const text = entryText(raw);
  if (!text) return null;
  const strict = parseDecisionLine(raw);
  if (strict) return strict;
  // A bare noun ("Redis") is an item in a list, not a position someone took.
  if (text.split(/\s+/).length < 2) return null;
  return { text, status: "proposed", commitment: readCommitment(text) };
}

export function parseTimelineLineLenient(raw: string): TimelineEntry | null {
  const text = entryText(raw);
  if (!text) return null;
  const strict = parseTimelineLine(raw);
  if (strict) return strict;
  // Without a date the entry has no place on a timeline; the caller keeps it
  // as a note rather than inventing one.
  return null;
}

export function parseRiskLineLenient(raw: string): RiskEntry | null {
  const text = entryText(raw);
  if (!text) return null;
  const strict = parseRiskLine(raw);
  if (strict) return strict;
  // Severity and mitigation stay undefined when the source never graded it.
  // The reasoning halves appear only when the line actually stated them.
  return splitReasoning(text);
}

export function parseActionLineLenient(raw: string): ActionEntry | null {
  const text = entryText(raw);
  if (!text) return null;
  const strict = parseActionLine(raw);
  if (strict) return strict;
  const item = splitListItem(raw);
  const entry: ActionEntry = { task: text, status: inferReadiness(text, { checked: item?.done }) };
  const dueMatch = DATE_TOKEN.exec(text);
  if (dueMatch) entry.due = dueMatch[1]!.replace(/\.$/, "");
  return entry;
}
