"use client";

import { useMemo, useState } from "react";
import { analyze } from "@/search/analyze";
import { errorSignatures } from "@/search/signature";
import { BENCH } from "./bench-results";

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
