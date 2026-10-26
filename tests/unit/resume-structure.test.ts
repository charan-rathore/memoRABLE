import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { importSource } from "@/import/import-source";
import { dehyphenateText, layoutToMarkdown, type LayoutLine } from "@/import/pdf/layout";
import { splitSentences } from "@/understanding/language";
import type { ActionsPayload, DecisionsPayload, RisksPayload, SignalsPayload, TimelinePayload } from "@/domain/memory/schema";

// Synthetic columnar-resume structure (role | org | dates rows, leadership
// section, project tables, wrapped bullet continuation). No real person's data.
function doc() {
  const raw = readFileSync(resolve("tests/fixtures/resume-columnar.md"), "utf8");
  const r = importSource({ raw, label: "resume-columnar.md" });
  if (!r.ok) throw new Error("import failed");
  return r.value;
}
function block<T>(d: ReturnType<typeof doc>, kind: string): T {
  const b = d.blocks.find((x) => x.kind === kind);
  if (!b) throw new Error(`missing ${kind}`);
  return b.payload as T;
}

describe("resume structure: roles stay roles, skills stay skills", () => {
  it("keeps leadership and experience roles in the timeline, not in skills", () => {
    const d = doc();
    const signals = block<SignalsPayload>(d, "signals");
    const sigText = JSON.stringify(signals.entries);
    expect(sigText).not.toMatch(/Team Lead|Teaching Assistant|Senior Product Analyst|Data Intern/);
    const timeline = block<TimelinePayload>(d, "timeline");
    const titles = timeline.entries.map((e) => e.title).join("\n");
    expect(titles).toMatch(/Senior Product Analyst/);
    expect(titles).toMatch(/Team Lead/);
    expect(titles).toMatch(/Teaching Assistant/);
  });

  it("gives each role a clean title instead of the whole flattened line", () => {
    const d = doc();
    const timeline = block<TimelinePayload>(d, "timeline");
    const acme = timeline.entries.find((e) => /Senior Product Analyst/.test(e.title));
    expect(acme).toBeDefined();
    expect(acme!.title).not.toMatch(/January 2024|Present|Client analytics/);
    expect(acme!.title).toMatch(/Acme Analytics/);
  });

  // Slice 3 acceptance at the layer where the defect lives: PDF layout
  // assembly splits a wrapped bullet at the wrap point.
  it("keeps a wrapped achievement bullet whole instead of splitting at the wrap", () => {
    const line = (text: string, over: Partial<LayoutLine> = {}): LayoutLine => ({
      text,
      page: 1,
      y: 0,
      fontSize: 10,
      heading: false,
      headingLevel: null,
      tableRow: false,
      cells: [],
      ...over,
    });
    const md = layoutToMarkdown([
      {
        page: 1,
        bodySize: 10,
        lines: [
          line("Experience", { heading: true, headingLevel: 1, fontSize: 16 }),
          line("Acme Analytics | Senior Product Analyst, Growth January 2024 – Present"),
          line("• Benchmarked 6 models across 4 prompting strategies, improving extraction F1 by 18% through systematic error"),
          line("analysis"),
          line("• Reduced analyst review time by 35% through automated classification"),
        ],
      },
    ]);
    const r = importSource({ raw: md, label: "resume-wrap.pdf" });
    if (!r.ok) throw new Error("import failed");
    const blob = JSON.stringify(r.value.blocks);
    expect(blob).toMatch(/extraction F1 by 18% through systematic error analysis/);
    // The wrap fragment never survives as an orphan note or its own signal.
    expect(blob).not.toMatch(/"analysis"/);
  });

  it("does not stitch new content after a bullet into the item", () => {
    const line = (text: string, over: Partial<LayoutLine> = {}): LayoutLine => ({
      text,
      page: 1,
      y: 0,
      fontSize: 10,
      heading: false,
      headingLevel: null,
      tableRow: false,
      cells: [],
      ...over,
    });
    const md = layoutToMarkdown([
      {
        page: 1,
        bodySize: 10,
        lines: [
          line("• Shipped the forecasting product."),
          line("Awards", { heading: true, headingLevel: 1, fontSize: 16 }),
          line("• Won the national case competition"),
          line("• Built a leaderboard comparing SARIMA, LightGBM, and ensemble models"),
          line("| Forecaster | Live Demo | ML Product May 2024 – Present |", { tableRow: true }),
        ],
      },
    ]);
    // A heading after a bullet stays a heading; a following bullet stays its
    // own item; a table row after a bullet stays a row.
    expect(md).toMatch(/- Shipped the forecasting product\.\n/);
    expect(md).toMatch(/# Awards/);
    expect(md).toMatch(/- Won the national case competition\n- Built a leaderboard/);
    expect(md).toMatch(/Forecaster \| Live Demo/);
  });

  it("keeps the education table row as a dated entry instead of dropping it", () => {
    const d = doc();
    // Resume education rows file under the decisions bucket, which the resume
    // projection displays as the "Education" section.
    const decisions = block<DecisionsPayload>(d, "decisions");
    const text = JSON.stringify(decisions.entries);
    expect(text).toMatch(/BITS Pilani/);
    expect(text).toMatch(/BE Computer Science/);
    expect(text).toMatch(/June 2024/);
    expect(text).toMatch(/CGPA: 9.10\/10/);
    const timeline = block<TimelinePayload>(d, "timeline");
    expect(JSON.stringify(timeline.entries)).not.toMatch(/BE Computer Science/);
    // A degree is a fact, not a floated decision: no status or commitment.
    for (const e of decisions.entries) {
      expect("status" in e).toBe(false);
      expect("commitment" in e).toBe(false);
    }
  });

  it("never turns a product table row into a todo", () => {
    const d = doc();
    // A resume with no real todos has no actions block at all - that is fine.
    const b = d.blocks.find((x) => x.kind === "actions");
    const entries = b ? (b.payload as ActionsPayload).entries : [];
    expect(JSON.stringify(entries)).not.toMatch(/Live Demo/);
    expect(entries.some((e) => e.task === "Forecaster")).toBe(false);
    // A role header is not a todo either (dash shape reads org as owner).
    expect(JSON.stringify(entries)).not.toMatch(/Team Lead|Teaching Assistant|Product Analyst/);
  });

  it("keeps hyphenated compounds whole instead of fusing them", () => {
    // Glyph spacing inside one PDF line splits "AI-led" into "AI- led".
    expect(dehyphenateText("product analytics, and AI- led workflow automation")).toBe(
      "product analytics, and AI-led workflow automation",
    );
    expect(dehyphenateText("domain- specific models")).toBe("domain-specific models");
    // True syllable splits still join bare.
    expect(dehyphenateText("zeo- lite")).toBe("zeolite");
    expect(dehyphenateText("classifica- tion")).toBe("classification");
  });

  it("does not split a role line at the Dept. abbreviation", () => {
    expect(
      splitSentences("Teaching Assistant, Dept. of Mathematics, Some Institute January 2021 – June 2022"),
    ).toHaveLength(1);
    const d = doc();
    const timeline = block<TimelinePayload>(d, "timeline");
    const ta = timeline.entries.find((e) => /Teaching Assistant/.test(e.title));
    expect(ta).toBeDefined();
    expect(ta!.title).toMatch(/Dept\. of Mathematics, Some Institute/);
    expect(ta!.title).not.toMatch(/^of Mathematics/);
  });

  it("files the skills list as skills and achievements as achievements", () => {
    const d = doc();
    const signals = block<SignalsPayload>(d, "signals");
    expect(JSON.stringify(signals)).toMatch(/User Research|Prioritisation/);
    const risks = block<RisksPayload>(d, "risks");
    expect(JSON.stringify(risks.entries)).toMatch(/case competition|merit scholarship/);
  });

  it("invents no narrative relationships between resume memories", () => {
    // The vocabulary-overlap graph read a scholarship as "motivating" a degree
    // and the degree as "mitigating" the scholarship in generated output -
    // nonsense the source never states. A resume earns no inferred relations.
    const d = doc();
    expect(d.relations ?? []).toHaveLength(0);
    const serialized = JSON.parse(JSON.stringify(d));
    expect(serialized.relations ?? []).toHaveLength(0);
  });

  it("omits workflow state from the serialized resume output", () => {
    const d = doc();
    const serialized = JSON.parse(JSON.stringify(d));
    for (const b of serialized.blocks) {
      if (b.kind !== "timeline" && b.kind !== "actions" && b.kind !== "decisions") continue;
      for (const e of b.payload.entries ?? []) {
        expect("state" in e).toBe(false);
        expect("status" in e).toBe(false);
        expect("commitment" in e).toBe(false);
      }
    }
  });
});
