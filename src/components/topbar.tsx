"use client";

import { useEffect, useMemo, useState } from "react";
import { OUTPUT_MODES, OUTPUT_MODE_LABELS, type OutputMode } from "@/domain/memory/types";
import { BrandMark } from "./ui/brand-mark";
import { PUBLISH_THEMES, PUBLISH_THEME_IDS, type PublishThemeId } from "@/render/themes";
import { searchLibraryDocs, type LibraryDoc } from "@/stats/doc-library";

export function Topbar({
  documentTitle,
  blockCount,
  mode,
  onModeChange,
  theme,
  onThemeChange,
  onOpenRecent,
  aiEnabled,
  replayActive,
  onReplay,
  onPublish,
  canPublish,
  onHome,
  onNewDoc,
  onRegenerate,
  regenerateBusy,
}: {
  documentTitle: string;
  blockCount: number;
  mode: OutputMode;
  onModeChange: (mode: OutputMode) => void;
  theme: PublishThemeId;
  onThemeChange: (theme: PublishThemeId) => void;
  onOpenRecent: (text: string, label: string) => void;
  aiEnabled: boolean;
  replayActive: boolean;
  onReplay: () => void;
  onPublish: () => void;
  canPublish: boolean;
  onHome: () => void;
  onNewDoc: () => void;
  onRegenerate: () => void;
  regenerateBusy?: boolean;
}) {
  const [aiOpen, setAiOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [library, setLibrary] = useState<LibraryDoc[]>([]);

  useEffect(() => {
    if (searchOpen) setLibrary(searchLibraryDocs(query));
  }, [searchOpen, query]);

  const results = useMemo(() => (searchOpen ? searchLibraryDocs(query) : library), [searchOpen, query, library]);

  return (
    <header className="topbar">
      <div className="topbar-nav">
        <button type="button" className="nav-back" onClick={onHome} aria-label="Back to start">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Back</span>
        </button>
        <span className="vr" aria-hidden="true" />
        <button type="button" className="brand" onClick={onHome} aria-label="memoRABLE home">
          <BrandMark />
          <span className="wordmark">
            memo<b>RABLE</b>
          </span>
        </button>
        <span className="vr" aria-hidden="true" />
        <div className="doc-title">
          <span className="t">{documentTitle}</span>
          <span className="n">{blockCount} memories</span>
        </div>
      </div>

      <div className="topbar-actions">
        <button type="button" className="btn ghost small action-new" onClick={onNewDoc}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          New doc
        </button>
        <button
          type="button"
          className="btn ghost small action-regen"
          onClick={onRegenerate}
          disabled={!canPublish || regenerateBusy}
          title="Re-process the current document"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M13.5 8A5.5 5.5 0 1 1 8 2.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path d="M8 1v3.5L10.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {regenerateBusy ? "Processing…" : "Regenerate"}
        </button>
      </div>

      <div className="doc-search" data-testid="doc-search">
        <label className="visually-hidden" htmlFor="doc-search-input">
          Search recent documents
        </label>
        <input
          id="doc-search-input"
          type="search"
          placeholder="Recent docs…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSearchOpen(true);
          }}
          onFocus={() => setSearchOpen(true)}
          onBlur={() => setTimeout(() => setSearchOpen(false), 180)}
          autoComplete="off"
        />
        {searchOpen && (
          <div className="doc-search-pop" role="listbox" aria-label="Recent documents (kept 7 days)">
            {results.length === 0 ? (
              <p className="doc-search-empty">No recent documents yet. Brought files stay here for 7 days.</p>
            ) : (
              results.slice(0, 8).map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="doc-search-item"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onOpenRecent(doc.sourceText, doc.label);
                    setSearchOpen(false);
                    setQuery("");
                  }}
                >
                  <span className="dsi-title">{doc.title}</span>
                  <span className="dsi-meta">{doc.label}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <div className="topbar-controls">
        <span className="ai-wrap">
          <button
            type="button"
            className="ai-chip"
            aria-expanded={aiOpen}
            onClick={() => setAiOpen((open) => !open)}
          >
            {aiEnabled ? "AI on" : "AI off · local"}
          </button>
          {aiOpen && (
            <span className="ai-pop" role="status">
              {aiEnabled ? (
                <>
                  <b>AI is available on this deployment.</b> The local parser still runs first and produces the
                  result you see. AI only ever re-reads your source to improve that result, and you invoke it
                  deliberately from the Bring panel. It is never automatic.
                </>
              ) : (
                <>
                  <b>There is no switch, and that is the point.</b> Every memory on this page was recognized by a
                  parser running in your browser. Your document was never uploaded, so there is nothing to turn
                  off. AI is an optional server-side second pass an operator enables with an API key; on this
                  public demo it stays off so nothing you paste ever leaves the machine.
                </>
              )}
            </span>
          )}
        </span>

        <span className="ai-wrap">
          <button
            type="button"
            className="preset-btn"
            aria-expanded={themeOpen}
            aria-haspopup="listbox"
            onClick={() => setThemeOpen((open) => !open)}
          >
            <span className="preset-label">Preset</span>
            <span className="preset-value">{PUBLISH_THEMES[theme].label}</span>
            <svg className="preset-chev" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {themeOpen && (
            <span className="ai-pop theme-pop" role="listbox" aria-label="Publication presets">
              <p style={{ margin: "0 0 6px", fontSize: 11.5, color: "var(--ink-3)" }}>
                Academic · Minimal · Executive · Editorial. One click retunes type, spacing, colour, charts and layout.
              </p>
              {PUBLISH_THEME_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`theme-opt${id === theme ? " on" : ""}`}
                  onClick={() => {
                    onThemeChange(id);
                    setThemeOpen(false);
                  }}
                >
                  <b>{PUBLISH_THEMES[id].label}</b>
                  <span>{PUBLISH_THEMES[id].description}</span>
                </button>
              ))}
            </span>
          )}
        </span>

        <div className="seg seg-hero" role="group" aria-label="Output mode">
          {OUTPUT_MODES.map((m) => (
            <button
              key={m}
              type="button"
              className={m === mode ? "on" : undefined}
              aria-pressed={m === mode}
              onClick={() => onModeChange(m)}
            >
              {OUTPUT_MODE_LABELS[m]}
            </button>
          ))}
        </div>

        <button
          type="button"
          className={`btn ghost replay-btn${replayActive ? " active" : ""}`}
          onClick={onReplay}
          aria-pressed={replayActive}
          aria-label={replayActive ? "Stop replay" : "Replay the 20-second story"}
        >
          {replayActive ? (
            <>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <rect x="4" y="3" width="3" height="10" rx="0.5" fill="currentColor" />
                <rect x="9" y="3" width="3" height="10" rx="0.5" fill="currentColor" />
              </svg>
              Stop replay
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M4 3.5v9l9-4.5-9-4.5z" fill="currentColor" />
              </svg>
              Replay story
            </>
          )}
        </button>

        <button
          type="button"
          className="btn pri magnetic"
          onClick={onPublish}
          disabled={!canPublish}
          onPointerMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            e.currentTarget.style.setProperty("--mx", `${((e.clientX - rect.left) / rect.width) * 100}%`);
            e.currentTarget.style.setProperty("--my", `${((e.clientY - rect.top) / rect.height) * 100}%`);
          }}
        >
          Publish
        </button>
      </div>
    </header>
  );
}
