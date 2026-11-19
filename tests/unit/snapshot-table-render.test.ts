import { expect, it } from "vitest";
import { importSource } from "@/import/import-source";
import { renderBundle } from "@/render/render-bundle";

it("keeps table headers off the opening in every output while retaining source notes", () => {
  const raw = "# Renewals\n\n| Renewal | Amount |\n| --- | --- |\n| November 15, 2026 | Rs 649 |\n";
  const result = importSource({ raw, label: "renewals.md" });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const snapshot = result.value.blocks.find((block) => block.kind === "snapshot");
  expect(snapshot?.payload).toMatchObject({
    summary: "This set of notes pins down Renewals.",
    notes: expect.arrayContaining(["| Renewal | Amount |"]),
  });
  const bundle = renderBundle(result.value);
  for (const mode of ["web", "email", "document"] as const) {
    expect(bundle.outputs[mode].error).toBeNull();
    expect(bundle.outputs[mode].html).toContain("This set of notes pins down Renewals.");
    expect(bundle.outputs[mode].html).toContain("Rs 649");
  }
});
