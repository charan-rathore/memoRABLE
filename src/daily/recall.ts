import { LexicalIndex, LEXICAL_CONFIG_ID, tokenize } from "./lexical";
import type { Entry, WorkspaceState } from "./types";

export interface RecallHit {
  entryId: string;
  score: number;
  matched: string[];
  /** Superseded entries stay findable but rank lower and say so. */
  stale: boolean;
  supersededBy?: string;
  /** Pulled in directly above an older decision it replaced. */
  promoted?: boolean;
}

export interface RecallResult {
  query: string;
  hits: RecallHit[];
  cache: "hit" | "miss";
  scanned: number;
  configId: string;
}

/** Demotion factor for superseded entries. Part of the config id. */
export const SUPERSEDED_WEIGHT = 0.35;
export const RECALL_CONFIG_ID = `${LEXICAL_CONFIG_ID}+superseded×${SUPERSEDED_WEIGHT}+replacement-first`;

/**
 * Cache key covers everything that can change an answer: workspace,
 * permission state, normalised query, k, and retrieval config. Source
 * versions are handled by the reverse dependency maps below, not the key.
 */
export function recallKey(p: { workspaceId: string; permission: string; query: string; k: number; epoch: number }): string {
  const q = [...new Set(tokenize(p.query))].sort().join(" ");
  return JSON.stringify([p.workspaceId, p.permission, q, p.k, RECALL_CONFIG_ID, p.epoch]);
}

/**
 * Recall over the lexical index with a result cache whose entries are
 * invalidated selectively: a cached answer is dropped only when an entry
 * it returned changed, or a term it queried gained or lost a document.
 */
export class Recall {
  readonly index = new LexicalIndex();
  private cache = new Map<string, RecallResult>();
  private byTerm = new Map<string, Set<string>>();
  private byEntry = new Map<string, Set<string>>();

  get cacheSize() { return this.cache.size; }

  private link(map: Map<string, Set<string>>, k: string, key: string) {
    let s = map.get(k);
    if (!s) map.set(k, (s = new Set()));
    s.add(key);
  }

  private drop(keys: Iterable<string>): number {
    let n = 0;
    for (const key of keys) if (this.cache.delete(key)) n++;
    return n;
  }

  /** Re-index one entry; returns how many cached answers were invalidated. */
  upsert(e: Entry): number {
    const before = this.index.termsOf(e.id);
    const { added, removed, rolled } = this.index.upsert(e.id, e.text, e.tags);
    if (rolled) return this.clear();
    // Status flips change ranking without changing terms: depend on the entry too.
    const keys = new Set<string>(this.byEntry.get(e.id) ?? []);
    for (const t of [...added, ...removed, ...before, ...this.index.termsOf(e.id)]) for (const k of this.byTerm.get(t) ?? []) keys.add(k);
    return this.drop(keys);
  }

  remove(entryId: string): number {
    const { terms, rolled } = this.index.remove(entryId);
    if (rolled) return this.clear();
    const keys = new Set<string>(this.byEntry.get(entryId) ?? []);
    for (const t of terms) for (const k of this.byTerm.get(t) ?? []) keys.add(k);
    this.byEntry.delete(entryId);
    return this.drop(keys);
  }

  /** Same ranking as `query`, never cached. Used to verify cache correctness. */
  compute(state: WorkspaceState, query: string, k: number): { hits: RecallHit[]; scanned: number } {
    const { hits, scanned } = this.index.search(query);
    const ranked: RecallHit[] = [];
    for (const h of hits) {
      const e = state.entries.get(h.id);
      if (!e) continue; // deleted or not visible
      const stale = e.status === "superseded";
      ranked.push({ entryId: h.id, score: round(stale ? h.score * SUPERSEDED_WEIGHT : h.score), matched: h.matched, stale, ...(e.supersededBy ? { supersededBy: e.supersededBy } : {}) });
    }
    ranked.sort((a, b) => b.score - a.score || (a.entryId < b.entryId ? -1 : 1));
    // Replacement first: when an older decision matches, its live replacement
    // is placed directly above it, even if the newer wording matches less.
    const out: RecallHit[] = [];
    const placed = new Set<string>();
    for (const h of ranked) {
      if (placed.has(h.entryId)) continue;
      let cur = h.stale && h.supersededBy ? state.entries.get(h.supersededBy) : undefined;
      while (cur && cur.status === "superseded" && cur.supersededBy) cur = state.entries.get(cur.supersededBy);
      if (cur && !placed.has(cur.id)) {
        const own = ranked.find((r) => r.entryId === cur!.id);
        out.push(own ? { ...own } : { entryId: cur.id, score: h.score, matched: [], stale: false, promoted: true });
        placed.add(cur.id);
      }
      out.push(h); placed.add(h.entryId);
    }
    return { hits: out.slice(0, k), scanned };
  }

  /** Drop every cached answer (permission change, config change). */
  clear(): number {
    const n = this.cache.size;
    this.cache.clear(); this.byTerm.clear(); this.byEntry.clear();
    return n;
  }

  query(state: WorkspaceState, p: { query: string; k?: number; permission?: string }): RecallResult {
    const k = p.k ?? 8;
    const permission = p.permission ?? "owner";
    const key = recallKey({ workspaceId: state.workspaceId, permission, query: p.query, k, epoch: this.index.stats.epoch });
    const cached = this.cache.get(key);
    if (cached) return { ...cached, query: p.query, cache: "hit", scanned: 0 };

    const { hits, scanned } = this.compute(state, p.query, k);
    const result: RecallResult = { query: p.query, hits, cache: "miss", scanned, configId: RECALL_CONFIG_ID };

    this.cache.set(key, result);
    // Bounded: live recall while typing creates many one-off queries.
    if (this.cache.size > MAX_CACHED) this.cache.delete(this.cache.keys().next().value as string);
    for (const t of new Set(tokenize(p.query))) this.link(this.byTerm, t, key);
    for (const h of result.hits) this.link(this.byEntry, h.entryId, key);
    return result;
  }
}

const round = (n: number) => Math.round(n * 1e9) / 1e9;
const MAX_CACHED = 400;
