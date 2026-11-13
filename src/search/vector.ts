/**
 * Flat vector index with exact cosine search.
 *
 * A personal workspace plus a few connected repos is thousands to tens of
 * thousands of chunks. At 384 dimensions a flat scan of 50k vectors is ~19M
 * multiply-adds, a few milliseconds in JS, and it is exact: no recall lost to
 * an approximate graph, no index to rebuild, deletes are O(1). An ANN index
 * (HNSW) only earns its complexity well past that size; the benchmark reports
 * scan time so the crossover is visible rather than guessed.
 *
 * Optional int8 scalar quantization cuts memory 4x; its recall cost is
 * measured as its own arm.
 */

export interface VectorHit { id: string; score: number }

export class VectorIndex {
  private ids: string[] = [];
  private pos = new Map<string, number>();
  private f32: Float32Array;
  private i8: Int8Array | null;
  private scale: Float32Array;
  private n = 0;

  constructor(readonly dim: number, readonly quantize = false, capacity = 1024) {
    this.f32 = quantize ? new Float32Array(0) : new Float32Array(capacity * dim);
    this.i8 = quantize ? new Int8Array(capacity * dim) : null;
    this.scale = new Float32Array(capacity);
  }

  get size() { return this.n; }
  get bytes() { return this.quantize ? this.n * this.dim + this.n * 4 : this.n * this.dim * 4; }

  private grow() {
    const cap = Math.max(16, this.scale.length * 2);
    if (this.quantize) { const next = new Int8Array(cap * this.dim); next.set(this.i8!); this.i8 = next; }
    else { const next = new Float32Array(cap * this.dim); next.set(this.f32); this.f32 = next; }
    const s = new Float32Array(cap); s.set(this.scale); this.scale = s;
  }

  /** Vectors are L2-normalized on insert, so dot product equals cosine. */
  upsert(id: string, v: ArrayLike<number>): void {
    if (v.length !== this.dim) throw new Error(`expected ${this.dim} dims, got ${v.length}`);
    let i = this.pos.get(id);
    if (i === undefined) {
      if (this.n >= this.scale.length) this.grow();
      i = this.n++;
      this.ids[i] = id;
      this.pos.set(id, i);
    }
    let norm = 0;
    for (let d = 0; d < this.dim; d++) norm += v[d]! * v[d]!;
    norm = Math.sqrt(norm) || 1;
    const off = i * this.dim;
    if (this.quantize) {
      let max = 0;
      for (let d = 0; d < this.dim; d++) max = Math.max(max, Math.abs(v[d]! / norm));
      const s = max / 127 || 1;
      this.scale[i] = s;
      for (let d = 0; d < this.dim; d++) this.i8![off + d] = Math.round(v[d]! / norm / s);
    } else {
      for (let d = 0; d < this.dim; d++) this.f32[off + d] = v[d]! / norm;
    }
  }

  /** O(1) delete: move the last vector into the hole. */
  remove(id: string): boolean {
    const i = this.pos.get(id);
    if (i === undefined) return false;
    const last = --this.n;
    if (i !== last) {
      const lastId = this.ids[last]!;
      if (this.quantize) this.i8!.copyWithin(i * this.dim, last * this.dim, (last + 1) * this.dim);
      else this.f32.copyWithin(i * this.dim, last * this.dim, (last + 1) * this.dim);
      this.scale[i] = this.scale[last]!;
      this.ids[i] = lastId;
      this.pos.set(lastId, i);
    }
    this.ids.length = this.n;
    this.pos.delete(id);
    return true;
  }

  search(q: ArrayLike<number>, k = 50, allow?: (id: string) => boolean): VectorHit[] {
    let norm = 0;
    for (let d = 0; d < this.dim; d++) norm += q[d]! * q[d]!;
    norm = Math.sqrt(norm) || 1;
    const qn = new Float32Array(this.dim);
    for (let d = 0; d < this.dim; d++) qn[d] = q[d]! / norm;

    // Keep a small sorted top-k; cheaper than sorting every score.
    const top: VectorHit[] = [];
    for (let i = 0; i < this.n; i++) {
      const id = this.ids[i]!;
      if (allow && !allow(id)) continue;
      const off = i * this.dim;
      let s = 0;
      if (this.quantize) { const a = this.i8!; for (let d = 0; d < this.dim; d++) s += a[off + d]! * qn[d]!; s *= this.scale[i]!; }
      else { const a = this.f32; for (let d = 0; d < this.dim; d++) s += a[off + d]! * qn[d]!; }
      if (top.length < k) { top.push({ id, score: s }); if (top.length === k) top.sort((x, y) => y.score - x.score); }
      else if (s > top[k - 1]!.score) {
        let j = k - 1;
        while (j > 0 && top[j - 1]!.score < s) { top[j] = top[j - 1]!; j--; }
        top[j] = { id, score: s };
      }
    }
    return top.length < k ? top.sort((x, y) => y.score - x.score) : top;
  }
}
