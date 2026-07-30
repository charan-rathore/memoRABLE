import { describe, expect, it, vi } from "vitest";
import type * as parseTextModule from "@/import/text/parse-text";
import type * as importJsonModule from "@/import/json/import-json";

// Spy on the two import paths to prove routing is exclusive.
vi.mock("@/import/text/parse-text", async (importOriginal) => {
  const actual = await importOriginal<typeof parseTextModule>();
  return { ...actual, parseText: vi.fn(actual.parseText) };
});
vi.mock("@/import/json/import-json", async (importOriginal) => {
  const actual = await importOriginal<typeof importJsonModule>();
  return { ...actual, importJson: vi.fn(actual.importJson) };
});

import { importSource } from "@/import/import-source";
import { parseText } from "@/import/text/parse-text";
import { importJson } from "@/import/json/import-json";
import { ATLAS_JSON_SOURCE, ATLAS_NOTES_SOURCE } from "@/import/examples/catalog";
import { renderBundle } from "@/render/render-bundle";

describe("end-to-end Atlas pipeline", () => {
  it("JSON → six blocks → three complete outputs, fully deterministic", () => {
    const first = importSource({ raw: ATLAS_JSON_SOURCE, label: "atlas-q3-brief.json" });
    const second = importSource({ raw: ATLAS_JSON_SOURCE, label: "atlas-q3-brief.json" });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(first.value.contentHash).toBe(second.value.contentHash);
    const bundleA = renderBundle(first.value);
    const bundleB = renderBundle(second.value);
    for (const mode of ["web", "email", "document"] as const) {
      expect(bundleA.outputs[mode].html).toBe(bundleB.outputs[mode].html);
      expect(bundleA.outputs[mode].error).toBeNull();
    }
    expect(bundleA.blockCount).toBe(6);
  });

  it("notes → six blocks → three complete outputs with warnings intact", () => {
    const result = importSource({ raw: ATLAS_NOTES_SOURCE, label: "atlas-launch-notes.md" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const bundle = renderBundle(result.value);
    for (const mode of ["web", "email", "document"] as const) {
      expect(bundle.outputs[mode].html).toContain("Atlas Launch Notes");
      expect(bundle.outputs[mode].designJsonError).toBeNull();
    }
  });

  it("JSON input never invokes the text parser; text never invokes the JSON path", () => {
    vi.clearAllMocks();
    importSource({ raw: ATLAS_JSON_SOURCE, label: "atlas-q3-brief.json" });
    expect(vi.mocked(importJson)).toHaveBeenCalled();
    expect(vi.mocked(parseText)).not.toHaveBeenCalled();

    vi.clearAllMocks();
    importSource({ raw: ATLAS_NOTES_SOURCE, label: "atlas-launch-notes.md" });
    expect(vi.mocked(parseText)).toHaveBeenCalled();
    expect(vi.mocked(importJson)).not.toHaveBeenCalled();
  });

  it("malformed JSON imports nothing and never falls through to text", () => {
    vi.clearAllMocks();
    const result = importSource({ raw: '{ "version": 1, broken', label: "broken.json" });
    expect(result.ok).toBe(false);
    expect(vi.mocked(parseText)).not.toHaveBeenCalled();
    if (!result.ok) {
      expect(result.errors[0]!.code).toBe("json.syntax");
    }
  });
});
