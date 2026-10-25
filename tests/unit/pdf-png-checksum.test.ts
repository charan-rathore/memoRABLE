import {describe,it,expect} from "vitest";
import {inflateSync} from "node:zlib";
import {encodeRgbaPng} from "@/import/pdf/images";
function idat(png:Uint8Array):Buffer{
 const data=Buffer.from(png);const pieces:Buffer[]=[];
 for(let p=8;p<data.length;){const n=data.readUInt32BE(p);if(data.toString("ascii",p+4,p+8)==="IDAT")pieces.push(data.subarray(p+8,p+8+n));p+=n+12;}
 return Buffer.concat(pieces);
}
describe("PNG stored-block checksum preserves actual raster",()=>{
 for(const [width,height] of [[1,1],[100,100],[257,129],[1000,1000]])it(`${width}x${height} zlib checksum and scanlines`,()=>{
  const rgba=new Uint8ClampedArray(width!*height!*4);for(let i=0;i<rgba.length;i++)rgba[i]=(i*31+17)%256;
  const raw=inflateSync(idat(encodeRgbaPng(rgba,width!,height!)));
  expect(raw.length).toBe((width!*4+1)*height!);
  const expected=Buffer.alloc(raw.length);for(let y=0;y<height!;y++)expected.set(rgba.subarray(y*width!*4,(y+1)*width!*4),y*(width!*4+1)+1);expect(raw.equals(expected)).toBe(true);
 });
});
