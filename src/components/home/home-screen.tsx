"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createAsyncOperation } from "../async-operation";
import type { Diagnostic } from "@/reliability/diagnostics";
import { formatDiagnostic } from "@/reliability/diagnostics";
import { detectFormat } from "@/import/import-source";
import { BrandMark } from "../ui/brand-mark";
import { TodayApp } from "../today/today-app";
import { HeroRecall } from "./hero-recall";
import { SearchProof, ThreeMoves } from "./story";
import "../today/today.css";
import "./landing.css";
import { formatBytes, readTextFileWithProgress } from "../import/read-file";
import { isPdfFile } from "@/import/read-pdf";
import {
  hasReadablePdfText,
  isDoclingRefinementBetter,
  readPdfQuick,
  refinedReadNote,
  scheduleDoclingRefine,
} from "@/import/docgraph";
import { importSource } from "@/import/import-source";
import type { KnowledgeGraph } from "@/domain/memory/schema";
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
 * Everything the workbench can do (memories, arrangement, the four outputs)
 * is withheld until there is something to do it to. The journey opens up as
 * the visitor advances rather than arriving all at once.
 */
export function HomeScreen({
  errors,
  onImport,
  onUseExample,
  onReplayBrand,
  onWatchDemo,
  understanding,
  fileOperations,
}: {
  errors: Diagnostic[];
  onImport: (
    text: string,
    label: string,
    meta?: Partial<SourceMeta> & {
      knowledgeGraph?: KnowledgeGraph;
      parsedByDocling?: boolean;
      quiet?: boolean;
    },
  ) => void | Promise<void>;
  onUseExample: (id: "atlas-json" | "atlas-notes") => void;
  onReplayBrand?: () => void;
  onWatchDemo?: () => void;
  understanding?: { stage: ImportStage; percent: number } | null;
  /** Workbench owns PDF refinement across the home-to-workbench transition. */
  fileOperations?: ReturnType<typeof createAsyncOperation>;
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
  const localFileWork = useRef(createAsyncOperation());
  const fileWork = fileOperations ?? localFileWork.current;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const local = localFileWork.current;
    return () => { mounted.current = false; if (!fileOperations) local.cancel(); };
  }, [fileOperations]);

  const openFile = async (file: File) => {
    const operation = fileWork.begin();
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
        const quick = await readPdfQuick(file, (percent) => {
          if (operation.isCurrent()) setReading({ name: file.name, size: file.size, percent });
        });
        if (!operation.isCurrent()) return;
        if (quick.note) setReadNote(quick.note);
        setReading({ name: file.name, size: file.size, percent: 100 });
        const fast = importSource({ raw: quick.text, label: file.name });
        await onImport(quick.text, file.name, {
          filename: file.name,
          fileType: "PDF",
          uploadedAt: new Date().toLocaleString(),
          sizeBytes: file.size,
          pages: quick.pages,
          parseStatus: `${!hasReadablePdfText(quick.text) ? "no readable text" : quick.truncated ? "first 40 pages remembered" : "understood"}${quick.ocrBlocks ? " - scan text via OCR, check numbers" : ""}`,
          readNote: quick.note,
        });
        if (!operation.isCurrent()) return;
        if (mounted.current) setReading(null);

        const beforeArch = fast.ok ? fast.value.archetype?.id : null;
        const beforeBlocks = fast.ok ? fast.value.blocks.length : 0;
        const beforeEvidence =
          fast.ok
            ? (fast.value.blocks.find((b) => b.kind === "signals")?.payload as { entries?: unknown[] } | undefined)
                ?.entries?.length ?? 0
            : 0;

        scheduleDoclingRefine({
          file,
          signal: operation.signal,
          quickText: quick.text,
          pages: quick.pages,
          archetype: beforeArch,
          beforeBlockCount: beforeBlocks,
          beforeEvidence,
          onRefine: async (refined) => {
            if (!operation.isCurrent()) return;
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
            if (mounted.current) setReadNote(
              refined.cache === "hit"
                ? "Refined with Docling (cached)."
                : "Refined with Docling in the background.",
            );
            await onImport(refined.markdown, file.name, {
              filename: file.name,
              fileType: "PDF",
              uploadedAt: new Date().toLocaleString(),
              sizeBytes: file.size,
              pages: refined.pages ?? quick.pages,
              parseStatus: refined.cache === "hit" ? "Docling refine (cached)" : "Docling refine",
              readNote: refinedReadNote(quick, refined.markdown),
              parsedByDocling: true,
              quiet: true,
            });
          },
        });
        return;
      }
      const { text } = await readTextFileWithProgress(file, ({ percent, visible }) => {
        if (!visible || !operation.isCurrent()) return;
        setReading((current) =>
          current ? { ...current, percent } : { name: file.name, size: file.size, percent },
        );
      });
      if (!operation.isCurrent()) return;
      setReading({ name: file.name, size: file.size, percent: 100 });
      await onImport(text, file.name, {
        filename: file.name,
        fileType: /\.json$/i.test(file.name) ? "JSON" : /\.md|markdown$/i.test(file.name) ? "Markdown" : "Plain text",
        uploadedAt: new Date().toLocaleString(),
        sizeBytes: file.size,
        pages: null,
        parseStatus: "understood",
      });
      if (operation.isCurrent()) setReading(null);
    } catch (error) {
      if (!operation.isCurrent()) return;
      setReading(null);
      setReadError(error instanceof Error ? error.message : "The file could not be read.");
    }
  };

  const endDrag = () => {
    dragDepth.current = 0;
    setDrag("none");
  };

  const format = detectFormat(pasted);

  const openWorkspace = () => {
    const el = document.getElementById("workspace");
    el?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    window.setTimeout(() => (el?.querySelector("textarea[aria-label='Entry text']") as HTMLTextAreaElement | null)?.focus({ preventScroll: true }), 450);
  };

  return (
    <main className="home lp" data-testid="home-screen">
      <nav className="lp-nav" aria-label="Site">
        <button type="button" className="home-brand lp-brand" onClick={onReplayBrand} aria-label="memoRABLE: play the brand moment again">
          <BrandMark size={26} />
          <span className="home-word">memo<b>RABLE</b></span>
        </button>
        <div className="lp-links">
          <a href="#moves">How it works</a>
          <a href="#proof">Search</a>
          <a href="#briefs">Briefs</a>
        </div>
        <button type="button" className="lp-cta" onClick={openWorkspace}>Open your workspace</button>
      </nav>

      <HeroRecall onOpenWorkspace={openWorkspace} />

      <div id="moves" className="lp-section"><ThreeMoves /></div>
      <div id="proof" className="lp-section"><SearchProof /></div>

      <section id="briefs" className="lp-section lp-briefs" aria-labelledby="briefs-h">
        <div className="home-entry-grid">
          <div className="home-entry">
            <h2 id="briefs-h" className="st-h">Turn a document into a brief you can forward.</h2>
            <p className="st-lede home-sub">
              Bring a report, RFC, research paper or meeting notes. memoRABLE reads it on this device and lays out the claims, numbers and risks, each linked to the passage it came from.
              Export it as an email, a web page or a document.
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
                      onClick={() => { fileWork.cancel(); void onImport(pasted, "Pasted notes"); }}
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
                      const wrong = Boolean(named) && !/^(text\/|application\/json|application\/pdf)/.test(named);
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
                      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 16V4" />
                        <path d="m7 9 5-5 5 5" />
                        <path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" />
                      </svg>
                    </span>
                    <span className="hc-title">Drop a file</span>
                    <span className="hc-sub">{drag === "reject" ? "that format isn’t read here" : "or click to choose"}</span>
                  </button>

                  <button type="button" className="home-card paste-choice" onClick={() => { fileWork.cancel(); setMode("paste"); }}>
                    <span className="hc-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="5" y="3" width="14" height="18" rx="2" />
                        <path d="M9 8h6M9 12h6M9 16h3" />
                      </svg>
                    </span>
                    <span className="hc-title">Paste text</span>
                    <span className="hc-sub">notes, Markdown or memoRABLE JSON</span>
                  </button>
                </div>
                <p className="home-limits">PDF, Markdown, plain text or memoRABLE JSON, up to 2 MB. PDFs: the first 40 pages.</p>
              </>
            )}
            <p className="home-footnote">
              Nothing to hand?{" "}
              <button type="button" className="linkish" onClick={() => { fileWork.cancel(); onUseExample("atlas-json"); }}>
                Open a sample brief
              </button>
              {onWatchDemo ? (
                <>
                  {", or "}
                  <button type="button" className="linkish" onClick={onWatchDemo} data-testid="watch-demo">
                    Watch the 1-minute demo
                  </button>
                </>
              ) : null}
            </p>
          </div>
          <section className="home-real-sample" aria-labelledby="home-sample-title">
            <div>
              <small>A sample from a fictional invoice</small>
              <h3 id="home-sample-title">See what comes out.</h3>
              <p>Two line items reconcile to the stated total, and every amount links to its source passage.</p>
              <div className="home-sample-actions">
                <button type="button" className="btn pri" onClick={async()=>{const operation=fileWork.begin();setReadError(null);try{const response=await fetch("/examples/sample-invoice.md",{signal:operation.signal});if(!response.ok)throw Error();const text=await response.text();if(!operation.isCurrent())return;void onImport(text,"sample-invoice.md");}catch{if(operation.isCurrent())setReadError("The sample could not load. Bring a file or try again.");}}}>Open this sample</button>
                <a href="/examples/sample-invoice.md" download>Read the synthetic source</a>
              </div>
            </div>
            <Image unoptimized src="/examples/sample-invoice-preview.png" width={872} height={605} alt="Sample rendered invoice: $12,000 and $3,500 line items, a proportional bar and evidence links reconcile to $15,500. Fictional source." />
          </section>
        </div>

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

        {readNote && <p className="home-note" role="status">{readNote}</p>}
        {readError && <p className="home-error" role="alert">{readError}</p>}
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
      </section>

      <section id="workspace" className="lp-workspace" aria-label="Your workspace">
        <TodayApp embedded />
      </section>

      <footer className="lp-foot">
        <div>
          <p className="lp-foot-brand">memo<b>RABLE</b></p>
          <p>Memory for engineering work.</p>
        </div>
        <ul className="lp-facts">
          <li>Your notes are stored in this browser (IndexedDB). There is no account and no server copy.</li>
          <li>Search runs on this device. Connecting a repo sends requests from your browser straight to GitHub.</li>
          <li>Deleting a note removes its text from this device and from every search answer.</li>
        </ul>
        {tally && (
          <p className="home-tally" data-testid="local-tally">
            {tally}, counted in this browser and nowhere else.
          </p>
        )}
      </footer>
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
