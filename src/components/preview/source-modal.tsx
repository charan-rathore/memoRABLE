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
 * Find the 1-based source lines a block came from. Prefers the locator's
 * explicit line range; otherwise locates the excerpt in the source.
 */
export function highlightRange(sourceText: string, block: MemoryBlock): Set<number> {
  const lines = sourceText.split("\n");
  const range = /lines? (\d+)(?:–(\d+))?/.exec(block.provenance.locator);
  if (range) {
    const start = Number(range[1]);
    const end = range[2] ? Number(range[2]) : start;
    const set = new Set<number>();
    for (let i = start; i <= Math.min(end, lines.length); i++) set.add(i);
    return set;
  }
  const needle = block.provenance.excerpt.slice(0, 40).trim();
  const set = new Set<number>();
  if (needle.length >= 8) {
    const index = lines.findIndex((l) => needle.startsWith(l.trim().slice(0, 40)) || l.includes(needle.slice(0, 30)));
    if (index >= 0) {
      for (let i = index; i < Math.min(index + 4, lines.length); i++) set.add(i + 1);
    }
  }
  return set;
}

function sentenceOnLines(
  sourceText: string,
  block: MemoryBlock,
  lines: Set<number>,
): { line: number; start: number; end: number } {
  const empty = { line: 0, start: 0, end: 0 };
  const first = [...lines][0];
  if (first === undefined) return empty;
  const all = sourceText.split("\n");
  const text = all[first - 1] ?? "";
  const excerpt = block.provenance.excerpt.trim();
  if (excerpt.length >= 6) {
    const idx = text.toLowerCase().indexOf(excerpt.slice(0, 48).toLowerCase());
    if (idx >= 0) {
      return { line: first, start: idx, end: Math.min(text.length, idx + Math.min(excerpt.length, 120)) };
    }
  }
  const match = /[^.!?]+[.!?]/.exec(text);
  if (match && match.index != null) {
    return { line: first, start: match.index, end: match.index + match[0].length };
  }
  return { line: first, start: 0, end: Math.min(text.length, 80) };
}
