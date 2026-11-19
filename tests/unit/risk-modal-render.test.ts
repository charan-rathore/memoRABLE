import { expect, it } from "vitest";
import { readRisk } from "@/understanding/inference";
import { importSource } from "@/import/import-source";
import { renderBundle } from "@/render/render-bundle";

it.each([
  "Missing backups might result in permanent data loss",
  "Regional migration should not result in stale reads",
  "The export cannot result in lost drafts",
])("retains the modal and negation through all output modes: %s", (sentence) => {
  const result = importSource({ raw: `# Migration Risks\n\n${sentence}.\n`, label: "migration.md" });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const risks = result.value.blocks.find((block) => block.kind === "risks");
  expect(risks?.payload).toMatchObject({ entries: expect.arrayContaining([
    expect.objectContaining({ risk: sentence }),
  ]) });
  const bundle = renderBundle(result.value);
  for (const mode of ["web", "email", "document"] as const) {
    expect(bundle.outputs[mode].error).toBeNull();
    expect(bundle.outputs[mode].html).toContain(sentence);
  }
});

it("keeps a factual consequence split", () => {
  expect(readRisk("Two suppliers missed delivery windows resulting in penalty fees")).toMatchObject({
    risk: "Two suppliers missed delivery windows",
    consequence: "Penalty fees",
  });
});
