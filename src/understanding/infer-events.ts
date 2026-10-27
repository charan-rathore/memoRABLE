/**
 * Timeline + Actions inference for the understanding layer.
 *
 * Kept separate from inference.ts to avoid a circular import with
 * import/text/patterns (which already imports decision/risk helpers).
 */

import { kindClaimedByHeading, matchOrdinalHeading } from "@/import/text/sections";
import {
  findDateToken,
  isTaskTableHeaderRow,
  parseActionLine,
  parseTimelineLine,
  parseUserStoryLine,
  splitTableRow,
  titleAroundRemovedDate,
} from "@/import/text/patterns";
import type { ActionEntry, BlockKind, TimelineEntry } from "@/domain/memory/schema";
import type { DocumentArchetype } from "./archetype";
import { parseResumeRoleHeader } from "./role-headers";
import { parseResumeProjectRow } from "@/import/text/entity-groups";
import { inferReadiness, VERDICT_HEADING, type Inferred, type Statement } from "./inference";
import { strongestCategory } from "./projection";
import { clampWords, sentenceCase, unpunctuated, wordCount } from "./language";

export type InferredTimeline = TimelineEntry;
export type InferredAction = ActionEntry;

/** Settled decisions should not also become action todos. */
const DECIDED =
  /\b(we|i|the team)\s+(?:have\s+)?(?:decided|chose|chosen|committed|approved|agreed)\b|^decision\s*[:—-]/i;

/** Soft work language that marks a todo without a list marker. */
const TODO_HINT =
  /\b(should|need to|needs to|have to|todo|to-do|follow[- ]?up|action item|please\s+\w+|someone (?:should|must|needs to)|we need to|let'?s)\b/i;

/**
 * Schedule ordinals own their section's lines; document-structure markers
 * ("Chapter 3", "Part II") do not. Mirrors SCHEDULE_ORDINAL in
 * import/text/parse-text.ts - keep the two lists in step.
 */
const SCHEDULE_ORDINAL_MARKER = /^(phase|task|step|stage|milestone|sprint|iteration|week|day)\b/i;

const WORK_LEAD =
  // "write" excludes the cache terms write-through / write-back / write-ahead
  // ("Write-through invalidation adds 4 ms" is a cost, not the work verb write),
  // but not the phrasal task "Write back to the customer".
  /^(?:draft|chase|send|write(?!-(?:through|back|ahead)\b)(?! (?:through|ahead)\b)(?! back (?:cache|caching|policy|mode|latency|path|buffer)\b)|implement|build|create|fix|review|schedule|call|email|prepare|ship|deploy|spec|document|measure|track|add|remove|contact|follow up)\b/i;

/** Reject non-action prose that lenient structural parsers would otherwise accept. */
const NON_ACTION =
  /\b(nothing parseable|not a metric|opening thought|random notes|just one paragraph)\b/i;

/**
 * Schedule language — required for dates outside a Timeline heading.
 * Avoid bare "by" (matches "Prepared by") and soft "launch" marketing copy.
 */
const DELIVERY =
  /\b(due(?:\s+date)?|by\s+(?:the\s+)?(?:end\s+of\s+)?(?:next\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{1,2}|q[1-4]|monday|tuesday|wednesday|thursday|friday|week|month|quarter|year)|before|after|until|ship(?:ped|ping)?|freeze|deadline|ready|phase\s+\d|milestone|sprint|gate|eta|planned|on[- ]track|need(?:s)?\s+to)\b/i;

/** Bylines are not schedule items. */
const BYLINE = /\b(prepared|reviewed|authored|written)\s+by\b/i;

/**
 * Read calendar / ordinal / mid-sentence dates as Timeline candidates.
 * Skips lines already claimed by non-timeline headings.
 *
 * Only promotes when a date token is present (or a strict phase/ticket parse
 * succeeds) so narrative months in ordinary prose do not flood Timeline.
 */
/**
 * Completed explicit calendar-date terminals (month name + day(+year),
 * month name + year, or day + month name(+year)) ending a sentence.
 * Timeline-local segmentation splits an admitted fused statement at these
 * boundaries only; versions, ordinals and decimals carry no month name and
 * never open a boundary.
 */
const SEGMENT_MONTH =
  "(?:january|february|march|april|june|july|august|september|october|november|december|may|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)";
const SEGMENT_TERMINAL = new RegExp(
  "(?:\\b" +
    SEGMENT_MONTH +
    "\\.?\\s+\\d{1,2}(?:,\\s*\\d{4})?|\\b" +
    SEGMENT_MONTH +
    "\\.?\\s+\\d{4}|\\b\\d{1,2}\\s+" +
    SEGMENT_MONTH +
    "\\.?(?:,?\\s+\\d{4})?)\\.$",
  "i",
);

interface StatementSegment {
  text: string;
  start: number;
  end: number;
}

/**
 * Split a statement at completed calendar-date terminals only. Every
 * original word survives: the segments reassemble the statement verbatim,
 * and each segment carries its real offsets into the statement text.
 */
function segmentAtDateTerminals(text: string): StatementSegment[] {
  // Segments are exact slices of the original statement, so offsets are
  // true source offsets — never positions in a whitespace-normalized copy.
  const segments: StatementSegment[] = [];
  let start = 0;
  for (const m of text.matchAll(/\.\s+/g)) {
    const end = m.index! + 1; // include the period in the left segment
    const candidate = text.slice(start, end);
    if (!SEGMENT_TERMINAL.test(candidate)) continue;
    segments.push({ text: candidate, start, end });
    start = m.index! + m[0].length; // skip the whitespace run
  }
  const tail = text.slice(start);
  if (tail.trim() !== "") segments.push({ text: tail, start, end: text.length });
  if (segments.length < 2) return [];
  // Terminal "!" / "?" carries force or uncertainty a word-sequence check
  // cannot verify; only plain-period statements may segment.
  if (segments.some((s) => /[!?]\s*$/.test(s.text))) return [];
  return segments;
}

/**
 * Conditional markers that can scope beyond their own segment. Checked on
 * the whole segment, not just its leading word: "only if" and "in case"
 * carry the same scoping risk as a bare leading "if". Any match on a
 * non-final segment vetoes segmentation (byte-identical fused fallback).
 */
const CONDITION_SCOPING =
  /\b(?:if|unless|when|whenever|should|provided|providing|assuming)\b|\bin\s+case\b|\bas\s+long\s+as\b|\bso\s+long\s+as\b/i;

/**
 * Retain-all contract against the ORIGINAL statement, not the fused
 * output: for each segment, removing exactly the recognized date that
 * moved into the date field must leave the segment's title literally
 * equal to the remaining original content, allowing only the explicit
 * admission transforms (case, whitespace, one terminal period). A lost
 * qualifier, condition, negation, clamped word, reordering, or any
 * punctuation/symbol/combining-mark difference fails the check and the
 * whole fused entry stays byte-identical.
 */
/**
 * Literal comparison for the retain-all contract: NFC, case-folded, all
 * whitespace runs collapsed, at most one terminal period removed - the
 * exact transforms admission itself applies (sentenceCase, unpunctuated,
 * title cleanup). ANY other difference (dropped or added punctuation,
 * symbols, or combining marks, reordering, clamping) fails the check.
 */
function normalizeForRetain(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.$/, "")
    .trimEnd();
}

