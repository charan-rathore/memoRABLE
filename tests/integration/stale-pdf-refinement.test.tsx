// @vitest-environment jsdom
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImportPanel } from "@/components/import/import-panel";
import { ATLAS_NOTES_SOURCE } from "@/import/examples/catalog";
const hooks = vi.hoisted(() => ({ schedule: vi.fn() }));
vi.mock("@/import/docgraph", () => ({
  readPdfQuick: async () => ({ text: ATLAS_NOTES_SOURCE, pages: 2 }),
  scheduleDoclingRefine: hooks.schedule,
  isDoclingRefinementBetter: () => true,
}));
vi.mock("@/import/read-pdf", () => ({ isPdfFile: () => true }));
const props = { sourceLabel: "A.pdf", sourceOk: false, sourceText: ATLAS_NOTES_SOURCE, errors: [], warnings: [], hasVerified: false, aiEnabled: false, onUseExample: vi.fn(), onUseVerified: vi.fn(), onImproveWithAi: vi.fn(), aiBusy: false };
describe("background PDF ownership", () => {
  it("does not replace B with a delayed refinement from A", async () => {
    const onImport = vi.fn();
    const onEditSource = vi.fn();
    const view = render(<ImportPanel {...props} onImport={onImport} onEditSource={onEditSource} />);
    const input = view.container.querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [new File(["pdf"], "A.pdf", { type: "application/pdf" })] } });
    await waitFor(() => expect(hooks.schedule).toHaveBeenCalled());
    const request = hooks.schedule.mock.calls.at(-1)![0];
    onImport.mockClear(); onEditSource.mockClear();
    view.rerender(<ImportPanel {...props} sourceText="B source" sourceLabel="B.pdf" onImport={onImport} onEditSource={onEditSource} />);
    await act(async () => { await request.onRefine({ markdown: ATLAS_NOTES_SOURCE }); });
    expect(onImport).not.toHaveBeenCalled();
    expect(onEditSource).not.toHaveBeenCalled();
    view.unmount();
    expect(request.signal.aborted).toBe(true);
  });
});
