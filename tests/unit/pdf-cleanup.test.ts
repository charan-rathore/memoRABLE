import {expect,it,vi} from "vitest";
const state=vi.hoisted(()=>({destroy:vi.fn(),getPage:vi.fn()}));
vi.mock("pdfjs-dist/legacy/build/pdf.mjs",()=>({getDocument:()=>({promise:Promise.resolve({numPages:1,destroy:state.destroy,getPage:state.getPage})})}));
import {readPdfBytes} from "@/import/pdf/read-structured";
it("destroys the PDF worker if page reading fails",async()=>{
 state.destroy.mockClear();state.getPage.mockRejectedValue(new Error("bad page"));
 await expect(readPdfBytes(new Uint8Array([1]),{skipOcr:true})).rejects.toThrow("bad page");
 expect(state.destroy).toHaveBeenCalledOnce();
});
