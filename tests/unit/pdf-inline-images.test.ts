import { describe, expect, it, vi } from "vitest";
import { deflateSync, inflateSync } from "node:zlib";
import { extractPageImages } from "@/import/pdf/images";

function inlineImagePdf(): Uint8Array {
  const raster = Buffer.alloc(200 * 100 * 3);
  for (let i = 0; i < raster.length; i += 3) { raster[i] = 255; raster[i + 1] = 80; raster[i + 2] = 0; }
  const content = Buffer.concat([Buffer.from("q 200 0 0 100 0 0 cm\nBI /W 200 /H 100 /CS /RGB /BPC 8 /F /FlateDecode ID\n"), deflateSync(raster), Buffer.from("\nEI\nQ")]);
  const objects = [Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"), Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"), Buffer.from("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << >> /Contents 4 0 R >>"), Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`), content, Buffer.from("\nendstream")])];
  const parts=[Buffer.from("%PDF-1.4\n")]; const offsets=[0]; let length=parts[0]!.length;
  objects.forEach((o,i)=>{offsets.push(length);const part=Buffer.concat([Buffer.from(`${i+1} 0 obj\n`),o,Buffer.from("\nendobj\n")]);parts.push(part);length+=part.length;});
  parts.push(Buffer.from(`xref\n0 5\n0000000000 65535 f \n${offsets.slice(1).map(o=>`${String(o).padStart(10,"0")} 00000 n \n`).join("")}trailer\n<< /Root 1 0 R /Size 5 >>\nstartxref\n${length}\n%%EOF`));
  return new Uint8Array(Buffer.concat(parts));
}

describe("actual pdf.js inline raster extraction", () => {
  it("keeps an inline image as OCR input, with a valid PNG raster", async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: inlineImagePdf() }).promise;
    try {
      const page = await doc.getPage(1);
      const images = await extractPageImages(page, 1, pdfjs.OPS);
      expect(images).toHaveLength(1);
      const image = images[0]!;
      expect([image.width,image.height]).toEqual([200,100]);
      const png = Buffer.from(image.png!);
      const idats: Buffer[]=[];
      for(let p=8;p<png.length;){const n=png.readUInt32BE(p);if(png.toString("ascii",p+4,p+8)==="IDAT")idats.push(png.subarray(p+8,p+8+n));p+=12+n;}
      const raw=inflateSync(Buffer.concat(idats));
      expect([...raw.subarray(0,5)]).toEqual([0,255,80,0,255]);
      expect(raw.length).toBe(80100);
    } finally { await doc.destroy(); }
  });
});

it("keeps the immediate resolved-raster adapter path and skips unusable images", async () => {
  const image = { width: 200, height: 100, data: new Uint8Array(60000).fill(70) };
  const page = {
    getOperatorList: async () => ({ fnArray: [85,85,85], argsArray: [["ready"],["ready"],["broken"]] }),
    objs: { get: (name: string) => { if (name === "broken") throw new Error("bad image"); return image; } },
  };
  const images = await extractPageImages(page,1,{ paintImageXObject:85,paintInlineImageXObject:86 });
  expect(images).toHaveLength(2);
  expect(images[0]?.png).not.toBeNull();
  expect(images[1]?.png).toBeNull();
});


it("bounds an image object that never resolves", async () => {
  vi.useFakeTimers();
  try {
    const pending = extractPageImages({getOperatorList:async()=>({fnArray:[85],argsArray:[["never"]]}),objs:{get:()=>null}},1,{paintImageXObject:85,paintInlineImageXObject:86});
    await vi.advanceTimersByTimeAsync(5000);
    await expect(pending).resolves.toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});


function sharedImagePdf(): Uint8Array {
  const image = deflateSync(Buffer.alloc(200*100*3,120));
  const objects = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>"),
    ...[1,2,3].map(()=>Buffer.from("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /XObject << /Im0 7 0 R >> >> /Contents 6 0 R >>")),
    Buffer.from("<< /Length 31 >>\nstream\nq 200 0 0 100 0 0 cm /Im0 Do Q\nendstream"),
    Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width 200 /Height 100 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${image.length} >>\nstream\n`),image,Buffer.from("\nendstream")]),
  ];
  const parts=[Buffer.from("%PDF-1.4\n")];const offsets:number[]=[];let length=parts[0]!.length;
  objects.forEach((o,i)=>{offsets.push(length);const p=Buffer.concat([Buffer.from(`${i+1} 0 obj\n`),o,Buffer.from("\nendobj\n")]);parts.push(p);length+=p.length;});
  parts.push(Buffer.from(`xref\n0 8\n0000000000 65535 f \n${offsets.map(o=>`${String(o).padStart(10,"0")} 00000 n \n`).join("")}trailer\n<< /Root 1 0 R /Size 8 >>\nstartxref\n${length}\n%%EOF`));
  return new Uint8Array(Buffer.concat(parts));
}

it("extracts promoted shared XObjects from the real pdf.js common pool",async()=>{
 const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");
 const doc=await pdfjs.getDocument({data:sharedImagePdf()}).promise;
 try {
  let globalSeen=false;
  for(let i=1;i<=3;i++){
   const page=await doc.getPage(i);
   const ops=await page.getOperatorList();
   globalSeen ||= ops.argsArray.some(a=>Array.isArray(a)&&typeof a[0]==="string"&&a[0].startsWith("g_"));
   const images=await extractPageImages(page,i,pdfjs.OPS);
   expect(images[0]?.width).toBe(200);
   expect(images[0]?.png).not.toBeNull();
  }
  expect(globalSeen).toBe(true);
 } finally {await doc.destroy();}
},20000);
