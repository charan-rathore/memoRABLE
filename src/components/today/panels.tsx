"use client";

import { useMemo, useState } from "react";
import type { DailyEngine } from "@/daily/engine";
import type { EntryKind } from "@/daily/types";
import { dayLabel, formatMs, highlight, KIND_LABEL } from "./compose";
import { Glyph } from "./glyph";

type Run = <T>(fn: (e: DailyEngine) => Promise<T> | T) => Promise<T | undefined>;

// ── Next ──────────────────────────────────────────────────────────────────

export function NextPanel({ engine, rev, run, onAnnounce, onHandle }: { engine: DailyEngine; rev: number; run: Run; onAnnounce: (m: string) => void; onHandle: (h: string) => void }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const candidates = useMemo(() => engine.next(3), [engine, rev]);
  const [revising, setRevising] = useState(false);
  const [draft, setDraft] = useState("");
  const top = candidates[0];
  const topEntry = top ? engine.entry(top.entryId) : undefined;

  if (!top || !topEntry) {
    return (
      <section className="td-panel td-next" aria-labelledby="next-h">
        <h2 id="next-h" className="td-panel-h">Next</h2>
        <p className="td-empty-note">Nothing open. Record a task, or a decision you haven&apos;t made yet, and it shows up here with the reason it was picked.</p>
      </section>
    );
  }

  const inProgress = topEntry.task === "accepted";
  return (
    <section className="td-panel td-next" aria-labelledby="next-h">
      <h2 id="next-h" className="td-panel-h">Next</h2>
      <div className={`td-next-card td-k-${topEntry.kind}`} key={topEntry.id}>
        <div className="td-next-title">
          <Glyph kind={topEntry.kind} task={topEntry.task} size={12} />
          <p>{topEntry.text}</p>
        </div>
        <ul className="td-reasons">
          {top.reasons.map((r) => <li key={r}>{r}</li>)}
        </ul>
        {revising ? (
          <form className="td-revise" onSubmit={async (ev) => {
            ev.preventDefault();
            const n = await run((en) => en.decide(topEntry.id, "revised", draft));
            if (n) { setRevising(false); setDraft(""); onAnnounce(`Added #${n.handle} instead`); }
          }}>
            <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="What should you do instead?" aria-label="Revised task" />
            <button type="submit" className="td-save sm" disabled={!draft.trim()}>Use this</button>
            <button type="button" className="td-ghost" onClick={() => setRevising(false)}>Cancel</button>
          </form>
        ) : (
          <div className="td-next-actions">
            {inProgress ? (
              <button type="button" className="td-save sm" onClick={() => void run((en) => en.setTask(topEntry.id, "done")).then(() => onAnnounce(`Done: #${topEntry.handle}`))}>Mark done</button>
            ) : (
              <button type="button" className="td-save sm" onClick={() => void run((en) => en.decide(topEntry.id, "accepted")).then(() => onAnnounce(`Working on #${topEntry.handle}`))}>Work on this</button>
            )}
            <button type="button" className="td-ghost" onClick={() => { setDraft(topEntry.text); setRevising(true); }}>Revise</button>
            <button type="button" className="td-ghost" onClick={() => void run((en) => en.decide(topEntry.id, "skipped")).then(() => onAnnounce("Skipped for today"))}>Skip for today</button>
          </div>
        )}
      </div>
      {candidates.length > 1 && (
        <ol className="td-later" aria-label="After that">
          {candidates.slice(1).map((c) => {
            const e = engine.entry(c.entryId);
            return e ? (
              <li key={c.entryId}>
                <Glyph kind={e.kind} task={e.task} />
                <span>{e.text}</span>
                <button type="button" className="td-handle-ref" onClick={() => onHandle(e.handle)}>#{e.handle}</button>
              </li>
            ) : null;
          })}
        </ol>
      )}
    </section>
  );
}

// ── Recall ────────────────────────────────────────────────────────────────

