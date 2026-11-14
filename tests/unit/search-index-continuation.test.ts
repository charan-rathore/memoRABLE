// @vitest-environment jsdom
// Background indexing continuations must belong to the worker and index that
// started them. A store read or write that resolves after a disable, a query
// failure, or a re-enable must not mutate the replacement index, write to the
// store for the stale pass, or put the model state back to ready/off-topic
// values. Runs RED without ownership guards in embedIds, GREEN with them.
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadMock = vi.fn();
vi.mock("@/search/embed-client", () => ({
  WorkerEmbedder: { load: (...args: unknown[]) => loadMock(...args) },
  modelAvailable: () => Promise.resolve(true),
}));

let docCounter = 0;
vi.mock("@/search/github", () => ({
  validRepo: (s: string) => (s.includes("/") ? s : null),
  syncRepo: () => {
    docCounter += 1;
    const n = docCounter;
    return Promise.resolve({
      docs: [{ id: `o/r#${n}`, kind: "issue", title: `sample issue ${n}`, body: "body", labels: [], source: "o/r", createdAt: "2026-01-01T00:00:00Z" }],
      cursor: { repo: "o/r" },
    });
  },
}));

// A store whose reads and writes the test can hold open. Everything else
// resolves immediately with empty values.
const storeMock = {
  getVectors: vi.fn(),
  putVectors: vi.fn(),
  allDocs: () => Promise.resolve([]),
  repos: () => Promise.resolve([]),
  putDocs: () => Promise.resolve(undefined),
  putRepo: () => Promise.resolve(undefined),
  removeSource: () => Promise.resolve([]),
  deleteRepo: () => Promise.resolve(undefined),
};
vi.mock("@/search/store", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/search/store");
  return { ...actual, SearchStore: { open: () => Promise.resolve(storeMock) } };
});

import { useRepoSearch } from "@/components/today/use-repo-search";

const vec = () => new Float32Array(384).fill(0.01);
const embedder = (overrides: Record<string, unknown> = {}) => ({
  id: "mock-model", dim: 384,
  embedDocs: vi.fn((texts: string[]) => Promise.resolve(texts.map(() => vec()))),
  embedQueries: vi.fn(() => Promise.resolve([vec()])),
  dispose: vi.fn(),
  ...overrides,
});
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
};

beforeEach(() => {
  loadMock.mockReset();
  storeMock.getVectors.mockReset().mockResolvedValue(new Map());
  storeMock.putVectors.mockReset().mockResolvedValue(undefined);
  docCounter = 0;
  localStorage.clear();
});

describe("background indexing continuation ownership", () => {
  it("abandons the pass when disable lands during the store read", async () => {
    const readGate = deferred<Map<string, unknown>>();
    storeMock.getVectors.mockReturnValue(readGate.promise);
    const emb = embedder();
    loadMock.mockResolvedValue(emb);
    const { result } = renderHook(() => useRepoSearch(null, 0));
    await act(async () => { await result.current.connect("o/r"); });

    let enabling!: Promise<void>;
    await act(async () => { enabling = result.current.enableSemantic(); });
    await vi.waitFor(() => expect(storeMock.getVectors).toHaveBeenCalled());

    await act(async () => { result.current.disableSemantic(); });
    expect(result.current.model.state).toBe("off");

    await act(async () => { readGate.resolve(new Map()); await enabling; });
    // The stale pass must not run its embedding loop, write the store, or
    // flip the model back to ready after the read resolves.
    expect(emb.embedDocs).not.toHaveBeenCalled();
    expect(storeMock.putVectors).not.toHaveBeenCalled();
    expect(result.current.model.state).toBe("off");
  });

  it("does not restore ready when a query failure lands during the store write", async () => {
    const emb = embedder({
      embedQueries: vi.fn(() => Promise.reject(new Error("query boom"))),
    });
    loadMock.mockResolvedValue(emb);
    const { result } = renderHook(() => useRepoSearch(null, 0));
    await act(async () => { await result.current.connect("o/r"); });
    await act(async () => { await result.current.enableSemantic(); });
    expect(result.current.model.state).toBe("ready");

    // A second batch of docs keeps indexing in the background; hold its
    // store write open.
    const writeGate = deferred<void>();
    storeMock.putVectors.mockReturnValue(writeGate.promise);
    let connecting!: Promise<string | null>;
    await act(async () => { connecting = result.current.connect("o/r2"); });
    // Phase 1 already wrote once; wait for this pass's write specifically.
    await vi.waitFor(() => expect(storeMock.putVectors).toHaveBeenCalledTimes(2));

    // A query embedding failure while the background write is pending tears
    // the worker down and marks the model errored.
    await act(async () => { await result.current.search("concurrency limit"); });
    expect(result.current.model.state).toBe("error");

    await act(async () => { writeGate.resolve(); await connecting; });
    // The finishing write must not resurrect a ready state over the error.
    expect(result.current.model.state).toBe("error");
  });

  it("a stale pass does not write into the re-enabled generation", async () => {
    const readGate = deferred<Map<string, unknown>>();
    storeMock.getVectors.mockReturnValueOnce(readGate.promise);
    const emb1 = embedder({ id: "stale-model" });
    const emb2 = embedder({ id: "fresh-model" });
    loadMock.mockResolvedValueOnce(emb1).mockResolvedValue(emb2);
    const { result } = renderHook(() => useRepoSearch(null, 0));
    await act(async () => { await result.current.connect("o/r"); });

    let firstEnable!: Promise<void>;
    await act(async () => { firstEnable = result.current.enableSemantic(); });
    await vi.waitFor(() => expect(storeMock.getVectors).toHaveBeenCalledTimes(1));

    await act(async () => { result.current.disableSemantic(); });
    await act(async () => { await result.current.enableSemantic(); });
    expect(result.current.model).toEqual({ state: "ready", modelId: "fresh-model" });

    const writesBefore = storeMock.putVectors.mock.calls.length;
    await act(async () => { readGate.resolve(new Map()); await firstEnable; });
    // The abandoned pass contributes nothing: no embedding with the stale
    // worker, no new store writes, and the ready state still names the fresh one.
    expect(emb1.embedDocs).not.toHaveBeenCalled();
    expect(storeMock.putVectors.mock.calls.length).toBe(writesBefore);
    expect(result.current.model).toEqual({ state: "ready", modelId: "fresh-model" });
  });
});
