"use client";

import { useEffect, useMemo, useState } from "react";
import type { DailyEngine, ReconfirmAnswer } from "@/daily/engine";
import type { Entry, WorkspaceState } from "@/daily/types";
import { DESIRED_RETENTION } from "@/daily/fsrs";
import { dayKey, dayLabel, KIND_LABEL } from "./compose";
import { Glyph } from "./glyph";

type Run = <T>(fn: (e: DailyEngine) => Promise<T> | T) => Promise<T | undefined>;

const DAY = 86_400_000;
const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;
const recordedWhen = (iso: string) => {
  const label = dayLabel(dayKey(iso));
  return label === "Today" || label === "Yesterday" ? label.toLowerCase() : `on ${label}`;
};
const until = (iso: string, now: Date) => {
  const d = Math.max(0, Math.round((Date.parse(iso) - now.getTime()) / DAY));
  return d === 0 ? "today" : d === 1 ? "tomorrow" : `in ${days(d)}`;
};

/**
 * "Still true?": decisions and lessons come back when their predicted recall
 * (FSRS-5) falls below 90%. Three plain answers; each one moves the schedule,
 * and "changed" reopens a decision instead of leaving a stale record that
 * still reads as authoritative.
 */
export function StillTruePanel({ engine, rev, run, onAnnounce, onReplace, onHandle }: {
  engine: DailyEngine;
  rev: number;
  run: Run;
  onAnnounce: (m: string) => void;
  onReplace: (e: Entry) => void;
  onHandle: (h: string) => void;
}) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const due = useMemo(() => engine.dueForReconfirm(4), [engine, rev]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const nextAt = useMemo(() => (due.length ? null : engine.nextReconfirmAt()), [engine, rev, due.length]);
  const [reopened, setReopened] = useState<Entry | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { setNow(new Date()); }, [rev]);

  const top = due[0];
  const entry = top ? engine.entry(top.entryId) : undefined;

  const answer = async (a: ReconfirmAnswer) => {
    if (!entry || !top) return;
    const after = await run((en) => en.reconfirm(entry.id, a));
    if (!after) return;
    if (a === "holds") onAnnounce(`Confirmed #${entry.handle}. Next check in about ${days(top.nextIfHolds)}.`);
    if (a === "unsure") onAnnounce(`#${entry.handle} will come back sooner.`);
    if (a === "changed") {
      onAnnounce(entry.kind === "decided" ? `Reopened #${entry.handle}. It is in Next until you replace it.` : `#${entry.handle} will come back soon.`);
      if (entry.kind === "decided") setReopened(after);
    }
  };

  return (
    <section className="td-panel td-recheck" aria-labelledby="recheck-h">
      <div className="td-panel-row">
        <h2 id="recheck-h" className="td-panel-h">Still true?</h2>
        {due.length > 1 && <span className="td-count" aria-label={`${due.length} waiting`}>{due.length}</span>}
      </div>

      {reopened && (
        <div className="td-recheck-reopened" role="status">
          <p>#{reopened.handle} is open again.</p>
          <button type="button" className="td-save sm" onClick={() => { onReplace(reopened); setReopened(null); }}>Write what replaces it</button>
          <button type="button" className="td-ghost" onClick={() => setReopened(null)}>Later</button>
        </div>
      )}

      {!top || !entry ? (
        <p className="td-empty-note">
          {nextAt && now
            ? <>Nothing to re-check. The next decision or lesson comes back {until(nextAt, now)}.</>
            : <>Decisions and lessons you record come back here before you are likely to forget why they hold.</>}
        </p>
      ) : (
        <div className={`td-recheck-card td-k-${entry.kind}`} key={entry.id}>
          <div className="td-recheck-title">
            <Glyph kind={entry.kind} size={12} />
            <p>{entry.text}</p>
          </div>
          <div className="td-recall-meter" title={`FSRS-5 predicted recall. Re-check is due below ${Math.round(DESIRED_RETENTION * 100)}%.`}>
            <span className="td-recall-track" aria-hidden="true">
              <span className="td-recall-fill" style={{ width: `${Math.round(top.retrievability * 100)}%` }} />
              <span className="td-recall-target" style={{ left: `${DESIRED_RETENTION * 100}%` }} />
            </span>
            <span className="td-recall-label">
              {Math.round(top.retrievability * 100)}% likely you still remember why
            </span>
          </div>
          <ul className="td-recheck-reasons">
            <li>{KIND_LABEL[entry.kind]} {recordedWhen(entry.createdAt)}{top.reviews ? `, confirmed ${top.reviews}×` : ", never re-checked"}</li>
            <li>“Still holds” moves the next check to about {days(top.nextIfHolds)} away</li>
          </ul>
          <div className="td-recheck-actions" role="group" aria-label="Does this still hold?">
            <button type="button" className="td-save sm" onClick={() => void answer("holds")}>Still holds</button>
            <button type="button" className="td-ghost" onClick={() => void answer("unsure")}>Not sure</button>
            <button type="button" className="td-ghost td-ghost-warn" onClick={() => void answer("changed")}>
              {entry.kind === "decided" ? "Changed" : "Forgot"}
            </button>
          </div>
          {due.length > 1 && (
            <ol className="td-later td-recheck-later" aria-label="Also waiting">
              {due.slice(1).map((d) => {
                const e = engine.entry(d.entryId);
                return e ? (
                  <li key={d.entryId}>
                    <Glyph kind={e.kind} />
                    <span>{e.text}</span>
                    <button type="button" className="td-handle-ref" onClick={() => onHandle(e.handle)}>#{e.handle}</button>
                  </li>
                ) : null;
              })}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * "Look back": the decisions in force on a past date, rebuilt from the event
 * log (bi-temporal view in the sense of Zep/Graphiti validity windows), with
 * what later replaced them. Deleted entries never reappear.
 */
export function LookBackPanel({ engine, rev, onHandle }: { engine: DailyEngine; rev: number; onHandle: (h: string) => void }) {
  const [date, setDate] = useState("");
  const [past, setPast] = useState<WorkspaceState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!date) { setPast(null); return; }
    let alive = true;
    setBusy(true);
    const end = new Date(`${date}T23:59:59.999`);
    void engine.asOf(end).then((s) => { if (alive) { setPast(s); setBusy(false); } });
    return () => { alive = false; };
  }, [engine, date, rev]);

  const rows = useMemo(() => {
    if (!past) return [];
    return [...past.entries.values()]
      .filter((e) => e.kind === "decided" && e.status !== "superseded")
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((e) => ({ then: e, now: engine.entry(e.id) }));
  }, [past, engine]);

  return (
    <section className="td-panel td-lookback" aria-labelledby="lookback-h">
      <h2 id="lookback-h" className="td-panel-h">Look back</h2>
      <label className="td-date-field">
        <span>What had we decided on</span>
        <input type="date" value={date} max={dayKey(new Date().toISOString())} onChange={(e) => setDate(e.target.value)} />
      </label>
      {!date ? (
        <p className="td-empty-note">Pick a day to see the decisions in force then, and which ones have since been replaced.</p>
      ) : busy ? (
        <p className="td-empty-note">Replaying the log…</p>
      ) : rows.length === 0 ? (
        <p className="td-empty-note">No decisions were in force on that day.</p>
      ) : (
        <ul className="td-asof">
          {rows.map(({ then, now }) => {
            const replacedBy = now?.supersededBy ? engine.entry(now.supersededBy) : undefined;
            return (
              <li key={then.id} className={replacedBy ? "is-replaced" : ""}>
                <Glyph kind="decided" />
                <div>
                  <p>{then.text}</p>
                  {replacedBy ? (
                    <small>Later replaced by <button type="button" className="td-handle-ref" onClick={() => onHandle(replacedBy.handle)}>#{replacedBy.handle}</button></small>
                  ) : !now ? (
                    <small>Deleted since</small>
                  ) : now.text !== then.text ? (
                    <small>Revised since</small>
                  ) : (
                    <small>Still in force</small>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
