"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The empty state shows the product's one loop (capture, then recall) as a
 * fast, continuous motion piece. Pure CSS on transform and opacity so it never
 * competes with input. Paused when off screen or hidden; a still frame under
 * reduced motion.
 */
export function CaptureLoop() {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const visible = inView && pageVisible;

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setInView(!!e?.isIntersecting), { threshold: 0.1 });
    io.observe(el);
    const vis = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", vis);
    return () => { io.disconnect(); document.removeEventListener("visibilitychange", vis); };
  }, []);

  return (
    <div ref={ref} className={`td-loop${visible ? "" : " is-paused"}`} aria-hidden="true">
      <div className="td-loop-stage">
        <div className="td-loop-composer">
          <span className="td-loop-kind" />
          <span className="td-loop-typed">Decided to keep BM25 as the default</span>
          <span className="td-loop-caret" />
        </div>
        <div className="td-loop-list">
          <div className="td-loop-row td-loop-new"><i className="td-k-decided sq" /><span>Decided to keep BM25 as the default</span><b>#4kq2ma</b></div>
          <div className="td-loop-row td-loop-old"><i className="td-k-learned dm" /><span>RRF lifted paraphrased recall by 3 points</span><b>#9dw1c0</b></div>
          <div className="td-loop-row td-loop-old2"><i className="td-k-task ring" /><span>Measure index update cost</span><b>#p02xne</b></div>
        </div>
        <div className="td-loop-search">
          <span className="td-loop-q">default retrieval</span>
          <span className="td-loop-receipt">1 match in 0.04 ms</span>
        </div>
      </div>
    </div>
  );
}
