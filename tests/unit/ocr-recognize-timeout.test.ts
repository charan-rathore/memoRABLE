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
 // loop, so interleave real setImmediate turns around the fake-time jump.
 vi.useFakeTimers({toFake:["setTimeout","clearTimeout"]});
 const flushReal=async()=>{for(let i=0;i<50;i++)await new Promise(r=>setImmediate(r))};
 const good={recognize:async()=>({data:{text:"Useful recovered text",confidence:91}}),terminate:async()=>{}};
 const stuck={recognize:()=>new Promise(()=>{}),terminate:async()=>{}};
 state.create.mockResolvedValueOnce(stuck).mockResolvedValueOnce(good);
 const pending=ocrImages(images);
 await flushReal(); // import + createWorker(stuck) + recognize armed its timeout
 expect(state.create).toHaveBeenCalledTimes(1);
 await vi.advanceTimersByTimeAsync(31_000);
 await flushReal(); // timeout rejected, worker retired, second worker created
 const blocks=await pending;
 expect(state.create).toHaveBeenCalledTimes(2);
 expect(blocks).toHaveLength(1);
 expect(blocks[0]!.page).toBe(2);
 expect(blocks[0]!.text).toContain("Useful recovered text");
},20000);
