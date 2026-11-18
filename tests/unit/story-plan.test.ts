import { describe, expect, it } from "vitest";
import { importSource } from "@/import/import-source";
import { ATLAS_JSON_SOURCE, ATLAS_NOTES_SOURCE } from "@/import/examples/catalog";
import type { MemoryDocument } from "@/domain/memory/schema";
import { beforeOf, count, firstSentence, planStory, readNumber } from "@/story/plan";
import { likeSource, slot } from "@/story/motion";

const atlas = (): MemoryDocument => {
  const r = importSource({ raw: ATLAS_JSON_SOURCE, label: "atlas-q3-brief.json" });
  if (!r.ok) throw new Error("fixture");
  return r.value;
};

const without = (doc: MemoryDocument, kind: string): MemoryDocument => ({
  ...doc,
  blocks: doc.blocks.map((b) => (b.kind === kind ? ({ ...b, payload: { entries: [] } } as typeof b) : b)),
});

describe("reading the document's numbers", () => {
  it("reads values as the source wrote them", () => {
    expect(readNumber("$4.2M")).toEqual({ n: 4_200_000, unit: "$" });
    expect(readNumber("121%")).toEqual({ n: 121, unit: "%" });
    expect(readNumber("19 mo")?.n).toBe(19);
    expect(readNumber("1,250")?.n).toBe(1250);
    expect(readNumber(34)?.n).toBe(34);
  });

  it("refuses what isn't a number", () => {
    expect(readNumber("Explainable AI")).toBeNull();
    expect(readNumber("34 people in 3 cities")).toBeNull();
    expect(readNumber(undefined)).toBeNull();
  });

  it("works out the value before a change only when the delta's unit makes it exact", () => {
    expect(beforeOf("$4.2M", "+18%")).toBeCloseTo(4_200_000 / 1.18, 3);
    expect(beforeOf("121%", "+6 pts")).toBe(115);
    expect(beforeOf("19 mo", "+2 mo")).toBe(17);
    expect(beforeOf("34", "+5")).toBe(29);
    expect(beforeOf("34", -3)).toBe(37);
    expect(beforeOf("$4.2M", "+2 deals")).toBeNull();
    expect(beforeOf("$4.2M", "strong")).toBeNull();
    expect(beforeOf("$4.2M", undefined)).toBeNull();
  });

  it("writes a counted-up number in the source's own format", () => {
    expect(likeSource("$4.2M", 3_600_000)).toBe("$3.6M");
    expect(likeSource("19 mo", 17.4)).toBe("17 mo");
    expect(likeSource("121%", 115.2)).toBe("115%");
    expect(likeSource("1,250", 1000)).toBe("1,000");
  });
});

describe("planning the story", () => {
  it("tells the Atlas brief in seven beats, in reading order", () => {
    const s = planStory(atlas());
    expect(s.beats.map((b) => b.kind)).toEqual(["open", "numbers", "path", "choices", "pressure", "next", "close"]);
    expect(s.title).toBe("Momentum, with room to compound.");
  });

  it("charts numbers only when two or more can be read, each on its own scale", () => {
    const numbers = planStory(atlas()).beats.find((b) => b.kind === "numbers");
    expect(numbers?.kind === "numbers" && numbers.chart).toBe("bars");
    const doc = atlas();
    const qualitative: MemoryDocument = {
      ...doc,
      blocks: doc.blocks.map((b) => (b.kind === "signals" ? ({ ...b, payload: { entries: [{ label: "Explainable AI" }, { label: "Latency", value: "fast" }] } } as typeof b) : b)),
    };
    const q = planStory(qualitative).beats.find((b) => b.kind === "numbers");
    expect(q?.kind === "numbers" && q.chart).toBe("words");
  });

  it("links each decision to the work that carries it out, and doesn't repeat that work later", () => {
    const s = planStory(atlas());
    const choices = s.beats.find((b) => b.kind === "choices");
    if (choices?.kind !== "choices") throw new Error("no choices");
    expect(choices.choices.find((c) => c.ref === "D-022")?.work.map((w) => w.task)).toEqual(["Sign the dual-sourcing contract"]);
    const next = s.beats.find((b) => b.kind === "next");
    expect(next?.kind === "next" && next.tasks.map((t) => t.task)).toEqual(["Series B data room v1 to counsel"]);
  });

  it("draws which step needed which, from produces and requires", () => {
    const path = planStory(atlas()).beats.find((b) => b.kind === "path");
    expect(path?.kind === "path" && path.phases.map((p) => p.needs)).toEqual([null, 0, 1, 2]);
    expect(path?.kind === "path" && path.big).toBe("two of four done.");
  });

  it("leads the risks with the high one, and says what happens if it's left alone", () => {
    const p = planStory(atlas()).beats.find((b) => b.kind === "pressure");
    if (p?.kind !== "pressure") throw new Error("no pressure");
    expect(p.risks[0]?.severity).toBe("high");
    expect(p.line).toBe("Actuator lead times are stretching. Left alone, signed EU contracts slip a quarter and the launch window closes.");
  });

  it("skips a beat the document has nothing for, and never puts two neighbours on one field", () => {
    const s = planStory(without(without(atlas(), "signals"), "timeline"));
    expect(s.beats.map((b) => b.kind)).toEqual(["open", "choices", "pressure", "next", "close"]);
    for (let i = 1; i < s.beats.length; i++) expect(s.beats[i]!.field).not.toBe(s.beats[i - 1]!.field);
  });

  it("adds no words the document didn't have, apart from its own framing", () => {
    const doc = atlas();
    const source = JSON.stringify(doc);
    const s = planStory(doc);
    const facts: string[] = [];
    for (const b of s.beats) {
      if (b.kind === "numbers") b.measures.forEach((m) => facts.push(m.label, m.shown, ...(m.implication ? [m.implication] : [])));
      if (b.kind === "path") b.phases.forEach((p) => facts.push(p.title, p.date));
      if (b.kind === "choices") b.choices.forEach((c) => facts.push(c.text, ...c.work.map((w) => w.task)));
      if (b.kind === "pressure") b.risks.forEach((r) => facts.push(r.risk, ...(r.mitigation ? [r.mitigation] : [])));
      if (b.kind === "next") b.tasks.forEach((t) => facts.push(t.task));
    }
    for (const f of facts) expect(source).toContain(f);
  });

  it("plans a story for the Markdown notes too", () => {
    const r = importSource({ raw: ATLAS_NOTES_SOURCE, label: "atlas-launch-notes.md" });
    if (!r.ok) throw new Error("fixture");
    const s = planStory(r.value);
    expect(s.beats[0]?.kind).toBe("open");
    expect(s.beats.at(-1)?.kind).toBe("close");
  });
});

describe("the small rules", () => {
  it("writes counts as words up to twelve", () => {
    expect(count(1, "risk")).toBe("one risk");
    expect(count(3, "choice")).toBe("three choices");
    expect(count(14, "thing")).toBe("14 things");
  });

  it("keeps a line to its first sentence", () => {
    expect(firstSentence("Revenue grew. Then it grew again.")).toBe("Revenue grew.");
  });

  it("gives each item a window that starts after the last one's", () => {
    const a = slot(0, 3, 0, 1), b = slot(1, 3, 0, 1), c = slot(2, 3, 0, 1);
    expect(a[0]).toBe(0);
    expect(b[0]).toBeGreaterThan(a[0]);
    expect(c[1]).toBeCloseTo(1, 10);
  });
});
