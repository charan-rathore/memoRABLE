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
  // Day-first ("18 November 2026", "7 December") - the dominant
  // Indian/international shape - sits before the month-first forms so the
  // whole span is one token and the day is never orphaned in the title.
  `\\d{1,2}\\s+${MONTH}\\.?(?:\\s*,?\\s*${YEAR})?`,
  `${MONTH}\\.?\\s+\\d{1,2}(?:,\\s*${YEAR})?`,
  `${MONTH}\\.?\\s+${YEAR}`,
  `${MONTH}\\.?`,
  `Q[1-4](?:[ /]?${YEAR})?`,
  `${YEAR}-\\d{2}-\\d{2}`,
  // Numeric month/year ("01/2024", "1-2024") before the day/month form so the
  // year is never split off as a bare-year token.
  `(?:0?[1-9]|1[0-2])[\\/-](?:19|20)\\d{2}`,
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
  `\\d{1,2}\\s+${MONTH}\\.?(?:\\s*,?\\s*${YEAR})?`,
  `${MONTH}\\.?\\s+\\d{1,2}(?:,\\s*${YEAR})?`,
  `${MONTH}\\.?\\s+${YEAR}`,
  `Q[1-4](?:[ /]?${YEAR})?`,
  `${YEAR}-\\d{2}-\\d{2}`,
  // Same numeric month/year guard as DATE_ATOM: keep "01/2024" one token.
  `(?:0?[1-9]|1[0-2])[\\/-](?:19|20)\\d{2}`,
  `\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2,4})?`,
  `Week\\s+\\d{1,2}`,
  `Sprint\\s+\\d{1,2}`,
  YEAR,
].join("|");
const DATE_ANYWHERE = new RegExp(`\\b(${DATE_EMBEDDED})\\b`, "i");

const DATE_ENTIRE = new RegExp(`^(?:${DATE_EMBEDDED})$`, "i");

/** True when the whole string is a date phrase ("January 2024"), unlike a name that starts with one ("May Lee"). */
export function isEntirelyDate(text: string): boolean {
  const trimmed = text.trim();
  return DATE_ENTIRE.test(trimmed) && !structurallyUnusableDate(trimmed, 0, trimmed.length);
}

export function looksLikeDate(text: string): boolean {
  const trimmed = text.trim();
  const match = DATE_TOKEN.exec(trimmed);
  return match !== null && !unusableDateToken(trimmed, 0, match[0].length);
}

/** True when the match at `index` is really the numeric tail of a
 * hyphenated identifier ("RFC-1-2024"): an identifier run with a letter in
 * it ends right where the match starts. Pure digit runs stay dates, so
 * "2024-2025" still parses as a year range. */
function insideIdentifier(text: string, index: number): boolean {
  let i = index - 1;
  while (i >= 0 && /[A-Za-z0-9]/.test(text[i]!)) i -= 1;
  if (i < 0 || !/[-\/_.]/.test(text[i]!)) return false;
  for (let j = i - 1; j >= 0 && /[A-Za-z0-9_./-]/.test(text[j]!); j -= 1) {
    if (/[A-Za-z]/.test(text[j]!)) return true;
  }
  return false;
}

/** Units that make a preceding "n/m" token a measured fraction, not a date.
 * Lowercase only, so a heading like "10/24 Hours: 9-5" is not a quantity. */
const FRACTION_UNITS =
  /^(?:\s+|-)(?:cups?|tsp|tbsp|teaspoons?|tablespoons?|kgs?|gms?|mg|ml|cl|litres?|liters?|oz|lbs?|pounds?|inch(?:es)?|cms?|mm|kms?|metres?|meters?|ft|feet|hours?|hrs?|minutes?|mins?|seconds?|secs?|dozen|plates?|scoops?|servings?|slices?|glasses?|packets?|bowls?|handfuls?|pinch(?:es)?|g|l|m)\b(?!\s*:)/;

/** True when a numeric "n/m" token at `index` measures something: a proper
 * fraction followed by a unit ("1/2 cup", "1/2-inch", "1/2%"), the tail of a
 * standalone mixed number ("2 1/2 hours"), or a rating after its label's
 * colon ("SQL: 4/5") — rather than a month/day date. */
