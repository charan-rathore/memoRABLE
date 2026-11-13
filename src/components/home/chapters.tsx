"use client";

import { useMemo, useRef } from "react";
import {
  EASE_IO,
  EASE_OUT,
  catmullRomPath,
  clamp01,
  flight,
  lerp,
  rng,
  span,
  type Vec2,
} from "@/motion/curves";
import { place, useScrollScene, type StageSize } from "@/motion/scroll-scene";
import { KindGlyph } from "./hero-recall";
import { BENCH } from "./bench-results";

/**
 * The homepage story, told in four pinned chapters.
 *
 * Every chapter is a tall section with a sticky stage. Its scene is a pure
 * function of scroll progress p (see src/motion/scroll-scene.ts), built from
 * the curves in src/motion/curves.ts:
 *   - objects travel on cubic Béziers and bank along the curve's tangent;
 *   - the thread joining a day's notes is a Catmull-Rom spline (it passes
 *     through every note), drawn by arc length with stroke-dashoffset;
 *   - timing windows are shaped with the same cubic-bézier curves as the CSS.
 * The stages are decorative (aria-hidden); each chapter's copy says the same
 * thing in words.
 */

type Kind = "worked" | "learned" | "decided" | "task";
interface Frag { kind: Kind; text: string; time: string }

const DAY: Frag[] = [
  { kind: "worked", text: "Fixed the hydration mismatch on the pricing page", time: "09:12" },
  { kind: "learned", text: "Browser extensions add attributes that break hydration", time: "09:40" },
  { kind: "decided", text: "Cache search results in Edge Config, not Redis", time: "10:05" },
  { kind: "learned", text: "revalidateTag only purges the Data Cache", time: "10:31" },
  { kind: "task", text: "Regression test for the trailing-slash redirect loop", time: "11:02" },
  { kind: "worked", text: "Profiled Turbopack: +200 MB an hour at 3,000 routes", time: "11:48" },
  { kind: "learned", text: "ERR_REQUIRE_ESM came from a transitive dependency", time: "13:15" },
  { kind: "decided", text: "Pin Node 20 in CI until require(esm) is handled", time: "13:22" },
  { kind: "worked", text: "Moved feature flags to Edge Config: 35 ms to 1 ms", time: "14:50" },
  { kind: "learned", text: "Server Actions run with the user’s cookies", time: "15:34" },
  { kind: "task", text: "Flaky Playwright snapshot on Windows", time: "16:10" },
  { kind: "decided", text: "Generate OpenAPI types at build time", time: "17:05" },
];

/** Where the scene draws, inside the stage. */
function visual(size: StageSize, contentH = 0) {
  const { w, h, mobile } = size;
  if (mobile) return { x: 16, y: h * 0.44, w: w - 32, h: h * 0.52 };
  const x = Math.max(w * 0.5, w - 640 - w * 0.05);
  // Centre the scene's content on the stage, below the 60px nav.
  const y = contentH ? Math.max(84, (h + 30 - contentH) / 2) : h * 0.14;
  return { x, y, w: Math.min(640, w * 0.45), h: h * 0.74 };
}

