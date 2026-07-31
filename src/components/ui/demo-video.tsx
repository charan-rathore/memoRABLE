"use client";

import { useEffect, useState } from "react";

/**
 * First-visit (and on-demand) demo: play the 1-minute reel with sound,
 * or switch to the silent GIF if the visitor prefers a quiet preview.
 */
export function DemoVideo({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<"video" | "gif">("video");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="scrim demo-scrim"
      role="dialog"
      aria-modal="true"
      aria-labelledby="demo-h"
      data-testid="demo-video"
      onClick={onClose}
    >
      <div className="demo-card demo-card-wide" onClick={(e) => e.stopPropagation()} role="document">
        <div className="demo-h">
          <h2 id="demo-h">One minute of memoRABLE</h2>
          <button type="button" className="x" aria-label="Close demo" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="demo-body">
          <div className="demo-toggle" role="group" aria-label="Demo format">
            <button
              type="button"
              className={mode === "video" ? "on" : undefined}
              aria-pressed={mode === "video"}
              onClick={() => setMode("video")}
            >
              Video + sound
            </button>
            <button
              type="button"
              className={mode === "gif" ? "on" : undefined}
              aria-pressed={mode === "gif"}
              onClick={() => setMode("gif")}
            >
              Silent GIF
            </button>
          </div>

          {mode === "video" ? (
            <video
              className="demo-player"
              src="/media/demo.mp4"
              controls
              playsInline
              preload="metadata"
              poster="/media/01-document-first.png"
            >
              <a href="/media/demo.mp4">Download the demo video</a>
            </video>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- intentional GIF preview
            <img
              className="demo-gif"
              src="/media/replay.gif"
              alt="Silent walkthrough of bringing a brief, seeing six memories, and publishing three outputs."
              width={1200}
              height={750}
            />
          )}

          <p className="demo-caption">
            Bring a document → six grounded memories → Email, Web and Document with Unlayer Elements.
            Nothing leaves this browser.{" "}
            <a href="/media/demo.mp4" download>
              Download MP4
            </a>
          </p>
          <button type="button" className="btn pri" onClick={onClose}>
            Start with a document
          </button>
        </div>
      </div>
    </div>
  );
}
