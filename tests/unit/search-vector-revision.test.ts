import { describe, expect, it } from "vitest";
import { SearchIndex, embedText, type Embedder, type SearchDoc } from "@/search/engine";
const doc: SearchDoc = { id: "contract", title: "Fee", body: "Proposed 48000", kind: "note", source: "notes", createdAt: "2026-11-26" };
describe("document revision ownership of embeddings", () => {
  it("invalidates an old vector and skips a delayed result after the document changes", async () => {
    let release!: (v: Float32Array[]) => void;
    const embedder: Embedder = { id: "test", dim: 2, embedQueries: async () => [], embedDocs: () => new Promise(r => { release = r; }) };
    const index = new SearchIndex(embedder);
    index.upsert(doc);
    index.setVector(doc.id, [1, 0]);
    const pending = index.embed([doc.id]);
    index.upsert({ ...doc, body: "Approved 42000" });
    expect(index.vectors?.size).toBe(0);
    release([new Float32Array([1, 0])]);
    expect(await pending).toBe(0);
    expect(index.vectors?.size).toBe(0);
    index.setVector(doc.id, [1, 0], embedText(doc));
    expect(index.vectors?.size).toBe(0);
    index.setVector(doc.id, [0, 1], embedText(index.docs.get(doc.id)!));
    expect(index.vectors?.size).toBe(1);
  });
});
