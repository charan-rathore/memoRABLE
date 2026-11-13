/**
 * Motion math, after Freya Holmér's "The Beauty of Bézier Curves",
 * "The Continuity of Splines" and "Lerp smoothing is broken".
 *
 * Three ideas carry every animation on the site:
 *
 * 1. Frame-rate independent smoothing. `a = lerp(a, b, 0.1)` per frame moves
 *    differently at 30 and 120 fps. The continuous form is exponential decay,
 *    a(t) = b + (a0 - b)·e^(-λt), so one step of Δt is
 *    a = b + (a - b)·e^(-λ·Δt). We parameterize it by half-life: the time to
 *    close half the remaining distance, λ = ln 2 / halfLife.
 *
 * 2. Paths with continuous acceleration. A uniform cubic B-spline is C²:
 *    position, velocity and acceleration never jump at the joins, which is
 *    what keeps a slowly orbiting object from looking like it "ticks" (the
 *    same reason cameras ride B-splines). It does not pass through its
 *    control points; that's the trade for smoothness.
 *
 * 3. Constant speed along a path. Equal steps in t are not equal steps in
 *    distance. An arc-length lookup table maps distance to t, so motion along
 *    the path has uniform on-screen speed.
 */

export interface Vec2 { x: number; y: number }

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number) => (a === b ? 0 : (v - a) / (b - a));
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const remap = (v: number, a0: number, a1: number, b0: number, b1: number) => lerp(b0, b1, invLerp(a0, a1, v));

/** Decay constant for a half-life in seconds. */
export const decayFromHalfLife = (halfLife: number) => Math.LN2 / Math.max(1e-6, halfLife);

/** One frame-rate independent smoothing step toward `b`. */
export function damp(a: number, b: number, decay: number, dt: number): number {
  return b + (a - b) * Math.exp(-decay * dt);
}

export function damp2(a: Vec2, b: Vec2, decay: number, dt: number): Vec2 {
  const k = Math.exp(-decay * dt);
  return { x: b.x + (a.x - b.x) * k, y: b.y + (a.y - b.y) * k };
}

