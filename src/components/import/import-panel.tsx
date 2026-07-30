"use client";

import { useRef, useState } from "react";
import type { Diagnostic } from "@/reliability/diagnostics";
import { formatDiagnostic } from "@/reliability/diagnostics";
import type { ImportWarning } from "@/domain/memory/schema";
import { EXAMPLES } from "@/import/examples/catalog";
import { detectFormat } from "@/import/import-source";

/**
 * Bring information: paste, drop a file, or use a checked-in example.
 * Everything is understood locally — the source never leaves the browser.
 */
export function ImportPanel({
  sourceLabel,
  sourceOk,
  sourceText,
  errors,
  warnings,
  hasVerified,
  aiEnabled,
  onEditSource,
  onImport,
  onUseExample,
  onUseVerified,
  onImproveWithAi,
  aiBusy,
}: {
  sourceLabel: string;
  sourceOk: boolean;
  sourceText: string;
  errors: Diagnostic[];
  warnings: ImportWarning[];
  hasVerified: boolean;
  aiEnabled: boolean;
  onEditSource: (text: string) => void;
  onImport: (text: string, label: string) => void;
  onUseExample: (id: "atlas-json" | "atlas-notes") => void;
  onUseVerified: () => void;
  onImproveWithAi: () => void;
  aiBusy: boolean;
}) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const format = detectFormat(sourceText);

  const openFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      onEditSource(text);
      onImport(text, file.name);
    };
    reader.onerror = () => onEditSource("");
    reader.readAsText(file);
  };

  return (
    <section className="card" aria-labelledby="import-h">
      <div className="card-h" id="import-h">
        <h3>Bring information</h3>
        <span className="ct">json · md · txt</span>
      </div>
      <div className="card-b">
        <div className="srcrow">
          <span className="fn" title={sourceLabel}>
            {sourceLabel || "Nothing here yet"}
          </span>
          {sourceOk && <span className="st">✓ 6 memories</span>}
          {errors.length > 0 && <span className="st err">✕ {errors.length} {errors.length === 1 ? "error" : "errors"}</span>}
        </div>

        <div className="import-actions">
          <button type="button" className="mini-btn" onClick={() => setPasteOpen((v) => !v)} aria-expanded={pasteOpen}>
            Paste
          </button>
          <button type="button" className="mini-btn" onClick={() => fileInput.current?.click()}>
            Drop file
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,.md,.markdown,.txt,application/json,text/plain,text/markdown"
            className="visually-hidden"
            aria-label="Choose a JSON, Markdown or text file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) openFile(file);
              e.target.value = "";
            }}
          />
        </div>

        <div
          className={`dropzone${dragOver ? " over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) openFile(file);
          }}
        >
          Drop a .json, .md or .txt file here
          <div className="or">— understood on arrival, never uploaded —</div>
          <div className="example-chips" role="group" aria-label="Try a sample">
            {EXAMPLES.map((example) => (
              <button key={example.id} type="button" className="example-chip" onClick={() => onUseExample(example.id)}>
                {example.description}
              </button>
            ))}
          </div>
        </div>

        {pasteOpen && (
          <div>
            <textarea
              className="paste-area"
              aria-label="Paste JSON, Markdown or plain text"
              placeholder={'{"version": 1, "title": "…", "blocks": [ … ]}\n\n— or —\n\n# Notes\n\n## Signals\n- ARR: $4.2M (+18%)'}
              value={sourceText}
              onChange={(e) => onEditSource(e.target.value)}
              spellCheck={false}
            />
            <div className="import-actions">
              <button
                type="button"
                className="btn pri"
                style={{ flex: 1 }}
                onClick={() => onImport(sourceText, sourceLabel || "Pasted notes")}
                disabled={sourceText.trim().length === 0}
              >
                Remember this information
              </button>
            </div>
            <p className="import-note">
              {format === "json"
                ? "Detected JSON — strict, all-or-nothing."
                : format === "text"
                  ? "Detected notes — recognized locally, unclear text is kept."
                  : "Paste JSON, Markdown or plain text."}
            </p>
          </div>
        )}

        {errors.length > 0 && (
          <div className="error-box" role="alert">
            <p className="et">We couldn’t understand this {format === "json" ? "JSON" : "text"}. Nothing was changed.</p>
            <ul>
              {errors.slice(0, 6).map((error, i) => (
                <li key={i}>{formatDiagnostic(error)}</li>
              ))}
            </ul>
            {errors.length > 6 && <p className="kept">…and {errors.length - 6} more. Fix the source and try again.</p>}
            <p className="kept">Your last good memories are still on the right — untouched.</p>
          </div>
        )}

        {errors.length === 0 && warnings.length > 0 && (
          <div className="warning-box">
            <p className="wt">Understood, with notes</p>
            <ul>
              {warnings.map((warning, i) => (
                <li key={i}>{warning.message}</li>
              ))}
            </ul>
          </div>
        )}

        {hasVerified && (
          <div className="import-actions">
            <button type="button" className="mini-btn" onClick={onUseVerified}>
              Use verified example extraction
            </button>
          </div>
        )}

        {aiEnabled && sourceOk && (
          <div className="import-actions">
            <button type="button" className="mini-btn" onClick={onImproveWithAi} disabled={aiBusy}>
              {aiBusy ? "Improving…" : "Improve with AI (explicit)"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
