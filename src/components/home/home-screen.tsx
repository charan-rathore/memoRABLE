"use client";

import { useEffect, useRef, useState } from "react";
import type { Diagnostic } from "@/reliability/diagnostics";
import { formatDiagnostic } from "@/reliability/diagnostics";
import { detectFormat } from "@/import/import-source";
import { BrandMark } from "../ui/brand-mark";
import { StaggerTitle } from "../ui/stagger-title";
import { formatBytes, readTextFileWithProgress } from "../import/read-file";
import { isPdfFile, pdfTruncationNote, readPdfFile } from "@/import/read-pdf";
import type { SourceMeta } from "../journey-strip";
import { readStats, summarize } from "@/stats/local-stats";
import {
  IMPORT_STAGE_LABEL,
  type ImportStage,
} from "../import/import-stages";

const ACCEPTED = /\.(json|md|markdown|txt|pdf)$/i;
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * The first screen. One decision only: bring a file, or paste text.
 *
 * Everything the workbench can do (memories, arrangement, the three outputs)
 * is withheld until there is something to do it to. The journey opens up as
 * the visitor advances rather than arriving all at once.
 */
export function HomeScreen({
  errors,
  onImport,
  onUseExample,
  onReplayBrand,
  understanding,
}: {
  errors: Diagnostic[];
  onImport: (text: string, label: string, meta?: Partial<SourceMeta>) => void | Promise<void>;
  onUseExample: (id: "atlas-json" | "atlas-notes") => void;
  onReplayBrand?: () => void;
  understanding?: { stage: ImportStage; percent: number } | null;
}) {
  const [mode, setMode] = useState<"choose" | "paste">("choose");
  const [drag, setDrag] = useState<"none" | "over" | "reject">("none");
  const [pasted, setPasted] = useState("");
  const [reading, setReading] = useState<{ name: string; size: number; percent: number } | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [readNote, setReadNote] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [tally, setTally] = useState<string | null>(null);
  useEffect(() => setTally(summarize(readStats())), []);
  const dragDepth = useRef(0);

  const openFile = async (file: File) => {
    setReadError(null);
    setReadNote(null);
    if (!ACCEPTED.test(file.name) && !isPdfFile(file)) {
      setReadError(`“${file.name}” isn’t a format we read. Try PDF, Markdown, plain text or memoRABLE JSON.`);
      return;
    }
    if (file.size > MAX_BYTES) {
      setReadError(`“${file.name}” is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_BYTES)}.`);
      return;
    }
    try {
      if (isPdfFile(file)) {
        setReading({ name: file.name, size: file.size, percent: 4 });
        const result = await readPdfFile(file, (percent) => {
          setReading({ name: file.name, size: file.size, percent });
        });
        if (result.truncated) setReadNote(pdfTruncationNote(result.pages));
        setReading({ name: file.name, size: file.size, percent: 100 });
        await onImport(result.text, file.name, {
          filename: file.name,
          fileType: "PDF",
          uploadedAt: new Date().toLocaleString(),
          sizeBytes: file.size,
          pages: result.truncated ? 40 : result.pages,
          parseStatus: result.truncated ? "first 40 pages remembered" : "understood",
        });
        setReading(null);
        return;
      }
      const { text } = await readTextFileWithProgress(file, ({ percent, visible }) => {
        if (!visible) return;
        setReading((current) =>
          current ? { ...current, percent } : { name: file.name, size: file.size, percent },
        );
      });
      setReading({ name: file.name, size: file.size, percent: 100 });
      await onImport(text, file.name, {
        filename: file.name,
        fileType: /\.json$/i.test(file.name) ? "JSON" : /\.md|markdown$/i.test(file.name) ? "Markdown" : "Plain text",
        uploadedAt: new Date().toLocaleString(),
        sizeBytes: file.size,
        pages: null,
        parseStatus: "understood",
      });
      setReading(null);
    } catch (error) {
      setReading(null);
      setReadError(error instanceof Error ? error.message : "The file could not be read.");
    }
  };

  const endDrag = () => {
    dragDepth.current = 0;
    setDrag("none");
  };

  const format = detectFormat(pasted);

  return (
    <main className="home" data-testid="home-screen">
      <div className="home-inner">
        <button type="button" className="home-brand" onClick={onReplayBrand} aria-label="memoRABLE: play the brand moment again">
          <BrandMark size={34} />
          <span className="home-word">
            memo<b>RABLE</b>
          </span>
        </button>

        <StaggerTitle text="Turn information into memory." className="home-title sweep" />
        <p className="home-sub rise-in">
          Bring one document. Leave with reusable memories. Every memory stays linked to its source.
        </p>

        {understanding ? (
          <ReadingCard
            name="Remembering"
            size={0}
            percent={understanding.percent}
            label={IMPORT_STAGE_LABEL[understanding.stage]}
          />
        ) : reading ? (
          <ReadingCard name={reading.name} size={reading.size} percent={reading.percent} />
        ) : mode === "paste" ? (
          <div className="home-card paste">
            <textarea
              className="home-paste"
              aria-label="Paste JSON, Markdown or plain text"
              autoFocus
              placeholder={"# Quarterly brief\n\n## Signals\n- ARR: $4.2M (+18%)\n\n## Risks\n- Lead times (high): dual-sourcing underway"}
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              spellCheck={false}
            />
            <div className="home-paste-foot">
              <span className="home-fmt">
                {format === "json"
                  ? "Detected JSON: strict, all-or-nothing."
                  : format === "text"
                    ? "Detected notes: recognized locally, unclear text is kept."
                    : "JSON, Markdown or plain text."}
              </span>
              <div className="home-paste-actions">
                <button type="button" className="btn ghost" onClick={() => setMode("choose")}>
                  Back
                </button>
                <button
                  type="button"
                  className="btn pri"
                  disabled={pasted.trim().length === 0}
                  onClick={() => onImport(pasted, "Pasted notes")}
                >
                  Remember this
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
          <div className="home-choices">
            <button
              type="button"
              className={`home-card drop${drag === "none" ? "" : ` ${drag}`}`}
              onClick={() => fileInput.current?.click()}
              onDragEnter={(e) => {
                e.preventDefault();
                dragDepth.current += 1;
                const item = e.dataTransfer.items?.[0];
                const named = item?.kind === "file" ? item.type : "";
                const wrong =
                  Boolean(named) &&
                  !/^(text\/|application\/json|application\/pdf)/.test(named);
                setDrag(wrong ? "reject" : "over");
              }}
              onDragOver={(e) => e.preventDefault()}
              onDragLeave={() => {
                dragDepth.current -= 1;
                if (dragDepth.current <= 0) endDrag();
              }}
              onDrop={(e) => {
                e.preventDefault();
                endDrag();
                const file = e.dataTransfer.files?.[0];
                if (file) void openFile(file);
              }}
            >
              <span className="hc-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 16V4" />
                  <path d="m7 9 5-5 5 5" />
                  <path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" />
                </svg>
              </span>
              <span className="hc-title">Drop a file</span>
              <span className="hc-sub">
                {drag === "reject" ? "that format isn’t read here" : "or click to choose"}
              </span>
            </button>

            <button type="button" className="home-card paste-choice" onClick={() => setMode("paste")}>
              <span className="hc-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="3" width="14" height="18" rx="2" />
                  <path d="M9 8h6M9 12h6M9 16h3" />
                </svg>
              </span>
              <span className="hc-title">Paste text</span>
              <span className="hc-sub">notes, Markdown or memoRABLE JSON</span>
            </button>
          </div>
          <p className="home-limits">
            Bring something worth remembering. Best for Meeting Notes, RFCs, Reports, Research Papers, READMEs, Specs and Guides.
          </p>
          <p className="home-limits home-limits-sub">
            PDF · Markdown · plain text · memoRABLE JSON · up to 2 MB · PDFs: first 40 pages
          </p>
          </>
        )}

        <input
          ref={fileInput}
          type="file"
          accept=".json,.md,.markdown,.txt,.pdf,application/json,text/plain,text/markdown,application/pdf"
          className="visually-hidden"
          aria-label="Choose a PDF, JSON, Markdown or text file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void openFile(file);
            e.target.value = "";
          }}
        />

        {readNote && (
          <p className="home-note" role="status">
            {readNote}
          </p>
        )}

        {readError && (
          <p className="home-error" role="alert">
            {readError}
          </p>
        )}

        {errors.length > 0 && (
          <div className="home-error-box" role="alert">
            <p className="et">We couldn’t understand that. Nothing was changed.</p>
            <ul>
              {errors.slice(0, 4).map((error, i) => (
                <li key={i}>{formatDiagnostic(error)}</li>
              ))}
            </ul>
          </div>
        )}

        <p className="home-footnote">
          Nothing to hand?{" "}
          <button type="button" className="linkish" onClick={() => onUseExample("atlas-json")}>
            Open a sample brief
          </button>
        </p>

        {tally && (
          <p className="home-tally" data-testid="local-tally">
            {tally}, counted in this browser and nowhere else.
          </p>
        )}
      </div>
    </main>
  );
}

function ReadingCard({
  name,
  size,
  percent,
  label,
}: {
  name: string;
  size: number;
  percent: number;
  label?: string;
}) {
  const rounded = Math.round(percent);
  const foot =
    label ??
    (rounded < 100 ? "Reading locally" : "Understanding") +
      (size > 0 ? ` · ${formatBytes(size)}` : "");
  return (
    <div className="home-card reading" data-testid="read-progress">
      <div className="rd-top">
        <span className="rd-name" title={name}>
          {name}
        </span>
        <span className="rd-pct">{rounded}%</span>
      </div>
      <div
        className="rd-track"
        role="progressbar"
        aria-valuenow={rounded}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? `Reading ${name}`}
      >
        <span className="rd-fill" style={{ width: `${percent}%` }} />
      </div>
      <div className="rd-foot">{foot}</div>
    </div>
  );
}
