#!/usr/bin/env node
/**
 * Self-hosts the semantic search model and the ONNX Runtime wasm files, so the
 * browser loads them from this site's own origin (no third-party requests,
 * CSP stays connect-src 'self' for models).
 *
 *   public/models/Xenova/bge-small-en-v1.5/...   (~34 MB, int8 ONNX + tokenizer)
 *   public/ort/ort-wasm-*.{mjs,wasm}             (from node_modules/onnxruntime-web)
 *
 * Runs as `prebuild`. Best-effort: if the network is unavailable the build
 * continues and the app reports semantic search as unavailable.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const MODEL = "Xenova/bge-small-en-v1.5";
const FILES = ["config.json", "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json", "onnx/model_quantized.onnx"];
const OUT = join("public", "models", MODEL);

async function fetchModel() {
  for (const f of FILES) {
    const dest = join(OUT, f);
    if (existsSync(dest) && statSync(dest).size > 0) continue;
    mkdirSync(dirname(dest), { recursive: true });
    const url = `https://huggingface.co/${MODEL}/resolve/main/${f}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`${res.status} for ${url}`);
    writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    console.log(`fetched ${f} (${(statSync(dest).size / 1e6).toFixed(1)} MB)`);
  }
}

function copyOrt() {
  const src = join("node_modules", "onnxruntime-web", "dist");
  if (!existsSync(src)) throw new Error("onnxruntime-web is not installed");
  mkdirSync(join("public", "ort"), { recursive: true });
  for (const f of readdirSync(src)) {
    if (/^ort-wasm.*\.(wasm|mjs)$/.test(f)) copyFileSync(join(src, f), join("public", "ort", f));
  }
}

try {
  copyOrt();
  await fetchModel();
  console.log("semantic search assets ready");
} catch (err) {
  console.warn(`semantic search assets unavailable: ${err instanceof Error ? err.message : err}. The app falls back to keyword search.`);
}
