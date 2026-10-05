import {afterEach,expect,it,vi} from "vitest";
import {parseWithDocGraph} from "@/import/docgraph/client";
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();vi.useRealTimers()});
it("keeps a deadline even when caller provides an ownership signal",async()=>{
 vi.stubEnv("NEXT_PUBLIC_DOCGRAPH","1");const owner=new AbortController();let signal!:AbortSignal;const deadline=new AbortController();
 const timeout=vi.spyOn(AbortSignal,"timeout").mockReturnValue(deadline.signal);
 vi.stubGlobal("fetch",vi.fn(async(_url,opts)=>{signal=opts.signal;return new Promise((_r,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError'))))}));
 const pending=parseWithDocGraph(Object.assign(new Blob(["pdf"]),{name:"doc.pdf"}) as File,{signal:owner.signal});
 deadline.abort();
 expect(signal.aborted).toBe(true);expect(owner.signal.aborted).toBe(false);expect(timeout).toHaveBeenCalledWith(300000);await expect(pending).resolves.toBeNull();timeout.mockRestore();
});
