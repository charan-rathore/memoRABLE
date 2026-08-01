"use client";

import { useEffect, useState } from "react";
import type { WorkbenchState } from "./workbench-state";
import { OUTPUT_MODE_LABELS } from "@/domain/memory/types";
import { formatBytes } from "./import/read-file";

export type StepStatus = "done" | "live" | "pending" | "error";

export interface SourceMeta {
  filename: string;
  fileType: string;
  uploadedAt: string;
  sizeBytes: number | null;
  pages: number | null;
  parseStatus: string;
}

export interface JourneyStep {
  key: string;
  index: string;
  label: string;
  detail: string;
  status: StepStatus;
  lines: string[];
}

const CARD_OPEN_MS = 5200;

function fileTypeOf(label: string): string {
  const lower = label.toLowerCase();
  if (lower.endsWith(".pdf")) return "PDF";
  if (lower.endsWith(".json")) return "JSON";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "Markdown";
  if (lower.endsWith(".txt")) return "Plain text";
  if (label === "Pasted notes") return "Pasted text";
  return "Document";
}

function countTables(sourceText: string): number {
  const pipeRows = sourceText.split("\n").filter((l) => (l.match(/\|/g) ?? []).length >= 2).length;
  return Math.floor(pipeRows / 2);
}

function countImages(sourceText: string): number {
  return (sourceText.match(/!\[[^\]]*\]\([^)]+\)|<img\b/gi) ?? []).length;
}

