import { describe, expect, it } from "vitest";
import { validateDesignJson } from "@/render/compatibility";

const validDesign = {
  counters: { u_row: 1, u_column: 2, u_content_text: 1 },
  schemaVersion: 24,
  body: {
    rows: [
      {
        cells: [1, 1],
        columns: [
          { contents: [{ type: "heading", values: {} }], values: {} },
          { contents: [{ type: "text", values: {} }, { type: "divider", values: {} }], values: {} },
        ],
        values: {},
      },
    ],
    values: {},
  },
};

describe("validateDesignJson", () => {
  it("accepts a well-formed design", () => {
    const result = validateDesignJson(validDesign);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.rowCount).toBe(1);
      expect(result.value.columnCount).toBe(2);
      expect(result.value.contentCount).toBe(3);
      expect(result.value.contentTypes).toEqual(["divider", "heading", "text"]);
    }
  });

  it("rejects non-objects and missing body.rows", () => {
    expect(validateDesignJson(null).ok).toBe(false);
    expect(validateDesignJson("x").ok).toBe(false);
    expect(validateDesignJson({ schemaVersion: 24, body: {} }).ok).toBe(false);
  });

  it("rejects rows without columns", () => {
    const bad = structuredClone(validDesign);
    (bad.body.rows[0] as Record<string, unknown>).columns = undefined;
    const result = validateDesignJson(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]!.path).toBe("body.rows[0]");
  });

  it("rejects unknown content types with an exact path", () => {
    const bad = structuredClone(validDesign);
    ((bad.body.rows[0]!.columns[1] as { contents: { type: string }[] }).contents[0]!).type = "crypto-miner";
    const result = validateDesignJson(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]!.path).toBe("body.rows[0].columns[1].contents[0]");
      expect(result.errors[0]!.message).toContain("crypto-miner");
    }
  });
});
