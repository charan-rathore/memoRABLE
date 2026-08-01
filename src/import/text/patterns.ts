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

const MONTH =
  "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const YEAR = "(?:19|20)\\d{2}";
/** Human time language: today, next week, Jan–Jun, 2034, H1, FY26, … */
const DATE_ATOM = [
  // Relative words people actually write
  "(?:today|tomorrow|yesterday|tonight)",
  "(?:this|next|last)\\s+(?:week|month|quarter|year)",
  "end\\s+of\\s+(?:the\\s+)?(?:week|month|quarter|year)",
  "in\\s+\\d{1,3}\\s+(?:days?|weeks?|months?|years?)",
  // Month ranges: Jan-Jun, January – June 2026
  `${MONTH}\\.?\\s*[-–—]\\s*${MONTH}\\.?(?:\\s+${YEAR})?`,
  // Half-years / fiscal years
  `H[12](?:[ /]?${YEAR})?`,
  `FY\\s*'?\\d{2,4}`,
  // Calendar forms already supported
  `${MONTH}\\.?\\s+\\d{1,2}(?:,\\s*${YEAR})?`,
  `${MONTH}\\.?\\s+${YEAR}`,
  `${MONTH}\\.?`,
  `Q[1-4](?:[ /]?${YEAR})?`,
  `${YEAR}-\\d{2}-\\d{2}`,
  `\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2,4})?`,
  `Week\\s+\\d{1,2}`,
  `Sprint\\s+\\d{1,2}`,
  // Bare year: 2034
  YEAR,
].join("|");

const DATE_TOKEN = new RegExp(`^(${DATE_ATOM})\\b`, "i");
/** Mid-line dates omit bare month names ("May need…") to avoid false hits. */
const DATE_EMBEDDED = [
  "(?:today|tomorrow|yesterday|tonight)",
  "(?:this|next|last)\\s+(?:week|month|quarter|year)",
  "end\\s+of\\s+(?:the\\s+)?(?:week|month|quarter|year)",
  "in\\s+\\d{1,3}\\s+(?:days?|weeks?|months?|years?)",
  `${MONTH}\\.?\\s*[-–—]\\s*${MONTH}\\.?(?:\\s+${YEAR})?`,
  `H[12](?:[ /]?${YEAR})?`,
  `FY\\s*'?\\d{2,4}`,
  `${MONTH}\\.?\\s+\\d{1,2}(?:,\\s*${YEAR})?`,
  `${MONTH}\\.?\\s+${YEAR}`,
  `Q[1-4](?:[ /]?${YEAR})?`,
  `${YEAR}-\\d{2}-\\d{2}`,
  `\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2,4})?`,
  `Week\\s+\\d{1,2}`,
  `Sprint\\s+\\d{1,2}`,
  YEAR,
].join("|");
const DATE_ANYWHERE = new RegExp(`\\b(${DATE_EMBEDDED})\\b`, "i");

export function looksLikeDate(text: string): boolean {
  return DATE_TOKEN.test(text.trim());
}