function isQuantityFraction(text: string, index: number, length: number): boolean {
  const token = text.slice(index, index + length);
  const parts = /^(\d{1,2})\/(\d{1,2})$/.exec(token);
  if (!parts) return false;
  const before = text.slice(0, index);
  // A rating after a label, not a date: "SQL and data modeling: 4/5",
  // "Ease of use: 10/10". Scores sit right after their label's colon.
  if (
    (parts[2] === "5" || parts[2] === "10") &&
    Number(parts[1]) <= Number(parts[2]) &&
    /:\s*$/.test(before)
  ) {
    return true;
  }
  // A real fraction: numerator below denominator, denominator a common one.
  if (Number(parts[1]) >= Number(parts[2]) || Number(parts[2]) > 16) return false;
  // "2 1/2": a standalone number, not the end of an identifier like "v2".
  if (/(?:^|[^\w.\-/])\d+\s+$/.test(before)) return true;
  const after = text.slice(index + length);
  if (/^\s*%/.test(after)) return true;
  return FRACTION_UNITS.test(after);
}

/** True when `text` opens with a measured fraction ("1/2 cup flour"). */
function startsWithQuantityFraction(text: string): boolean {
  const m = /^\d{1,2}\/\d{1,2}/.exec(text);
  return m !== null && isQuantityFraction(text, 0, m[0].length);
}

const MONTH_LENGTHS: Record<string, number> = {
  jan: 31, feb: 28, mar: 31, apr: 30, may: 31, jun: 30,
  jul: 31, aug: 31, sep: 30, oct: 31, nov: 31, dec: 31,
};

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * A matched token with a day number must name a day that exists: "31
 * February 2026", "32 January 2026", "0 May 2026" and "29 February 2027"
 * are not dates, whatever the pattern matched. February 29 without a year
 * cannot be disproved, so it stands; with a year it needs a leap year.
 */
function invalidCalendarDate(token: string): boolean {
  const trimmed = token.trim();
  const dayFirst = /^(\d{1,2})\s+([A-Za-z]+)\.?(?:\s*,?\s*((?:19|20)\d{2}))?$/.exec(trimmed);
  const monthFirst = /^([A-Za-z]+)\.?\s+(\d{1,2})(?:,\s*((?:19|20)\d{2}))?$/.exec(trimmed);
  let dayText: string | undefined;
  let monthText: string | undefined;
  let yearText: string | undefined;
  if (dayFirst) {
    [, dayText, monthText, yearText] = dayFirst;
  } else if (monthFirst) {
    [, monthText, dayText, yearText] = monthFirst;
  } else {
    return false;
  }
  const length = MONTH_LENGTHS[monthText!.toLowerCase().replace(/\.$/, "").slice(0, 3)];
  if (length === undefined) return false;
  const day = Number(dayText);
  if (day < 1) return true;
  if (day <= length) return false;
  if (day === 29 && monthText!.toLowerCase().startsWith("feb")) {
    return yearText !== undefined && !isLeapYear(Number(yearText));
  }
  return true;
}

/**
 * A day-first span ("31 May", "18 November 2026") is a date only on
 * structural evidence, never on the token alone. The evidence is bounded
 * and positional: a label colon ("Check-in: 7 December after 14:00"), a
 * weekday prefix ("Sunday, 7 December 2026"), or a date-governing
 * preposition right before it ("by 15 June 2027", "due 15 January 2027",
 * "after 18 November 2026"); at the very start of a line, closing
 * punctuation or the line end must pin it down ("19 October: picked up").
 * Mid-line without such a lead-in, the span must carry its year and be
 * closed by punctuation or the line end ("given 12 September 2026, no
 * reactions").
 * Anything else - a quantity, a version number, a modal "may" - keeps its
 * words: "We sold 31 May products", "Version 1 May, improve performance",
 * "We shipped 18 November 2026 widgets". Misses fail toward no date,
 * never toward consumed words.
 */
