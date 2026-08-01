/**
 * Hybrid semantic segmentation (RFC Stage 3).
 *
 * Chunk by meaning and structure — never fixed token windows:
 *  1. Structural anchors (headings, tables, image blocks, lists)
 *  2. Topic-shift splits for long unheaded prose (lexical cohesion)
 *  3. Keep tables/images atomic so they are not shredded mid-row
 */

import { contentTokens } from "./language";

export type SegmentKind = "section" | "table" | "list" | "image" | "prose";

export interface SemanticSegment {
  id: string;
  kind: SegmentKind;
  title: string | null;
  /** ATX level when kind is section; otherwise null. */
  headingLevel: 1 | 2 | 3 | 4 | 5 | 6 | null;
  page: number | null;
  /** Lines belonging to this segment, 1-based in the source text. */
  lines: Array<{ text: string; lineNo: number }>;
  text: string;
}

export interface SegmentDocument {
  segments: SemanticSegment[];
  /** Re-serialized Markdown preserving hybrid boundaries (for parseText). */
  markdown: string;
}

const PAGE_MARK = /^<!--\s*page:(\d+)\s*-->$/i;
const IMAGE_MARK = /^<!--\s*image:page=(\d+)/i;
const ATX = /^(#{1,6})\s+(.+?)\s*$/;
const TABLE_ROW = /^\|(.+)\|$/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+/;

/** Segment a structured Markdown/plain source into hybrid semantic chunks. */
export function hybridSegment(source: string): SegmentDocument {
  const rawLines = source.split("\n");
  const segments: SemanticSegment[] = [];
  let page: number | null = null;
  let current: SemanticSegment | null = null;
  let seq = 0;

  const start = (
    kind: SegmentKind,
    title: string | null,
    lineNo: number,
    text: string,
    headingLevel: SemanticSegment["headingLevel"] = null,
  ): SemanticSegment => {
    const segment: SemanticSegment = {
      id: `seg-${++seq}`,
      kind,
      title,
      headingLevel,
      page,
      lines: text.trim() === "" ? [] : [{ text, lineNo }],
      text: "",
    };
    segments.push(segment);
    return segment;
  };

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i]!;
    const lineNo = i + 1;
    const trimmed = line.trim();

    const pageMatch = PAGE_MARK.exec(trimmed);
    if (pageMatch) {
      page = Number(pageMatch[1]);
      continue;
    }

    if (IMAGE_MARK.test(trimmed)) {
      current = start("image", current?.title ?? "Embedded visual", lineNo, line);
      continue;
    }

    const heading = ATX.exec(trimmed);
    if (heading) {
      const level = Math.min(6, heading[1]!.length) as 1 | 2 | 3 | 4 | 5 | 6;
      current = start("section", heading[2]!.trim(), lineNo, "", level);
      continue;
    }

    if (TABLE_ROW.test(trimmed)) {
      if (!current || current.kind !== "table") {
        current = start("table", current?.title ?? null, lineNo, line);
      } else {
        current.lines.push({ text: line, lineNo });
      }
      continue;
    }

    if (LIST_ITEM.test(line)) {
      if (!current) current = start("list", null, lineNo, line);
      else if (current.kind === "prose" && current.lines.length === 0) {
        current.kind = "list";
        current.lines.push({ text: line, lineNo });
      } else {
        current.lines.push({ text: line, lineNo });
      }
      continue;
    }

    if (trimmed === "") {
      // Blank line ends a prose run so the next block can topic-shift.
      if (current?.kind === "prose") current = null;
      continue;
    }

    if (!current) {
      current = start("prose", null, lineNo, line);
      continue;
    }

    if (current.kind === "table") {
      // Non-table line closes the table.
      current = start("prose", current.title, lineNo, line);
      continue;
    }

    current.lines.push({ text: line, lineNo });
  }

  // Topic-shift: split oversized unheaded prose when adjacent paragraphs diverge.
  const expanded = splitByTopicShift(segments);
  for (const segment of expanded) {
    segment.text = segment.lines
      .map((l) => l.text)
      .join("\n")
      .trim();
  }

  return {
    segments: expanded.filter((s) => s.text.length > 0 || s.title),
    markdown: toMarkdown(expanded),
  };
}

