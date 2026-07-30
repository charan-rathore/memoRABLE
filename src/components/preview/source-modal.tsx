"use client";

import { useEffect, useMemo, useRef } from "react";
import type { MemoryBlock } from "@/domain/memory/schema";
import { PROVENANCE_METHOD_LABELS } from "@/domain/memory/schema";

/**
 * Source highlight — the trust interaction. The remembered source is shown
 * with the exact lines the selected memory came from highlighted. Content is
 * rendered as text nodes (never HTML).
 */
export function SourceModal({
  block,
  sourceText,
  onClose,
}: {
  block: MemoryBlock;
  sourceText: string;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
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
            {block.provenance.locator} · {block.provenance.label} — the {block.title} memory comes from these
            exact lines.
          </p>
          <div className="source-view" data-testid="source-view">
            {lines.map((line, i) => (
              <div key={i} className={`ln${highlighted.has(i + 1) ? " hl" : ""}`}>
                <span className="no">{i + 1}</span>
                <span className="txt">{line || " "}</span>
              </div>
            ))}
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
  // Fall back to locating the block's excerpt (first 40 chars) in the source.
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
