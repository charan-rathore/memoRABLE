import { analyze, queryTerms, structuredQueryTerms } from "./analyze";
import { BM25_FLAT, BM25F_V1, Bm25fIndex, type Bm25fConfig } from "./bm25f";
import { rrf, weightedSum, type Ranked } from "./fusion";
import { expand } from "./lexicon";
import { errorSignatures, hashSignature } from "./signature";
import { VectorIndex } from "./vector";

/**
 * Hybrid search over notes, issues and pull requests.
 *
 * Every retrieval strategy is an explicit, named arm so the benchmark can
 * compare them on identical data. The product uses whichever arm the
 * benchmark shows is best within its latency budget; see
 * docs/search/ARCHITECTURE.md.
 */

export type DocKind = "note" | "issue" | "pr";

export interface SearchDoc {
  id: string;
  kind: DocKind;
  title: string;
  body: string;
  labels?: string[];
  /** e.g. "vercel/next.js" or "notes". */
  source: string;
  url?: string;
  createdAt: string;
  state?: string;
}

export interface Embedder {
  /** Model id plus settings; part of every cache key and benchmark row. */
  id: string;
  dim: number;
  embedQueries(texts: string[]): Promise<Float32Array[]>;
  embedDocs(texts: string[]): Promise<Float32Array[]>;
}

export const ARMS = ["bm25", "bm25f", "bm25f+sig", "bm25f+sig+lex", "dense", "hybrid-rrf", "hybrid-wsum"] as const;
export type Arm = (typeof ARMS)[number];
export const LEXICAL_ARMS: Arm[] = ["bm25", "bm25f", "bm25f+sig", "bm25f+sig+lex"];

/** A whole issue as the query: title and body are weighted differently. */
export interface QueryParts { title: string; body: string }

export interface SearchHit { id: string; score: number; signatureMatch?: boolean }
export interface SearchResult { arm: Arm; hits: SearchHit[]; ms: number; scanned: number; embedMs?: number }

const NO_SIG: Bm25fConfig = { ...BM25F_V1, fields: { ...BM25F_V1.fields, signature: { weight: 0, b: 0.3 } } };
const EXPANSION_WEIGHT = 0.4;
const SIGNATURE_BOOST = 0.5;
/** Text an embedding model sees: title and the start of the body (~400 tokens). */
export const embedText = (d: Pick<SearchDoc, "title" | "body">) => `${d.title}\n${d.body}`.slice(0, 1800);

export class SearchIndex {
  readonly flat = new Bm25fIndex(BM25_FLAT);
  readonly fielded = new Bm25fIndex(NO_SIG);
  readonly withSig = new Bm25fIndex(BM25F_V1);
  readonly docs = new Map<string, SearchDoc>();
  private sigs = new Map<string, Set<string>>();
  private docSigs = new Map<string, string[]>();
  vectors: VectorIndex | null = null;

  constructor(readonly embedder: Embedder | null = null, quantize = false) {
    if (embedder) this.vectors = new VectorIndex(embedder.dim, quantize);
  }

  get size() { return this.docs.size; }

  /** Lexical side is synchronous; call `embed` afterwards for the dense side. */
  upsert(doc: SearchDoc): void {
    this.removeSigs(doc.id);
    this.docs.set(doc.id, doc);
    const sigs = errorSignatures(`${doc.title}\n${doc.body}`);
    const labels = (doc.labels ?? []).join(" ");
    const flatText = `${doc.title}\n${doc.body}\n${labels}`;
    this.flat.upsert(doc.id, { body: flatText });
    this.fielded.upsert(doc.id, { title: doc.title, body: doc.body, labels });
    this.withSig.upsert(doc.id, { title: doc.title, body: doc.body, labels, signature: sigs.join("\n") });
    const hashes = sigs.map(hashSignature);
    this.docSigs.set(doc.id, hashes);
    for (const h of hashes) (this.sigs.get(h) ?? this.sigs.set(h, new Set()).get(h)!).add(doc.id);
  }

