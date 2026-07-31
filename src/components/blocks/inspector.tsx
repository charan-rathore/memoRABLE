"use client";

import type { MemoryBlock, MemoryDocument, MemoryRelation } from "@/domain/memory/schema";
import {
  BLOCK_KIND_LABELS,
  MEMORY_RELATION_LABELS,
  PROVENANCE_METHOD_LABELS,
} from "@/domain/memory/schema";

/**
 * Inspector: what a memory contains and exactly where it came from.
 * Selecting or keyboard-focusing a memory brings this up.
 */
export function Inspector({
  block,
  document,
  onViewSource,
  onSelectRelated,
}: {
  block: MemoryBlock | null;
  document?: MemoryDocument | null;
  onViewSource: (block: MemoryBlock) => void;
  onSelectRelated?: (blockId: string) => void;
}) {
  if (!block) {
    return (
      <section className="card" aria-labelledby="insp-h">
        <div className="card-h" id="insp-h">
          <h3>Inspector</h3>
        </div>
        <div className="card-b">
          <p style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
            Choose a memory to see what it contains, and exactly where it came from.
          </p>
        </div>
      </section>
    );
  }

  const fields = fieldSummary(block);
  const related = relatedFor(block, document?.relations ?? [], document?.blocks ?? []);

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
      {related.length > 0 ? (
        <div className="insp-sec">
          <h4>How it talks to the rest</h4>
          <div className="field-rows">
            {related.map((edge) => (
              <button
                key={edge.key}
                type="button"
                className="field-row talk"
                onClick={() => edge.blockId && onSelectRelated?.(edge.blockId)}
                disabled={!edge.blockId || !onSelectRelated}
              >
                <span className="fk">{edge.verb}</span>
                <span className="fv">{edge.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
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
      ...(payload.hook ? [{ key: "hook", value: payload.hook }] : []),
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
              : "·";

  const reasoning: { key: string; value: string }[] = [];
  if (entries > 0 && "implication" in payload.entries[0]! && (payload.entries[0] as { implication?: string }).implication) {
    reasoning.push({ key: "implies", value: String((payload.entries[0] as { implication?: string }).implication) });
  }
  if (entries > 0 && "because" in payload.entries[0]! && (payload.entries[0] as { because?: string }).because) {
    reasoning.push({ key: "because", value: String((payload.entries[0] as { because?: string }).because) });
  }
  if (entries > 0 && "consequence" in payload.entries[0]! && (payload.entries[0] as { consequence?: string }).consequence) {
    reasoning.push({ key: "costs", value: String((payload.entries[0] as { consequence?: string }).consequence) });
  }
  if (entries > 0 && "from" in payload.entries[0]! && (payload.entries[0] as { from?: string }).from) {
    reasoning.push({ key: "from", value: String((payload.entries[0] as { from?: string }).from) });
  }

  return [
    { key: "entries", value: String(entries) },
    { key: "first", value: sample },
    ...reasoning,
    ...(payload.notes?.length ? [{ key: "kept text", value: `${payload.notes.length} lines` }] : []),
  ];
}

function relatedFor(
  block: MemoryBlock,
  relations: readonly MemoryRelation[],
  blocks: readonly MemoryBlock[],
): { key: string; verb: string; label: string; blockId: string | null }[] {
  const kindOf = (ref: string) => ref.split(":")[0]!;
  const titleOf = (kind: string) =>
    blocks.find((b) => b.kind === kind)?.title ?? BLOCK_KIND_LABELS[kind as MemoryBlock["kind"]] ?? kind;

  const out: { key: string; verb: string; label: string; blockId: string | null }[] = [];
  for (const edge of relations) {
    const fromKind = kindOf(edge.from);
    const toKind = kindOf(edge.to);
    if (fromKind !== block.kind && toKind !== block.kind) continue;
    const otherKind = fromKind === block.kind ? toKind : fromKind;
    const other = blocks.find((b) => b.kind === otherKind);
    out.push({
      key: `${edge.from}-${edge.relation}-${edge.to}`,
      verb: MEMORY_RELATION_LABELS[edge.relation],
      label: edge.note ?? titleOf(otherKind),
      blockId: other?.id ?? null,
    });
    if (out.length >= 6) break;
  }
  return out;
}
