"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DailyEngine } from "@/daily/engine";
import type { EntryKind } from "@/daily/types";
import { detectKind, formatMs, highlight, KIND_LABEL, parseReplaces } from "./compose";
import { Glyph } from "./glyph";

const KINDS: EntryKind[] = ["worked", "learned", "decided", "task"];
const TEXT_TYPES = ".md,.markdown,.txt,.json,.csv,.log,.yml,.yaml,text/*,application/json";

export function Composer({
  engine,
  rev,
  run,
  onSaved,
  inputRef,
  prefill,
}: {
  engine: DailyEngine;
  rev: number;
  run: <T>(fn: (e: DailyEngine) => Promise<T> | T) => Promise<T | undefined>;
  onSaved: (msg: string, id: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  prefill?: { text: string; select: [number, number]; n: number } | null;
}) {
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<EntryKind | null>(null);
  const [sources, setSources] = useState<Array<{ id: string; name: string }>>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!prefill) return;
    setText(prefill.text);
    setPicked("decided");
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(prefill.select[0], prefill.select[1]);
    });
  }, [prefill, inputRef]);

  const auto = detectKind(text);
  const kind: EntryKind = picked ?? auto ?? "worked";
  const replaces = parseReplaces(text);
  const replaceTarget = replaces ? engine.findByHandle(replaces) : undefined;

  // Capture triggers recall: what you already know about this, as you type.
  const related = useMemo(() => {
    const q = text.trim();
    if (q.length < 3) return null;
    const r = engine.recall(q, 3);
    return { hits: r.hits.filter((h) => h.score > 0), ms: engine.receipts.at(-1)?.ms ?? 0, cache: r.cache };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, rev, engine]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [text, inputRef]);

  async function save() {
    const body = text.trim();
    if (!body) return;
    const e = await run((en) => en.record({ kind, text: body, sourceIds: sources.map((s) => s.id), ...(replaceTarget ? { supersedes: replaceTarget.id } : {}) }));
    if (!e) return;
    setText(""); setPicked(null); setSources([]);
    onSaved(`Saved as ${KIND_LABEL[e.kind].toLowerCase()} #${e.handle}${replaceTarget ? `, replacing #${replaceTarget.handle}` : ""}`, e.id);
  }

  async function attach(files: FileList | null) {
    setFileError(null);
    for (const f of Array.from(files ?? [])) {
      const isText = f.type.startsWith("text/") || f.type === "application/json" || /\.(md|markdown|txt|json|csv|log|ya?ml)$/i.test(f.name);
      if (!isText) { setFileError(`${f.name} isn't a text file. Attach .md, .txt, .json or .csv for now.`); continue; }
      if (f.size > 2_000_000) { setFileError(`${f.name} is over 2 MB. Attach a smaller excerpt.`); continue; }
      const content = await f.text();
      const id = await run((en) => en.attachSource({ name: f.name, mime: f.type || "text/plain", text: content, bytes: f.size }));
      if (id) setSources((s) => [...s, { id, name: f.name }]);
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  function linkHandle(handle: string) {
    setText((t) => `${t.replace(/\s*$/, "")} #${handle} `);
    inputRef.current?.focus();
  }

  return (
    <section className="td-composer" aria-label="Record">
      <div className="td-kinds" role="radiogroup" aria-label="What is this?">
        {KINDS.map((k, i) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            className={`td-kind td-k-${k}${kind === k ? " is-on" : ""}${!picked && auto === k ? " is-auto" : ""}`}
            onClick={() => setPicked(picked === k ? null : k)}
            title={`${KIND_LABEL[k]} (Alt+${i + 1})`}
          >
            <Glyph kind={k} />
            <span>{KIND_LABEL[k]}</span>
          </button>
        ))}
      </div>
      <div className={`td-input td-k-${kind}`}>
        <textarea
          ref={inputRef}
          value={text}
          rows={1}
          placeholder="What did you work on, learn or decide?"
          aria-label="Entry text"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void save(); }
            if (e.altKey && /^[1-4]$/.test(e.key)) { e.preventDefault(); setPicked(KINDS[Number(e.key) - 1]!); }
            if (e.key === "Escape" && text) { e.preventDefault(); setText(""); setPicked(null); }
          }}
        />
        <div className="td-input-bar">
          <div className="td-attached">
            {sources.map((s) => (
              <span key={s.id} className="td-chip">
                {s.name}
                <button type="button" aria-label={`Remove ${s.name}`} onClick={() => setSources((x) => x.filter((y) => y.id !== s.id))}>×</button>
              </span>
            ))}
            {replaceTarget && <span className="td-chip td-chip-replace">Replaces #{replaceTarget.handle}</span>}
            {replaces && !replaceTarget && <span className="td-chip td-chip-warn">No entry #{replaces}</span>}
          </div>
          <input ref={fileRef} type="file" accept={TEXT_TYPES} multiple hidden onChange={(e) => void attach(e.target.files)} />
          <button type="button" className="td-ghost" onClick={() => fileRef.current?.click()}>Attach source</button>
          <button type="button" className="td-save" disabled={!text.trim()} onClick={() => void save()}>
            Save <kbd>⌘↵</kbd>
          </button>
        </div>
      </div>
      {fileError && <p className="td-error" role="alert">{fileError}</p>}

      {related && related.hits.length > 0 && (
        <div className="td-related" aria-live="polite">
          <p className="td-related-head">
            You have {related.hits.length === 1 ? "one related entry" : `${related.hits.length} related entries`}
            <span className="td-receipt-inline">{formatMs(related.ms)}{related.cache === "hit" ? ", cached" : ""}</span>
          </p>
          <ul>
            {related.hits.map((h) => {
              const e = engine.entry(h.entryId);
              if (!e) return null;
              const by = h.supersededBy ? engine.entry(h.supersededBy) : undefined;
              return (
                <li key={h.entryId} className={h.stale ? "is-stale" : ""}>
                  <Glyph kind={e.kind} task={e.task} />
                  <span className="td-related-text">
                    {highlight(e.text, h.matched).map((r, i) => (r.hit ? <mark key={i}>{r.t}</mark> : <span key={i}>{r.t}</span>))}
                    {by && <em className="td-stale-note"> replaced by #{by.handle}</em>}
                  </span>
                  <button type="button" className="td-link-btn" onClick={() => linkHandle(e.handle)} aria-label={`Link #${e.handle} in this entry`}>
                    #{e.handle}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
