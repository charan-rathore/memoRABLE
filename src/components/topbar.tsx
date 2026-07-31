"use client";

import { useState } from "react";
import { OUTPUT_MODES, OUTPUT_MODE_LABELS, type OutputMode } from "@/domain/memory/types";
import { BrandMark } from "./ui/brand-mark";

export function Topbar({
  documentTitle,
  blockCount,
  mode,
  onModeChange,
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
  aiEnabled: boolean;
  replayActive: boolean;
  onReplay: () => void;
  onPublish: () => void;
  canPublish: boolean;
  onHome: () => void;
}) {
  const [aiOpen, setAiOpen] = useState(false);
  return (
    <header className="topbar">
      <button type="button" className="brand" onClick={onHome} aria-label="memoRABLE — back to the start">
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
                  deliberately from the Bring panel — it is never automatic.
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
        <div className="seg" role="group" aria-label="Output mode">
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
