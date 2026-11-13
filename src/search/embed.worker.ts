/**
 * Embedding worker: runs bge-small-en-v1.5 (int8 ONNX) off the main thread so
 * typing never waits on the model. Weights and wasm are served from this
 * site (see scripts/fetch-search-model.mjs); nothing is fetched elsewhere.
 */
import { MODELS, createEmbedder } from "./models";
import type { Embedder } from "./engine";

type In =
  | { id: number; type: "init" }
  | { id: number; type: "embed"; kind: "query" | "doc"; texts: string[] };

let embedder: Embedder | null = null;
// Minimal worker scope type (avoids pulling the webworker lib into the DOM program).
const ctx = self as unknown as {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<In>) => void) | null;
};

ctx.onmessage = async (e: MessageEvent<In>) => {
  const msg = e.data;
  try {
    if (msg.type === "init") {
      const t0 = performance.now();
      embedder ??= await createEmbedder(MODELS["bge-small-en-v1.5"]!, {
        dtype: "q8",
        device: "wasm",
        progress: (p) => ctx.postMessage({ id: msg.id, type: "progress", loaded: p.loaded, total: p.total }),
        configure: (env) => {
          env.allowRemoteModels = false;
          env.allowLocalModels = true;
          env.localModelPath = "/models/";
          const onnx = (env.backends as { onnx: { wasm: Record<string, unknown> } }).onnx;
          onnx.wasm.wasmPaths = "/ort/";
          onnx.wasm.numThreads = 1; // no SharedArrayBuffer / cross-origin isolation needed
        },
      });
      ctx.postMessage({ id: msg.id, type: "ready", modelId: embedder.id, dim: embedder.dim, ms: performance.now() - t0 });
      return;
    }
    if (!embedder) throw new Error("model not loaded");
    const t0 = performance.now();
    const vecs = msg.kind === "query" ? await embedder.embedQueries(msg.texts) : await embedder.embedDocs(msg.texts);
    ctx.postMessage({ id: msg.id, type: "vectors", vectors: vecs, ms: performance.now() - t0 }, vecs.map((v) => v.buffer as ArrayBuffer));
  } catch (err) {
    ctx.postMessage({ id: msg.id, type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
