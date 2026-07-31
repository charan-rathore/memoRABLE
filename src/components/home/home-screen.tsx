"use client";

import { useRef, useState } from "react";
import type { Diagnostic } from "@/reliability/diagnostics";
import { formatDiagnostic } from "@/reliability/diagnostics";
import { detectFormat } from "@/import/import-source";
import { BrandMark } from "../ui/brand-mark";
import { formatBytes, readTextFileWithProgress } from "../import/read-file";

/**
 * The first screen. One decision only: bring a file, or paste text.
 *
 * Everything the workbench can do — memories, arrangement, the three outputs —
 * is withheld until there is something to do it to. The journey opens up as
 * the visitor advances rather than arriving all at once.
 */
export function HomeScreen({
  errors,
  onImport,
  onUseExample,
}: {
  errors: Diagnostic[];
  onImport: (text: string, label: string) => void;
  onUseExample: (id: "atlas-json" | "atlas-notes") => void;
}) {
  const [mode, setMode] = useState<"choose" | "paste">("choose");
  const [dragOver, setDragOver] = useState(false);
  const [pasted, setPasted] = useState("");
  const [reading, setReading] = useState<{ name: string; size: number; percent: number } | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const openFile = async (file: File) => {
    setReadError(null);
    setReading({ name: file.name, size: file.size, percent: 0 });
    try {
      const { text } = await readTextFileWithProgress(file, (percent) =>
        setReading((current) => (current ? { ...current, percent } : current)),
      );
      setReading(null);
      onImport(text, file.name);
    } catch (error) {
      setReading(null);
      setReadError(error instanceof Error ? error.message : "The file could not be read.");
    }
  };

  const format = detectFormat(pasted);

  return (
    <main className="home" data-testid="home-screen">
      <div className="home-inner">
        <div className="home-brand">
          <BrandMark size={34} />
          <span className="home-word">
            memo<b>RABLE</b>
          </span>
        </div>

        <h1 className="home-title">Turn information into memory.</h1>
        <p className="home-sub">
          Bring a document. It is understood here, in this browser, and never uploaded.
        </p>

        {reading ? (
          <ReadingCard name={reading.name} size={reading.size} percent={reading.percent} />
        ) : mode === "paste" ? (
          <div className="home-card paste">
            <textarea
              className="home-paste"
              aria-label="Paste JSON, Markdown or plain text"
              autoFocus
              placeholder={"# Quarterly brief\n\n## Signals\n- ARR: $4.2M (+18%)\n\n## Risks\n- Lead times — high — dual-sourcing underway"}
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              spellCheck={false}
            />
            <div className="home-paste-foot">
              <span className="home-fmt">
                {format === "json"
                  ? "Detected JSON — strict, all-or-nothing."
                  : format === "text"
                    ? "Detected notes — recognized locally, unclear text is kept."
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
          <div className="home-choices">
            <button
              type="button"
              className={`home-card drop${dragOver ? " over" : ""}`}
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
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
              <span className="hc-sub">or click to choose · json · md · txt</span>
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
        )}

        <input
          ref={fileInput}
          type="file"
          accept=".json,.md,.markdown,.txt,application/json,text/plain,text/markdown"
          className="visually-hidden"
          aria-label="Choose a JSON, Markdown or text file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void openFile(file);
            e.target.value = "";
          }}
        />

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
      </div>
    </main>
  );
}

function ReadingCard({ name, size, percent }: { name: string; size: number; percent: number }) {
  const rounded = Math.round(percent);
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
        aria-label={`Reading ${name}`}
      >
        <span className="rd-fill" style={{ width: `${percent}%` }} />
      </div>
      <div className="rd-foot">
        {rounded < 100 ? "Reading locally" : "Understanding"} · {formatBytes(size)}
      </div>
    </div>
  );
}
