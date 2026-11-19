import { expect, it } from "vitest";
import { readRisk } from "@/understanding/inference";

it.each([
  "The backup may not result in lost drafts but delays remain possible",
  "The backup may still result in lost drafts",
  "The backup could possibly result in lost drafts",
  "The backup may not necessarily result in lost drafts",
])("does not re-split a modal consequence: %s", (sentence) => {
  expect(readRisk(sentence)).toEqual({ risk: sentence });
});

it("keeps the diagnostic form without a modal consequence", () => {
  expect(readRisk("High impressions remain steady but low conversion creates wasted spend")).toEqual({
    risk: "High impressions remain steady",
    because: "Low conversion creates wasted spend",
  });
});

it("retains the existing 26-word risk clamp for long restored observations", () => {
  const words = "The backup may not result in lost drafts while regional operators inspect the protected archives and compare every retained record against their signed migration manifests before accepting delivery".split(" ");
  expect(readRisk(words.join(" "))).toEqual({ risk: words.slice(0, 26).join(" ") + "..." });
});

it.each([
  "not", "still", "also", "never", "always", "only", "even", "already", "yet",
  "possibly", "necessarily", "probably", "certainly", "definitely", "potentially",
  "actually", "eventually", "ultimately", "directly", "indirectly", "very well",
])("keeps a recognized modal adjunct: %s", (adjunct) => {
  const sentence = `The backup may ${adjunct} result in lost drafts`;
  expect(readRisk(sentence)).toEqual({ risk: sentence });
});
