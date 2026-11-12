"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { MemoryDocument } from "@/domain/memory/schema";
import { briefToEvidencePackage, claimsNeedingJudgment } from "@/evidence-core/memorable-adapter";
import type { SourceMeta } from "../journey-strip";

/**
 * The receipt is the first thing a reader sees after import: what was read,
 * what came out, and how much of it they should check, counted from the
 * evidence contract rather than asserted by copy.
 */
export interface ReceiptCounts {
  pages: number | null;
  ocr: boolean;
  blocks: number;
  supported: number;
  judgment: number;
  unsupported: number;
  firstToReview: string | null;
}

export function receiptFor(document: MemoryDocument, sourceText: string, meta: SourceMeta | null): ReceiptCounts {
  const ocr = /\bOCR\b/i.test(meta?.parseStatus ?? "") || /\bOCR\b/i.test(meta?.readNote ?? "");
  const pkg = briefToEvidencePackage(document, {
    workspaceId: "local",
    sourceText,
    parserVersion: `memorable-${document.sourceMethod}`,
    createdAt: "local",
    ...(ocr ? { ocr: { confidence: 0.7 } } : {}),
  });
  const needing = claimsNeedingJudgment(pkg);
  const unsupported = needing.filter((c) => c.status === "unsupported").length;
  const first = needing[0]?.id.replace(/^claim_/, "") ?? null;
  return {
    pages: meta?.pages ?? null,
    ocr,
    blocks: pkg.claims.length,
    supported: pkg.claims.length - needing.length,
    judgment: needing.length - unsupported,
    unsupported,
    firstToReview: first,
  };
}

/** Count up once on arrival; settle instantly when motion is reduced. */
/** CSS custom properties for the stagger; React has no type for them. */
const vars = (v: Record<string, number>) => v as unknown as CSSProperties;

function useCountUp(target: number, reduced: boolean, delay: number) {
  const [value, setValue] = useState(reduced ? target : 0);
  const frame = useRef(0);
  useEffect(() => {
    if (reduced) {
      setValue(target);
      return;
    }
    const duration = 520 + Math.min(target, 40) * 6;
    let start = 0;
    const tick = (now: number) => {
      if (!start) start = now + delay;
      const t = Math.min(1, Math.max(0, (now - start) / duration));
      // easeOutQuart: fast arrival, long settle, matching --ease-enter.
      setValue(Math.round(target * (1 - Math.pow(1 - t, 4))));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target, reduced, delay]);
  return value;
}

function Fact({ n, label, tone, i, reduced }: { n: number; label: string; tone?: "warn" | "muted"; i: number; reduced: boolean }) {
  const shown = useCountUp(n, reduced, 80 + i * 70);
  return (
    <div className={`receipt-fact${tone ? ` ${tone}` : ""}`} style={vars({ "--i": i })}>
      <span className="receipt-n" aria-hidden="true">
        {shown}
      </span>
      <span className="receipt-l" aria-hidden="true">
        {label}
      </span>
    </div>
  );
}

export function BriefReceipt({
  document,
  sourceText,
  meta,
  reducedMotion,
  onReview,
}: {
  document: MemoryDocument;
  sourceText: string;
  meta: SourceMeta | null;
  reducedMotion: boolean;
  onReview: (blockId: string) => void;
}) {
  const r = useMemo(() => receiptFor(document, sourceText, meta), [document, sourceText, meta]);
  const toReview = r.judgment + r.unsupported;
  const first = r.firstToReview;
  const sentence = [
    r.pages ? `Read ${r.pages} ${r.pages === 1 ? "page" : "pages"}${r.ocr ? " with OCR" : ""}.` : r.ocr ? "Read with OCR." : "Read the source.",
    `${r.blocks} source-linked blocks.`,
    toReview === 0 ? "Every block quotes its source." : `${toReview} ${toReview === 1 ? "needs" : "need"} your judgment.`,
  ].join(" ");
  const facts: Array<{ n: number; label: string; tone?: "warn" | "muted" }> = [
    ...(r.pages ? [{ n: r.pages, label: r.ocr ? "pages · OCR" : "pages read" }] : []),
    { n: r.blocks, label: "blocks" },
    { n: r.supported, label: "quote the source" },
    { n: toReview, label: "need judgment", tone: toReview ? ("warn" as const) : ("muted" as const) },
  ];
  const total = Math.max(1, r.blocks);

  return (
    <section className="receipt" aria-label={sentence}>
      <p className="receipt-k">Brief receipt</p>
      <div className="receipt-facts">
        {facts.map((f, i) => (
          <Fact key={f.label} {...f} i={i} reduced={reducedMotion} />
        ))}
      </div>
      <div className="receipt-bar" aria-hidden="true">
        <i className="ok" style={vars({ "--w": r.supported / total, "--i": 0 })} />
        <i className="warn" style={vars({ "--w": r.judgment / total, "--i": 1 })} />
        <i className="none" style={vars({ "--w": r.unsupported / total, "--i": 2 })} />
      </div>
      {first ? (
        <button type="button" className="receipt-cta" onClick={() => onReview(first)}>
          Review {toReview === 1 ? "it" : `the ${toReview}`} first
          <span aria-hidden="true">→</span>
        </button>
      ) : (
        <p className="receipt-note">Open any block to see the exact lines it came from.</p>
      )}
    </section>
  );
}
