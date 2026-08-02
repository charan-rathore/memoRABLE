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
  /** Reading-order column after two-column detection. */
  column?: "left" | "right" | "full";
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
  y: number;
}

/**
 * Detect a vertical gutter for two-column pages (ACL/NeurIPS-style).
 * Finds the two dominant left-edge peaks and returns their midpoint.
 */
export function detectColumnGutter(items: readonly PdfTextItem[]): number | null {
  // Character-mass histogram of left edges (ignore ultra-wide title runs).
  const bins = new Map<number, number>();
  let total = 0;
  for (const item of items) {
    const str = item.str ?? "";
    if (!str.trim()) continue;
    const w = item.width || 0;
    if (w > 220) continue;
    const b = Math.round((item.transform[4] ?? 0) / 10) * 10;
    bins.set(b, (bins.get(b) || 0) + str.length);
    total += str.length;
  }
  if (total < 400 || bins.size < 6) return null;

  const sorted = [...bins.entries()].sort((a, b) => a[0] - b[0]);
  const minX = sorted[0]![0];
  const maxX = sorted[sorted.length - 1]![0];
  if (maxX - minX < 180) return null;

  // Local maxima: mass greater than immediate neighbors.
  const peaks: Array<{ x: number; mass: number }> = [];
  for (let i = 0; i < sorted.length; i++) {
    const [x, mass] = sorted[i]!;
    const prev = sorted[i - 1]?.[1] ?? 0;
    const next = sorted[i + 1]?.[1] ?? 0;
    if (mass >= prev && mass >= next && mass >= 80) peaks.push({ x, mass });
  }
  peaks.sort((a, b) => b.mass - a.mass);

  // Pick the strongest peak and the strongest peak far from it.
  const primary = peaks[0];
  if (!primary) return null;
  const secondary = peaks.find((p) => Math.abs(p.x - primary.x) >= 140 && p.mass >= 150);
  if (!secondary) return null;

  const leftPeak = Math.min(primary.x, secondary.x);
  const rightPeak = Math.max(primary.x, secondary.x);

  // Gutter = lowest-mass bin between peaks (not the arithmetic midpoint).
  // Midpoint is too far left when left-column lines continue past center.
  let gutter = (leftPeak + rightPeak) / 2;
  let bestMass = Number.POSITIVE_INFINITY;
  for (const [x, mass] of sorted) {
    if (x <= leftPeak + 30 || x >= rightPeak - 30) continue;
    if (mass < bestMass || (mass === bestMass && Math.abs(x - gutter) < 20)) {
      bestMass = mass;
      gutter = x;
    }
  }
  // Bias slightly toward the right peak so left-column wrap fragments
  // that start mid-line (x≈230) stay left of the cut.
  gutter = Math.min(gutter + 30, rightPeak - 40);

  // Both sides of the gutter must carry real body mass.
  let leftMass = 0;
  let rightMass = 0;
  for (const [x, mass] of sorted) {
    if (x < gutter) leftMass += mass;
    else rightMass += mass;
  }
  if (leftMass < 250 || rightMass < 250) return null;
  // Reject near-equal single-column pages with a weak secondary bump.
  const ratio = Math.min(leftMass, rightMass) / Math.max(leftMass, rightMass);
  if (ratio < 0.35) return null;

  return gutter;
}

