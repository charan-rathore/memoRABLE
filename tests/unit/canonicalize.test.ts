import { describe, expect, it } from "vitest";
import {
  canonicalizeDocument,
  contentHashOf,
  stableStringify,
} from "@/domain/memory/canonicalize";
import { finalizeDocument, reorderBlocks } from "@/domain/memory/normalize";
import type { MemoryDocument } from "@/domain/memory/schema";
import { importJson } from "@/import/json/import-json";
import { ATLAS_JSON_SOURCE } from "@/import/examples/catalog";

describe("stableStringify", () => {
  it("sorts object keys but preserves array order", () => {
    const a = stableStringify({ b: 1, a: [3, 1, 2], c: { z: 1, y: 2 } });
    expect(a).toBe('{"a":[3,1,2],"b":1,"c":{"y":2,"z":1}}');
  });

  it("normalizes line endings and unicode", () => {
    expect(stableStringify("a\r\nb\rc")).toBe(stableStringify("a\nb\nc"));
    expect(stableStringify("é")).toBe(stableStringify("é".normalize("NFC")));
  });
});

describe("canonical documents", () => {
  function atlas(): MemoryDocument {
    const result = importJson({ text: ATLAS_JSON_SOURCE, label: "atlas-q3-brief.json" });
    if (!result.ok) throw new Error("atlas import failed");
    return result.value;
  }

  it("produces identical ids, hash and serialization across repeated imports", () => {
    const first = atlas();
    const second = atlas();
    expect(first.contentHash).toBe(second.contentHash);
    expect(first.documentId).toBe(second.documentId);
    expect(first.blocks.map((b) => b.id)).toEqual(second.blocks.map((b) => b.id));
    expect(canonicalizeDocument(first)).toBe(canonicalizeDocument(second));
  });

  it("block ids are prefixed and stable per content", () => {
    const doc = atlas();
    for (const block of doc.blocks) {
      expect(block.id).toMatch(new RegExp(`^blk_${block.kind}_[0-9a-f]{12}$`));
    }
  });

  it("reordering preserves ids and provenance but updates order/hash", () => {
    const doc = atlas();
    const reversed = reorderBlocks(doc, doc.blocks.map((b) => b.id).reverse());
    expect(reversed.blocks.map((b) => b.id)).toEqual(doc.blocks.map((b) => b.id).reverse());
    expect(reversed.blocks.map((b) => b.sourceOrder)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(reversed.contentHash).not.toBe(doc.contentHash);
    // Reordering back restores the original hash.
    const restored = reorderBlocks(reversed, doc.blocks.map((b) => b.id));
    expect(restored.contentHash).toBe(doc.contentHash);
  });

  it("content hash matches the recomputed hash", () => {
    const doc = atlas();
    expect(doc.contentHash).toBe(contentHashOf(doc));
  });

  it("warnings and diagnostics never enter the canonical serialization", () => {
    const doc = atlas();
    const noisy: MemoryDocument = {
      ...doc,
      warnings: [{ code: "x", message: "noise" }],
    };
    // contentHashOf ignores the warnings array by projection.
    expect(contentHashOf(noisy)).toBe(doc.contentHash);
  });

  it("finalizeDocument derives documentId from the content hash", () => {
    const doc = finalizeDocument({
      title: "T",
      sourceMethod: "deterministic-json",
      sourceLabel: "t.json",
      warnings: [],
      blocks: [
        {
          kind: "snapshot",
          payload: { heading: "H", summary: "S" },
          provenance: { method: "deterministic-json", label: "t.json", locator: "blocks[0] · snapshot", excerpt: "H" },
        },
      ],
    });
    expect(doc.documentId).toMatch(/^doc_[0-9a-f]{12}$/);
    expect(doc.contentHash).toHaveLength(64);
  });
});
