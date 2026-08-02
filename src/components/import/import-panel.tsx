"use client";

import { useEffect, useRef, useState } from "react";
import type { Diagnostic } from "@/reliability/diagnostics";
import { formatDiagnostic } from "@/reliability/diagnostics";
import type { ImportWarning } from "@/domain/memory/schema";
import { EXAMPLES } from "@/import/examples/catalog";
import { detectFormat } from "@/import/import-source";
import { readTextFileWithProgress } from "./read-file";
import { isPdfFile } from "@/import/read-pdf";
import {
  isDoclingRefinementBetter,
  readPdfQuick,
  scheduleDoclingRefine,
} from "@/import/docgraph";
import type { KnowledgeGraph } from "@/domain/memory/schema";
import { importSource } from "@/import/import-source";

/**
 * Bring information: paste, drop a file, or start from a checked-in sample.
 * Everything is understood locally. the source never leaves the browser.
 *
 * Once something has been brought, this panel is mostly done: it states what
 * is loaded and how it went, and folds the machinery for bringing something
 * *else* away behind one door. Replacing the current document is a destructive
 * act, so it is never one stray click away. and the samples in particular sat
 * inside the dropzone, where they read as a description of what you could drop
 * rather than as buttons that would overwrite your work.
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
  openBringRequest,
}: {
  sourceLabel: string;
  sourceOk: boolean;
  sourceText: string;
  errors: Diagnostic[];
  warnings: ImportWarning[];
  hasVerified: boolean;
  aiEnabled: boolean;
  onEditSource: (text: string) => void;
  onImport: (
    text: string,
    label: string,
    meta?: {
      filename?: string;
      fileType?: string;
      sizeBytes?: number | null;
      pages?: number | null;
      parseStatus?: string;
      uploadedAt?: string;
      knowledgeGraph?: KnowledgeGraph;
      parsedByDocling?: boolean;
      /** Quiet re-import (background Docling refine) — skip journey animation. */
      quiet?: boolean;
    },
  ) => void | Promise<void>;
  onUseExample: (id: "atlas-json" | "atlas-notes") => void;
  onUseVerified: () => void;
  onImproveWithAi: () => void;
  aiBusy: boolean;
  openBringRequest?: number;
}) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  // Open only while there is nothing to lose. With a document already
  // remembered, bringing another is a deliberate act behind a deliberate door.
  const [bringOpen, setBringOpen] = useState(!sourceOk);
  const fileInput = useRef<HTMLInputElement>(null);
  const format = detectFormat(sourceText);

  useEffect(() => {
    if (openBringRequest) setBringOpen(true);
  }, [openBringRequest]);

  const openFile = async (file: File) => {
    try {
      if (isPdfFile(file)) {
        // Always pdf.js first — never block the UI on Docling.
        const quick = await readPdfQuick(file);
        onEditSource(quick.text);
        const fast = importSource({ raw: quick.text, label: file.name });
        await onImport(quick.text, file.name, {
          filename: file.name,
          fileType: "PDF",
          uploadedAt: new Date().toLocaleString(),
          sizeBytes: file.size,
          pages: quick.pages,
          parseStatus: quick.truncated ? "first 40 pages remembered" : "understood",
        });

        const beforeArch = fast.ok ? fast.value.archetype?.id : null;
        const beforeBlocks = fast.ok ? fast.value.blocks.length : 0;
        const beforeEvidence =
          fast.ok
            ? (fast.value.blocks.find((b) => b.kind === "signals")?.payload as { entries?: unknown[] } | undefined)
                ?.entries?.length ?? 0
            : 0;

        scheduleDoclingRefine({
          file,
          quickText: quick.text,
          pages: quick.pages,
          archetype: beforeArch,
          beforeBlockCount: beforeBlocks,
          beforeEvidence,
          onRefine: async (refined) => {
            const candidate = importSource({
              raw: refined.markdown,
              label: file.name,
              parsedByDocling: true,
            });
            if (!candidate.ok) return;
            const afterEvidence =
              (candidate.value.blocks.find((b) => b.kind === "signals")?.payload as { entries?: unknown[] } | undefined)
                ?.entries?.length ?? 0;
            if (
              !isDoclingRefinementBetter({
                beforeArchetype: beforeArch,
                afterArchetype: candidate.value.archetype?.id,
                beforeBlockCount: beforeBlocks,
                afterBlockCount: candidate.value.blocks.length,
                beforeEvidence,
                afterEvidence,
                beforeText: quick.text,
                afterText: refined.markdown,
              })
            ) {
              return;
            }
            onEditSource(refined.markdown);
            await onImport(refined.markdown, file.name, {
              filename: file.name,
              fileType: "PDF",
              uploadedAt: new Date().toLocaleString(),
              sizeBytes: file.size,
              pages: refined.pages ?? quick.pages,
              parseStatus: refined.cache === "hit" ? "Docling refine (cached)" : "Docling refine",
              parsedByDocling: true,
              quiet: true,
            });
          },
        });
        return;
      }
      const { text } = await readTextFileWithProgress(file, () => {});
      onEditSource(text);
      await onImport(text, file.name, {
        filename: file.name,
        fileType: /\.json$/i.test(file.name) ? "JSON" : /\.md|markdown$/i.test(file.name) ? "Markdown" : "Plain text",
        uploadedAt: new Date().toLocaleString(),
        sizeBytes: file.size,
        pages: null,
        parseStatus: "understood",
      });
    } catch {
      onEditSource("");
    }
  };

  return (
    <section className="card" aria-labelledby="import-h">
      <div className="card-h" id="import-h">
        <h3>Bring information</h3>
        <span className="ct">pdf · json · md · txt</span>
      </div>
      <div className="card-b">
        <div className="srcrow">
          <span className="fn" title={sourceLabel}>
            {sourceLabel || "Nothing here yet"}
          </span>
          {sourceOk && <span className="st">✓ 6 memories</span>}
          {errors.length > 0 && <span className="st err">✕ {errors.length} {errors.length === 1 ? "error" : "errors"}</span>}
        </div>

        <button
          type="button"
          className="disclose"
          aria-expanded={bringOpen}
          onClick={() => setBringOpen((v) => !v)}
        >
          <span>{sourceOk ? "Bring something else" : "Bring information"}</span>
          <span className="chev" aria-hidden="true">
            {bringOpen ? "−" : "+"}
          </span>
        </button>

        {bringOpen && (
          <div className="disclosed">
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
                accept=".json,.md,.markdown,.txt,.pdf,application/json,text/plain,text/markdown,application/pdf"
                className="visually-hidden"
                aria-label="Choose a PDF, JSON, Markdown or text file"
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
              Drop a .pdf, .json, .md or .txt file here
              <div className="or">understood on arrival · PDFs: first 40 pages · never uploaded</div>
            </div>

            {pasteOpen && (
              <div>
                <textarea
                  className="paste-area"
                  aria-label="Paste JSON, Markdown or plain text"
                  placeholder={'{\"version\": 1, \"title\": \"…\", \"blocks\": [ … ]}\n\nor\n\n# Notes\n\n## Signals\n- ARR: $4.2M (+18%)'}
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
                    ? "Detected JSON: strict, all-or-nothing."
                    : format === "text"
                      ? "Detected notes: recognized locally, unclear text is kept."
                      : "Paste JSON, Markdown or plain text."}
                </p>
              </div>
            )}

            <div className="samples" role="group" aria-labelledby="samples-h">
              <p className="samples-h" id="samples-h">
                Or start from a sample: the same fictional company, written two ways
                {sourceOk ? ". This replaces what is loaded now." : "."}
              </p>
              {EXAMPLES.map((example) => (
                <button
                  key={example.id}
                  type="button"
                  className="sample-row"
                  onClick={() => onUseExample(example.id)}
                >
                  <span className="sr-name">{example.description}</span>
                  <span className="sr-file">{example.label}</span>
                </button>
              ))}
            </div>

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
            <p className="kept">Your last good memories are still on the right, untouched.</p>
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
      </div>
    </section>
  );
}
