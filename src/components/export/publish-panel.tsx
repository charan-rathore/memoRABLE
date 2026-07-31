"use client";

import { useEffect, useRef, useState } from "react";
import { OUTPUT_MODES, OUTPUT_MODE_LABELS, type OutputMode } from "@/domain/memory/types";
import type { WorkbenchState } from "../workbench-state";
import { canonicalJsonString } from "@/render/export-source";
import { baseNameFor, copyToClipboard, downloadTextFile } from "@/utils/download";
import { buildWordDocument, printHtmlDocument } from "@/utils/print-export";

/**
 * Publish: the confirmation that ends on value — "Published." with all three
 * outputs side by side, then honest downloads. Unlayer JSON is offered only
 * when the design JSON validated; a failed Blob download offers copy instead.
 */
export function PublishPanel({
  state,
  onClose,
  onDownloaded,
}: {
  state: WorkbenchState;
  onClose: () => void;
  onDownloaded: (message: string) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [copyNote, setCopyNote] = useState<string | null>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!state.document) return null;
  const doc = state.document;
  const base = baseNameFor(doc.title);

  const download = (mode: OutputMode) => {
    const html = state.outputs[mode]?.html ?? state.lastGood[mode]?.html;
    if (!html) return;
    const result = downloadTextFile({
      filename: `${base}-${mode}.html`,
      content: html,
      mimeType: "text/html",
    });
    if (result.ok) {
      onDownloaded(`Downloaded the ${OUTPUT_MODE_LABELS[mode]} output.`);
    } else {
      void copyToClipboard(html).then((copied) =>
        setCopyNote(copied ? "Download failed — the HTML was copied to your clipboard instead." : "Download failed and clipboard is unavailable."),
      );
    }
  };

  const htmlFor = (mode: OutputMode) => state.outputs[mode]?.html ?? state.lastGood[mode]?.html ?? null;

  const printPdf = (mode: OutputMode) => {
    const html = htmlFor(mode);
    if (!html) return;
    const result = printHtmlDocument(html);
    if (result.ok) {
      onDownloaded(`Opened the print dialog — choose “Save as PDF” to keep the ${OUTPUT_MODE_LABELS[mode]} output.`);
    } else {
      setCopyNote("Printing is unavailable in this browser — download the HTML and print it instead.");
    }
  };

  const downloadWord = (mode: OutputMode) => {
    const html = htmlFor(mode);
    if (!html) return;
    const result = downloadTextFile({
      filename: `${base}-${mode}.doc`,
      content: buildWordDocument(html, doc.title),
      mimeType: "application/msword",
    });
    if (result.ok) onDownloaded(`Downloaded the ${OUTPUT_MODE_LABELS[mode]} output as a Word document.`);
  };

  const downloadCanonical = () => {
    const result = downloadTextFile({
      filename: `${base}.memorable.json`,
      content: canonicalJsonString(doc),
      mimeType: "application/json",
    });
    if (result.ok) onDownloaded("Downloaded the memoRABLE JSON.");
  };

  const downloadUnlayer = (mode: OutputMode) => {
    const output = state.outputs[mode];
    if (!output?.designJson) return;
    const result = downloadTextFile({
      filename: `${base}-${mode}.unlayer.json`,
      content: JSON.stringify(output.designJson, null, 2) + "\n",
      mimeType: "application/json",
    });
    if (result.ok) onDownloaded(`Downloaded the Unlayer design JSON (${mode}).`);
  };

  return (
    <div className="scrim" role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-title"
        style={{ width: "min(860px, 100%)" }}
      >
        <div className="modal-h">
          <h2 id="publish-title" className="visually-hidden">
            Published
          </h2>
          <div className="published-head" style={{ margin: 0, flex: 1 }}>
            <span className="tick" aria-hidden="true">
              ✓
            </span>
            <h2>Published.</h2>
          </div>
          <button ref={closeRef} type="button" className="x" aria-label="Close publish panel" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-b">
          <p className="published-sub">
            <b>{doc.title}</b> — one memory, three useful outputs. Created from {doc.blocks.length} source-linked
            Memory Blocks.
          </p>
          <div className="publish-grid">
            {OUTPUT_MODES.map((mode) => {
              const output = state.outputs[mode];
              const html = output?.html ?? state.lastGood[mode]?.html ?? null;
              return (
                <div className="pub-card" key={mode}>
                  <div className="pc-h">
                    {OUTPUT_MODE_LABELS[mode]}
                    <span className="tag">{mode === "email" ? "600px" : mode === "document" ? "A4" : "fluid"}</span>
                  </div>
                  {html ? (
                    <div className="pc-thumb">
                      <iframe title={`${OUTPUT_MODE_LABELS[mode]} thumbnail`} sandbox="" referrerPolicy="no-referrer" srcDoc={html} />
                    </div>
                  ) : (
                    <div style={{ padding: 16, fontSize: 12, color: "var(--ink-3)" }}>
                      This output couldn’t be rendered.
                    </div>
                  )}
                  <div className="pc-a">
                    <button type="button" className="btn pri small" onClick={() => download(mode)} disabled={!html}>
                      HTML
                    </button>
                    <button
                      type="button"
                      className="btn ghost small"
                      onClick={() => printPdf(mode)}
                      disabled={!html}
                      title="Opens the print dialog — choose “Save as PDF”"
                    >
                      PDF
                    </button>
                    <button
                      type="button"
                      className="btn ghost small"
                      onClick={() => downloadWord(mode)}
                      disabled={!html}
                      title="Downloads a .doc file that Word opens directly"
                    >
                      Word
                    </button>
                    <button
                      type="button"
                      className="btn ghost small"
                      onClick={() => downloadUnlayer(mode)}
                      disabled={!output?.designJson}
                      title={output?.designJson ? "Unlayer design JSON" : (output?.designJsonError ?? "Design JSON unavailable")}
                    >
                      JSON
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="dev-exports">
            <span className="lbl">Developer exports</span>
            <button type="button" className="btn ghost small" onClick={downloadCanonical}>
              memoRABLE JSON (canonical)
            </button>
            {copyNote && <span className="copy-note">{copyNote}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
