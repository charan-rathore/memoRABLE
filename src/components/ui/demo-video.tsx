"use client";

import Image from "next/image";
import { useEffect } from "react";

/**
 * A short demo that opens once after the brand splash on a first visit.
 * Uses the checked-in walkthrough until a longer recording is shipped;
 * Escape or the close control dismisses it immediately.
 */
export function DemoVideo({ onClose }: { onClose: () => void }) {
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
      <div className="demo-card" onClick={(e) => e.stopPropagation()} role="document">
        <div className="demo-h">
          <h2 id="demo-h">Twenty seconds of memoRABLE</h2>
          <button type="button" className="x" aria-label="Close demo" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="demo-body">
          <Image
            className="demo-gif"
            src="/media/replay.gif"
            alt="A twenty-second walkthrough of bringing a brief, seeing six memories, and publishing three outputs."
            width={1200}
            height={750}
            unoptimized
            priority
          />
          <p className="demo-caption">
            Bring a document → six memories → a web page, an email and a print-ready document.
            Nothing leaves this browser.
          </p>
          <button type="button" className="btn pri" onClick={onClose}>
            Start with a document
          </button>
        </div>
      </div>
    </div>
  );
}
