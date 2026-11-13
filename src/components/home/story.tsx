"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { analyze } from "@/search/analyze";
import { errorSignatures } from "@/search/signature";
import { KindGlyph } from "./hero-recall";
import { BENCH } from "./bench-results";

/** Pause CSS loops when off screen or the tab is hidden. */
function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [on, setOn] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    let inView = true;
    const io = new IntersectionObserver(([e]) => { inView = !!e?.isIntersecting; setOn(inView && !document.hidden); }, { threshold: 0.15 });
    io.observe(el);
    const vis = () => setOn(inView && !document.hidden);
    document.addEventListener("visibilitychange", vis);
    return () => { io.disconnect(); document.removeEventListener("visibilitychange", vis); };
  }, []);
  return [ref, on] as const;
}

/**
 * The daily loop, in the order it happens. Each panel is a small working
 * replica of the real component, animated on a short continuous loop.
 */
export function ThreeMoves() {
  const [ref, on] = useInView<HTMLElement>();
  return (
    <section ref={ref} className={`st-moves${on ? "" : " is-paused"}`} aria-labelledby="moves-h">
      <h2 id="moves-h" className="st-h">One loop, every day.</h2>
      <p className="st-lede">Write things down as they happen. Find them when they matter. Let the open ones tell you what&apos;s next.</p>
      <div className="st-grid">
        <article className="st-move">
          <div className="st-demo" aria-hidden="true">
            <div className="mv-composer">
              <div className="mv-kinds"><span className="mv-k k-worked" /><span className="mv-k k-learned" /><span className="mv-k k-decided mv-k-on" /><span className="mv-k k-task" /></div>
              <div className="mv-line"><span className="mv-typed">Decided to keep BM25 as the default</span><i className="mv-caret" /></div>
            </div>
            <div className="mv-row mv-row-new"><KindGlyph kind="decided" /><span>Decided to keep BM25 as the default</span><b>#4kq2ma</b></div>
            <div className="mv-row mv-row-old"><KindGlyph kind="learned" /><span>RRF helped paraphrased questions</span><b>#9dw1c0</b></div>
          </div>
          <h3>Write it down</h3>
          <p>One line for what you worked on, learned or decided. The kind is picked up from how you write it, and it&apos;s saved on this device the moment you press Enter.</p>
        </article>
        <article className="st-move">
          <div className="st-demo" aria-hidden="true">
            <div className="mv-search"><span className="mv-q">where do embeddings live</span></div>
            <div className="mv-hit mv-hit-1"><KindGlyph kind="decided" /><span>Embeddings live in SQLite for local-first use</span><em>Current</em></div>
            <div className="mv-hit mv-hit-2"><KindGlyph kind="decided" /><s>Store embeddings in pgvector</s><em className="mv-old">Replaced</em></div>
            <div className="mv-receipt">2 matches in 0.04 ms</div>
          </div>
          <h3>Find it again</h3>
          <p>Search your notes and your repos&apos; issues together. When a decision was replaced, you see the current one first and the old one marked, so nobody acts on stale context.</p>
        </article>
        <article className="st-move">
          <div className="st-demo" aria-hidden="true">
            <div className="mv-next">
              <div className="mv-next-title"><KindGlyph kind="task" /><span>Write the sync conflict policy</span></div>
              <ul><li>an open task</li><li>connects to yesterday&apos;s work (sync)</li><li>waiting 2 days</li></ul>
              <div className="mv-btns"><span className="mv-btn">Work on this</span><span className="mv-btn ghost">Skip for today</span></div>
            </div>
          </div>
          <h3>See what&apos;s next</h3>
          <p>Open tasks and unresolved decisions are ranked by plain rules you can read: age, what you touched yesterday, what you skipped. No model guessing on your behalf.</p>
        </article>
      </div>
    </section>
  );
}

const SAMPLE = "fs.readFileSync throws ERR_REQUIRE_ESM after next@16.4.5\nTypeError: Cannot read properties of undefined (reading 'map') at /Users/ana/app/page.tsx:12:5";

/** How search reads engineering text, shown with the real analyzer, plus the measured result. */
export function SearchProof() {
  const [text, setText] = useState(SAMPLE);
  const tokens = useMemo(() => [...new Set(analyze(text))].slice(0, 28), [text]);
  const sigs = useMemo(() => errorSignatures(text), [text]);
  const max = 1;
  return (
    <section className="st-proof" aria-labelledby="proof-h">
      <div className="st-proof-copy">
        <h2 id="proof-h" className="st-h">Search that reads engineering text.</h2>
        <p className="st-lede">
          Identifiers, versions, paths and stack traces are not prose. memoRABLE keeps <code>readFileSync</code> whole for exact matches and splits it into the words you&apos;d type.
          Versions stay intact. Error lines are reduced to a fingerprint, so two reports of the same crash meet even when their paths differ.
        </p>
        <label className="st-try">
          <span>Edit this and watch it read</span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} spellCheck={false} />
        </label>
        <div className="st-tokens" aria-label="Terms the search indexes">
          {tokens.map((t) => <span key={t} className={/[._@/:]|\d\.\d/.test(t) ? "whole" : ""}>{t}</span>)}
        </div>
        {sigs.length > 0 && (
          <div className="st-sig"><span>Error fingerprint</span><code>{sigs[0]}</code></div>
        )}
      </div>

      <figure className="st-bench">
        <figcaption>
          <strong>Measured, not claimed.</strong> {BENCH.queries} duplicate issues that VS Code and Next.js maintainers linked by hand. For each one, is the original
          in the top 10 results? Each search only sees issues filed before it.
        </figcaption>
        <div className="st-bars" role="table" aria-label="Share of duplicates whose original is in the top 10">
          {BENCH.rows.map((r) => (
            <div key={r.label} className={`st-bar${r.ours ? " ours" : ""}`} role="row">
              <span role="rowheader">{r.label}</span>
              <span className="st-bar-track" role="cell"><i style={{ width: `${(r.r10 / max) * 100}%` }} /></span>
              <span className="st-bar-v" role="cell">{Math.round(r.r10 * 100)}%</span>
            </div>
          ))}
        </div>
        <p className="st-bench-foot">
          {BENCH.note}{" "}
          <a href="https://github.com/charan-rathore/memoRABLE/tree/main/bench/search" target="_blank" rel="noreferrer noopener">Benchmark and method</a>
        </p>
      </figure>
    </section>
  );
}
