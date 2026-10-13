import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
import {readPdfBytes} from "@/import/pdf/read-structured";
it("reports real PDF size after native pdf.js consumes bytes",async()=>{
 const data=new Uint8Array(readFileSync("tests/fixtures/indent-po-grn.pdf"));
 const expected=data.byteLength;
 const result=await readPdfBytes(data,{skipOcr:true});
 expect(result.bytes).toBe(expected);
 expect(result.text.length).toBeGreaterThan(100);
});
