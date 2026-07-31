import { describe, expect, it } from "vitest";
import { renderToHtml, renderToJson, Column, Document as DocRoot, Email as EmailRoot, Page as PageRoot, Row } from "@unlayer/react-elements";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { importSource } from "@/import/import-source";
import { ATLAS_JSON_SOURCE } from "@/import/examples/catalog";
import { buildDocumentRoot, buildEmailRoot, buildPageRoot, buildRoot } from "@/render/build-root";
import { renderBundle, renderMode, minimalFallbackHtml } from "@/render/render-bundle";
import { validateDesignJson } from "@/render/compatibility";
import { blockRenderers, renderBlockRows } from "@/render/block-registry";
import type { MemoryDocument } from "@/domain/memory/schema";
import { escapeHtml } from "@/render/safe-inline";

function atlas(): MemoryDocument {
  const result = importSource({ raw: ATLAS_JSON_SOURCE, label: "atlas-q3-brief.json" });
  if (!result.ok) throw new Error("atlas import failed");
  return result.value;
}

/** Walk a rendered root and assert the strict Root → Row → Column → Item hierarchy. */
function assertHierarchy(root: ReactElement, expectedRootType: unknown) {
  expect(root.type).toBe(expectedRootType);
  const rows = (root.props as { children: ReactNode }).children;
  const rowArray = Array.isArray(rows) ? rows : [rows];
  let rowCount = 0;
  for (const row of rowArray.flat()) {
    if (!isValidElement(row)) continue;
    expect(row.type).toBe(Row);
    rowCount += 1;
    const columns = (row.props as { children: ReactNode }).children;
    const columnArray = (Array.isArray(columns) ? columns : [columns]).filter(isValidElement);
    expect(columnArray.length).toBeGreaterThan(0);
    for (const column of columnArray) {
      expect(column.type).toBe(Column);
    }
  }
  expect(rowCount).toBeGreaterThan(6);
}

describe("direct roots and strict hierarchy", () => {
  const doc = atlas();

  it("builds a direct Document root with rows only", () => {
    assertHierarchy(buildDocumentRoot(doc), DocRoot);
  });
  it("builds a direct Page root with rows only", () => {
    assertHierarchy(buildPageRoot(doc), PageRoot);
  });
  it("builds a direct Email root with rows only", () => {
    assertHierarchy(buildEmailRoot(doc), EmailRoot);
  });

  it("column counts match their row layouts", () => {
    for (const mode of ["web", "email", "document"] as const) {
      const built = buildRoot(doc, mode);
      const design = renderToJson(built.root);
      for (const row of design.body.rows) {
        const cells = row.cells as number[];
        expect(cells.length).toBe(row.columns.length);
        expect(row.columns.length).toBeGreaterThan(0);
        expect(row.columns.length).toBeLessThanOrEqual(5);
      }
    }
  });
});

describe("complete HTML per mode", () => {
  const doc = atlas();

  it("renders complete, distinct Web/Email/Document HTML", () => {
    const bundle = renderBundle(doc);
    for (const mode of ["web", "email", "document"] as const) {
      const output = bundle.outputs[mode];
      expect(output.error).toBeNull();
      expect(output.html).toBeTruthy();
      expect(output.html).toContain("</html>");
      // All six blocks' content appears in every mode.
      expect(output.html).toContain("Momentum, with room to compound.");
      expect(output.html).toContain("$4.2M");
      expect(output.html).toContain("Dual-sourcing complete by Oct");
      expect(output.html).toContain("D-021");
      expect(output.html).toContain("M. Chen");
      expect(output.html).toContain("Fleet Analytics general availability");
      expect(output.html).toContain("Created from 6 source-linked Memory Blocks");
    }
    expect(bundle.outputs.web.html).not.toBe(bundle.outputs.email.html);
    expect(bundle.outputs.email.html).not.toBe(bundle.outputs.document.html);
  });

  it("produces compatible design JSON from a recognized direct root", () => {
    for (const mode of ["web", "email", "document"] as const) {
      const output = renderMode(doc, mode);
      expect(output.designJsonError).toBeNull();
      expect(output.designJsonSummary).not.toBeNull();
      expect(output.designJsonSummary!.rowCount).toBeGreaterThan(6);
      expect(output.designJsonSummary!.contentTypes).toContain("heading");
      expect(output.designJsonSummary!.contentTypes).toContain("text");
      expect(output.designJsonSummary!.contentTypes).toContain("table");
    }
  });

  it("is byte-identical across repeated renders", () => {
    const first = renderBundle(doc);
    const second = renderBundle(atlas());
    expect(second.outputs.web.html).toBe(first.outputs.web.html);
    expect(second.outputs.email.html).toBe(first.outputs.email.html);
    expect(second.outputs.document.html).toBe(first.outputs.document.html);
    expect(JSON.stringify(second.outputs.document.designJson)).toBe(
      JSON.stringify(first.outputs.document.designJson),
    );
  });
});

