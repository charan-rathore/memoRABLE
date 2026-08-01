import { ok, type Result } from "@/reliability/result";
import type { Diagnostic } from "@/reliability/diagnostics";
import { finalizeDocument, type BlockInput } from "@/domain/memory/normalize";
import {
  BLOCK_KINDS,
  BLOCK_KIND_LABELS,
  type ActionEntry,
  type BlockKind,
  type DecisionEntry,
  type ImportWarning,
  type MemoryDocument,
  type RiskEntry,
  type SignalEntry,
  type TimelineEntry,
} from "@/domain/memory/schema";
import { gateTimelineEntries, recallFrom, understand, type Recall, type Understanding } from "@/understanding";
import {
  blocksDecisionInference,
  harvestSingleLegLine,
  isInvoiceArchetype,
  projectSingleLegTimeline,
  shouldProjectInvoiceDueToTimeline,
} from "@/understanding/projection";
import { buildDocumentGraph, hybridSegment } from "@/understanding/segment";
import { dedupeByMeaning, saysTheSame } from "@/understanding/language";
import { LIMITS } from "@/domain/memory/limits";
import { capExcerpt } from "../json/import-json";
import {
  classifyHeading,
  inferKindFromLines,
  isStructuralLine,
  matchHeading,
  matchOrdinalHeading,
} from "./sections";
import {
  isDecorativeLine,
  isListLike,
  isTableSeparator,
  parseActionLine,
  parseActionLineLenient,
  parseDecisionLine,
  parseDecisionLineLenient,
  parseObligationDateLine,
  parseRiskLine,
  parseRiskLineLenient,
  parseSignalLine,
  parseSignalLineLenient,
  parseSignalSalvage,
  parseTimelineLine,
  parseTimelineLineLenient,
  plainContentOf,
  splitListItem,
  splitTableRow,
  stripEmphasis,
  stripListMarker,
} from "./patterns";

/**
 * Lossless local Text/Markdown parser (reliability layer 2).
 *
 * The parser runs in two passes over the same sections, and the order matters.
 *
 * First the document is *understood*: its intent is read, its recurring
 * concepts are found, its sentences are distilled with restatements removed,
 * and candidate memories are inferred from what those sentences mean. Nothing
 * has been classified yet at this point, which is deliberate. Classifying raw
 * paragraphs can only preserve the shape a document happened to be typed in.
 *
 * Then the structural pass runs as it always has: a section is assigned to a
 * memory by its heading when the heading names one ("Risks", "Implementation
 * Rules"), otherwise by the shape of its lines. Strict patterns run first;
 * only if they recognize nothing does a lenient pass record the remaining list
 * items, leaving every unstated field undefined.
 *
 * Finally the two are merged. Structural entries win, because a line the
 * author bulleted under "Risks" is a risk on their authority rather than ours.
 * Understanding fills the gaps: reasoning the structural pass had no way to
 * see, and memories stated in prose that no heading ever announced.
 *
 * Anything still unassigned is preserved verbatim as notes. The parser never
 * invents owners, dates, metrics, severities or statuses, never produces a
 * memory without the sentence it came from, and never calls the network or AI.
 */

export interface TextImportInput {
  /** Preflighted text (BOM stripped, LF line endings). */
  text: string;
  /** Sanitized human label, e.g. "Pasted notes" or "launch-notes.md". */
  label: string;
}

interface SourceLine {
  text: string;
  /** 1-based line number in the original source. */
  lineNo: number;
}

interface Section {
  kind: BlockKind | null;
  /** The heading named a memory, or its content clearly read as one. */
  assigned: boolean;
  headingText: string | null;
  headingLine: number | null;
  lines: SourceLine[];
}