function Row({ f, className = "", tag }: { f: Frag; className?: string; tag?: string }) {
  return (
    <div className={`ch-row k-${f.kind} ${className}`}>
      <KindGlyph kind={f.kind} />
      <span className="ch-row-t">{f.text}</span>
      {tag ? <em className="ch-tag">{tag}</em> : <time>{f.time}</time>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Chapter 1: a scattered day becomes one thread.                      */
/* ------------------------------------------------------------------ */

export function HeroChapter({ onOpenWorkspace }: { onOpenWorkspace: () => void }) {
  const frags = useRef<(HTMLDivElement | null)[]>([]);
  const thread = useRef<SVGPathElement>(null);
  const dots = useRef<(SVGCircleElement | null)[]>([]);
  const dayLabel = useRef<HTMLParagraphElement>(null);
  const cue = useRef<HTMLDivElement>(null);
  const layout = useRef<{ key: string; from: Vec2[]; to: Vec2[]; rot: number[]; depth: number[]; len: number } | null>(null);

  // Arrival order is by importance, not index: decisions land first, then
  // what was learned, then the rest (no uniform stagger).
  const order = useMemo(() => {
    const rank: Record<Kind, number> = { decided: 0, learned: 1, worked: 2, task: 3 };
    return DAY.map((f, i) => ({ i, r: rank[f.kind] + i * 0.01 })).sort((a, b) => a.r - b.r).map((x) => x.i);
  }, []);

  const ref = useScrollScene<HTMLElement>((p, size) => {
    const { w, h, mobile } = size;
    if (!w) return;
    const n = mobile ? 8 : DAY.length;
    const key = `${w}x${h}`;
    if (layout.current?.key !== key) {
      const r = rng(7);
      const v = visual(size);
      const rowH = mobile ? 36 : 42;
      const top = v.y + Math.max(0, (v.h - n * rowH) / 2) + (mobile ? 0 : 18);
      const from: Vec2[] = [], to: Vec2[] = [], rot: number[] = [], depth: number[] = [];
      // Scatter in the part of the stage the headline doesn't use: one
      // horizontal band per fragment (shuffled), random within its band, so
      // nothing overlaps but nothing lines up either.
      const bands = DAY.map((_, i) => i).sort(() => r() - 0.5);
      for (let i = 0; i < DAY.length; i++) {
        const band = (bands[i]! + 0.2 + r() * 0.6) / DAY.length;
        const fx = mobile ? lerp(-60, w - 200, r()) : lerp(w * 0.46, w * 0.95 - 380, r());
        const fy = mobile ? lerp(h * 0.47, h * 0.94, band) : lerp(h * 0.09, h * 0.93, band);
        from.push({ x: fx, y: fy });
        to.push({ x: v.x + 28, y: top + i * rowH });
        rot.push((r() - 0.5) * 0.22);
        depth.push(lerp(0.78, 1, r()));
      }
      layout.current = { key, from, to, rot, depth, len: 0 };
      // The thread: a Catmull-Rom spline through each landing point, swaying
      // a little left and right so it reads as drawn, not ruled.
      const pts = to.slice(0, n).map((t, i) => ({ x: t.x - 16 + Math.sin(i * 1.7) * 5, y: t.y + rowH / 2 - 4 }));
      thread.current?.setAttribute("d", catmullRomPath(pts));
      layout.current.len = thread.current?.getTotalLength?.() ?? 1000;
      dots.current.forEach((d, i) => {
        const pt = pts[i];
        if (!d) return;
        if (!pt) { d.style.opacity = "0"; return; }
        d.setAttribute("cx", pt.x.toFixed(1));
        d.setAttribute("cy", pt.y.toFixed(1));
      });
      if (dayLabel.current) place(dayLabel.current, v.x + 12, top - (mobile ? 34 : 44));
    }
    const L = layout.current!;

    order.forEach((i, rankIdx) => {
      const el = frags.current[i];
      if (!el) return;
      if (i >= n) { el.style.opacity = "0"; return; }
      // Each fragment gets its own window; earlier ranks leave sooner and
      // fly longer, later ones arrive in quicker succession.
      const a = 0.04 + rankIdx * 0.042;
      const t = EASE_IO(span(p, a, a + 0.34));
      const from = L.from[i]!, to = L.to[i]!;
      const dx = to.x - from.x;
      const fl = flight(from, to, { x: dx * 0.15, y: -120 - (i % 3) * 40 }, { x: -Math.abs(dx) * 0.35 - 60, y: 0 }, t);
      // Bank into the turn: heading relative to horizontal, fading out on landing.
      const bank = Math.sin(fl.angle) * 0.12 * Math.sin(Math.PI * t);
      const s = lerp(L.depth[i]!, 1, t);
      const idle = Math.sin(p * 9 + i) * 3 * (1 - t);
      place(el, fl.x, fl.y + idle, s, lerp(L.rot[i]!, 0, t) + bank, lerp(0.7 + 0.2 * L.depth[i]!, 1, t));
      el.classList.toggle("is-landed", t > 0.98);
    });

    const draw = EASE_OUT(span(p, 0.42, 0.9));
    if (thread.current) {
      thread.current.style.strokeDasharray = `${L.len}`;
      thread.current.style.strokeDashoffset = `${L.len * (1 - draw)}`;
    }
    dots.current.forEach((d, i) => {
      if (!d || i >= n) return;
      const on = span(draw, i / n - 0.02, i / n + 0.06);
      d.style.opacity = on.toFixed(3);
      d.setAttribute("r", (on * 3.2).toFixed(2));
    });
    if (dayLabel.current) dayLabel.current.style.opacity = EASE_OUT(span(p, 0.7, 0.86)).toFixed(3);
    if (cue.current) cue.current.style.opacity = (1 - span(p, 0.02, 0.12)).toFixed(3);
  });

  return (
    <section ref={ref} className="ch ch-hero" aria-labelledby="hero-h">
      <div className="ch-stage">
        <div className="ch-copy ch-hero-copy">
          <h1 id="hero-h" className="ch-display">Your work, remembered.</h1>
          <p className="ch-lede">
            A daily log for engineers. Write a line when you fix, learn or decide something. Find it next month, next to your repos’ issues. Everything stays on this device.
          </p>
          <div className="ch-ctas">
            <button type="button" className="ch-btn" onClick={onOpenWorkspace}>Open your workspace</button>
            <a className="ch-btn ch-btn-2" href="#try">Try the sample memory</a>
          </div>
        </div>
        <div className="ch-scene" aria-hidden="true">
          <svg className="ch-thread-svg">
            <path ref={thread} className="ch-thread" />
            {DAY.map((_, i) => <circle key={i} ref={(el) => { dots.current[i] = el; }} className="ch-dot" r="0" />)}
          </svg>
          <p ref={dayLabel} className="ch-daylabel">Thursday, 13 November</p>
          {DAY.map((f, i) => (
            <div key={i} ref={(el) => { frags.current[i] = el; }} className="ch-abs">
              <Row f={f} />
            </div>
          ))}
        </div>
        <div ref={cue} className="ch-cue" aria-hidden="true"><span /></div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Steps that follow the scene (scroll-spy).                           */
/* ------------------------------------------------------------------ */

function Steps({ items, refs }: { items: { h: string; p: string }[]; refs: { current: (HTMLLIElement | null)[] } }) {
  return (
    <ol className="ch-steps">
      {items.map((s, i) => (
        <li key={s.h} ref={(el) => { refs.current[i] = el; }} className={i === 0 ? "is-on" : ""}>
          <h3>{s.h}</h3>
          <p>{s.p}</p>
        </li>
      ))}
    </ol>
  );
}

function spy(refs: (HTMLLIElement | null)[], p: number, cuts: number[]) {
  let at = 0;
  cuts.forEach((c, i) => { if (p >= c) at = i + 1; });
  refs.forEach((el, i) => el?.classList.toggle("is-on", i === at));
}

/* ------------------------------------------------------------------ */
/* Chapter 2: write it down.                                           */
/* ------------------------------------------------------------------ */

const WRITES: (Frag & { a: number; b: number })[] = [
  { kind: "decided", text: "Decided to cache search results in Redis for 10 minutes.", time: "Nov 4", a: 0.02, b: 0.26 },
  { kind: "learned", text: "Learned that Redis round trips cost 40 ms from the edge.", time: "Nov 9", a: 0.34, b: 0.56 },
  { kind: "decided", text: "Decided to cache in Edge Config instead of Redis.", time: "Nov 10", a: 0.64, b: 0.84 },
];
const EARLIER: Frag[] = [
  { kind: "worked", text: "Fixed the hydration mismatch on the pricing page", time: "Nov 3" },
  { kind: "task", text: "Regression test for the trailing-slash redirect loop", time: "Nov 2" },
  { kind: "learned", text: "revalidateTag only purges the Data Cache", time: "Nov 1" },
];
const KIND_WORD: Record<Kind, string> = { worked: "Worked on", learned: "Learned", decided: "Decided", task: "Task" };

export function WriteChapter() {
  const typed = useRef<HTMLSpanElement>(null);
  const composer = useRef<HTMLDivElement>(null);
  const chips = useRef<(HTMLSpanElement | null)[]>([]);
  const flying = useRef<(HTMLDivElement | null)[]>([]);
  const old = useRef<(HTMLDivElement | null)[]>([]);
  const strike = useRef<HTMLSpanElement>(null);
  const replacedTag = useRef<HTMLElement>(null);
  const link = useRef<SVGPathElement>(null);
  const steps = useRef<(HTMLLIElement | null)[]>([]);

  const ref = useScrollScene<HTMLElement>((p, size) => {
    const { w, mobile } = size;
    if (!w) return;
    const v = visual(size, 76 + 36 + 6 * 48);
    const rowH = mobile ? 40 : 48;
    const compH = mobile ? 64 : 76;
    const listTop = v.y + compH + (mobile ? 22 : 36);
    const rowW = v.w;
    spy(steps.current, p, [0.32, 0.62]);
    place(composer.current, v.x, v.y);
    if (composer.current) composer.current.style.width = `${rowW}px`;

    // Which line is being typed right now, and how much of it.
    let text = "";
    let kind: Kind | null = null;
    for (const wr of WRITES) {
      const tt = span(p, wr.a, wr.b - 0.06);
      if (p >= wr.a && p < wr.b) {
        text = wr.text.slice(0, Math.round(wr.text.length * tt));
        if (text.length >= KIND_WORD[wr.kind].length) kind = wr.kind;
      }
    }
    if (typed.current) typed.current.textContent = text;
    chips.current.forEach((c) => c?.classList.toggle("is-on", c.dataset.kind === kind));

    // Landed so far, eased, drives how far everything below has moved down.
    let landed = 0;
    WRITES.forEach((wr, i) => {
      const t = EASE_IO(span(p, wr.b - 0.06, wr.b + 0.06));
      landed += t;
      const el = flying.current[i];
      if (!el) return;
      // Lift out of the composer and swing into the top of the list.
      const from = { x: v.x + 18, y: v.y + compH / 2 - 14 };
      const to = { x: v.x, y: listTop };
      const fl = flight(from, to, { x: rowW * 0.55, y: -10 }, { x: rowW * 0.4, y: -40 }, t);
      // After landing, later notes push it down.
      const after = WRITES.slice(i + 1).reduce((s, n) => s + EASE_IO(span(p, n.b - 0.06, n.b + 0.06)), 0);
      const bank = Math.sin(fl.angle) * 0.05 * Math.sin(Math.PI * t);
      place(el, fl.x, fl.y + after * rowH, lerp(0.97, 1, t), bank, t <= 0 ? 0 : clamp01(t * 4));
      el.style.width = `${rowW}px`;
    });
    old.current.forEach((el, i) => {
      place(el, v.x, listTop + (i + landed) * rowH, 1, 0, 1 - span(i + landed, 4, 4.6));
      if (el) el.style.width = `${rowW}px`;
    });

    // When the new decision lands, the old one is struck through and linked.
    const replace = EASE_OUT(span(p, 0.86, 0.97));
    if (strike.current) strike.current.style.transform = `scaleX(${replace.toFixed(3)})`;
    if (replacedTag.current) replacedTag.current.style.opacity = replace.toFixed(3);
    flying.current[0]?.classList.toggle("is-replaced", replace > 0.5);
    if (link.current) {
      const yNew = listTop + rowH / 2 - 2, yOld = listTop + 2 * rowH + rowH / 2 - 2;
      const x = v.x - 6;
      link.current.setAttribute("d", `M${x} ${yNew} C${x - 34} ${yNew} ${x - 34} ${yOld} ${x} ${yOld}`);
      const L = 2 * rowH + 40;
      link.current.style.strokeDasharray = `${L}`;
      link.current.style.strokeDashoffset = `${L * (1 - replace)}`;
    }
  });

  return (
    <section id="write" ref={ref} className="ch ch-write" aria-labelledby="write-h">
      <div className="ch-stage">
        <div className="ch-copy">
          <h2 id="write-h" className="ch-display ch-h2">Write it down while it’s still true.</h2>
          <Steps
            refs={steps}
            items={[
              { h: "One line, as it happens.", p: "Type what you worked on, learned or decided. Enter saves it to this device." },
              { h: "The kind comes from how you write.", p: "Start with “Decided” or “Learned” and the note is filed that way. No forms." },
              { h: "Changing your mind keeps the history.", p: "A new decision replaces the old one. The old one stays, struck through and linked, so you can see why it changed." },
            ]}
          />
        </div>
        <div className="ch-scene" aria-hidden="true">
          <svg className="ch-thread-svg"><path ref={link} className="ch-link-arc" /></svg>
          <div ref={composer} className="ch-abs ch-composer">
            <div className="ch-kinds">
              {(["worked", "learned", "decided", "task"] as Kind[]).map((k, i) => (
                <span key={k} data-kind={k} ref={(el) => { chips.current[i] = el; }} className={`ch-chip k-${k}`}><KindGlyph kind={k} />{KIND_WORD[k]}</span>
              ))}
            </div>
            <div className="ch-typeline"><span ref={typed} /><i className="ch-caret" /></div>
          </div>
          {WRITES.map((f, i) => (
            <div key={i} ref={(el) => { flying.current[i] = el; }} className="ch-abs" style={{ opacity: 0 }}>
              {i === 0 ? (
                <div className={`ch-row k-${f.kind}`}>
                  <KindGlyph kind={f.kind} />
                  <span className="ch-row-t ch-struck">{f.text}<span ref={strike} className="ch-strike" /></span>
                  <em ref={replacedTag} className="ch-tag" style={{ opacity: 0 }}>Replaced</em>
                </div>
              ) : <Row f={f} />}
            </div>
          ))}
          {EARLIER.map((f, i) => (
            <div key={i} ref={(el) => { old.current[i] = el; }} className="ch-abs ch-earlier"><Row f={f} /></div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Chapter 3: find it again (the page floods to paper).                */
/* ------------------------------------------------------------------ */

interface WallItem { kind: Kind | "issue"; text: string; hit?: 0 | 1 | 2 }
const WALL: WallItem[] = [
  { kind: "worked", text: "Hydration mismatch on pricing" },
  { kind: "issue", text: "next.js#101709 Static export with Cache Components" },
  { kind: "decided", text: "Cache search results in Redis for 10 minutes", hit: 1 },
  { kind: "learned", text: "revalidateTag only purges the Data Cache" },
  { kind: "task", text: "Trailing-slash redirect loop test" },
  { kind: "issue", text: "next.js#101705 Proxy rewrite status on RSC" },
  { kind: "learned", text: "Redis round trips cost 40 ms from the edge", hit: 2 },
  { kind: "worked", text: "Turbopack memory at 3,000 routes" },
  { kind: "decided", text: "Pin Node 20 in CI" },
  { kind: "issue", text: "next.js#101714 pr-status: flag finished runs" },
  { kind: "decided", text: "Cache in Edge Config instead of Redis", hit: 0 },
  { kind: "learned", text: "Server Actions run with the user’s cookies" },
  { kind: "task", text: "Flaky Playwright snapshot on Windows" },
  { kind: "worked", text: "Feature flags to Edge Config" },
  { kind: "issue", text: "next.js#101703 Rewrite status on cached pages" },
  { kind: "decided", text: "OpenAPI types at build time" },
  { kind: "learned", text: "ERR_REQUIRE_ESM from a transitive dep" },
  { kind: "issue", text: "next.js#101708 Metadata parents without IDs" },
];
const QUERY = "why did we stop using Redis?";

export function FindChapter() {
  const flood = useRef<HTMLDivElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLDivElement>(null);
  const q = useRef<HTMLSpanElement>(null);
  const items = useRef<(HTMLDivElement | null)[]>([]);
  const receipt = useRef<HTMLParagraphElement>(null);
  const steps = useRef<(HTMLLIElement | null)[]>([]);
  const grid = useRef<{ key: string; pos: Vec2[]; cw: number } | null>(null);

  const ref = useScrollScene<HTMLElement>((p, size) => {
    const { w, h, mobile } = size;
    if (!w) return;
    const v = visual(size, 84 + 9 * 42);
    spy(steps.current, p, [0.42, 0.7]);

    // The flood: a circle growing out of the search field until it covers
    // the stage. Radius eased so it leaves quickly and settles.
    const fc = { x: v.x + v.w * 0.5, y: v.y + 28 };
    const R = Math.hypot(Math.max(fc.x, w - fc.x), Math.max(fc.y, h - fc.y));
    const fr = EASE_OUT(span(p, 0, 0.16));
    if (flood.current) flood.current.style.clipPath = `circle(${(fr * R).toFixed(1)}px at ${fc.x.toFixed(0)}px ${fc.y.toFixed(0)}px)`;
    const shown = EASE_OUT(span(p, 0.08, 0.2));
    if (copy.current) { copy.current.style.opacity = shown.toFixed(3); copy.current.style.transform = `translateY(${((1 - shown) * 16).toFixed(1)}px)`; }

    place(field.current, v.x, v.y, lerp(0.97, 1, shown), 0, shown);
    if (field.current) field.current.style.width = `${v.w}px`;
    const typedN = Math.round(QUERY.length * span(p, 0.16, 0.32));
    if (q.current) q.current.textContent = QUERY.slice(0, typedN);

    // The wall of everything: notes and issues, in a loose grid.
    const cols = 2;
    const key = `${w}x${h}`;
    if (grid.current?.key !== key) {
      const r = rng(11);
      const cw = (v.w - (cols - 1) * 10) / cols;
      const rows = Math.ceil(WALL.length / cols);
      const top = v.y + 84;
      const rh = mobile ? Math.min(36, (v.h - 96) / rows) : 42;
      grid.current = {
        key, cw,
        pos: WALL.map((_, i) => ({ x: v.x + (i % cols) * (cw + 10) + (r() - 0.5) * 6, y: top + Math.floor(i / cols) * rh + (r() - 0.5) * 6 })),
      };
    }
    const G = grid.current!;
    const scan = span(p, 0.3, 0.4);
    const lift = span(p, 0.4, 0.62);
    // The lexical score ranks the old Redis decision first; the replacement
    // rule then swaps the current decision above it.
    const swap = EASE_IO(span(p, 0.66, 0.8));
    const slotH = mobile ? 50 : 56;
    const slots = (rank: number) => ({ x: v.x, y: v.y + 84 + rank * slotH });
    WALL.forEach((it, i) => {
      const el = items.current[i];
      if (!el) return;
      const at = G.pos[i]!;
      const appear = EASE_OUT(span(p, 0.12 + (i % 7) * 0.012, 0.24 + (i % 7) * 0.012));
      if (it.hit === undefined) {
        const gone = EASE_IO(span(lift, 0, 0.6));
        place(el, at.x, at.y + gone * 14, lerp(0.97, 1, appear), 0, appear * lerp(1, 0, gone) * lerp(1, 0.45, scan));
        el.style.width = `${G.cw}px`;
        return;
      }
      el.classList.toggle("is-hit", scan > 0.5);
      // Before the swap: hit 1 (old decision) is first, hit 0 second.
      const before = it.hit === 1 ? 0 : it.hit === 0 ? 1 : 2;
      const after = it.hit;
      const t = EASE_IO(span(lift, it.hit * 0.12, 0.7 + it.hit * 0.1));
      const s1 = slots(before);
      const fl = flight(at, s1, { x: 0, y: -60 }, { x: -80, y: 0 }, t);
      let x = fl.x, y = fl.y;
      if (it.hit !== 2 && swap > 0) {
        // Swap on two mirrored arcs so the rows pass each other instead of colliding.
        const s2 = slots(after);
        const dir = it.hit === 0 ? -1 : 1;
        const sw = flight(s1, s2, { x: 60 * -dir, y: 0 }, { x: 60 * -dir, y: 0 }, swap);
        x = sw.x; y = sw.y;
      }
      const width = lerp(G.cw, v.w, EASE_OUT(t));
      place(el, x, y, 1, Math.sin(fl.angle) * 0.06 * Math.sin(Math.PI * t), appear);
      el.style.width = `${width.toFixed(1)}px`;
      el.classList.toggle("is-result", t > 0.6);
      if (it.hit === 1) el.classList.toggle("is-replaced", swap > 0.5);
      if (it.hit === 0) el.classList.toggle("is-current", swap > 0.5);
    });
    if (receipt.current) {
      const r = EASE_OUT(span(p, 0.82, 0.92));
      place(receipt.current, v.x, slots(3).y + 8, 1, 0, r);
    }
  });

  return (
    <section id="find" ref={ref} className="ch ch-find" aria-labelledby="find-h">
      <div className="ch-stage">
        <div ref={flood} className="ch-flood" />
        <div ref={copy} className="ch-copy" style={{ opacity: 0 }}>
          <h2 id="find-h" className="ch-display ch-h2">Find it again, current answer first.</h2>
          <Steps
            refs={steps}
            items={[
              { h: "Ask the way you’d ask a teammate.", p: "Search reads identifiers, versions and stack traces as code, and matches meaning with a small model that runs in your browser." },
              { h: "Your notes and your issues, together.", p: "Connect a GitHub repo and its issues and pull requests land in the same results as your notes." },
              { h: "Old decisions never outrank new ones.", p: "Keyword scores liked the Redis note best. It was replaced, so the decision that replaced it goes first." },
            ]}
          />
        </div>
        <div className="ch-scene" aria-hidden="true">
          <div ref={field} className="ch-abs ch-field" style={{ opacity: 0 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="7" cy="7" r="5" /><path d="m11 11 3.5 3.5" strokeLinecap="round" /></svg>
            <span ref={q} /><i className="ch-caret" />
          </div>
          {WALL.map((it, i) => (
            <div key={i} ref={(el) => { items.current[i] = el; }} className={`ch-abs ch-wall k-${it.kind}`} style={{ opacity: 0 }}>
              <KindGlyph kind={it.kind} />
              <span className="ch-row-t">{it.text}</span>
              {it.hit === 1 && <em className="ch-tag ch-tag-old">Replaced</em>}
              {it.hit === 0 && <em className="ch-tag ch-tag-now">Current</em>}
            </div>
          ))}
          <p ref={receipt} className="ch-abs ch-receipt" style={{ opacity: 0 }}>3 matches in 0.04 ms, on this device</p>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Chapter 4: what's next.                                             */
/* ------------------------------------------------------------------ */

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const OPEN: { kind: Kind; text: string; day: number; rank: number; why: string }[] = [
  { kind: "task", text: "Trailing-slash redirect loop test", day: 3, rank: 0, why: "Touches yesterday’s middleware work" },
  { kind: "decided", text: "Self-host fonts instead of next/font/google?", day: 2, rank: 1, why: "Unresolved for 2 days" },
  { kind: "task", text: "Flaky Playwright snapshot on Windows", day: 3, rank: 2, why: "Skipped once" },
  { kind: "decided", text: "OpenAPI types at build time (proposed)", day: 1, rank: 3, why: "Waiting 4 days" },
];
const DONE = [0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 4, 4];

export function NextChapter() {
  const cols = useRef<(HTMLDivElement | null)[]>([]);
  const open = useRef<(HTMLDivElement | null)[]>([]);
  const whys = useRef<(HTMLElement | null)[]>([]);
  const card = useRef<HTMLDivElement>(null);
  const steps = useRef<(HTMLLIElement | null)[]>([]);

  const ref = useScrollScene<HTMLElement>((p, size) => {
    const { w, mobile } = size;
    if (!w) return;
    const v = visual(size, 170 + 40 + 4 * 54 + 52);
    spy(steps.current, p, [0.36, 0.68]);
    const colW = (v.w - 4 * 8) / 5;
    const weekH = mobile ? 120 : 170;
    const weekY = v.y;
    cols.current.forEach((c, i) => {
      place(c, v.x + i * (colW + 8), weekY);
      if (c) { c.style.width = `${colW}px`; c.style.height = `${weekH}px`; }
    });
    const listY = weekY + weekH + (mobile ? 24 : 40);
    const rowH = mobile ? 46 : 54;
    OPEN.forEach((o, i) => {
      const el = open.current[i];
      if (!el) return;
      const from = { x: v.x + o.day * (colW + 8) + 6, y: weekY + 40 + (i % 2) * 34 };
      const to = { x: v.x, y: listY + o.rank * rowH + (o.rank > 0 ? (mobile ? 36 : 52) * EASE_IO(span(p, 0.68, 0.84)) : 0) };
      const a = 0.12 + o.rank * 0.07;
      const t = EASE_IO(span(p, a, a + 0.3));
      const fl = flight(from, to, { x: 0, y: -50 }, { x: -60, y: -30 }, t);
      place(el, fl.x, fl.y, 1, Math.sin(fl.angle) * 0.05 * Math.sin(Math.PI * t), 1);
      if (el) el.style.width = `${lerp(colW - 12, v.w, EASE_OUT(t)).toFixed(1)}px`;
      el.classList.toggle("is-out", t > 0.5);
      const why = whys.current[i];
      if (why) why.style.opacity = EASE_OUT(span(p, a + 0.28, a + 0.36)).toFixed(3);
    });
    // The top item opens into the card you act on.
    const c = EASE_OUT(span(p, 0.7, 0.86));
    if (card.current) {
      place(card.current, v.x, listY + rowH - 6, lerp(0.97, 1, c), 0, c);
      card.current.style.width = `${v.w}px`;
    }
  });

  return (
    <section id="next" ref={ref} className="ch ch-next" aria-labelledby="next-h">
      <div className="ch-stage">
        <div className="ch-copy">
          <h2 id="next-h" className="ch-display ch-h2">See what’s next, and why.</h2>
          <Steps
            refs={steps}
            items={[
              { h: "Only what’s still open.", p: "Tasks you haven’t done and decisions nobody has made yet. Everything finished stays in the log." },
              { h: "Ranked by rules you can read.", p: "Age, whether it touches what you worked on yesterday, and whether you skipped it. Each item says which rule put it there." },
              { h: "You pick. Nothing is decided for you.", p: "Work on it, or skip it for today. No model guesses on your behalf." },
            ]}
          />
        </div>
        <div className="ch-scene" aria-hidden="true">
          {DAYS.map((d, i) => (
            <div key={d} ref={(el) => { cols.current[i] = el; }} className="ch-abs ch-daycol">
              <span>{d}</span>
              {DONE.filter((x) => x === i).map((_, j) => <i key={j} />)}
            </div>
          ))}
          {OPEN.map((o, i) => (
            <div key={i} ref={(el) => { open.current[i] = el; }} className={`ch-abs ch-open k-${o.kind}`}>
              <KindGlyph kind={o.kind} />
              <span className="ch-row-t">{o.text}</span>
              <em ref={(el) => { whys.current[i] = el; }} className="ch-why" style={{ opacity: 0 }}>{o.why}</em>
            </div>
          ))}
          <div ref={card} className="ch-abs ch-actcard" style={{ opacity: 0 }}>
            <span className="ch-btn ch-btn-s">Work on this</span>
            <span className="ch-btn ch-btn-s ch-btn-ghost">Skip for today</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Chapter 5: the measured number, Wispr-style.                        */
/* ------------------------------------------------------------------ */

export function NumberChapter() {
  const base = BENCH.rows[0]!;
  const ours = BENCH.rows[2]!;
  const nums = useRef<(HTMLSpanElement | null)[]>([]);
  const bars = useRef<(HTMLElement | null)[]>([]);
  const vals = [base.r10, ours.r10];
  const ref = useScrollScene<HTMLElement>((p) => {
    vals.forEach((v, i) => {
      const t = EASE_OUT(span(p, 0.08 + i * 0.16, 0.5 + i * 0.16));
      const val = v * t;
      if (nums.current[i]) nums.current[i]!.textContent = `${Math.round(val * 100)}%`;
      if (bars.current[i]) bars.current[i]!.style.transform = `scaleX(${val.toFixed(4)})`;
    });
  });
  return (
    <section ref={ref} className="ch ch-number" aria-labelledby="num-h">
      <div className="ch-stage ch-number-stage">
        <h2 id="num-h" className="ch-display ch-h2 ch-center">
          When an issue has been filed before, how often does search find the original?
        </h2>
        <div className="ch-duel">
          <div className="ch-duel-col">
            <span ref={(el) => { nums.current[0] = el; }} className="ch-big">{Math.round(base.r10 * 100)}%</span>
            <span className="ch-bar"><i ref={(el) => { bars.current[0] = el; }} /></span>
            <p>Plain keyword search</p>
          </div>
          <div className="ch-duel-col ours">
            <span ref={(el) => { nums.current[1] = el; }} className="ch-big">{Math.round(ours.r10 * 100)}%</span>
            <span className="ch-bar"><i ref={(el) => { bars.current[1] = el; }} /></span>
            <p>memoRABLE, semantic search in your browser</p>
          </div>
        </div>
        <p className="ch-fine">
          {BENCH.queries} duplicate issues from VS Code and Next.js that maintainers linked by hand. Found means the original is in the top 10, searching only issues filed before it.{" "}
          <a href="#proof">How it reads engineering text</a>
        </p>
      </div>
    </section>
  );
}

