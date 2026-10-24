import { afterEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({create:vi.fn()}));
vi.mock('tesseract.js', () => ({createWorker:state.create}));
import {disposeOcrWorker} from '@/import/pdf/ocr';
afterEach(async () => {await disposeOcrWorker();state.create.mockReset();});
it('retains parsed PDF text when embedded-image OCR startup rejects', async () => {
  const {readPdfBytes} = await import('@/import/pdf/read-structured');
  state.create.mockRejectedValue(new Error('worker startup failed'));
  const image = Buffer.alloc(200 * 200 * 3, 255);
  const commands = 'BT /F1 12 Tf 20 280 Td (Useful document text) Tj ET q 200 0 0 200 20 20 cm /Im1 Do Q';
  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> /XObject << /Im1 6 0 R >> >> /Contents 5 0 R >>'),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),
    Buffer.from(`<< /Length ${commands.length} >>\nstream\n${commands}\nendstream`),
    Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width 200 /Height 200 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length ${image.length} >>\nstream\n`), image, Buffer.from('\nendstream')]),
  ];
  const chunks = [Buffer.from('%PDF-1.4\n')];
  const offsets = [0];
  for (let i=0;i<objects.length;i++) {
    offsets.push(Buffer.concat(chunks).length);
    chunks.push(Buffer.from(`${i+1} 0 obj\n`), objects[i]!, Buffer.from('\nendobj\n'));
  }
  const xref = Buffer.concat(chunks).length;
  chunks.push(Buffer.from(`xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`));
  const result = await readPdfBytes(new Uint8Array(Buffer.concat(chunks)));
  expect(state.create).toHaveBeenCalled();
  expect(result.text).toContain('Useful document text');
  expect(result.ocrBlocks).toBe(0);
  expect(result.images).toBe(1);
  // The lower-level rejection contract remains intact, including clearing
  // the failed worker slot so a subsequent real PDF import can recover.
  state.create.mockResolvedValueOnce({
    recognize: async () => ({data:{text:'Recovered image evidence',confidence:90}}),
    terminate: async () => {},
  });
  const recovered = await readPdfBytes(new Uint8Array(Buffer.concat(chunks)));
  expect(recovered.text).toContain('Useful document text');
  expect(recovered.text).toContain('Recovered image evidence');
  expect(recovered.ocrBlocks).toBe(1);
}, 20000);
