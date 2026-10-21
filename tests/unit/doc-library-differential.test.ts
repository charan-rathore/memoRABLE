// @vitest-environment jsdom
/**
 * Differential fuzzing for the document library (Charan's standing
 * instruction, Oct 21): random operation sequences run through TWO
 * implementations that must agree — the real localStorage-backed library and
 * a small in-memory reference model of its documented contract — with no
 * hand-written oracle per case. Any divergence is a bug in one of them.
 * Seeds are fixed so a failure replays exactly.
 *
 * Contract under test (src/stats/doc-library.ts):
 * - one entry per source text (re-remembering replaces, never duplicates)
 * - newest first, at most 24 entries, entries older than 7 days pruned
 * - corrupt or foreign stored content reads as an empty library
 * - search matches title and label on the full query, source text on the
 *   query's first 80 chars (observed behavior, mirrored in the model)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listLibraryDocs, rememberLibraryDoc, searchLibraryDocs } from "@/stats/doc-library";

const MAX_ENTRIES = 24;
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TEXT_CAP = 1_048_576;

interface Doc {
  id: string;
  title: string;
  label: string;
  sourceText: string;
  savedAt: number;
}

/** The reference model: the contract above, nothing more. */
class LibraryModel {
  private docs: Doc[] = [];
  private nextId = 0;

  remember(input: { title: string; label: string; sourceText: string }): void {
    const stored = input.sourceText.slice(0, TEXT_CAP);
    this.docs = this.docs.filter((d) => d.sourceText !== stored);
    this.docs.unshift({
      id: `model-${this.nextId++}`,
      title: input.title.slice(0, 200) || "Untitled",
      label: input.label.slice(0, 120) || "Untitled",
      sourceText: stored,
      savedAt: Date.now(),
    });
    this.docs = this.docs.slice(0, MAX_ENTRIES);
  }

  list(): Doc[] {
    const now = Date.now();
    return this.docs
      .filter((d) => now - d.savedAt < TTL_MS)
      .sort((a, b) => b.savedAt - a.savedAt)
      .slice(0, MAX_ENTRIES);
  }

  search(query: string): Doc[] {
    const q = query.trim().toLowerCase();
    const docs = this.list();
    if (!q) return docs;
    return docs.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.label.toLowerCase().includes(q) ||
        d.sourceText.toLowerCase().includes(q.slice(0, 80)),
    );
  }

  corrupt(): void {
    this.docs = [];
  }
}

/** Deterministic RNG (mulberry32) so a failing seed replays. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = ["report", "invoice", "khichdi", "memo", "Q3", "retrieval", "recipe", "ledger", "notes", "plan"];

function randomText(rand: () => number, size: "small" | "medium" | "huge"): string {
  const words = () => Array.from({ length: 1 + Math.floor(rand() * 8) }, () => WORDS[Math.floor(rand() * WORDS.length)]).join(" ");
  if (size === "small") return words();
  if (size === "medium") return Array.from({ length: 40 }, words).join("\n");
  // > 1MB so the storage truncation matters; tail sits past the cap.
  return "x".repeat(TEXT_CAP - 8) + `TAIL-${Math.floor(rand() * 1e6)}`;
}

function semantic(docs: Array<Pick<Doc, "title" | "label" | "sourceText" | "savedAt">>): string {
  return JSON.stringify(docs.map((d) => [d.title, d.label, d.sourceText, d.savedAt]));
}

function runFuzz(seed: number, ops: number): void {
  const rand = rng(seed);
  const model = new LibraryModel();
  const pool: Array<{ title: string; label: string; sourceText: string }> = [];
  for (let op = 0; op < ops; op += 1) {
    const roll = rand();
    if (op === 20 || op === 90) {
      // Pinned edge: the same >1MB document imported twice must stay one entry.
      const huge = { title: "Huge", label: "huge.md", sourceText: randomText(rand, "huge") };
      model.remember(huge);
      rememberLibraryDoc(huge);
      model.remember(huge);
      rememberLibraryDoc(huge);
    } else if (roll < 0.45) {
      // Re-imports happen in real life: 1 in 4 remembers repeats a past input.
      let input: { title: string; label: string; sourceText: string };
      if (pool.length > 0 && rand() < 0.25) {
        input = pool[Math.floor(rand() * pool.length)]!;
      } else {
        const size = roll < 0.02 ? "huge" : roll < 0.25 ? "medium" : "small";
        input = {
          title: rand() < 0.1 ? "" : `Doc ${Math.floor(rand() * 12)}`,
          label: rand() < 0.1 ? "" : `file-${Math.floor(rand() * 12)}.md`,
          sourceText: randomText(rand, size),
        };
        pool.push(input);
      }
      model.remember(input);
      rememberLibraryDoc(input);
    } else if (roll < 0.6) {
      const query = rand() < 0.3 ? WORDS[Math.floor(rand() * WORDS.length)]! : "x".repeat(40 + Math.floor(rand() * 80));
      const real = searchLibraryDocs(query);
      const expected = model.search(query);
      expect(semantic(real), `search(${JSON.stringify(query).slice(0, 60)}) seed ${seed} op ${op}`).toBe(semantic(expected));
    } else if (roll < 0.68) {
      localStorage.setItem("memorable.library.v1", rand() < 0.5 ? "{not json" : JSON.stringify({ wrong: "shape" }));
      model.corrupt();
    } else if (roll < 0.78) {
      vi.setSystemTime(Date.now() + Math.floor(rand() * 10 * 24) * 60 * 60 * 1000);
    }
    const real = listLibraryDocs();
    const expected = model.list();
    expect(semantic(real), `list() after op ${op} (seed ${seed})`).toBe(semantic(expected));
  }
}

describe("document library — differential fuzz vs reference model", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-22T00:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  for (const seed of [1, 7, 42, 1337]) {
    it(`agrees with the model across 150 random ops (seed ${seed})`, () => {
      runFuzz(seed, 150);
    });
  }
});