export function parseText(input: TextImportInput): Result<MemoryDocument> {
  const { label } = input;
  // Hybrid semantic segmentation first (RFC Stage 3): structural anchors +
  // topic-shift prose, never fixed-length token windows.
  const segmented = hybridSegment(input.text);
  const graph = buildDocumentGraph(segmented.segments);
  const text = segmented.markdown || input.text;
  const rawLines = text.split("\n");

  // Document title: first level-1 heading, else the source label.
  let title = label.replace(/\.(md|markdown|txt)$/i, "");
  let titleConsumedLine = -1;
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i]!;
    if (line.trim() === "") continue;
    const heading = matchHeading(line, rawLines[i + 1]);
    if (heading && heading.level === 1) {
      title = heading.text;
      titleConsumedLine = i;
    }
    break; // only the first meaningful line may be the title
  }

  const sections: Section[] = [];
  const ordinals: OrdinalMark[] = [];
  let current: Section | null = null;
  let pendingOrdinal: OrdinalMark | null = null;

  const startSection = (
    kind: BlockKind | null,
    headingText: string | null,
    headingLine: number | null,
  ): Section => {
    const section: Section = { kind, assigned: kind !== null, headingText, headingLine, lines: [] };
    sections.push(section);
    return section;
  };

  for (let i = 0; i < rawLines.length; i++) {
    if (i === titleConsumedLine) continue;
    const line = rawLines[i]!;
    if (isStructuralLine(line)) continue;
    const heading = matchHeading(line, rawLines[i + 1]);

    if (heading) {
      // "Phase 2" / "Task D" carry delivery order even without a calendar date.
      const ordinal = matchOrdinalHeading(heading.text);
      if (ordinal) {
        pendingOrdinal = { marker: ordinal.marker, title: ordinal.rest || null, line: i + 1 };
        ordinals.push(pendingOrdinal);
        current = startSection(null, heading.text, i + 1);
        continue;
      }
      if (pendingOrdinal && !pendingOrdinal.title) pendingOrdinal.title = heading.text;
      current = startSection(classifyHeading(heading.text), heading.text, i + 1);
      // Persona headings are evidence — keep them inside the section body too.
      if (/^as an?\s+/i.test(heading.text)) {
        current.lines.push({ text: `- Persona: ${heading.text}`, lineNo: i + 1 });
      }
      continue;
    }

    if (line.trim() !== "" && pendingOrdinal && !pendingOrdinal.title) {
      pendingOrdinal.title = plainContentOf(line).slice(0, 120) || null;
    }

    const sourceLine: SourceLine = { text: line, lineNo: i + 1 };
    if (!current) current = startSection("snapshot", null, null);
    current.lines.push(sourceLine);
  }

  // Unknown headings get a second chance from the shape of their content.
  for (const section of sections) {
    if (section.kind !== null) continue;
    const inferred = inferKindFromLines(section.lines.map((l) => l.text));
    if (inferred) {
      section.kind = inferred;
      section.assigned = true;
    }
  }

  const warnings: ImportWarning[] = [];
  const leftovers = sections.filter((s) => s.kind === null);

  // Understand before classifying. Every section is read, including the ones
  // no heading claimed, because a document's most quotable sentence is rarely
  // filed under a heading that names what it is.
  const understanding = understand({
    title,
    sourceLabel: label,
    sections: sections.map((s) => ({ headingText: s.headingText, lines: s.lines })),
  });

  // Ordinal phases are timeline-worthy only when the archetype has a real
  // timeline mode. Menus/glossaries must not invent a schedule from "Phase 1".
  const timelineExtras =
    understanding.archetype.timelineMode === "none"
      ? []
      : ordinals
          .filter((o) => o.title)
          .slice(0, LIMITS.maxEntriesPerBlock)
          .map<TimelineEntry>((o) => ({ date: o.marker, title: o.title!, state: "planned" }));

  const ctx: BuildContext = {
    title,
    label,
    warnings,
    understanding,
    recall: null,
    leftovers,
    extraTimeline: timelineExtras,
    keptOnPurpose: 0,
  };

  // The five list memories are built first. The snapshot frames them, so it
  // cannot be written until it has something to frame.
  const built = new Map<BlockKind, BlockInput>();
  for (const kind of BLOCK_KINDS) {
    if (kind === "snapshot") continue;
    built.set(kind, buildBlock(kind, sections.filter((s) => s.kind === kind), ctx));
  }

  // Archetype-aware harvest: ticket legs, invoice/policy dues, etc.
  harvestArchetypeTimeline(built, sections, understanding, warnings);

  // Layer 3 lite: temporal honesty gate on the local Timeline bucket.
  applyTemporalHonesty(built, understanding, warnings);

  ctx.recall = recallFrom(understanding, {
    signals: entriesOf<SignalEntry>(built, "signals"),
    decisions: entriesOf<DecisionEntry>(built, "decisions"),
    risks: entriesOf<RiskEntry>(built, "risks"),
    timeline: entriesOf<TimelineEntry>(built, "timeline"),
    actions: entriesOf<ActionEntry>(built, "actions"),
  });
  built.set("snapshot", buildBlock("snapshot", sections.filter((s) => s.kind === "snapshot"), ctx));

  const blocks: BlockInput[] = BLOCK_KINDS.map((kind) => built.get(kind)!);
  linkActionsToDecisions(blocks);
  warnings.push(...understandingWarnings(understanding));
  warnings.push(...graphWarnings(graph, segmented.segments.length));

  const document = finalizeDocument({
    title,
    sourceMethod: "local-parser",
    sourceLabel: label,
    blocks,
    warnings,
  });
  return ok(
    document,
    warnings.map((w) => ({ code: w.code as Diagnostic["code"], message: w.message })),
  );
}

