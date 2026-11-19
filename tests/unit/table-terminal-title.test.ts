import { expect, it } from "vitest";
import { parseTimelineLine } from "@/import/text/patterns";
it.each(["- shipped", "(done)"])("keeps recognized terminal state %s out of the title", (suffix) => {
  expect(parseTimelineLine(`| Build | November 14, 2026 | ${suffix}`)).toMatchObject({
    date: "November 14, 2026", title: "Build", state: suffix.includes("done") ? "done" : "shipped",
  });
});
it("keeps status words in ordinary closed cells", () => {
  expect(parseTimelineLine("| Build | November 14, 2026 | done |")).toMatchObject({title:"Build - done",state:"planned"});
});
it("keeps non-status parentheses in the title", () => {
  expect(parseTimelineLine("| Build | November 14, 2026 | (backend only)")).toMatchObject({title:"Build - (backend only)",state:"planned"});
});
