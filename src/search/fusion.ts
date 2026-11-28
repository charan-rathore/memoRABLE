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

/**
 * Min-max normalize each list, then weighted sum.
 *
 * A list whose scores are all equal (most often a single hit, e.g. one exact
 * error-signature match) has no spread to normalize. It counts as fully
 * relevant (1), not as the minimum (0): otherwise the only keyword match
 * contributed nothing and lost to any dense neighbour.
 */
export function weightedSum(lists: Ranked[][], weights: number[]): Ranked[] {
  const acc = new Map<string, number>();
  lists.forEach((list, li) => {
    if (!list.length) return;
    let max = -Infinity, min = Infinity;
    for (const h of list) { if (h.score > max) max = h.score; if (h.score < min) min = h.score; }
    const span = max - min;
    for (const h of list) acc.set(h.id, (acc.get(h.id) ?? 0) + (weights[li] ?? 1) * (span > 0 ? (h.score - min) / span : 1));
  });
  return [...acc].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
}