/** Find a date/time phrase anywhere in text; returns the matched span. */
export function findDateToken(text: string): { date: string; index: number; length: number } | null {
  const match = DATE_ANYWHERE.exec(text);
  if (!match || match.index === undefined) return null;
  return {
    date: match[1]!.replace(/\.$/, "").replace(/\s+/g, " ").trim(),
    index: match.index,
    length: match[0].length,
  };
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

/** Open questions are Signals — unresolved cognitive items, not Risks. */
export function parseOpenQuestionLine(raw: string): SignalEntry | null {
  const item = splitListItem(raw);
  const text = stripEmphasis((item ? item.text : raw).trim());
  if (text.length < 12) return null;
  // Require a ? or a clear interrogative — bare "Can amend…" is a criterion, not a question.
  const looksLikeQuestion =
    /\?/.test(text) ||
    /\bopen question\b/i.test(text) ||
    /^(should|what|who|when|where|why|how)\b/i.test(text);
  if (!looksLikeQuestion) return null;
  return {
    label: "Open question",
    implication: text.replace(/^\s*open questions?\s*[:—–-]\s*/i, "").slice(0, 400),
  };
}

/** KPI / success-metric lines with an explicit target become measured Signals. */
export function parseMetricTargetLine(raw: string): SignalEntry | null {
  const item = splitListItem(raw);
  const text = stripEmphasis((item ? item.text : raw).trim());
  if (text.length < 12) return null;

  const targetParen = /\(target:\s*([^)]+)\)/i.exec(text);
  if (targetParen) {
    const body = text.replace(/\s*\(target:\s*[^)]+\)/i, "").trim();
    const parts = splitOnFirstSeparator(body);
    const label = (parts ? parts[0] : body).replace(/:$/, "").trim().slice(0, 120);
    const detail = parts ? parts[1] : "";
    if (label.length < 2) return null;
    return {
      label,
      value: targetParen[1]!.trim().slice(0, 120),
      ...(detail ? { implication: detail.slice(0, 240) } : { implication: "Target" }),
    };
  }

  // "Audit readiness: Time to produce edit audit trail — target <5 minutes"
  const targetDash = /^(.{4,80}?)\s*[—–:-]\s*(.+?)\s*(?:target|goal)\s*[: ]\s*(.+)$/i.exec(text);
  if (targetDash) {
    return {
      label: targetDash[1]!.trim().slice(0, 120),
      value: targetDash[3]!.trim().slice(0, 120),
      implication: targetDash[2]!.trim().slice(0, 240),
    };
  }

  return null;
}