function graphWarnings(
  graph: ReturnType<typeof buildDocumentGraph>,
  segmentCount: number,
): ImportWarning[] {
  if (segmentCount === 0) return [];
  const types = new Set(graph.nodes.map((n) => n.type));
  const parts = [
    `Segmented into ${segmentCount} semantic chunks`,
    `graph ${graph.nodes.length} nodes / ${graph.edges.length} links`,
  ];
  if (types.has("table")) parts.push("tables preserved");
  if (types.has("image")) parts.push("embedded visuals linked");
  if (types.has("requirement") || types.has("decision")) parts.push("requirements grounded");
  return [{ code: "text.understood", message: `${parts.join("; ")}.` }];
}

function entriesOf<T>(built: ReadonlyMap<BlockKind, BlockInput>, kind: BlockKind): T[] {
  const block = built.get(kind);
  if (!block || !("entries" in block.payload)) return [];
  return block.payload.entries as T[];
}

/**
 * Archetype projection priorities (submission rules):
 *  1. single_leg → Departure + Arrival ALWAYS Timeline
 *  2. Invoice → Due Date → Timeline unless confidence < threshold
 *  Policy/contract obligation dates share the same confidence gate.
 */
function harvestArchetypeTimeline(
  built: Map<BlockKind, BlockInput>,
  sections: readonly Section[],
  understanding: Understanding,
  warnings: ImportWarning[],
): void {
  const mode = understanding.archetype.timelineMode;
  if (mode === "none") return;

  const timelineBlock = built.get("timeline");
  if (!timelineBlock || !("entries" in timelineBlock.payload)) return;
  const entries = timelineBlock.payload.entries as TimelineEntry[];
  const before = entries.length;

  const pushUnique = (entry: TimelineEntry): void => {
    if (entries.length >= LIMITS.maxEntriesPerBlock) return;
    if (entries.some((e) => e.date === entry.date && saysTheSame(e.title, entry.title))) return;
    entries.push(entry);
  };

  for (const section of sections) {
    for (const line of section.lines) {
      const text = plainContentOf(line.text);
      if (!text) continue;

      // Rule 1 — Ticket / single_leg: Departure + Arrival always Timeline.
      if (mode === "single_leg") {
        const leg = harvestSingleLegLine(text);
        if (leg) pushUnique(leg);
        continue;
      }

      // Rule 2 — Invoice (and other obligation docs): Due Date → Timeline if confident.
      if (mode === "obligation_deadlines") {
        if (!shouldProjectInvoiceDueToTimeline(text)) continue;
        const due = parseObligationDateLine(text);
        if (due) pushUnique(due);
      }
    }
  }

  // Invoice "Due date" often lands as a Signal — promote only above confidence threshold.
  if (mode === "obligation_deadlines") {
    const signalsBlock = built.get("signals");
    if (signalsBlock && "entries" in signalsBlock.payload) {
      const signals = signalsBlock.payload.entries as SignalEntry[];
      const kept: SignalEntry[] = [];
      for (const signal of signals) {
        const asLine = `${signal.label}: ${signal.value ?? ""}`.trim();
        if (
          (shouldProjectInvoiceDueToTimeline(asLine) ||
            (/^due(?:\s+date)?$/i.test(signal.label) &&
              signal.value != null &&
              shouldProjectInvoiceDueToTimeline(`Due date: ${signal.value}`))) &&
          (isInvoiceArchetype(understanding.archetype.archetype) || mode === "obligation_deadlines")
        ) {
          const due =
            parseObligationDateLine(asLine) ??
            (signal.value != null
              ? {
                  date: String(signal.value),
                  title: `Due date: ${signal.value}`,
                  state: "planned" as const,
                }
              : null);
          if (due) {
            pushUnique(due);
            continue;
          }
        }
        kept.push(signal);
      }
      signalsBlock.payload.entries = kept;
    }
  }

  // Rule 1 finalize — Departure then Arrival occupy Timeline exclusively.
  if (mode === "single_leg") {
    timelineBlock.payload.entries = projectSingleLegTimeline(entries);
  }

  const after = (timelineBlock.payload.entries as TimelineEntry[]).length;
  const added = Math.max(0, after - before);
  if (added > 0) {
    warnings.push({
      code: "text.timeline-harvested",
      message: `Projected ${added} ${understanding.archetype.label.toLowerCase()} date memor${added === 1 ? "y" : "ies"} into Timeline.`,
    });
  }
}

