import { err, ok, type Result } from "@/reliability/result";
import type { KnowledgeGraph, MemoryDocument } from "@/domain/memory/schema";
import { preflightInput } from "./preflight";
import { importJson } from "./json/import-json";
import { parseText } from "./text/parse-text";

/**
 * The single local import entry point. Routing is decided once, by content:
 * leading `{`/`[` → the strict deterministic JSON path (never text, never
 * AI); everything else → the lossless local text parser.
 */

export interface ImportSourceInput {
  raw: string;
  /** Human label shown in provenance — sanitized before use. */
  label: string;
  /**
   * Optional Graphify-schema graph from the Docling/Graphify sidecar.
   * Merged into research documents; ignored for JSON imports.
   */
  knowledgeGraph?: KnowledgeGraph;
  /** When true, markdown came from Docling rather than pdf.js. */
  parsedByDocling?: boolean;
}

export type ImportMethod = "deterministic-json" | "local-parser";

export function importSource(input: ImportSourceInput): Result<MemoryDocument> {
  const preflighted = preflightInput(input.raw);
  if (!preflighted.ok) return preflighted;

  const label = sanitizeLabel(input.label);
  if (preflighted.value.looksLikeJson) {
    return importJson({ text: preflighted.value.text, label });
  }
  return parseText({
    text: preflighted.value.text,
    label,
    ...(input.knowledgeGraph ? { knowledgeGraph: input.knowledgeGraph } : {}),
    ...(input.parsedByDocling ? { parsedByDocling: true } : {}),
  });
}

/** Detect the format without importing (used for honest UI stage copy). */
export function detectFormat(raw: string): "json" | "text" | "empty" {
  if (raw.trim().length === 0) return "empty";
  const first = raw.trimStart().charAt(0);
  return first === "{" || first === "[" ? "json" : "text";
}

/** Sanitize a user/file-provided label: basename only, length-capped. */
export function sanitizeLabel(label: string): string {
  const base = label.split(/[\\/]/).pop() ?? label;
  const cleaned = base.replace(/[\u0000-\u001f<>:"|?*]/g, "").trim();
  if (cleaned.length === 0) return "Pasted notes";
  return cleaned.length > 120 ? cleaned.slice(0, 119) + "…" : cleaned;
}

/** Convenience wrapper that discards warnings for call sites that only need the document. */
export function importSourceOrNull(raw: string, label: string): MemoryDocument | null {
  const result = importSource({ raw, label });
  return result.ok ? result.value : null;
}

export { ok, err };
