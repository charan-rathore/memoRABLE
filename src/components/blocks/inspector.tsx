"use client";

import type { MemoryBlock } from "@/domain/memory/schema";
import { BLOCK_KIND_LABELS, PROVENANCE_METHOD_LABELS } from "@/domain/memory/schema";

/**
 * Inspector: what a memory contains and exactly where it came from —
 * "Remembered from" method, locator and escaped excerpt. Selecting or
 * keyboard-focusing a memory brings this up.
 */
export function Inspector({
  block,
  onViewSource,
}: {
  block: MemoryBlock | null;
  onViewSource: (block: MemoryBlock) => void;
}) {
  if (!block) {
    return (
      <section className="card" aria-labelledby="insp-h">
        <div className="card-h" id="insp-h">
          <h3>Inspector</h3>
        </div>
        <div className="card-b">
          <p style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
            Choose a memory to see what it contains — and exactly where it came from.
          </p>
        </div>
      </section>
    );
  }

  const fields = fieldSummary(block);
  return (
    <section className="card" aria-labelledby="insp-h" data-testid="inspector">
      <div className="card-h" id="insp-h">
        <h3>Inspector</h3>
        <span className="ct">block: {block.kind}</span>
      </div>
      <div className="card-b">
        <div className="insp-head">
          <h3>{block.title}</h3>
          <span className="insp-kind">{BLOCK_KIND_LABELS[block.kind].toLowerCase()}</span>
        </div>
      </div>
      <div className="insp-sec">
        <h4>What it holds</h4>
        <div className="field-rows">
          {fields.map((f) => (
            <div className="field-row" key={f.key}>
              <span className="fk">{f.key}</span>
              <span className="fv" title={f.value}>
                {f.value}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="insp-sec">
        <div className="prov">
          <span className="plabel">Remembered from</span>
          <span className="pmethod">
            <span className="pillchip">{PROVENANCE_METHOD_LABELS[block.provenance.method]}</span>
          </span>
          <span className="ploc">
            {block.provenance.locator} · {block.provenance.label}
          </span>
          {block.provenance.excerpt && <blockquote className="pex">{block.provenance.excerpt}</blockquote>}
          <div>
            <button type="button" className="btn ghost small" onClick={() => onViewSource(block)}>
              View source
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function fieldSummary(block: MemoryBlock): { key: string; value: string }[] {
  const payload = block.payload;
  if ("summary" in payload) {
    return [
      { key: "heading", value: payload.heading },
      { key: "summary", value: `${payload.summary.length} chars` },
      ...(payload.byline ? [{ key: "byline", value: payload.byline }] : []),
      ...(payload.notes?.length ? [{ key: "kept text", value: `${payload.notes.length} lines` }] : []),
    ];
  }
  const entries = payload.entries.length;
  const sample =
    entries > 0 && "label" in payload.entries[0]!
      ? String((payload.entries[0] as { label: string }).label)
      : entries > 0 && "text" in payload.entries[0]!
        ? `${String((payload.entries[0] as { text: string }).text).slice(0, 32)}…`
        : entries > 0 && "title" in payload.entries[0]!
          ? String((payload.entries[0] as { title: string }).title)
          : entries > 0 && "risk" in payload.entries[0]!
            ? `${String((payload.entries[0] as { risk: string }).risk).slice(0, 32)}…`
            : entries > 0 && "task" in payload.entries[0]!
              ? `${String((payload.entries[0] as { task: string }).task).slice(0, 32)}…`
              : "—";
  return [
    { key: "entries", value: String(entries) },
    { key: "first", value: sample },
    ...(payload.notes?.length ? [{ key: "kept text", value: `${payload.notes.length} lines` }] : []),
  ];
}