/**
 * Move weak / unanchored temporal items out of Timeline into Signals.
 * Empty Timeline for menus/glossaries is correct — never pad it.
 */
function applyTemporalHonesty(
  built: Map<BlockKind, BlockInput>,
  understanding: Understanding,
  warnings: ImportWarning[],
): void {
  const timelineBlock = built.get("timeline");
  if (!timelineBlock || !("entries" in timelineBlock.payload)) return;

  const before = timelineBlock.payload.entries as TimelineEntry[];
  const gated = gateTimelineEntries(before, understanding.archetype, understanding.anchor);
  timelineBlock.payload.entries = gated.timeline;

  if (gated.demoted.length === 0) return;

  const signalsBlock = built.get("signals");
  if (signalsBlock && "entries" in signalsBlock.payload) {
    const entries = signalsBlock.payload.entries as SignalEntry[];
    for (const text of gated.demoted) {
      if (entries.length >= LIMITS.maxEntriesPerBlock) break;
      entries.push({
        label: "Unresolved temporal",
        implication: text.slice(0, LIMITS.maxFieldLength),
      });
    }
  }

  warnings.push({
    code: "text.timeline-gated",
    message: `Kept Timeline honest for ${understanding.archetype.label} (${understanding.archetype.timelineMode}): moved ${gated.demoted.length} weak temporal item${gated.demoted.length === 1 ? "" : "s"} to Signals.`,
  });
}

/**
 * An action that repeats a decision is that decision being carried out. The
 * link is recorded on the action so the reader can see the chain rather than
 * being told two unrelated things in two different lists.
 */
function linkActionsToDecisions(blocks: readonly BlockInput[]): void {
  const decisions = blocks.find((b) => b.kind === "decisions");
  const actions = blocks.find((b) => b.kind === "actions");
  if (!decisions || !actions) return;
  if (!("entries" in decisions.payload) || !("entries" in actions.payload)) return;
  const decisionEntries = decisions.payload.entries as DecisionEntry[];
  if (decisionEntries.length === 0) return;

  for (const action of actions.payload.entries as ActionLike[]) {
    if (action.from) continue;
    const match = decisionEntries.find((decision) => saysTheSame(decision.text, action.task));
    if (match) action.from = match.ref ?? match.text;
  }
}

interface ActionLike {
  task: string;
  from?: string;
}

/** Say what understanding actually did, in counts the reader can check. */
function understandingWarnings(understanding: Understanding): ImportWarning[] {
  const inferred =
    understanding.signals.length + understanding.decisions.length + understanding.risks.length;
  const parts: string[] = [];
  parts.push(
    `Read ${understanding.distilled} distinct statements as a ${understanding.intent.kind} (${understanding.archetype.label}, timeline ${understanding.archetype.timelineMode})`,
  );
  if (understanding.anchor.confidence !== "none" && understanding.anchor.value) {
    parts.push(`anchor ${understanding.anchor.value}`);
  } else {
    parts.push("no date anchor");
  }
  if (understanding.redundant > 0) parts.push(`set aside ${understanding.redundant} restatements`);
  if (inferred > 0) parts.push(`inferred ${inferred} memories from what they mean`);
  if (inferred === 0 && understanding.redundant === 0 && understanding.distilled === 0) return [];
  return [{ code: "text.understood", message: `${parts.join(", ")}.` }];
}