/** Lexical cohesion split — only for long prose without a heading. */
function splitByTopicShift(segments: SemanticSegment[]): SemanticSegment[] {
  const out: SemanticSegment[] = [];
  let seq = 0;

  for (const segment of segments) {
    if (segment.kind !== "prose" || segment.title || segment.lines.length < 8) {
      out.push({ ...segment, id: `seg-${++seq}` });
      continue;
    }

    const paragraphs = groupParagraphs(segment.lines);
    if (paragraphs.length <= 1) {
      out.push({ ...segment, id: `seg-${++seq}` });
      continue;
    }

    let bucket = paragraphs[0]!;
    for (let i = 1; i < paragraphs.length; i++) {
      const next = paragraphs[i]!;
      const cohesion = jaccard(stemsOf(bucket), stemsOf(next));
      const bucketWords = bucket.reduce((n, l) => n + l.text.split(/\s+/).length, 0);
      // Hybrid mix: keep related paragraphs together; cut on low overlap once
      // the bucket is already a meaningful chunk (~80+ words), never at a fixed
      // token window.
      if (cohesion < 0.12 && bucketWords >= 80) {
        out.push(paragraphsToSegment(++seq, segment, bucket));
        bucket = next;
      } else {
        bucket = bucket.concat(next);
      }
    }
    if (bucket.length) out.push(paragraphsToSegment(++seq, segment, bucket));
  }
  return out;
}

function groupParagraphs(
  lines: Array<{ text: string; lineNo: number }>,
): Array<Array<{ text: string; lineNo: number }>> {
  // Lines are already blank-separated upstream; treat each line as a para unit
  // when we only have soft-wrapped PDF remnants joined earlier.
  return lines.map((l) => [l]);
}

function paragraphsToSegment(
  seq: number,
  parent: SemanticSegment,
  lines: Array<{ text: string; lineNo: number }>,
): SemanticSegment {
  return {
    id: `seg-${seq}`,
    kind: "prose",
    title: parent.title,
    headingLevel: null,
    page: parent.page,
    lines,
    text: lines.map((l) => l.text).join("\n").trim(),
  };
}

function stemsOf(lines: Array<{ text: string }>): Set<string> {
  const set = new Set<string>();
  for (const line of lines) {
    for (const token of contentTokens(line.text)) set.add(token);
  }
  return set;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

function toMarkdown(segments: readonly SemanticSegment[]): string {
  const parts: string[] = [];
  for (const segment of segments) {
    if (segment.page != null) parts.push(`<!-- page:${segment.page} -->`);
    if (segment.title && (segment.kind === "section" || segment.kind === "image")) {
      const level = segment.headingLevel ?? 2;
      parts.push(`${"#".repeat(level)} ${segment.title}`);
    }
    if (segment.lines.length) {
      parts.push(segment.lines.map((l) => l.text).join("\n"));
    }
    parts.push("");
  }
  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

/** Build a lightweight document graph from hybrid segments (RFC Stage 4). */
export interface GraphNode {
  id: string;
  type:
    | "section"
    | "table"
    | "image"
    | "list"
    | "requirement"
    | "decision"
    | "risk"
    | "metric"
    | "question"
    | "prose";
  title: string | null;
  page: number | null;
  segmentId: string;
  excerpt: string;
}

export interface DocumentGraph {
  nodes: GraphNode[];
  edges: Array<{ from: string; to: string; rel: string }>;
}

export function buildDocumentGraph(segments: readonly SemanticSegment[]): DocumentGraph {
  const nodes: GraphNode[] = [];
  const edges: Array<{ from: string; to: string; rel: string }> = [];

  for (const segment of segments) {
    const type = classifyNode(segment);
    const node: GraphNode = {
      id: `node-${segment.id}`,
      type,
      title: segment.title,
      page: segment.page,
      segmentId: segment.id,
      excerpt: segment.text.slice(0, 180),
    };
    nodes.push(node);
  }

  // Link consecutive segments under the same page / parent section title.
  for (let i = 1; i < nodes.length; i++) {
    const prev = nodes[i - 1]!;
    const cur = nodes[i]!;
    if (prev.page != null && prev.page === cur.page) {
      edges.push({ from: prev.id, to: cur.id, rel: "follows" });
    }
    if (prev.type === "section" && cur.type !== "section") {
      edges.push({ from: prev.id, to: cur.id, rel: "contains" });
    }
  }

  return { nodes, edges };
}

function classifyNode(segment: SemanticSegment): GraphNode["type"] {
  const title = (segment.title ?? "").toLowerCase();
  if (segment.kind === "table") return "table";
  if (segment.kind === "image") return "image";
  if (segment.kind === "list" && /requirement|criteria|must\b/i.test(title + segment.text)) {
    return "requirement";
  }
  if (/open question|unresolved|tbd/i.test(title)) return "question";
  if (/risk|problem|pain|limitation|threat/i.test(title)) return "risk";
  if (/metric|kpi|success|signal|measure/i.test(title)) return "metric";
  if (/decision|requirement|priority|policy|rule/i.test(title)) return "decision";
  if (segment.kind === "section") return "section";
  if (segment.kind === "list") return "list";
  return "prose";
}
