/**
 * Entity grouping — a title line owns its bullets.
 *
 * Real documents file details under entities: a resume project owns its
 * accomplishment bullets, a role owns its highlights, a workstream owns its
 * todos. The flat line→entry pass cannot see that, so every bullet became its
 * own card (and every card looked like a pending todo). This pass detects the
 * shape — an emphasized or date-bearing title line directly followed by list
 * items — and keeps the bullets as evidence-linked details of one entry.
 *
 * Doc-type agnostic: it keys off emphasis/date structure any document uses,
 * never off resume vocabulary.
 */

import type { ActionEntry, TimelineEntry } from "@/domain/memory/schema";
import { LIMITS } from "@/domain/memory/limits";
import { inferReadiness } from "@/understanding/inference";
import {
  findDateToken,
  isDecorativeLine,
  isListLike,
  isTableSeparator,
  plainContentOf,
  splitTableRow,
  splitListItem,
} from "./patterns";

export interface GroupLine {
  text: string;
  lineNo: number;
}

export interface EntityGroup {
  titleLine: GroupLine;
  detailLines: GroupLine[];
}

/** A line that opens with an emphasized span: "**ThermoSense** June 2025". */
const BOLD_LEAD = /^\s*\*\*[^*]+\*\*/;

const MONTH_NAME =
  /(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)/i;

export interface DateRange {
  start: string;
  end: string;
  /** Span of the whole range expression inside the original text. */
  index: number;
  length: number;
  /** True for "January 2024 – Present": the entity is still active. */
  open?: boolean;
}

const MONTH_INDEX: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Find "September 2025 – November 2025" / "Jan–Jun 2025" / "2022 – 2026"
 * inside a title line. Returns null when the line carries at most one date.
 */
export function findDateRange(text: string): DateRange | null {
  const first = findDateToken(text);
  if (!first) return null;

  // Single token already spanning two months: "Jan–Jun 2025".
  const twoMonths = new RegExp(
    `^(${MONTH_NAME.source})\\.?\\s*[-–—]\\s*(${MONTH_NAME.source})\\.?(\\s+(?:19|20)\\d{2})?$`,
    "i",
  ).exec(first.date);
  if (twoMonths) {
    const year = twoMonths[3]?.trim() ?? "";
    return {
      start: `${twoMonths[1]}${year ? ` ${year}` : ""}`,
      end: `${twoMonths[2]}${year ? ` ${year}` : ""}`,
      index: first.index,
      length: first.length,
    };
  }

  // Two tokens joined by a dash: "September 2025 – November 2025".
  const rest = text.slice(first.index + first.length);
  const joiner = /^\s*[-–—]\s*/.exec(rest);
  if (!joiner) return null;
  const tail = rest.slice(joiner[0].length);
  // Open-ended range: "January 2024 – Present". The end is not a date, so the
  // entry is ongoing - never read it as past, and span the marker so it does
  // not leak into the title.
  // The marker must END the range: "January 2024 – Present" and
  // "… – Present)." are open-ended, but "– Current status" is a date followed
  // by prose, not an ongoing marker.
  // The marker must end the range, but a clearly delimited metadata tail
  // ("Present | Remote", "Present (contract)") still counts - prose
  // continuations ("Current status") do not.
  const openEnded = /^(present|current|now|ongoing)(?=\s*[.,;:!?)\]]*\s*(?:[|·(].*)?$)/i.exec(tail.trim());
  const openEnd = openEnded?.[1];
  if (openEnd) {
    return {
      start: first.date,
      end: openEnd,
      index: first.index,
      length: first.length + joiner[0].length + tail.indexOf(openEnd) + openEnd.length,
      open: true,
    };
  }
  const second = findDateToken(tail) ?? (/^\d{4}\b/.test(tail.trim()) ? { date: tail.trim().slice(0, 4), index: tail.indexOf(tail.trim().slice(0, 4)), length: 4 } : null);
  if (!second) return null;
  return {
    start: first.date,
    end: second.date,
    index: first.index,
    length: first.length + joiner[0].length + second.index + second.length,
  };
}