interface OrdinalMark {
  marker: string;
  title: string | null;
  line: number;
}

/* ------------------------------- per-kind build ------------------------------ */

interface BuildContext {
  title: string;
  label: string;
  warnings: ImportWarning[];
  understanding: Understanding;
  /** Composed once the other five memories exist; null while they are built. */
  recall: Recall | null;
  /** Sections that matched no memory; preserved on the snapshot. */
  leftovers: Section[];
  extraTimeline: TimelineEntry[];
  /**
   * Notes the build put there on purpose rather than because it was stuck.
   * The author's original opening is kept once recall replaces it, and that
   * is not the same event as text nobody could read.
   */
  keptOnPurpose: number;
}

function buildBlock(kind: BlockKind, matched: Section[], ctx: BuildContext): BlockInput {
  const { label, warnings } = ctx;
  const contentLines = matched.flatMap((s) => s.lines).filter((l) => l.text.trim() !== "");
  const assigned = matched.some((s) => s.assigned);
  const notes: string[] = [];
  const kindLabel = BLOCK_KIND_LABELS[kind];

  let payload: BlockInput["payload"];
  if (kind === "snapshot") {
    payload = buildSnapshotPayload(contentLines, notes, ctx);
  } else {
    payload = buildEntriesPayload(kind, contentLines, notes, assigned, ctx, matched);
  }

  const entryCount = (payload as { entries?: unknown[] }).entries?.length ?? 0;
  const hasNotes = notes.length > (kind === "snapshot" ? ctx.keptOnPurpose : 0);

  if (entryCount === 0 && notes.length === 0 && kind !== "snapshot") {
    // Empty Timeline is expected for archetypes with timeline_mode "none".
    if (kind === "timeline" && ctx.understanding.archetype.timelineMode === "none") {
      warnings.push({
        code: "text.timeline-empty-ok",
        message: `No timeline for this ${ctx.understanding.archetype.label.toLowerCase()} — empty Timeline is correct, not a failure.`,
      });
    } else {
      warnings.push({
        code: "text.no-blocks-recognized",
        message: `No ${kindLabel.toLowerCase()} were recognized, so that memory is empty. Nothing was invented.`,
      });
    }
  } else if (hasNotes) {
    warnings.push({
      code: "text.unrecognized-section",
      message: `Some text wasn't clearly recognized and is kept as-is in the ${kindLabel} memory.`,
    });
  }

  const method =
    kind !== "snapshot" && entryCount === 0 && notes.length > 0
      ? ("recovered" as const)
      : ("local-parser" as const);

  // Point provenance at the section that actually named this memory, not
  // merely the first one that happened to land here.
  const primary = matched.find((s) => s.assigned) ?? matched[0] ?? null;
  return {
    kind,
    payload,
    provenance: {
      method,
      label,
      locator: locatorOf(primary, contentLines, entryCount > 0 || kind === "snapshot"),
      excerpt: capExcerpt(contentLines.slice(0, 3).map((l) => l.text).join(" ")),
    },
  };
}

function locatorOf(section: Section | null, contentLines: SourceLine[], found: boolean): string {
  if (!section || (contentLines.length === 0 && section.headingLine === null)) {
    return found ? "source" : "not found in source";
  }
  const firstLine = section.headingLine ?? contentLines[0]?.lineNo ?? 1;
  const lastLine = contentLines[contentLines.length - 1]?.lineNo ?? firstLine;
  const range = firstLine === lastLine ? `line ${firstLine}` : `lines ${firstLine}–${lastLine}`;
  return section.headingText ? `heading “${section.headingText}” · ${range}` : range;
}

type LineParser<T> = (line: string) => T | null;

interface Collected<T> {
  entries: T[];
  notes?: string[];
  /** Source line for each entry, by index, so understanding can enrich it. */
  lineOf: Array<number | null>;
}

