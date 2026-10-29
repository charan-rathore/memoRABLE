/**
 * Browser client for the DocGraph sidecar.
 * pdf.js is always the default upload path. Docling is opt-in + selective + non-blocking.
 */

import type { DocGraphHealth, DocGraphParseResult, KnowledgeGraph } from "./types";
import { isDocgraphEnabled } from "./select";
import { ResultCache } from "./result-cache";

const graphCache = new ResultCache<KnowledgeGraph | null>({
  ttlMs: 5 * 60_000, maxEntries: 16, maxBytes: 4 * 1024 * 1024, maxPending: 8,
  weight: graph => JSON.stringify(graph).length * 2,
  cacheable: graph => graph !== null,
});

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
      signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(300_000)]) : AbortSignal.timeout(300_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as DocGraphParseResult & { ok?: boolean; markdown?: string };
    if (typeof json?.markdown !== "string" || !json.markdown.trim()) return null;
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
    // Hash every input field: labels and titles may change extraction semantics.
    const body = JSON.stringify({ markdown: input.markdown, title: input.title, label: input.label });
    const load = async (): Promise<KnowledgeGraph | null> => {
      const res = await fetch("/api/docgraph", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { knowledgeGraph?: KnowledgeGraph };
      const graph = json.knowledgeGraph;
      return graph?.schema === "graphify-v1" && Array.isArray(graph.nodes) && Array.isArray(graph.edges) ? graph : null;
    };
    // Cache availability must not determine whether document extraction works.
    let key: string | null = null;
    try {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
      key = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    } catch { /* An insecure browser context can still use the uncached sidecar. */ }
    const graph = key === null ? await load() : await graphCache.get(key, load);
    // Consumers can edit a graph without mutating the cached extraction.
    return graph === null ? null : structuredClone(graph);
  } catch {
    return null;
  }
}
