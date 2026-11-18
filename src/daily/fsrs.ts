/**
 * FSRS-5 memory model, used to decide WHEN a decision or lesson should come
 * back for re-confirmation.
 *
 * FSRS models one memory with three variables (the DSR model): difficulty D
 * (1..10), stability S (days until recall probability falls to 90%), and
 * retrievability R (recall probability now, from a power forgetting curve).
 * Ye, Su & Cao, "A Stochastic Shortest Path Algorithm for Optimizing Spaced
 * Repetition Scheduling", KDD 2022; FSRS-5 formulas and default weights from
 * the open-spaced-repetition reference implementation.
 *
 * Honest scope: the default weights were fitted on flashcard review logs, not
 * on engineering decisions. Here they give a principled, explainable schedule
 * (new decisions come back after days, confirmed ones after weeks, then
 * months; a decision you were unsure about comes back sooner). They are not a
 * validated model of how fast decision rationale decays.
 */

/** FSRS-5 default parameters w0..w18. */
export const FSRS5_WEIGHTS = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605,
  2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
] as const;

export const FSRS_ID = "fsrs-5-default";
/** Re-confirm when predicted recall of the rationale drops below this. */
export const DESIRED_RETENTION = 0.9;

const F = 19 / 81;
const C = -0.5;
const DAY = 86_400_000;
const w = FSRS5_WEIGHTS;

/** 1 Again (no longer holds / forgot), 2 Hard (unsure), 3 Good (still holds), 4 Easy. */
export type Grade = 1 | 2 | 3 | 4;

export interface MemoryState {
  stability: number;
  difficulty: number;
  /** ISO time of the last review (or of recording). */
  lastReview: string;
  reviews: number;
  lapses: number;
}

const clampD = (d: number) => Math.min(10, Math.max(1, d));

/** Power forgetting curve; R(S, S) = 0.9 by construction. */
export function retrievability(elapsedDays: number, stability: number): number {
  if (stability <= 0) return 0;
  return Math.pow(1 + (F * Math.max(0, elapsedDays)) / stability, C);
}

/** Days after the last review at which R falls to `retention`. */
export function intervalDays(stability: number, retention = DESIRED_RETENTION): number {
  return (stability / F) * (Math.pow(retention, 1 / C) - 1);
}

function initialDifficulty(g: Grade): number {
  return clampD(w[4] - Math.exp(w[5] * (g - 1)) + 1);
}

export function initialState(at: string, g: Grade = 3): MemoryState {
  return { stability: w[g - 1]!, difficulty: initialDifficulty(g), lastReview: at, reviews: 0, lapses: 0 };
}

function nextDifficulty(d: number, g: Grade): number {
  const delta = -w[6] * (g - 3);
  const damped = d + (delta * (10 - d)) / 9; // FSRS-5 linear damping
  return clampD(w[7] * initialDifficulty(4) + (1 - w[7]) * damped); // mean reversion
}

function recallStability(d: number, s: number, r: number, g: Grade): number {
  const hard = g === 2 ? w[15] : 1;
  const easy = g === 4 ? w[16] : 1;
  return s * (Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) * (Math.exp(w[10] * (1 - r)) - 1) * hard * easy + 1);
}

function forgetStability(d: number, s: number, r: number): number {
  const sf = w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp(w[14] * (1 - r));
  return Math.min(sf, s);
}

function shortTermStability(s: number, g: Grade): number {
  return s * Math.exp(w[17] * (g - 3 + w[18]));
}

/** Apply one review at time `at`. Pure. */
export function review(state: MemoryState, g: Grade, at: string): MemoryState {
  const elapsed = Math.max(0, (Date.parse(at) - Date.parse(state.lastReview)) / DAY);
  const r = retrievability(elapsed, state.stability);
  const difficulty = nextDifficulty(state.difficulty, g);
  let stability: number;
  if (elapsed < 1) stability = shortTermStability(state.stability, g);
  else if (g === 1) stability = forgetStability(state.difficulty, state.stability, r);
  else stability = recallStability(state.difficulty, state.stability, r, g);
  return {
    stability: Math.max(0.01, stability),
    difficulty,
    lastReview: at,
    reviews: state.reviews + 1,
    lapses: state.lapses + (g === 1 ? 1 : 0),
  };
}

export interface Due {
  retrievability: number;
  dueAt: string;
  /** Positive when past due. */
  overdueDays: number;
}

export function dueOf(state: MemoryState, now: Date, retention = DESIRED_RETENTION): Due {
  const last = Date.parse(state.lastReview);
  const elapsed = (now.getTime() - last) / DAY;
  const interval = intervalDays(state.stability, retention);
  return {
    retrievability: retrievability(elapsed, state.stability),
    dueAt: new Date(last + interval * DAY).toISOString(),
    overdueDays: elapsed - interval,
  };
}