export function RecallPanel({ engine, rev, query, setQuery, inputRef, onHandle }: {
  engine: DailyEngine; rev: number; query: string; setQuery: (q: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>; onHandle: (h: string) => void;
}) {
  const result = useMemo(() => {
    const q = query.trim();
    if (!q) return null;
    const r = engine.recall(q, 8);
    return { ...r, receipt: engine.receipts.at(-1) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, query, rev]);

  return (
    <section className="td-panel td-recall" aria-labelledby="recall-h">
      <h2 id="recall-h" className="td-panel-h">Recall</h2>
      <label className="td-search">
        <span className="visually-hidden">Search your memory</span>
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="m11 11 3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        <input ref={inputRef} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a decision, a lesson, a task" />
        <kbd>/</kbd>
      </label>
      {result && (
        <>
          <p className="td-receipt" aria-live="polite">
            {result.hits.length === 0 ? "No matches" : `${result.hits.length} ${result.hits.length === 1 ? "match" : "matches"}`} in {formatMs(result.receipt?.ms ?? 0)}
            {result.cache === "hit" ? ", served from cache" : `, ${result.scanned} postings read`}
          </p>
          <ul className="td-results">
            {result.hits.map((h) => {
              const e = engine.entry(h.entryId);
              if (!e) return null;
              const by = h.supersededBy ? engine.entry(h.supersededBy) : undefined;
              return (
                <li key={h.entryId} className={`td-result${h.stale ? " is-stale" : ""}`}>
                  <Glyph kind={e.kind} task={e.task} />
                  <div>
                    <p>{highlight(e.text, h.matched).map((r, i) => (r.hit ? <mark key={i}>{r.t}</mark> : <span key={i}>{r.t}</span>))}</p>
                    <div className="td-meta">
                      <span>{dayLabel(toKey(e.createdAt))}</span>
                      <button type="button" className="td-handle-ref" onClick={() => onHandle(e.handle)}>#{e.handle}</button>
                      {h.stale && by && <span className="td-status s-superseded">Replaced by #{by.handle}</span>}
                      {h.promoted && <span className="td-status s-current">Current decision</span>}
                      {e.status && !h.stale && <span className={`td-status s-${e.status}`}>{e.status[0]!.toUpperCase() + e.status.slice(1)}</span>}
                    </div>
                  </div>
                </li>
              );
            })}
            {result.linked.map((l) => {
              const e = engine.entry(l.entryId);
              const from = engine.entry(l.from);
              if (!e || !from) return null;
              return (
                <li key={`l-${l.entryId}`} className="td-result is-linked">
                  <Glyph kind={e.kind} task={e.task} />
                  <div>
                    <p>{e.text}</p>
                    <div className="td-meta">
                      <span>Linked from #{from.handle}</span>
                      <button type="button" className="td-handle-ref" onClick={() => onHandle(e.handle)}>#{e.handle}</button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {!result && <p className="td-empty-note">Recall reads only what you recorded here. It runs on this device with no model.</p>}
    </section>
  );
}

const toKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// ── Review ────────────────────────────────────────────────────────────────

const KINDS: EntryKind[] = ["worked", "learned", "decided", "task"];

export function ReviewPanel({ engine, rev }: { engine: DailyEngine; rev: number }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const r = useMemo(() => engine.review(7), [engine, rev]);
  const max = Math.max(1, ...r.days.map((d) => KINDS.reduce((a, k) => a + d.counts[k], 0)));
  const op = (name: string) => r.system.ops.find((o) => o.op === name);
  const recall = op("recall");
  const save = op("record");

  return (
    <section className="td-panel td-review" aria-labelledby="review-h">
      <h2 id="review-h" className="td-panel-h">Review</h2>
      <figure className="td-week">
        <div className="td-bars" role="img" aria-label={`Entries per day for the last 7 days: ${r.days.map((d) => KINDS.reduce((a, k) => a + d.counts[k], 0)).join(", ")}`}>
          {r.days.map((d) => (
            <div key={d.day} className="td-bar-col">
              <div className="td-bar">
                {KINDS.map((k) => d.counts[k] > 0 && (
                  <span key={k} className={`td-seg td-k-${k}`} style={{ height: `${(d.counts[k] / max) * 100}%` }} />
                ))}
              </div>
              <span className="td-bar-day">{new Date(`${d.day}T12:00:00`).toLocaleDateString(undefined, { weekday: "narrow" })}</span>
            </div>
          ))}
        </div>
        <figcaption className="td-legend">
          {KINDS.map((k) => <span key={k}><Glyph kind={k} /> {KIND_LABEL[k]}</span>)}
        </figcaption>
      </figure>

      <dl className="td-stats">
        <div><dt>Approved</dt><dd>{r.decisions.approved}</dd></div>
        <div><dt>Proposed</dt><dd>{r.decisions.proposed}</dd></div>
        <div><dt>Unresolved</dt><dd>{r.decisions.unresolved}</dd></div>
        <div><dt>Replaced</dt><dd>{r.decisions.superseded}</dd></div>
        <div><dt>Tasks done</dt><dd>{r.tasks.done}</dd></div>
        <div><dt>Tasks open</dt><dd>{r.tasks.open + r.tasks.accepted}</dd></div>
      </dl>

      <h3 className="td-sub-h">How the system performed</h3>
      <p className="td-sub-note">Measured on this device since this tab opened, from {r.system.receipts} receipts.</p>
      <dl className="td-stats td-sys">
        <div><dt>Recall, p95</dt><dd>{recall ? formatMs(recall.p95) : "Not yet"}</dd></div>
        <div><dt>Save, p95</dt><dd>{save ? formatMs(save.p95) : "Not yet"}</dd></div>
        <div><dt>Answers from cache</dt><dd>{r.system.recallCacheHitRate === null ? "Not yet" : `${Math.round(r.system.recallCacheHitRate * 100)}%`}</dd></div>
        <div><dt>Cached answers dropped per change</dt><dd>{r.system.invalidatedPerUpdate ?? "Not yet"}</dd></div>
        <div><dt>Model calls</dt><dd>{r.system.modelCalls}</dd></div>
        <div><dt>Spend</dt><dd>${r.system.costUsd.toFixed(2)}</dd></div>
      </dl>
    </section>
  );
}
