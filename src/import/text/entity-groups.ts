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

function isTitleCandidate(text: string, next: GroupLine | undefined): boolean {
  if (isListLike(text) || isDecorativeLine(text) || isTableSeparator(text) || splitTableRow(text)) {
    return false;
  }
  if (!next || !isListLike(next.text)) return false;
  if (BOLD_LEAD.test(text)) return true;
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

  let status = inferReadiness(task);
  if (range && isPastRange(range, now)) {
    status = "done";
  } else if (
    status === "pending" &&
    details.length > 0 &&
    details.every((d) => inferReadiness(d) === "done")
  ) {
    status = "done";
  }

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
  const span = range ?? { index: single!.index, length: single!.length };
  let title = `${plain.slice(0, span.index)} ${plain.slice(span.index + span.length)}`
    .replace(/\s+/g, " ")
    .replace(/^[\s,;·:—–-]+|[\s,;·:—–-]+$/g, "")
    .trim();
  if (title.length < 3) title = plain;

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