const DAY_FIRST_SHAPE = new RegExp(`^\\d{1,2}\\s+${MONTH}\\.?(?:\\s*,?\\s*${YEAR})?$`, "i");
// Positional evidence for a day-first span. A trailing closure (punctuation
// or the line end) pins a year-ful span anywhere ("given 12 September 2026,
// no reactions"; "Delivery by 18 November 2026") and a year-less span at the
// start of a line ("19 October:", "2 October, Swiggy"). An unclosed span
// needs an explicit bounded date label: a bare colon, preposition, weekday,
// or line position alone is not evidence, so "Version: 1 may improve
// performance", "Change from 1 May improve throughput", "We shipped 18
// November 2026 widgets", and "We sold 31 May. Revenue rose" are never
// dates. Obligation lines are governed by their label, so
// parseObligationDateLine pins a calendar-valid head date without a closure.
// Misses fail toward no date, never toward consumed words.
const DATE_LABEL_COLON =
  /(?:^|[\s(])(?:(?:payment\s+)?due(?:\s+date)?|dated|date|effective(?:\s+date)?|invoice\s+date|as\s+of|check-in|check-out|departure|arrival|deadline)\s*:\s*$/i;
const LINE_CLOSURE = /^\s*[,;.:\-—–)]/;
const CLOCK_SUFFIX = /^\s+at\s+(\d{2}):(\d{2})/i;

/** A complete, valid clock closes a year-bearing day-first date the way
 * punctuation does: "Return flight 17 November 2026 at 19:45". The clock
 * must be exactly two-digit HH:MM, a real time (00:00-23:59), and a
 * standalone token: it ends the line or meets the ordinary punctuation
 * closure, where the punctuation is not itself a numeric extension —
 * seconds ("06:10:30"), malformed colon tails ("06:10:99", "06:10:",
 * "06:10:1234"), decimals ("06:10.123"), and ranges ("06:10-99") never
 * close, while "06:10, from HYD" and "06:10: approval needed" do. A
 * location, AM/PM, a timezone, a partial clock, or any further words
 * after the clock leave the date unclosed. The clock text is never
 * consumed here; it stays in the surrounding words. */
function closedByClock(after: string): boolean {
  const clock = CLOCK_SUFFIX.exec(after);
  if (!clock) return false;
  if (Number(clock[1]) > 23 || Number(clock[2]) > 59) return false;
  const rest = after.slice(clock[0].length);
  if (/^\s*$/.test(rest)) return true;
  if (!LINE_CLOSURE.test(rest)) return false;
  // The boundary is inspected with whitespace normalized: spacing never
  // turns a numeric continuation into prose. A digit after the clock
  // punctuation, however spaced, is a malformed numeric extension
  // ("06:10: 30", "06:10 :99", "06:10 .123", "06:10 -99"), and a
  // dangling terminal colon is malformed with or without a space
  // ("06:10:", "06:10 :"); neither closes the date. Punctuation followed
  // by prose still closes under the original contract. Source and title
  // are never normalized.
  if (/^\s*:\s*$/.test(rest)) return false;
  return !/^\s*[,;.:\-—–)]\s*\d/.test(rest);
}

function dayFirstWithoutEvidence(text: string, index: number, length: number): boolean {
  const token = text.slice(index, index + length);
  if (!DAY_FIRST_SHAPE.test(token)) return false;
  // An explicit bounded date label governs its span, closed or not:
  // "Check-in: 7 December, after 14:00".
  if (DATE_LABEL_COLON.test(text.slice(0, index))) return false;
  const after = text.slice(index + length);
  const closed = /^\s*$/.test(after) || LINE_CLOSURE.test(after);
  if (new RegExp(`${YEAR}$`).test(token)) return !(closed || closedByClock(after));
  if (closed) return index !== 0;
  return true;
}

/** A bare quarter/half token with no year ("Q3", "H2"): the weakest date. */
const BARE_PERIOD = /^(?:Q[1-4]|H[12])$/i;

