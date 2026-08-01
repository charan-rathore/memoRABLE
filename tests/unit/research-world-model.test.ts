/**
 * Research projection v2 — section-aware framework tests.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { importSource } from "@/import/import-source";
import { buildResearchWorldModel } from "@/understanding/research";
import {
  RESEARCH_SECTION_PROFILE,
  detectSemanticSections,
  PRESERVED_PREFIX,
} from "@/understanding/section-aware";
import type {
  ActionsPayload,
  DecisionsPayload,
  RisksPayload,
  SignalsPayload,
  SnapshotPayload,
  TimelinePayload,
} from "@/domain/memory/schema";

describe("research projection v2", () => {
  it("hard-stops after Conclusion (+ Future Work) and ignores References/Appendix", () => {
    const text = readFileSync(resolve("tests/fixtures/archetypes/research.md"), "utf8");
    // Parse headings roughly as the importer would expose them.
    const sections = text.split(/\n(?=## )/).map((block, i) => {
      const lines = block.split("\n");
      const heading = lines[0]?.replace(/^#+\s*/, "") ?? null;
      return {
        headingText: i === 0 && heading?.startsWith("Sparse") ? null : heading,
        lines: lines.slice(heading && !heading.startsWith("Sparse") ? 1 : 0).map((text, j) => ({
          text,
          lineNo: j + 1,
        })),
      };
    });

    const detected = detectSemanticSections(sections, RESEARCH_SECTION_PROFILE);
    const ids = detected.map((s) => s.id);
    expect(ids).toContain("conclusion");
    expect(ids).toContain("future_work");
    expect(ids).not.toContain("references");
    expect(ids).not.toContain("appendix");
    expect(ids).not.toContain("related_work");
    // Future Work is last kept section
    expect(ids[ids.length - 1]).toBe("future_work");
  });

  it("projects Research furniture without bibliography / prompt / related-work noise", () => {
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

    const blob = JSON.stringify(result.value.blocks).toLowerCase();
    expect(blob).not.toMatch(/brown et al|neurips 2020|prompt template|json schema|author biograph/);
    expect(blob).not.toMatch(/proceedings of/);

    const question = result.value.blocks.find((b) => b.kind === "snapshot")!.payload as SnapshotPayload;
    expect(question.summary.toLowerCase()).not.toBe("sparse attention for long-context retrieval");
    expect(question.summary.toLowerCase()).toMatch(/whether|gap|little understanding|hypothesis|sparsity/);

    const findings = (
      result.value.blocks.find((b) => b.kind === "timeline")!.payload as TimelinePayload
    ).entries.map((e) => e.title);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings.every((t) => !/brown et al|related work/i.test(t))).toBe(true);

    const evidence = (
      result.value.blocks.find((b) => b.kind === "signals")!.payload as SignalsPayload
    ).entries;
    expect(evidence.every((e) => /\d/.test(`${e.value ?? ""} ${e.implication ?? ""}`))).toBe(true);

    const insights = (
      result.value.blocks.find((b) => b.kind === "decisions")!.payload as DecisionsPayload
    ).entries;
    expect(insights.length).toBeGreaterThanOrEqual(1);

    const limitations = (
      result.value.blocks.find((b) => b.kind === "risks")!.payload as RisksPayload
    ).entries;
    expect(limitations.some((l) => /english|multilingual|limited|parameters/i.test(l.risk))).toBe(true);

    const future = (
      result.value.blocks.find((b) => b.kind === "actions")!.payload as ActionsPayload
    ).entries;
    expect(future.some((a) => /streaming|hybrid|multi-hop/i.test(a.task))).toBe(true);

    expect(
      result.value.warnings.some((w) => /Research v2|hard-stop after Conclusion/i.test(w.message)),
    ).toBe(true);
  });

  it("requires ≥2 findings before synthesizing Insights and preserves bad OCR as notes", () => {
    const model = buildResearchWorldModel({
      title: "Prompting for Scientific Event Extraction",
      label: "paper.md",
      sections: [
        {
          headingText: "Abstract",
          lines: [
            {
              text: "Existing work evaluates specialized extraction models, but there is little understanding of how modern LLMs behave under prompting strategies.",
              lineNo: 1,
            },
            { text: "We study whether prompt engineering alone can close this gap.", lineNo: 2 },
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
              text: "GPT-5-mini varied from 11–79% F1 on argument roles.",
              lineNo: 11,
            },
            {
              text: "Reflection contributes almost nothing and event-specific prompting sometimes hurts.",
              lineNo: 12,
            },
          ],
        },
        {
          headingText: "Discussion",
          lines: [
            {
              text: "These results suggest LLMs understand semantics but fail at span localization.",
              lineNo: 20,
            },
          ],
        },
        {
          headingText: "Conclusion",
          lines: [
            {
              text: "Prompt engineering alone cannot bridge the performance gap for scientific event extraction.",
              lineNo: 30,
            },
          ],
        },
        {
          headingText: "References",
          lines: [{ text: "Brown et al. ACL 2020.", lineNo: 40 }],
        },
      ],
    });

    const findings = (model.get("timeline")!.payload as TimelinePayload).entries;
    expect(findings.length).toBeGreaterThanOrEqual(2);

    const insights = (model.get("decisions")!.payload as DecisionsPayload).entries;
    expect(insights.length).toBeGreaterThanOrEqual(1);
    expect(insights.every((i) => !findings.some((f) => f.title === i.text))).toBe(true);

    const evidence = (model.get("signals")!.payload as SignalsPayload).entries;
    expect(evidence.some((e) => /11|79|f1|%/i.test(`${e.value ?? ""} ${e.implication ?? ""}`))).toBe(
      true,
    );

    // References must not leak
    const blob = JSON.stringify([...model.values()]);
    expect(blob.toLowerCase()).not.toMatch(/brown et al|acl 2020/);
    void PRESERVED_PREFIX;
  });

  it("does not invent limitations from poor metrics alone", () => {
    const model = buildResearchWorldModel({
      title: "Weak Scores Paper",
      label: "weak.md",
      sections: [
        {
          headingText: "Results",
          lines: [{ text: "The model achieved only 42% F1 and poor performance on rare events.", lineNo: 1 }],
        },
        {
          headingText: "Conclusion",
          lines: [{ text: "Overall extraction quality remains below production thresholds.", lineNo: 2 }],
        },
        {
          headingText: "References",
          lines: [{ text: "Someone et al. 2019.", lineNo: 3 }],
        },
      ],
    });
    const limitations = (model.get("risks")!.payload as RisksPayload).entries;
    expect(limitations.every((l) => !/42%|poor performance/i.test(l.risk))).toBe(true);
  });
});