/** Reconstruct a single page's text items into ordered layout lines. */
export function reconstructPageLines(page: number, items: readonly PdfTextItem[]): LayoutLine[] {
  const gutter = detectColumnGutter(items);
  if (gutter == null) {
    return linesFromParts(page, collectParts(items));
  }

  const left: RawPart[] = [];
  const right: RawPart[] = [];
  const full: RawPart[] = [];

  for (const item of items) {
    const str = item.str ?? "";
    if (!str) continue;
    const x = item.transform[4] ?? 0;
    const y = item.transform[5] ?? 0;
    const height = item.height || Math.abs(item.transform[3] ?? 10) || 10;
    const width = item.width || 0;
    const part: RawPart = { str, x, width, height, y };
    // True full-width banners (titles): must be wide, not a normal column line that
    // merely extends a few points past the gutter.
    const spansGutter = x < gutter - 8 && x + width > gutter + 40;
    if (spansGutter && width >= 300) {
      full.push(part);
    } else if (x < gutter) {
      // Use left edge (not center): long left-column runs often extend past the gutter.
      left.push(part);
    } else {
      right.push(part);
    }
  }

  const fullLines = linesFromParts(page, full, "full");
  const leftLines = linesFromParts(page, left, "left");
  const rightLines = linesFromParts(page, right, "right");

  // Header band = lines above the top of either column's body prose.
  const leftBodyTop = leftLines.find((l) => l.text.length > 48)?.y ?? 0;
  const rightBodyTop = rightLines.find((l) => l.text.length > 48)?.y ?? 0;
  // Use the lower of the two tops so early right-column lines stay in-column
  // (not vacuumed into the author header). PDF y grows upward.
  const bodyTop =
    leftBodyTop > 0 && rightBodyTop > 0
      ? Math.min(leftBodyTop, rightBodyTop)
      : leftBodyTop || rightBodyTop;

  const headerBand: LayoutLine[] = [];
  const leftBody: LayoutLine[] = [];
  const rightBody: LayoutLine[] = [];

  for (const line of fullLines) {
    headerBand.push(line);
  }
  for (const line of leftLines) {
    if (bodyTop > 0 && line.y > bodyTop + 4 && line.text.length <= 80) headerBand.push(line);
    else leftBody.push(line);
  }
  for (const line of rightLines) {
    // Right-column prose near the top is body, not header — only pull tiny meta.
    if (bodyTop > 0 && line.y > bodyTop + 4 && line.text.length <= 40) headerBand.push(line);
    else rightBody.push(line);
  }

  const header = mergeSameYLines(
    [...headerBand].sort((a, b) => b.y - a.y || a.text.localeCompare(b.text)),
  );
  // Reading order: page header → left column → right column.
  // Column tags prevent soft-wrap from stitching left's last line to right's first.
  return [...header, ...leftBody, ...rightBody];
}

function collectParts(items: readonly PdfTextItem[]): RawPart[] {
  const parts: RawPart[] = [];
  for (const item of items) {
    const str = item.str ?? "";
    if (!str) continue;
    parts.push({
      str,
      x: item.transform[4] ?? 0,
      width: item.width || 0,
      height: item.height || Math.abs(item.transform[3] ?? 10) || 10,
      y: item.transform[5] ?? 0,
    });
  }
  return parts;
}

function linesFromParts(
  page: number,
  parts: readonly RawPart[],
  column: "left" | "right" | "full" = "full",
): LayoutLine[] {
  const rows = new Map<number, RawPart[]>();
  for (const part of parts) {
    const key = Math.round(part.y * 2) / 2;
    const bucket = rows.get(key);
    if (bucket) bucket.push(part);
    else rows.set(key, [part]);
  }

  const ys = [...rows.keys()].sort((a, b) => b - a);
  const lines: LayoutLine[] = [];

  for (const y of ys) {
    const rowParts = (rows.get(y) ?? []).sort((a, b) => a.x - b.x);
    if (rowParts.length === 0) continue;

    const joined = joinParts(rowParts);
    const cleaned = normalizeLineText(joined.text);
    if (!cleaned) continue;
    // Drop footnote / affiliation marker rows ("1 1 1", "1 | 1 | 1").
    if (/^(\d+\s*[|]?\s*){1,8}$/.test(cleaned)) continue;

    const fontSize = Math.max(...rowParts.map((p) => p.height));
    const loose = joined.tableRow ? joined.cells : splitLooseCells(cleaned);
    // Inside a single text column, large gaps are usually spacing — not tables.
    const tableRow =
      column === "full" &&
      (joined.tableRow || loose.length >= 3 || isTicketRow(cleaned) || isPriorityRow(cleaned)) &&
      !isFootnoteMarkerRow(cleaned);
    lines.push({
      text: cleaned,
      page,
      y,
      fontSize,
      heading: false,
      headingLevel: null,
      tableRow,
      cells: tableRow && loose.length >= 2 ? loose : joined.cells,
      column,
    });
  }

  return lines;
}

