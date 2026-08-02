/**
 * Graphify-inspired knowledge graph for research papers.
 *
 * Mirrors Graphify-Labs/graphify extraction schema:
 *   nodes[{ id, label, source_file, source_location }]
 *   edges[{ source, target, relation, confidence: EXTRACTED|INFERRED|AMBIGUOUS }]
 *
 * Built deterministically in TypeScript so research projection stays robust
 * even when the Python Docling/Graphify sidecar is offline. Sidecar graphs
 * are merged on top when available.
 */

import { sha256Hex } from "@/utils/sha256";
import type {
  KnowledgeGraph,
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
} from "@/import/docgraph/types";
import type { ResearchSectionInput, ResearchSectionRole } from "./research";
import { plainContentOf, splitListItem } from "@/import/text/patterns";
import { splitSentences, wordCount } from "./language";

const ROLE_PATTERNS: Array<{ role: ResearchSectionRole; pattern: RegExp }> = [
  { role: "abstract", pattern: /\babstract\b/i },
  { role: "introduction", pattern: /\b(introduction|background|related\s+work)\b/i },
  { role: "hypothesis", pattern: /\b(hypothesis|research\s+questions?|problem\s+statement)\b/i },
  { role: "method", pattern: /\b(method(?:ology)?|methods|experimental\s+setup|experiments?)\b/i },
  { role: "results", pattern: /\b(results?|findings?|evaluation)\b/i },
  { role: "discussion", pattern: /\bdiscussion\b/i },
  { role: "conclusion", pattern: /\bconclusions?\b/i },
  { role: "limitations", pattern: /\blimitations?\b/i },
  { role: "future", pattern: /\b(future\s+work|further\s+work|future\s+(?:research|directions?))\b/i },
  { role: "references", pattern: /\breferences?\b/i },
];

const METRIC_RE =
  /\b(?:\d+(?:\.\d+)?%|\d+(?:\.\d+)?\s*(?:points?|pts?|ms|s|×|x|f1|accuracy|recall|precision)|(?:f1|accuracy|recall|precision)\s*(?:of|=|:)?\s*\d)/i;
const LIMIT_RE =
  /\b(limited\s+to|only\s+(?:evaluated|tested|studied)|untested|single\s+dataset|we\s+(?:did|do)\s+not|cost\s+constraints?)\b/i;
const FUTURE_RE =
  /\b(future\s+work|further\s+work|should\s+(?:evaluate|explore|investigate)|we\s+(?:plan|aim|hope)\s+to|next\s+steps?)\b/i;
const GAP_RE =
  /\b(little\s+(?:is\s+)?known|gap|however|despite|remains?\s+(?:unclear|open)|not\s+(?:well\s+)?understood|under[\s-]?explored)\b/i;
const CITATION_RE =
  /\[(\d{1,3}(?:\s*[,–-]\s*\d{1,3})*)\]|\((?:[A-Z][a-z]+(?:\s+et\s+al\.)?,?\s*)+\d{4}[a-z]?\)/g;

function nid(kind: string, label: string): string {
  return `${kind}_${sha256Hex(`${kind}:${label.toLowerCase()}`).slice(0, 12)}`;
}

function roleOf(heading: string | null): ResearchSectionRole {
  if (!heading) return "other";
  for (const { role, pattern } of ROLE_PATTERNS) {
    if (pattern.test(heading)) return role;
  }
  return "other";
}

function sentencesOf(section: ResearchSectionInput): string[] {
  const out: string[] = [];
  for (const line of section.lines) {
    const raw = plainContentOf(line.text).trim();
    if (!raw) continue;
    const list = splitListItem(raw);
    const body = list?.text ?? raw;
    for (const sentence of splitSentences(body)) {
      const s = sentence.replace(/\s+/g, " ").trim();
      if (wordCount(s) < 4) continue;
      out.push(s);
    }
  }
  return out;
}

function degreeAnalysis(
  nodes: KnowledgeGraphNode[],
  edges: KnowledgeGraphEdge[],
): KnowledgeGraph["analysis"] {
  const degree = new Map<string, number>();
  const labels = new Map(nodes.map((n) => [n.id, n.label]));
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }
  const god = [...degree.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id, d]) => ({ id, label: labels.get(id) ?? id, degree: d }));
  return {
    god_nodes: god,
    surprising_connections: edges
      .filter((e) => e.confidence === "INFERRED")
      .slice(0, 12)
      .map((e) => ({
        source: e.source,
        target: e.target,
        relation: e.relation,
        confidence: e.confidence,
      })),
    suggested_questions: [
      "Which metrics most strongly support the key findings?",
      "What limitations qualify the strongest claims?",
      "Which research gap do the results actually close?",
    ],
  };
}

