import { describe, expect, it } from "vitest";
import { importJson } from "@/import/json/import-json";
import { importSource } from "@/import/import-source";
import { ATLAS_JSON_SOURCE } from "@/import/examples/catalog";

describe("importJson — Atlas fixture", () => {
  it("yields exactly six typed blocks in source order", () => {
    const result = importJson({ text: ATLAS_JSON_SOURCE, label: "atlas-q3-brief.json" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.blocks.map((b) => b.kind)).toEqual([
      "snapshot",
      "signals",
      "timeline",
      "risks",
      "decisions",
      "actions",
    ]);
    expect(result.value.blocks).toHaveLength(6);
    expect(result.value.title).toBe("Q3 Board Report");
    expect(result.value.sourceMethod).toBe("deterministic-json");
    expect(result.value.warnings).toEqual([]);
  });

  it("attaches stable per-block provenance", () => {
    const result = importJson({ text: ATLAS_JSON_SOURCE, label: "atlas-q3-brief.json" });
    if (!result.ok) throw new Error("import failed");
    for (const block of result.value.blocks) {
      expect(block.provenance.method).toBe("deterministic-json");
      expect(block.provenance.label).toBe("atlas-q3-brief.json");
      expect(block.provenance.locator).toContain(block.kind);
      expect(block.provenance.excerpt.length).toBeGreaterThan(0);
      expect(block.provenance.excerpt.length).toBeLessThanOrEqual(240);
    }
    // No confidence-style fields anywhere.
    for (const block of result.value.blocks) {
      expect(JSON.stringify(block)).not.toMatch(/confidence|score|percent/i);
    }
  });
});

describe("importJson — all-or-nothing errors", () => {
  it("reports syntax errors with line/column and imports nothing", () => {
    const result = importJson({ text: '{\n  "version": 1,\n  "title": "X",\n}', label: "bad.json" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]!.code).toBe("json.syntax");
    expect(result.errors[0]!.line).toBeGreaterThan(0);
  });

  it("rejects unknown top-level keys", () => {
    const bad = JSON.parse(ATLAS_JSON_SOURCE) as Record<string, unknown>;
    bad.unexpected = true;
    const result = importJson({ text: JSON.stringify(bad), label: "bad.json" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.code === "json.unknown-key")).toBe(true);
    expect(result.errors[0]!.message).toContain("unexpected");
  });

  it("rejects unknown block kinds with a path", () => {
    const bad = JSON.parse(ATLAS_JSON_SOURCE) as { blocks: { kind: string }[] };
    bad.blocks[0]!.kind = "metrics";
    const result = importJson({ text: JSON.stringify(bad), label: "bad.json" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const kindError = result.errors.find((e) => e.code === "json.unknown-kind");
    expect(kindError).toBeDefined();
    expect(kindError!.path).toBe("$.blocks[0].kind");
  });

  it("rejects duplicate kinds with both indexes", () => {
    const bad = JSON.parse(ATLAS_JSON_SOURCE) as { blocks: { kind: string; payload: unknown }[] };
    // Duplicate the whole snapshot block (kind AND matching payload shape).
    bad.blocks[1] = structuredClone(bad.blocks[0]!);
    const result = importJson({ text: JSON.stringify(bad), label: "bad.json" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const dup = result.errors.find((e) => e.code === "json.duplicate-kind");
    expect(dup).toBeDefined();
    expect(dup!.message).toContain("blocks[0]");
    expect(dup!.message).toContain("blocks[1]");
  });

  it("rejects missing kinds with an actionable message", () => {
    const bad = JSON.parse(ATLAS_JSON_SOURCE) as { blocks: unknown[] };
    bad.blocks = bad.blocks.filter((_, i) => i !== 3); // remove risks
    const result = importJson({ text: JSON.stringify(bad), label: "bad.json" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const missing = result.errors.find((e) => e.code === "json.missing-kind");
    expect(missing).toBeDefined();
    expect(missing!.message).toContain("risks");
  });

  it("rejects unsupported versions explicitly", () => {
    const bad = JSON.parse(ATLAS_JSON_SOURCE) as { version: number };
    bad.version = 2;
    const result = importJson({ text: JSON.stringify(bad), label: "bad.json" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]!.code).toBe("json.unsupported-version");
    expect(result.errors[0]!.path).toBe("$.version");
  });

  it("rejects malformed fields with exact paths", () => {
    const bad = JSON.parse(ATLAS_JSON_SOURCE) as {
      blocks: { kind: string; payload: { entries?: { severity?: string }[] } }[];
    };
    const risks = bad.blocks.find((b) => b.kind === "risks")!;
    risks.payload.entries![0]!.severity = "catastrophic";
    const result = importJson({ text: JSON.stringify(bad), label: "bad.json" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.path?.includes("severity"))).toBe(true);
  });

  it("rejects prototype pollution before schema validation", () => {
    const hostile = '{"version":1,"title":"X","blocks":[],"__proto__":{"polluted":true}}';
    const result = importJson({ text: hostile, label: "bad.json" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]!.code).toBe("input.unsafe-key");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("handles BOM and CRLF transparently", () => {
    const withBom = "\uFEFF" + ATLAS_JSON_SOURCE.replace(/\n/g, "\r\n");
    const result = importSource({ raw: withBom, label: "atlas-q3-brief.json" });
    expect(result.ok).toBe(true);
  });
});