describe("escaping and hostile input", () => {
  it("escapes every imported value in all modes", () => {
    const hostile = importSource({
      raw: JSON.stringify({
        version: 1,
        title: '<script>alert("xss")</script>',
        blocks: [
          { kind: "snapshot", payload: { heading: "<img src=x onerror=alert(1)>", summary: 'Summary with <b>html</b> & "quotes"' } },
          { kind: "signals", payload: { entries: [{ label: "<script>", value: "1" }] } },
          { kind: "decisions", payload: { entries: [{ text: "javascript:alert(1)", status: "approved" }] } },
          { kind: "timeline", payload: { entries: [{ date: "Jul", title: "<svg onload=alert(1)>", state: "shipped" }] } },
          { kind: "risks", payload: { entries: [{ risk: "<iframe>", severity: "high", mitigation: "x" }] } },
          { kind: "actions", payload: { entries: [{ task: "<a href=javascript:alert(1)>x</a>", owner: "o", due: "d", status: "open" }] } },
        ],
      }),
      label: "hostile.json",
    });
    if (!hostile.ok) throw new Error("hostile import should succeed as data");
    const bundle = renderBundle(hostile.value);
    for (const mode of ["web", "email", "document"] as const) {
      const html = bundle.outputs[mode].html!;
      // No RAW markup may survive — every hostile tag must be entity-escaped.
      expect(html).not.toContain("<script>alert");
      expect(html).not.toContain("<img src=x");
      expect(html).not.toContain("<svg onload");
      expect(html).not.toContain("<iframe>");
      expect(html).not.toContain("<a href=javascript:");
      expect(html).not.toContain('href="javascript:');
      // The content still appears — escaped and harmless as visible text.
      expect(html).toContain("&lt;script&gt;");
      expect(html).toContain("&lt;iframe&gt;");
      expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    }
  });

  it("escapeHtml covers the five dangerous characters", () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;");
  });

  it("never leaks provenance excerpts into exported HTML", () => {
    const doc = atlas();
    const bundle = renderBundle(doc);
    for (const mode of ["web", "email", "document"] as const) {
      const html = bundle.outputs[mode].html!;
      expect(html).not.toContain("blocks[0]");
      expect(html).not.toContain("atlas-q3-brief.json");
      expect(html).not.toContain("Remembered from");
    }
  });
});

describe("block isolation (layer 5)", () => {
  it("replaces only the failing block with a safe recovery row", () => {
    const doc = atlas();
    const original = blockRenderers.risks;
    blockRenderers.risks = () => {
      throw new Error("injected renderer failure");
    };
    try {
      const built = buildRoot(doc, "web");
      const recoveredBlock = built.blocks.find((b) => b.kind === "risks")!;
      expect(recoveredBlock.recovered).toBe(true);
      expect(built.blocks.filter((b) => b.recovered)).toHaveLength(1);
      const html = renderToHtml(built.root);
      expect(html).toContain("couldn't be rendered here");
      expect(html).toContain("Momentum, with room to compound."); // other blocks intact
      expect(html).not.toContain("Dual-sourcing complete by Oct"); // failed block's content absent
    } finally {
      blockRenderers.risks = original;
    }
  });

  it("rejects non-Row structures from a broken renderer", () => {
    const doc = atlas();
    const original = blockRenderers.signals;
    blockRenderers.signals = () => [<div key="x" />] as never;
    try {
      const block = doc.blocks.find((b) => b.kind === "signals")!;
      const rendered = renderBlockRows(block, {
        mode: "web",
        position: 1,
        documentTitle: doc.title,
        surface: "#FFFFFF",
      });
      expect(rendered.recovered).toBe(true);
      expect(rendered.rows).toHaveLength(1);
      expect((rendered.rows[0] as ReactElement).type).toBe(Row);
    } finally {
      blockRenderers.signals = original;
    }
  });
});

describe("output isolation (layer 6)", () => {
  it("keeps successful modes when another mode fails", () => {
    const doc = atlas();
    // Sabotage exactly one block only in email mode via the registry.
    const original = blockRenderers.snapshot;
    blockRenderers.snapshot = (block, ctx) => {
      if (ctx.mode === "email") throw new Error("email-only failure");
      return original(block, ctx);
    };
    try {
      const bundle = renderBundle(doc);
      expect(bundle.outputs.web.error).toBeNull();
      expect(bundle.outputs.document.error).toBeNull();
      // Email still renders — the failed block became a recovery row.
      expect(bundle.outputs.email.error).toBeNull();
      expect(bundle.outputs.email.usedRecoveryRows).toBe(true);
      expect(bundle.outputs.email.html).toContain("couldn't be rendered here");
      expect(bundle.outputs.web.html).toContain("Momentum, with room to compound.");
    } finally {
      blockRenderers.snapshot = original;
    }
  });

  it("incompatible design JSON disables only that download", () => {
    expect(validateDesignJson({ nope: true }).ok).toBe(false);
    expect(validateDesignJson(null).ok).toBe(false);
    const doc = atlas();
    const valid = validateDesignJson(renderToJson(buildPageRoot(doc)));
    expect(valid.ok).toBe(true);
  });

  it("minimal fallback HTML contains no imported content", () => {
    const html = minimalFallbackHtml("Q3 <Board>");
    expect(html).toContain("Q3 &lt;Board&gt;");
    expect(html).not.toContain("<Board>");
  });
});
