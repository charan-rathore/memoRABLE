// @vitest-environment jsdom
import { fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HomeScreen } from "@/components/home/home-screen";
import { ImportPanel } from "@/components/import/import-panel";
import { ATLAS_NOTES_SOURCE } from "@/import/examples/catalog";
import { ocrProvenanceNote } from "@/import/docgraph/progressive-pdf";

const hooks = vi.hoisted(() => ({ schedule: vi.fn(), quick: vi.fn() }));
vi.mock("@/import/docgraph", async () => {
  const actual = (await vi.importActual("@/import/docgraph")) as Record<string, unknown>;
  return { ...actual, readPdfQuick: hooks.quick, scheduleDoclingRefine: hooks.schedule, isDoclingRefinementBetter: () => true };
});
vi.mock("@/import/read-pdf", () => ({ isPdfFile: () => true }));

describe("OCR provenance display", () => {
  it("shows the verify-numbers note when OCR blocks came back, and never for clean text PDFs", async () => {
    const note = ocrProvenanceNote(1);
    expect(note).toBeTruthy();
    hooks.quick.mockResolvedValue({ text: ATLAS_NOTES_SOURCE, pages: 1, truncated: false, images: 1, ocrBlocks: 1, note });
    const onImport = vi.fn();
    const view = render(<HomeScreen errors={[]} onImport={onImport} onUseExample={vi.fn()} />);
    fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [new File(["pdf"], "scan.pdf")] } });
    await waitFor(() => expect(onImport).toHaveBeenCalled());
    expect(view.getByText(/scan or photo/)).toBeTruthy();
    expect(view.getByText(/[Cc]heck .*numbers|numbers.*original/)).toBeTruthy();
    const meta = onImport.mock.calls.at(-1)![2];
    expect(meta.parseStatus).toMatch(/OCR/);
    expect(meta.readNote).toMatch(/scan or photo/);
  });

  it("clean text PDF shows no OCR note", async () => {
    hooks.quick.mockResolvedValue({ text: ATLAS_NOTES_SOURCE, pages: 1, truncated: false, images: 0, ocrBlocks: 0 });
    const onImport = vi.fn();
    const view = render(<HomeScreen errors={[]} onImport={onImport} onUseExample={vi.fn()} />);
    fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [new File(["pdf"], "text.pdf")] } });
    await waitFor(() => expect(onImport).toHaveBeenCalled());
    expect(view.queryByText(/scan or photo/)).toBeNull();
    const meta = onImport.mock.calls.at(-1)![2];
    expect(meta.parseStatus).not.toMatch(/OCR/);
  });
});

describe("OCR provenance in the workbench import panel", () => {
  const panelProps = { sourceLabel: "scan.pdf", sourceOk: false, sourceText: ATLAS_NOTES_SOURCE, errors: [], warnings: [], hasVerified: false, aiEnabled: false, onUseExample: vi.fn(), onUseVerified: vi.fn(), onImproveWithAi: vi.fn(), aiBusy: false };

  it("surfaces the note in Reading notes and limits after a scanned PDF import", async () => {
    const note = ocrProvenanceNote(1);
    hooks.quick.mockResolvedValue({ text: ATLAS_NOTES_SOURCE, pages: 1, truncated: false, images: 1, ocrBlocks: 1, note });
    const onImport = vi.fn();
    const view = render(<ImportPanel {...panelProps} onImport={onImport} onEditSource={vi.fn()} />);
    fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [new File(["pdf"], "scan.pdf")] } });
    await waitFor(() => expect(onImport).toHaveBeenCalled());
    expect(view.getByText(/Reading notes and limits/)).toBeTruthy();
    expect(view.getByText(/scan or photo/)).toBeTruthy();
    expect(view.getByText(/[Cc]heck names and numbers/)).toBeTruthy();
    const meta = onImport.mock.calls.at(-1)![2];
    expect(meta.parseStatus).toMatch(/OCR/);
    expect(meta.readNote).toMatch(/scan or photo/);
  });

  it("shows a read note handed down from the home upload path", () => {
    const view = render(<ImportPanel {...panelProps} readNote="No readable text found in this PDF. If it is a scan or photo, its text could not be read." onImport={vi.fn()} onEditSource={vi.fn()} />);
    expect(view.getByText(/Reading notes and limits/)).toBeTruthy();
    expect(view.getByText(/No readable text found/)).toBeTruthy();
  });

  it("clean text PDF adds no OCR entry to Reading notes", async () => {
    hooks.quick.mockResolvedValue({ text: ATLAS_NOTES_SOURCE, pages: 1, truncated: false, images: 0, ocrBlocks: 0, note: undefined });
    const onImport = vi.fn();
    const view = render(<ImportPanel {...panelProps} onImport={onImport} onEditSource={vi.fn()} />);
    fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [new File(["pdf"], "text.pdf")] } });
    await waitFor(() => expect(onImport).toHaveBeenCalled());
    expect(view.queryByText(/scan or photo/)).toBeNull();
    expect(view.queryByText(/Reading notes and limits/)).toBeNull();
  });
});