function buildEntriesPayload(
  kind: Exclude<BlockKind, "snapshot">,
  contentLines: SourceLine[],
  notes: string[],
  assigned: boolean,
  ctx: BuildContext,
  matched: readonly Section[] = [],
): BlockInput["payload"] {
  const collect = <T,>(
    strict: LineParser<T>,
    lenient: LineParser<T>,
    options: {
      salvageLists?: boolean;
      salvageProse?: boolean;
      /** Used when the section already has entries — high-confidence only. */
      salvage?: LineParser<T>;
    } = {},
  ): Collected<T> => {
    const entries: T[] = [];
    const lineOf: Array<number | null> = [];
    const unmatched: SourceLine[] = [];

    for (let i = 0; i < contentLines.length; i++) {
      const line = contentLines[i]!;
      if (isDecorativeLine(line.text)) continue;
      // Markdown table chrome is structural: separators are skipped, and a
      // row directly followed by a separator is the table's header.
      if (isTableSeparator(line.text)) continue;
      const next = contentLines[i + 1];
      if (splitTableRow(line.text) && next && isTableSeparator(next.text)) continue;
      const entry = strict(line.text);
      if (entry) {
        entries.push(entry);
        lineOf.push(line.lineNo);
      } else {
        unmatched.push(line);
      }
    }

    // Lenient when the section matched nothing strictly, or salvage leftovers
    // in assigned sections (Cases / metrics / questions must not die as notes).
    const strictCount = entries.length;
    const useLenient = assigned && (strictCount === 0 || options.salvageLists === true);
    for (const line of unmatched) {
      const tryLenient =
        useLenient &&
        entries.length < LIMITS.maxEntriesPerBlock &&
        (isListLike(line.text) ||
          (options.salvageProse === true && plainContentOf(line.text).length >= 24));
      if (tryLenient) {
        // No strict hits → full lenient for every leftover.
        // Some strict hits → high-confidence salvage only (never bare prose KPIs).
        const entry =
          strictCount === 0 ? lenient(line.text) : (options.salvage?.(line.text) ?? null);
        if (entry) {
          entries.push(entry);
          lineOf.push(line.lineNo);
          continue;
        }
      }
      if (notes.length < LIMITS.maxNotesPerBlock) notes.push(stripListMarker(line.text));
    }
    return { entries, lineOf, ...(notes.length > 0 ? { notes } : {}) };
  };

  const finish = <T,>(built: Collected<T>): BlockInput["payload"] =>
    ({ entries: built.entries, ...(built.notes ? { notes: built.notes } : {}) }) as BlockInput["payload"];

  switch (kind) {
    case "signals": {
      const built = collect(parseSignalLine, parseSignalLineLenient, {
        salvageLists: true,
        salvage: parseSignalSalvage,
      });
      mergeSignals(built, ctx, notes);
      // Compress inside the bucket after projection — never before routing.
      built.entries = dedupeByMeaning(built.entries, (e) => `${e.label} ${e.implication ?? ""}`);
      return finish(built);
    }
    case "decisions": {
      const built = collect(parseDecisionLine, parseDecisionLineLenient, {
        salvageLists: true,
        salvageProse: true,
        salvage: parseDecisionLineLenient,
      });
      mergeDecisions(built, ctx, notes);
      built.entries = dedupeByMeaning(built.entries, (e) => e.text);
      return finish(built);
    }
    case "timeline": {
      const built = collect(parseTimelineLine, parseTimelineLineLenient);
      if (ctx.extraTimeline.length > 0) {
        const room = LIMITS.maxEntriesPerBlock - built.entries.length;
        built.entries.push(...ctx.extraTimeline.slice(0, Math.max(0, room)));
      }
      built.entries = dedupeByMeaning(built.entries, (e) => `${e.date} ${e.title}`);
      return finish(built);
    }
    case "risks": {
      const built = collect(parseRiskLine, parseRiskLineLenient);
      mergeRisks(built, ctx, notes);
      built.entries = dedupeByMeaning(built.entries, (e) => e.risk);
      return finish(built);
    }
    case "actions": {
      const built = collect(parseActionLine, parseActionLineLenient);
      // Persona headings ("As a Purchase Manager") are first-class observations.
      for (const section of matched) {
        const heading = section.headingText?.replace(/^\d+(\.\d+)*\.?\s*/, "").trim() ?? "";
        if (!/^as an?\s+/i.test(heading)) continue;
        const task = `Persona: ${heading}`.slice(0, LIMITS.maxFieldLength);
        if (built.entries.some((e) => saysTheSame(e.task, task))) continue;
        if (built.entries.length >= LIMITS.maxEntriesPerBlock) break;
        built.entries.unshift({ task, status: "pending" });
      }
      built.entries = dedupeByMeaning(built.entries, (e) => e.task);
      return finish(built);
    }
  }
}

