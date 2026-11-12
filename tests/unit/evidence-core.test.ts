import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseText } from "@/import/text/parse-text";
import { sha256Hex } from "@/utils/sha256";
import {
  CONTRACT_VERSION,
  answerCacheKey,
  validateEvidencePackage,
  type EvidencePackage,
} from "@/evidence-core/contracts";
import { briefToEvidencePackage, claimsNeedingJudgment } from "@/evidence-core/memorable-adapter";

const root = path.join(__dirname, "../..");
const fixture = JSON.parse(readFileSync(path.join(root, "tests/fixtures/evidence-package.fixture.json"), "utf8"));
const shared = fixture.package as EvidencePackage;
const SPEC = readFileSync(path.join(root, "tests/fixtures/engineering-spec.md"), "utf8");

function build(text = SPEC, ocr?: { confidence: number; unreadablePages?: number[] }) {
  const result = parseText({ text, label: "engineering-spec.md" });
  if (!result.ok) throw new Error("parse failed");
  return briefToEvidencePackage(result.value, {
    workspaceId: "ws_local",
    sourceText: text,
    parserVersion: "memorable-local@test",
    createdAt: "2026-11-12T00:00:00.000Z",
    ...(ocr ? { ocr } : {}),
  });
}

describe("evidence-core/1 contract (shared with IntelliRAG)", () => {
  it("is byte-identical to IntelliRAG's copy", () => {
    const text = readFileSync(path.join(root, "src/evidence-core/contracts.ts"), "utf8").replace(/\r\n/g, "\n");
    expect(sha256Hex(text), "copy contracts.ts from IntelliRAG web/src/lib/evidence-core/ and its fixture").toBe(
      fixture.contractSha256,
    );
  });

  it("accepts the shared fixture, where a brief claim and an answer cite one span", () => {
    expect(shared.contractVersion).toBe(CONTRACT_VERSION);
    expect(validateEvidencePackage(shared)).toEqual([]);
    const brief = shared.claims.find((c) => c.id === "claim_brief_concurrency")!;
    expect(shared.answers[0]!.citations).toEqual(brief.evidenceSpanIds);
    expect(shared.answers[0]!.cacheKey).toBe(answerCacheKey(shared.answers[0]!));
  });
});

describe("a memoRABLE brief as evidence", () => {
  const pkg = build();

  it("validates against the shared invariants", () => {
    expect(validateEvidencePackage(pkg)).toEqual([]);
  });

  it("gives every supported claim a span carrying the source's own characters", () => {
    const spans = new Map(pkg.spans.map((s) => [s.id, s]));
    const supported = pkg.claims.filter((c) => c.status === "supported");
    expect(supported.length).toBeGreaterThan(0);
    for (const claim of supported) {
      const span = spans.get(claim.evidenceSpanIds[0]!)!;
      expect(SPEC.replace(/\r\n?/g, "\n")).toContain(span.exactText);
      expect(span.locator.kind).toBe("lines");
    }
  });

  it("locates evidence in the user's file, not in the parser's rewritten line numbering", () => {
    const actions = pkg.claims.find((c) => c.type === "actions")!;
    expect(actions.status).toBe("supported");
    const span = pkg.spans.find((s) => s.id === actions.evidenceSpanIds[0])!;
    const lines = SPEC.split("\n");
    expect(span.locator).toMatchObject({ kind: "lines" });
    const { start } = span.locator as { start: number };
    expect(lines[start - 1]).toBe("Implement ONLY ONE TASK at a time.");
  });

  it("binds the brief to one immutable source version", () => {
    expect(pkg.sourceVersions).toHaveLength(1);
    expect(pkg.sourceVersions[0]!.contentHash).toBe(sha256Hex(SPEC));
    expect(new Set(pkg.claims.map((c) => c.sourceVersionId))).toEqual(new Set([pkg.sourceVersions[0]!.id]));
  });

  it("never renders OCR-read claims as plain fact", () => {
    const scanned = build(SPEC, { confidence: 0.72, unreadablePages: [3] });
    expect(validateEvidencePackage(scanned)).toEqual([]);
    expect(scanned.claims.some((c) => c.status === "supported")).toBe(false);
    expect(claimsNeedingJudgment(scanned).length).toBe(scanned.claims.length);
    expect(scanned.sourceVersions[0]!.unreadable).toEqual([{ page: 3, reason: "no readable text" }]);
  });

  it("marks a claim unsupported when its excerpt is not in the source it claims", () => {
    const result = parseText({ text: SPEC, label: "engineering-spec.md" });
    if (!result.ok) throw new Error("parse failed");
    const tampered = {
      ...result.value,
      blocks: result.value.blocks.map((b, i) =>
        i === 0 ? { ...b, provenance: { ...b.provenance, excerpt: "A sentence the author never wrote." } } : b,
      ),
    };
    const p = briefToEvidencePackage(tampered, {
      workspaceId: "ws_local",
      sourceText: SPEC,
      parserVersion: "memorable-local@test",
      createdAt: "2026-11-12T00:00:00.000Z",
    });
    expect(p.claims[0]!.status).toBe("unsupported");
    expect(p.claims[0]!.evidenceSpanIds).toEqual([]);
    expect(validateEvidencePackage(p)).toEqual([]);
  });
});
