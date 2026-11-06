import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { readPdfBuffer } from "../src/import/read-pdf";
import { importSource } from "../src/import/import-source";
import { renderBundle } from "../src/render/render-bundle";
import { buildWordDocument } from "../src/utils/print-export";

const ALL = ["bitcoin-whitepaper","dqn-atari","gan","hinton-distilling","mobilenets","n18-short2","p18-short2","word2vec-phrases"];
const papers = process.env.ONLY ? process.env.ONLY.split(",") : ALL;
const outBase = "/tmp/gauntlet-exports";
for (const p of papers) {
  const t0 = Date.now();
  const bytes = new Uint8Array(readFileSync(`tests/fixtures/${p}.pdf`));
  const pdf = await readPdfBuffer(bytes);
  const res = importSource({ raw: pdf.text, label: `${p}.pdf` });
  if (!res.ok) { console.log(`${p}: IMPORT FAIL ${JSON.stringify(res).slice(0,200)}`); continue; }
  const doc = res.value;
  const bundle = renderBundle(doc);
  const dir = `${outBase}/${p}`;
  mkdirSync(dir, { recursive: true });
  const line: Record<string, unknown> = { paper: p, pages: pdf.pageCount ?? null, blocks: doc.blocks.length, ms: Date.now()-t0, modes: {} as Record<string, unknown> };
  for (const [mode, out] of Object.entries(bundle.outputs)) {
    (line.modes as Record<string, unknown>)[mode] = { html: out.html?.length ?? 0, error: out.error, design: !!out.designJson };
    if (out.html) {
      writeFileSync(`${dir}/${mode}.html`, out.html);
      writeFileSync(`${dir}/${mode}.doc`, buildWordDocument(out.html, doc.title));
    }
  }
  console.log(JSON.stringify(line));
}
