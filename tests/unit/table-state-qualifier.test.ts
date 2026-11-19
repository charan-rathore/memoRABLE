import { expect, it } from "vitest";
import { parseTimelineLine } from "@/import/text/patterns";
import { importSource } from "@/import/import-source";
import { renderBundle } from "@/render/render-bundle";
it.each([
  ["- shipped backend only", "Build - - shipped backend only", "shipped"],
  ["(done backend only)", "Build - (done backend only)", "done"],
  ["- shipped after review", "Build - - shipped after review", "shipped"],
  ["(shipped backend only)", "Build - (shipped backend only)", "shipped"],
])("retains the substantive qualifier in %s", (suffix, title, state) => {
  const row = `| Build | November 14, 2026 | ${suffix}`;
  expect.soft(parseTimelineLine(row)).toMatchObject({ title, state });
  const result = importSource({ raw: `# Build Plan\n\n## Timeline\n\n${row}\n`, label: "build.md" });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect.soft(result.value.blocks.find((block) => block.kind === "timeline")?.payload).toMatchObject({
    entries: expect.arrayContaining([expect.objectContaining({ title, state })]),
  });
  const bundle = renderBundle(result.value);
  for (const mode of ["web", "email", "document"] as const) {
    expect(bundle.outputs[mode].error).toBeNull();
    expect.soft(bundle.outputs[mode].html).toContain(title);
  }
});

it("retains an artifact-bearing suffix in the payload and rendered output", () => {
  const raw = "# Build Plan\n\n## Timeline\n\n| Build | November 14, 2026 | - shipped requires schema review\n";
  const result = importSource({ raw, label: "build.md" });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect.soft(result.value.blocks.find((block) => block.kind === "timeline")?.payload).toMatchObject({
    entries: expect.arrayContaining([expect.objectContaining({
      title: "Build - - shipped requires schema review", state: "shipped", requires: "Schema review",
    })]),
  });
  const bundle = renderBundle(result.value);
  for (const mode of ["web", "email", "document"] as const) {
    expect(bundle.outputs[mode].error).toBeNull();
    expect.soft(bundle.outputs[mode].html).toContain("shipped requires schema review");
  }
});
