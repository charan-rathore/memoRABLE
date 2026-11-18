/**
 * The story's motion vocabulary, taken from how the reference portfolio moves:
 *
 *  - rise:    words come up from just below their line and settle with a small
 *             tilt that straightens out, one after another, like type being set.
 *  - set:     a big word's letters slide up out of a mask; the final dot lands
 *             last, a little late, with a touch of overshoot.
 *  - lift:    things under a cover are revealed one at a time, left to right
 *             (the cloches): the cover lifts, then what's under it counts up.
 *  - draw:    lines are drawn by arc length, and the points on them arrive as
 *             the line reaches them.
 *  - curtain: a new colour field slides up over the last one as an arch whose
 *             corners flatten as it settles.
 *
 * Every function maps scroll progress to a frame. Nothing loops and nothing
 * plays on a timer, so the reader is always the one moving the story.
 */
import { cssCubicBezier, span } from "@/motion/curves";

export const OUT = cssCubicBezier(0.22, 1, 0.36, 1);
export const IN_OUT = cssCubicBezier(0.65, 0, 0.35, 1);
/** easeOutBack: the dot's small overshoot. */
export const BACK = (t: number) => { const c = 1.6; const x = t - 1; return 1 + (c + 1) * x * x * x + c * x * x; };

type El = HTMLElement | SVGElement;
const st = (el: El) => (el as HTMLElement).style;

/** Words rising into place across [a, b] of p. Each word gets `each` of the window. */
export function rise(els: ArrayLike<El>, p: number, a: number, b: number, each = 0.35) {
  const n = els.length;
  if (!n) return;
  const step = n > 1 ? ((b - a) * (1 - each)) / (n - 1) : 0;
  const w = (b - a) * each;
  for (let i = 0; i < n; i++) {
    const t = OUT(span(p, a + i * step, a + i * step + w));
    const tilt = (i % 2 ? 1 : -1) * 5 * (1 - t);
    const s = st(els[i]!);
    s.transform = `translate3d(0, ${(0.55 * (1 - t)).toFixed(3)}em, 0) rotate(${tilt.toFixed(2)}deg)`;
    s.opacity = (t < 0.02 ? 0 : Math.min(1, t * 1.6)).toFixed(3);
  }
}

/** A big word's letters coming up out of their mask; the last one (the dot) lands late. */
export function set(els: ArrayLike<El>, p: number, a: number, b: number) {
  const n = els.length;
  if (!n) return;
  const dotStart = a + (b - a) * 0.72;
  const step = n > 2 ? ((dotStart - a) * 0.7) / (n - 2) : 0;
  for (let i = 0; i < n; i++) {
    const dot = i === n - 1 && (els[i] as HTMLElement).dataset.dot !== undefined;
    const t = dot ? BACK(span(p, dotStart, b)) : OUT(span(p, a + i * step, a + i * step + (b - a) * 0.3));
    st(els[i]!).transform = dot
      ? `translate3d(0, ${(-1.2 * (1 - t)).toFixed(3)}em, 0) scale(${(0.4 + 0.6 * t).toFixed(3)})`
      : `translate3d(0, ${(108 * (1 - t)).toFixed(2)}%, 0)`;
    if (dot) st(els[i]!).opacity = (t > 0.01 ? 1 : 0).toString();
  }
}

/** The window of p in which item i of n is revealed, for things that arrive one at a time. */
export function slot(i: number, n: number, a: number, b: number, overlap = 0.4): [number, number] {
  const w = (b - a) / (n - (n - 1) * overlap);
  const start = a + i * w * (1 - overlap);
  return [start, start + w];
}

/** The arch a new field arrives as: corner radius in px, flattening as it settles. */
export function curtain(enter: number, w: number): string {
  const t = IN_OUT(enter);
  const r = (1 - t) * Math.min(w * 0.5, 900);
  return `inset(0 round ${r.toFixed(1)}px ${r.toFixed(1)}px 0 0)`;
}

/** Write a number the way the source wrote its value: "$4.2M", "121%", "19 mo", "34". */
export function likeSource(shown: string, n: number): string {
  const m = /^([^\d\-+.]*?)\s*([-+]?\d[\d,]*(?:\.(\d+))?)(\s*)([a-zA-Z%]*)(\s*.*)$/.exec(shown.trim());
  if (!m) return String(Math.round(n));
  const [, pre = "", , dec = "", gap = "", suf = "", rest = ""] = m;
  const scale = ({ k: 1e3, K: 1e3, m: 1e6, M: 1e6, b: 1e9, B: 1e9, bn: 1e9 } as Record<string, number>)[suf] ?? 1;
  const v = n / scale;
  const body = v.toLocaleString("en-US", { minimumFractionDigits: dec.length, maximumFractionDigits: dec.length });
  return `${pre}${body}${gap}${suf}${rest}`;
}
