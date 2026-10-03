// @vitest-environment jsdom
import { act,fireEvent,render,screen,waitFor } from "@testing-library/react";
import { afterEach,expect,it,vi } from "vitest";
import { Workbench } from "@/components/workbench";
import { importSource } from "@/import/import-source";
import { ATLAS_NOTES_SOURCE,ATLAS_JSON_SOURCE } from "@/import/examples/catalog";
const hooks=vi.hoisted(()=>({schedule:vi.fn()}));
vi.mock("@/import/docgraph",()=>({readPdfQuick:async()=>({text:ATLAS_NOTES_SOURCE,pages:1}),scheduleDoclingRefine:hooks.schedule,isDoclingRefinementBetter:()=>true}));
vi.mock("@/import/read-pdf",()=>({isPdfFile:()=>true}));
vi.mock("@/render/render-bundle",()=>({renderMode:()=>({html:"preview",error:null})}));
vi.mock("@/components/import/import-stages",()=>({IMPORT_STAGE_PERCENT:{},IMPORT_STAGE_LABEL:{},IMPORT_STAGE_VERB:{},yieldFrame:async()=>{}}));
vi.mock("@/components/ui/brand-splash",()=>({BrandSplash:()=>null}));
vi.mock("@/components/ui/demo-video",()=>({DemoVideo:()=>null}));
vi.mock("@/components/topbar",()=>({Topbar:({documentTitle}:{documentTitle:string})=><h1>{documentTitle}</h1>}));
vi.mock("@/components/import/import-panel",()=>({ImportPanel:({onImport}:{onImport:(s:string,l:string)=>void})=><button onClick={()=>onImport(ATLAS_JSON_SOURCE,"B.json")}>Import B</button>}));
vi.mock("@/components/preview/preview-pane",()=>({PreviewPane:()=>null}));
vi.mock("@/components/blocks/blocks-panel",()=>({BlocksPanel:()=>null}));
vi.mock("@/components/blocks/inspector",()=>({Inspector:()=>null}));
vi.mock("@/components/journey-strip",()=>({JourneyStrip:()=>null}));
afterEach(()=>vi.unstubAllGlobals());
async function start(){
 hooks.schedule.mockClear();vi.stubGlobal("fetch",vi.fn(async()=>Response.json({enabled:false})));vi.stubGlobal("matchMedia",()=>({matches:false}));
 const doc=importSource({raw:ATLAS_NOTES_SOURCE,label:"initial.md"});if(!doc.ok)throw Error("fixture");
 const view=render(<Workbench initial={{sourceText:ATLAS_NOTES_SOURCE,sourceLabel:"initial.md",document:doc.value,outputs:{} as never,at:"start"}}/>);
 fireEvent.change(view.container.querySelector('input[type="file"]')!,{target:{files:[new File(["pdf"],"A.pdf")]}});
 await screen.findByRole("heading");await waitFor(()=>expect(hooks.schedule).toHaveBeenCalled());
 return {view,request:hooks.schedule.mock.calls.at(-1)![0]};
}
it("PDF refinement survives the actual home-to-workbench unmount",async()=>{
 const {request}=await start();expect(request.signal.aborted).toBe(false);
 await act(async()=>request.onRefine({markdown:ATLAS_JSON_SOURCE,pages:1}));
 expect(screen.getByRole("heading")).toHaveTextContent("Q3 Board Report");
});
for(const stop of ["new-document","unmount"])it(`handed-off PDF refinement is canceled by ${stop}`,async()=>{
 const {request,view}=await start();
 if(stop==="unmount")view.unmount();else {fireEvent.click(screen.getByText("Import B"));await screen.findByText("Q3 Board Report");}
 expect(request.signal.aborted).toBe(true);
 await act(async()=>request.onRefine({markdown:ATLAS_NOTES_SOURCE}));
 if(stop!=="unmount")expect(screen.getByRole("heading")).toHaveTextContent("Q3 Board Report");
});
