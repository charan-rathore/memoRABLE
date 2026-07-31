"use client";

import type { WorkbenchState } from "./workbench-state";
import { OUTPUT_MODE_LABELS } from "@/domain/memory/types";
import { BLOCK_KIND_LABELS } from "@/domain/memory/schema";
import { formatBytes } from "./import/read-file";

export type StepStatus = "done" | "live" | "pending" | "error";

/** Optional file facts collected at bring-time (size, pages, etc.). */
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
  status: StepStatus;
  lines: string[];
}

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

/** The persistent human journey: 01 Bring → … → 05 Publish as info cards. */
export function journeyOf(
  state: WorkbenchState,
  replayStep: number | null,
  meta: SourceMeta | null,
): JourneyStep[] {
  const hasDoc = state.document !== null;
  const hasErrors = state.errors.length > 0;
  const kinds = state.document?.blocks.map((b) => BLOCK_KIND_LABELS[b.kind]).join(", ") ?? "";
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
      status: hasErrors ? "error" : hasDoc ? "done" : "pending",
      lines: bringLines,
    },
    {
      key: "understand",
      index: "02",
      label: "Understand",
      status: hasErrors ? "error" : hasDoc ? "done" : "pending",
      lines: hasDoc
        ? [
            `Six memory types: ${kinds}`,
            `Sections recognized: ${sections || "structure inferred"}`,
            `Tables detected: ${tables}`,
            `Images detected: ${images}`,
            `Parsing summary: ${hasErrors ? "errors kept source unchanged" : "local, deterministic"}`,
          ]
        : [
            "Six memory types: waiting",
            "Sections recognized: waiting",
            "Tables detected: waiting",
            "Images detected: waiting",
            "Parsing summary: waiting",
          ],
    },
    {
      key: "remember",
      index: "03",
      label: "Remember",
      status: hasErrors ? "error" : hasDoc ? "done" : "pending",
      lines: hasDoc
        ? [
            `${state.document!.blocks.length} grounded memories`,
            "Each keeps method, locator and excerpt",
            "Click a memory to see its source lines",
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
  return (
    <nav className="pipe pipe-cards" aria-label="Your progress">
      {steps.map((step) => (
        <article key={step.key} className={`jcard ${step.status}`} aria-label={step.label}>
          <header className="jcard-h">
            <span className="dot" aria-hidden="true" />
            <span className="k">{step.index}</span>
            <b>{step.label}</b>
          </header>
          <ul className="jcard-lines">
            {step.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </article>
      ))}
    </nav>
  );
}
