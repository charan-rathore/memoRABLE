import {BLOCK_KINDS,BLOCK_KIND_LABELS} from "@/domain/memory/schema";
import type { MemoryDocument, MemorySource } from "@/domain/memory/schema";

/**
 * Canonical memoRABLE JSON export: the strict source format ({version,title,
 * blocks[]}) that round-trips through the deterministic JSON importer.
 * Provenance/ids/hashes are recomputed on re-import, so the export stays
 * clean data.
 */
export function toMemorySource(doc: MemoryDocument): MemorySource {
  return {
    version: requiresSemanticVersion(doc) ? 2 : 1,
    title: doc.title,
    ...(["research", "invoice"].includes(doc.archetype?.id ?? "") ? { archetype: doc.archetype, relations: doc.relations } : {}),
    blocks: [...doc.blocks.map((block) => ({
      kind: block.kind,
      ...(block.title ? { title: block.title } : {}),
      payload: block.payload,
    })), ...BLOCK_KINDS.filter(kind=>!doc.blocks.some(b=>b.kind===kind)).map(kind=>({kind,title:BLOCK_KIND_LABELS[kind],payload:{entries:[],notes:[]}}))],
  } as MemorySource;
}

export function canonicalJsonString(doc: MemoryDocument): string {
  return JSON.stringify(toMemorySource(doc), null, 2) + "\n";
}

/** Preserve v1 for legacy payloads; never label new semantics as old wire data. */
function requiresSemanticVersion(doc: MemoryDocument): boolean {
  return doc.blocks.some(block => {
    const p = block.payload as Record<string, unknown>;
    return "goalKind" in p || (Array.isArray(p.entries) && p.entries.some(e =>
      ["claimKind", "financialRole", "observationKind"].some(key => key in e)));
  });
}
