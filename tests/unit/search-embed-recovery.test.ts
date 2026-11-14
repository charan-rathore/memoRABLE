// @vitest-environment jsdom
// Embedding recovery only: a failed model or a failed query embedding must
// not lose the search or leak the worker. Runs on base (fails: no fallback,
// no cleanup) and on this scoped recovery branch (passes). No query routing
// changes in this candidate.
import { act, renderHook } from "@testing-library/react";
import type * as EmbedClientModule from "@/search/embed-client";
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

const vec = () => new Float32Array(384).fill(0.01);

beforeEach(() => { loadMock.mockReset(); localStorage.clear(); });

describe("query embedding failure", () => {
  it("returns labelled keyword results instead of losing the search", async () => {
    const dispose = vi.fn();
    loadMock.mockResolvedValue({
      id: "mock-model", dim: 384,
      embedDocs: () => Promise.resolve([vec()]),
      embedQueries: () => Promise.reject(new Error("embed boom")),
      dispose,
    });
    const { result } = renderHook(() => useRepoSearch(null, 0));
    await act(async () => { await result.current.enableSemantic(); });
    expect(result.current.model.state).toBe("ready");

    let r: unknown;
    await act(async () => {
      try {
        r = await result.current.search("concurrency limit for queued jobs");
      } catch (err) {
        r = { lost: err instanceof Error ? err.message : String(err) };
      }
    });
    // Base behavior: the search promise rejects and the user keeps stale or
    // empty results. Fixed behavior: labelled lexical fallback.
    expect(r).not.toHaveProperty("lost");
    const res = r as { arm: string; degraded?: boolean };
    expect(res.arm).toBe("bm25f+sig");
    expect(res.degraded).toBe(true);
    expect(dispose).toHaveBeenCalled();
    expect(result.current.model.state).toBe("error");
  });

  it("keeps the semantic arm when query embedding works", async () => {
    loadMock.mockResolvedValue({
      id: "mock-model", dim: 384,
      embedDocs: () => Promise.resolve([vec()]),
      embedQueries: () => Promise.resolve([vec()]),
      dispose: vi.fn(),
    });
    const { result } = renderHook(() => useRepoSearch(null, 0));
    await act(async () => { await result.current.enableSemantic(); });
    let r: { arm: string; degraded?: boolean } | undefined;
    await act(async () => { r = await result.current.search("concurrency limit"); });
    expect(r?.arm).toBe("hybrid-wsum");
    expect(r?.degraded).toBeUndefined();
    expect(result.current.model.state).toBe("ready");
  });
});

