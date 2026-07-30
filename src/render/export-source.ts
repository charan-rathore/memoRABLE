import type { MemoryDocument, MemorySource } from "@/domain/memory/schema";

/**
 * Canonical memoRABLE JSON export: the strict source format ({version,title,
 * blocks[]}) that round-trips through the deterministic JSON importer.
 * Provenance/ids/hashes are recomputed on re-import, so the export stays
 * clean data.
 */
export function toMemorySource(doc: MemoryDocument): MemorySource {
  return {
    version: 1,
    title: doc.title,
    blocks: doc.blocks.map((block) => ({
      kind: block.kind,
      ...(block.title ? { title: block.title } : {}),
      payload: block.payload,
    })),
  } as MemorySource;
}

export function canonicalJsonString(doc: MemoryDocument): string {
  return JSON.stringify(toMemorySource(doc), null, 2) + "\n";
}
