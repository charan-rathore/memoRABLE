/**
 * Browser client for the DocGraph sidecar.
 * pdf.js is always the default upload path. Docling is opt-in + selective + non-blocking.
 */

import type { DocGraphHealth, DocGraphParseResult, KnowledgeGraph } from "./types";
import { isDocgraphEnabled } from "./select";

export async function probeDocGraph(): Promise<DocGraphHealth> {
  if (!isDocgraphEnabled()) {
    return { ok: false, available: false, reason: "NEXT_PUBLIC_DOCGRAPH≠1" };
  }
  try {
    const res = await fetch("/api/docgraph", { method: "GET", cache: "no-store" });
    if (!res.ok) return { ok: false, available: false, reason: `HTTP ${res.status}` };
    return (await res.json()) as DocGraphHealth;
  } catch (err) {
    return {
      ok: false,
      available: false,
      reason: err instanceof Error ? err.message : "unreachable",
    };
  }
}

export interface ParseDocGraphOptions {
  /** When true, sidecar also builds Graphify KG (slow). Default false — graph in TS. */
  graph?: boolean;
  signal?: AbortSignal;
}

/**
 * Docling parse only (no Graphify by default).
 * Requires NEXT_PUBLIC_DOCGRAPH=1. Returns null when disabled / unavailable.
 */
export async function parseWithDocGraph(
  file: File,
  options: ParseDocGraphOptions = {},
): Promise<DocGraphParseResult | null> {
  if (!isDocgraphEnabled()) return null;
  try {
    const body = new FormData();
    body.append("file", file, file.name);
    const qs = options.graph ? "?graph=1" : "?graph=0";
    const res = await fetch(`/api/docgraph${qs}`, {
      method: "POST",
      body,
      signal: options.signal ?? AbortSignal.timeout(300_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as DocGraphParseResult & { ok?: boolean; markdown?: string };
    if (!json?.markdown) return null;
    return json as DocGraphParseResult;
  } catch {
    return null;
  }
}

/** Build Graphify-schema KG from markdown — separate from Docling parse. */
export async function graphFromMarkdown(input: {
  markdown: string;
  title?: string;
  label?: string;
}): Promise<KnowledgeGraph | null> {
  if (!isDocgraphEnabled()) return null;
  try {
    const res = await fetch("/api/docgraph", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { knowledgeGraph?: KnowledgeGraph };
    return json.knowledgeGraph ?? null;
  } catch {
    return null;
  }
}