/* ----------------------------- merging the passes --------------------------- */

/**
 * How many inferred memories may join a structural list.
 *
 * Understanding is there to catch what the headings missed, not to bury them.
 * A block that arrives half-inferred stops reading like the author's document.
 */
const INFERRED_BUDGET = 6;

/** True when this line already became an entry somewhere, in any block. */
function alreadyUsed(lineNo: number, lineOf: ReadonlyArray<number | null>): boolean {
  return lineOf.includes(lineNo);
}

function mergeSignals(built: Collected<SignalEntry>, ctx: BuildContext, notes: string[]): void {
  let added = 0;
  for (const candidate of ctx.understanding.signals) {
    const { value, evidence } = candidate;
    const existing = built.entries.findIndex((_, i) => built.lineOf[i] === evidence.lineNo);
    if (existing >= 0) {
      // Same line, so this is the reasoning behind an entry we already have.
      const entry = built.entries[existing]!;
      if (!entry.implication && value.implication) entry.implication = value.implication;
      if (!entry.trend && value.trend) entry.trend = value.trend;
      continue;
    }
    if (added >= INFERRED_BUDGET) continue;
    if (built.entries.length >= LIMITS.maxEntriesPerBlock) break;
    if (alreadyUsed(evidence.lineNo, built.lineOf)) continue;
    if (built.entries.some((e) => saysTheSame(e.label, value.label))) continue;
    built.entries.push({
      label: value.label,
      ...(value.trend ? { trend: value.trend } : {}),
      ...(value.implication ? { implication: value.implication } : {}),
    });
    built.lineOf.push(evidence.lineNo);
    dropNote(notes, evidence.text);
    added++;
  }
}

function mergeDecisions(built: Collected<DecisionEntry>, ctx: BuildContext, notes: string[]): void {
  let added = 0;
  for (const candidate of ctx.understanding.decisions) {
    const { value, evidence } = candidate;
    const existing = built.entries.findIndex((_, i) => built.lineOf[i] === evidence.lineNo);
    if (existing >= 0) {
      const entry = built.entries[existing]!;
      if (!entry.because && value.because) entry.because = value.because;
      entry.commitment = value.commitment;
      continue;
    }
    // A suggestion is not a decision. Only settled positions may join a list
    // the reader will read as things that were decided.
    if (value.commitment !== "committed") continue;
    // Precedence belt: never merge a stronger category into Decisions.
    if (blocksDecisionInference(evidence.text) || blocksDecisionInference(value.text)) continue;
    if (added >= INFERRED_BUDGET) continue;
    if (built.entries.length >= LIMITS.maxEntriesPerBlock) break;
    if (alreadyUsed(evidence.lineNo, built.lineOf)) continue;
    if (built.entries.some((e) => saysTheSame(e.text, value.text))) continue;
    // Preserve commitment as metadata; status stays honest to the source.
    built.entries.push({
      text: value.text,
      status: "proposed",
      commitment: value.commitment,
      ...(value.because ? { because: value.because } : {}),
    });
    built.lineOf.push(evidence.lineNo);
    dropNote(notes, evidence.text);
    added++;
  }
}

