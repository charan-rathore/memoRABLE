import { analyze } from "./analyze";

/**
 * BM25F: BM25 over several fields, each with its own weight and length
 * normalization (Robertson, Zaragoza & Taylor 2004). Field-aware ranking is
 * what made BM25F/REP the long-standing baseline for duplicate bug report
 * retrieval (Sun et al., ASE 2011): a title match means more than a body
 * match.
 *
 * Long queries (a whole issue used as a query) use query-term frequency
 * saturation, as in Sun et al.'s BM25Fext, and are capped to their most
 * informative terms.
 */

export type Field = "title" | "body" | "labels" | "signature";
export const FIELDS: Field[] = ["title", "body", "labels", "signature"];

export interface FieldParams { weight: number; b: number }
export interface Bm25fConfig {
  k1: number;
  k3: number;
  fields: Record<Field, FieldParams>;
  /** Long queries keep at most this many terms (highest idf first). */
  maxQueryTerms: number;
}

export const BM25F_V1: Bm25fConfig = {
  k1: 1.2,
  k3: 1.2,
  fields: {
    title: { weight: 3.0, b: 0.5 },
    body: { weight: 1.0, b: 0.75 },
    labels: { weight: 1.5, b: 0.3 },
    signature: { weight: 2.5, b: 0.3 },
  },
  maxQueryTerms: 64,
};

/** Plain BM25 over one concatenated field: the baseline every arm must beat. */
export const BM25_FLAT: Bm25fConfig = {
  ...BM25F_V1,
  fields: {
    title: { weight: 1, b: 0.75 },
    body: { weight: 1, b: 0.75 },
    labels: { weight: 1, b: 0.75 },
    signature: { weight: 0, b: 0.75 },
  },
};

export type FieldText = Partial<Record<Field, string>>;

interface Posting { tf: Float32Array } // per field, index = FIELDS order

export class Bm25fIndex {
  private postings = new Map<string, Map<string, Posting>>();
  private lens = new Map<string, Float32Array>();
  private totals = new Float64Array(FIELDS.length);
  private docTerms = new Map<string, string[]>();

  constructor(readonly cfg: Bm25fConfig = BM25F_V1) {}

  get size() { return this.lens.size; }

  /** Terms indexed for a document (for reverse-dependency invalidation). */
  termsOf(id: string): readonly string[] { return this.docTerms.get(id) ?? []; }

  upsert(id: string, fields: FieldText): void {
    this.remove(id);
    const len = new Float32Array(FIELDS.length);
    const perTerm = new Map<string, Float32Array>();
    FIELDS.forEach((f, fi) => {
      const toks = fields[f] ? analyze(fields[f]!) : [];
      len[fi] = toks.length;
      for (const t of toks) {
        let tf = perTerm.get(t);
        if (!tf) perTerm.set(t, (tf = new Float32Array(FIELDS.length)));
        tf[fi]! += 1;
      }
    });
    for (const [t, tf] of perTerm) {
      let p = this.postings.get(t);
      if (!p) this.postings.set(t, (p = new Map()));
      p.set(id, { tf });
    }
    this.lens.set(id, len);
    for (let i = 0; i < FIELDS.length; i++) this.totals[i]! += len[i]!;
    this.docTerms.set(id, [...perTerm.keys()]);
  }

  remove(id: string): boolean {
    const terms = this.docTerms.get(id);
    if (!terms) return false;
    for (const t of terms) {
      const p = this.postings.get(t);
      p?.delete(id);
      if (p && p.size === 0) this.postings.delete(t);
    }
    const len = this.lens.get(id)!;
    for (let i = 0; i < FIELDS.length; i++) this.totals[i]! -= len[i]!;
    this.lens.delete(id);
    this.docTerms.delete(id);
    return true;
  }

  idf(term: string): number {
    const df = this.postings.get(term)?.size ?? 0;
    const N = this.lens.size;
    return Math.log(1 + (N - df + 0.5) / (df + 0.5));
  }

  /**
   * Score documents for weighted query terms. `qtf` maps term to its query
   * weight (raw frequency; expansion terms arrive pre-scaled). `allow`
   * restricts candidates (e.g. only issues created before the query).
   */
  search(qtf: Map<string, number>, k = 50, allow?: (id: string) => boolean): { hits: Array<{ id: string; score: number }>; scanned: number } {
    const N = this.lens.size;
    if (!N || !qtf.size) return { hits: [], scanned: 0 };
    const avg = FIELDS.map((_, i) => this.totals[i]! / N || 1);
    const { k1, k3, fields } = this.cfg;

    let terms = [...qtf].filter(([t]) => this.postings.has(t));
    if (terms.length > this.cfg.maxQueryTerms) {
      terms = terms.map(([t, w]) => [t, w, this.idf(t)] as const).sort((a, b) => b[2] - a[2]).slice(0, this.cfg.maxQueryTerms).map(([t, w]) => [t, w]);
    }

    const scores = new Map<string, number>();
    let scanned = 0;
    for (const [t, q] of terms) {
      const p = this.postings.get(t)!;
      const idf = this.idf(t);
      const qw = ((k3 + 1) * q) / (k3 + q);
      for (const [id, { tf }] of p) {
        if (allow && !allow(id)) continue;
        scanned++;
        const len = this.lens.get(id)!;
        let wtf = 0;
        FIELDS.forEach((f, fi) => {
          const { weight, b } = fields[f];
          if (!weight || !tf[fi]) return;
          wtf += (weight * tf[fi]!) / (1 - b + (b * len[fi]!) / avg[fi]!);
        });
        if (wtf <= 0) continue;
        scores.set(id, (scores.get(id) ?? 0) + idf * qw * (wtf / (k1 + wtf)));
      }
    }
    const hits = [...scores].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1)).slice(0, k);
    return { hits, scanned };
  }
}
