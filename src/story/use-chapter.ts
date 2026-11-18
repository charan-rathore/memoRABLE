"use client";

import { useEffect, useRef } from "react";
import { clamp01, damp, decayFromHalfLife } from "@/motion/curves";

/**
 * One chapter of a story: a tall section whose stage is pinned while you read.
 *
 * Two clocks, both pure functions of scroll position, so scrolling back plays
 * the chapter backwards and every position has exactly one frame:
 *   enter  0 → 1 while the stage slides up over the previous one (one screen);
 *   p      0 → 1 while the stage is pinned and its content builds, finishing
 *          one screen before the chapter ends, while the next one covers it.
 * Both are smoothed with frame-rate independent decay (half-life 60 ms), which
 * turns wheel ticks into motion without trailing the scrollbar. Reduced motion
 * turns the smoothing off. When printing, every chapter is drawn finished.
 */
const easeOut = (t: number) => 1 - (1 - t) ** 3;

export interface Clock { enter: number; p: number; w: number; h: number; mobile: boolean }
export type Draw = (c: Clock) => void;

let printing = false;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeprint", () => { printing = true; listeners.forEach((f) => f()); });
  window.addEventListener("afterprint", () => { printing = false; listeners.forEach((f) => f()); });
}

/**
 * `intro`: for the first chapter only, the part of its build that plays on
 * load (a fraction of p, over `introMs`), so the page never opens on an empty
 * field. Scrolling builds the rest.
 */
export function useChapter<T extends HTMLElement>(draw: Draw, { halfLife = 0.06, intro = 0, introMs = 1600 }: { halfLife?: number; intro?: number; introMs?: number } = {}) {
  const ref = useRef<T>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    const section = ref.current;
    if (!section) return;
    const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const decay = decayFromHalfLife(halfLife);
    let shown: { enter: number; p: number } | null = null;
    let frame = 0;
    let last = 0;
    let near = true;
    const born = performance.now();
    const introAt = (now: number) => (intro && !reduced ? easeOut(Math.min(1, (now - born) / introMs)) : 1);

    const read = () => {
      const r = section.getBoundingClientRect();
      const vh = window.innerHeight;
      const enter = clamp01(1 - r.top / vh);
      // The last screen of every chapter is where the next one arrives over it,
      // so the build has to be finished by then.
      const travel = r.height - 2 * vh;
      const p = travel <= 0 ? (r.top < 0 ? 1 : 0) : clamp01(-r.top / travel);
      return { enter, p };
    };
    const tick = (now: number) => {
      frame = 0;
      const dt = last ? Math.min(0.064, (now - last) / 1000) : 1 / 60;
      last = now;
      const k = introAt(now);
      const raw = printing ? { enter: 1, p: 1 } : read();
      const target = intro ? { enter: raw.enter, p: intro * k + (1 - intro) * raw.p } : raw;
      const next = reduced || printing || !shown
        ? target
        : { enter: damp(shown.enter, target.enter, decay, dt), p: damp(shown.p, target.p, decay, dt) };
      const settled = Math.abs(next.enter - target.enter) < 0.0005 && Math.abs(next.p - target.p) < 0.0005;
      shown = settled ? target : next;
      const w = window.innerWidth;
      drawRef.current({ ...shown, w, h: window.innerHeight, mobile: w < 760 });
      if (!settled || k < 1) frame = requestAnimationFrame(tick);
      else last = 0;
    };
    const wake = () => { if ((near || printing) && !frame) frame = requestAnimationFrame(tick); };
    const now = () => { cancelAnimationFrame(frame); frame = 0; tick(performance.now()); };
    const io = typeof IntersectionObserver === "function"
      ? new IntersectionObserver(([e]) => { near = !!e?.isIntersecting; if (near) wake(); }, { rootMargin: "60% 0px" })
      : null;
    io?.observe(section);
    listeners.add(now);
    wake();
    window.addEventListener("scroll", wake, { passive: true });
    window.addEventListener("resize", wake);
    return () => {
      io?.disconnect();
      listeners.delete(now);
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", wake);
      window.removeEventListener("resize", wake);
    };
  }, [halfLife, intro, introMs]);

  return ref;
}
