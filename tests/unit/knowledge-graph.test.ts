import { describe, expect, it } from "vitest";
import { importSource } from "@/import/import-source";
import {
  buildResearchKnowledgeGraph,
  mergeKnowledgeGraphs,
} from "@/understanding/knowledge-graph";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const fixture = readFileSync(
  resolve(__dirname, "../fixtures/archetypes/research.md"),
  "utf8",
);

describe("Graphify-schema research knowledge graph", () => {
  it("builds EXTRACTED section/claim edges and INFERRED cross-links", () => {
    const sections = [
      {
        headingText: "Abstract",
        lines: [
          {
            text: "Little is known about sparse retrieval under latency budgets.",
            lineNo: 2,
          },
          {
            text: "We study whether sparse models preserve recall within 2 points of dense baselines.",
            lineNo: 3,
          },
        ],
      },
      {
        headingText: "Results",
        lines: [
          {
            text: "Sparse retrieval reaches 91% recall while cutting latency by 40%.",
            lineNo: 10,
          },
        ],
      },
      {
        headingText: "Limitations",
        lines: [
          {
            text: "We did not evaluate multilingual corpora or single dataset drift.",
            lineNo: 20,
          },
        ],
      },
    ];

    const graph = buildResearchKnowledgeGraph({
      title: "Sparse Retrieval Tradeoffs",
      label: "paper.md",
      sections,
    });

    expect(graph.schema).toBe("graphify-v1");
    expect(graph.nodes.some((n) => n.kind === "paper")).toBe(true);
    expect(graph.nodes.some((n) => n.kind === "section")).toBe(true);
    expect(graph.edges.some((e) => e.confidence === "EXTRACTED")).toBe(true);
    expect(graph.edges.some((e) => e.confidence === "INFERRED")).toBe(true);
    expect(graph.analysis?.god_nodes?.length).toBeGreaterThan(0);
  });

  it("attaches a knowledge graph on research import", () => {
    const result = importSource({ raw: fixture, label: "research.md" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.archetype?.id).toBe("research");
    expect(result.value.knowledgeGraph).toBeDefined();
    expect(result.value.knowledgeGraph!.nodes.length).toBeGreaterThan(3);
    expect(result.value.knowledgeGraph!.edges.length).toBeGreaterThan(2);
  });

  it("merges sidecar Graphify graphs over the local fallback", () => {
    const local = buildResearchKnowledgeGraph({
      title: "Local",
      label: "local.md",
      sections: [
        {
          headingText: "Abstract",
          lines: [{ text: "However a gap remains in prior work on grounding.", lineNo: 1 }],
        },
      ],
    });
    const sidecar = {
      ...local,
      extractor: "docgraph+graphify",
      nodes: [
        ...local.nodes,
        {
          id: "extra_node",
          label: "Sidecar-only concept",
          kind: "claim",
          source_file: "paper.pdf",
          source_location: "L9",
        },
      ],
    };
    const merged = mergeKnowledgeGraphs(sidecar, local);
    expect(merged.extractor).toContain("graphify");
    expect(merged.nodes.some((n) => n.id === "extra_node")).toBe(true);
  });
});
