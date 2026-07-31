"use client";

import { useEffect, useMemo, useRef } from "react";
import type { MemoryBlock } from "@/domain/memory/schema";
import { PROVENANCE_METHOD_LABELS } from "@/domain/memory/schema";

/**
 * Source highlight — the trust interaction.
 * On open/select: scrolls to the exact lines, highlights the paragraph,
 * then the first matching sentence. Content is text nodes only.
 */
export function SourceModal({
  block,
  sourceText,
  softLines,
  onClose,
}: {
  block: MemoryBlock;
  sourceText: string;
  /** Hover preview lines (soft highlight) when a different memory is hovered. */
  softLines?: Set<number> | null;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const firstHlRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const lines = useMemo(() => sourceText.split("\n"), [sourceText]);
  const highlighted = useMemo(() => highlightRange(sourceText, block), [sourceText, block]);
  const sentence = useMemo(() => sentenceOnLines(sourceText, block, highlighted), [sourceText, block, highlighted]);

  useEffect(() => {
    firstHlRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [block.id, highlighted]);

  return (
    <div className="scrim" role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="source-modal-title">
        <div className="modal-h">
          <h2 id="source-modal-title">Remembered from</h2>
          <span className="pillchip">{PROVENANCE_METHOD_LABELS[block.provenance.method]}</span>
          <button ref={closeRef} type="button" className="x" aria-label="Close source view" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-b">
          <p style={{ font: "11.5px var(--mono)", color: "var(--ink-2)", marginBottom: 10 }}>
            {block.provenance.locator} · {block.provenance.label}. the {block.title} memory comes from these
            exact lines.
          </p>
          <div className="source-view" data-testid="source-view" ref={viewRef}>
            {lines.map((line, i) => {
              const n = i + 1;
              const hard = highlighted.has(n);
              const soft = !hard && Boolean(softLines?.has(n));
              const isFirst = hard && [...highlighted][0] === n;
              return (
                <div
                  key={i}
                  ref={isFirst ? firstHlRef : undefined}
                  className={`ln${hard ? " hl" : ""}${soft ? " hl-soft" : ""}${hard ? " hl-pulse" : ""}`}
                >
                  <span className="no">{n}</span>
                  <span className="txt">
                    {hard && sentence.line === n ? (
                      <>
                        {line.slice(0, sentence.start)}
                        <mark className="sent-hl">{line.slice(sentence.start, sentence.end) || " "}</mark>
                        {line.slice(sentence.end)}
                      </>
                    ) : (
                      line || " "
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="modal-f">
          <span style={{ font: "11px var(--mono)", color: "var(--ink-3)", flex: 1 }}>
            Nothing here leaves your browser.
          </span>
          <button type="button" className="btn ghost small" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Highlight only the heading the memory traces to (one line), never the
 * whole following paragraph.
 */
export function highlightRange(sourceText: string, block: MemoryBlock): Set<number> {
  const lines = sourceText.split("\n");
  let anchor = 0;
  const range = /lines? (\d+)(?:–(\d+))?/.exec(block.provenance.locator);
  if (range) {
    anchor = Number(range[1]);
  } else {
    const needle = block.provenance.excerpt.slice(0, 40).trim();
    if (needle.length >= 8) {
      const index = lines.findIndex(
        (l) => needle.startsWith(l.trim().slice(0, 40)) || l.includes(needle.slice(0, 30)),
      );
      if (index >= 0) anchor = index + 1;
    }
  }
  if (anchor < 1 || anchor > lines.length) return new Set();
  return new Set([nearestHeadingLine(lines, anchor)]);
}

function isHeadingLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/^#{1,6}\s+\S/.test(t)) return true;
  if (/^[A-Z0-9][A-Z0-9 /&:,.()-]{2,90}$/.test(t) && t.length <= 90) return true;
  if (
    /^(POSITIONS|ACADEMIC|EXPERIENCE|EDUCATION|SKILLS|PROJECTS|SUMMARY|OBJECTIVE|RISKS?|SIGNALS?|DECISIONS?|ACTIONS?|TIMELINE|BACKGROUND|INTRODUCTION)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  // Short title-like line that doesn't end like a sentence.
  if (t.length <= 72 && /^[A-Z]/.test(t) && !/[.!?]$/.test(t) && !/^[-*•]/.test(t)) return true;
  return false;
}

function nearestHeadingLine(lines: string[], from1: number): number {
  for (let i = from1; i >= 1; i--) {
    if (isHeadingLine(lines[i - 1] ?? "")) return i;
  }
  for (let i = from1; i <= lines.length; i++) {
    if (isHeadingLine(lines[i - 1] ?? "")) return i;
  }
  return from1;
}

/** Mark the whole heading line (not a sentence slice of a body paragraph). */
function sentenceOnLines(
  sourceText: string,
  _block: MemoryBlock,
  highlighted: Set<number>,
): { line: number; start: number; end: number } {
  const empty = { line: 0, start: 0, end: 0 };
  const first = [...highlighted][0];
  if (first === undefined) return empty;
  const text = sourceText.split("\n")[first - 1] ?? "";
  const trimmed = text.trimStart();
  const lead = text.length - trimmed.length;
  return { line: first, start: lead, end: text.length };
}
