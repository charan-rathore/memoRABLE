"use client";

import { Fragment, useState } from "react";
import type { DailyEngine } from "@/daily/engine";
import type { Entry } from "@/daily/types";
import { dayKey, dayLabel, KIND_LABEL, timeOf } from "./compose";
import { Glyph } from "./glyph";

type Run = <T>(fn: (e: DailyEngine) => Promise<T> | T) => Promise<T | undefined>;

const STATUS_LABEL = { proposed: "Proposed", approved: "Approved", unresolved: "Unresolved", superseded: "Replaced" } as const;

export function EntryStream({
  engine, entries, run, flashId, onReplace, onAnnounce, onHandle,
}: {
  engine: DailyEngine;
  entries: Entry[];
  run: Run;
  flashId: string | null;
  onReplace: (e: Entry) => void;
  onAnnounce: (msg: string) => void;
  onHandle: (handle: string) => void;
}) {
  const groups: Array<{ key: string; items: Entry[] }> = [];
  for (const e of entries) {
    const k = dayKey(e.createdAt);
    const g = groups.at(-1);
    if (g && g.key === k) g.items.push(e); else groups.push({ key: k, items: [e] });
  }
  return (
    <div className="td-stream">
      {groups.map((g) => (
        <Fragment key={g.key}>
          <h2 className="td-day">{dayLabel(g.key)}</h2>
          <ol className="td-entries">
            {g.items.map((e) => (
              <EntryRow key={e.id} e={e} engine={engine} run={run} flash={flashId === e.id} onReplace={onReplace} onAnnounce={onAnnounce} onHandle={onHandle} />
            ))}
          </ol>
        </Fragment>
      ))}
    </div>
  );
}

function RichText({ text, onHandle }: { text: string; onHandle: (h: string) => void }) {
  const parts = text.split(/(#[a-z0-9]{6}\b)/gi);
  return (
    <>
      {parts.map((p, i) =>
        /^#[a-z0-9]{6}$/i.test(p) ? (
          <button key={i} type="button" className="td-handle-ref" onClick={() => onHandle(p.slice(1).toLowerCase())}>{p}</button>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

function EntryRow({ e, engine, run, flash, onReplace, onAnnounce, onHandle }: {
  e: Entry; engine: DailyEngine; run: Run; flash: boolean;
  onReplace: (e: Entry) => void; onAnnounce: (msg: string) => void; onHandle: (h: string) => void;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [draft, setDraft] = useState(e.text);
  const by = e.supersededBy ? engine.entry(e.supersededBy) : undefined;
  const sources = e.sourceIds.map((id) => engine.workspace.sources.get(id)).filter(Boolean);

  async function saveEdit() {
    if (draft.trim() === e.text) { setMode("view"); return; }
    const r = await run((en) => en.revise(e.id, draft));
    if (r) { setMode("view"); onAnnounce(`Revised #${e.handle}, now version ${r.version}`); }
  }

  return (
    <li id={`entry-${e.id}`} className={`td-entry td-k-${e.kind}${e.status === "superseded" ? " is-stale" : ""}${e.task === "done" ? " is-done" : ""}${flash ? " is-flash" : ""}`}>
      <span className="td-entry-glyph" title={KIND_LABEL[e.kind]}><Glyph kind={e.kind} task={e.task} size={11} /></span>
      <div className="td-entry-body">
        {mode === "edit" ? (
          <div className="td-edit">
            <textarea
              value={draft}
              autoFocus
              aria-label={`Revise #${e.handle}`}
              onChange={(x) => setDraft(x.target.value)}
              onKeyDown={(x) => {
                if (x.key === "Enter" && (x.metaKey || x.ctrlKey)) { x.preventDefault(); void saveEdit(); }
                if (x.key === "Escape") { x.preventDefault(); setDraft(e.text); setMode("view"); }
              }}
            />
            <div className="td-row-actions is-open">
              <button type="button" className="td-save sm" onClick={() => void saveEdit()} disabled={!draft.trim()}>Save revision</button>
              <button type="button" className="td-ghost" onClick={() => { setDraft(e.text); setMode("view"); }}>Cancel</button>
            </div>
          </div>
        ) : (
          <p className="td-entry-text"><RichText text={e.text} onHandle={onHandle} /></p>
        )}

        <div className="td-meta">
          <time dateTime={e.createdAt}>{timeOf(e.createdAt)}</time>
          <span className="td-handle">#{e.handle}</span>
          {e.status && (
            <span className={`td-status s-${e.status}`} title={e.statusBasis ? `Because ${e.statusBasis}` : undefined}>
              {STATUS_LABEL[e.status]}
              {by && <> by <button type="button" className="td-handle-ref" onClick={() => onHandle(by.handle)}>#{by.handle}</button></>}
            </span>
          )}
          {e.kind === "task" && e.task && e.task !== "open" && <span className={`td-status t-${e.task}`}>{e.task === "accepted" ? "In progress" : e.task === "done" ? "Done" : "Dropped"}</span>}
          {e.version > 1 && <span className="td-version" title={e.history.map((h) => `v${h.version}: ${h.text}`).join("\n")}>v{e.version}</span>}
          {sources.map((s) => <span key={s!.id} className="td-chip sm" title={`${s!.bytes.toLocaleString()} bytes, sha256 ${s!.contentHash.slice(0, 12)}`}>{s!.name}</span>)}
        </div>

        {mode === "delete" ? (
          <div className="td-confirm" role="group" aria-label="Confirm delete">
            <p>Delete #{e.handle}? Its text is removed from this device and from every answer. Replacing it keeps the history instead.</p>
            <button type="button" className="td-danger" autoFocus onClick={async () => { const r = await run((en) => en.delete(e.id)); if (r) onAnnounce(`Deleted #${e.handle}`); }}>Delete</button>
            <button type="button" className="td-ghost" onClick={() => setMode("view")}>Keep it</button>
          </div>
        ) : mode === "view" && (
          <div className="td-row-actions">
            {e.kind === "task" && e.task !== "done" && <button type="button" onClick={() => void run((en) => en.setTask(e.id, "done")).then(() => onAnnounce(`Done: #${e.handle}`))}>Done</button>}
            {e.kind === "task" && e.task === "done" && <button type="button" onClick={() => void run((en) => en.setTask(e.id, "open"))}>Reopen</button>}
            {e.kind === "decided" && e.status !== "superseded" && e.status !== "approved" && <button type="button" onClick={() => void run((en) => en.setStatus(e.id, "approved")).then(() => onAnnounce(`Approved #${e.handle}`))}>Approve</button>}
            {e.kind === "decided" && e.status !== "superseded" && e.status !== "unresolved" && <button type="button" onClick={() => void run((en) => en.setStatus(e.id, "unresolved"))}>Mark unresolved</button>}
            {e.kind === "decided" && e.status !== "superseded" && <button type="button" onClick={() => onReplace(e)}>Replace</button>}
            <button type="button" onClick={() => { setDraft(e.text); setMode("edit"); }}>Revise</button>
            <button type="button" className="is-danger" onClick={() => setMode("delete")}>Delete</button>
          </div>
        )}
      </div>
    </li>
  );
}
