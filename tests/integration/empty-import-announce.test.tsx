// @vitest-environment jsdom
import { fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Workbench } from "@/components/workbench";
import { importSource } from "@/import/import-source";
import { ATLAS_NOTES_SOURCE } from "@/import/examples/catalog";

const hooks = vi.hoisted(() => ({ schedule: vi.fn(), quick: vi.fn() }));
vi.mock("@/import/docgraph", () => ({
  readPdfQuick: hooks.quick,
  scheduleDoclingRefine: hooks.schedule,
  isDoclingRefinementBetter: () => true,
  refinedReadNote: () => undefined,
  hasReadablePdfText: (t: string) => t.replace(/<!--\s*page:\d+\s*-->/g, "").trim() !== "",
}));
vi.mock("@/import/read-pdf", () => ({ isPdfFile: () => true }));
vi.mock("@/render/render-bundle", () => ({ renderMode: () => ({ html: "preview", error: null }) }));
vi.mock("@/components/import/import-stages", () => ({ IMPORT_STAGE_PERCENT: {}, IMPORT_STAGE_LABEL: {}, IMPORT_STAGE_VERB: {}, yieldFrame: async () => {} }));
vi.mock("@/components/ui/brand-splash", () => ({ BrandSplash: () => null }));
vi.mock("@/components/ui/demo-video", () => ({ DemoVideo: () => null }));
vi.mock("@/components/topbar", () => ({ Topbar: ({ documentTitle }: { documentTitle: string }) => <h1>{documentTitle}</h1> }));
vi.mock("@/components/import/import-panel", () => ({ ImportPanel: () => null }));
vi.mock("@/components/preview/preview-pane", () => ({ PreviewPane: () => null }));
vi.mock("@/components/blocks/blocks-panel", () => ({ BlocksPanel: () => null }));
vi.mock("@/components/blocks/inspector", () => ({ Inspector: () => null }));
vi.mock("@/components/preview/source-modal", () => ({ SourceModal: () => null }));
vi.mock("@/components/export/publish-panel", () => ({ PublishPanel: () => null }));
afterEach(() => vi.unstubAllGlobals());

async function upload(quick: unknown) {
  hooks.quick.mockResolvedValue(quick);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ enabled: false })));
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  const doc = importSource({ raw: ATLAS_NOTES_SOURCE, label: "initial.md" });
  if (!doc.ok) throw Error("fixture");
  const view = render(<Workbench initial={{ sourceText: ATLAS_NOTES_SOURCE, sourceLabel: "initial.md", document: doc.value, outputs: {} as never, at: "start" }} />);
  fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [new File(["pdf"], "scan.pdf")] } });
  await waitFor(() => expect(view.container.querySelector('[aria-live]')?.textContent ?? "").not.toBe(""));
  return view;
}

describe("empty-import announcement", () => {
  it("announces no readable text instead of successful understanding", async () => {
    const view = await upload({ text: "<!-- page:1 -->", pages: 1, truncated: false, images: 1, ocrBlocks: 0, note: "No readable text found in this PDF. If it is a scan or photo, its text could not be read." });
    await waitFor(() => {
      const live = view.container.querySelector('[aria-live]')?.textContent ?? "";
      expect(live).toMatch(/No readable text found in scan\.pdf/);
    });
    const live = view.container.querySelector('[aria-live]')?.textContent ?? "";
    expect(live).not.toMatch(/Understood:/);
    expect(live).toMatch(/nothing was invented/i);
  });

  it("clean text PDF still announces understanding", async () => {
    const view = await upload({ text: ATLAS_NOTES_SOURCE, pages: 1, truncated: false, images: 0, ocrBlocks: 0 });
    await waitFor(() => {
      const live = view.container.querySelector('[aria-live]')?.textContent ?? "";
      expect(live).toMatch(/Understood: 6 memories created from scan\.pdf/);
    });
  });
});
