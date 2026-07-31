import { ok, type Result } from "@/reliability/result";
import type { Diagnostic } from "@/reliability/diagnostics";
import { finalizeDocument, type BlockInput } from "@/domain/memory/normalize";
import {
  BLOCK_KINDS,
  BLOCK_KIND_LABELS,
  type BlockKind,
  type ImportWarning,
  type MemoryDocument,
  type TimelineEntry,
} from "@/domain/memory/schema";
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
  parseRiskLine,
  parseRiskLineLenient,
  parseSignalLine,
  parseSignalLineLenient,
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
 * A section is assigned to a memory by its heading when the heading names one
 * ("Risks", "Implementation Rules"), and otherwise by the shape of its lines.
 * Within an assigned section the strict patterns run first; only if they
 * recognize nothing does a lenient pass record the remaining list items,
 * leaving every unstated field undefined.
 *
 * Anything still unassigned is preserved verbatim as notes. The parser never
 * invents owners, dates, metrics, severities or statuses, and never calls the
 * network or AI.
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
  const { text, label } = input;
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
  const timelineExtras = ordinals
    .filter((o) => o.title)
    .slice(0, LIMITS.maxEntriesPerBlock)
    .map<TimelineEntry>((o) => ({ date: o.marker, title: o.title!, state: "planned" }));

  const blocks: BlockInput[] = BLOCK_KINDS.map((kind) =>
    buildBlock(kind, sections.filter((s) => s.kind === kind), {
      title,
      label,
      warnings,
      leftovers: kind === "snapshot" ? leftovers : [],
      extraTimeline: kind === "timeline" ? timelineExtras : [],
    }),
  );

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
  /** Sections that matched no memory; preserved on the snapshot. */
  leftovers: Section[];
  extraTimeline: TimelineEntry[];
}

function buildBlock(kind: BlockKind, matched: Section[], ctx: BuildContext): BlockInput {
  const { title, label, warnings } = ctx;
  const contentLines = matched.flatMap((s) => s.lines).filter((l) => l.text.trim() !== "");
  const assigned = matched.some((s) => s.assigned);
  const notes: string[] = [];
  const kindLabel = BLOCK_KIND_LABELS[kind];

  let payload: BlockInput["payload"];
  if (kind === "snapshot") {
    payload = buildSnapshotPayload(contentLines, title, notes, ctx.leftovers);
  } else {
    payload = buildEntriesPayload(kind, contentLines, notes, assigned, ctx.extraTimeline);
  }

  const entryCount = (payload as { entries?: unknown[] }).entries?.length ?? 0;
  const hasNotes = notes.length > 0;

  if (entryCount === 0 && !hasNotes && kind !== "snapshot") {
    warnings.push({
      code: "text.no-blocks-recognized",
      message: `No ${kindLabel.toLowerCase()} were recognized — that memory is empty. Nothing was invented.`,
    });
  } else if (hasNotes) {
    warnings.push({
      code: "text.unrecognized-section",
      message: `Some text wasn't clearly recognized and is kept as-is in the ${kindLabel} memory.`,
    });
  }

  const method =
    kind !== "snapshot" && entryCount === 0 && hasNotes ? ("recovered" as const) : ("local-parser" as const);

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

function buildEntriesPayload(
  kind: Exclude<BlockKind, "snapshot">,
  contentLines: SourceLine[],
  notes: string[],
  assigned: boolean,
  extraTimeline: TimelineEntry[],
): BlockInput["payload"] {
  const collect = <T,>(strict: LineParser<T>, lenient: LineParser<T>): { entries: T[]; notes?: string[] } => {
    const entries: T[] = [];
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
      if (entry) entries.push(entry);
      else unmatched.push(line);
    }

    // Only when the section is clearly this memory AND the strict patterns
    // found nothing does the lenient pass run — and only over marked items.
    const useLenient = assigned && entries.length === 0;
    for (const line of unmatched) {
      if (useLenient && isListLike(line.text) && entries.length < LIMITS.maxEntriesPerBlock) {
        const entry = lenient(line.text);
        if (entry) {
          entries.push(entry);
          continue;
        }
      }
      if (notes.length < LIMITS.maxNotesPerBlock) notes.push(stripListMarker(line.text));
    }
    return notes.length > 0 ? { entries, notes } : { entries };
  };

  switch (kind) {
    case "signals":
      return collect(parseSignalLine, parseSignalLineLenient);
    case "decisions":
      return collect(parseDecisionLine, parseDecisionLineLenient);
    case "timeline": {
      const built = collect(parseTimelineLine, parseTimelineLineLenient);
      if (extraTimeline.length > 0) {
        const room = LIMITS.maxEntriesPerBlock - built.entries.length;
        built.entries.push(...extraTimeline.slice(0, Math.max(0, room)));
      }
      return built;
    }
    case "risks":
      return collect(parseRiskLine, parseRiskLineLenient);
    case "actions":
      return collect(parseActionLine, parseActionLineLenient);
  }
}

/* --------------------------------- snapshot --------------------------------- */

const BYLINE = /^(prepared\s+by|by\s+\w|reviewed\s+by|author)/i;

/** How many lines from unmatched sections the snapshot will carry. */
const LEFTOVER_NOTE_BUDGET = 24;

function buildSnapshotPayload(
  contentLines: SourceLine[],
  title: string,
  notes: string[],
  leftovers: Section[],
): BlockInput["payload"] {
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

  const summary = paragraphs.shift() ?? "";
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
    heading: title,
    summary: summary || "No summary was recognized — the source text is preserved below.",
    ...(byline ? { byline } : {}),
    ...(notes.length > 0 ? { notes } : {}),
  };
}
