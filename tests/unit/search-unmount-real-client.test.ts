// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/search/embed-client", async () => {
 const actual = await vi.importActual<Record<string, unknown>>("@/search/embed-client");
 return { ...actual, modelAvailable: async () => true };
});
import { useRepoSearch } from "@/components/today/use-repo-search";

// Actual WorkerEmbedder, with just the browser Worker transport substituted.
// Init responds; inference deliberately never does. Termination is therefore
// responsible for rejecting the pending call, not a helpful worker response.
class HungInferenceWorker {
 static instances: HungInferenceWorker[] = [];
 onmessage: ((event: { data: unknown }) => void) | null = null;
 onerror: ((event: { message: string }) => void) | null = null;
 terminate = vi.fn();
 postMessage(message: { type: string; id: number }) {
  if (message.type === "init") queueMicrotask(() => this.onmessage?.({ data: { id: message.id, type: "ready", modelId: "fixture", dim: 384, ms: 0 } }));
 }
 constructor() { HungInferenceWorker.instances.push(this); }
}
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); HungInferenceWorker.instances = []; });

it("unmount terminates the actual embed client's worker and settles a hung query", async () => {
 vi.stubGlobal("Worker", HungInferenceWorker);
 const { result, unmount } = renderHook(() => useRepoSearch(null, 0));
 await act(async () => { await result.current.enableSemantic(); });
 expect(result.current.model.state).toBe("ready");
 let search!: ReturnType<typeof result.current.search>;
 await act(async () => { search = result.current.search("authentication failure"); });
 unmount();
 const settled = await Promise.race([search, new Promise<"timeout">((r) => setTimeout(() => r("timeout"), 100))]);
 expect(settled).not.toBe("timeout");
 if (settled !== "timeout") expect(settled.arm).toBe("bm25f+sig");
 expect(HungInferenceWorker.instances).toHaveLength(1);
 expect(HungInferenceWorker.instances[0]!.terminate).toHaveBeenCalledTimes(1);
 expect(localStorage.getItem("memorable.semantic")).toBe("on");
});
