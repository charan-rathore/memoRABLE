import { describe, expect, it } from "vitest";
import { ClosedSpline, bezier, bspline, cssCubicBezier, damp, decayFromHalfLife } from "@/motion/curves";

describe("motion math", () => {
  it("damp is frame-rate independent (24 fps and 120 fps land in the same place)", () => {
    const decay = decayFromHalfLife(0.12);
    const run = (fps: number) => { let a = 0; for (let i = 0; i < fps; i++) a = damp(a, 1, decay, 1 / fps); return a; };
    expect(Math.abs(run(24) - run(120))).toBeLessThan(1e-12);
    // Half-life means half-life: after 0.12 s, half the distance is left.
    expect(damp(0, 1, decay, 0.12)).toBeCloseTo(0.5, 12);
  });

  it("cubic Bézier passes through its end points; CSS easing matches its endpoints and is monotone", () => {
    const p = bezier({ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 0 }, 1);
    expect(p).toEqual({ x: 4, y: 0 });
    const e = cssCubicBezier(0.16, 1, 0.3, 1);
    expect(e(0)).toBe(0); expect(e(1)).toBe(1);
    let prev = 0;
    for (let i = 1; i < 100; i++) { const v = e(i / 100); expect(v).toBeGreaterThanOrEqual(prev - 1e-9); prev = v; }
    expect(e(0.5)).toBeGreaterThan(0.9); // expo-out: most of the move happens early
  });

  it("B-spline joins are C² continuous (velocity and acceleration match across a knot)", () => {
    const P = [{ x: 0, y: 0 }, { x: 1, y: 3 }, { x: 4, y: 4 }, { x: 6, y: 1 }, { x: 9, y: 2 }];
    const seg = (i: number, t: number) => bspline(P[i]!, P[i + 1]!, P[i + 2]!, P[i + 3]!, t);
    const h = 1e-4;
    const d1 = (f: (t: number) => { x: number }, t: number) => (f(t + h).x - f(t - h).x) / (2 * h);
    const d2 = (f: (t: number) => { x: number }, t: number) => (f(t + h).x - 2 * f(t).x + f(t - h).x) / (h * h);
    const A = (t: number) => seg(0, t), B = (t: number) => seg(1, t);
    expect(A(1).x).toBeCloseTo(B(0).x, 10);
    expect(d1(A, 1 - h)).toBeCloseTo(d1(B, h), 2);
    expect(d2(A, 1 - 2 * h)).toBeCloseTo(d2(B, 2 * h), 1);
  });

  it("arc-length parameterization moves at constant speed", () => {
    const s = new ClosedSpline([{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 420, y: 60 }, { x: 0, y: 80 }]);
    const steps = 50;
    const ds: number[] = [];
    // Distance actually travelled in each equal step of u (integrated with sub-steps, not one chord).
    for (let i = 0; i < steps; i++) {
      let d = 0;
      for (let j = 0; j < 20; j++) { const a = s.at((i + j / 20) / steps), b = s.at((i + (j + 1) / 20) / steps); d += Math.hypot(b.x - a.x, b.y - a.y); }
      ds.push(d);
    }
    const mean = ds.reduce((x, y) => x + y) / ds.length;
    for (const d of ds) expect(Math.abs(d - mean) / mean).toBeLessThan(0.03);
  });
});

describe("story motion helpers", () => {
  it("span maps a window to 0..1 and clamps outside it", async () => {
    const { span } = await import("@/motion/curves");
    expect(span(0.1, 0.2, 0.4)).toBe(0);
    expect(span(0.3, 0.2, 0.4)).toBeCloseTo(0.5);
    expect(span(0.9, 0.2, 0.4)).toBe(1);
  });

  it("a flight starts and ends exactly on its endpoints, heading along the handles", async () => {
    const { flight } = await import("@/motion/curves");
    const a = { x: 0, y: 0 }, b = { x: 100, y: 50 };
    const start = flight(a, b, { x: 0, y: -40 }, { x: -30, y: 0 }, 0);
    const end = flight(a, b, { x: 0, y: -40 }, { x: -30, y: 0 }, 1);
    expect([start.x, start.y]).toEqual([0, 0]);
    expect(end.x).toBeCloseTo(100);
    expect(end.y).toBeCloseTo(50);
    expect(start.angle).toBeCloseTo(-Math.PI / 2); // leaves straight up
    expect(end.angle).toBeCloseTo(0); // arrives moving right
  });

  it("the Catmull-Rom thread passes through every point", async () => {
    const { catmullRomPath } = await import("@/motion/curves");
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 40 }, { x: -5, y: 80 }, { x: 3, y: 120 }];
    const d = catmullRomPath(pts);
    for (const p of pts) expect(d).toContain(`${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
    expect(d.match(/C/g)).toHaveLength(3);
  });

  it("scattered layouts are the same on every load", async () => {
    const { rng } = await import("@/motion/curves");
    const a = rng(7), b = rng(7);
    const xs = Array.from({ length: 5 }, () => a());
    expect(Array.from({ length: 5 }, () => b())).toEqual(xs);
    for (const x of xs) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1); }
  });
});