describe("model load and indexing failures", () => {
  it("disposes the embedder when post-load indexing fails", async () => {
    const dispose = vi.fn();
    loadMock.mockResolvedValue({
      id: "mock-model", dim: 384,
      embedDocs: () => Promise.reject(new Error("doc boom")),
      embedQueries: () => Promise.resolve([vec()]),
      dispose,
    });
    const { result } = renderHook(() => useRepoSearch(null, 0));
    await act(async () => { await result.current.connect("o/r"); });
    await act(async () => { await result.current.enableSemantic(); });
    expect(result.current.model.state).toBe("error");
    expect(dispose).toHaveBeenCalled();
  });

  it("terminates the worker when init itself fails", async () => {
    const terminate = vi.fn();
    class FakeWorker {
      onmessage: ((e: MessageEvent) => void) | null = null;
      onerror: ((e: ErrorEvent) => void) | null = null;
      postMessage(msg: { id: number; type: string }) {
        if (msg.type === "init") {
          queueMicrotask(() => this.onmessage?.({ data: { id: msg.id, type: "error", message: "init boom" } } as MessageEvent));
        }
      }
      terminate() { terminate(); }
    }
    vi.stubGlobal("Worker", FakeWorker);
    try {
      const { WorkerEmbedder } = await vi.importActual<typeof EmbedClientModule>("@/search/embed-client");
      await expect(WorkerEmbedder.load()).rejects.toThrow("init boom");
      expect(terminate).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("racing failures and re-enable", () => {
  it("two queries failing on the same worker both fall back without a lost search", async () => {
    const rejectors: ((e: Error) => void)[] = [];
    const dispose = vi.fn();
    const worker = {
      id: "mock-model", dim: 384,
      embedDocs: () => Promise.resolve([vec()]),
      embedQueries: () => new Promise((_res, rej) => { rejectors.push(rej); }),
      dispose,
    };
    loadMock.mockResolvedValue(worker);
    const { result } = renderHook(() => useRepoSearch(null, 0));
    await act(async () => { await result.current.enableSemantic(); });

    let a: unknown; let b: unknown;
    await act(async () => {
      const pa = result.current.search("first failing query").then((r) => { a = r; }, (e) => { a = { lost: String(e) }; });
      const pb = result.current.search("second failing query").then((r) => { b = r; }, (e) => { b = { lost: String(e) }; });
      rejectors.forEach((rj) => rj(new Error("embed boom")));
      await Promise.all([pa, pb]);
    });
    // Neither query is lost, and the second teardown does not touch an
    // already-cleared ref (base loses both searches at the first rejection).
    expect(a).not.toHaveProperty("lost");
    expect(b).not.toHaveProperty("lost");
    expect((a as { arm: string }).arm).toBe("bm25f+sig");
    expect((b as { arm: string }).arm).toBe("bm25f+sig");
    expect(result.current.model.state).toBe("error");
  });

  it("a stale failure does not tear down the re-enabled replacement", async () => {
    let rejectA: (e: Error) => void = () => undefined;
    const disposeA = vi.fn();
    const workerA = {
      id: "mock-model", dim: 384,
      embedDocs: () => Promise.resolve([vec()]),
      embedQueries: () => new Promise((_res, rej) => { rejectA = rej; }),
      dispose: disposeA,
    };
    const disposeB = vi.fn();
    const workerB = {
      id: "mock-model", dim: 384,
      embedDocs: () => Promise.resolve([vec()]),
      embedQueries: () => Promise.resolve([vec()]),
      dispose: disposeB,
    };
    loadMock.mockResolvedValueOnce(workerA).mockResolvedValueOnce(workerB);
    const { result } = renderHook(() => useRepoSearch(null, 0));
    await act(async () => { await result.current.enableSemantic(); });

    let r: unknown;
    await act(async () => {
      const p = result.current.search("query on the old worker").then((x) => { r = x; }, (e) => { r = { lost: String(e) }; });
      // Re-enable while the old worker's query is still in flight.
      result.current.disableSemantic();
      await result.current.enableSemantic();
      rejectA(new Error("stale boom"));
      await p;
    });
    // The query itself still degrades to lexical...
    expect(r).not.toHaveProperty("lost");
    expect((r as { arm: string }).arm).toBe("bm25f+sig");
    // ...but the replacement worker is untouched and still owns the state.
    expect(disposeB).not.toHaveBeenCalled();
    expect(result.current.model.state).toBe("ready");
    let r2: { arm: string; degraded?: boolean } | undefined;
    await act(async () => { r2 = await result.current.search("query on the new worker"); });
    expect(r2?.arm).toBe("hybrid-wsum");
    expect(r2?.degraded).toBeUndefined();
  });

  it("the fallback returns the matching docs, not just flags", async () => {
    loadMock.mockResolvedValue({
      id: "mock-model", dim: 384,
      embedDocs: () => Promise.resolve([vec()]),
      embedQueries: () => Promise.reject(new Error("embed boom")),
      dispose: vi.fn(),
    });
    const { result } = renderHook(() => useRepoSearch(null, 0));
    await act(async () => { await result.current.connect("o/r"); });
    await act(async () => { await result.current.enableSemantic(); });
    let r: { arm: string; degraded?: boolean; repos: { id: string }[] } | undefined;
    await act(async () => { r = await result.current.search("sample issue"); });
    expect(r?.arm).toBe("bm25f+sig");
    expect(r?.degraded).toBe(true);
    expect(r?.repos.map((h) => h.id)).toContain("o/r#1");
    // And the next query goes straight to keywords without another failure.
    let r3: { arm: string; degraded?: boolean; repos: { id: string }[] } | undefined;
    await act(async () => { r3 = await result.current.search("sample issue"); });
    expect(r3?.arm).toBe("bm25f+sig");
    expect(r3?.degraded).toBeUndefined();
    expect(r3?.repos.map((h) => h.id)).toContain("o/r#1");
  });
});

describe("real worker lifecycle", () => {
  class HangWorker {
    onmessage: ((e: MessageEvent) => void) | null = null;
    onerror: ((e: ErrorEvent) => void) | null = null;
    posted: { id: number; type: string }[] = [];
    postMessage(msg: { id: number; type: string }) {
      this.posted.push(msg);
      if (msg.type === "init") {
        queueMicrotask(() => this.onmessage?.({ data: { id: msg.id, type: "ready", modelId: "mock-model", dim: 384, ms: 1 } } as MessageEvent));
      }
      // "embed" never answers: the worker is hung mid-query.
    }
    terminate() { /* real terminate kills it silently */ }
  }

  it("dispose settles an in-flight embed and rejects later calls (actual WorkerEmbedder)", async () => {
    vi.stubGlobal("Worker", HangWorker);
    try {
      const { WorkerEmbedder } = await vi.importActual<typeof EmbedClientModule>("@/search/embed-client");
      const emb = await WorkerEmbedder.load();
      const inFlight = emb.embedQueries(["a query that never answers"]);
      emb.dispose();
      // Bounded settlement: the in-flight call rejects instead of hanging.
      await expect(inFlight).rejects.toThrow("disposed");
      // Later calls on the disposed instance reject immediately.
      await expect(emb.embedQueries(["next"])).rejects.toThrow("disposed");
      // And dispose is safe to repeat.
      expect(() => emb.dispose()).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("disable during load: stale progress and completion cannot resurrect the model", async () => {
    let progressCb: ((p: { loaded: number; total: number }) => void) | undefined;
    let resolveLoad: (w: unknown) => void = () => undefined;
    const dispose = vi.fn();
    loadMock.mockImplementation((onProgress: (p: { loaded: number; total: number }) => void) => {
      progressCb = onProgress;
      return new Promise((res) => { resolveLoad = res; });
    });
    const { result } = renderHook(() => useRepoSearch(null, 0));
    await act(async () => {
      const p = result.current.enableSemantic();
      // User turns it off while the model is still downloading.
      result.current.disableSemantic();
      // A late progress event from the obsolete load must not overwrite "off".
      progressCb?.({ loaded: 5, total: 10 });
      resolveLoad({ id: "mock-model", dim: 384, embedDocs: () => Promise.resolve([vec()]), embedQueries: () => Promise.resolve([vec()]), dispose });
      await p;
    });
    expect(result.current.model.state).toBe("off");
    expect(dispose).toHaveBeenCalled();
  });

  it("a second enable during the first load does not start a competing load", async () => {
    let resolveLoad: (w: unknown) => void = () => undefined;
    loadMock.mockImplementation(() => new Promise((res) => { resolveLoad = res; }));
    const { result } = renderHook(() => useRepoSearch(null, 0));
    await act(async () => {
      const p1 = result.current.enableSemantic();
      const p2 = result.current.enableSemantic();
      resolveLoad({ id: "mock-model", dim: 384, embedDocs: () => Promise.resolve([vec()]), embedQueries: () => Promise.resolve([vec()]), dispose: vi.fn() });
      await Promise.all([p1, p2]);
    });
    expect(loadMock).toHaveBeenCalledTimes(1);
    expect(result.current.model.state).toBe("ready");
  });
});

describe("load retry", () => {
  it("disable then immediate re-enable loads again and ends ready", async () => {
    const resolvers: ((w: unknown) => void)[] = [];
    const disposes: ReturnType<typeof vi.fn>[] = [];
    loadMock.mockImplementation(() => new Promise((res) => { resolvers.push(res); }));
    const { result } = renderHook(() => useRepoSearch(null, 0));
    await act(async () => {
      const p1 = result.current.enableSemantic();
      result.current.disableSemantic();
      const p2 = result.current.enableSemantic();
      // The abandoned load completes late: generation-guarded, disposed.
      const d1 = vi.fn(); disposes.push(d1);
      resolvers[0]!({ id: "mock-model", dim: 384, embedDocs: () => Promise.resolve([vec()]), embedQueries: () => Promise.resolve([vec()]), dispose: d1 });
      // The retry's load completes: this one owns the state.
      resolvers[1]!({ id: "mock-model", dim: 384, embedDocs: () => Promise.resolve([vec()]), embedQueries: () => Promise.resolve([vec()]), dispose: vi.fn() });
      await Promise.all([p1, p2]);
    });
    expect(loadMock).toHaveBeenCalledTimes(2);
    expect(disposes[0]).toHaveBeenCalled();
    expect(result.current.model.state).toBe("ready");
  });
});

describe("note embedding lifecycle (live engine)", () => {
  const engine = (notes: { id: string; text: string }[]) =>
    ({ timeline: () => notes.map((n) => ({ ...n, kind: "learned", createdAt: "2026-01-01T00:00:00Z" })) }) as never;

  it("a failed note re-embed marks the model errored and disposes only its own worker", async () => {
    const dispose = vi.fn();
    loadMock.mockResolvedValue({
      id: "mock-model", dim: 384,
      embedDocs: vi.fn()
        .mockResolvedValueOnce([vec()]) // initial enable embeds the existing note
        .mockRejectedValueOnce(new Error("worker died")), // the note update re-embed fails
      embedQueries: () => Promise.resolve([vec()]),
      dispose,
    });
    const { result, rerender } = renderHook(({ e, rev }) => useRepoSearch(e, rev), { initialProps: { e: engine([{ id: "n1", text: "first version" }]), rev: 0 } });
    await act(async () => { await result.current.enableSemantic(); });
    expect(result.current.model.state).toBe("ready");

    await act(async () => {
      rerender({ e: engine([{ id: "n1", text: "changed version" }]), rev: 1 });
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(dispose).toHaveBeenCalled();
    expect(result.current.model.state).toBe("error");
  });

  it("disable during a pending note embed settles quietly: off, not error, no unhandled rejection", async () => {
    let rejectEmbed: (e: Error) => void = () => {};
    const dispose = vi.fn(() => rejectEmbed(new Error("embedder disposed")));
    loadMock.mockResolvedValue({
      id: "mock-model", dim: 384,
      embedDocs: vi.fn()
        .mockResolvedValueOnce([vec()])
        .mockImplementationOnce(() => new Promise((_, rej) => { rejectEmbed = rej; })),
      embedQueries: () => Promise.resolve([vec()]),
      dispose,
    });
    const { result, rerender } = renderHook(({ e, rev }) => useRepoSearch(e, rev), { initialProps: { e: engine([{ id: "n1", text: "first version" }]), rev: 0 } });
    await act(async () => { await result.current.enableSemantic(); });
    expect(result.current.model.state).toBe("ready");

    await act(async () => {
      rerender({ e: engine([{ id: "n1", text: "changed version" }]), rev: 1 });
      await Promise.resolve();
    });
    await act(async () => {
      result.current.disableSemantic();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(dispose).toHaveBeenCalled();
    expect(result.current.model.state).toBe("off");
  });
});
