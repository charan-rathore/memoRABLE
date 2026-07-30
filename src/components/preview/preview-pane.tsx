"use client";

import { useEffect, useState } from "react";
import { OUTPUT_MODE_LABELS, type OutputMode } from "@/domain/memory/types";

/**
 * The actual output, always: a sandboxed iframe containing the generated
 * Elements HTML. sandbox="" — no scripts, same-origin, forms, popups or
 * navigation. What you see is exactly what you download.
 */
export function PreviewPane({
  mode,
  html,
  stale,
  error,
  documentTitle,
  blockCount,
}: {
  mode: OutputMode;
  html: string | null;
  stale: boolean;
  error: string | null;
  documentTitle: string;
  blockCount: number;
}) {
  const [displayed, setDisplayed] = useState(html);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (html !== displayed) {
      setFading(true);
      const t = setTimeout(() => {
        setDisplayed(html);
        setFading(false);
      }, 150);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [html, displayed]);

  const addr = `memorable.local/${mode}/${documentTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  return (
    <div>
      <div className="doc-tools">
        <span className="crumb">
          publish: <b>{mode}</b> · {blockCount} memories · {mode === "email" ? "600px" : mode === "document" ? "A4 · print-ready" : "fluid"}
        </span>
        <span className="spacer" />
        {stale && <span className="crumb">showing last good output</span>}
      </div>
      {error && !displayed && (
        <div className="mode-error" role="alert">
          The {OUTPUT_MODE_LABELS[mode]} output couldn’t be rendered. Your source and the other outputs are
          unaffected.
        </div>
      )}
      {displayed && (
        <div className={`preview-frame ${mode === "email" ? "email" : ""}`}>
          <div className="bar" aria-hidden="true">
            <span className="dots">
              <span className="dot" style={{ display: "inline-block", marginRight: 5 }} />
              <span className="dot" style={{ display: "inline-block", marginRight: 5 }} />
              <span className="dot" style={{ display: "inline-block" }} />
            </span>
            <span className="addr">{addr}</span>
          </div>
          <iframe
            title={`${OUTPUT_MODE_LABELS[mode]} output preview`}
            sandbox=""
            referrerPolicy="no-referrer"
            srcDoc={displayed}
            style={{ opacity: fading ? 0.4 : 1 }}
          />
        </div>
      )}
      <div className="preview-foot">
        <span>Created from {blockCount} source-linked Memory Blocks</span>
        <span aria-hidden="true">·</span>
        <span>rendered with Unlayer Elements 0.1.20</span>
      </div>
    </div>
  );
}