function retainsOriginal(
  segments: readonly StatementSegment[],
  admitted: readonly InferredTimeline[],
): boolean {
  return segments.every((segment, i) => {
    const entry = admitted[i]!;
    const first = segment.text.indexOf(entry.date);
    // The date field must come from exactly one place in this segment.
    if (first < 0 || segment.text.indexOf(entry.date, first + 1) >= 0) return false;
    const remainder = segment.text.slice(0, first) + segment.text.slice(first + entry.date.length);
    return normalizeForRetain(remainder) === normalizeForRetain(entry.title);
  });
}

export function inferTimeline(
  statements: readonly Statement[],
  archetype?: DocumentArchetype,
): Array<Inferred<InferredTimeline>> {
  const out: Array<Inferred<InferredTimeline>> = [];

  for (const statement of statements) {
    const claimed = kindClaimedByHeading(statement.sectionTitle);
    // Only unheaded prose, snapshot framing, or an explicit Timeline section.
    if (claimed && claimed !== "timeline" && claimed !== "snapshot") continue;
    // An ordinal heading ("Week 3") owns its lines as phase content, carried
    // on the phase's own timeline entry. Inferring standalone entries from
    // them reads a reference ("60% of Week 2 weights") as a schedule FOR a
    // phase the document never had — and the phantom then dedupes the real
    // phase entry out of existence.
    const ordinal = statement.sectionTitle ? matchOrdinalHeading(statement.sectionTitle) : null;
    if (ordinal && SCHEDULE_ORDINAL_MARKER.test(ordinal.marker)) continue;

    // Resume role headers carry a tenure range, not a delivery date; read
    // them as timeline entries so a resume keeps its own work history.
    if (archetype === "resume" && !statement.listItem) {
      const role = parseResumeRoleHeader(statement.text);
      if (role) {
        out.push({
          // Dates and title only - a tenure range is not a workflow state.
          // A description flattened after the tenure survives as a detail.
          value: {
            // Keep the tenure end as data: "Present" vs a closed month is a
            // fact about the role, not a workflow state.
            date: role.end ? `${role.date} – ${role.end}` : role.date,
            title: role.title,
            ...(role.trailing ? { details: [role.trailing] } : {}),
          },
          evidence: statement,
        });
        continue;
      }
    }

    const text = unpunctuated(statement.text);
    if (wordCount(text) < 3) continue;

    const underTimeline = claimed === "timeline" || statement.listItem;
    if (!underTimeline && BYLINE.test(text)) continue;

    // One unchanged admission decision, used for the fused statement and,
    // when segmentation applies, for each segment independently.
    // Strict first (phases, tickets, leading dates, dues, legs), then a
    // mid-sentence date with a clear event title remainder.
    const admit = (candidateText: string, rawText: string): InferredTimeline | null => {
      const strict = parseTimelineLine(rawText) ?? parseTimelineLine(`- ${rawText}`);
      if (strict && strict.title.trim().length >= 2) {
        // Outside a real timeline list, require delivery language so bylines
        // and narrative quarters do not become schedule items.
        if (!underTimeline && !DELIVERY.test(candidateText)) return null;
        return strict;
      }
      const found = findDateToken(candidateText);
      if (!found) return null;
      if (!underTimeline && !DELIVERY.test(candidateText)) return null;
      // Removing the date must not leave its lead-in preposition dangling
      // ("launch ... by", "arrive on ,", "check in on after 14:00").
      const title = titleAroundRemovedDate(candidateText, found.index, found.length);
      if (title.length < 3 || wordCount(title) < 2) return null;
      return {
        date: found.date,
        title: sentenceCase(clampWords(title, 24)),
        state: "planned",
      };
    };
    const fused = admit(text, statement.text);
    if (!fused) continue;
    // Timeline-local segmentation of an admitted fused statement: split at
    // completed calendar-date terminals and keep per-segment entries ONLY
    // when every segment independently passes the unchanged gates and the
    // original fused date survives among them. Any gap keeps the whole
    // fused entry byte-identical.
    const segments = segmentAtDateTerminals(statement.text);
    if (segments.length > 0) {
      const admitted = segments.map((s) => admit(unpunctuated(s.text), s.text));
      if (
        admitted.every((a): a is InferredTimeline => a !== null) &&
        admitted.some((a) => a.date === fused.date) &&
        retainsOriginal(segments, admitted) &&
        // A condition anywhere in a non-final segment may scope the whole
        // sentence group; splitting would pin it to its own entry only.
        !admitted.slice(0, -1).some((a) => CONDITION_SCOPING.test(a.title))
      ) {
        for (let i = 0; i < segments.length; i++) {
          const segment = segments[i]!;
          out.push({
            value: admitted[i]!,
            fusedFallback: fused,
            evidence: {
              ...statement,
              text: segment.text,
              segmentStart: segment.start,
              segmentEnd: segment.end,
              statementText: statement.text,
            },
          });
        }
        continue;
      }
    }
    out.push({ value: fused, evidence: statement });
  }

  return out;
}

