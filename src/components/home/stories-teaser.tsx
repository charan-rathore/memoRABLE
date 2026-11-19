"use client";

import Link from "next/link";

const BEATS = [
  { field: "moss", eyebrow: "> atlas-q3-brief.json", big: "Momentum, with room to compound.", serif: true },
  { field: "oat", eyebrow: "> what moved", big: "four numbers moved.", bars: true },
  { field: "night", eyebrow: "> the paper on one page", big: "one question, three answers.", map: true },
  { field: "butter", eyebrow: "> what was decided", big: "two decided, one open." },
  { field: "clay", eyebrow: "> what could stop it", big: "one thing could stop it." },
];

/**
 * The story view, previewed on the landing page: five beats as they look,
 * a live tilt on hover, and two ways in — the sample, or your own file,
 * which plays at once in the browser.
 */
export function StoriesTeaser() {
  return (
    <section id="stories" className="lp-section st-teaser" aria-labelledby="stories-h">
      <div className="st-teaser-copy">
        <p className="st-teaser-kicker">New · documents as stories</p>
        <h2 id="stories-h" className="st-h">Scroll through a document like a story.</h2>
        <p className="st-lede">
          Drop in a brief, a report or a research paper. memoRABLE reads it on this device and plays it back one idea at a time: the
          headline, the numbers that moved, what was decided, what could stop it. For a paper, it draws the question wired to what the
          paper found, a figure the paper never had. Every line is the document&apos;s own.
        </p>
        <div className="st-teaser-cta">
          <Link className="btn pri" href="/story">Play the sample story</Link>
          <Link className="btn ghost" href="/story?pick=1">Play your own file</Link>
        </div>
        <p className="st-teaser-note">PDF, Markdown, text or JSON. Nothing is uploaded.</p>
      </div>
      <Link href="/story" className="st-teaser-reel" aria-label="Open the sample story">
        {BEATS.map((b, i) => (
          <div key={i} className={`st-beat st-${b.field}`} style={{ ["--i" as string]: i }}>
            <span className="st-beat-eye">{b.eyebrow}</span>
            <span className={`st-beat-big${b.serif ? " is-serif" : ""}`}>{b.big}</span>
            {b.bars && (
              <span className="st-beat-bars" aria-hidden="true">
                {[52, 78, 40, 64].map((h, j) => <i key={j} style={{ height: `${h}%` }} />)}
              </span>
            )}
            {b.map && (
              <svg className="st-beat-map" viewBox="0 0 120 60" aria-hidden="true">
                <rect x="2" y="20" width="36" height="20" rx="6" />
                {[10, 30, 50].map((y) => <path key={y} d={`M38 30 C 60 30, 60 ${y}, 82 ${y}`} />)}
                {[10, 30, 50].map((y) => <rect key={`r${y}`} x="82" y={y - 6} width="36" height="12" rx="4" />)}
              </svg>
            )}
          </div>
        ))}
      </Link>
    </section>
  );
}
