// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { safeClearRef, safeLoadRef, safeSaveRef, type StoredDocumentRef } from "@/reliability/storage";

describe("last-document storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => vi.restoreAllMocks());

  it("round-trips the content hash and save time", () => {
    const ref: StoredDocumentRef = {
      contentHash: "sha256:abc123",
      savedAt: "2026-10-17T00:00:00.000Z",
    };

    expect(safeSaveRef(ref)).toBe(true);
    expect(safeLoadRef()).toEqual(ref);
  });

  it("returns null for malformed JSON and values with the wrong shape", () => {
    localStorage.setItem("memorable:last-document:v1", "{bad json");
    expect(() => safeLoadRef()).not.toThrow();
    expect(safeLoadRef()).toBeNull();

    localStorage.setItem("memorable:last-document:v1", JSON.stringify({ contentHash: 42, savedAt: null }));
    expect(() => safeLoadRef()).not.toThrow();
    expect(safeLoadRef()).toBeNull();
  });

  it("falls back when localStorage access is disabled", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new Error("storage disabled");
    });

    expect(safeLoadRef()).toBeNull();
    expect(safeSaveRef({ contentHash: "hash", savedAt: "now" })).toBe(false);
    expect(() => safeClearRef()).not.toThrow();
  });

  it("does not surface get, quota, or remove failures", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("read failed"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota exceeded"); });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("remove failed"); });

    expect(safeLoadRef()).toBeNull();
    expect(safeSaveRef({ contentHash: "hash", savedAt: "now" })).toBe(false);
    expect(() => safeClearRef()).not.toThrow();
  });

  it("clears the stored reference", () => {
    expect(safeSaveRef({ contentHash: "hash", savedAt: "now" })).toBe(true);

    safeClearRef();

    expect(localStorage.getItem("memorable:last-document:v1")).toBeNull();
    expect(safeLoadRef()).toBeNull();
  });
});