/**
 * Read outstanding work as Actions — todos, owner/due shapes, soft "should" work.
 *
 * Never uses the structural *lenient* action parser (that accepts any leftover
 * list text under an Actions heading). Understanding only promotes lines that
 * clearly read as work.
 */
export function inferActions(
  statements: readonly Statement[],
  unheadedClaim: BlockKind | null = null,
  archetype?: DocumentArchetype,
): Array<Inferred<InferredAction>> {
  const out: Array<Inferred<InferredAction>> = [];

  // The most recent task-table header row, keyed by section: recovered rows
  // map their cells by that schema instead of guessing positions.
  let tableHeader: { section: string | null; cells: string[] } | null = null;

  for (const statement of statements) {
    // A standalone task document ("# Action Items") is consumed as the
    // document title, leaving its rows unheaded; the title still claims them.
    const claimed =
      kindClaimedByHeading(statement.sectionTitle) ??
      (statement.sectionTitle == null ? unheadedClaim : null);
    if (claimed && claimed !== "actions" && claimed !== "snapshot") continue;
    // Verdict prose is the author's resolved opinion, not a todo for the owner.
    if (statement.sectionTitle && VERDICT_HEADING.test(statement.sectionTitle)) continue;

    const text = unpunctuated(statement.text);
    if (wordCount(text) < 3) continue;
    if (NON_ACTION.test(text)) continue;

    // A checkbox is the author's explicit todo marker: an open box is pending
    // work, a checked box is done work. No work-verb guessing needed.
    if (statement.task) {
      const status = statement.task === "done" ? "done" : "pending";
      // Explicit "task - owner - due" metadata wins over the plain-text fallback.
      const parsedTask = parseActionLine(statement.text) ?? parseActionLine(`- ${statement.text}`);
      if (parsedTask && parsedTask.task.trim().length >= 3) {
        out.push({ value: { ...parsedTask, status }, evidence: statement });
        continue;
      }
      const task = sentenceCase(clampWords(text, 28));
      if (task.length >= 8) {
        out.push({ value: { task, status }, evidence: statement });
      }
      continue;
    }
    // A table row outside an actions section is data, not a todo: positional
    // task/owner/due mapping would read an expense's amount as its owner.
    if (claimed !== "actions" && splitTableRow(statement.text)) continue;

    // A resume project row ("| Forecaster | Live Demo | ML Product May 2024
    // – Present |") is a tenure-dated entity, not a todo. Its heading
    // ("Products & Projects") claims the actions kind, which would otherwise
    // let positional parsing read "Live Demo" as the owner of pending work.
    if (archetype === "resume" && parseResumeProjectRow(statement.text)) continue;

    // A resume role header ("Project Leader, Nirmaan – BITS Pilani Student
    // Chapter January 2023 – May 2023") is a tenure line, not a todo - the
    // dash-separated owner/due parser reads the org as an owner.
    if (archetype === "resume" && !statement.listItem && parseResumeRoleHeader(statement.text)) {
      continue;
    }

    // Do not re-home pure risks or already-settled decisions as todos.
    if (strongestCategory(text) === "risk") continue;
    if (DECIDED.test(text) && !TODO_HINT.test(text)) continue;

    // Header furniture is never work, whatever the section claims; remember
    // its schema so rows map cells to the right fields.
    if (isTaskTableHeaderRow(statement.text)) {
      tableHeader = {
        section: statement.sectionTitle ?? null,
        cells: splitTableRow(statement.text)!.map((c) => c.trim().toLowerCase()),
      };
      continue;
    }

    // Only a claimed actions table reaches here (other sections skip table
    // rows above). With a known header, map cells by that schema - never
    // positionally: a "Task | Status | Notes" row must not read "Ready" as
    // its owner. Without one, strict positional parse first, then recover an
    // incomplete row (blank owner/due cells) from its first cell.
    if (splitTableRow(statement.text)) {
      const cells = splitTableRow(statement.text)!;
      const hdr =
        tableHeader && tableHeader.section === (statement.sectionTitle ?? null)
          ? tableHeader.cells
          : null;
      if (hdr) {
        const colIdx = (re: RegExp): number => hdr.findIndex((c) => re.test(c));
        const ownerIdx = colIdx(/^(owners?|assignees?|assigned\s*to|responsible)$/);
        const dueIdx = colIdx(/^(due(\s*dates?)?|deadlines?)$/);
        const statusIdx = colIdx(/^status$/);
        const taskText = (cells[0] ?? "").trim();
        if (taskText.length >= 3) {
          const statusText = statusIdx >= 0 ? (cells[statusIdx] ?? "").trim() : "";
          const entry: ActionEntry = {
            task: taskText,
            status: statusText ? inferReadiness(statusText) : inferReadiness(taskText),
          };
          const owner = ownerIdx >= 0 ? (cells[ownerIdx] ?? "").trim() : "";
          const due = dueIdx >= 0 ? (cells[dueIdx] ?? "").trim() : "";
          if (owner) entry.owner = owner;
          if (due) entry.due = due;
          out.push({ value: entry, evidence: statement });
        }
        continue;
      }
      const parsedRow = parseActionLine(statement.text);
      if (parsedRow && parsedRow.task.trim().length >= 3) {
        out.push({ value: parsedRow, evidence: statement });
        continue;
      }
      const cellText = unpunctuated((cells[0] ?? "").trim());
      const task = sentenceCase(clampWords(cellText, 28));
      if ((TODO_HINT.test(cellText) || WORK_LEAD.test(cellText)) && task.length >= 8) {
        const entry: ActionEntry = { task, status: "pending" };
        const owner = (cells[1] ?? "").trim();
        const due = (cells[2] ?? "").trim();
        if (owner) entry.owner = owner;
        if (due) entry.due = due;
        out.push({ value: entry, evidence: statement });
      }
      continue;
    }

    // Strict structural shapes + user stories only (no lenient catch-all).
    const parsed =
      parseUserStoryLine(statement.text) ??
      parseUserStoryLine(`- ${statement.text}`) ??
      parseActionLine(statement.text) ??
      parseActionLine(`- ${statement.text}`);

    if (parsed && parsed.task.trim().length >= 3) {
      out.push({ value: parsed, evidence: statement });
      continue;
    }

    // Soft prose todos: "Someone should draft the customer email".
    if (!TODO_HINT.test(text) && !(statement.listItem && WORK_LEAD.test(text))) continue;
    // Hard requirements without todo language belong in Decisions.
    if (
      strongestCategory(text) === "requirement" &&
      !TODO_HINT.test(text) &&
      !WORK_LEAD.test(text)
    ) {
      continue;
    }

    const task = sentenceCase(clampWords(text, 28));
    if (task.length < 8) continue;
    out.push({
      value: { task, status: "pending" },
      evidence: statement,
    });
  }

  return out;
}