  async embed(ids: string[], batch = 32): Promise<number> {
    if (!this.embedder || !this.vectors) return 0;
    let n = 0;
    for (let i = 0; i < ids.length; i += batch) {
      const slice = ids.slice(i, i + batch).filter((id) => this.docs.has(id));
      const vecs = await this.embedder.embedDocs(slice.map((id) => embedText(this.docs.get(id)!)));
      slice.forEach((id, j) => this.vectors!.upsert(id, vecs[j]!));
      n += slice.length;
    }
    return n;
  }

  remove(id: string): boolean {
    if (!this.docs.delete(id)) return false;
    this.flat.remove(id); this.fielded.remove(id); this.withSig.remove(id);
    this.vectors?.remove(id);
    this.removeSigs(id);
    return true;
  }

  private removeSigs(id: string) {
    for (const h of this.docSigs.get(id) ?? []) { const s = this.sigs.get(h); s?.delete(id); if (s && !s.size) this.sigs.delete(h); }
    this.docSigs.delete(id);
  }

  private lexical(arm: Arm, text: string, k: number, allow?: (id: string) => boolean, parts?: QueryParts): { hits: SearchHit[]; scanned: number } {
    const qtf = parts ? structuredQueryTerms(parts.title, parts.body) : queryTerms(text);
    if (arm === "bm25") return this.flat.search(qtf, k, allow);
    if (arm === "bm25f") return this.fielded.search(qtf, k, allow);
    if (arm === "bm25f+sig+lex") {
      for (const t of expand(analyze(text, { wholes: false }))) qtf.set(t, (qtf.get(t) ?? 0) + EXPANSION_WEIGHT);
    }
    const res = this.withSig.search(qtf, k * 2, allow);
    const qsig = new Set(errorSignatures(text).map(hashSignature));
    if (!qsig.size) return { hits: res.hits.slice(0, k), scanned: res.scanned };
    // Exact error-signature matches are boosted, and pulled in if BM25F missed them.
    const byId = new Map(res.hits.map((h) => [h.id, { ...h } as SearchHit]));
    const top = res.hits[0]?.score ?? 1;
    for (const h of qsig) for (const id of this.sigs.get(h) ?? []) {
      if (allow && !allow(id)) continue;
      const cur = byId.get(id) ?? { id, score: 0 };
      cur.score = cur.score * (1 + SIGNATURE_BOOST) + top * 0.1;
      cur.signatureMatch = true;
      byId.set(id, cur);
    }
    const hits = [...byId.values()].sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1)).slice(0, k);
    return { hits, scanned: res.scanned };
  }

  async search(text: string, opts: { arm: Arm; k?: number; allow?: (id: string) => boolean; queryVector?: Float32Array; parts?: QueryParts }): Promise<SearchResult> {
    const k = opts.k ?? 10;
    const t0 = performance.now();
    if (LEXICAL_ARMS.includes(opts.arm)) {
      const r = this.lexical(opts.arm, text, k, opts.allow, opts.arm === "bm25" ? undefined : opts.parts);
      return { arm: opts.arm, hits: r.hits, scanned: r.scanned, ms: performance.now() - t0 };
    }
    if (!this.embedder || !this.vectors) throw new Error(`arm ${opts.arm} needs an embedder`);
    const te = performance.now();
    const qv = opts.queryVector ?? (await this.embedder.embedQueries([text]))[0]!;
    const embedMs = opts.queryVector ? 0 : performance.now() - te;
    const depth = Math.max(50, k * 5);
    const dense = this.vectors.search(qv, depth, opts.allow);
    if (opts.arm === "dense") return { arm: "dense", hits: dense.slice(0, k), scanned: this.vectors.size, ms: performance.now() - t0, embedMs };
    const lex = this.lexical("bm25f+sig", text, depth, opts.allow, opts.parts);
    const fused: Ranked[] = opts.arm === "hybrid-rrf" ? rrf([lex.hits, dense], 60) : weightedSum([lex.hits, dense], [0.5, 0.5]);
    const sigIds = new Set(lex.hits.filter((h) => h.signatureMatch).map((h) => h.id));
    return {
      arm: opts.arm,
      hits: fused.slice(0, k).map((h) => ({ ...h, ...(sigIds.has(h.id) ? { signatureMatch: true } : {}) })),
      scanned: lex.scanned + this.vectors.size,
      ms: performance.now() - t0,
      embedMs,
    };
  }
}
