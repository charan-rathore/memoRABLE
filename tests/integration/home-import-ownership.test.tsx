// @vitest-environment jsdom
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HomeScreen } from "@/components/home/home-screen";
import { ImportPanel } from "@/components/import/import-panel";
import { ATLAS_NOTES_SOURCE } from "@/import/examples/catalog";
const hooks = vi.hoisted(() => ({ schedule: vi.fn(), quick: vi.fn() }));
vi.mock("@/import/docgraph", () => ({ readPdfQuick: hooks.quick, scheduleDoclingRefine: hooks.schedule, isDoclingRefinementBetter: () => true }));
vi.mock("@/import/read-pdf", () => ({ isPdfFile: () => true }));
const props = { sourceLabel: "A.pdf", sourceOk: false, sourceText: ATLAS_NOTES_SOURCE, errors: [], warnings: [], hasVerified: true, aiEnabled: false, onUseExample: vi.fn(), onUseVerified: vi.fn(), onImproveWithAi: vi.fn(), aiBusy: false };
const upload=(container:HTMLElement)=>fireEvent.change(container.querySelector('input[type="file"]')!,{target:{files:[new File(["pdf"],"A.pdf")]}});
describe("all entry-point ownership",()=>{
 it("HomeScreen ignores an already queued refinement after unmount",async()=>{
  hooks.quick.mockResolvedValue({text:ATLAS_NOTES_SOURCE,pages:1}); hooks.schedule.mockClear();
  const onImport=vi.fn(); const view=render(<HomeScreen errors={[]} onImport={onImport} onUseExample={vi.fn()}/>);
  upload(view.container); await waitFor(()=>expect(hooks.schedule).toHaveBeenCalled());
  const request=hooks.schedule.mock.calls.at(-1)![0]; view.unmount(); onImport.mockClear();
  await act(async()=>request.onRefine({markdown:ATLAS_NOTES_SOURCE}));
  expect(onImport).not.toHaveBeenCalled(); expect(request.signal.aborted).toBe(true);
 });
 it("HomeScreen ignores late initial file read after unmount",async()=>{
  let finish!: (x:unknown)=>void; hooks.quick.mockImplementation(()=>new Promise(r=>{finish=r}));
  const onImport=vi.fn(); const view=render(<HomeScreen errors={[]} onImport={onImport} onUseExample={vi.fn()}/>);
  upload(view.container); view.unmount(); await act(async()=>finish({text:ATLAS_NOTES_SOURCE,pages:1})); expect(onImport).not.toHaveBeenCalled();
 });
 for(const choice of ["sample","verified"]){
  it(`ImportPanel ${choice} cancels pending file read`,async()=>{
   let finish!: (x:unknown)=>void; hooks.quick.mockImplementation(()=>new Promise(r=>{finish=r}));
   const onImport=vi.fn(), onEditSource=vi.fn(); const view=render(<ImportPanel {...props} onImport={onImport} onEditSource={onEditSource}/>);
   upload(view.container);
   fireEvent.click(choice==="sample"?view.container.querySelector('.sample-row')!:view.getByText('Use verified example extraction'));
   await act(async()=>finish({text:ATLAS_NOTES_SOURCE,pages:1})); expect(onImport).not.toHaveBeenCalled(); expect(onEditSource).not.toHaveBeenCalled();
  });
 }
});

it("HomeScreen sample cancels a pending initial PDF read", async()=>{
 let finish!:(x:unknown)=>void; hooks.quick.mockImplementation(()=>new Promise(r=>{finish=r}));
 const onImport=vi.fn(),onUseExample=vi.fn();const view=render(<HomeScreen errors={[]} onImport={onImport} onUseExample={onUseExample}/>);
 upload(view.container);fireEvent.click(view.container.querySelector('.linkish')!);
 await act(async()=>finish({text:ATLAS_NOTES_SOURCE,pages:1}));
 expect(onUseExample).toHaveBeenCalledWith("atlas-json");expect(onImport).not.toHaveBeenCalled();
});
