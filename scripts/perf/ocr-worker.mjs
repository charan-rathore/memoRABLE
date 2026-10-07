// Compare cached healthy OCR calls with a chosen Git baseline, without network/CPU OCR noise.
import ts from "typescript";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
function load(source) {
  const { outputText } = ts.transpileModule(source.replace('await import("tesseract.js")', 'await Promise.resolve(globalThis.mockTesseract)'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const wrapper = { exports: {} };
  new Function("module", "exports", outputText)(wrapper, wrapper.exports);
  return wrapper.exports;
}
globalThis.mockTesseract = { createWorker: async () => ({ recognize: async () => ({ data: { text: "Useful OCR image text for healthy worker reuse", confidence: 90 } }), terminate: async () => {} }) };
const baseline = process.argv[2] ?? "origin/main";
const before = load(execFileSync("git", ["show", `${baseline}:src/import/pdf/ocr.ts`], { encoding: "utf8" }));
const after = load(fs.readFileSync("src/import/pdf/ocr.ts", "utf8"));
const images = [{ page: 1, png: new Uint8Array([1]), width: 100, height: 100 }];
async function run(mod, count) {
  const start = performance.now();
  for (let i = 0; i < count; i++) await mod.ocrImages(images);
  return performance.now() - start;
}
await run(before, 10000); await run(after, 10000);
const a = [], b = [];
for (let i = 0; i < 15; i++) {
  if (i % 2) { b.push(await run(after, 20000)); a.push(await run(before, 20000)); }
  else { a.push(await run(before, 20000)); b.push(await run(after, 20000)); }
}
const median = samples => [...samples].sort((x, y) => x - y)[7];
console.log(JSON.stringify({ baseline, callsPerSample: 20000, samples: 15, beforeMs: a, afterMs: b, beforeMedianMs: median(a), afterMedianMs: median(b), ratio: median(b) / median(a) }, null, 2));
// This is a repeatable local regression guard, not a speedup claim or live OCR benchmark.
if (median(b) > median(a) * 1.05) throw new Error("Healthy worker reuse slowed by more than the 5% timing-noise guard");
