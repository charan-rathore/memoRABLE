import type { Embedder } from "./engine";

/**
 * Embedding models under evaluation. All are small enough to run in a
 * browser tab (int8 ONNX, 23-34 MB) and produce 384-dimensional vectors.
 *
 * Published MTEB English retrieval (nDCG@10) for reference; our own
 * benchmark on GitHub duplicates decides which one ships:
 *   bge-small-en-v1.5   33M  53.9
 *   arctic-embed-xs     23M  50.2
 *   all-MiniLM-L6-v2    23M  42.9  (the common default; included as a floor)
 */
export interface ModelSpec {
  key: string;
  hf: string;
  dim: number;
  pooling: "cls" | "mean";
  queryPrefix: string;
  docPrefix: string;
  approxMB: number;
}

export const MODELS: Record<string, ModelSpec> = {
  "bge-small-en-v1.5": {
    key: "bge-small-en-v1.5", hf: "Xenova/bge-small-en-v1.5", dim: 384, pooling: "cls",
    queryPrefix: "Represent this sentence for searching relevant passages: ", docPrefix: "", approxMB: 34,
  },
  "arctic-embed-xs": {
    key: "arctic-embed-xs", hf: "Snowflake/snowflake-arctic-embed-xs", dim: 384, pooling: "cls",
    queryPrefix: "Represent this sentence for searching relevant passages: ", docPrefix: "", approxMB: 23,
  },
  "all-MiniLM-L6-v2": {
    key: "all-MiniLM-L6-v2", hf: "Xenova/all-MiniLM-L6-v2", dim: 384, pooling: "mean",
    queryPrefix: "", docPrefix: "", approxMB: 23,
  },
};

type Extractor = (texts: string[], opts: { pooling: "cls" | "mean"; normalize: boolean }) => Promise<{ data: Float32Array; dims: number[] }>;

/**
 * Embedder backed by Transformers.js (ONNX Runtime). Works in Node (CI
 * benchmark) and in a browser worker. `configure` lets the caller point the
 * library at self-hosted model files and wasm binaries.
 */
export async function createEmbedder(
  spec: ModelSpec,
  opts: {
    dtype?: "q8" | "fp32";
    device?: "wasm" | "webgpu" | "cpu";
    configure?: (env: Record<string, unknown>) => void;
    /** Download progress summed over all model files. */
    progress?: (p: { loaded: number; total: number }) => void;
  } = {},
): Promise<Embedder> {
  const tf = await import("@huggingface/transformers");
  opts.configure?.(tf.env as unknown as Record<string, unknown>);
  const files = new Map<string, { loaded: number; total: number }>();
  const extractor = (await tf.pipeline("feature-extraction", spec.hf, {
    dtype: opts.dtype ?? "q8",
    ...(opts.device ? { device: opts.device } : {}),
    ...(opts.progress
      ? {
          progress_callback: (p: { status?: string; file?: string; loaded?: number; total?: number }) => {
            if (p.status !== "progress" || !p.file) return;
            files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 });
            let loaded = 0, total = 0;
            for (const f of files.values()) { loaded += f.loaded; total += f.total; }
            opts.progress!({ loaded, total });
          },
        }
      : {}),
  })) as unknown as Extractor;

  const run = async (texts: string[], prefix: string) => {
    const out = await extractor(texts.map((t) => prefix + t), { pooling: spec.pooling, normalize: true });
    const [n, d] = out.dims as [number, number];
    return Array.from({ length: n }, (_, i) => out.data.slice(i * d, (i + 1) * d));
  };
  return {
    id: `${spec.key}@${opts.dtype ?? "q8"}`,
    dim: spec.dim,
    embedQueries: (t) => run(t, spec.queryPrefix),
    embedDocs: (t) => run(t, spec.docPrefix),
  };
}
