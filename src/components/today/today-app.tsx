"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Entry } from "@/daily/types";
import { CaptureLoop } from "./capture-loop";
import { Composer } from "./composer";
import { dayKey, formatMs } from "./compose";
import { EntryStream } from "./entry-stream";
import { NextPanel, RecallPanel, ReviewPanel } from "./panels";
import { useDaily } from "./use-daily";

type Tab = "today" | "recall" | "next" | "review";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "today", label: "Today" },
  { id: "recall", label: "Recall" },
  { id: "next", label: "Next" },
  { id: "review", label: "Review" },
];

/**
 * The daily workspace. Standalone it owns the page; `embedded` places it as
 * the last section of the homepage (section headings, tabs inside the section,
 * shortcuts only while the workspace is on screen).
 */
export function TodayApp({ embedded = false }: { embedded?: boolean } = {}) {
  const { engine, rev, run, storage, online, error, clearError } = useDaily();
  const [tab, setTab] = useState<Tab>("today");
  const [query, setQuery] = useState("");
  const [flashId, setFlashId] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => { setNow(new Date()); }, [rev]);

  const entries = useMemo(() => (engine ? engine.timeline(200) : []), [engine, rev]); // eslint-disable-line react-hooks/exhaustive-deps

  const say = useCallback((m: string) => setAnnounce(m), []);

  const flash = useCallback((id: string) => {
    setFlashId(id);
    window.setTimeout(() => setFlashId((x) => (x === id ? null : x)), 1400);
  }, []);

  const openHandle = useCallback((handle: string) => {
    const e = engine?.findByHandle(handle);
    if (!e) { setAnnounce(`#${handle} was deleted or doesn't exist`); return; }
    setTab("today");
    requestAnimationFrame(() => {
      document.getElementById(`entry-${e.id}`)?.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      flash(e.id);
    });
  }, [engine, flash]);

  const [prefill, setPrefill] = useState<{ text: string; select: [number, number]; n: number } | null>(null);
  const replace = useCallback((e: Entry) => {
    setTab("today");
    const text = `Decided … Replaces #${e.handle}`;
    setPrefill({ text, select: [8, 9], n: Date.now() });
    setAnnounce(`Write the new decision. It will replace #${e.handle}.`);
  }, []);

  // Global keys: "/" finds, "n" writes. Ignored while typing in a field.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (embedded) {
        const r = rootRef.current?.getBoundingClientRect();
        if (!r || r.bottom < 80 || r.top > window.innerHeight * 0.6) return; // not the part of the page in view
      }
      if (ev.key === "/") { ev.preventDefault(); setTab("recall"); requestAnimationFrame(() => searchRef.current?.focus()); }
      if (ev.key === "n") { ev.preventDefault(); setTab("today"); requestAnimationFrame(() => composerRef.current?.focus()); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [embedded]);

  const todayKey = now ? dayKey(now.toISOString()) : "";
  const todayCount = entries.filter((e) => dayKey(e.createdAt) === todayKey).length;
  const openTasks = entries.filter((e) => e.kind === "task" && (e.task === "open" || e.task === "accepted")).length;
  const last = engine?.receipts.at(-1);

  return (
    <div className={`td${embedded ? " td-embedded" : ""}`} data-tab={tab} ref={rootRef}>
      <header className="td-top">
        {embedded ? (
          <h2 className="td-section-title">Your workspace</h2>
        ) : (
          <Link href="/" className="td-brand" aria-label="memoRABLE home">memo<b>RABLE</b></Link>
        )}
        <SyncState storage={storage} online={online} ready={!!engine} />
      </header>
      {embedded && (
        <nav className="td-tabs" aria-label="Sections">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={tab === t.id ? "is-on" : ""} aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </nav>
      )}

      <main className="td-main">
        <div className="td-col td-col-main" data-pane="today">
          <div className="td-hello">
            {embedded ? (
              <h3 className="td-date">{now ? now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }) : "\u00a0"}</h3>
            ) : (
              <h1>{now ? now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }) : "\u00a0"}</h1>
            )}
            <p>
              {!engine ? "Opening your workspace" :
                entries.length === 0 ? "Write down what you worked on, learned or decided. It stays on this device." :
                `${todayCount === 0 ? "Nothing recorded yet today" : `${todayCount} ${todayCount === 1 ? "entry" : "entries"} today`}, ${openTasks} open ${openTasks === 1 ? "task" : "tasks"}`}
            </p>
          </div>
          {engine ? (
            <>
              <Composer engine={engine} rev={rev} run={run} inputRef={composerRef} prefill={prefill} onSaved={(m, id) => { say(m); flash(id); }} />
              {entries.length === 0 ? <CaptureLoop /> : (
                <EntryStream engine={engine} entries={entries} run={run} flashId={flashId} onReplace={replace} onAnnounce={say} onHandle={openHandle} />
              )}
            </>
          ) : <div className="td-skeleton" aria-hidden="true"><i /><i /><i /></div>}
        </div>

        <aside className="td-col td-col-side" aria-label="Next, recall and review">
          {engine && (
            <>
              <div data-pane="next"><NextPanel engine={engine} rev={rev} run={run} onAnnounce={say} onHandle={openHandle} /></div>
              <div data-pane="recall"><RecallPanel engine={engine} rev={rev} query={query} setQuery={setQuery} inputRef={searchRef} onHandle={openHandle} /></div>
              <div data-pane="review"><ReviewPanel engine={engine} rev={rev} /></div>
            </>
          )}
        </aside>
      </main>

      <footer className="td-foot">
        <span className="td-foot-keys"><kbd>n</kbd> write <kbd>/</kbd> recall <kbd>⌘↵</kbd> save</span>
        {last && (
          <span className="td-foot-receipt" key={`${last.at}-${engine?.receipts.length}`}>
            Last {last.op} {formatMs(last.ms)}{last.cache === "hit" ? " from cache" : ""}{last.invalidated ? `, ${last.invalidated} cached ${last.invalidated === 1 ? "answer" : "answers"} refreshed` : ""}, no model
          </span>
        )}
      </footer>

      {!embedded && (
        <nav className="td-tabs" aria-label="Sections">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={tab === t.id ? "is-on" : ""} aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </nav>
      )}
      <div className="visually-hidden" role="status" aria-live="polite">{announce}</div>
      {error && (
        <div className="td-toast" role="alert">
          <span>{error}</span>
          <button type="button" onClick={clearError}>Dismiss</button>
        </div>
      )}
    </div>
  );
}

function SyncState({ storage, online, ready }: { storage: "device" | "memory"; online: boolean; ready: boolean }) {
  const state = !ready ? "opening" : storage === "memory" ? "memory" : online ? "device" : "offline";
  const text = {
    opening: "Opening",
    device: "Saved on this device",
    offline: "Offline, still saving here",
    memory: "Not saved: this browser blocks storage",
  }[state];
  return (
    <div className={`td-sync is-${state}`} title={state === "device" || state === "offline" ? "Sync between devices isn't set up. Everything stays in this browser." : undefined}>
      <span className="td-sync-dot" aria-hidden="true" />
      <span className="td-sync-text">{text}</span>
      {(state === "device" || state === "offline") && <span className="td-sync-sub">Sync not set up</span>}
    </div>
  );
}
