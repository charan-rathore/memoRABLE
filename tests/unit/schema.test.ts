import { describe, expect, it } from "vitest";
import { memorySourceSchema, memoryDocumentSchema, BLOCK_KINDS } from "@/domain/memory/schema";

const validSource = {
  version: 1,
  title: "Test",
  blocks: [
    { kind: "snapshot", payload: { heading: "H", summary: "S" } },
    { kind: "signals", payload: { entries: [{ label: "ARR", value: "$4.2M" }] } },
    { kind: "decisions", payload: { entries: [{ text: "Do it", status: "approved" }] } },
    { kind: "timeline", payload: { entries: [{ date: "Jul", title: "Ship", state: "shipped" }] } },
    { kind: "risks", payload: { entries: [{ risk: "R", severity: "high", mitigation: "M" }] } },
    { kind: "actions", payload: { entries: [{ task: "T", owner: "O", due: "Aug 1", status: "ready" }] } },
  ],
};

describe("memorySourceSchema (strict)", () => {
  it("accepts a valid source", () => {
    const result = memorySourceSchema.safeParse(validSource);
    expect(result.success).toBe(true);
  });

  it("rejects unknown keys at every level", () => {
    expect(memorySourceSchema.safeParse({ ...validSource, extra: 1 }).success).toBe(false);
    const withBlockExtra = structuredClone(validSource);
    (withBlockExtra.blocks[0] as Record<string, unknown>).extra = 1;
    expect(memorySourceSchema.safeParse(withBlockExtra).success).toBe(false);
    const withPayloadExtra = structuredClone(validSource);
    (withPayloadExtra.blocks[1]!.payload as Record<string, unknown>).confidence = 0.9;
    expect(memorySourceSchema.safeParse(withPayloadExtra).success).toBe(false);
  });

  it("rejects unsupported versions", () => {
    expect(memorySourceSchema.safeParse({ ...validSource, version: 2 }).success).toBe(false);
    expect(memorySourceSchema.safeParse({ ...validSource, version: "1" }).success).toBe(false);
  });

  it("rejects unknown kinds and invalid enum values", () => {
    const bad = structuredClone(validSource);
    (bad.blocks[0] as { kind: string }).kind = "metrics";
    expect(memorySourceSchema.safeParse(bad).success).toBe(false);
    const badStatus = structuredClone(validSource);
    ((badStatus.blocks[2]!.payload as { entries: { status: string }[] }).entries[0]!).status = "maybe";
    expect(memorySourceSchema.safeParse(badStatus).success).toBe(false);
  });

  it("rejects malformed fields and oversized collections", () => {
    const empty = structuredClone(validSource);
    (empty.blocks[0]!.payload as { heading: string }).heading = "";
    expect(memorySourceSchema.safeParse(empty).success).toBe(false);
    const many = structuredClone(validSource);
    (many.blocks[1]!.payload as { entries: unknown[] }).entries = Array.from({ length: 101 }, () => ({
      label: "x",
      value: "1",
    }));
    expect(memorySourceSchema.safeParse(many).success).toBe(false);
  });

  it("defines exactly six kinds", () => {
    expect(BLOCK_KINDS).toEqual(["snapshot", "signals", "decisions", "timeline", "risks", "actions"]);
  });

  it("never allows confidence fields anywhere", () => {
    const withConfidence = structuredClone(validSource);
    (withConfidence.blocks[0] as Record<string, unknown>).confidence = 99;
    expect(memorySourceSchema.safeParse(withConfidence).success).toBe(false);
  });
});

describe("memoryDocumentSchema", () => {
  it("round-trips the Atlas document shape", () => {
    const doc = {
      schemaVersion: 1,
      title: "T",
      documentId: "doc_0123456789ab",
      sourceMethod: "deterministic-json",
      sourceLabel: "t.json",
      contentHash: "a".repeat(64),
      warnings: [],
      relations: [],
      blocks: [
        {
          id: "blk_snapshot_0123456789ab",
          kind: "snapshot",
          title: "Snapshot",
          sourceOrder: 0,
          provenance: { method: "deterministic-json", label: "t.json", locator: "blocks[0]", excerpt: "…" },
          payload: { heading: "H", summary: "S" },
        },
      ],
    };
    expect(memoryDocumentSchema.safeParse(doc).success).toBe(true);
  });
});
