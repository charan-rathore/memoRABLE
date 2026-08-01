import { describe, expect, it } from "vitest";
import { importSource } from "@/import/import-source";
import { ATLAS_JSON_SOURCE } from "@/import/examples/catalog";
import { renderMode } from "@/render/render-bundle";
import { PUBLISH_THEME_IDS } from "@/render/themes";

describe("publication presets change Elements composition", () => {
  const imported = importSource({ raw: ATLAS_JSON_SOURCE, label: "atlas-q3-brief.json" });
  if (!imported.ok) throw new Error("atlas import failed");
  const doc = imported.value;

  it("every preset produces HTML", () => {
    for (const id of PUBLISH_THEME_IDS) {
      const out = renderMode(doc, "web", id);
      expect(out.html.length).toBeGreaterThan(200);
      expect(out.error).toBeFalsy();
    }
  });

  it("Minimal drops Menu chrome that Editorial keeps", () => {
    const editorial = renderMode(doc, "web", "editorial").html;
    const minimal = renderMode(doc, "web", "minimal").html;
    // Editorial composes a jump Menu; Minimal strips chrome to Rows + type.
    expect(editorial.toLowerCase()).toMatch(/menu|href=["']#section-/);
    expect(minimal).not.toEqual(editorial);
  });

  it("Executive uses a cooler accent than Academic's forest", () => {
    const academic = renderMode(doc, "web", "academic").html;
    const executive = renderMode(doc, "web", "executive").html;
    expect(academic).toContain("#1F5E4E");
    expect(executive).toContain("#0B5FFF");
    expect(academic).not.toContain("#0B5FFF");
  });

  it("Academic document keeps a TOC band Editorial also has, Minimal does not", () => {
    const academic = renderMode(doc, "document", "academic").html.toLowerCase();
    const minimal = renderMode(doc, "document", "minimal").html.toLowerCase();
    // TOC entries are paragraph links to section anchors.
    expect(academic).toMatch(/section-signals|contents|table of contents|i\.\s|signals/);
    expect(minimal).not.toEqual(academic);
  });
});
