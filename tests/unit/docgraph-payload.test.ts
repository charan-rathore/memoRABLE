import {afterEach,expect,it,vi} from "vitest";
import {parseWithDocGraph} from "@/import/docgraph/client";
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()});
for(const markdown of [42,{bad:true},"   "])it(`ignores unusable Docling markdown ${JSON.stringify(markdown)}`,async()=>{
 vi.stubEnv("NEXT_PUBLIC_DOCGRAPH","1");vi.stubGlobal("fetch",vi.fn(async()=>Response.json({markdown})));
 await expect(parseWithDocGraph(new File(["pdf"],"doc.pdf"))).resolves.toBeNull();
});
