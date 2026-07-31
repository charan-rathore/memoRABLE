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
      <button type="button" className="brand" onClick={onHome} aria-label="memoRABLE. back to the start">
        <BrandMark />
        <span className="wordmark">
          memo<b>RABLE</b>
        </span>
      </button>
      <span className="vr" aria-hidden="true" />
      <div className="doc-title">
        <span className="t">{documentTitle}</span>
        <span className="n">{blockCount} blocks</span>
      </div>

      <div className="doc-search" data-testid="doc-search">
        <label className="visually-hidden" htmlFor="doc-search-input">
          Search recent documents
        </label>
        <input
          id="doc-search-input"
          type="search"
          placeholder="Search recent docs…"
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

      <div className="topright">
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
            className="ai-chip"
            aria-expanded={themeOpen}
            onClick={() => setThemeOpen((open) => !open)}
            title="Publication theme"
          >
            Theme · {PUBLISH_THEMES[theme].label}
          </button>
          {themeOpen && (
            <span className="ai-pop theme-pop" role="listbox" aria-label="Publication themes">
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
        <button type="button" className="btn ghost" onClick={onReplay}>
          {replayActive ? "Stop replay" : "Replay the 20-second story"}
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
