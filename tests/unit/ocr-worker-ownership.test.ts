import {afterEach,expect,it,vi} from "vitest";
const state=vi.hoisted(()=>({create:vi.fn()}));
vi.mock("tesseract.js",()=>({createWorker:state.create}));
import {ocrImages,disposeOcrWorker} from "@/import/pdf/ocr";
const images=[{page:1,png:new Uint8Array([1]),width:100,height:100}];
afterEach(async()=>{vi.useRealTimers();await disposeOcrWorker();state.create.mockReset()});
it("an old concurrent timeout cannot retire a replacement worker",async()=>{
 // Fake only setTimeout so the recognize caps can be advanced; the dynamic
 // import("tesseract.js") and module cache resolve on the real event loop.
 // Wait on observable milestones bounded by real time: a fixed hop count
 // flakes on a loaded box, and the default 5s test timeout is too tight
 // for three sequential passes there.
 vi.useFakeTimers({toFake:["setTimeout","clearTimeout"]});
 const flushUntil=async(cond:()=>boolean,deadlineMs=5000)=>{
  const end=Date.now()+deadlineMs;
  while(!cond()&&Date.now()<end)await new Promise(r=>setImmediate(r));
 };
 let stuckRecognizeCalls=0;
 const oldTerminate=vi.fn(async()=>{});
 const freshTerminate=vi.fn(async()=>{});
 state.create.mockResolvedValueOnce({recognize:()=>{stuckRecognizeCalls++;return new Promise(()=>{})},terminate:oldTerminate})
 .mockResolvedValueOnce({recognize:async()=>({data:{text:"Fresh useful document evidence",confidence:90}}),terminate:freshTerminate});
 const first=ocrImages(images);
 // recognize() runs in the same synchronous block that arms the timeout, so
 // a counted call means the cap is armed before fake time jumps.
 await flushUntil(()=>stuckRecognizeCalls===1);
 await vi.advanceTimersByTimeAsync(1000);
 const second=ocrImages(images);
 // The second pass shares the still-in-flight wedged worker and arms its own
 // cap on it.
 await flushUntil(()=>stuckRecognizeCalls===2);
 await vi.advanceTimersByTimeAsync(29000);
 // Both caps have now fired: the first (owning) attempt retires the wedged
 // worker, the second finds the slot no longer its own and leaves it alone.
 await flushUntil(()=>oldTerminate.mock.calls.length===1);
 await first;
 expect((await ocrImages(images))).toHaveLength(1);
 expect(state.create).toHaveBeenCalledTimes(2);
 await vi.advanceTimersByTimeAsync(1000);
 await second;
 expect(freshTerminate).not.toHaveBeenCalled();
 expect(oldTerminate).toHaveBeenCalledOnce();
 expect((await ocrImages(images))).toHaveLength(1);
 expect(state.create).toHaveBeenCalledTimes(2);
},20000);
