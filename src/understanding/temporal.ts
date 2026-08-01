import type { TimelineEntry } from "@/domain/memory/schema";
import type { ArchetypeResult } from "./archetype";

/**
 * Local temporal honesty — Phase C lite for the deterministic parser.
 *
 * Relative / weak dates without an anchor are not Timeline memories; they
 * become signal-like notes so we never fabricate a schedule.
 */

export interface AnchorDate {
  value: string | null;
  confidence: "high" | "medium" | "low" | "none";
  source: "explicit" | "filename" | "body" | "none";
}

const EXPLICIT_ANCHOR =
  /\b(?:as of|dated|date[:\s]|prepared.*?·|letterhead)\s*([A-Z][a-z]{2,8}\.?\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|[A-Z][a-z]{2,8}\s+\d{4})/i;

const ISO_OR_FULL =
  /\b((?:19|20)\d{2}-\d{2}-\d{2}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2},?\s+\d{4})\b/i;

const RELATIVE_ONLY =
  /^(?:today|tomorrow|yesterday|tonight|(?:this|next|last)\s+(?:week|month|quarter|year)|end\s+of\s+(?:the\s+)?(?:week|month|quarter|year)|in\s+\d{1,3}\s+(?:days?|weeks?|months?|years?)|soon|eventually|asap)$/i;

const WEAK_MONTH_ONLY =
  /^(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?$/i;

const TICKET_ID = /^[A-Z]{2,}-\d+/i;
const PHASE_ORDINAL = /^(?:Phase|Step|Stage|Task)\s+[A-Z0-9]+$/i;

export function findAnchorDate(text: string, filename?: string): AnchorDate {
  const explicit = EXPLICIT_ANCHOR.exec(text);
  if (explicit?.[1]) {
    return { value: explicit[1].trim(), confidence: "high", source: "explicit" };
  }

  const fileDate = filename ? /(\d{4}-\d{2}-\d{2}|\d{8})/.exec(filename) : null;
  if (fileDate?.[1]) {
    const raw = fileDate[1];
    const value =
      raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : raw;
    return { value, confidence: "medium", source: "filename" };
  }

  const body = ISO_OR_FULL.exec(text);
  if (body?.[1]) {
    return { value: body[1].trim(), confidence: "medium", source: "body" };
  }

  return { value: null, confidence: "none", source: "none" };
}

export interface TemporalGateResult {
  timeline: TimelineEntry[];
  /** Weak temporal items demoted out of Timeline (for Signals notes). */
  demoted: string[];
}

/**
 * Gate timeline entries for honesty given archetype + anchor.
 */
export function gateTimelineEntries(
  entries: readonly TimelineEntry[],
  archetype: ArchetypeResult,
  anchor: AnchorDate,
): TemporalGateResult {
  if (archetype.timelineMode === "none" && archetype.suppressWeakTimeline) {
    // Keep only hard calendar dates / ticket IDs that are clearly dated events.
    const kept: TimelineEntry[] = [];
    const demoted: string[] = [];
    for (const entry of entries) {
      if (isHardDate(entry.date) && !isRelativeOnly(entry.date)) {
        kept.push(entry);
      } else {
        demoted.push(`${entry.date}: ${entry.title}`);
      }
    }
    return { timeline: kept, demoted };
  }

  if (archetype.timelineMode === "single_leg") {
    const hard = entries.filter((e) => isHardDate(e.date) || /depart|arriv/i.test(e.title));
    const chosen = (hard.length > 0 ? hard : entries).slice(0, 2);
    const demoted = entries
      .filter((e) => !chosen.includes(e))
      .map((e) => `${e.date}: ${e.title}`);
    return { timeline: chosen, demoted };
  }

  const kept: TimelineEntry[] = [];
  const demoted: string[] = [];

  for (const entry of entries) {
    if (shouldKeepTimelineEntry(entry, anchor, archetype)) {
      kept.push(entry);
    } else {
      demoted.push(`${entry.date}: ${entry.title}`);
    }
  }

  return { timeline: kept, demoted };
}

function shouldKeepTimelineEntry(
  entry: TimelineEntry,
  _anchor: AnchorDate,
  archetype: ArchetypeResult,
): boolean {
  const date = entry.date.trim();

  // Ticket IDs and phase ordinals are narrative/milestone markers, not calendar fabrications.
  if (TICKET_ID.test(date) || PHASE_ORDINAL.test(date)) {
    return archetype.timelineMode === "milestone_chain" || archetype.timelineMode === "narrative_sequence";
  }

  if (isRelativeOnly(date)) {
    // Author-stated relative dates stay on Timeline for real schedule archetypes
    // (roadmaps, PRDs, briefs). Only none-mode / suppress archetypes demote them.
    // Honesty means not inventing dates — not deleting author-stated relative ones.
    if (archetype.suppressWeakTimeline || archetype.timelineMode === "none") return false;
    return true;
  }

  if (WEAK_MONTH_ONLY.test(date)) {
    // Bare "May" / "Jul" is OK in brief/plan docs; menus must not invent schedules.
    return !archetype.suppressWeakTimeline;
  }

  return true;
}

function isRelativeOnly(date: string): boolean {
  return RELATIVE_ONLY.test(date.trim());
}

function isHardDate(date: string): boolean {
  const d = date.trim();
  if (TICKET_ID.test(d)) return false;
  if (PHASE_ORDINAL.test(d)) return false;
  if (isRelativeOnly(d)) return false;
  return (
    /^\d{4}-\d{2}-\d{2}/.test(d) ||
    /\b(?:19|20)\d{2}\b/.test(d) ||
    /^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(d) ||
    /^Q[1-4]/i.test(d) ||
    /^H[12]/i.test(d)
  );
}
