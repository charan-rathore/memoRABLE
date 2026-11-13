/**
 * Rank fusion.
 *
 * Reciprocal Rank Fusion (Cormack, Clarke & Büttcher, SIGIR 2009) combines
 * ranked lists using only ranks: score(d) = Σ 1/(k + rank_i(d)). It needs no
 * score calibration between BM25 (unbounded) and cosine (-1..1), which is why
 * it is the default hybrid. A normalized weighted sum is kept as a second arm
 * so the choice is measured, not assumed.
 */

export interface Ranked { id: string; score: number }

export function rrf(lists: Ranked[][], k = 60, weights?: number[]): Ranked[] {
  const acc = new Map<string, number>();
  lists.forEach((list, li) => {
    const w = weights?.[li] ?? 1;
    list.forEach((h, r) => acc.set(h.id, (acc.get(h.id) ?? 0) + w / (k + r + 1)));
  });
  return [...acc].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
}

/** Min-max normalize each list, then weighted sum. */
export function weightedSum(lists: Ranked[][], weights: number[]): Ranked[] {
  const acc = new Map<string, number>();
  lists.forEach((list, li) => {
    if (!list.length) return;
    const max = list[0]!.score, min = list.at(-1)!.score;
    const span = max - min || 1;
    for (const h of list) acc.set(h.id, (acc.get(h.id) ?? 0) + (weights[li] ?? 1) * ((h.score - min) / span));
  });
  return [...acc].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
}
