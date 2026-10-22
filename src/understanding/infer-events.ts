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
export function inferTimeline(
  statements: readonly Statement[],
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

    const text = unpunctuated(statement.text);
    if (wordCount(text) < 3) continue;

    const underTimeline = claimed === "timeline" || statement.listItem;
    if (!underTimeline && BYLINE.test(text)) continue;

    // Strict first (phases, tickets, leading dates, dues, legs).
    const strict =
      parseTimelineLine(statement.text) ?? parseTimelineLine(`- ${statement.text}`);
    if (strict && strict.title.trim().length >= 2) {
      // Outside a real timeline list, require delivery language so bylines
      // and narrative quarters do not become schedule items.
      if (!underTimeline && !DELIVERY.test(text)) continue;
      out.push({ value: strict, evidence: statement });
      continue;
    }

    // Mid-sentence date with a clear event title remainder (unheaded prose).
    const found = findDateToken(text);
    if (!found) continue;
    if (!underTimeline && !DELIVERY.test(text)) continue;
    // Removing the date must not leave its lead-in preposition dangling
    // ("launch ... by", "arrive on ,", "check in on after 14:00").
    const title = titleAroundRemovedDate(text, found.index, found.length);
    if (title.length < 3 || wordCount(title) < 2) continue;
    out.push({
      value: {
        date: found.date,
        title: sentenceCase(clampWords(title, 24)),
        state: "planned",
      },
      evidence: statement,
    });
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
