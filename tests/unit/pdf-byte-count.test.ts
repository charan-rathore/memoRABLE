import { expect, it, vi } from "vitest";

// A browser pdf.js worker receives ownership of data.buffer. The Node fake
// worker does not detach it, so exercise that boundary explicitly here.
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  getDocument: ({ data }: { data: Uint8Array }) => {
    structuredClone(data.buffer, { transfer: [data.buffer] });
    return {
      promise: Promise.resolve({
        numPages: 1,
        getPage: async () => ({
          getTextContent: async () => ({
            items: [{ str: "Useful document text", transform: [1, 0, 0, 1, 0, 0], width: 100, height: 12, hasEOL: true }],
          }),
          getOperatorList: async () => ({ fnArray: [], argsArray: [] }),
        }),
        destroy: async () => {},
      }),
    };
  },
  OPS: {},
}));

import { readPdfBytes } from "@/import/pdf/read-structured";

it.each([
  { name: "whole buffer", data: () => new Uint8Array(123) },
  { name: "offset view", data: () => new Uint8Array(new ArrayBuffer(300), 50, 123) },
])("preserves input byte count after transfer: $name", async ({ data: create }) => {
  const data = create();
  const result = await readPdfBytes(data, { skipOcr: true });
  expect(data.byteLength).toBe(0);
  expect(result.bytes).toBe(123);
  expect(result.text).toContain("Useful document text");
});
