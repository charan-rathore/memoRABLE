/**
 * Research papers: section summaries → cross-section world model → projection.
 * Colleague test: can someone explain the paper without opening the PDF?
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { importSource } from "@/import/import-source";
import { buildResearchWorldModel } from "@/understanding/research";
import type {
  ActionsPayload,
  DecisionsPayload,
  RisksPayload,
  SignalsPayload,
  SnapshotPayload,
  TimelinePayload,
} from "@/domain/memory/schema";

describe("research world model", () => {
  it("projects Research Question / Key Findings / Evidence / Insights / Limitations / Future Directions", () => {
    const text = readFileSync(resolve("tests/fixtures/archetypes/research.md"), "utf8");
    const result = importSource({ raw: text, label: "research.md" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.archetype?.id).toBe("research");
    const titles = result.value.blocks.map((b) => b.title);
    expect(titles).toEqual([
      "Research Question",
      "Key Findings",
      "Evidence",
      "Insights",
      "Limitations",
      "Future Directions",
    ]);

    const byKind = Object.fromEntries(result.value.blocks.map((b) => [b.kind, b.payload]));
    const question = byKind.snapshot as SnapshotPayload;
    expect(question.summary.toLowerCase()).not.toMatch(/^this paper evaluates/);
    expect(question.summary.toLowerCase()).toMatch(/whether|sparse|gap|little understanding|hypothesis/);

    const findings = byKind.timeline as TimelinePayload;
    expect(findings.entries.length).toBeGreaterThanOrEqual(1);
    const findingBlob = findings.entries.map((e) => e.title).join(" ");
    // Findings are synthesized claims — not a bare metric dump.
    expect(findingBlob.toLowerCase()).toMatch(/recall|inference|quality|sparse|local-window/);

    const evidence = byKind.signals as SignalsPayload;
    expect(evidence.entries.some((e) => String(e.value ?? "").includes("%") || String(e.value ?? "").includes("point"))).toBe(
      true,
    );

    const insights = byKind.decisions as DecisionsPayload;
    expect(insights.entries.length).toBeGreaterThanOrEqual(1);
    expect(insights.entries.some((e) => /bottleneck|quality|compute|sparsity|efficiency/i.test(e.text))).toBe(
      true,
    );

    const limitations = byKind.risks as RisksPayload;
    expect(limitations.entries.some((e) => /english|multilingual|limited/i.test(e.risk))).toBe(true);
    expect(limitations.entries.every((e) => !/hallucin/i.test(e.risk))).toBe(true);

    const future = byKind.actions as ActionsPayload;
    expect(future.entries.some((e) => /streaming|multi-hop|hybrid|symbolic/i.test(e.task))).toBe(true);

    expect(
      result.value.warnings.some((w) => /section summaries → cross-section/i.test(w.message)),
    ).toBe(true);
  });

  it("keeps metrics in Evidence and qualitative claims in Key Findings", () => {
    const model = buildResearchWorldModel({
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
          headingText: "Results",
          lines: [
            {
              text: "Few-shot is the only prompting strategy that consistently improves extraction. GPT-5-mini varied from 11–79% F1. Event classification stayed around 80–90%. Argument extraction stayed below ~70%.",
              lineNo: 10,
            },
            {
              text: "Reflection contributes almost nothing. Event-specific prompting sometimes hurts.",
              lineNo: 11,
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
            { text: "Single dataset. Limited prompting strategies. Default model parameters. API cost constraints.", lineNo: 30 },
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
      ],
    });

    const question = model.get("snapshot")!.payload as SnapshotPayload;
    expect(question.summary.toLowerCase()).toMatch(/little understanding|whether prompt|gap/);
    expect(question.summary.toLowerCase()).not.toMatch(/^this paper/);

    const findings = (model.get("timeline")!.payload as TimelinePayload).entries.map((e) => e.title);
    expect(findings.some((t) => /few-shot|reflection|event-specific|prompt engineering/i.test(t))).toBe(true);

    const evidence = (model.get("signals")!.payload as SignalsPayload).entries;
    expect(evidence.some((e) => /%|f1|70|80|90|11/i.test(`${e.value ?? ""} ${e.implication ?? ""}`))).toBe(true);

    const insights = (model.get("decisions")!.payload as DecisionsPayload).entries.map((e) => e.text);
    expect(insights.some((t) => /localiz|semantics|bottleneck|grounding/i.test(t))).toBe(true);
  });
});
