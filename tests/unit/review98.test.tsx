// @vitest-environment jsdom
import {describe,it,expect,vi} from "vitest";
import {readFileSync} from "node:fs";
import {render,fireEvent,screen,cleanup,act} from "@testing-library/react";
import {HomeScreen} from "@/components/home/home-screen";
import {importSource} from "@/import/import-source";
import {visualReading} from "@/visuals/evidence";
import {renderMode} from "@/render/render-bundle";
import {aiExtractRequestSchema} from "@/ai/contract";
import {toMemorySource} from "@/render/export-source";
const fixture=(id:string)=>readFileSync(`tests/fixtures/archetypes/${id}.md`,"utf8");
const parse=(raw:string)=>{const r=importSource({raw,label:"review.md"});if(!r.ok)throw Error();return r.value};
describe("PR98 review regressions",()=>{
 it("keeps limitations after multiple result lines in all output modes",()=>{const raw=fixture("research").replace("## Discussion","A second result remains uncertain.\n\nA third result is preliminary.\n\n## Discussion");const doc=parse(raw);const v=visualReading(doc,raw);expect(v.kind).toBe("evidence");if(v.kind==="evidence")expect(v.spans.some(s=>s.label==="Limitations")).toBe(true);for(const mode of ["email","web","document"]as const){const h=renderMode(doc,mode,"editorial",raw).html!;expect(h).toContain("multilingual transfer is untested");}});
 it("AI request uses export's semantic version and complete blocks",()=>{for(const id of["research","invoice"]){const raw=fixture(id),d=parse(raw);const workbench=readFileSync("src/components/workbench.tsx","utf8");expect(workbench).toContain("candidate: toMemorySource(state.document)");expect(aiExtractRequestSchema.safeParse({sourceText:raw,candidate:toMemorySource(d)}).success).toBe(true)}});
 it("does not declare an additional explicit blocker independent",()=>{const raw=fixture("prd").replace("Phase 3: Finance permissions — planned","Phase 3: Finance permissions — planned (blocked by Phase 1)");const doc=parse(raw);for(const mode of ["email","web","document"]as const){const h=renderMode(doc,mode,"editorial",raw).html!;expect(h).not.toContain("NO EDGE ESTABLISHED");expect(h).toContain("blocked by Phase 1");}});
 it("accepts exact decimal monetary evidence but rejects changed canonical amount",()=>{const raw=fixture("invoice").replace(/\$(12,000|3,500|15,500)/g,"$$$1.00");const d=parse(raw);expect(visualReading(d,raw).kind).toBe("comparison");const b=d.blocks.find(b=>b.kind==="signals")!;if("entries"in b.payload){const e=b.payload.entries.find(e=>"financialRole"in e&&e.financialRole==="line-item");if(e&&"value"in e)e.value="$1.00";}expect(visualReading(d,raw).kind).toBe("evidence");});
 it("a pending sample cannot overwrite a newer pasted import even if fetch ignores abort",async()=>{let resolve!:(r:Response)=>void;const fetchMock=vi.spyOn(globalThis,"fetch").mockImplementation(()=>new Promise(r=>{resolve=r}));const onImport=vi.fn();render(<HomeScreen errors={[]} onImport={onImport} onUseExample={()=>{}} onReplayBrand={()=>{}}/>);fireEvent.click(screen.getByRole("button",{name:"Open this sample"}));fireEvent.click(screen.getByRole("button",{name:/Paste text/}));fireEvent.change(screen.getByRole("textbox"),{target:{value:"# Newer user document"}});fireEvent.click(screen.getByRole("button",{name:"Remember this"}));await act(async()=>{resolve(new Response(fixture("invoice")));await Promise.resolve()});expect(onImport).toHaveBeenCalledTimes(1);expect(onImport).toHaveBeenCalledWith("# Newer user document","Pasted notes");cleanup();fetchMock.mockRestore();});
});
