import { describe, expect, it } from "vitest";
import { checkJsonSafety, lineColumnOf, preflightInput } from "@/import/preflight";
import { LIMITS } from "@/domain/memory/limits";

describe("preflightInput", () => {
  it("rejects empty input", () => {
    const result = preflightInput("   \n  ");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]!.code).toBe("input.empty");
  });

  it("rejects NUL bytes with a location", () => {
    const result = preflightInput('{"a": "b\u0000" }');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]!.code).toBe("input.binary");
      expect(result.errors[0]!.line).toBe(1);
    }
  });

  it("rejects binary-looking control character soup", () => {
    const binary = "\u0001\u0002\u0003\u0004\u0005\u0006\u0007".repeat(20);
    const result = preflightInput(binary);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]!.code).toBe("input.binary");
  });

  it("rejects input over 1 MiB", () => {
    const big = "x".repeat(LIMITS.maxInputBytes + 1);
    const result = preflightInput(big);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]!.code).toBe("input.too-large");
  });

  it("strips BOM and normalizes CRLF/CR", () => {
    const result = preflightInput('﻿{"a": 1}\r\nnext\rline');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.text).toBe('{"a": 1}\nnext\nline');
      expect(result.value.looksLikeJson).toBe(true);
    }
  });

  it("detects JSON vs text by first meaningful character", () => {
    expect(preflightInput("  [1]").ok && preflightInput("  [1]")).toBeTruthy();
    const json = preflightInput("\n  {\"a\": 1}");
    const text = preflightInput("# Notes");
    expect(json.ok && json.value.looksLikeJson).toBe(true);
    expect(text.ok && text.value.looksLikeJson).toBe(false);
  });

  it("accepts unicode content", () => {
    const result = preflightInput("# Mémo — 日本語 ✅");
    expect(result.ok).toBe(true);
  });
});

describe("checkJsonSafety", () => {
  it("rejects prototype-pollution keys at any depth", () => {
    // Object literals can't own a "__proto__" key (JS semantics) — JSON.parse
    // output can, which is exactly what hostile uploads look like.
    const nested = checkJsonSafety(JSON.parse('{"a":{"b":{"__proto__":{"x":1}}}}'));
    expect(nested.some((p) => p.code === "input.unsafe-key")).toBe(true);
    expect(checkJsonSafety(JSON.parse('{"constructor":1}'))[0]!.code).toBe("input.unsafe-key");
    expect(checkJsonSafety(JSON.parse('[{"prototype":1}]'))[0]!.code).toBe("input.unsafe-key");
  });

  it("rejects depth beyond 12 with a path", () => {
    let deep: unknown = { leaf: true };
    for (let i = 0; i < 14; i++) deep = { nested: deep };
    const problems = checkJsonSafety(deep);
    expect(problems.some((p) => p.code === "input.too-deep")).toBe(true);
  });

  it("rejects collections over 100 entries", () => {
    const problems = checkJsonSafety({ list: Array.from({ length: 101 }, (_, i) => i) });
    expect(problems[0]!.code).toBe("input.too-many-entries");
  });

  it("accepts safe structures", () => {
    expect(checkJsonSafety({ a: [1, 2, { b: "c" }] })).toEqual([]);
  });
});

describe("lineColumnOf", () => {
  it("computes 1-based line and column", () => {
    expect(lineColumnOf("abc\ndef\nghi", 0)).toEqual({ line: 1, column: 1 });
    expect(lineColumnOf("abc\ndef\nghi", 5)).toEqual({ line: 2, column: 2 });
    expect(lineColumnOf("abc\ndef\nghi", 9)).toEqual({ line: 3, column: 2 });
  });
});
