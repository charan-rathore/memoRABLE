import { expect, it } from "vitest";
import { parseTimelineLine, titleAroundRemovedDate } from "@/import/text/patterns";

it("keeps a surviving dot-prefixed name separate on direct and public routes", () => {
  const raw = "Move to March 2026 .NET SDK requirements";
  expect({
    direct: titleAroundRemovedDate(raw, raw.indexOf("March"), "March 2026".length),
    parsed: parseTimelineLine(raw)?.title,
  }).toEqual({ direct: "Move .NET SDK requirements", parsed: "Move .NET SDK requirements" });
});

it("still joins a standalone sentence period after date removal", () => {
  expect(parseTimelineLine("Pay rent on November 1, 2026.")?.title).toBe("Pay rent.");
});