/** Join author/meta fragments that share a baseline after column split. */
function mergeSameYLines(lines: readonly LayoutLine[]): LayoutLine[] {
  if (lines.length <= 1) return [...lines];
  const out: LayoutLine[] = [];
  for (const line of lines) {
    const prev = out[out.length - 1];
    const sameBand = prev && Math.abs(prev.y - line.y) < 1.2 && !prev.tableRow && !line.tableRow;
    // Only merge header fragments; never fuse left/right body at the same y.
    const mergeable =
      sameBand &&
      (prev!.column === line.column || prev!.column === "full" || line.column === "full" || !prev!.column);
    if (mergeable && (line.text.length <= 60 || (prev!.text.length <= 60 && line.text.length <= 80))) {
      prev!.text = normalizeLineText(`${prev!.text} ${line.text}`);
      prev!.fontSize = Math.max(prev!.fontSize, line.fontSize);
      continue;
    }
    out.push({ ...line, cells: [...line.cells] });
  }
  return out;
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
  return dehyphenateText(
    text
      .replace(/\u0000/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/^[●•▪◦]\s*/, "• ")
      .trim(),
  );
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

  // Canonical paper section labels (often same size as body in two-column PDFs).
  if (
    /^(abstract|introduction|conclusion|conclusions|references|acknowledgements?|related\s+work|limitations|future\s+work|discussion|methodology|methods|results|experiments?)$/i.test(
      text.trim(),
    )
  ) {
    return 2;
  }

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

      // Merge soft-wrapped prose until a blank-structure / column boundary.
      let prose = line.text;
      i++;
      while (i < page.lines.length) {
        const next = page.lines[i]!;
        if (next.heading || next.tableRow || /^•\s/.test(next.text) || /^\d+[.)]\s+/.test(next.text)) {
          break;
        }
        // Never stitch full columns together — but do finish a syllable wrap at the seam
        // ("…event type classi-" | "sification but vary…").
        if (line.column && next.column && line.column !== next.column) {
          if (/[A-Za-z][\u00AD-]$/.test(prose.trimEnd()) && /^[a-z]/.test(next.text)) {
            const m = /^([a-z]+)([\s\S]*)$/u.exec(next.text);
            if (m) {
              prose = joinSoftWrap(prose, m[1]!);
              const rest = m[2]!.replace(/^\s+/u, "");
              if (rest) {
                next.text = rest;
                // Re-process leftover right-column text as its own block.
                break;
              }
              i++;
            }
          }
          break;
        }
        if (isSoftWrapContinuation(prose, next.text)) {
          prose = joinSoftWrap(prose, next.text);
          i++;
          continue;
        }
        break;
      }
      out.push(dehyphenateText(prose.replace(/\s+/g, " ").trim()));
      out.push("");
    }
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

/**
 * Join a soft-wrapped line. Dehyphenate PDF end-of-line hyphens
 * (`zeo-` + `lite` → `zeolite`) instead of inserting a space.
 * Keep real compounds when both sides look like full words (`domain-` + `specific`).
 */
