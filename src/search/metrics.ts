/** Standard IR metrics with binary relevance. */

export function recallAt(ranked: string[], relevant: Set<string>, k: number): number {
  if (!relevant.size) return 0;
  let hit = 0;
  for (const id of ranked.slice(0, k)) if (relevant.has(id)) hit++;
  return hit / relevant.size;
}

export function mrrAt(ranked: string[], relevant: Set<string>, k = 10): number {
  const i = ranked.slice(0, k).findIndex((id) => relevant.has(id));
  return i < 0 ? 0 : 1 / (i + 1);
}

export function ndcgAt(ranked: string[], relevant: Set<string>, k = 10): number {
  let dcg = 0;
  ranked.slice(0, k).forEach((id, i) => { if (relevant.has(id)) dcg += 1 / Math.log2(i + 2); });
  let idcg = 0;
  for (let i = 0; i < Math.min(k, relevant.size); i++) idcg += 1 / Math.log2(i + 2);
  return idcg ? dcg / idcg : 0;
}

export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))]!;
}

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Paired bootstrap 95% CI of the mean difference (b - a), deterministic seed. */
export function pairedBootstrap(a: number[], b: number[], iters = 2000, seed = 7): { diff: number; lo: number; hi: number } {
  let s = seed >>> 0;
  const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
  const n = a.length;
  const diffs = a.map((x, i) => b[i]! - x);
  const means: number[] = [];
  for (let it = 0; it < iters; it++) {
    let sum = 0;
    for (let j = 0; j < n; j++) sum += diffs[Math.floor(rand() * n)]!;
    means.push(sum / n);
  }
  means.sort((x, y) => x - y);
  return { diff: mean(diffs), lo: means[Math.floor(0.025 * iters)]!, hi: means[Math.floor(0.975 * iters)]! };
}