function mergeRisks(built: Collected<RiskEntry>, ctx: BuildContext, notes: string[]): void {
  let added = 0;
  for (const candidate of ctx.understanding.risks) {
    const { value, evidence } = candidate;
    const existing = built.entries.findIndex((_, i) => built.lineOf[i] === evidence.lineNo);
    if (existing >= 0) {
      const entry = built.entries[existing]!;
      if (!entry.because && value.because) entry.because = value.because;
      if (!entry.consequence && value.consequence) entry.consequence = value.consequence;
      continue;
    }
    if (added >= INFERRED_BUDGET) continue;
    if (built.entries.length >= LIMITS.maxEntriesPerBlock) break;
    if (alreadyUsed(evidence.lineNo, built.lineOf)) continue;
    if (built.entries.some((e) => saysTheSame(e.risk, value.risk))) continue;
    built.entries.push({
      risk: value.risk,
      ...(value.because ? { because: value.because } : {}),
      ...(value.consequence ? { consequence: value.consequence } : {}),
    });
    built.lineOf.push(evidence.lineNo);
    dropNote(notes, evidence.text);
    added++;
  }
}

/** A line promoted to a memory should not also sit in the leftovers. */
function dropNote(notes: string[], text: string): void {
  const index = notes.findIndex((note) => saysTheSame(note, text));
  if (index >= 0) notes.splice(index, 1);
}

/* --------------------------------- snapshot --------------------------------- */

const BYLINE = /^(prepared\s+by|by\s+\w|reviewed\s+by|author)/i;

/** How many lines from unmatched sections the snapshot will carry. */
const LEFTOVER_NOTE_BUDGET = 24;

function buildSnapshotPayload(
  contentLines: SourceLine[],
  notes: string[],
  ctx: BuildContext,
): BlockInput["payload"] {
  const { understanding, leftovers } = ctx;
  const recall = ctx.recall;
  const paragraphs: string[] = [];
  let byline: string | undefined;
  let buffer: string[] = [];

  const flush = () => {
    if (buffer.length > 0) {
      paragraphs.push(buffer.join(" ").trim());
      buffer = [];
    }
  };

  for (const line of contentLines) {
    const text = line.text.trim();
    if (isTableSeparator(text) || isDecorativeLine(text)) continue;
    if (BYLINE.test(text) && byline === undefined && paragraphs.length <= 1) {
      flush();
      byline = text;
      continue;
    }
    // Lists and tables inside the snapshot section are kept as notes.
    if (splitListItem(line.text) || splitTableRow(line.text)) {
      flush();
      if (notes.length < LIMITS.maxNotesPerBlock) notes.push(stripListMarker(text));
      continue;
    }
    buffer.push(stripEmphasis(text));
  }
  flush();

  // The document's own opening paragraph is kept, but it is no longer the
  // summary. Recall goes first; the original prose moves down into the notes
  // where nothing is lost and nothing pretends to be a memory.
  const opening = paragraphs.shift() ?? "";
  const summary = recall?.summary || opening;
  if (recall?.composed && opening !== "" && notes.length < LIMITS.maxNotesPerBlock) {
    notes.push(opening);
    ctx.keptOnPurpose += 1;
  }
  for (const extra of paragraphs) {
    if (notes.length < LIMITS.maxNotesPerBlock) notes.push(extra);
  }

  // Sections that matched no memory are preserved here, heading included, so
  // nothing in the source vanishes silently. The budget is deliberately far
  // below the note cap: the full text stays one "View source" click away, and
  // a published page should not degenerate into a transcript of the upload.
  let budget = LEFTOVER_NOTE_BUDGET;
  for (const section of leftovers) {
    if (budget <= 0 || notes.length >= LIMITS.maxNotesPerBlock) break;
    if (section.headingText) {
      notes.push(stripEmphasis(section.headingText));
      budget--;
    }
    for (const line of section.lines) {
      if (budget <= 0 || notes.length >= LIMITS.maxNotesPerBlock) break;
      const text = line.text.trim();
      if (text === "" || isDecorativeLine(text) || isTableSeparator(text)) continue;
      notes.push(plainContentOf(line.text));
      budget--;
    }
  }

  // Snapshot always has a heading; the summary may be honestly empty.
  return {
    heading: understanding.heading,
    summary: summary || "Nothing here reads as a summary yet. The source text is kept below, exactly as it arrived.",
    ...(recall?.hook ? { hook: recall.hook } : {}),
    ...(recall?.goal ? { goal: recall.goal } : {}),
    ...(recall?.problem ? { problem: recall.problem } : {}),
    ...(recall?.outcome ? { outcome: recall.outcome } : {}),
    ...(byline ? { byline } : {}),
    ...(notes.length > 0 ? { notes } : {}),
  };
}