export function joinSoftWrap(prev: string, next: string): string {
  const left = prev.replace(/\s+$/u, "");
  const right = next.replace(/^\s+/u, "");
  if (!left) return right;
  if (!right) return left;

  // Soft hyphen / discretionary hyphen at wrap — always join.
  if (/[\u00AD]$/u.test(left)) {
    return `${left.replace(/[\u00AD]$/u, "")}${right}`.replace(/\s+/g, " ").trim();
  }

  const hyphenWrap = /^(.+?)-$/u.exec(left);
  if (hyphenWrap && /^[a-z]/.test(right)) {
    const stem = hyphenWrap[1]!;
    const stemTail = (/[A-Za-z]+$/.exec(stem) ?? [""])[0]!;
    const nextWord = (/^[a-z]+/.exec(right) ?? [""])[0]!;
    // Keep hyphen for compounds / model ids; otherwise syllable-join.
    // Important: only inspect the stem *tail* — a hyphen earlier in the
    // paragraph ("domain-specific … funda-") must not force keepHyphen.
    const compoundHeads =
      /^(domain|state|real|high|low|multi|cross|self|open|closed|fine|coarse|end|start|token|zero|few|base|pre|post|non)$/i;
    const syllableRight =
      /^(tion|sion|ment|ness|ting|cial|ical|imal|ental|atory|ative|ences|elled|ering|art|cal|tal|nal|ods|cus|lite)$/i;
    const keepHyphen =
      /-[A-Za-z]+$/u.test(stem) || // already a compound chain: state-of-the-
      /\d$/u.test(stem) || // O4- + mini
      (stemTail.length > 0 && stemTail === stemTail.toUpperCase() && stemTail.length <= 4) ||
      (compoundHeads.test(stemTail) && !syllableRight.test(nextWord));
    const joined = keepHyphen ? `${stem}-${right}` : `${stem}${right}`;
    return joined.replace(/\s+/g, " ").trim();
  }

  return `${left} ${right}`.replace(/\s+/g, " ").trim();
}

function isFootnoteMarkerRow(text: string): boolean {
  return /^(\d+\s*){1,8}$/.test(text.trim());
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
  // Hyphenated wraps must continue even when the next fragment is lowercase.
  if (/[A-Za-z][\u00AD-]$/.test(prev.trimEnd()) && /^[a-z]/.test(next)) return true;
  if (/[.!?:]$/.test(prev)) return false;
  if (/^[A-Z][A-Z0-9_/-]{2,}$/.test(next)) return false; // ticket id / acronym line
  // Mid-word leftovers from a bad prior pass ("tion and structured…").
  if (/^[a-z]{1,5}\b/.test(next) && /[A-Za-z]$/.test(prev.trimEnd())) return true;
  return true;
}

/** Repair common PDF wrap artifacts still present inside a finished line. */
export function dehyphenateText(text: string): string {
  return text
    .replace(/([A-Za-z])\u00AD([a-z])/g, "$1$2")
    .replace(/([A-Za-z])-\s+([a-z])/g, "$1$2")
    // Safety net for syllable hyphens left inside a paragraph (criti-cal, funda-mental).
    // Never touch intentional compounds (zero-shot, domain-specific, rule-based, …).
    .replace(/\b([a-z]{2,6})-([a-z]{2,8})\b/gi, (full, left: string, right: string) => {
      const compoundLeft =
        /^(domain|state|real|high|low|multi|cross|self|open|end|token|zero|few|base|pre|post|non|in|re|co|rule|hand|fine|span|event|data|model|task|text|sub|llm)$/i;
      const compoundRight =
        /^(shot|specific|based|crafted|grained|level|of|the|art|reader|tuning|purpose|correction|refinement|reasoning|reasoning)$/i;
      if (compoundLeft.test(left) || compoundRight.test(right)) return full;
      if (
        /^(tion|sion|ment|ness|ting|cial|ical|imal|ental|atory|ative|ences|cal|tal|nal|ral|ous|ive|est|ing|ers|ies|ely|ful|led|ture|tures)$/i.test(
          right,
        )
      ) {
        return `${left}${right}`;
      }
      // Short syllable fragments only (zeo-lite, fo-cus, meth-ods).
      if (left.length <= 4 && right.length <= 5) return `${left}${right}`;
      return full;
    });
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
