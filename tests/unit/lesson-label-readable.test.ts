/**
 * A lesson signal's label must read like a phrase, not a keyword mash.
 *
 * "The trick is noticing which loop dominates right now" was labelled
 * "Trick noticing loop dominates right" - the stopword-stripped content
 * tokens rejoined with the interior words missing. Nobody can read that
 * label and know what it means. A label must be a contiguous clip of the
 * original sentence (or a matched concept phrase), ending on a real word.
 */
import { describe, expect, it } from "vitest";
import { importSource } from "@/import/import-source";

const notes = `# Thinking in Systems — Notes

## 2. Feedback loops
Balancing loops stabilize the stock; reinforcing loops amplify change. The trick is noticing which loop dominates right now.
`;

type SignalEntry = { label: string; implication?: string };

function signalsOf(raw: string, label: string): SignalEntry[] {
  const result = importSource({ raw, label });
  if (!result.ok) throw new Error("import failed");
  const block = result.value.blocks.find((b) => b.kind === "signals");
  return (block?.payload as { entries?: SignalEntry[] } | undefined)?.entries ?? [];
}

/** Every label word appears contiguously in this order in the source. */
function isContiguousClip(label: string, source: string): boolean {
  const hay = source.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  const needle = label.toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim().replace(/\s+/g, " ");
  return hay.includes(needle);
}

describe("lesson signal labels", () => {
  it("labels the loop-dominance lesson with a readable clip", () => {
    const entries = signalsOf(notes, "book-notes.md");
    const entry = entries.find((e) => /loop/i.test(e.label));
    expect(entry, "expected a signal about the loop lesson").toBeDefined();
    // Not the keyword mash with its interior words missing.
    expect(entry!.label).not.toBe("Trick noticing loop dominates right");
    expect(isContiguousClip(entry!.label, "The trick is noticing which loop dominates right now")).toBe(true);
    // Ends on a real word, not a dangling function word.
    expect(entry!.label).not.toMatch(/\b(the|is|which|a|an|of|to|and|or)$/i);
  });

  it("keeps the full sentence as the implication", () => {
    const entries = signalsOf(notes, "book-notes.md");
    const entry = entries.find((e) => /loop/i.test(e.implication ?? ""));
    expect(entry?.implication).toMatch(/noticing which loop dominates/);
  });

  it("still produces a non-empty label when a sentence is mostly function words", () => {
    const doc = `# Notes\n\n## Lessons\nThe point of it all is to keep going when it gets hard.\n`;
    const entries = signalsOf(doc, "notes.md");
    for (const e of entries) {
      expect(e.label.trim().length).toBeGreaterThan(0);
      expect(e.label).not.toMatch(/\b(the|is|of|to|it)$/i);
    }
  });
});