/** Build a Graphify-schema paper graph from research sections. */
export function buildResearchKnowledgeGraph(input: {
  title: string;
  label: string;
  sections: readonly ResearchSectionInput[];
}): KnowledgeGraph {
  const nodes: KnowledgeGraphNode[] = [];
  const edges: KnowledgeGraphEdge[] = [];
  const nodeIds = new Set<string>();
  /** Merge duplicate entities that share kind + normalized label. */
  const byEntityKey = new Map<string, string>();

  const entityKey = (kind: string | undefined, label: string) =>
    `${kind || "node"}::${label.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 120)}`;

  const addNode = (node: KnowledgeGraphNode): string => {
    const key = entityKey(node.kind, node.label);
    const existing = byEntityKey.get(key);
    if (existing) return existing;
    if (nodeIds.has(node.id)) {
      byEntityKey.set(key, node.id);
      return node.id;
    }
    nodeIds.add(node.id);
    byEntityKey.set(key, node.id);
    nodes.push(node);
    return node.id;
  };
  const addEdge = (edge: KnowledgeGraphEdge) => {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return;
    if (edges.some((e) => e.source === edge.source && e.target === edge.target && e.relation === edge.relation)) {
      return;
    }
    edges.push(edge);
  };

  const paperId = addNode({
    id: nid("paper", input.title),
    label: input.title,
    kind: "paper",
    source_file: input.label,
    source_location: "title",
  });

  const claimPool: Array<{ id: string; role: ResearchSectionRole; kind: string }> = [];

  for (const section of input.sections) {
    const role = roleOf(section.headingText);
    if (role === "references") continue;
    const hasBody = section.lines.some((l) => l.text.trim());
    if (!section.headingText && !hasBody) continue;

    const label = section.headingText ?? role;
    const first = section.lines[0]?.lineNo;
    const loc = first != null ? `L${first}` : role;
    const sid = addNode({
      id: nid("section", `${role}:${label}`),
      label,
      kind: "section",
      role,
      source_file: input.label,
      source_location: loc,
    });
    addEdge({ source: paperId, target: sid, relation: "contains", confidence: "EXTRACTED" });

    for (const sentence of sentencesOf(section).slice(0, 24)) {
      // Skip markdown tables / scoreboard rows — they become metric noise.
      if (sentence.includes("|") || (/^\s*[\w.-]+\s+(\d+(\.\d+)?\s+){3,}/.test(sentence) && wordCount(sentence) < 20)) {
        continue;
      }
      let kind = "claim";
      let relation = "states";
      if (METRIC_RE.test(sentence)) {
        kind = "metric";
        relation = "reports";
      } else if (role === "limitations" || LIMIT_RE.test(sentence)) {
        kind = "limitation";
        relation = "bounds";
      } else if (role === "future" || FUTURE_RE.test(sentence)) {
        kind = "future_work";
        relation = "proposes";
      } else if (
        (role === "abstract" || role === "introduction" || role === "hypothesis") &&
        GAP_RE.test(sentence)
      ) {
        kind = "research_gap";
        relation = "motivates";
      }

      const cid = addNode({
        id: nid(kind, sentence.slice(0, 160)),
        label: sentence.slice(0, 160),
        kind,
        source_file: input.label,
        source_location: loc,
      });
      addEdge({ source: sid, target: cid, relation, confidence: "EXTRACTED" });
      claimPool.push({ id: cid, role, kind });

      const cites = [...sentence.matchAll(CITATION_RE)].slice(0, 3);
      for (const m of cites) {
        const citeLabel = m[1] ?? m[0]!;
        const rid = addNode({
          id: nid("citation", citeLabel),
          label: `cite:${citeLabel}`.slice(0, 120),
          kind: "citation",
          source_file: input.label,
          source_location: loc,
        });
        addEdge({ source: cid, target: rid, relation: "cites", confidence: "EXTRACTED" });
      }
    }
  }

  const gaps = claimPool.filter((c) => c.kind === "research_gap");
  const qualitativeFindings = claimPool.filter(
    (c) => (c.role === "results" || c.role === "conclusion") && c.kind !== "metric",
  );
  const resultClaims = claimPool.filter((c) => c.role === "results" || c.role === "conclusion");
  // Metric-only results sections still need cross-section edges.
  const findings = qualitativeFindings.length > 0 ? qualitativeFindings : resultClaims;
  const metrics = claimPool.filter((c) => c.kind === "metric");
  const limitations = claimPool.filter((c) => c.kind === "limitation");

  for (const gap of gaps.slice(0, 3)) {
    for (const finding of findings.slice(0, 4)) {
      addEdge({
        source: gap.id,
        target: finding.id,
        relation: "addressed_by",
        confidence: "INFERRED",
      });
    }
  }
  for (const metric of metrics.slice(0, 6)) {
    for (const finding of findings.slice(0, 4)) {
      if (metric.id === finding.id) continue;
      addEdge({
        source: metric.id,
        target: finding.id,
        relation: "supports",
        confidence: "INFERRED",
      });
    }
    // When the metric *is* the finding, still qualify it from limitations / gaps.
    if (findings.every((f) => f.id === metric.id) || qualitativeFindings.length === 0) {
      for (const gap of gaps.slice(0, 2)) {
        addEdge({
          source: gap.id,
          target: metric.id,
          relation: "addressed_by",
          confidence: "INFERRED",
        });
      }
    }
  }
  for (const lim of limitations.slice(0, 4)) {
    for (const finding of findings.slice(0, 3)) {
      addEdge({
        source: lim.id,
        target: finding.id,
        relation: "qualifies",
        confidence: "INFERRED",
      });
    }
  }

  return {
    nodes,
    edges,
    schema: "graphify-v1",
    extractor: "memorable-ts-graphify",
    analysis: degreeAnalysis(nodes, edges),
  };
}