/** Best-effort comparable (year, month) for a human date phrase. */
function toYearMonth(date: string): { year: number; month: number } | null {
  const iso = /^(\d{4})-(\d{2})/.exec(date.trim());
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]) };
  const monthYear = new RegExp(`^(${MONTH_NAME.source})\\.?\\s+((?:19|20)\\d{2})$`, "i").exec(
    date.trim(),
  );
  if (monthYear) {
    const month = MONTH_INDEX[monthYear[1]!.toLowerCase().replace(/\.$/, "").slice(0, 3)];
    return month ? { year: Number(monthYear[2]), month } : null;
  }
  const numericMonthYear = /^(0?[1-9]|1[0-2])[\/-]((?:19|20)\d{2})$/.exec(date.trim());
  if (numericMonthYear) {
    return { year: Number(numericMonthYear[2]), month: Number(numericMonthYear[1]) };
  }
  const bareYear = /^((?:19|20)\d{2})$/.exec(date.trim());
  // A bare year as a range end means "by end of that year".
  if (bareYear) return { year: Number(bareYear[1]), month: 12 };
  return null;
}

/** True when the range end is strictly before the reference month. */
export function isPastRange(range: DateRange, now: Date = new Date()): boolean {
  const end = toYearMonth(range.end);
  if (!end) return false;
  const current = { year: now.getFullYear(), month: now.getMonth() + 1 };
  return end.year < current.year || (end.year === current.year && end.month < current.month);
}

/** Cheap presence gate before the full date-range scan. */
const MONTH_WORD = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i;

/** Formatting labels that carry a section's bullets, not an entity: bold
 * time/status words ("**This week**", "**Backlog**") must not swallow the
 * real actions under them into one card. */
/** A bold completion bucket ("**Done**", "**Shipped**"): not an entity, but
 * the bullets under it are finished work. */
const COMPLETION_LABEL =
  /^\s*\*\*\s*(done|completed?|shipped|landed|finished|released|launched)\s*\*\*\s*[:.—–-]?\s*$/i;

export function isCompletionLabelLine(text: string): boolean {
  return COMPLETION_LABEL.test(text);
}

/** A bold readiness bucket ("**Ready**"): not an entity, but the bullets
 * under it are agreed and waiting to start. */
const READINESS_LABEL =
  /^\s*\*\*\s*ready\s*\*\*\s*[:.—–-]?\s*$/i;

export function isReadinessLabelLine(text: string): boolean {
  return READINESS_LABEL.test(text);
}

const GROUP_LABEL =
  /^\s*\*\*\s*(?:(?:this|last|next)\s+(?:week|month|quarter|year|sprint)|today|tomorrow|later|someday|backlog|todo|to-do|doing|in progress|ongoing|done|completed|up next|next up|blocked|pending|ready|in[ -]review|on[ -]hold|waiting|stalled|paused|wip)\s*\*\*\s*[:.—–-]?\s*$/i;

function isTitleCandidate(text: string, next: GroupLine | undefined): boolean {
  if (isListLike(text) || isDecorativeLine(text) || isTableSeparator(text) || splitTableRow(text)) {
    return false;
  }
  if (!next || !isListLike(next.text)) return false;
  // Completion buckets ("**Done**", "**Shipped**") are not entity titles
  // either; use the same predicate so new labels never re-enter grouping.
  if (BOLD_LEAD.test(text) && !GROUP_LABEL.test(text) && !isCompletionLabelLine(text)) return true;
  // A date range needs digits or month names; skip the heavy scan otherwise.
  if (!/[0-9]/.test(text) && !MONTH_WORD.test(text)) return false;
  const plain = plainContentOf(text);
  if (plain.length < 2 || plain.length > 200) return false;
  return findDateRange(plain) !== null;
}

/**
 * Detect title→bullets groups in a section's content lines.
 * Lines not in any group keep the existing flat parsing path.
 */
export function detectEntityGroups(lines: readonly GroupLine[]): EntityGroup[] {
  const groups: EntityGroup[] = [];
  // Fast exit: grouping needs at least one non-list line followed by a list item.
  let hasList = false;
  let hasNonList = false;
  for (const l of lines) {
    if (isListLike(l.text)) hasList = true;
    else if (l.text.trim() !== "") hasNonList = true;
    if (hasList && hasNonList) break;
  }
  if (!hasList || !hasNonList) return groups;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!isTitleCandidate(line.text, lines[i + 1])) {
      i++;
      continue;
    }
    const detailLines: GroupLine[] = [];
    let j = i + 1;
    while (j < lines.length && isListLike(lines[j]!.text)) {
      detailLines.push(lines[j]!);
      j++;
    }
    groups.push({ titleLine: line, detailLines });
    i = j;
  }
  return groups;
}

/** Every line number a group consumes, title included. */
export function groupLineNumbers(group: EntityGroup): number[] {
  return [group.titleLine.lineNo, ...group.detailLines.map((l) => l.lineNo)];
}

