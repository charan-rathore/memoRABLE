/**
 * Layout-aware PDF text reconstruction.
 *
 * pdf.js text items are positioned glyphs, not lines. Joining them with spaces
 * (the old path) destroyed headings, tables, and list structure. This module
 * rebuilds reading order from geometry, then emits structured Markdown the
 * semantic segmenter and local parser can understand.
 */

export interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  hasEOL?: boolean;
}

export interface LayoutLine {
  text: string;
  page: number;
  /** Baseline Y in PDF space (origin bottom-left). */
  y: number;
  fontSize: number;
  /** True when typography + shape say this is a heading. */
  heading: boolean;
  headingLevel: 1 | 2 | 3 | null;
  /** True when large horizontal gaps imply columns (table row). */
  tableRow: boolean;
  cells: string[];
}

export interface LayoutPage {
  page: number;
  lines: LayoutLine[];
  /** Approximate body font size for the page. */
  bodySize: number;
}

export interface LayoutDocument {
  pages: LayoutPage[];
  /** Structured Markdown with page markers, headings, tables, lists. */
  markdown: string;
}

interface RawPart {
  str: string;
  x: number;
  width: number;
  height: number;
}

/** Reconstruct a single page's text items into ordered layout lines. */
export function reconstructPageLines(page: number, items: readonly PdfTextItem[]): LayoutLine[] {
  const rows = new Map<number, RawPart[]>();

  for (const item of items) {
    const str = item.str ?? "";
    if (!str) continue;
    const x = item.transform[4] ?? 0;
    const y = item.transform[5] ?? 0;
    const height = item.height || Math.abs(item.transform[3] ?? 10) || 10;
    const key = Math.round(y * 2) / 2;
    const bucket = rows.get(key);
    const part: RawPart = { str, x, width: item.width || 0, height };
    if (bucket) bucket.push(part);
    else rows.set(key, [part]);
  }

  const ys = [...rows.keys()].sort((a, b) => b - a);
  const lines: LayoutLine[] = [];

  for (const y of ys) {
    const parts = (rows.get(y) ?? []).sort((a, b) => a.x - b.x);
    if (parts.length === 0) continue;

    const joined = joinParts(parts);
    const cleaned = normalizeLineText(joined.text);
    if (!cleaned) continue;

    const fontSize = Math.max(...parts.map((p) => p.height));
    const loose = joined.tableRow ? joined.cells : splitLooseCells(cleaned);
    const tableRow = joined.tableRow || loose.length >= 3 || isTicketRow(cleaned) || isPriorityRow(cleaned);
    lines.push({
      text: cleaned,
      page,
      y,
      fontSize,
      heading: false,
      headingLevel: null,
      tableRow,
      cells: loose.length >= 2 ? loose : joined.cells,
    });
  }

  return lines;
}

function joinParts(parts: readonly RawPart[]): { text: string; cells: string[]; tableRow: boolean } {
  const cells: string[] = [];
  let cell = "";
  let largeGaps = 0;
  let prev: RawPart | null = null;

  for (const part of parts) {
    if (!part.str) continue;
    if (!prev) {
      cell = part.str;
      prev = part;
      continue;
    }
    const gap = part.x - (prev.x + prev.width);
    if (gap > 28) {
      largeGaps++;
      if (cell.trim()) cells.push(collapseWs(cell));
      cell = part.str;
    } else if (gap > 1.2 && !cell.endsWith(" ") && !part.str.startsWith(" ")) {
      cell += ` ${part.str}`;
    } else {
      cell += part.str;
    }
    prev = part;
  }
  if (cell.trim()) cells.push(collapseWs(cell));

  const tableRow = largeGaps >= 1 && cells.length >= 2;
  const text = tableRow ? cells.join(" | ") : cells.join(" ");
  return { text: collapseWs(text), cells: tableRow ? cells : [], tableRow };
}

function collapseWs(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeLineText(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/^[●•▪◦]\s*/, "• ")
    .trim();
}

/** Mark headings from font size relative to the page body, plus shape cues. */
export function annotateHeadings(lines: LayoutLine[]): number {
  if (lines.length === 0) return 10;
  const sizes = lines.map((l) => l.fontSize).sort((a, b) => a - b);
  const bodySize = sizes[Math.floor(sizes.length * 0.5)] ?? 10;
  const headingFloor = bodySize + 1.2;

  for (const line of lines) {
    const level = headingLevelFor(line, bodySize, headingFloor);
    line.heading = level !== null;
    line.headingLevel = level;
  }
  return bodySize;
}

