import { describe, expect, it } from "vitest";
import { analyze, splitCompound } from "@/search/analyze";
import { Bm25fIndex, BM25F_V1 } from "@/search/bm25f";
import { SearchIndex, type Embedder } from "@/search/engine";
import { rrf, weightedSum } from "@/search/fusion";
import { expand } from "@/search/lexicon";
import { mrrAt, ndcgAt, pairedBootstrap, recallAt } from "@/search/metrics";
import { errorSignatures, hashSignature, normalizeErrorLine } from "@/search/signature";
import { VectorIndex } from "@/search/vector";

describe("technical analyzer", () => {
  it("keeps compounds whole and splits them into what people type", () => {
    expect(splitCompound("readFileSync")).toEqual(["read", "File", "Sync"]);
    expect(splitCompound("ERR_REQUIRE_ESM")).toEqual(["ERR", "REQUIRE", "ESM"]);
    expect(splitCompound("next/navigation")).toEqual(["next", "navigation"]);
    const t = analyze("fs.readFileSync throws ERR_REQUIRE_ESM in next@16.4.5");
    expect(t).toEqual(expect.arrayContaining(["fs.readfilesync", "read", "fil", "sync", "err_require_esm", "esm", "16.4.5"]));
  });

  it("drops ids and filler but keeps status codes", () => {
    const t = analyze("Thanks! Please see issue 1234567 returning 404 and 500");
    expect(t).not.toContain("1234567");
    expect(t).toEqual(expect.arrayContaining(["404", "500"]));
    expect(t).not.toContain("please");
  });
});

describe("error signatures", () => {
  it("normalizes paths, numbers and quoted values so two reports match", () => {
    const a = errorSignatures("Build fails:\nTypeError: Cannot read properties of undefined (reading 'map')\n    at /Users/ana/app/src/page.tsx:12:5");
    const b = errorSignatures("TypeError: Cannot read properties of undefined (reading 'filter') at C:\\work\\x\\index.js:88:1");
    expect(a[0]).toBe(normalizeErrorLine("TypeError: Cannot read properties of undefined (reading 'x')"));
    expect(hashSignature(a[0]!)).toBe(hashSignature(b[0]!.replace(/ at <path>$/, "")));
  });

  it("ignores lines that are only placeholders", () => {
    expect(errorSignatures("Error 500 at 0x1f")).toEqual([]);
  });
});

describe("BM25F", () => {
  it("weights a title match above the same match in a long body", () => {
    const idx = new Bm25fIndex(BM25F_V1);
    idx.upsert("t", { title: "Hot reload stops working", body: "after upgrading" });
    idx.upsert("b", { title: "Upgrade notes", body: "many words about build output and logs; hot reload mentioned once here among other things" });
    const r = idx.search(new Map([["hot", 1], ["reload", 1]]));
    expect(r.hits.map((h) => h.id)).toEqual(["t", "b"]);
  });

  it("removes cleanly and respects the allow filter", () => {
    const idx = new Bm25fIndex();
    idx.upsert("a", { title: "webpack cache" });
    idx.upsert("b", { title: "webpack cache" });
    idx.remove("a");
    expect(idx.search(new Map([["webpack", 1]])).hits.map((h) => h.id)).toEqual(["b"]);
    expect(idx.search(new Map([["webpack", 1]]), 10, () => false).hits).toEqual([]);
  });
});

describe("lexicon", () => {
  it("expands abbreviations both ways at query time", () => {
    expect(expand(analyze("k8s pod crash"))).toEqual(expect.arrayContaining(["kubernet"]));
    expect(expand(analyze("hot reload broken"))).toEqual(expect.arrayContaining(["hmr"]));
  });
});

describe("vector index", () => {
  it("finds exact nearest neighbours, supports O(1) delete, and int8 stays close", () => {
    const f = new VectorIndex(3), q = new VectorIndex(3, true);
    const vs: Record<string, number[]> = { a: [1, 0, 0], b: [0.9, 0.1, 0], c: [0, 1, 0], d: [0, 0, 1] };
    for (const [id, v] of Object.entries(vs)) { f.upsert(id, v); q.upsert(id, v); }
    expect(f.search([1, 0.05, 0], 2).map((h) => h.id)).toEqual(["a", "b"]);
    expect(q.search([1, 0.05, 0], 2).map((h) => h.id)).toEqual(["a", "b"]);
    f.remove("a");
    expect(f.search([1, 0, 0], 1)[0]!.id).toBe("b");
    expect(f.size).toBe(3);
    expect(q.bytes).toBe(4 * 3 + 4 * 4);
    expect(f.bytes).toBe(3 * 3 * 4);
  });
});

describe("fusion and metrics", () => {
  it("RRF rewards agreement between lists", () => {
    const fused = rrf([[{ id: "x", score: 9 }, { id: "y", score: 8 }], [{ id: "y", score: 0.9 }, { id: "z", score: 0.8 }]]);
    expect(fused[0]!.id).toBe("y");
    expect(weightedSum([[{ id: "x", score: 9 }, { id: "y", score: 1 }]], [1])[0]!.id).toBe("x");
  });

  it("computes recall, MRR, nDCG and a paired bootstrap", () => {
    const rel = new Set(["b"]);
    expect(recallAt(["a", "b"], rel, 1)).toBe(0);
    expect(recallAt(["a", "b"], rel, 2)).toBe(1);
    expect(mrrAt(["a", "b"], rel)).toBe(0.5);
    expect(ndcgAt(["b"], rel)).toBe(1);
    const ci = pairedBootstrap([0, 0, 0, 0], [1, 1, 1, 1]);
    expect(ci).toMatchObject({ diff: 1, lo: 1, hi: 1 });
  });
});

describe("hybrid engine", () => {
  const fake: Embedder = {
    id: "fake", dim: 2,
    embedQueries: async (t) => t.map((s) => Float32Array.from(/slow|lag/.test(s) ? [1, 0] : [0, 1])),
    embedDocs: async (t) => t.map((s) => Float32Array.from(/performance|sluggish/.test(s) ? [1, 0] : [0, 1])),
  };

  it("dense finds paraphrases lexical misses; hybrid keeps both", async () => {
    const idx = new SearchIndex(fake);
    idx.upsert({ id: "1", kind: "issue", title: "Editor feels sluggish while entering text", body: "performance", source: "r", createdAt: "2026-01-01" });
    idx.upsert({ id: "2", kind: "issue", title: "Slow typing in terminal", body: "", source: "r", createdAt: "2026-01-01" });
    await idx.embed(["1", "2"]);
    const lex = await idx.search("slow typing", { arm: "bm25f" });
    expect(lex.hits.map((h) => h.id)).toEqual(["2"]);
    const hyb = await idx.search("slow typing", { arm: "hybrid-rrf" });
    expect(hyb.hits.map((h) => h.id)).toEqual(expect.arrayContaining(["1", "2"]));
  });

  it("boosts an exact error signature match", async () => {
    const idx = new SearchIndex();
    idx.upsert({ id: "sig", kind: "issue", title: "Crash on start", body: "Error [ERR_REQUIRE_ESM]: require() of ES Module /a/b/c.js not supported", source: "r", createdAt: "2026-01-01" });
    idx.upsert({ id: "noise", kind: "issue", title: "require ES module support question", body: "how do I require an es module", source: "r", createdAt: "2026-01-01" });
    const r = await idx.search("Error [ERR_REQUIRE_ESM]: require() of ES Module /x/y/z.mjs not supported", { arm: "bm25f+sig" });
    expect(r.hits[0]).toMatchObject({ id: "sig", signatureMatch: true });
  });
});