function detailsOf(group: EntityGroup): string[] {
  return group.detailLines
    .map((l) => plainContentOf(l.text))
    .filter((d) => d.length > 0)
    .slice(0, LIMITS.maxEntriesPerBlock);
}

/**
 * One action per entity. Status is honest to the evidence: a fully past date
 * range or uniformly past-tense detail lines are finished work; anything
 * else keeps the source's own stance (pending only when nothing says done).
 */
export function buildActionFromGroup(group: EntityGroup, now: Date = new Date()): ActionEntry {
  const task = plainContentOf(group.titleLine.text).slice(0, LIMITS.maxFieldLength);
  const details = detailsOf(group);
  const range = findDateRange(task);

  // Checklist state survives plainContentOf stripping "[x]": read it from the
  // raw detail lines before the past-tense heuristic gets a say.
  const items = group.detailLines.map((l) => splitListItem(l.text));
  const boxes = items.filter((i) => i?.marker === "task");
  const allBoxesChecked = boxes.length > 0 && boxes.length === items.length && boxes.every((i) => i!.done);
  const anyBoxUnchecked = boxes.some((i) => i!.done === false);

  let status = inferReadiness(task);
  if (range && isPastRange(range, now)) {
    status = "done";
  } else if (
    // An explicit "Present"/"Current" says the entity is still active; that is
    // stronger evidence than past-tense detail lines are of finished work.
    !range?.open &&
    status === "pending" &&
    !anyBoxUnchecked &&
    details.length > 0 &&
    details.every((d) => inferReadiness(d) === "done")
  ) {
    status = "done";
  }
  if (allBoxesChecked) status = "done";
  // An open range ("January 2024 – Present") says the entity is still active;
  // that beats completion keywords in the title ("Complete Streets Program").
  if (range?.open) status = "pending";

  return {
    task,
    status,
    ...(details.length > 0 ? { details } : {}),
  };
}

/**
 * One timeline row per entity: the range start is the date, the title is the
 * entity name without its date span, and a fully past range reads "done".
 * Returns null when the title carries no usable date — the flat parsers keep
 * those lines.
 */
export function buildTimelineFromGroup(
  group: EntityGroup,
  now: Date = new Date(),
): TimelineEntry | null {
  const plain = plainContentOf(group.titleLine.text);
  const range = findDateRange(plain);
  const single = range ? null : findDateToken(plain);
  if (!range && !single) return null;

  const date = (range ? range.start : single!.date).slice(0, 80);
  const rawSpan = range ?? { index: single!.index, length: single!.length };
  // Swallow the wrapper the range leaves behind: "(<range>)" loses both
  // parens, and a terminal period right after the range goes with it, so the
  // title never reads "Engineer ( )" or "Engineer .".
  let spanStart = rawSpan.index;
  let spanEnd = rawSpan.index + rawSpan.length;
  const openParen = /\(\s*$/.exec(plain.slice(0, spanStart));
  const closeParen = /^\s*\)/.exec(plain.slice(spanEnd));
  if (openParen && closeParen) {
    spanStart -= openParen[0].length;
    spanEnd += closeParen[0].length;
  }
  // Runs after the paren extension too: "(<range>)." loses the dot as well.
  const terminalDot = /^\s*\.(?=\s|$)/.exec(plain.slice(spanEnd));
  if (terminalDot) spanEnd += terminalDot[0].length;
  const span = { index: spanStart, length: spanEnd - spanStart };
  let title = `${plain.slice(0, span.index)} ${plain.slice(span.index + span.length)}`
    .replace(/\s+/g, " ")
    .replace(/^[\s,;·:—–-]+|[\s,;·:—–-]+$/g, "")
    .trim();
  // Only fall back to the raw line when nothing usable survived; short but
  // real names ("AI", "3M") stay instead of regrowing the removed range.
  if (!/[A-Za-z0-9]/.test(title) || (title.length < 2 && !/[A-Za-z]/.test(title))) title = plain;

  const past = range
    ? isPastRange(range, now)
    : (() => {
        const end = toYearMonth(single!.date);
        if (!end) return false;
        const current = { year: now.getFullYear(), month: now.getMonth() + 1 };
        return end.year < current.year || (end.year === current.year && end.month < current.month);
      })();

  const details = detailsOf(group);
  return {
    date,
    title: title.slice(0, LIMITS.maxFieldLength),
    state: past ? "done" : "planned",
    ...(details.length > 0 ? { details } : {}),
  };
}
