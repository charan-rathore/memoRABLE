/**
 * Shared DocGraph / Graphify schema types.
 * Confidence labels match Graphify-Labs/graphify.
 */

export const GRAPH_CONFIDENCE = ["EXTRACTED", "INFERRED", "AMBIGUOUS"] as const;
export type GraphConfidence = (typeof GRAPH_CONFIDENCE)[number];

export interface KnowledgeGraphNode {
  id: string;
  label: string;
  kind?: string;
  role?: string;
  source_file?: string;
  source_location?: string;
  community?: number | string;
}

export interface KnowledgeGraphEdge {
  source: string;
  target: string;
  relation: string;
  confidence: GraphConfidence;
}

export interface KnowledgeGraphAnalysis {
  god_nodes?: Array<{ id: string; label: string; degree?: number }>;
  surprising_connections?: Array<{
    source: string;
    target: string;
    relation: string;
    confidence?: GraphConfidence;
  }>;
  suggested_questions?: string[];
}

export interface KnowledgeGraph {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  schema: "graphify-v1";
  extractor: string;
  analysis?: KnowledgeGraphAnalysis;
  graphify_status?: string;
}

export interface DocGraphSection {
  heading: string | null;
  level?: number;
  text: string;
  startLine?: number;
  endLine?: number;
  lines?: Array<{ text: string; lineNo: number }>;
}

export interface DocGraphParseResult {
  ok: true;
  engine: string;
  title: string;
  markdown: string;
  pages?: number | null;
  sections?: DocGraphSection[];
  /** Present only when parse was called with graph=1 (not the default). */
  knowledgeGraph?: KnowledgeGraph;
  cache?: "hit" | "miss";
  cache_key?: string;
  parse_ms?: number;
  ocr?: boolean;
}

export interface DocGraphHealth {
  ok: boolean;
  service?: string;
  docling?: boolean;
  graphify?: boolean;
  available?: boolean;
  reason?: string;
}
