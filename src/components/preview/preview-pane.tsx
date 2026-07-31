"use client";

import { useEffect, useRef, useState } from "react";
import { OUTPUT_MODE_LABELS, type OutputMode } from "@/domain/memory/types";
import { ElementsStory } from "./elements-story";
import type { PublishThemeId } from "@/render/themes";

/**
 * Sandboxed iframe of Elements HTML.
 * allow-same-origin lets us wire in-document #section-* jumps (Cover, Signals…)
 * without enabling scripts.
 */
export function PreviewPane({
  mode,
  html,
  stale,
  error,
  documentTitle,
  blockCount,
  theme = "editorial",
}: {
  mode: OutputMode;
  html: string | null;
  stale: boolean;
  error: string | null;
  documentTitle: string;
  blockCount: number;
  theme?: PublishThemeId;
}) {
  const [displayed, setDisplayed] = useState(html);
  const [fading, setFading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

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

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !displayed) return;

    const wire = () => {
      const doc = iframe.contentDocument;
      if (!doc) return;

      const scrollToHash = (hash: string) => {
        const id = hash.replace(/^#/, "");
        if (!id) return;
        const target =
          doc.querySelector(`[name="${CSS.escape(id)}"]`) ||
          doc.getElementById(id) ||
          doc.querySelector(`a[name="${CSS.escape(id)}"]`);
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      };

      doc.querySelectorAll('a[href^="#"]').forEach((anchor) => {
        const el = anchor as HTMLAnchorElement;
        el.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          scrollToHash(el.getAttribute("href") || "");
        });
      });
    };

    iframe.addEventListener("load", wire);
    // srcDoc may already be loaded when we attach.
    try {
      wire();
    } catch {
      /* cross-origin or empty */
    }
    return () => iframe.removeEventListener("load", wire);
  }, [displayed, mode]);

  const addr = `memorable.local/${mode}/${documentTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  return (
    <div>
      <div className="doc-tools">
        <span className="crumb">
          publish: <b>{mode}</b> · {blockCount} memories · {mode === "email" ? "600px" : mode === "document" ? "A4 · print-ready" : "fluid"}
        </span>
        <span className="composed-chip" key={mode} data-testid="composed-chip">
          Composed using Elements
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
            ref={iframeRef}
            title={`${OUTPUT_MODE_LABELS[mode]} output preview`}
            sandbox="allow-same-origin"
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
      <ElementsStory mode={mode} blockCount={blockCount} theme={theme} />
    </div>
  );
}