/** Cubic Bézier by De Casteljau: lerps all the way down (numerically stable). */
export function bezier(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const a = { x: lerp(p0.x, p1.x, t), y: lerp(p0.y, p1.y, t) };
  const b = { x: lerp(p1.x, p2.x, t), y: lerp(p1.y, p2.y, t) };
  const c = { x: lerp(p2.x, p3.x, t), y: lerp(p2.y, p3.y, t) };
  const d = { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
  const e = { x: lerp(b.x, c.x, t), y: lerp(b.y, c.y, t) };
  return { x: lerp(d.x, e.x, t), y: lerp(d.y, e.y, t) };
}

/**
 * CSS `cubic-bezier(x1, y1, x2, y2)` as a function of progress. Solves
 * x(t) = progress with Newton's method (bisection fallback), then returns y(t),
 * so JS-driven motion matches the CSS curves used elsewhere exactly.
 */
export function cssCubicBezier(x1: number, y1: number, x2: number, y2: number): (p: number) => number {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (p: number) => {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    let t = p;
    for (let i = 0; i < 8; i++) {
      const err = sx(t) - p;
      if (Math.abs(err) < 1e-6) return sy(t);
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0, hi = 1; t = p;
    for (let i = 0; i < 30; i++) { const v = sx(t); if (Math.abs(v - p) < 1e-6) break; if (v < p) lo = t; else hi = t; t = (lo + hi) / 2; }
    return sy(t);
  };
}

/** The site's two signature curves (also defined as CSS custom properties). */
export const EASE_OUT_EXPO = cssCubicBezier(0.16, 1, 0.3, 1);
export const EASE_IN_OUT = cssCubicBezier(0.65, 0, 0.35, 1);

/** Uniform cubic B-spline segment from four control points, t in [0,1]. */
export function bspline(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const t2 = t * t, t3 = t2 * t;
  const b0 = (1 - 3 * t + 3 * t2 - t3) / 6;
  const b1 = (4 - 6 * t2 + 3 * t3) / 6;
  const b2 = (1 + 3 * t + 3 * t2 - 3 * t3) / 6;
  const b3 = t3 / 6;
  return { x: b0 * p0.x + b1 * p1.x + b2 * p2.x + b3 * p3.x, y: b0 * p0.y + b1 * p1.y + b2 * p2.y + b3 * p3.y };
}

/**
 * A closed C² loop through (near) the given control points, sampled by arc
 * length: `at(u)` with u in [0,1) moves at constant speed.
 */
export class ClosedSpline {
  private lut: number[] = [];
  private samples: Vec2[] = [];
  readonly length: number;

  constructor(readonly points: Vec2[], resolution = 240) {
    if (points.length < 4) throw new Error("a closed B-spline needs at least 4 control points");
    const n = points.length;
    let total = 0;
    let prev: Vec2 | null = null;
    for (let i = 0; i <= resolution; i++) {
      const g = (i / resolution) * n;
      const seg = Math.min(n - 1, Math.floor(g));
      const p = this.raw(seg, g - seg);
      if (prev) total += Math.hypot(p.x - prev.x, p.y - prev.y);
      this.lut.push(total);
      this.samples.push(p);
      prev = p;
    }
    this.length = total;
  }

  private raw(seg: number, t: number): Vec2 {
    const n = this.points.length, P = this.points;
    return bspline(P[(seg - 1 + n) % n]!, P[seg % n]!, P[(seg + 1) % n]!, P[(seg + 2) % n]!, t);
  }

  /** Point at fraction u of the total length (wraps). */
  at(u: number): Vec2 {
    const d = (((u % 1) + 1) % 1) * this.length;
    let lo = 0, hi = this.lut.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (this.lut[mid]! < d) lo = mid + 1; else hi = mid; }
    const i = Math.max(1, lo);
    const a = this.lut[i - 1]!, b = this.lut[i]!;
    const f = b === a ? 0 : (d - a) / (b - a);
    const p = this.samples[i - 1]!, q = this.samples[i]!;
    return { x: lerp(p.x, q.x, f), y: lerp(p.y, q.y, f) };
  }
}

/** Emil Kowalski's UI curves: strong ease-out for things arriving, ease-in-out for things already on screen. */
export const EASE_OUT = cssCubicBezier(0.23, 1, 0.32, 1);
export const EASE_IO = cssCubicBezier(0.77, 0, 0.175, 1);

/** Local progress of `p` inside the window [a, b], clamped to [0, 1]. */
export const span = (p: number, a: number, b: number) => clamp01(invLerp(a, b, p));

/** First derivative of a cubic Bézier: the direction of travel at t. */
export function bezierTangent(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const u = 1 - t;
  return {
    x: 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    y: 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y),
  };
}

/**
 * A flight from `a` to `b` on a cubic Bézier that leaves `a` going `out` and
 * arrives at `b` coming from `inn` (handles are relative offsets). Returns
 * the position and the heading in radians, so an object can bank into the turn.
 */
export function flight(a: Vec2, b: Vec2, out: Vec2, inn: Vec2, t: number): { x: number; y: number; angle: number } {
  const p1 = { x: a.x + out.x, y: a.y + out.y };
  const p2 = { x: b.x + inn.x, y: b.y + inn.y };
  const p = bezier(a, p1, p2, b, t);
  const d = bezierTangent(a, p1, p2, b, t);
  return { x: p.x, y: p.y, angle: Math.atan2(d.y, d.x) };
}

/**
 * Catmull-Rom through every point (it interpolates, unlike a B-spline),
 * written as an SVG path of cubic Béziers. Each segment's handles are
 * one sixth of the neighbouring chord, which is what makes the joins C¹.
 */
export function catmullRomPath(points: Vec2[]): string {
  if (points.length < 2) return "";
  const P = points;
  let d = `M${P[0]!.x.toFixed(1)} ${P[0]!.y.toFixed(1)}`;
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)]!, p1 = P[i]!, p2 = P[i + 1]!, p3 = P[Math.min(P.length - 1, i + 2)]!;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += `C${c1.x.toFixed(1)} ${c1.y.toFixed(1)} ${c2.x.toFixed(1)} ${c2.y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

/** Small deterministic PRNG (mulberry32), so scattered layouts are the same on every load. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
