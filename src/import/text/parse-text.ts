import { ok, type Result } from "@/reliability/result";
import type { Diagnostic } from "@/reliability/diagnostics";
import { finalizeDocument, type BlockInput } from "@/domain/memory/normalize";
import {
  BLOCK_KINDS,
  BLOCK_KIND_LABELS,
  type BlockKind,
  type ImportWarning,
  type MemoryDocument,
} from "@/domain/memory/schema";
import { LIMITS } from "@/domain/memory/limits";
import { capExcerpt } from "../json/import-json";
import { classifyHeading, isStructuralLine, matchHeading } from "./sections";
import {
  isTableSeparator,
  parseActionLine,
  parseDecisionLine,
  parseRiskLine,
  parseSignalLine,
  parseTimelineLine,
  splitListItem,
  splitTableRow,
  stripListMarker,
} from "./patterns";

/**
 * Lossless local Text/Markdown parser (reliability layer 2).
 *
 * Recognizes the six memory sections conservatively. Anything unclear is
 * preserved verbatim as plain-text notes on the nearest memory, with an
 * honest warning. The parser never invents owners, dates, metrics,
 * severities or statuses, and never calls the network or AI.
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
  kind: BlockKind;
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

  // Split content into sections by recognized headings.
  const sections: Section[] = [];
  const preamble: SourceLine[] = [];
  let current: Section | null = null;

  for (let i = 0; i < rawLines.length; i++) {
    if (i === titleConsumedLine) continue;
    const line = rawLines[i]!;
    if (isStructuralLine(line)) continue;
    const heading = matchHeading(line, rawLines[i + 1]);
    if (heading) {
      const kind = classifyHeading(heading.text);
      if (kind) {
        current = findOrCreateSection(sections, kind, heading.text, i + 1);
        continue;
      }
      // Unrecognized heading: preserved as content so nothing disappears.
    }
    const sourceLine: SourceLine = { text: line, lineNo: i + 1 };
    if (current) current.lines.push(sourceLine);
    else preamble.push(sourceLine);
  }

  // The snapshot owns the preamble (first paragraph → summary).
  const snapshotSection = findOrCreateSection(sections, "snapshot", null, null);
  snapshotSection.lines = [...preamble, ...snapshotSection.lines];

  const warnings: ImportWarning[] = [];
  const blocks: BlockInput[] = BLOCK_KINDS.map((kind) => {
    const section = sections.find((s) => s.kind === kind);
    return buildBlock(kind, section ?? null, title, label, warnings);
  });

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

function findOrCreateSection(
  sections: Section[],
  kind: BlockKind,
  headingText: string | null,
  headingLine: number | null,
): Section {
  const existing = sections.find((s) => s.kind === kind);
  if (existing) {
    // Merge repeated sections into the first, preserving order.
    if (headingText && !existing.headingText) {
      existing.headingText = headingText;
      existing.headingLine = headingLine;
    }
    return existing;
  }
  const section: Section = { kind, headingText, headingLine, lines: [] };
  sections.push(section);
  return section;
}

/* ------------------------------- per-kind build ------------------------------ */

function buildBlock(
  kind: BlockKind,
  section: Section | null,
  title: string,
  label: string,
  warnings: ImportWarning[],
): BlockInput {
  const contentLines = (section?.lines ?? []).filter((l) => l.text.trim() !== "");
  const notes: string[] = [];
  const kindLabel = BLOCK_KIND_LABELS[kind];

  let payload: BlockInput["payload"];
  if (kind === "snapshot") {
    payload = buildSnapshotPayload(contentLines, title, notes);
  } else {
    payload = buildEntriesPayload(kind, contentLines, notes);
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

  return {
    kind,
    payload,
    provenance: {
      method,
      label,
      locator: locatorOf(section, contentLines, entryCount > 0 || kind === "snapshot"),
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

function buildEntriesPayload(
  kind: Exclude<BlockKind, "snapshot">,
  contentLines: SourceLine[],
  notes: string[],
): BlockInput["payload"] {
  const collect = <T,>(parse: (line: string) => T | null): { entries: T[]; notes?: string[] } => {
    const entries: T[] = [];
    for (let i = 0; i < contentLines.length; i++) {
      const line = contentLines[i]!;
      // Markdown table chrome is structural: separators are skipped, and a
      // row directly followed by a separator is the table's header.
      if (isTableSeparator(line.text)) continue;
      const next = contentLines[i + 1];
      if (splitTableRow(line.text) && next && isTableSeparator(next.text)) continue;
      const entry = parse(line.text);
      if (entry) entries.push(entry);
      else if (notes.length < LIMITS.maxNotesPerBlock) notes.push(stripListMarker(line.text));
    }
    return notes.length > 0 ? { entries, notes } : { entries };
  };
  switch (kind) {
    case "signals":
      return collect(parseSignalLine);
    case "decisions":
      return collect(parseDecisionLine);
    case "timeline":
      return collect(parseTimelineLine);
    case "risks":
      return collect(parseRiskLine);
    case "actions":
      return collect(parseActionLine);
  }
}

/* --------------------------------- snapshot --------------------------------- */

const BYLINE = /^(prepared\s+by|by\s+\w|reviewed\s+by|author)/i;

function buildSnapshotPayload(
  contentLines: SourceLine[],
  title: string,
  notes: string[],
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
    if (isTableSeparator(text)) continue;
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
    buffer.push(text);
  }
  flush();

  const summary = paragraphs.shift() ?? "";
  for (const extra of paragraphs) {
    if (notes.length < LIMITS.maxNotesPerBlock) notes.push(extra);
  }
  // Snapshot always has a heading; the summary may be honestly empty.
  return {
    heading: title,
    summary: summary || "No summary was recognized — the source text is preserved below.",
    ...(byline ? { byline } : {}),
    ...(notes.length > 0 ? { notes } : {}),
  };
}
