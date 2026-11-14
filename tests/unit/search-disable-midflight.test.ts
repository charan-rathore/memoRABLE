// @vitest-environment jsdom
// Disable/re-enable during an in-flight search, on the recovery tree.
// The arm and query vector belong to the worker+index captured before the
// embed await; when the origin changes mid-flight the search must settle
// lexically on the CURRENT index without mutating off/error state or any
// replacement worker - and without mixing vector spaces.
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadMock = vi.fn();
vi.mock("@/search/embed-client", () => ({
  WorkerEmbedder: { load: (...args: unknown[]) => loadMock(...args) },
  modelAvailable: () => Promise.resolve(true),
}));
vi.mock("@/search/github", () => ({
  validRepo: (s: string) => (s.includes("/") ? s : null),
  syncRepo: () =>
    Promise.resolve({
      docs: [{ id: "o/r#1", kind: "issue", title: "sample issue", body: "body", labels: [], source: "o/r", createdAt: "2026-01-01T00:00:00Z" }],
      cursor: { repo: "o/r" },
    }),
}));

import { useRepoSearch } from "@/components/today/use-repo-search";
import { SearchIndex } from "@/search/engine";

const vec = (dim = 384) => new Float32Array(dim).fill(0.01);
type SearchReturn = Awaited<ReturnType<ReturnType<typeof useRepoSearch>["search"]>>;
const worker = (dim = 384, embedGate?: (res: (v: Float32Array[]) => void) => void, dispose = vi.fn()) => ({
  id: `mock-model-${dim}`, dim,
  embedDocs: (docs: unknown[]) => Promise.resolve(docs.map(() => vec(dim))),
  embedQueries: () => new Promise<Float32Array[]>((res) => (embedGate ? embedGate(res) : res([vec(dim)]))),
  dispose,
});

beforeEach(() => { loadMock.mockReset(); localStorage.clear(); });

