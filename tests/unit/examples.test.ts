import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ATLAS_JSON_SOURCE,
  ATLAS_NOTES_SOURCE,
  EXAMPLES,
  hasVerifiedExtraction,
  verifiedExtractionFor,
} from "@/import/examples/catalog";
import { memorySourceSchema } from "@/domain/memory/schema";
import { importSource } from "@/import/import-source";

describe("examples catalog", () => {
  it("Atlas JSON is a valid strict source", () => {
    expect(memorySourceSchema.safeParse(JSON.parse(ATLAS_JSON_SOURCE)).success).toBe(true);
  });

  it("public example files match the embedded catalog sources", () => {
    const json = readFileSync(join(process.cwd(), "public/examples/atlas-q3-brief.json"), "utf8");
    const notes = readFileSync(join(process.cwd(), "public/examples/atlas-launch-notes.md"), "utf8");
    expect(json).toBe(ATLAS_JSON_SOURCE);
    expect(notes).toBe(ATLAS_NOTES_SOURCE);
  });

  it("every catalog entry imports successfully through the real pipeline", () => {
    for (const example of EXAMPLES) {
      const result = importSource({ raw: example.source, label: example.label });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.blocks).toHaveLength(6);
    }
  });
});

describe("verified-example extraction", () => {
  it("returns a verified document only for the exact curated notes", () => {
    const doc = verifiedExtractionFor(ATLAS_NOTES_SOURCE, "atlas-launch-notes.md");
    expect(doc).not.toBeNull();
    expect(doc!.sourceMethod).toBe("verified-example");
    for (const block of doc!.blocks) {
      expect(block.provenance.method).toBe("verified-example");
    }
    expect(doc!.blocks).toHaveLength(6);
  });

  it("never gives arbitrary text the curated fixture", () => {
    expect(verifiedExtractionFor("Some other notes entirely", "other.md")).toBeNull();
    expect(verifiedExtractionFor(ATLAS_NOTES_SOURCE + "\nextra line", "other.md")).toBeNull();
    expect(hasVerifiedExtraction("random text")).toBe(false);
    expect(hasVerifiedExtraction(ATLAS_NOTES_SOURCE)).toBe(true);
  });

  it("tolerates CRLF variants of the curated notes", () => {
    const crlf = ATLAS_NOTES_SOURCE.replace(/\n/g, "\r\n");
    expect(hasVerifiedExtraction(crlf)).toBe(true);
  });
});
