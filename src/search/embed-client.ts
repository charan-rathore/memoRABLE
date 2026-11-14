import type { Embedder } from "./engine";

/**
 * Main-thread side of the embedding worker. Implements `Embedder`, so the
 * SearchIndex treats it like any other model.
 */
export interface ModelLoad { loaded: number; total: number }

export class WorkerEmbedder implements Embedder {
  id = "bge-small-en-v1.5@q8";
  dim = 384;
  private worker: Worker;
  private seq = 0;
  private disposed = false;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; onProgress?: (p: ModelLoad) => void }>();
  /** Measured, last call. */
  lastMs = 0;

  private constructor(worker: Worker) {
    this.worker = worker;
    worker.onmessage = (e: MessageEvent<{ id: number; type: string; [k: string]: unknown }>) => {
      const p = this.pending.get(e.data.id);
      if (!p) return;
      if (e.data.type === "progress") { p.onProgress?.({ loaded: Number(e.data.loaded), total: Number(e.data.total) }); return; }
      this.pending.delete(e.data.id);
      if (e.data.type === "error") p.reject(new Error(String(e.data.message)));
      else p.resolve(e.data);
    };
    worker.onerror = (e) => { for (const p of this.pending.values()) p.reject(new Error(e.message || "worker failed")); this.pending.clear(); };
  }

  private call<T>(msg: Record<string, unknown>, onProgress?: (p: ModelLoad) => void): Promise<T> {
    if (this.disposed) return Promise.reject(new Error("embedder disposed"));
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, ...(onProgress ? { onProgress } : {}) });
      this.worker.postMessage({ id, ...msg });
    });
  }

  static async load(onProgress?: (p: ModelLoad) => void): Promise<WorkerEmbedder> {
    const worker = new Worker(new URL("./embed.worker.ts", import.meta.url), { type: "module" });
    const e = new WorkerEmbedder(worker);
    try {
      const ready = await e.call<{ modelId: string; dim: number; ms: number }>({ type: "init" }, onProgress);
      e.id = ready.modelId; e.dim = ready.dim; e.lastMs = ready.ms;
      return e;
    } catch (err) {
      // A failed init must not leave the worker running.
      e.dispose();
      throw err;
    }
  }

  private async embed(kind: "query" | "doc", texts: string[]) {
    const r = await this.call<{ vectors: Float32Array[]; ms: number }>({ type: "embed", kind, texts });
    this.lastMs = r.ms;
    return r.vectors;
  }
  embedQueries(texts: string[]) { return this.embed("query", texts); }
  embedDocs(texts: string[]) { return this.embed("doc", texts); }
  /** Idempotent: racing owners (a failed query and a disable, say) may both
   *  dispose the same worker; terminating twice must be safe. Terminating
   *  also kills the worker without another message, so every pending call is
   *  rejected here - an awaited embed/load must settle, not hang. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.worker.terminate();
    const err = new Error("embedder disposed");
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }
}

/** Is a self-hosted model present in this build? (GET of the 1 KB config; not every server answers HEAD for static files.) */
export async function modelAvailable(): Promise<boolean> {
  try { const r = await fetch("/models/Xenova/bge-small-en-v1.5/config.json", { cache: "no-store" }); return r.ok; }
  catch { return false; }
}
