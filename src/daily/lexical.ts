/**
 * Lexical retrieval baseline: BM25 with an incremental inverted index.
 *
 * This is the reproducible baseline every other retrieval arm (typed-graph
 * traversal, vectors, RRF, Personalized PageRank) must beat on the daily
 * benchmark before it ships. Add / remove cost is O(terms in the document).
 */

const STOP = new Set(
  "a about after all also an and any are as at be been before being but by can could did do does for from has have i if in into is it its just more most no not of on only or our should so some than that the their them then there these they this to very was we were what when which who will with would you your".split(" "),
);

/** Lowercase, split on non-word, drop stopwords, light suffix stemming. */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.toLowerCase().split(/[^a-z0-9#]+/)) {
    if (!raw || STOP.has(raw)) continue;
    out.push(stem(raw));
  }
  return out;
}

/** Deliberately small: plural / -ing / -ed, then a trailing "e" (cache, caching, cached → cach). */
export function stem(w: string): string {
  if (w.length <= 3 || /^[\d#]/.test(w)) return w;
  let r = w;
  if (w.length > 4) {
    for (const [suf, rep] of [["ies", "y"], ["ing", ""], ["ed", ""], ["es", ""], ["s", ""]] as const) {
      if (w.endsWith(suf) && w.length - suf.length >= 3) { r = w.slice(0, -suf.length) + rep; break; }
    }
  }
  if (r.length >= 4 && r.endsWith("e")) r = r.slice(0, -1);
  return r;
}

export interface Bm25Config { k1: number; b: number; tagBoost: number }
export const BM25_V1: Bm25Config = { k1: 1.2, b: 0.75, tagBoost: 2 };
export const LEXICAL_CONFIG_ID = "bm25-v1(k1=1.2,b=0.75,tag×2)";

/**
 * Corpus statistics (N, average length) are frozen in epochs. Without this,
 * every write shifts every BM25 score and no cached answer could ever be
 * reused safely. Within an epoch a write only changes scores for queries
 * that share a term with the changed document, which is what makes
 * selective cache invalidation exact. The epoch rolls when the corpus drifts
 * past the threshold; callers clear their caches when it does.
 */
export interface CorpusStats { epoch: number; n: number; avgLen: number }

export class LexicalIndex {
  private postings = new Map<string, Map<string, number>>();
  private lengths = new Map<string, number>();
  private terms = new Map<string, Set<string>>();
  private totalLen = 0;
  private snap: CorpusStats = { epoch: 0, n: 0, avgLen: 0 };
  constructor(private cfg: Bm25Config = BM25_V1, private drift = 0.1, private minStep = 8) {}

  get size() { return this.lengths.size; }
  get stats(): Readonly<CorpusStats> { return this.snap; }

  /** Roll the statistics epoch if the corpus moved enough. Returns true if it rolled. */
  private maybeRoll(): boolean {
    const n = this.lengths.size;
    const avg = n ? this.totalLen / n : 0;
    const s = this.snap;
    const nMoved = Math.abs(n - s.n) >= Math.max(this.minStep, this.drift * s.n);
    const lenMoved = s.avgLen > 0 && Math.abs(avg - s.avgLen) / s.avgLen > this.drift;
    if (s.n === 0 ? n > 0 : nMoved || lenMoved || n === 0) {
      this.snap = { epoch: s.epoch + 1, n, avgLen: avg };
      return true;
    }
    return false;
  }

  /** Terms a document contributed; used for reverse-dependency invalidation. */
  termsOf(id: string): Set<string> { return this.terms.get(id) ?? new Set(); }

  upsert(id: string, text: string, tags: string[]): { added: Set<string>; removed: Set<string>; rolled: boolean } {
    const before = new Set(this.termsOf(id));
    this.detach(id);
    const toks = [...tokenize(text)];
    for (const t of tags) for (let i = 0; i < this.cfg.tagBoost; i++) toks.push(...tokenize(t));
    const tf = new Map<string, number>();
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const [t, n] of tf) {
      let p = this.postings.get(t);
      if (!p) this.postings.set(t, (p = new Map()));
      p.set(id, n);
    }
    this.lengths.set(id, toks.length);
    this.totalLen += toks.length;
    const after = new Set(tf.keys());
    this.terms.set(id, after);
    const rolled = this.maybeRoll();
    return { added: new Set([...after].filter((t) => !before.has(t))), removed: new Set([...before].filter((t) => !after.has(t))), rolled };
  }

  remove(id: string): { terms: Set<string>; rolled: boolean } {
    const terms = this.detach(id);
    return { terms, rolled: terms.size ? this.maybeRoll() : false };
  }

  private detach(id: string): Set<string> {
    const had = this.terms.get(id);
    if (!had) return new Set();
    for (const t of had) {
      const p = this.postings.get(t);
      p?.delete(id);
      if (p && p.size === 0) this.postings.delete(t);
    }
    this.totalLen -= this.lengths.get(id) ?? 0;
    this.lengths.delete(id);
    this.terms.delete(id);
    return had;
  }

  /** Scored candidates, highest first. `scanned` = postings touched. */
  search(query: string): { hits: Array<{ id: string; score: number; matched: string[] }>; scanned: number } {
    const q = [...new Set(tokenize(query))];
    if (!this.lengths.size || !q.length) return { hits: [], scanned: 0 };
    const avg = this.snap.avgLen || 1;
    const scores = new Map<string, { score: number; matched: string[] }>();
    let scanned = 0;
    for (const t of q) {
      const p = this.postings.get(t);
      if (!p) continue;
      const N = Math.max(this.snap.n, p.size);
      const idf = Math.log(1 + (N - p.size + 0.5) / (p.size + 0.5));
      for (const [id, tf] of p) {
        scanned++;
        const len = this.lengths.get(id) ?? 0;
        const s = idf * ((tf * (this.cfg.k1 + 1)) / (tf + this.cfg.k1 * (1 - this.cfg.b + (this.cfg.b * len) / avg)));
        const cur = scores.get(id) ?? { score: 0, matched: [] };
        cur.score += s; cur.matched.push(t);
        scores.set(id, cur);
      }
    }
    return { hits: [...scores].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1)), scanned };
  }
}
