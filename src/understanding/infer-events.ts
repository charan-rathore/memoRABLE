/**
 * Timeline + Actions inference for the understanding layer.
 *
 * Kept separate from inference.ts to avoid a circular import with
 * import/text/patterns (which already imports decision/risk helpers).
 */

import { kindClaimedByHeading } from "@/import/text/sections";
import {
  findDateToken,
  parseActionLine,
  parseTimelineLine,
  parseUserStoryLine,
} from "@/import/text/patterns";
import type { ActionEntry, TimelineEntry } from "@/domain/memory/schema";
import type { Inferred, Statement } from "./inference";
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

const WORK_LEAD =
  /^(?:draft|chase|send|write|implement|build|create|fix|review|schedule|call|email|prepare|ship|deploy|spec|document|measure|track|fix|add|remove|fix|contact|follow up)\b/i;

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
    const title = `${text.slice(0, found.index)} ${text.slice(found.index + found.length)}`
      .replace(/\s+/g, " ")
      .replace(/^\s*[:—–-]\s*|\s*[:—–-]\s*$/g, "")
      .trim();
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
): Array<Inferred<InferredAction>> {
  const out: Array<Inferred<InferredAction>> = [];

  for (const statement of statements) {
    const claimed = kindClaimedByHeading(statement.sectionTitle);
    if (claimed && claimed !== "actions" && claimed !== "snapshot") continue;

    const text = unpunctuated(statement.text);
    if (wordCount(text) < 3) continue;
    if (NON_ACTION.test(text)) continue;

    // Do not re-home pure risks or already-settled decisions as todos.
    if (strongestCategory(text) === "risk") continue;
    if (DECIDED.test(text) && !TODO_HINT.test(text)) continue;

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
