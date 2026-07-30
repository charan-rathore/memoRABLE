"use client";

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
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <BrandMark />
        <span className="wordmark">
          memo<b>RABLE</b>
        </span>
      </div>
      <span className="vr" aria-hidden="true" />
      <div className="doc-title">
        <span className="t">{documentTitle}</span>
        <span className="n">{blockCount} blocks</span>
      </div>
      <div className="topright">
        <span className="ai-chip" title={aiEnabled ? "AI improvement is enabled on this server" : "AI is off — everything runs locally"}>
          {aiEnabled ? "AI on" : "AI off · local"}
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
        <button type="button" className="btn pri" onClick={onPublish} disabled={!canPublish}>
          Publish
        </button>
      </div>
    </header>
  );
}
