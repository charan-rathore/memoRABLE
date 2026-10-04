import {afterEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
import {extractWithAi} from "@/ai/openai-extractor.server";
import {ATLAS_JSON_SOURCE} from "@/import/examples/catalog";
const candidate=JSON.parse(ATLAS_JSON_SOURCE);
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()});
for(const reason of ["length","content_filter","tool_calls",undefined])it(`refuses parseable but unfinished AI output: ${reason}`,async()=>{
 vi.stubEnv("OPENAI_API_KEY","test");vi.stubGlobal("fetch",vi.fn(async()=>Response.json({choices:[{finish_reason:reason,message:{content:JSON.stringify(candidate)}}],usage:{prompt_tokens:10,completion_tokens:20}})));
 const out=await extractWithAi("test source",candidate,"test-request");expect(out.result.ok).toBe(false);expect(out.meta.completionTokens).toBe(20);
});
it("rejects choice-level error even with a normal stop and valid JSON",async()=>{
 vi.stubEnv("OPENAI_API_KEY","test");vi.stubGlobal("fetch",vi.fn(async()=>Response.json({choices:[{finish_reason:"stop",error:{code:502},message:{content:JSON.stringify(candidate)}}]})));
 expect((await extractWithAi("source",candidate,"test-request")).result.ok).toBe(false);
});
it("accepts normal-stop schema-valid output",async()=>{
 vi.stubEnv("OPENAI_API_KEY","test");vi.stubGlobal("fetch",vi.fn(async()=>Response.json({choices:[{finish_reason:"stop",message:{content:JSON.stringify(candidate)}}]})));
 expect((await extractWithAi("source",candidate,"test-request")).result.ok).toBe(true);
});