/** The calendar-anchored subset of DATE_ATOM: digit-bearing tokens that
 * name a specific usable calendar date or month — day+month forms,
 * month+year, ISO dates, and numeric day/month or month/year forms.
 * Everything else people write is deliberately excluded: relative phrases
 * ("in 2 weeks", "next week"), numbered cycles ("Week 4", "Sprint 5"),
 * fiscal and period tokens ("FY26", "H2 2026", "Q4 2027"), month ranges,
 * bare years, and bare months (a bare month is never returned mid-line and
 * must not become a candidate: "May Lee" and modal "may" are not dates). */
const CALENDAR_DATE = new RegExp(
  `^(?:` +
    `\\d{1,2}\\s+${MONTH}\\.?(?:\\s*,?\\s*${YEAR})?` +
    `|${MONTH}\\.?\\s+\\d{1,2}(?:,\\s*${YEAR})?` +
    `|${MONTH}\\.?\\s+${YEAR}` +
    `|${YEAR}-\\d{2}-\\d{2}` +
    `|(?:0?[1-9]|1[0-2])[\\/-]${YEAR}` +
    `|\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2,4})?` +
  `)$`,
  "i",
);

/** invalidCalendarDate covers the named-month forms; the ISO and numeric
 * shapes need the same rigor before one can be promoted over a period
 * token — "2026-02-31" and "32/13/2026" are not dates. */
function impossibleCalendarDate(token: string): boolean {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(token);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (month < 1 || month > 12 || day < 1) return true;
    const lengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return day > lengths[month - 1]!;
  }
  const numeric = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(token);
  if (numeric) {
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    // Ambiguous order: the second field must be a possible month, the
    // first a possible day; when the first cannot be a month it is the
    // day, so it is checked against that month's length. Yearless dates
    // are checked against the leap-permissive length, so "31/04" and
    // "30/02" are impossible every year while "29/02" stays possible.
    if (second < 1 || second > 12 || first < 1 || first > 31) return true;
    if (first > 12) {
      const year = numeric[3] ? Number(numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3]) : undefined;
      const feb = year === undefined ? 29 : isLeapYear(year) ? 29 : 28;
      const lengths = [31, feb, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      return first > lengths[second - 1]!;
    }
  }
  return false;
}

/** A fiscal token ("FY 2025", "FY26") or a bare year ("2027") is a
 * period, not a usable calendar date — the same weakest-date class as a
 * bare quarter/half. Written alone it stays the date ("FY26 results
 * declared", "Target 2027 for the full rollout"); it never outranks a
 * specific calendar date later in the same line. */
const FISCAL_YEAR = /^FY\s*(?:(?:19|20)\d{2}|\d{2})$/i;
const BARE_YEAR_TOKEN = new RegExp(`^${YEAR}$`);
function weakTimelineFirstDate(token: string): boolean {
  const t = token.trim();
  return BARE_PERIOD.test(t) || FISCAL_YEAR.test(t) || BARE_YEAR_TOKEN.test(t);
}

/** Timeline date selection: a weak token never outranks a specific
 * calendar date later in the same line — "File Q3 GST by 10 November 2026"
 * is due 10 November 2026 and the quarter stays in the title as words;
 * "Interest for FY 2025-26 at 8.25% credited October 10, 2026" is dated
 * October 10, 2026 and the whole fiscal range stays in the title as words
 * (admitting "FY 2025" also left the "-26" residue dangling). A later
 * token counts only when it matches CALENDAR_DATE exactly and is a
 * possible calendar date: relative phrases, numbered cycles, fiscal/period
 * tokens, bare months, bare years, and impossible dates ("2026-02-31",
 * "32/13/2026") never displace the first token, and a line-leading marker
 * ("Q3: …") is untouched here. */
function findTimelineDateToken(text: string): { date: string; index: number; length: number } | null {
  const first = findDateToken(text);
  if (!first || !weakTimelineFirstDate(first.date)) return first;
  let offset = first.index + first.length;
  while (offset < text.length) {
    const next = findDateToken(text.slice(offset));
    if (!next) break;
    const candidate = {
      date: next.date,
      index: offset + next.index,
      length: next.length,
    };
    const candidateText = candidate.date.trim();
    if (CALENDAR_DATE.test(candidateText) && !impossibleCalendarDate(candidateText)) {
      return candidate;
    }
    offset = candidate.index + candidate.length;
  }
  return first;
}

