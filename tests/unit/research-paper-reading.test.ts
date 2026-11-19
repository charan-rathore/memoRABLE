import { describe, it, expect } from "vitest";
import { importSource } from "@/import/import-source";
import { headlineClaim, paperTitleFrom } from "@/understanding/research";
import { planStory } from "@/story/plan";

const filler = Array.from({ length: 90 }, (_, i) => `Sentence ${i + 1} describes the setup in plain words without any claim.`).join("\n");
// Shaped like a real conference paper PDF: no title metadata, an ALL-CAPS
// title line, authors, and References only at the very end.
const paper = [
  "STREAMING TRANSLATOR FOR ON-DEVICE SPEECH-TO-SPEECH CONVERSION",
  "A. Author, B. Author",
  "Example Lab",
  "",
  "ABSTRACT",
  "We study how to run speech conversion on a phone while the speaker is still talking.",
  "We show that our streaming approach is ≈2x faster than real time on a mobile CPU.",
  "",
  "1. INTRODUCTION",
  "With the increase in computational resources of mobile devices, on-device inference has become important [1].",
  filler,
  "",
  "3. RESULTS",
  "Small model",
  "We also compare int4 quantization aware training with int8 post training quantization.",
  "Our results show the delay drops below 300ms for every streaming configuration.",
  "",
  "4. CONCLUSIONS",
  "Streaming the encoder while the speaker talks removes most of the delay.",
  "",
  "5. REFERENCES",
  "[1] A. Author et al. Earlier work on the 1980s vocoder. 2020.",
].join("\n");

describe("reading a research paper", () => {
  const r = importSource({ raw: paper, label: "2210.99999.pdf" });
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  const doc = r.value;
  const snap = doc.blocks.find((b) => b.kind === "snapshot")!.payload as { heading: string; hook?: string };

  it("names the paper by its title, not its file, and doesn't shout", () => {
    expect(doc.title).toBe("Streaming Translator for On-Device Speech-to-Speech Conversion");
    expect(snap.heading).toBe(doc.title);
  });

  it("leads with what the authors found", () => {
    expect(snap.hook).toMatch(/≈2x faster than real time/);
  });

  it("measures only numbers that measure something", () => {
    const signals = (doc.blocks.find((b) => b.kind === "signals")?.payload as { entries: Array<{ value?: string }> } | undefined)?.entries ?? [];
    const values = signals.map((s) => s.value ?? "");
    expect(values).not.toContain("4");
    expect(values).not.toContain("1980");
  });
});

describe("paper helpers", () => {
  it("skips footnote markers and markdown before the title", () => {
    expect(paperTitleFrom(["<!-- page:1 -->", "∗", "# Near-Quadratic Sample Compression for All VC Classes", "Yang Cai, Vineet Gupta"])).toBe("Near-Quadratic Sample Compression for All VC Classes");
    expect(paperTitleFrom(["Abstract", "We study things."])).toBeNull();
  });
  it("prefers a result with a number and a comparison over motivation", () => {
    expect(headlineClaim([
      "With the increase in computational resources, on-device inference has become an important topic.",
      "We have shown that non-streaming mode increases the delay.",
      "Our experiments show the model is 2x faster than the baseline.",
    ])).toBe("Our experiments show the model is 2x faster than the baseline.");
  });
});

describe("a paper as a story", () => {
  const r = importSource({ raw: paper, label: "2210.99999.pdf" });
  if (!r.ok) throw new Error("parse");
  const story = planStory(r.value);
  it("tells what it found, in the paper's words, after the opening", () => {
    expect(story.beats[0]!.kind).toBe("open");
    const found = story.beats.find((b) => b.kind === "choices" && b.eyebrow === "what it found");
    expect(found).toBeDefined();
    if (found?.kind !== "choices") throw new Error();
    expect(found.choices.every((c) => c.stamp === "found")).toBe(true);
    expect(story.beats.some((b) => b.eyebrow === "what moved")).toBe(false);
  });
});
