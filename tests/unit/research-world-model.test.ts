/**
 * Research two-stage architecture:
 * Stage 1 classify → Stage 2 gated projection.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { importSource } from "@/import/import-source";
import {
  buildResearchWorldModel,
  buildScientificWorldModel,
  EVIDENCE_MIN_CONFIDENCE,
  FINDING_MIN_CONFIDENCE,
} from "@/understanding/research";
import type {
  ActionsPayload,
  DecisionsPayload,
  RisksPayload,
  SignalsPayload,
  SnapshotPayload,
  TimelinePayload,
} from "@/domain/memory/schema";

const PROMPTING_PAPER = {
  title: "Prompting for Scientific Event Extraction",
  label: "paper.md",
  sections: [
    {
      headingText: "Abstract",
      lines: [
        {
          text: "Existing work evaluates specialized extraction models, but there is little understanding of how modern general-purpose LLMs behave under different prompting strategies for scientific event extraction.",
          lineNo: 2,
        },
        {
          text: "We study whether prompt engineering alone can close this gap.",
          lineNo: 3,
        },
      ],
    },
    {
      headingText: "Related Work",
      lines: [
        { text: "Brown et al. (2020) introduced few-shot prompting for language models.", lineNo: 5 },
        { text: "Proceedings of ACL 2020.", lineNo: 6 },
      ],
    },
    {
      headingText: "Results",
      lines: [
        {
          text: "Few-shot is the only prompting strategy that consistently improves extraction.",
          lineNo: 10,
        },
        {
          text: "GPT-5-mini varied from 11–79% F1. Event classification stayed around 80–90%. Argument extraction stayed below ~70%.",
          lineNo: 11,
        },
        {
          text: "Reflection contributes almost nothing. Event-specific prompting sometimes hurts.",
          lineNo: 12,
        },
      ],
    },
    {
      headingText: "Discussion",
      lines: [
        {
          text: "These results suggest LLMs understand semantics but fail at span localization. Prompt engineering is not the bottleneck.",
          lineNo: 20,
        },
      ],
    },
    {
      headingText: "Limitations",
      lines: [
        {
          text: "Single dataset. Limited prompting strategies. Default model parameters. API cost constraints.",
          lineNo: 30,
        },
      ],
    },
    {
      headingText: "Future work",
      lines: [
        {
          text: "Hybrid symbolic + LLM extraction, domain adaptation, and better grounding methods should be explored.",
          lineNo: 40,
        },
      ],
    },
    {
      headingText: "References",
      lines: [
        { text: "Brown et al. Language Models are Few-Shot Learners. NeurIPS 2020.", lineNo: 50 },
        { text: "Table 3 header.", lineNo: 51 },
      ],
    },
    {
      headingText: "Appendix",
      lines: [{ text: "Prompt template: You are an expert annotator. JSON schema follows.", lineNo: 60 }],
    },
  ],
};

describe("research scientific world model", () => {
  it("Stage 1 classifies and discards refs / appendix / venue noise", () => {
    const model = buildScientificWorldModel(PROMPTING_PAPER.sections);
    expect(model.some((o) => /brown et al|neurips|proceedings|prompt template|json schema/i.test(o.content))).toBe(
      false,
    );
    expect(model.some((o) => o.kind === "research_gap")).toBe(true);
    expect(model.some((o) => o.kind === "hypothesis")).toBe(true);
    expect(model.some((o) => o.kind === "numerical_evidence" && o.confidence > EVIDENCE_MIN_CONFIDENCE)).toBe(true);
    expect(model.some((o) => o.kind === "error_analysis" || /reflection|hurts/i.test(o.content))).toBe(true);
    expect(model.some((o) => o.kind === "limitation")).toBe(true);
    expect(model.some((o) => o.kind === "future_work")).toBe(true);
  });

  it("Stage 2 projects gated memories and never leaks bibliography", () => {
    const projected = buildResearchWorldModel(PROMPTING_PAPER);
    const titles = ["snapshot", "timeline", "signals", "decisions", "risks", "actions"] as const;

    const question = projected.get("snapshot")!.payload as SnapshotPayload;
    expect(question.summary.toLowerCase()).toMatch(/little understanding|whether prompt|gap/);
    expect(question.summary.toLowerCase()).not.toMatch(/brown et al|proceedings|prompt template/);

    const findings = (projected.get("timeline")!.payload as TimelinePayload).entries.map((e) => e.title);
    expect(findings.some((t) => /few-shot|reflection|event-specific|gap|whether prompt/i.test(t))).toBe(true);
    expect(findings.every((t) => !/brown et al|proceedings|table 3|json schema/i.test(t))).toBe(true);
    // Dataset prose / related work must not become findings.
    expect(findings.every((t) => !/introduced few-shot prompting for language models/i.test(t))).toBe(true);

    const evidence = (projected.get("signals")!.payload as SignalsPayload).entries;
    expect(evidence.length).toBeGreaterThanOrEqual(1);
    expect(evidence.every((e) => /\d/.test(`${e.value ?? ""} ${e.implication ?? ""}`))).toBe(true);

    const insights = (projected.get("decisions")!.payload as DecisionsPayload).entries;
    // Insights require ≥2 supports — prompting + localization/error themes should synthesize.
    expect(insights.length).toBeGreaterThanOrEqual(1);
    expect(insights.some((i) => /prompt|localiz|span|few-shot|reflection/i.test(i.text))).toBe(true);

    const limitations = (projected.get("risks")!.payload as RisksPayload).entries;
    expect(limitations.some((l) => /dataset|prompting strategies|parameters|cost/i.test(l.risk))).toBe(true);
    // Poor F1 must not be reinvented as a limitation.
    expect(limitations.every((l) => !/below\s*~?70|11–79|poor f1/i.test(l.risk))).toBe(true);

    const future = (projected.get("actions")!.payload as ActionsPayload).entries;
    expect(future.some((a) => /hybrid|grounding|domain adaptation/i.test(a.task))).toBe(true);

    void titles;
    expect(FINDING_MIN_CONFIDENCE).toBe(0.8);
  });

  it("end-to-end import uses two-stage research path", () => {
    const text = readFileSync(resolve("tests/fixtures/archetypes/research.md"), "utf8");
    const result = importSource({ raw: text, label: "research.md" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.archetype?.id).toBe("research");
    expect(result.value.blocks.map((b) => b.title)).toEqual([
      "Research Question",
      "Key Findings",
      "Evidence",
      "Insights",
      "Limitations",
      "Future Directions",
    ]);

    const blob = result.value.blocks
      .flatMap((b) => {
        const p = b.payload as { summary?: string; entries?: Array<Record<string, string>> };
        if (p.summary) return [p.summary];
        return (p.entries ?? []).flatMap((e) => Object.values(e));
      })
      .join("\n");
    expect(blob.toLowerCase()).not.toMatch(/proceedings of|bibliography|prompt template/);

    expect(
      result.value.warnings.some((w) => /Stage 1 scientific world model/i.test(w.message)),
    ).toBe(true);
  });
});