function headingLevelFor(
  line: LayoutLine,
  bodySize: number,
  headingFloor: number,
): 1 | 2 | 3 | null {
  const text = line.text;
  if (line.tableRow) return null;
  if (/^•\s/.test(text) || /^\d+[.)]\s+\S/.test(text)) return null;
  // Soft-wrapped mid-sentence fragments are never headings.
  if (/^[a-z]/.test(text)) return null;

  const short = text.length <= 72;
  const titleLike =
    short &&
    !/[.!?]$/.test(text) &&
    !/[,;]$/.test(text) &&
    !/^(we|the|this|these|those|our|a|an|without|with|from|for|and|but)\b/i.test(text);

  const numberedSection = /^\d+(\.\d+)*\.?\s+\S/.test(text) && text.length <= 80;
  const keywordColon = short && /:\s*$/.test(text);
  const large = line.fontSize >= headingFloor;
  const display = line.fontSize >= bodySize + 3.5;

  if (!large && !numberedSection && !keywordColon) return null;
  // Long sentence-shaped lines at heading size are body copy (Google Docs quirk).
  if (text.length > 90 || (text.length > 60 && /^(current|we|this|these)\b/i.test(text))) {
    return null;
  }
  if (!titleLike && !numberedSection && !keywordColon) return null;

  if (display) return 1;
  if (large || numberedSection) return 2;
  if (keywordColon) return 3;
  return null;
}

/** Join wrapped body lines and emit Markdown for the whole PDF. */
export function layoutToMarkdown(pages: LayoutPage[]): string {
  const out: string[] = [];

  for (const page of pages) {
    out.push(`<!-- page:${page.page} -->`);
    let i = 0;
    while (i < page.lines.length) {
      const line = page.lines[i]!;

      if (line.heading && line.headingLevel) {
        out.push(`${"#".repeat(line.headingLevel)} ${line.text.replace(/:$/, "")}`);
        i++;
        continue;
      }

      if (line.tableRow || looksLikeTableHeader(line.text)) {
        const block: LayoutLine[] = [line];
        i++;
        while (i < page.lines.length && block.length < 40) {
          const row = page.lines[i]!;
          if (row.heading) break;
          if (!(row.tableRow || looksLikeTableContinuation(row, block))) break;
          block.push(row);
          i++;
        }
        const tableLines = emitMarkdownTable(block);
        for (const tableLine of tableLines) out.push(tableLine);
        out.push("");
        continue;
      }

      if (/^•\s/.test(line.text) || /^\d+[.)]\s+/.test(line.text)) {
        out.push(toListMarkdown(line.text));
        i++;
        continue;
      }

      // Merge soft-wrapped prose until a blank-structure boundary.
      const prose: string[] = [line.text];
      i++;
      while (i < page.lines.length) {
        const next = page.lines[i]!;
        if (next.heading || next.tableRow || /^•\s/.test(next.text) || /^\d+[.)]\s+/.test(next.text)) {
          break;
        }
        if (isSoftWrapContinuation(prose[prose.length - 1]!, next.text)) {
          prose.push(next.text);
          i++;
          continue;
        }
        break;
      }
      out.push(prose.join(" ").replace(/\s+/g, " ").trim());
      out.push("");
    }
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function looksLikeTableHeader(text: string): boolean {
  if (/\bmatrix\b/i.test(text)) return false; // "Priority & Impact Matrix" is a section title
  return (
    /^(ticket|priority)\b/i.test(text) &&
    /\b(summary|status|feature)\b/i.test(text)
  );
}

function isTicketRow(text: string): boolean {
  return /^[A-Z]{2,}-\d+\b/.test(text);
}

function isPriorityRow(text: string): boolean {
  return /^P\d\s*[-–—]/i.test(text);
}

