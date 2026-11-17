// @vitest-environment jsdom
import { StrictMode, createElement, type PropsWithChildren } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ load: vi.fn(), putVectors: vi.fn() }));
vi.mock("@/search/embed-client", () => ({ modelAvailable: async () => true, WorkerEmbedder: { load: (...args: unknown[]) => mocks.load(...args) } }));
vi.mock("@/search/github", () => ({ validRepo: (s: string) => s, syncRepo: async () => ({ docs: [{ id: "o/r#1", kind: "issue", title: "saved issue", body: "", source: "o/r", createdAt: "2026-01-01" }], cursor: { repo: "o/r" } }) }));
vi.mock("@/search/store", async () => {
 const actual = await vi.importActual<Record<string, unknown>>("@/search/store");
 return { ...actual, SearchStore: { open: async () => ({ allDocs: async () => [], repos: async () => [], getVectors: async () => new Map(), putVectors: mocks.putVectors, putDocs: async () => undefined, putRepo: async () => undefined }) } };
});
import { useRepoSearch } from "@/components/today/use-repo-search";
const deferred = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { resolve, promise }; };
const vector = () => new Float32Array(384).fill(.01);
const worker = () => ({ id: "fixture", dim: 384, embedDocs: vi.fn(async () => [vector()]), embedQueries: vi.fn(async () => [vector()]), dispose: vi.fn() });
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); mocks.putVectors.mockResolvedValue(undefined); });

it("disposes the workspace semantic worker on unmount without changing the saved preference", async () => {
 const emb = worker(); mocks.load.mockResolvedValue(emb);
 const { result, unmount } = renderHook(() => useRepoSearch(null, 0));
 await act(async () => { await result.current.enableSemantic(); });
 expect(result.current.model.state).toBe("ready");
 unmount();
 expect(emb.dispose).toHaveBeenCalledTimes(1);
 expect(localStorage.getItem("memorable.semantic")).toBe("on");
});

it("disposes a model that finishes loading after its workspace unmounted", async () => {
 const pending = deferred<ReturnType<typeof worker>>(); const emb = worker(); mocks.load.mockReturnValue(pending.promise);
 const { result, unmount } = renderHook(() => useRepoSearch(null, 0));
 let enabling!: Promise<void>;
 await act(async () => { enabling = result.current.enableSemantic(); });
 unmount();
 await act(async () => { pending.resolve(emb); await enabling; });
 expect(emb.dispose).toHaveBeenCalledTimes(1);
 expect(emb.embedDocs).not.toHaveBeenCalled();
 expect(localStorage.getItem("memorable.semantic")).toBeNull();
});

it("abandons pending inference without persisting vectors after unmount", async () => {
 const pending = deferred<ReturnType<typeof vector>[]>(); const emb = worker(); emb.embedDocs.mockImplementation(() => pending.promise); mocks.load.mockResolvedValue(emb);
 const { result, unmount } = renderHook(() => useRepoSearch(null, 0));
 await act(async () => { await result.current.connect("o/r"); });
 let enabling!: Promise<void>;
 await act(async () => { enabling = result.current.enableSemantic(); });
 await waitFor(() => expect(emb.embedDocs).toHaveBeenCalledTimes(1));
 unmount();
 await act(async () => { pending.resolve([vector()]); await enabling; });
 expect(emb.dispose).toHaveBeenCalledTimes(1);
 expect(mocks.putVectors).not.toHaveBeenCalled();
});

it("still enables and searches in React StrictMode after its effect replay", async () => {
 const emb = worker(); mocks.load.mockResolvedValue(emb);
 const wrapper = ({ children }: PropsWithChildren) => createElement(StrictMode, null, children);
 const { result, unmount } = renderHook(() => useRepoSearch(null, 0), { wrapper });
 await act(async () => { await result.current.connect("o/r"); await result.current.enableSemantic(); });
 expect(result.current.model.state).toBe("ready");
 await act(async () => { expect((await result.current.search("saved issue")).repos[0]?.id).toBe("o/r#1"); });
 expect(emb.dispose).not.toHaveBeenCalled();
 unmount();
 expect(emb.dispose).toHaveBeenCalledTimes(1);
});
