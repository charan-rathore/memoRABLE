import { ok, type Result } from "@/reliability/result";
import type { Diagnostic } from "@/reliability/diagnostics";
import { finalizeDocument, type BlockInput } from "@/domain/memory/normalize";
import {
  BLOCK_KINDS,
  type ActionEntry,
  type BlockKind,
  type DecisionEntry,
  type ImportWarning,
  type MemoryDocument,
  type RiskEntry,
  type SignalEntry,
  type TimelineEntry,
} from "@/domain/memory/schema";
import {
  isKindApplicable,
  memoryProjectionFor,
  projectAdaptiveMemories,
  bucketLabel,
  gateTimelineEntries,
  recallFrom,
  understand,
  type Recall,
  type Understanding,
} from "@/understanding";
import { buildResearchWorldModel } from "@/understanding/research";
import {
  buildResearchKnowledgeGraph,
  mergeKnowledgeGraphs,
} from "@/understanding/knowledge-graph";
import type { KnowledgeGraph } from "@/domain/memory/schema";
import {
  blocksDecisionInference,
  harvestSingleLegLine,
  isInvoiceArchetype,
  projectSingleLegTimeline,
  shouldProjectInvoiceDueToTimeline,
} from "@/understanding/projection";
import { buildDocumentGraph, hybridSegment } from "@/understanding/segment";
import {
  dedupeByMeaning,
  isDecisionChrome,
  sameDecision,
  saysTheSame,
} from "@/understanding/language";
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
 * Primary path: hybrid segment → document graph → understand (all five list
 * memories) → structural enrich. Structure still wins on the same source line
 * (author filing is authority), but understanding is no longer a tiny gap-fill
 * budget — it is how prose without memory headings becomes memories.
 *
 * Section kinds come from: (1) heading synonyms, (2) content shape, (3) graph
 * node type when still unknown.
 *
 * Anything still unassigned is preserved as notes. The parser never invents
 * owners/dates/metrics, never produces a memory without a source sentence, and
 * never calls the network or AI.
 */

export interface TextImportInput {
  /** Preflighted text (BOM stripped, LF line endings). */
  text: string;
  /** Sanitized human label, e.g. "Pasted notes" or "launch-notes.md". */
  label: string;
  /** Optional Graphify-schema graph from Docling/Graphify sidecar. */
  knowledgeGraph?: KnowledgeGraph;
  /** Markdown produced by Docling (vs browser pdf.js). */
  parsedByDocling?: boolean;
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

  // Graph node types assign remaining unknown sections (RFC Stage 4 → extract).
  assignKindsFromGraph(sections, graph);

  const warnings: ImportWarning[] = [];
  const leftovers = sections.filter((s) => s.kind === null);

  // Understand every section (including unheaded prose) before structural merge.
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

  // Research papers: Sections → summaries → cross-section world model → projection.
  // Everything else: heading-routed line parsers (chunks are graph-only).
  const built = new Map<BlockKind, BlockInput>();
  const isResearch = understanding.archetype.archetype === "research";

  let researchGraph: KnowledgeGraph | undefined;
  if (isResearch) {
    const researchSections = sections.map((s) => ({
      headingText: s.headingText,
      lines: s.lines,
    }));
    const researchBuilt = buildResearchWorldModel({
      title,
      label,
      sections: researchSections,
    });
    for (const kind of BLOCK_KINDS) {
      const block = researchBuilt.get(kind);
      if (block) built.set(kind, block);
    }
    const localGraph = buildResearchKnowledgeGraph({
      title,
      label,
      sections: researchSections,
    });
    researchGraph = mergeKnowledgeGraphs(input.knowledgeGraph, localGraph);
    warnings.push({
      code: "text.understood",
      message: `Knowledge graph: ${researchGraph.nodes.length} nodes / ${researchGraph.edges.length} edges via ${researchGraph.extractor}${
        input.parsedByDocling ? " · Docling parse" : ""
      }.`,
    });
    warnings.push({
      code: "text.adaptive-projection",
      message:
        "Research path: section summaries → cross-section reasoning → world model (not chunk→bucket).",
    });
  } else {
    // The five list memories are built first. The snapshot frames them, so it
    // cannot be written until it has something to frame.
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
  }