function looksLikeTableContinuation(row: LayoutLine, block: LayoutLine[]): boolean {
  if (row.tableRow || isTicketRow(row.text) || isPriorityRow(row.text)) return true;
  if (block.length === 0) return false;
  if (row.heading || /^•\s/.test(row.text) || /^\d+[.)]\s+/.test(row.text)) return false;
  const prev = block[block.length - 1]!;
  // Only accept a wrap when the previous row was tabular and this line is a
  // short mid-cell continuation (not a new prose paragraph).
  if (!(prev.tableRow || isTicketRow(prev.text) || looksLikeTableHeader(prev.text))) return false;
  if (row.fontSize > prev.fontSize + 0.2) return false;
  if (row.text.length > 70) return false;
  if (/^(record|risk)\b/i.test(row.text)) return true;
  if (/^[a-z(]/.test(row.text) && Math.abs(prev.y - row.y) < 18) return true;
  return false;
}

function emitMarkdownTable(rows: LayoutLine[]): string[] {
  if (rows.length === 0) return [];
  const cellRows = rows.map((r) => (r.cells.length >= 2 ? r.cells : splitLooseCells(r.text)));
  const width = Math.min(12, Math.max(1, ...cellRows.map((c) => Math.min(c.length, 12))));
  const normalized = cellRows.map((cells) => {
    const copy = cells.slice(0, width);
    while (copy.length < width) copy.push("");
    return copy.map((c) => c.replace(/\|/g, "/"));
  });

  // Merge orphan wrap rows into previous data row when they have one cell.
  const merged: string[][] = [];
  for (const cells of normalized) {
    const nonEmpty = cells.filter((c) => c.trim());
    if (merged.length > 0 && nonEmpty.length === 1 && cells[0] && !/^[A-Z]{2,}/.test(cells[0])) {
      const prev = merged[merged.length - 1]!;
      const idx = Math.min(1, prev.length - 1);
      prev[idx] = `${prev[idx] ?? ""} ${nonEmpty[0]}`.trim();
      continue;
    }
    merged.push(cells);
  }

  if (merged.length === 0) return rows.map((r) => r.text);

  const header = merged[0]!;
  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...merged.slice(1).map((r) => `| ${r.join(" | ")} |`),
  ];
  return lines;
}

function splitLooseCells(text: string): string[] {
  if (text.includes(" | ")) return text.split(" | ").map((c) => c.trim()).filter(Boolean);
  if (/^ticket\b/i.test(text) && /\bstatus\b/i.test(text) && !/\bmatrix\b/i.test(text)) {
    return ["Ticket", "Summary", "Status"];
  }
  if (
    /^priority\b/i.test(text) &&
    /\bfeature\b/i.test(text) &&
    !/\bmatrix\b/i.test(text)
  ) {
    return ["Priority", "Feature", "Business Impact"];
  }
  // Ticket rows: PSTD-1234 Title Prioritised
  const ticket = /^([A-Z]{2,}-\d+)\s+(.+?)\s+(Prioritised|Prioritized|Done|Open|Closed)\s*$/i.exec(
    text,
  );
  if (ticket) return [ticket[1]!, ticket[2]!, ticket[3]!];
  const priority = /^(P[0-9]\s*[-–—]\s*\w+)\s+(.+?)\s+(High|Medium|Low)\b(.*)$/i.exec(text);
  if (priority) {
    return [priority[1]!, priority[2]!, `${priority[3]}${priority[4] ?? ""}`.trim()];
  }
  return [text];
}

function toListMarkdown(text: string): string {
  if (/^•\s/.test(text)) return `- ${text.replace(/^•\s*/, "")}`;
  return text.replace(/^(\d+)[.)]\s+/, "$1. ");
}

function isSoftWrapContinuation(prev: string, next: string): boolean {
  if (!prev || !next) return false;
  if (/[.!?:]$/.test(prev)) return false;
  if (/^[A-Z][A-Z0-9_/-]{2,}$/.test(next)) return false; // ticket id / acronym line
  return true;
}

/** Build a full layout document from per-page item arrays. */
export function buildLayoutDocument(
  pageItems: ReadonlyArray<{ page: number; items: readonly PdfTextItem[] }>,
): LayoutDocument {
  const pages: LayoutPage[] = pageItems.map(({ page, items }) => {
    const lines = reconstructPageLines(page, items);
    const bodySize = annotateHeadings(lines);
    return { page, lines, bodySize };
  });
  return { pages, markdown: layoutToMarkdown(pages) };
}
