import type { MemoryBlock, MemoryDocument } from "@/domain/memory/schema";
import { sha256Hex } from "@/utils/sha256";
import {
  CONTRACT_VERSION,
  locateExactText,
  recoverExactText,
  type Claim,
  type ClaimAuthor,
  type EvidencePackage,
  type EvidenceSpan,
  type SourceVersion,
} from "./contracts";

/**
 * memoRABLE → Evidence Core (evidence-core/1).
 *
 * A brief is a set of claims. Each block becomes one Claim whose evidence is
 * the passage its provenance points at, located again in the exact source
 * text. Provenance excerpts are display copies (collapsed, capped at 240
 * characters), so the span always carries the *source's* characters,
 * never the excerpt's.
 */
export interface BriefEvidenceContext {
  workspaceId: string;
  /** The exact text the brief was built from (after PDF/OCR reading). */
  sourceText: string;
  sourceId?: string;
  parserVersion: string;
  storageUri?: string;
  createdAt: string;
  /** The text came from OCR: every span is weak evidence and must be reviewed. */
  ocr?: { confidence: number; unreadablePages?: number[] };
}

const STRUCTURED = new Set(["deterministic-json", "verified-example"]);

function authorOf(block: MemoryBlock): ClaimAuthor {
  switch (block.provenance.method) {
    case "ai":
      return "model";
    case "recovered":
      return "source";
    default:
      return "parser";
  }
}

function jsonPathOf(locator: string): string | null {
  const m = /^blocks\[(\d+)\]/.exec(locator);
  return m ? `$.blocks[${m[1]}]` : null;
}

export function sourceVersionFor(ctx: BriefEvidenceContext): SourceVersion {
  const contentHash = sha256Hex(ctx.sourceText);
  return {
    id: `sv_${contentHash.slice(0, 16)}`,
    workspaceId: ctx.workspaceId,
    sourceId: ctx.sourceId ?? `src_${contentHash.slice(0, 16)}`,
    contentHash,
    parserVersion: ctx.parserVersion,
    storageUri: ctx.storageUri ?? "inline:",
    createdAt: ctx.createdAt,
    ...(ctx.ocr?.unreadablePages?.length
      ? { unreadable: ctx.ocr.unreadablePages.map((page) => ({ page, reason: "no readable text" })) }
      : {}),
  };
}

/**
 * Provenance excerpts join a section's first content lines with spaces and
 * skip sub-headings between them, so the whole excerpt is not always one
 * contiguous passage. Fall back to the longest leading run of its words that
 * is (at least MIN_WORDS long or the whole excerpt). The span stays verbatim;
 * it just quotes less.
 */
const MIN_WORDS = 4;
export function recoverLeadingPassage(body: string, excerpt: string): string | null {
  const whole = recoverExactText(body, excerpt);
  if (whole) return whole;
  const words = excerpt.replace(/…$/u, "").trim().split(/\s+/).filter(Boolean);
  for (let n = words.length - 1; n >= Math.min(MIN_WORDS, words.length); n--) {
    const found = recoverExactText(body, words.slice(0, n).join(" "));
    if (found) return found;
  }
  return null;
}

function spanFor(block: MemoryBlock, version: SourceVersion, ctx: BriefEvidenceContext): EvidenceSpan | null {
  const { excerpt, locator, method } = block.provenance;
  if (!excerpt.trim() || locator === "not found in source") return null;

  if (STRUCTURED.has(method)) {
    const path = jsonPathOf(locator);
    if (!path) return null;
    return {
      id: `span_${block.id}`,
      sourceVersionId: version.id,
      locator: { kind: "json-path", path },
      exactText: excerpt,
      extractionMethod: "structured",
      confidence: 1,
    };
  }

  // Parser line numbers count lines of its segmented rewrite, not the user's
  // file, so the span is located again in the exact source text.
  const exact = recoverLeadingPassage(ctx.sourceText, excerpt);
  if (!exact) return null;
  const found = locateExactText(ctx.sourceText, exact);
  if (!found) return null;
  return {
    id: `span_${block.id}`,
    sourceVersionId: version.id,
    locator: found.lines,
    exactText: exact,
    extractionMethod: ctx.ocr ? "ocr" : method === "ai" ? "model" : "text",
    confidence: ctx.ocr ? Math.max(0, Math.min(1, ctx.ocr.confidence)) : 1,
  };
}

/** A brief as an evidence package. Claim status follows the evidence actually found. */
export function briefToEvidencePackage(doc: MemoryDocument, ctx: BriefEvidenceContext): EvidencePackage {
  const version = sourceVersionFor(ctx);
  const spans: EvidenceSpan[] = [];
  const claims: Claim[] = doc.blocks.map((block) => {
    const span = spanFor(block, version, ctx);
    if (span) spans.push(span);
    const authoredBy = authorOf(block);
    const status: Claim["status"] = !span
      ? "unsupported"
      : span.extractionMethod === "ocr" || span.confidence < 0.8
        ? "needs_review"
        : authoredBy === "model"
          ? "inferred"
          : "supported";
    return {
      id: `claim_${block.id}`,
      workspaceId: ctx.workspaceId,
      sourceVersionId: version.id,
      evidenceSpanIds: span ? [span.id] : [],
      type: block.kind,
      text: block.title,
      status,
      authoredBy,
    };
  });
  return {
    contractVersion: CONTRACT_VERSION,
    workspaceId: ctx.workspaceId,
    sourceVersions: [version],
    spans,
    claims,
    answers: [],
  };
}

/** Claims a reader should look at before trusting the brief, in source order. */
export function claimsNeedingJudgment(pkg: EvidencePackage): Claim[] {
  return pkg.claims.filter((c) => c.status !== "supported");
}
