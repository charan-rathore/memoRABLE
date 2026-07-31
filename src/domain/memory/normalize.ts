import { buildRelations } from "@/understanding/graph";
import { contentHashOf, shortHash, stableBlockId } from "./canonicalize";
import type {
  BlockKind,
  BlockProvenance,
  ImportWarning,
  MemoryBlock,
  MemoryDocument,
  MemoryRelation,
  MemorySource,
  ProvenanceMethod,
} from "./schema";
import { BLOCK_KIND_LABELS } from "./schema";

/**
 * Normalization: validated parts → canonical MemoryDocumentV1 with stable
 * ids, per-block provenance and a content hash. This is the single place
 * where documents become canonical, so every import path (JSON, local text,
 * verified example, AI) produces identical structures.
 */

export interface BlockInput {
  kind: BlockKind;
  title?: string;
  payload: MemoryBlock["payload"];
  provenance: BlockProvenance;
}

export interface DocumentInput {
  title: string;
  sourceMethod: ProvenanceMethod;
  sourceLabel: string;
  blocks: BlockInput[];
  warnings: ImportWarning[];
  /**
   * Edges the source stated for itself. When absent they are derived from the
   * finished blocks, so every document has a graph however it arrived.
   */
  relations?: readonly MemoryRelation[];
}

export function buildBlockId(kind: BlockKind, title: string, payload: unknown, locator: string): string {
  return `blk_${kind}_${shortHash(stableBlockId({ kind, title, payload, locator }))}`;
}

export function finalizeDocument(input: DocumentInput): MemoryDocument {
  const blocks: MemoryBlock[] = input.blocks.map((b, index) => {
    const title = b.title ?? BLOCK_KIND_LABELS[b.kind];
    return {
      id: buildBlockId(b.kind, title, b.payload, b.provenance.locator),
      kind: b.kind,
      title,
      sourceOrder: index,
      provenance: b.provenance,
      payload: b.payload,
    };
  });

  const draft: MemoryDocument = {
    schemaVersion: 1,
    title: input.title,
    documentId: "",
    sourceMethod: input.sourceMethod,
    sourceLabel: input.sourceLabel,
    contentHash: "",
    blocks,
    relations: input.relations ? [...input.relations] : buildRelations(blocks),
    warnings: input.warnings,
  };

  const hash = contentHashOf(draft);
  return { ...draft, contentHash: hash, documentId: `doc_${shortHash(hash)}` };
}

/** Normalize a validated strict JSON source into the canonical document. */
export function normalizeSource(
  source: MemorySource,
  provenance: { label: string; excerptFor: (kind: BlockKind, index: number) => string },
): MemoryDocument {
  const blocks: BlockInput[] = source.blocks.map((b, index) => ({
    kind: b.kind,
    title: b.title,
    payload: b.payload,
    provenance: {
      method: "deterministic-json",
      label: provenance.label,
      locator: `blocks[${index}] · ${b.kind}`,
      excerpt: provenance.excerptFor(b.kind, index),
    },
  }));

  return finalizeDocument({
    title: source.title,
    sourceMethod: "deterministic-json",
    sourceLabel: provenance.label,
    blocks,
    warnings: [],
    ...(source.relations ? { relations: source.relations } : {}),
  });
}

/** Reorder blocks without touching ids, provenance or payloads. */
export function reorderBlocks(doc: MemoryDocument, orderedIds: readonly string[]): MemoryDocument {
  const byId = new Map(doc.blocks.map((b) => [b.id, b]));
  const next: MemoryBlock[] = [];
  orderedIds.forEach((id, index) => {
    const block = byId.get(id);
    if (block) {
      next.push({ ...block, sourceOrder: index });
      byId.delete(id);
    }
  });
  // Defensive: never drop blocks even if the id list was incomplete.
  for (const block of byId.values()) next.push({ ...block, sourceOrder: next.length });

  const reordered: MemoryDocument = { ...doc, blocks: next };
  const hash = contentHashOf(reordered);
  return { ...reordered, contentHash: hash };
}
