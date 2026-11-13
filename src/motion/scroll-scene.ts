"use client";

import { useEffect, useRef } from "react";
import { clamp01, damp, decayFromHalfLife } from "./curves";

/**
 * Scroll-pinned scenes.
 *
 * A chapter is a tall section (N × 100vh) with a `position: sticky` stage
 * inside it. While the stage is pinned, the chapter's progress p runs 0 → 1
 * and the scene is drawn as a pure function of p: every scroll position has
 * exactly one frame, so there are no empty mid-loop moments and scrolling
 * backwards plays the story backwards.
 *
 * The raw progress is smoothed with frame-rate independent exponential decay
 * (half-life 40 ms: enough to turn wheel ticks into motion, short enough that
 * the scene never trails the scrollbar) so wheel ticks become motion instead of jumps. Under
 * reduced motion the smoothing is off and the scene follows the scrollbar
 * exactly; the story stays, the inertia goes.
 *
 * `render(p, size)` writes to the DOM directly (transforms, opacity, SVG
 * attributes). React never re-renders per frame.
 */
export interface StageSize { w: number; h: number; mobile: boolean }

export function useScrollScene<T extends HTMLElement>(
  render: (p: number, size: StageSize) => void,
  { halfLife = 0.04 }: { halfLife?: number } = {},
) {
  const ref = useRef<T>(null);
  const renderRef = useRef(render);
  renderRef.current = render;

  useEffect(() => {
    const section = ref.current;
    if (!section) return;
    const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const decay = decayFromHalfLife(halfLife);
    let size: StageSize = { w: 0, h: 0, mobile: false };
    let shown = -1;
    let target = 0;
    let frame = 0;
    let last = 0;

    const measure = () => {
      const stage = section.firstElementChild as HTMLElement | null;
      const w = stage?.clientWidth ?? window.innerWidth;
      const h = stage?.clientHeight ?? window.innerHeight;
      size = { w, h, mobile: w < 760 };
    };
    const read = () => {
      const r = section.getBoundingClientRect();
      const travel = r.height - window.innerHeight;
      return travel <= 0 ? (r.top < 0 ? 1 : 0) : clamp01(-r.top / travel);
    };
    const tick = (now: number) => {
      frame = 0;
      const dt = last ? Math.min(0.064, (now - last) / 1000) : 1 / 60;
      last = now;
      target = read();
      const next = reduced || shown < 0 ? target : damp(shown, target, decay, dt);
      const settled = Math.abs(next - target) < 0.0004;
      shown = settled ? target : next;
      renderRef.current(shown, size);
      if (!settled) frame = requestAnimationFrame(tick);
      else last = 0;
    };
    // Only chapters on or near the screen do any work. Off-screen chapters
    // neither read layout nor write styles, so scrolling stays on the
    // compositor instead of re-laying out five scenes per frame.
    let near = true;
    const wake = () => { if (near && !frame) frame = requestAnimationFrame(tick); };
    const resize = () => { measure(); shown = -1; wake(); };
    const io = typeof IntersectionObserver === "function"
      ? new IntersectionObserver(([e]) => { near = !!e?.isIntersecting; if (near) wake(); }, { rootMargin: "50% 0px" })
      : null;
    io?.observe(section);

    measure();
    wake();
    window.addEventListener("scroll", wake, { passive: true });
    window.addEventListener("resize", resize);
    return () => {
      io?.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", wake);
      window.removeEventListener("resize", resize);
    };
  }, [halfLife]);

  return ref;
}

/** Set a transform without string churn in the hot path. */
export function place(el: Element | null | undefined, x: number, y: number, scale = 1, rotate = 0, opacity?: number) {
  if (!el) return;
  const s = (el as HTMLElement).style;
  s.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotate(${rotate.toFixed(3)}rad) scale(${scale.toFixed(4)})`;
  if (opacity !== undefined) s.opacity = opacity.toFixed(3);
}
