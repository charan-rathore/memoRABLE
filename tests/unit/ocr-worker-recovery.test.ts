import {afterEach,expect,it,vi} from "vitest";
const state=vi.hoisted(()=>({create:vi.fn()}));
vi.mock("tesseract.js",()=>({createWorker:state.create}));
import {ocrImages,disposeOcrWorker} from "@/import/pdf/ocr";
const images=[{page:1,png:new Uint8Array([1]),width:100,height:100}];
afterEach(async()=>{await disposeOcrWorker();state.create.mockReset()});
it("a failed worker startup does not poison later document OCR",async()=>{
 state.create.mockRejectedValueOnce(new Error("worker startup failed")).mockResolvedValueOnce({recognize:async()=>({data:{text:"Recovered useful image text",confidence:90}}),terminate:async()=>{}});
 await expect(ocrImages(images)).rejects.toThrow("worker startup failed");
 const blocks=await ocrImages(images);
 expect(state.create).toHaveBeenCalledTimes(2);expect(blocks).toHaveLength(1);
});
it("healthy OCR calls reuse the same worker",async()=>{
 state.create.mockResolvedValue({recognize:async()=>({data:{text:"Useful image text",confidence:90}}),terminate:async()=>{}});
 await ocrImages(images);await ocrImages(images);expect(state.create).toHaveBeenCalledOnce();
});
it("concurrent callers share startup failure and the next attempt recovers",async()=>{
 let reject!:(reason:Error)=>void;
 state.create.mockImplementationOnce(()=>new Promise((_,r)=>{reject=r})).mockResolvedValueOnce({recognize:async()=>({data:{text:"Recovered image text",confidence:90}}),terminate:async()=>{}});
 const attempts=Promise.allSettled([ocrImages(images),ocrImages(images)]);
 await vi.waitFor(()=>expect(state.create).toHaveBeenCalledOnce());reject(new Error("failed startup"));
 expect((await attempts).every(r=>r.status==="rejected")).toBe(true);
 await ocrImages(images);expect(state.create).toHaveBeenCalledTimes(2);
});