export function parseSignalLine(raw: string): SignalEntry | null {
  const question = parseOpenQuestionLine(raw);
  if (question) return question;
  const metric = parseMetricTargetLine(raw);
  if (metric) return metric;
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
  if (!/[0-9%$€£#<>]/.test(value)) return null;
  const entry: SignalEntry = { label, value };
  if (suffix && /[0-9%$€£]|up|down|flat|pts?|pp\b/i.test(suffix)) entry.delta = suffix;
  const trend = trendOf(`${value} ${suffix ?? ""}`);
  if (trend) entry.trend = trend;
  return entry;
}

/* --------------------------------- decisions -------------------------------- */

const DECISION_STATUS = /\b(approved|requested|proposed|rejected)\b/i;
/** Commitment metadata (schema field) — distinct from approval status. */
const DECISION_COMMITMENT = /\b(committed|considered)\b/i;
const REF_TOKEN = /^([A-Z]{1,5}-\d{1,4})\s+/;

/** Cases-sheet / editability matrix rules — product constraints, not prose. */
const CASES_RULE =
  /\b(cannot be (?:edited|reduced|removed)|no changes are allowed|removal allowed only|must not|shall not|only when|backward compatibility|cannot go below|cannot be reduced|maintain(?:s)? backward compatibility|cannot be edited)\b/i;

export function parseDecisionLine(raw: string): DecisionEntry | null {
  const priority = parsePriorityMatrixRow(raw);
  if (priority) return priority;

  const casesMatrix = parseCasesMatrixRow(raw);
  if (casesMatrix) return casesMatrix;

  const casesRule = parseCasesRuleLine(raw);
  if (casesRule) return casesRule;

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
  let explicitCommitment: DecisionEntry["commitment"] | undefined;
  const { body, suffix } = extractParenSuffix(rest);
  if (suffix && DECISION_STATUS.test(suffix)) {
    status = suffix.match(DECISION_STATUS)![1]!.toLowerCase() as DecisionEntry["status"];
    rest = body;
    foundStatus = true;
  } else if (suffix && DECISION_COMMITMENT.test(suffix)) {
    explicitCommitment = suffix.match(DECISION_COMMITMENT)![1]!.toLowerCase() as DecisionEntry["commitment"];
    rest = body;
    foundStatus = true;
  } else {
    const trailing = splitTrailingKeyword(rest, DECISION_STATUS);
    if (trailing) {
      status = trailing.keyword.toLowerCase() as DecisionEntry["status"];
      rest = trailing.body;
      foundStatus = true;
    } else {
      const commitTrail = splitTrailingKeyword(rest, DECISION_COMMITMENT);
      if (commitTrail) {
        explicitCommitment = commitTrail.keyword.toLowerCase() as DecisionEntry["commitment"];
        rest = commitTrail.body;
        foundStatus = true;
      }
    }
  }
  // Require a ref, a list marker or an explicit status — bare prose is not a decision.
  if (!ref && !item && !foundStatus) return null;
  // A short noun phrase in a list ("Redis", "Docker Swarm") is something the
  // author enumerated, not a position they took. Without a reference or an
  // explicit status, a decision has to read like a statement.
  if (!ref && !foundStatus && rest.split(/\s+/).length < 3 && !/[.!?]$/.test(rest)) return null;
  if (rest.length < 2) return null;
  // Status (proposed/approved/…) and commitment (committed/considered) are
  // both kept — compressing them into one field loses the cognitive layer.
  const commitment =
    explicitCommitment ?? (status === "approved" ? "committed" : readCommitment(rest));
  const entry: DecisionEntry = { text: rest, status, commitment };
  if (ref) entry.ref = ref;
  return entry;
}

/**
 * Acceptance-criteria bullets are procedural requirements, not free text.
 * "Revision number auto-increments…" → Decision (requirement).
 */
export function parseAcceptanceCriterionLine(raw: string): DecisionEntry | null {
  const item = splitListItem(raw);
  if (!item) return null;
  const text = stripEmphasis(item.text.trim());
  if (text.length < 12 || text.length > 320) return null;
  if (/\?/.test(text)) return null;
  if (/^(should|what|who|when|where|why|how)\b/i.test(text)) return null;
  if (parseMetricTargetLine(raw)) return null;
  if (parseCasesRuleLine(raw)) return null;
  // Checklist / procedural shape — verbs of system behavior.
  const procedural =
    /\b(display|displays|visible|auto-?increment|include|includes|available|editable|intact|trigger|triggers|preserve|amend|can amend|export|workflow|columns?|indicator|revision|pdf|permission|traceable)\b/i.test(
      text,
    ) || /^(edit|revision|pdf|vendor|linked|can |display|visual|preserve|amend)/i.test(text);
  if (!procedural && text.split(/\s+/).length < 5) return null;
  if (!procedural && !/^[A-Z]/.test(text)) return null;
  return {
    text: text.slice(0, 500),
    status: "proposed",
    commitment: "committed",
    because: "Acceptance criterion",
  };
}

/**
 * Cases–Sheet matrix rows: field + Y/N flags (+ optional rule remarks).
 * Structured table knowledge — not a blob of OCR text.
 */
export function parseCasesMatrixRow(raw: string): DecisionEntry | null {
  const cells = splitTableRow(raw);
  if (cells && cells.length >= 4) {
    const field = cells[0]!.trim();
    const a = cells[1]!.trim();
    const b = cells[2]!.trim();
    const c = cells[3]!.trim();
    if (!field || /^(module|field|contract)/i.test(field)) return null;
    if (!/^[YNyN\-–.|]+$/i.test(a) || !/^[YNyN\-–.|]+$/i.test(b)) return null;
    const remarks = cells.slice(4).join(" ").trim();
    if (remarks && CASES_RULE.test(remarks)) {
      return {
        text: `${field}: ${remarks}`.slice(0, 500),
        status: "approved",
        commitment: "committed",
      };
    }
    const flags = `${a}/${b}/${c}`.replace(/\|/g, "");
    if (/^[\-–./]+$/i.test(flags) && !remarks) return null;
    return {
      text: (remarks
        ? `${field} [${flags}] — ${remarks}`
        : `${field}: editability ${flags}`
      ).slice(0, 500),
      status: "approved",
      commitment: "committed",
    };
  }

  const item = splitListItem(raw);
  const text = stripEmphasis((item ? item.text : raw).trim());
  // "Vendor Details Y Y N Vendor name cannot be edited…"
  const prose = /^(.{3,80}?)\s+([YNyN])\s+([YNyN\-–])\s+([YNyN\-–])\s+(.+)$/.exec(text);
  if (prose) {
    const field = prose[1]!.trim();
    const remarks = prose[5]!.trim();
    if (/^(module|project|indent number)/i.test(field) && remarks.length < 8) return null;
    if (CASES_RULE.test(remarks) || remarks.length >= 12) {
      return {
        text: `${field}: ${remarks}`.slice(0, 500),
        status: "approved",
        commitment: "committed",
      };
    }
    return {
      text: `${field}: editability ${prose[2]}/${prose[3]}/${prose[4]}`.slice(0, 500),
      status: "approved",
      commitment: "committed",
    };
  }
  return null;
}

/**
 * Reason over Cases-sheet editability rules.
 * "Indent quantity cannot be reduced below…" is a committed product constraint.
 */
export function parseCasesRuleLine(raw: string): DecisionEntry | null {
  const item = splitListItem(raw);
  const text = stripEmphasis((item ? item.text : raw).trim());
  if (text.length < 20) return null;
  if (/^note:/i.test(text)) {
    // "Note: No changes are allowed once the contract is closed."
    if (!CASES_RULE.test(text)) return null;
  } else if (!CASES_RULE.test(text)) {
    return null;
  }
  // Drop pure flag chrome with no rule body (matrix rows handled separately).
  if (/^[A-Za-z /&]+\s+[YNyN\-–](?:\s+[YNyN\-–]){1,3}\s*$/i.test(text)) {
    return null;
  }
  return {
    text: text.replace(/^note:\s*/i, "").slice(0, 500),
    status: "approved",
    commitment: "committed",
  };
}

/** Priority matrix / impact rows are explicit product decisions. */
function parsePriorityMatrixRow(raw: string): DecisionEntry | null {
  const cells = splitTableRow(raw);
  if (!cells || cells.length < 2) return null;
  const priority = cells[0]!.trim();
  if (!/^P\d\b/i.test(priority) && !/^(critical|high|medium|low)\b/i.test(priority)) return null;
  if (/^priority$/i.test(priority)) return null; // header
  const feature = cells[1]!.trim();
  if (feature.length < 3 || /^feature$/i.test(feature)) return null;
  const impact = cells[2]?.trim();
  const text = impact
    ? `${priority}: ${feature} (${impact})`
    : `${priority}: ${feature}`;
  return {
    text,
    status: /^P0\b/i.test(priority) ? "approved" : "proposed",
    commitment: "committed",
    ref: /^P\d\b/i.exec(priority)?.[0]?.toUpperCase(),
  };
}

/* --------------------------------- timeline --------------------------------- */

const TIMELINE_STATE: Array<[RegExp, TimelineEntry["state"]]> = [
  [/\b(shipped|released|launched|live)\b/i, "shipped"],
  [/\b(done|complete|completed|closed)\b/i, "done"],
  [/\b(on[\s-]?track|in\s+progress|underway)\b/i, "on-track"],
  [/\b(planned|planned|upcoming|scheduled|next|todo)\b/i, "planned"],
];

const TRAILING_STATE = /\b(shipped|released|launched|live|done|complete|completed|closed|on[\s-]?track|in\s+progress|underway|planned|upcoming|scheduled)\b/i;

/** Phase / Step / Stage markers — delivery order without a calendar date. */
const ORDINAL_DATE =
  /^(phase|step|stage|milestone|sprint|task|iteration)\s+([0-9]{1,3}|[a-z]|[ivxlc]+)\b/i;

/** Invoice / policy obligation date labels. */
const OBLIGATION_DATE_LABEL =
  /^(due(?:\s+date)?|dated|date|effective(?:\s+date)?|invoice\s+date|payment\s+due|as\s+of)\s*[:—–-]?\s*(.+)$/i;

/** Ticket / itinerary leg labels. */
const LEG_LABEL = /^(departure|arrival|depart(?:s|ing)?|arriv(?:e|es|al|ing)?)\s*[:—–-]?\s*(.+)$/i;

export function parseTimelineLine(raw: string): TimelineEntry | null {
  const item = splitListItem(raw);
  const cells = splitTableRow(raw);
  if (cells && cells.length >= 2 && cells[0] && looksLikeDate(cells[0])) {
    const state = stateFromText(cells[2] ?? "") ?? "planned";
    return { date: cells[0], title: cells[1]!, state, ...inferArtifact(cells.slice(1).join(". ")) };
  }
  // Ticket tables: PSTD-5922 | PO edit history… | Prioritised
  if (cells && cells.length >= 2 && /^[A-Z]{2,}-\d+/i.test(cells[0]!)) {
    if (/^ticket$/i.test(cells[0]!)) return null;
    const state = /priorit/i.test(cells[2] ?? "") ? "planned" : stateFromText(cells[2] ?? "") ?? "planned";
    return { date: cells[0]!, title: cells[1]!, state };
  }
  const text = (item ? item.text : raw).trim();

  // "Due date: 2026-08-14" / "Dated: 2026-07-15" / "Effective date: 2026-04-01"
  const obligation = parseObligationDateLine(text);
  if (obligation) return obligation;

  // "Departure: Copenhagen (CPH) · 2026-08-12 09:40 · Gate B12"
  const leg = parseLegTimelineLine(text);
  if (leg) return leg;

  // "Phase 1: Capture edit history schema — planned"
  const ordinal = ORDINAL_DATE.exec(text);
  if (ordinal) {
    const marker = `${capitalizeWord(ordinal[1]!)} ${ordinal[2]!.toUpperCase()}`;
    let rest = text.slice(ordinal[0].length).replace(/^\s*[:—–-]\s*/, "").trim();
    let state: TimelineEntry["state"] | undefined;
    const trailing = splitTrailingKeyword(rest, TRAILING_STATE);
    if (trailing && trailing.keyword.length <= 24) {
      state = stateFromText(trailing.keyword);
      if (state) rest = trailing.body;
    }
    if (!state) state = stateFromText(rest) ?? "planned";
    if (rest.length < 2) rest = marker;
    return { date: marker, title: rest, state, ...inferArtifact(rest) };
  }

  const dateMatch = DATE_TOKEN.exec(text);
  let date: string;
  let rest: string;
  if (dateMatch) {
    date = dateMatch[1]!.replace(/\.$/, "").replace(/\s+/g, " ").trim();
    rest = text.slice(dateMatch[0].length).replace(/^\s*[:—–-]\s*/, "").trim();
  } else {
    // "Ship the beta next week" — the time phrase sits in the sentence.
    const found = findDateToken(text);
    if (!found) return null;
    date = found.date;
    rest = `${text.slice(0, found.index)} ${text.slice(found.index + found.length)}`
      .replace(/\s+/g, " ")
      .replace(/^\s*[:—–-]\s*|\s*[:—–-]\s*$/g, "")
      .trim();
  }
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

/** Parse "Due date: 2026-08-14" style obligation lines into Timeline entries. */
export function parseObligationDateLine(text: string): TimelineEntry | null {
  const match = OBLIGATION_DATE_LABEL.exec(text.trim());
  if (!match) return null;
  const label = match[1]!.trim();
  const remainder = match[2]!.trim();
  const found = findDateToken(remainder) ?? (looksLikeDate(remainder) ? { date: remainder, index: 0, length: remainder.length } : null);
  if (!found) return null;
  const title =
    `${label.replace(/\b\w/g, (c) => c.toUpperCase())}: ${remainder}`.slice(0, 200) || remainder;
  return {
    date: found.date,
    title,
    state: /due|payment/i.test(label) ? "planned" : "done",
  };
}

/** Parse departure/arrival itinerary legs with an embedded calendar date. */
export function parseLegTimelineLine(text: string): TimelineEntry | null {
  const match = LEG_LABEL.exec(text.trim());
  if (!match) return null;
  const kind = /arriv/i.test(match[1]!) ? "Arrival" : "Departure";
  const remainder = match[2]!.trim();
  const found = findDateToken(remainder);
  if (!found) return null;
  // Prefer "2026-08-12 09:40" when a time follows the date.
  const after = remainder.slice(found.index + found.length);
  const time = /^\s*[·,]?\s*(\d{1,2}:\d{2})\b/.exec(after);
  const date = time ? `${found.date} ${time[1]}` : found.date;
  const title = `${kind}: ${remainder}`.replace(/\s+/g, " ").trim();
  return { date, title, state: "planned" };
}

function capitalizeWord(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
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

/**
 * First-class user stories / personas.
 * "User Story: I want…" and "Persona: As a Purchase Manager" must not dissolve
 * into acceptance-criteria decisions during compression.
 */
export function parseUserStoryLine(raw: string): ActionEntry | null {
  const item = splitListItem(raw);
  const text = stripEmphasis((item ? item.text : raw).trim());
  if (text.length < 12) return null;

  const story = /^(?:user\s*story|story)\s*[:—–-]\s*(.+)$/i.exec(text);
  if (story) {
    return {
      task: `User story: ${story[1]!.trim()}`.slice(0, 500),
      // Source facts from the PRD — not suggested work.
      status: "pending",
    };
  }

  const persona = /^(?:persona\s*[:—–-]\s*)?(as an?\s+.+)$/i.exec(text);
  if (persona && !/\bi want\b/i.test(text)) {
    return {
      task: `Persona: ${persona[1]!.trim()}`.slice(0, 240),
      status: "pending",
    };
  }

  // Bare "I want to…" under a persona section is still a user story.
  if (/^i want\b/i.test(text) && text.length >= 20) {
    return {
      task: `User story: ${text}`.slice(0, 500),
      status: "pending",
    };
  }

  return null;
}

export function parseActionLine(raw: string): ActionEntry | null {
  const story = parseUserStoryLine(raw);
  if (story) return story;
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
  const question = parseOpenQuestionLine(raw);
  if (question) return question;
  const metric = parseMetricTargetLine(raw);
  if (metric) return metric;
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
  // Empty-section recovery only: a qualitative criterion with no measured value.
  return { label: text.slice(0, 120) };
}

/** High-confidence signal salvage when the section already has entries. */
export function parseSignalSalvage(raw: string): SignalEntry | null {
  return parseOpenQuestionLine(raw) ?? parseMetricTargetLine(raw) ?? parseSignalLine(raw);
}

export function parseDecisionLineLenient(raw: string): DecisionEntry | null {
  const cases = parseCasesRuleLine(raw) ?? parseCasesMatrixRow(raw);
  if (cases) return cases;
  const requirement = parseAcceptanceCriterionLine(raw);
  if (requirement) return requirement;
  const strict = parseDecisionLine(raw);
  if (strict) return strict;
  const text = entryText(raw);
  if (!text) return null;
  // Bare prose without a list marker is not a decision — Cases/OCR rules above.
  if (!splitListItem(raw)) return null;
  // A bare noun ("Redis") is an item in a list, not a position someone took.
  if (text.split(/\s+/).length < 2) return null;
  // Preserve commitment metadata; never invent approved/rejected.
  return { text, status: "proposed", commitment: readCommitment(text) };
}

export function parseTimelineLineLenient(raw: string): TimelineEntry | null {
  const text = entryText(raw);
  if (!text) return null;
  const strict = parseTimelineLine(raw);
  if (strict) return strict;
  // "Ship the beta tomorrow" / "Pilot runs Jan–Jun" — date need not lead the line.
  const found = findDateToken(text);
  if (!found) return null;
  const title = `${text.slice(0, found.index)} ${text.slice(found.index + found.length)}`
    .replace(/\s+/g, " ")
    .replace(/^\s*[:—–-]\s*|\s*[:—–-]\s*$/g, "")
    .trim();
  if (title.length < 2) return null;
  return {
    date: found.date,
    title,
    state: stateFromText(text) ?? "planned",
    ...inferArtifact(title),
  };
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
  const story = parseUserStoryLine(raw);
  if (story) return story;
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