function countSections(sourceText: string): number {
  return sourceText.split("\n").filter((l) => /^#{1,3}\s+\S/.test(l.trim())).length;
}

export function journeyOf(
  state: WorkbenchState,
  replayStep: number | null,
  meta: SourceMeta | null,
): JourneyStep[] {
  const hasDoc = state.document !== null;
  const hasErrors = state.errors.length > 0;
  const kinds = state.document?.blocks.map((b) => b.title).join(", ") ?? "";
  const sections = countSections(state.sourceText);
  const tables = countTables(state.sourceText);
  const images = countImages(state.sourceText);

  const bringLines = hasDoc
    ? [
        `Filename: ${meta?.filename ?? state.sourceLabel}`,
        `File type: ${meta?.fileType ?? fileTypeOf(state.sourceLabel)}`,
        `Upload time: ${meta?.uploadedAt ?? (state.importedAt ? new Date(state.importedAt).toLocaleString() : "just now")}`,
        `Size: ${meta?.sizeBytes != null ? formatBytes(meta.sizeBytes) : formatBytes(new TextEncoder().encode(state.sourceText).length)}`,
        `Pages: ${meta?.pages != null ? String(meta.pages) : "n/a (text)"}`,
        `Parsing status: ${meta?.parseStatus ?? (hasErrors ? "failed" : "understood")}`,
      ]
    : [
        "Filename: nothing here yet",
        "File type: pdf, json, md or txt",
        "Upload time: waiting",
        "Size: waiting",
        "Pages: waiting",
        "Parsing status: waiting",
      ];

  const steps: JourneyStep[] = [
    {
      key: "bring",
      index: "01",
      label: "Bring information",
      detail: state.sourceLabel || "paste or drop to begin",
      status: hasErrors ? "error" : hasDoc ? "done" : "pending",
      lines: bringLines,
    },
    {
      key: "understand",
      index: "02",
      label: "Understand",
      detail: hasErrors
        ? `couldn't understand · ${state.errors.length} ${state.errors.length === 1 ? "error" : "errors"}`
        : hasDoc
          ? `${state.document!.blocks.length} memories projected`
          : "waiting",
      status: hasErrors ? "error" : hasDoc ? "done" : "pending",
      lines: hasDoc
        ? (() => {
            const arch = state.document!.archetype;
            const scores = arch?.scores;
            const reasons = arch?.reasons ?? [];
            return [
              `Projected memories: ${kinds}`,
              `Detected Archetype: ${arch?.label ?? "Generic Knowledge"}`,
              scores
                ? `Raw Scores: Resume ${scores.resume} · Research ${scores.research} · Invoice ${scores.invoice}`
                : "Raw Scores: —",
              `Projection: ${arch?.label ?? "Generic Knowledge"}${
                typeof arch?.score === "number" ? ` (${arch.score})` : ""
              }`,
              reasons.length > 0
                ? `Reason: ${reasons.map((r) => `✓ ${r}`).join(" ")}`
                : "Reason: fallback (no specialized winner)",
              `Sections recognized: ${sections || "structure inferred"} · tables ${tables} · images ${images}`,
              `Parsing summary: ${hasErrors ? "errors kept source unchanged" : "local, deterministic"}`,
            ];
          })()
        : [
            "Projected memories: waiting",
            "Detected Archetype: waiting",
            "Raw Scores: waiting",
            "Projection: waiting",
            "Reason: waiting",
            "Sections recognized: waiting",
            "Parsing summary: waiting",
          ],
    },
    {
      key: "remember",
      index: "03",
      label: "Remember",
      detail: hasDoc ? `${state.document!.blocks.length} memories` : "0 memories",
      status: hasErrors ? "error" : hasDoc ? "done" : "pending",
      lines: hasDoc
        ? [
            `${state.document!.blocks.length} grounded memories`,
            "Each keeps method, locator and excerpt",
            "Click a memory to see its source heading",
            "Nothing is invented beyond the source",
          ]
        : [
            "0 grounded memories",
            "Waiting for something to remember",
            "Snapshot, Signals, Decisions…",
            "Every memory will link to its source",
          ],
    },
    {
      key: "arrange",
      index: "04",
      label: "Arrange",
      detail: hasDoc ? `${state.document!.blocks.length} in place` : "·",
      status: hasErrors ? "error" : hasDoc ? "done" : "pending",
      lines: hasDoc
        ? [
            `${state.document!.blocks.length} memories in publication order`,
            "Use ↑ ↓ on a selected memory to reorder",
            "Ids and provenance survive reordering",
            "Order feeds Email, Web and Document",
          ]
        : [
            "Nothing to arrange yet",
            "Bring a document first",
            "Then reorder with ↑ ↓",
            "Publication follows your order",
          ],
    },
    {
      key: "publish",
      index: "05",
      label: "Publish",
      detail: state.publishedAt ? "Published" : hasDoc ? `${OUTPUT_MODE_LABELS[state.mode]} · ready` : "·",
      status: hasErrors ? "error" : state.publishedAt ? "done" : hasDoc ? "live" : "pending",
      lines: hasDoc
        ? [
            `Active mode: ${OUTPUT_MODE_LABELS[state.mode]}`,
            "Composed with Unlayer Elements",
            state.publishedAt ? "Status: Published" : "Status: ready to publish",
            "One memory, three surfaces",
          ]
        : [
            "Active mode: waiting",
            "Composed with Unlayer Elements",
            "Status: waiting",
            "Bring a document to publish",
          ],
    },
  ];

  if (replayStep !== null) {
    const order = ["bring", "understand", "remember", "arrange", "publish"];
    return steps.map((step, i) =>
      order[replayStep] === step.key
        ? { ...step, status: "live" }
        : i < replayStep
          ? { ...step, status: "done" }
          : step,
    );
  }
  return steps;
}

/**
 * Horizontal marquee of journey steps. Click a step to peek its info card;
 * the card auto-closes after a few seconds. Hover pauses the scroll.
 */
export function JourneyStrip({
  state,
  replayStep,
  sourceMeta,
}: {
  state: WorkbenchState;
  replayStep: number | null;
  sourceMeta?: SourceMeta | null;
}) {
  const steps = journeyOf(state, replayStep, sourceMeta ?? null);
  const [openKey, setOpenKey] = useState<string | null>(null);

  useEffect(() => {
    if (!openKey) return;
    const t = window.setTimeout(() => setOpenKey(null), CARD_OPEN_MS);
    return () => window.clearTimeout(t);
  }, [openKey]);

  const openStep = steps.find((s) => s.key === openKey) ?? null;

  const renderSteps = (suffix: string, inert = false) =>
    steps.map((step, i) => (
      <span key={`${suffix}-${step.key}`} style={{ display: "contents" }}>
        {i > 0 && (
          <span className="psep" aria-hidden="true">
            →
          </span>
        )}
        <button
          type="button"
          className={`pstep ${step.status}${openKey === step.key ? " peek" : ""}`}
          onClick={() => {
            if (inert) return;
            setOpenKey((k) => (k === step.key ? null : step.key));
          }}
          tabIndex={inert ? -1 : 0}
          aria-hidden={inert || undefined}
          aria-expanded={!inert && openKey === step.key}
          aria-controls={!inert && openKey === step.key ? "journey-peek" : undefined}
          title={`Show what ${step.label} means`}
        >
          <span className="dot" aria-hidden="true" />
          <span className="k">{step.index}</span>
          <b>{step.label}</b>
          <span className="pdetail">{step.detail}</span>
        </button>
      </span>
    ));

  return (
    <div className={`pipe-wrap${openKey ? " paused" : ""}`}>
      <div className="pipe" aria-label="Your progress">
        <div className="pipe-viewport">
          <div className="pipe-track">
            <nav className="pipe-group">{renderSteps("a")}</nav>
            <nav className="pipe-group" aria-hidden="true">
              {renderSteps("b", true)}
            </nav>
          </div>
        </div>
        <span className="pmeta">
          {state.document ? `publish: ${state.mode} · ${state.document.blocks.length} memories` : "nothing here yet"}
        </span>
      </div>
      {openStep && (
        <article id="journey-peek" className={`jcard jcard-peek ${openStep.status}`} aria-live="polite">
          <header className="jcard-h">
            <span className="dot" aria-hidden="true" />
            <span className="k">{openStep.index}</span>
            <b>{openStep.label}</b>
            <span className="jcard-hint">closes shortly</span>
          </header>
          <ul className="jcard-lines">
            {openStep.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </article>
      )}
    </div>
  );
}