  const blocks: BlockInput[] = projectAdaptiveMemories(
    BLOCK_KINDS.map((kind) => built.get(kind)!),
    understanding.archetype.archetype,
  );
  if (!isResearch) linkActionsToDecisions(blocks);
  warnings.push(...understandingWarnings(understanding));
  warnings.push(...graphWarnings(graph, segmented.segments.length));
  const { archetype: detected, label: archetypeLabel, score, scores, reasons } = understanding.archetype;
  const reasonLine =
    reasons.length > 0 ? ` · Reason: ${reasons.map((r) => `✓ ${r}`).join(" ")}` : "";
  warnings.push({
    code: "text.adaptive-projection",
    message: `Detected Archetype: ${archetypeLabel} · Raw Scores: Resume ${scores.resume}, Research ${scores.research}, Invoice ${scores.invoice} · Projection: ${archetypeLabel}${reasonLine}`,
  });

  const document = finalizeDocument({
    title,
    sourceMethod: "local-parser",
    sourceLabel: label,
    blocks,
    warnings,
    archetype: {
      id: detected,
      label: archetypeLabel,
      ...(score !== undefined ? { score } : {}),
      scores,
      ...(reasons.length > 0 ? { reasons: [...reasons] } : {}),
    },
    ...(researchGraph ? { knowledgeGraph: researchGraph } : {}),
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

/**
 * Map graph node types onto memory kinds when headings did not name one.
 * Requirements project into Decisions (Generic Knowledge furniture).
 */
function graphTypeToKind(
  type: ReturnType<typeof buildDocumentGraph>["nodes"][number]["type"],
): BlockKind | null {
  switch (type) {
    case "requirement":
    case "decision":
      return "decisions";
    case "risk":
      return "risks";
    case "metric":
    case "question":
      return "signals";
    default:
      return null;
  }
}

function assignKindsFromGraph(
  sections: Section[],
  graph: ReturnType<typeof buildDocumentGraph>,
): void {
  if (graph.nodes.length === 0) return;
  for (const section of sections) {
    if (section.kind !== null) continue;
    const title = section.headingText?.trim().toLowerCase() ?? "";
    if (!title) continue;
    const node = graph.nodes.find((n) => {
      const nt = n.title?.trim().toLowerCase() ?? "";
      if (!nt) return false;
      return nt === title || title.includes(nt) || nt.includes(title);
    });
    if (!node) continue;
    const kind = graphTypeToKind(node.type);
    if (!kind) continue;
    section.kind = kind;
    section.assigned = true;
  }
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
    understanding.signals.length +
    understanding.decisions.length +
    understanding.risks.length +
    understanding.timeline.length +
    understanding.actions.length;
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
  if (inferred > 0) {
    parts.push(
      `inferred ${inferred} memories from meaning (S${understanding.signals.length}/D${understanding.decisions.length}/R${understanding.risks.length}/T${understanding.timeline.length}/A${understanding.actions.length})`,
    );
  }
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

  let payload: BlockInput["payload"];
  if (kind === "snapshot") {
    payload = buildSnapshotPayload(contentLines, notes, ctx);
  } else {
    payload = buildEntriesPayload(kind, contentLines, notes, assigned, ctx, matched);
  }

  const entryCount = (payload as { entries?: unknown[] }).entries?.length ?? 0;
  const hasNotes = notes.length > (kind === "snapshot" ? ctx.keptOnPurpose : 0);
  const archetypeId = ctx.understanding.archetype.archetype;
  const applicable = isKindApplicable(archetypeId, kind);
  const projectedLabel = bucketLabel(archetypeId, kind);
  // Only PRD-style "keep empty" projections surface empty-bucket honesty warnings.
  const keepsEmptyBuckets =
    applicable && memoryProjectionFor(archetypeId).emptyApplicable === "keep";

  if (entryCount === 0 && notes.length === 0 && kind !== "snapshot") {
    // Inapplicable / omitted empties are never extraction failures.
    if (keepsEmptyBuckets) {
      warnings.push({
        code: "text.no-blocks-recognized",
        message: `No ${projectedLabel.toLowerCase()} were recognized, so that memory is empty. Nothing was invented.`,
      });
    }
  } else if (hasNotes) {
    warnings.push({
      code: "text.unrecognized-section",
      message: `Some text wasn't clearly recognized and is kept as-is in the ${projectedLabel} memory.`,
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
      // Compress inside Decisions: Key Requirements ≈ Acceptance Criteria.
      built.entries = compressDecisions(built.entries);
      return finish(built);
    }
    case "timeline": {
      const built = collect(parseTimelineLine, parseTimelineLineLenient);
      mergeTimeline(built, ctx, notes);
      if (ctx.extraTimeline.length > 0) {
        const room = LIMITS.maxEntriesPerBlock - built.entries.length;
        for (const extra of ctx.extraTimeline.slice(0, Math.max(0, room))) {
          if (built.entries.some((e) => e.date === extra.date && saysTheSame(e.title, extra.title))) {
            continue;
          }
          built.entries.push(extra);
        }
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
      mergeActions(built, ctx, notes);
      built.entries = dedupeByMeaning(built.entries, (e) => e.task);
      return finish(built);
    }
  }
}

/* ----------------------------- merging the passes --------------------------- */

/**
 * How many inferred memories may join each structural list.
 *
 * Understanding is the primary recovery path for unheaded prose; the budget is
 * high enough to fill empty blocks without drowning an already-rich section.
 */
const INFERRED_BUDGET = 24;

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
    if (isDecisionChrome(value.text)) continue;
    if (built.entries.some((e) => sameDecision(e.text, value.text))) continue;
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

function mergeTimeline(built: Collected<TimelineEntry>, ctx: BuildContext, notes: string[]): void {
  if (ctx.understanding.archetype.timelineMode === "none") return;
  let added = 0;
  for (const candidate of ctx.understanding.timeline) {
    const { value, evidence } = candidate;
    const existing = built.entries.findIndex((_, i) => built.lineOf[i] === evidence.lineNo);
    if (existing >= 0) continue;
    if (added >= INFERRED_BUDGET) continue;
    if (built.entries.length >= LIMITS.maxEntriesPerBlock) break;
    if (alreadyUsed(evidence.lineNo, built.lineOf)) continue;
    if (built.entries.some((e) => e.date === value.date && saysTheSame(e.title, value.title))) {
      continue;
    }
    built.entries.push({
      date: value.date,
      title: value.title,
      state: value.state ?? "planned",
      ...(value.produces ? { produces: value.produces } : {}),
      ...(value.requires ? { requires: value.requires } : {}),
    });
    built.lineOf.push(evidence.lineNo);
    dropNote(notes, evidence.text);
    added++;
  }
}

function mergeActions(built: Collected<ActionEntry>, ctx: BuildContext, notes: string[]): void {
  let added = 0;
  for (const candidate of ctx.understanding.actions) {
    const { value, evidence } = candidate;
    const existing = built.entries.findIndex((_, i) => built.lineOf[i] === evidence.lineNo);
    if (existing >= 0) {
      const entry = built.entries[existing]!;
      if (!entry.owner && value.owner) entry.owner = value.owner;
      if (!entry.due && value.due) entry.due = value.due;
      if (!entry.from && value.from) entry.from = value.from;
      continue;
    }
    if (added >= INFERRED_BUDGET) continue;
    if (built.entries.length >= LIMITS.maxEntriesPerBlock) break;
    if (alreadyUsed(evidence.lineNo, built.lineOf)) continue;
    if (built.entries.some((e) => saysTheSame(e.task, value.task))) continue;
    built.entries.push({
      task: value.task,
      status: value.status ?? "pending",
      ...(value.owner ? { owner: value.owner } : {}),
      ...(value.due ? { due: value.due } : {}),
      ...(value.from ? { from: value.from } : {}),
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

/**
 * Merge restated requirements into one Decision, preferring the stronger stance
 * and the richer phrasing. Drops section chrome ("Business Impact").
 */
function compressDecisions(entries: readonly DecisionEntry[]): DecisionEntry[] {
  const kept: DecisionEntry[] = [];
  for (const entry of entries) {
    if (isDecisionChrome(entry.text)) continue;
    const existing = kept.findIndex((k) => sameDecision(k.text, entry.text));
    if (existing < 0) {
      kept.push({ ...entry });
      continue;
    }
    kept[existing] = mergeDecisionPair(kept[existing]!, entry);
  }
  return kept;
}

function mergeDecisionPair(a: DecisionEntry, b: DecisionEntry): DecisionEntry {
  const statusRank = { rejected: 0, proposed: 1, requested: 2, approved: 3 } as const;
  const commitmentRank = { considered: 0, committed: 1 } as const;
  const status =
    statusRank[a.status] >= statusRank[b.status] ? a.status : b.status;
  const aCommit = a.commitment ?? "considered";
  const bCommit = b.commitment ?? "considered";
  const commitment =
    commitmentRank[aCommit] >= commitmentRank[bCommit] ? a.commitment : b.commitment;
  // Prefer the longer, more specific phrasing as the canonical text.
  const text = a.text.length >= b.text.length ? a.text : b.text;
  return {
    ...a,
    text,
    status,
    ...(commitment ? { commitment } : {}),
    ...(a.because || b.because ? { because: a.because ?? b.because } : {}),
    ...(a.ref || b.ref ? { ref: a.ref ?? b.ref } : {}),
  };
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