describe("disable during an in-flight search (recovery tree)", () => {
  it("embed resolves after disable: settles lexically on the current index, no failSemantic", async () => {
    let resolveEmbed: ((v: Float32Array[]) => void) | undefined;
    const dispose = vi.fn();
    loadMock.mockResolvedValue(worker(384, (res) => { resolveEmbed = res; }, dispose));
    const { result } = renderHook(() => useRepoSearch(null, 0));
    await act(async () => { await result.current.connect("o/r"); });
    await act(async () => { await result.current.enableSemantic(); });
    dispose.mockClear();

    let settled: { kind: "ok"; value: SearchReturn } | { kind: "err"; error: unknown } | undefined;
    let searchPromise: Promise<unknown> = Promise.resolve();
    await act(async () => {
      searchPromise = result.current.search("sample issue")
        .then((value) => { settled = { kind: "ok", value }; })
        .catch((error) => { settled = { kind: "err", error }; });
    });
    await act(async () => { result.current.disableSemantic(); });
    await act(async () => { resolveEmbed?.([vec()]); await searchPromise; }); // embed resolves AFTER disable

    expect(settled?.kind).toBe("ok"); // RED on def6387: "arm hybrid-wsum needs an embedder"
    if (settled?.kind === "ok") {
      expect(settled.value.arm).toBe("bm25f+sig");
      expect(settled.value.degraded).toBe(true);
      expect(settled.value.repos.some((h) => h.id === "o/r#1")).toBe(true);
    }
    expect(result.current.model.state).toBe("off"); // NOT error: failSemantic was not called
    expect(dispose).toHaveBeenCalledTimes(1); // disableSemantic's own teardown only
  });

  it("embed rejects under a disposed worker (real dispose behavior): settles lexically, model stays off", async () => {
    let rejectEmbed: ((e: Error) => void) | undefined;
    const dispose = vi.fn(() => { rejectEmbed?.(new Error("worker terminated")); });
    loadMock.mockResolvedValue({
      id: "mock-model-384", dim: 384,
      embedDocs: (docs: unknown[]) => Promise.resolve(docs.map(() => vec())),
      embedQueries: () => new Promise<Float32Array[]>((_, rej) => { rejectEmbed = rej; }),
      dispose,
    });
    const { result } = renderHook(() => useRepoSearch(null, 0));
    await act(async () => { await result.current.connect("o/r"); });
    await act(async () => { await result.current.enableSemantic(); });

    let settled: { kind: "ok"; value: SearchReturn } | { kind: "err"; error: unknown } | undefined;
    let searchPromise: Promise<unknown> = Promise.resolve();
    await act(async () => {
      searchPromise = result.current.search("sample issue")
        .then((value) => { settled = { kind: "ok", value }; })
        .catch((error) => { settled = { kind: "err", error }; });
    });
    await act(async () => { result.current.disableSemantic(); }); // dispose rejects the in-flight embed
    await act(async () => { await searchPromise; });

    expect(settled?.kind).toBe("ok");
    if (settled?.kind === "ok") {
      expect(settled.value.arm).toBe("bm25f+sig");
      expect(settled.value.degraded).toBe(true);
      expect(settled.value.repos.some((h) => h.id === "o/r#1")).toBe(true);
    }
    expect(result.current.model.state).toBe("off"); // the disable was intentional, not a model failure
  });

  it("re-enable with a DIFFERENT model mid-flight: old vector never runs against the new space", async () => {
    let resolveEmbed: ((v: Float32Array[]) => void) | undefined;
    const disposeNew = vi.fn();
    loadMock
      .mockResolvedValueOnce(worker(384, (res) => { resolveEmbed = res; }))
      .mockResolvedValueOnce(worker(768, undefined, disposeNew)); // different model: other id AND dim
    const { result } = renderHook(() => useRepoSearch(null, 0));
    await act(async () => { await result.current.connect("o/r"); });
    await act(async () => { await result.current.enableSemantic(); });

    let settled: { kind: "ok"; value: SearchReturn } | { kind: "err"; error: unknown } | undefined;
    let searchPromise: Promise<unknown> = Promise.resolve();
    await act(async () => {
      searchPromise = result.current.search("sample issue")
        .then((value) => { settled = { kind: "ok", value }; })
        .catch((error) => { settled = { kind: "err", error }; });
    });
    await act(async () => { result.current.disableSemantic(); });
    await act(async () => { await result.current.enableSemantic(); }); // replacement: 768-dim space
    expect(result.current.model.state).toBe("ready");
    await act(async () => { resolveEmbed?.([vec()]); await searchPromise; }); // old 384-dim query vector

    expect(settled?.kind).toBe("ok");
    if (settled?.kind === "ok") {
      expect(settled.value.arm).toBe("bm25f+sig"); // RED on def6387: hybrid arm runs a 384-vector on a 768-index
      expect(settled.value.degraded).toBe(true);
      expect(settled.value.repos.some((h) => h.id === "o/r#1")).toBe(true);
    }
    expect(disposeNew).not.toHaveBeenCalled();
    expect(result.current.model.state).toBe("ready");
  });

  it("same worker and index after the await: dense proceeds, not degraded", async () => {
    loadMock.mockResolvedValue(worker());
    const { result } = renderHook(() => useRepoSearch(null, 0));
    await act(async () => { await result.current.connect("o/r"); });
    await act(async () => { await result.current.enableSemantic(); });
    let r: SearchReturn | undefined;
    await act(async () => { r = await result.current.search("sample issue"); });
    expect(r?.arm).toBe("hybrid-wsum");
    expect(r?.degraded).toBeUndefined();
    expect(result.current.model.state).toBe("ready");
  });

  it("an unrelated engine error propagates - no fallback, no degraded label", async () => {
    loadMock.mockResolvedValue(worker());
    const { result } = renderHook(() => useRepoSearch(null, 0));
    await act(async () => { await result.current.connect("o/r"); });
    await act(async () => { await result.current.enableSemantic(); });
    const spy = vi.spyOn(SearchIndex.prototype, "search").mockRejectedValueOnce(new Error("synthetic engine bug"));
    let caught: unknown;
    await act(async () => { try { await result.current.search("sample issue"); } catch (e) { caught = e; } });
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("synthetic engine bug");
    spy.mockRestore();
  });
});
