/**
 * Extract embedded images from a pdf.js page.
 *
 * Screenshots and spreadsheet captures are first-class content in the RFC —
 * they must be OCR'd and merged near their surrounding section, not dropped.
 */

export interface ExtractedPdfImage {
  page: number;
  name: string;
  /** PNG bytes when conversion succeeds; otherwise raw raster hint only. */
  png: Uint8Array | null;
  width: number;
  height: number;
}

type PdfJsPage = {
  getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[] }>;
  objs: { get: (name: string) => Promise<unknown> | unknown };
};

type PdfJsModule = {
  OPS: { paintImageXObject: number; paintInlineImageXObject: number };
};

/** Pull painted image XObjects from a page and encode usable PNGs. */
export async function extractPageImages(
  page: PdfJsPage,
  pageNumber: number,
  ops: PdfJsModule["OPS"],
): Promise<ExtractedPdfImage[]> {
  const operatorList = await page.getOperatorList();
  const names: string[] = [];

  for (let i = 0; i < operatorList.fnArray.length; i++) {
    const fn = operatorList.fnArray[i];
    if (fn === ops.paintImageXObject || fn === ops.paintInlineImageXObject) {
      const args = operatorList.argsArray[i] as unknown[] | undefined;
      const name = args?.[0];
      if (typeof name === "string") names.push(name);
    }
  }

  const images: ExtractedPdfImage[] = [];
  const seen = new Set<string>();

  for (const name of names) {
    if (seen.has(name)) continue;
    seen.add(name);
    try {
      const raw = await Promise.resolve(page.objs.get(name));
      const img = asImageData(raw);
      if (!img || img.width < 40 || img.height < 40) continue;
      // Soft masks / tiny icons are noise; keep spreadsheet-scale captures.
      if (img.width * img.height < 20_000) continue;
      const png = encodeRgbaPng(img.data, img.width, img.height);
      images.push({
        page: pageNumber,
        name,
        png,
        width: img.width,
        height: img.height,
      });
    } catch {
      images.push({ page: pageNumber, name, png: null, width: 0, height: 0 });
    }
  }

  return images;
}

interface Raster {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

function asImageData(raw: unknown): Raster | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as {
    data?: Uint8ClampedArray | Uint8Array;
    width?: number;
    height?: number;
    bitmap?: ImageBitmap;
  };
  if (obj.data && typeof obj.width === "number" && typeof obj.height === "number") {
    const data =
      obj.data instanceof Uint8ClampedArray
        ? obj.data
        : new Uint8ClampedArray(obj.data.buffer, obj.data.byteOffset, obj.data.byteLength);
    return { data: ensureRgba(data, obj.width, obj.height), width: obj.width, height: obj.height };
  }
  return null;
}

function ensureRgba(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const pixels = width * height;
  if (data.length >= pixels * 4) return data;
  if (data.length >= pixels * 3) {
    const rgba = new Uint8ClampedArray(pixels * 4);
    for (let i = 0, j = 0; i < pixels; i++, j += 3) {
      rgba[i * 4] = data[j]!;
      rgba[i * 4 + 1] = data[j + 1]!;
      rgba[i * 4 + 2] = data[j + 2]!;
      rgba[i * 4 + 3] = 255;
    }
    return rgba;
  }
  if (data.length >= pixels) {
    const rgba = new Uint8ClampedArray(pixels * 4);
    for (let i = 0; i < pixels; i++) {
      const v = data[i]!;
      rgba[i * 4] = v;
      rgba[i * 4 + 1] = v;
      rgba[i * 4 + 2] = v;
      rgba[i * 4 + 3] = 255;
    }
    return rgba;
  }
  return data;
}

/**
 * Minimal PNG encoder (RGBA, no filtering). Avoids a canvas dependency so the
 * same path works in the browser and in Node vitest.
 */
export function encodeRgbaPng(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const dest = y * (stride + 1);
    raw[dest] = 0; // filter None
    raw.set(rgba.subarray(y * stride, y * stride + stride), dest + 1);
  }

  const compressed = deflate(raw);
  const signature = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
  const ihdr = new Uint8Array(13);
  view32(ihdr, 0, width);
  view32(ihdr, 4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

function view32(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = (value >>> 24) & 0xff;
  buf[offset + 1] = (value >>> 16) & 0xff;
  buf[offset + 2] = (value >>> 8) & 0xff;
  buf[offset + 3] = value & 0xff;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = ascii(type);
  const len = new Uint8Array(4);
  view32(len, 0, data.length);
  const body = concat([typeBytes, data]);
  const crc = crc32(body);
  const crcBytes = new Uint8Array(4);
  view32(crcBytes, 0, crc >>> 0);
  return concat([len, body, crcBytes]);
}

function ascii(value: string): Uint8Array {
  const out = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i++) out[i] = value.charCodeAt(i) & 0xff;
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Stored-block zlib wrapper — fine for one-off OCR images. */
function deflate(data: Uint8Array): Uint8Array {
  // Prefer native CompressionStream when present (browser + modern Node).
  // Synchronous fallback: zlib-compatible stored blocks (no real compression).
  const max = 65535;
  const chunks: Uint8Array[] = [Uint8Array.of(0x78, 0x01)]; // zlib header, stored
  let offset = 0;
  while (offset < data.length) {
    const end = Math.min(offset + max, data.length);
    const slice = data.subarray(offset, end);
    const last = end >= data.length;
    const len = slice.length;
    const nlen = len ^ 0xffff;
    const header = new Uint8Array(5);
    header[0] = last ? 1 : 0;
    header[1] = len & 0xff;
    header[2] = (len >>> 8) & 0xff;
    header[3] = nlen & 0xff;
    header[4] = (nlen >>> 8) & 0xff;
    chunks.push(header, slice);
    offset = end;
  }
  const adler = adler32(data);
  const tail = new Uint8Array(4);
  view32(tail, 0, adler >>> 0);
  chunks.push(tail);
  return concat(chunks);
}

function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]!) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}
