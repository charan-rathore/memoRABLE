import { describe, expect, it } from "vitest";
import { VectorIndex } from "@/search/vector";
describe("malformed embedding boundaries", () => {
  for (const quantize of [false, true]) {
    it("rejects invalid vectors without corrupting the index (quantize=" + quantize + ")", () => {
      const index = new VectorIndex(2, quantize);
      index.upsert("approved", [1, 0]);
      expect(() => index.upsert("corrupt", [NaN, 1])).toThrow();
      expect(() => index.upsert("approved", [Infinity, 1])).toThrow();
      expect(index.size).toBe(1);
      expect(() => index.search([1], 1)).toThrow();
      expect(() => index.search([NaN, 1], 1)).toThrow();
      expect(index.search([1, 0], 0)).toEqual([]);
      expect(index.search([1, 0], 1)[0]?.id).toBe("approved");
    });
  }
});