/** Prefer sidecar nodes/edges; fill gaps from the local Graphify-style graph. */
export function mergeKnowledgeGraphs(
  primary: KnowledgeGraph | undefined,
  fallback: KnowledgeGraph,
): KnowledgeGraph {
  if (!primary || primary.nodes.length === 0) return dedupeGraphEntities(fallback);
  const nodes = new Map<string, KnowledgeGraphNode>();
  for (const n of fallback.nodes) nodes.set(n.id, n);
  for (const n of primary.nodes) nodes.set(n.id, n);
  const edgeKey = (e: KnowledgeGraphEdge) => `${e.source}|${e.target}|${e.relation}`;
  const edges = new Map<string, KnowledgeGraphEdge>();
  for (const e of fallback.edges) edges.set(edgeKey(e), e);
  for (const e of primary.edges) edges.set(edgeKey(e), e);
  const merged = dedupeGraphEntities({
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    schema: "graphify-v1",
    extractor: primary.extractor.includes("graphify")
      ? primary.extractor
      : `${primary.extractor}+${fallback.extractor}`,
    analysis: primary.analysis,
    ...(primary.graphify_status ? { graphify_status: primary.graphify_status } : {}),
  });
  return {
    ...merged,
    analysis: merged.analysis ?? degreeAnalysis(merged.nodes, merged.edges),
  };
}

/** Collapse duplicate kind+label entities and rewrite edges onto survivors. */
function dedupeGraphEntities(graph: KnowledgeGraph): KnowledgeGraph {
  const idMap = new Map<string, string>();
  const survivors = new Map<string, KnowledgeGraphNode>();
  for (const node of graph.nodes) {
    const key = `${node.kind || "node"}::${(node.label || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 120)}`;
    const existing = survivors.get(key);
    if (existing) {
      idMap.set(node.id, existing.id);
      continue;
    }
    survivors.set(key, node);
    idMap.set(node.id, node.id);
  }
  const nodes = [...survivors.values()];
  const alive = new Set(nodes.map((n) => n.id));
  const edges: KnowledgeGraphEdge[] = [];
  const seen = new Set<string>();
  for (const e of graph.edges) {
    const source = idMap.get(e.source) ?? e.source;
    const target = idMap.get(e.target) ?? e.target;
    if (!alive.has(source) || !alive.has(target) || source === target) continue;
    const key = `${source}|${target}|${e.relation}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ ...e, source, target });
  }
  return {
    ...graph,
    nodes,
    edges,
    analysis: degreeAnalysis(nodes, edges),
  };
}
