/**
 * When (if ever) to ask Docling for a background refinement.
 * Default upload path is always pdf.js — Docling is experimental / research-only.
 */

export function isDocgraphEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DOCGRAPH === "1";
}

export interface DoclingSelectInput {
  fileName: string;
  pages: number;
  /** pdf.js markdown already shown to the user */
  text: string;
  /** Detected archetype after the fast local import, when known */
  archetype?: string | null;
}

/**
 * Selective Docling: only research-like / heavy layout PDFs.
 * Never for Resume / Invoice once those archetypes win the fast path.
 */
export function shouldRefineWithDocling(input: DoclingSelectInput): boolean {
  if (!isDocgraphEnabled()) return false;

  const arch = (input.archetype || "").toLowerCase();
  if (arch === "resume" || arch === "invoice") return false;

  const name = input.fileName.toLowerCase();
  const text = input.text.slice(0, 20_000);
  const pages = input.pages;

  // Long papers
  if (pages > 20) return true;

  // Explicit research cues + substantial length
  const researchCues =
    /\b(abstract|references|bibliography|methodology|experimental\s+setup|related\s+work)\b/i.test(
      text,
    ) || /\b(arxiv|acl|neurips|icml|cvpr)\b/i.test(name);
  if (researchCues && pages >= 8) return true;
  if (arch === "research" && pages >= 6) return true;

  // Table-heavy digital PDFs (markdown pipe rows from pdf.js layout)
  const tableLines = (text.match(/^\s*\|.+\|/gm) || []).length;
  if (tableLines >= 12 && pages >= 4) return true;

  return false;
}

/**
 * Accept a Docling refinement only when it looks like an improvement —
 * never regress Resume/Invoice/PRD-style projections.
 */
export function isDoclingRefinementBetter(input: {
  beforeArchetype?: string | null;
  afterArchetype?: string | null;
  beforeBlockCount: number;
  afterBlockCount: number;
  beforeEvidence: number;
  afterEvidence: number;
  beforeText: string;
  afterText: string;
}): boolean {
  const before = (input.beforeArchetype || "").toLowerCase();
  const after = (input.afterArchetype || "").toLowerCase();

  // Never overwrite a specialized control projection with something else.
  if ((before === "resume" || before === "invoice") && after !== before) return false;
  if (before === "resume" || before === "invoice") return false;

  // Prefer research completeness (Limitations / Future) and richer evidence.
  if (after === "research") {
    if (input.afterBlockCount > input.beforeBlockCount) return true;
    if (input.afterEvidence > input.beforeEvidence) return true;
    // More structured headings often means cleaner Docling markdown.
    const beforeHeads = (input.beforeText.match(/^#{1,3}\s+/gm) || []).length;
    const afterHeads = (input.afterText.match(/^#{1,3}\s+/gm) || []).length;
    if (afterHeads >= beforeHeads + 2 && input.afterText.length > input.beforeText.length * 0.8) {
      return true;
    }
  }

  return false;
}
