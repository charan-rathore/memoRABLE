"use client";

import { Fragment, useRef, type ReactNode } from "react";
import { span } from "@/motion/curves";
import type { Beat, Story } from "./plan";
import { curtain, likeSource, OUT, rise, set, slot } from "./motion";
import { useChapter, type Clock } from "./use-chapter";

/**
 * A document, told as a story you scroll through. Each beat from the planner
 * (plan.ts) is a chapter: a colour field that arrives over the last one, a
 * line set word by word, one big phrase, and the one chart that says it.
 * Everything on a stage is also plain text in reading order, so it reads the
 * same to a screen reader, in print and with motion turned off.
 */
export function StoryView({ story, toolbar }: { story: Story; toolbar?: ReactNode }) {
  return (
    <div className="sd">
      {toolbar}
      {story.beats.map((b, i) => <Chapter key={i} beat={b} index={i} total={story.beats.length} />)}
    </div>
  );
}

/* --------------------------------- text bits --------------------------------- */

function Words({ text, className }: { text: string; className?: string }) {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <span className={className}>
      {words.map((w, i) => (
        <Fragment key={i}>
          <span className="sd-w" data-w>{w}</span>
          {i < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </span>
  );
}

/** A big phrase, letter by letter in masks; a trailing full stop becomes the accent dot. */
function Big({ text, level = 2 }: { text: string; level?: 1 | 2 }) {
  const dot = text.endsWith(".");
  const body = dot ? text.slice(0, -1) : text;
  const words = body.split(" ");
  const H = level === 1 ? "h1" : "h2";
  return (
    <H className={`sd-big${level === 1 && text.length > 42 ? " is-long" : ""}`} aria-label={text}>
      {words.map((w, wi) => (
        <Fragment key={wi}>
          <span className="sd-mask" aria-hidden="true">
            {[...w].map((c, ci) => <span key={ci} className="sd-l" data-l>{c}</span>)}
            {dot && wi === words.length - 1 ? <span className="sd-l sd-dot" data-l data-dot>.</span> : null}
          </span>
          {wi < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </H>
  );
}

const q = <E extends Element = HTMLElement>(root: Element, sel: string) => root.querySelectorAll<E & HTMLElement>(sel);

/* ---------------------------------- chapter ---------------------------------- */

const SCREENS: Record<Beat["kind"], number> = { open: 2.6, numbers: 3.2, path: 3, choices: 3, pressure: 3, next: 2.2, close: 1.6, map: 3.2 };

function Chapter({ beat, index, total }: { beat: Beat; index: number; total: number }) {
  const cache = useRef<Map<string, NodeListOf<HTMLElement>>>(new Map());
  const ref = useChapter<HTMLElement>((c) => {
    const root = ref.current;
    if (!root) return;
    const all = (sel: string) => {
      let v = cache.current.get(sel);
      if (!v) { v = q(root, sel); cache.current.set(sel, v); }
      return v;
    };
    const stage = root.firstElementChild as HTMLElement;
    stage.style.clipPath = index === 0 ? "none" : curtain(c.enter, c.w);
    // The build runs while the stage is pinned (the first chapter plays its opening on load).
    // The heading sets while the field is still arriving, so a new page is never blank;
    // everything below it builds once the stage is pinned.
    const p = c.p;
    const head = Math.max(p / 0.3, (c.enter - 0.5) / 0.5) * 0.3;
    rise(all("[data-eyebrow] [data-w]"), head, 0, 0.08, 0.6);
    set(all("[data-l]"), head, 0.02, 0.2);
    rise(all("[data-line] [data-w]"), Math.max(head, p), 0.12, 0.3);
    DRAW[beat.kind](root, c, p, all);
  }, index === 0 ? { intro: 0.34 } : {});

  return (
    <section
      ref={ref}
      className={`sd-ch sd-${beat.field} sd-k-${beat.kind}`}
      style={{ height: `${SCREENS[beat.kind] * 100}vh`, zIndex: index + 1 }}
      aria-label={`${index + 1} of ${total}: ${"big" in beat ? beat.big : beat.kind === "open" ? beat.title : beat.line}`}
    >
      <div className="sd-stage">
        <p className="sd-eyebrow" data-eyebrow><Words text={`> ${beat.eyebrow}`} /></p>
        <BeatBody beat={beat} />
        <p className="sd-folio" aria-hidden="true">{String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</p>
      </div>
    </section>
  );
}

type All = (sel: string) => NodeListOf<HTMLElement>;
const DRAW: Record<Beat["kind"], (root: HTMLElement, c: Clock, p: number, all: All) => void> = {
  open: (_r, _c, p, all) => {
    rise(all("[data-hook] [data-w]"), p, 0.34, 0.62);
    fade(all("[data-byline]"), p, 0.6, 0.72);
  },
  numbers: (_r, _c, p, all) => {
    const cols = all("[data-measure]");
    cols.forEach((col, i) => {
      const [a, b] = slot(i, cols.length, 0.28, 0.86, 0.35);
      const lid = OUT(span(p, a, a + (b - a) * 0.45));
      const grow = OUT(span(p, a + (b - a) * 0.3, b));
      const lidEl = col.querySelector<HTMLElement>("[data-lid]");
      if (lidEl) {
        lidEl.style.transform = `translate3d(0, ${(-70 * lid).toFixed(2)}%, 0) rotate(${(-7 * lid).toFixed(2)}deg)`;
        lidEl.style.opacity = (1 - OUT(span(lid, 0.35, 1))).toFixed(3);
      }
      const now = Number(col.dataset.now), before = Number(col.dataset.before), max = Number(col.dataset.max);
      const v = Number.isFinite(before) ? before + (now - before) * grow : now * grow;
      const out = col.querySelector<HTMLElement>("[data-value]");
      if (out && Number.isFinite(now)) out.textContent = grow >= 1 ? (col.dataset.shown ?? "") : likeSource(col.dataset.shown ?? "", v);
      const nowBar = col.querySelector<HTMLElement>("[data-bar-now]");
      const beforeBar = col.querySelector<HTMLElement>("[data-bar-before]");
      if (nowBar && max > 0) nowBar.style.transform = `scaleY(${((v / max) * Math.min(1, grow * 1.4)).toFixed(4)})`;
      if (beforeBar && max > 0) beforeBar.style.transform = `scaleY(${((before / max) * OUT(span(p, a + (b - a) * 0.2, a + (b - a) * 0.6))).toFixed(4)})`;
      fade(col.querySelectorAll("[data-after]"), p, b - (b - a) * 0.25, b);
    });
  },
  path: (root, _c, p, all) => {
    const line = root.querySelector<SVGPathElement>("[data-track]");
    const len = Number(line?.dataset.len ?? 0);
    const t = OUT(span(p, 0.28, 0.86));
    if (line) line.style.strokeDashoffset = (len * (1 - t)).toFixed(1);
    const nodes = all("[data-phase]");
    nodes.forEach((n, i) => {
      const at = nodes.length > 1 ? i / (nodes.length - 1) : 0;
      const k = OUT(span(t, at - 0.04, at + 0.14));
      n.style.opacity = (k > 0.01 ? 1 : 0).toString();
      n.style.transform = `translate3d(0, ${(18 * (1 - k)).toFixed(2)}px, 0)`;
      const dotEl = n.querySelector<HTMLElement>("[data-node]");
      if (dotEl) dotEl.style.transform = `scale(${OUT(span(t, at - 0.02, at + 0.06)).toFixed(3)})`;
    });
    all("[data-need]").forEach((a) => {
      const i = Number(a.dataset.need);
      const at = nodes.length > 1 ? i / (nodes.length - 1) : 0;
      const k = OUT(span(t, at, at + 0.12));
      const L = Number(a.dataset.len ?? 0);
      (a as unknown as SVGPathElement).style.strokeDashoffset = (L * (1 - k)).toFixed(1);
    });
  },
  choices: (root, _c, p, all) => {
    const rows = all("[data-choice]");
    rows.forEach((r, i) => {
      const [a, b] = slot(i, rows.length, 0.28, 0.82, 0.3);
      const k = OUT(span(p, a, a + (b - a) * 0.6));
      r.style.opacity = (k > 0.01 ? Math.min(1, k * 1.4) : 0).toFixed(3);
      r.style.transform = `translate3d(0, ${(40 * (1 - k)).toFixed(1)}px, 0)`;
      const stamp = r.querySelector<HTMLElement>("[data-stamp]");
      if (stamp) { const s = OUT(span(p, a + (b - a) * 0.45, b)); stamp.style.transform = `rotate(${(-8 + 6 * s).toFixed(2)}deg) scale(${(1.6 - 0.6 * s).toFixed(3)})`; stamp.style.opacity = (s > 0.01 ? 1 : 0).toString(); }
      r.querySelectorAll<HTMLElement>("[data-work]").forEach((w) => {
        const s = OUT(span(p, a + (b - a) * 0.55, b + 0.04));
        w.style.opacity = s.toFixed(3);
        w.style.transform = `translate3d(${(-24 * (1 - s)).toFixed(1)}px, 0, 0)`;
      });
      r.querySelectorAll<HTMLElement>("[data-wire]").forEach((w) => { w.style.transform = `scaleX(${OUT(span(p, a + (b - a) * 0.4, a + (b - a) * 0.8)).toFixed(3)})`; });
    });
    void root;
  },
  pressure: (root, _c, p, all) => {
    const steps = all("[data-chain]");
    steps.forEach((s, i) => {
      const [a] = slot(i, steps.length, 0.28, 0.62, 0.2);
      const k = OUT(span(p, a, a + 0.08));
      s.style.opacity = (k > 0.01 ? k : 0).toFixed(3);
      s.style.transform = `translate3d(0, ${(24 * (1 - k)).toFixed(1)}px, 0)`;
    });
    all("[data-arrow]").forEach((ar, i) => {
      const [a] = slot(i + 1, steps.length, 0.28, 0.62, 0.2);
      ar.style.transform = `scaleX(${OUT(span(p, a - 0.06, a + 0.02)).toFixed(3)})`;
    });
    const patch = root.querySelector<HTMLElement>("[data-patch]");
    if (patch) { const k = OUT(span(p, 0.62, 0.74)); patch.style.opacity = (k > 0.01 ? 1 : 0).toString(); patch.style.transform = `translate3d(0, ${(-30 * (1 - k)).toFixed(1)}px, 0) rotate(${(-2.5 + 1.5 * k).toFixed(2)}deg)`; }
    const others = all("[data-other]");
    others.forEach((o, i) => { const [a, b] = slot(i, others.length, 0.72, 0.92, 0.3); const k = OUT(span(p, a, b)); o.style.opacity = k.toFixed(3); o.style.transform = `translate3d(0, ${(16 * (1 - k)).toFixed(1)}px, 0)`; });
  },
  next: (_r, _c, p, all) => {
    const rows = all("[data-task]");
    rows.forEach((r, i) => {
      const [a, b] = slot(i, rows.length, 0.3, 0.8, 0.3);
      const k = OUT(span(p, a, b));
      r.style.opacity = (k > 0.01 ? Math.min(1, k * 1.5) : 0).toFixed(3);
      r.style.transform = `translate3d(${(-30 * (1 - k)).toFixed(1)}px, 0, 0)`;
      const tick = r.querySelector<SVGPathElement>("[data-tick]");
      if (tick) tick.style.strokeDashoffset = (24 * (1 - OUT(span(p, b - 0.04, b + 0.06)))).toFixed(2);
    });
  },
  map: (_r, _c, p, all) => {
    fade(all("[data-mapq]"), p, 0.3, 0.42);
    const wires = all("[data-wire-path]");
    const items = all("[data-mapf]");
    for (let i = 0; i < wires.length; i++) {
      const a = 0.4 + i * 0.07;
      (wires[i] as HTMLElement).style.strokeDashoffset = (1 - OUT(span(p, a, a + 0.12))).toFixed(3);
    }
    for (let i = 0; i < items.length; i++) fade([items[i]!], p, 0.46 + i * 0.07, 0.58 + i * 0.07);
    fade(all("[data-maploose]"), p, 0.82, 0.92);
  },
  close: (_r, _c, p, all) => {
    fade(all("[data-receipt]"), p, 0.4, 0.6);
  },
};

function fade(els: ArrayLike<HTMLElement | Element>, p: number, a: number, b: number) {
  for (let i = 0; i < els.length; i++) {
    const k = OUT(span(p, a, b));
    const s = (els[i] as HTMLElement).style;
    s.opacity = k.toFixed(3);
    s.transform = `translate3d(0, ${(12 * (1 - k)).toFixed(1)}px, 0)`;
  }
}

/* ----------------------------------- bodies ----------------------------------- */

function BeatBody({ beat }: { beat: Beat }) {
  switch (beat.kind) {
    case "open":
      return (
        <div className="sd-open">
          <Big text={beat.title} level={1} />
          <p className="sd-line" data-line><Words text={beat.line} /></p>
          {beat.hook && <p className="sd-hook" data-hook><Words text={beat.hook} /></p>}
          {beat.byline && <p className="sd-note" data-byline>{beat.byline}</p>}
        </div>
      );
    case "numbers":
      return (
        <div className="sd-grid">
          <div className="sd-copy">
            <Big text={beat.big} />
            <p className="sd-line" data-line><Words text={beat.line} /></p>
          </div>
          <Measures beat={beat} />
        </div>
      );
    case "path":
      return (
        <div className="sd-stack">
          <div className="sd-copy">
            <Big text={beat.big} />
            <p className="sd-line" data-line><Words text={beat.line} /></p>
          </div>
          <Path beat={beat} />
        </div>
      );
    case "choices":
      return (
        <div className="sd-grid">
          <div className="sd-copy">
            <Big text={beat.big} />
            <p className="sd-line" data-line><Words text={beat.line} /></p>
          </div>
          <ol className="sd-choices">
            {beat.choices.map((c, i) => (
              <li key={i} className="sd-choice" data-choice>
                <div className="sd-choice-main">
                  <span className={`sd-stamp ${c.status === "approved" || c.stamp ? "is-done" : ""}`} data-stamp>{c.stamp ?? (c.status === "approved" ? "decided" : c.status ?? "noted")}</span>
                  <p className="sd-choice-text">{c.text}</p>
                  {c.because && <p className="sd-note">because {c.because.replace(/^[A-Z]/, (x) => x.toLowerCase())}</p>}
                </div>
                {c.work.length > 0 && (
                  <div className="sd-work">
                    <span className="sd-wire" data-wire aria-hidden="true" />
                    <ul>
                      {c.work.map((w, j) => (
                        <li key={j} data-work>
                          <span className="sd-work-task">{w.task}</span>
                          <span className="sd-note">{[w.owner, w.due].filter(Boolean).join(" · ")}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
      );
    case "map": {
      const n = beat.findings.length;
      return (
        <div className="sd-stack">
          <div className="sd-copy">
            <Big text={beat.big} />
            <p className="sd-line" data-line><Words text={beat.line} /></p>
          </div>
          <div className="sd-map">
            <div className="sd-map-q" data-mapq>
              <span className="sd-note">the question</span>
              <p>{beat.question}</p>
              {beat.loose.length > 0 && <p className="sd-map-loose" data-maploose>{beat.loose.map((m, i) => <span key={i} className="sd-chip">{m}</span>)}</p>}
            </div>
            <svg className="sd-map-wires" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {beat.findings.map((_, i) => {
                const y = n === 1 ? 50 : 8 + (84 * i) / (n - 1);
                return <path key={i} data-wire-path pathLength={1} d={`M0 50 C 55 50, 45 ${y}, 100 ${y}`} style={{ strokeDasharray: 1, strokeDashoffset: 1 }} />;
              })}
            </svg>
            <ol className="sd-map-f">
              {beat.findings.map((f, i) => (
                <li key={i} data-mapf>
                  <p>{f.text}</p>
                  {f.measured.length > 0 && <p className="sd-map-m">{f.measured.map((m, j) => <span key={j} className="sd-chip">{m}</span>)}</p>}
                </li>
              ))}
            </ol>
          </div>
        </div>
      );
    }
    case "pressure": {
      const [top, ...others] = beat.risks;
      return (
        <div className="sd-stack">
          <div className="sd-copy">
            <Big text={beat.big} />
            <p className="sd-line" data-line><Words text={beat.line} /></p>
          </div>
          {top && (
            <div className="sd-chain">
              {top.because && <><div className="sd-link" data-chain><span className="sd-note">because</span><p>{top.because}</p></div><span className="sd-arrow" data-arrow aria-hidden="true" /></>}
              <div className="sd-link is-risk" data-chain><span className="sd-note">{top.severity ? `${top.severity} risk` : "risk"}</span><p>{top.risk}</p></div>
              {top.consequence && <><span className="sd-arrow" data-arrow aria-hidden="true" /><div className="sd-link" data-chain><span className="sd-note">left alone</span><p>{top.consequence}</p></div></>}
              {top.mitigation && <p className="sd-patch" data-patch><span className="sd-note">the plan</span> {top.mitigation}</p>}
            </div>
          )}
          {others.length > 0 && (
            <ul className="sd-others">
              {others.map((r, i) => (
                <li key={i} data-other>
                  <span className="sd-sev" aria-label={r.severity ? `${r.severity} severity` : "severity not stated"}>{r.severity === "high" ? "●●●" : r.severity === "medium" ? "●●○" : r.severity === "low" ? "●○○" : "○○○"}</span>
                  <span>{r.risk}</span>
                  {r.mitigation && <span className="sd-note">{r.mitigation}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }
    case "next":
      return (
        <div className="sd-grid">
          <div className="sd-copy">
            <Big text={beat.big} />
            <p className="sd-line" data-line><Words text={beat.line} /></p>
          </div>
          <ul className="sd-tasks">
            {beat.tasks.map((t, i) => (
              <li key={i} data-task>
                <svg viewBox="0 0 24 24" className="sd-box" aria-hidden="true">
                  <rect x="2" y="2" width="20" height="20" rx="5" />
                  {t.status === "ready" || t.status === "done" ? <path d="M6.5 12.5l3.5 3.5 7.5-8" data-tick style={{ strokeDasharray: 24, strokeDashoffset: 24 }} /> : null}
                </svg>
                <span className="sd-task">{t.task}</span>
                <span className="sd-note">{[t.owner, t.due, t.status].filter(Boolean).join(" · ")}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    case "close":
      return (
        <div className="sd-close">
          <p className="sd-closing" data-line><Words text={beat.line} /></p>
          <p className="sd-note" data-receipt>
            from {beat.source} · {beat.blocks} memories · every line above is the document&apos;s own, nothing was added
          </p>
        </div>
      );
  }
}

function Measures({ beat }: { beat: Extract<Beat, { kind: "numbers" }> }) {
  if (beat.chart === "words") {
    return (
      <ul className="sd-words">
        {beat.measures.map((m, i) => (
          <li key={i} data-measure data-shown={m.shown}><span data-lid className="sd-lid" aria-hidden="true" /><b>{m.shown}</b> <span className="sd-note">{m.label}{m.delta ? ` · ${m.delta}` : ""}</span></li>
        ))}
      </ul>
    );
  }
  return (
    <div className="sd-measures" role="list">
      {beat.measures.map((m, i) => {
        // Rule 3: each measure on its own scale, from zero.
        const max = Math.max(m.now ?? 0, m.before ?? 0) * 1.08;
        return (
          <div key={i} className="sd-measure" role="listitem" data-measure data-now={m.now ?? ""} data-before={m.before ?? ""} data-max={max} data-shown={m.shown}>
            <div className="sd-cloche">
              <span className="sd-lid" data-lid aria-hidden="true" />
              <div className="sd-bars" aria-hidden="true">
                <span className="sd-bar is-before" data-bar-before />
                <span className="sd-bar is-now" data-bar-now />
              </div>
            </div>
            <p className="sd-value" data-value>{m.shown}</p>
            <p className="sd-label">{m.label}</p>
            {m.delta && <p className={`sd-delta is-${m.trend ?? "flat"}`} data-after>{m.trend === "down" ? "↓" : m.trend === "up" ? "↑" : "→"} {m.delta}</p>}
            {m.implication && <p className="sd-impl" data-after>{m.implication}</p>}
          </div>
        );
      })}
    </div>
  );
}

function Path({ beat }: { beat: Extract<Beat, { kind: "path" }> }) {
  const n = beat.phases.length;
  const W = 1000, Y = 70;
  // Points sit at the centres of the label columns below them.
  const x = (i: number) => ((i + 0.5) * W) / n;
  const lastDone = beat.phases.reduce((acc, ph, i) => (ph.state === "shipped" || ph.state === "done" ? i : acc), -1);
  const len = x(n - 1) - x(0);
  return (
    <div className="sd-path">
      <svg viewBox={`0 0 ${W} 120`} preserveAspectRatio="none" aria-hidden="true" className="sd-track-svg">
        <path d={`M${x(0)} ${Y} H${x(n - 1)}`} className="sd-track-ghost" />
        <path d={`M${x(0)} ${Y} H${x(n - 1)}`} className="sd-track" data-track data-len={len} style={{ strokeDasharray: len, strokeDashoffset: len }} />
        {beat.phases.map((ph, i) => {
          if (ph.needs === null) return null;
          const x0 = x(ph.needs), x1 = x(i), mid = (x0 + x1) / 2;
          const d = `M${x0} ${Y - 12} Q ${mid} ${Y - 70} ${x1} ${Y - 12}`;
          const L = Math.round(Math.hypot(x1 - x0, 58) * 1.25);
          return <path key={i} d={d} className="sd-need" data-need={i} data-len={L} style={{ strokeDasharray: L, strokeDashoffset: L }} />;
        })}
      </svg>
      <ol className="sd-phases" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {beat.phases.map((ph, i) => (
          <li key={i} data-phase className={`is-${ph.state ?? "unstated"} ${i <= lastDone ? "is-past" : ""}`}>
            <span className="sd-node" data-node aria-hidden="true" />
            <span className="sd-note">{ph.date}{ph.state ? ` · ${ph.state}` : ""}</span>
            <p className="sd-phase-title">{ph.title}</p>
            {ph.produces && <p className="sd-note">→ {ph.produces.replace(/^[A-Z]/, (c) => c.toLowerCase())}</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}