/**
 * A 4+ digit run right after a year-less day-bearing token is the author's
 * year, whether or not it parsed ("29 February 2100", "18 November
 * 20261", "18 November 2026abc"). Never silently drop it and keep the day.
 */
const YEARLESS_DAY_BEARING = new RegExp(
  `^(?:\\d{1,2}\\s+${MONTH}\\.?|${MONTH}\\.?\\s+\\d{1,2})$`,
  "i",
);
const YEAR_LIKE_AFTER = /^\s*,?\s*\d{4}\w*/;

/** Position-independent guards every date-token consumer shares: not a
 * measured quantity ("1/2 teaspoon"), a real calendar date, and no dropped
 * bare year after a year-less span ("18 November 20261"). */
function structurallyUnusableDate(text: string, index: number, length: number): boolean {
  if (isQuantityFraction(text, index, length)) return true;
  const token = text.slice(index, index + length);
  if (invalidCalendarDate(token)) return true;
  return (
    YEARLESS_DAY_BEARING.test(token) &&
    YEAR_LIKE_AFTER.test(text.slice(index + length))
  );
}

/** Shared guard for every date-token consumer. */
function unusableDateToken(text: string, index: number, length: number): boolean {
  return (
    structurallyUnusableDate(text, index, length) ||
    dayFirstWithoutEvidence(text, index, length)
  );
}

/** Find a date/time phrase anywhere in text; returns the matched span. */
export function findDateToken(text: string): { date: string; index: number; length: number } | null {
  const anywhere = new RegExp(DATE_ANYWHERE.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = anywhere.exec(text)) !== null) {
    if (insideIdentifier(text, match.index)) continue;
    if (isQuantityFraction(text, match.index, match[0].length)) continue;
    if (isPhoneLikeNumber(text, match.index, match[0])) continue;
    if (unusableDateToken(text, match.index, match[0].length)) continue;
    return {
      date: match[1]!.replace(/\.$/, "").replace(/\s+/g, " ").trim(),
      index: match.index,
      length: match[0].length,
    };
  }
  return null;
}

const BARE_YEAR = /^(?:19|20)\d{2}$/;
const PHONE_LEAD_IN = /\b(?:at|call|dial|phon(?:e|ed)|tel(?:ephone)?|helpline|contact|whatsapp)\s*$/i;

/**
 * A bare 4-digit run that sits in a phone-number context ("at 1912 (24x7
 * helpline)", "Call 1800 425 1912") is a digit string, not a calendar year.
 * Years with a month/day attached are unaffected - those never look like
 * phone fragments.
 */
