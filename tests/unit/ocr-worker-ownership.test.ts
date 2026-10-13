import {afterEach,expect,it,vi} from "vitest";
const state=vi.hoisted(()=>({create:vi.fn()}));
vi.mock("tesseract.js",()=>({createWorker:state.create}));
import {ocrImages,disposeOcrWorker} from "@/import/pdf/ocr";
const images=[{page:1,png:new Uint8Array([1]),width:100,height:100}];
afterEach(async()=>{vi.useRealTimers();await disposeOcrWorker();state.create.mockReset()});
it("an old concurrent timeout cannot retire a replacement worker",async()=>{
 vi.useFakeTimers({toFake:["setTimeout","clearTimeout"]});
 const flush=async()=>{for(let i=0;i<50;i++)await new Promise(r=>setImmediate(r))};
 const oldTerminate=vi.fn(async()=>{});
 const freshTerminate=vi.fn(async()=>{});
 state.create.mockResolvedValueOnce({recognize:()=>new Promise(()=>{}),terminate:oldTerminate})
 .mockResolvedValueOnce({recognize:async()=>({data:{text:"Fresh useful document evidence",confidence:90}}),terminate:freshTerminate});
 const first=ocrImages(images);
 await flush();
 await vi.advanceTimersByTimeAsync(1000);
 const second=ocrImages(images);
 await flush();
 await vi.advanceTimersByTimeAsync(29000);
 await first;
 expect((await ocrImages(images))).toHaveLength(1);
 expect(state.create).toHaveBeenCalledTimes(2);
 await vi.advanceTimersByTimeAsync(1000);
 await second;
 expect(freshTerminate).not.toHaveBeenCalled();
 expect(oldTerminate).toHaveBeenCalledOnce();
 expect((await ocrImages(images))).toHaveLength(1);
 expect(state.create).toHaveBeenCalledTimes(2);
});
