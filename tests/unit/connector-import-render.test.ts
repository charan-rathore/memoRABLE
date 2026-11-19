import { expect, it } from "vitest";
import { importSource } from "@/import/import-source";
import { parseTimelineLine, titleAroundRemovedDate } from "@/import/text/patterns";
import { renderBundle } from "@/render/render-bundle";

it("preserves the surviving service condition through import and all output modes", () => {
  const raw = "# Service Plan\n\n## Timeline\n\n- KA-05-MN-4821: the next service is due at 20,000 km or December 2026, whichever is earlier.\n";
  const result = importSource({ raw, label: "service.md" });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const timeline = result.value.blocks.find((block) => block.kind === "timeline");
  expect(timeline?.payload).toMatchObject({ entries: expect.arrayContaining([
    expect.objectContaining({ date: "December 2026", title: "KA-05-MN-4821: the next service is due at 20,000 km, whichever is earlier." }),
  ]) });
  const bundle = renderBundle(result.value);
  for (const mode of ["web", "email", "document"] as const) {
    expect(bundle.outputs[mode].error).toBeNull();
    expect(bundle.outputs[mode].html).toContain("20,000 km, whichever is earlier.");
  }
});

it.each(["and", "or", "nor", "for"])("keeps %s when it governs surviving text", (connector) => {
  const raw = `Move ${connector} March 2026 pricing`;
  expect(titleAroundRemovedDate(raw, raw.indexOf("March"), "March 2026".length)).toBe(`Move ${connector} pricing`);
});

it("does not remove an interior conjunction", () => {
  expect(parseTimelineLine("- Pay rent and utilities on November 1, 2026.")?.title).toBe("Pay rent and utilities.");
});