function isPhoneLikeNumber(text: string, index: number, matched: string): boolean {
  if (!BARE_YEAR.test(matched)) return false;
  const before = text.slice(0, index);
  if (PHONE_LEAD_IN.test(before)) return true;
  // Adjacent to another bare digit group: part of a longer number string.
  if (/\d[\d ]$/.test(before)) return true;
  const after = text.slice(index + matched.length);
  if (/^ ?\d{2,}/.test(after)) return true;
  return false;
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
  // Column headers / section labels are not decisions.
  if (/^(business impact|priority|feature|status|summary|overview)$/i.test(text.replace(/['"`]/g, "").trim())) {
    return null;
  }
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
  /^(due(?:\s+date)?|dated|date|effective(?:\s+date)?|invoice\s+date|payment\s+due(?:\s+date)?|as\s+of)\s*[:—–-]?\s*(.+)$/i;

/** Ticket / itinerary leg labels. */
const LEG_LABEL = /^(departure|arrival|depart(?:s|ing)?|arriv(?:e|es|al|ing)?)\s*[:—–-]?\s*(.+)$/i;

/**
 * Title remainder once a mid-sentence date is lifted out. The date's lead-in
 * preposition ("on", "by", "in"…) goes with it when what follows is the end,
 * punctuation, or another preposition - a colon starts a new segment, so a
 * preposition before it governed the vanished date ("Late fee after <date>:
 * Rs 1,300" keeps no "after"). No doubled commas or stranded punctuation are
 * left behind.
 */
export function titleAroundRemovedDate(text: string, index: number, length: number): string {
  const after = text.slice(index + length);
  // Drop the date's lead-in preposition only when it cannot govern what
  // follows: end of text, punctuation, or another preposition ("21:05 on
  // December 20, arrive…", "pilot … by November 15", "House on December 18
  // after 14:00"). Otherwise it heads the phrase the date sat inside —
  // "Move to March 2026 pricing" must not lose its "to".
  const rest = after.trimStart();
  const strippable =
    rest === "" ||
    /^[,;.:]/.test(rest) ||
    /^(?:on|by|from|at|in|before|after|until|to|for|with)\b/i.test(rest);
  const before = strippable
    ? text
        .slice(0, index)
        .replace(/\s+(?:on|by|from|at|in|before|after|until|to)\s*$/i, "")
    : text.slice(0, index);
  return `${before} ${after}`
    .replace(/\s+/g, " ")
    .replace(/\s+([,;:.])/g, "$1")
    .replace(/,\s*,+/g, ",")
    // "Check-in: <date>, after 14:00" reads "Check-in: after 14:00".
    .replace(/([:;]),/g, "$1")
    .replace(/^[\s,.:—–-]+|[\s,:—–-]+$/g, "")
    // A separator left right before the line's terminal period is residue of
    // the removed date: "Next due: <date>." reads "Next due.", never "Next
    // due:.".
    .replace(/([:;,—–-])\.$/, ".")
    .trim();
}

export function parseTimelineLine(raw: string): TimelineEntry | null {
  const item = splitListItem(raw);
  const cells = splitTableRow(raw);
  if (cells && cells.length >= 2 && cells[0] && looksLikeDate(cells[0]) && !startsWithQuantityFraction(cells[0])) {
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
  if (
    dateMatch &&
    !isQuantityFraction(text, 0, dateMatch[0].length) &&
    !unusableDateToken(text, 0, dateMatch[0].length)
  ) {
    date = dateMatch[1]!.replace(/\.$/, "").replace(/\s+/g, " ").trim();
    rest = text.slice(dateMatch[0].length).replace(/^\s*[:—–,-]\s*/, "").trim();
  } else {
    // "Ship the beta next week" — the time phrase sits in the sentence.
    const found = findTimelineDateToken(text);
    if (!found) return null;
    date = found.date;
    rest = titleAroundRemovedDate(text, found.index, found.length);
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
  // The label is the date evidence for the remainder's head: a calendar-valid
  // date there needs no closure ("Date: 2 December 2026 and 3 December 2026"
  // lifts the first date). A later date uses the ordinary guarded scan.
  const head = DATE_TOKEN.exec(remainder);
  const found = (head && !structurallyUnusableDate(remainder, 0, head[0].length) ? { date: head[1]!, index: 0, length: head[0].length } : null) ??
    findDateToken(remainder) ?? (looksLikeDate(remainder) && !startsWithQuantityFraction(remainder) ? { date: remainder, index: 0, length: remainder.length } : null);
  if (!found) return null;
  // The date lives in the date field; repeating it in the title reads as a
  // copy error ("Due Date: 5 November 2026"). When the remainder holds
  // nothing but the date, the label alone is the title.
  const residue = titleAroundRemovedDate(remainder, found.index, found.length);
  const base = label.replace(/\b\w/g, (c) => c.toUpperCase());
  const title = (residue ? `${base}: ${residue}` : base).slice(0, 200) || remainder;
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

/** Header furniture of a task table. A row is a heading row only when every one of its first cells is a header word, so an owner named Price or a task called Notes still parses. */
const TASK_HEADER_CELL =
  /^(tasks?|actions?|action\s+items?|task\s+items?|items?|descriptions?|task\s+descriptions?|deliverables?|steps?|activity|activities|owners?|assignees?|assigned\s+to|responsible|due(?:\s+dates?)?|deadlines?|status|amounts?|costs?|prices?|notes?)$/i;

/** A task table's heading row ("Task | Owner | Due") is furniture, not work. */
export function isTaskTableHeaderRow(raw: string): boolean {
  const cells = splitTableRow(raw);
  if (!cells || cells.length < 2 || !cells[0] || !cells[1]) return false;
  return cells
    .slice(0, Math.min(3, cells.length))
    .every((c) => TASK_HEADER_CELL.test(c.trim()));
}

/** Re-map a parsed task row using the table's own header schema: with a
 * "Task | Status | Notes" header, "Ready" is a status, never an owner. */
export function remapActionEntryByHeader(
  entry: ActionEntry,
  cells: string[],
  headerCells: string[],
): ActionEntry {
  const colIdx = (re: RegExp): number => headerCells.findIndex((c) => re.test(c));
  const ownerIdx = colIdx(/^(owners?|assignees?|assigned\s*to|responsible)$/);
  const dueIdx = colIdx(/^(due(\s*dates?)?|deadlines?)$/);
  const statusIdx = colIdx(/^status$/);
  const task = (cells[0] ?? "").trim();
  if (task.length < 3) return entry;
  const statusText = statusIdx >= 0 ? (cells[statusIdx] ?? "").trim() : "";
  const out: ActionEntry = {
    ...entry,
    task,
    status: statusText ? inferReadiness(statusText) : inferReadiness(task),
  };
  delete out.owner;
  delete out.due;
  const owner = ownerIdx >= 0 ? (cells[ownerIdx] ?? "").trim() : "";
  const due = dueIdx >= 0 ? (cells[dueIdx] ?? "").trim() : "";
  if (owner) out.owner = owner;
  if (due) out.due = due;
  return out;
}

export function parseActionLine(raw: string): ActionEntry | null {
  const story = parseUserStoryLine(raw);
  if (story) return story;
  if (isTaskTableHeaderRow(raw)) return null;
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
    // An "owner" that is itself a date is a date range, not a person:
    // "Role — January 2024 – June 2025" is an entity title, not a todo.
    // An owner that IS a date (or range fragment) is an entity title, but a
    // person named May/June/August must survive: reject date SEGMENTS and
    // bare-month range fragments ("Role - January - June 2025"), not names.
    // The month set is exact: a name that merely starts like a month
    // ("Jane", "Marsh", "Augusta") is a person, not a fragment.
    const MONTH_WORD =
      "(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)";
    const bareMonthOwner = new RegExp(`^${MONTH_WORD}\\.?$`, "i").test(owner);
    // A segment that BEGINS with an unambiguous date (month + year) is a
    // range start with metadata, not a person: "January 2024 (Remote)".
    // A name like "May Lee" has no year and survives.
    const datePrefixedOwner = new RegExp(`^${MONTH_WORD}\\.?\\s+\\d{4}\\b`, "i").test(owner);
    if (looksLikeDate(due) && !DATE_ENTIRE.test(owner.trim()) && !bareMonthOwner && !datePrefixedOwner && owner.length <= 60 && task.length >= 3) {
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
    if (ownerMatch && dueMatch && !unusableDateToken(tail!, 0, dueMatch[0].length) && task!.length >= 3) {
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
  if (/^(business impact|priority|feature|status|summary|overview)$/i.test(text)) return null;
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
  // Header furniture is not a leftover either.
  if (isTaskTableHeaderRow(raw)) return null;
  const text = entryText(raw);
  if (!text) return null;
  const strict = parseActionLine(raw);
  if (strict) return strict;
  const item = splitListItem(raw);
  const entry: ActionEntry = { task: text, status: inferReadiness(text, { checked: item?.done }) };
  const dueMatch = DATE_TOKEN.exec(text);
  if (dueMatch && !unusableDateToken(text, 0, dueMatch[0].length)) entry.due = dueMatch[1]!.replace(/\.$/, "");
  return entry;
}
