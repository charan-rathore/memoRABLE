import {afterEach,expect,it,vi} from "vitest";
const state=vi.hoisted(()=>({create:vi.fn()}));
vi.mock("tesseract.js",()=>({createWorker:state.create}));
import {ocrImages,disposeOcrWorker} from "@/import/pdf/ocr";
const images=[
 {page:1,png:new Uint8Array([1]),width:100,height:100},
 {page:2,png:new Uint8Array([2]),width:100,height:100},
];
afterEach(async()=>{vi.useRealTimers();await disposeOcrWorker();state.create.mockReset()});
it("a hung recognize is timed out and later images still OCR",async()=>{
 // Fake only setTimeout so the recognize cap can be advanced; the dynamic
 // import("tesseract.js") and the module cache resolve on the real event
 // loop. Wait on real setImmediate turns until each observable milestone
 // instead of a fixed hop count: a loaded CI box can need many more turns
 // for the import to settle, and a blind count flakes there.
 vi.useFakeTimers({toFake:["setTimeout","clearTimeout"]});
 const flushUntil=async(cond:()=>boolean,tries=400)=>{
  for(let i=0;i<tries&&!cond();i++)await new Promise(r=>setImmediate(r));
 };
 let firstRecognizeCalls=0;
 const good={recognize:async()=>({data:{text:"Useful recovered text",confidence:91}}),terminate:async()=>{}};
 const stuck={recognize:()=>{firstRecognizeCalls++;return new Promise(()=>{})},terminate:async()=>{}};
 state.create.mockResolvedValueOnce(stuck).mockResolvedValueOnce(good);
 const pending=ocrImages(images);
 // recognize() runs in the same synchronous block that arms the timeout
 // (the Promise.race in recognizeWithTimeout), so a counted recognize call
 // means the cap is armed and the fake-time jump below cannot miss it.
 await flushUntil(()=>firstRecognizeCalls===1);
 expect(state.create).toHaveBeenCalledTimes(1);
 await vi.advanceTimersByTimeAsync(31_000);
 await flushUntil(()=>state.create.mock.calls.length===2);
 // Assert the replacement before awaiting: a broken retirement fails here
 // instead of hanging the test on `pending` until its own timeout.
 expect(state.create).toHaveBeenCalledTimes(2);
 const blocks=await pending;
 expect(blocks).toHaveLength(1);
 expect(blocks[0]!.page).toBe(2);
 expect(blocks[0]!.text).toContain("Useful recovered text");
},20000);
