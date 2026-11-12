import { describe, expect, it } from "vitest";
import { detectKind, formatMs, highlight, parseReplaces } from "@/components/today/compose";
import { handleOf } from "@/daily/projection";

describe("today composer helpers", () => {
  it("detects the kind from how the line starts, otherwise none", () => {
    expect(detectKind("Decided to keep BM25")).toBe("decided");
    expect(detectKind("should we cache this?")).toBe("decided");
    expect(detectKind("TIL IndexedDB is fast")).toBe("learned");
    expect(detectKind("todo rotate the secret")).toBe("task");
    expect(detectKind("Fixed the gate")).toBe("worked");
    expect(detectKind("embeddings in sqlite")).toBeNull();
  });

  it("parses an explicit replacement handle", () => {
    expect(parseReplaces("Decided SQLite. Replaces #A1b2C3")).toBe("a1b2c3");
    expect(parseReplaces("supersedes #abc")).toBeNull();
  });

  it("highlights words whose stems matched", () => {
    expect(highlight("Caching reranker scores", ["cach"])).toEqual([{ t: "Caching", hit: true }, { t: " reranker scores", hit: false }]);
  });

  it("formats measured latency without inventing precision", () => {
    expect(formatMs(0.004)).toBe("<0.01 ms");
    expect(formatMs(0.42)).toBe("0.42 ms");
    expect(formatMs(12.34)).toBe("12.3 ms");
  });

  it("handles are short, typeable and differ across ids from one device", () => {
    const ids = Array.from({ length: 500 }, (_, i) => `e${(1_700_000_000_000 + i).toString(36)}${i.toString(36).padStart(4, "0")}dev01`);
    const handles = new Set(ids.map(handleOf));
    expect(handles.size).toBe(500);
    for (const h of handles) expect(h).toMatch(/^[a-z0-9]{6}$/);
  });
});
