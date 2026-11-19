import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { importSource } from "@/import/import-source";
import { renderBundle } from "@/render/render-bundle";

const description = "Client analytics and campaign decision support";
for (const header of [
  `Acme Analytics Senior Product Analyst January 2024 – Present ${description}`,
  `Acme Analytics | Senior Product Analyst January 2024 – Present ${description}`,
]) describe(`flattened resume role ${header.includes("|") ? "with" : "without"} pipe`, () => {
  it("retains trailing role prose and following accomplishments through actual import/render", () => {
    const raw = readFileSync("tests/fixtures/resume-columnar.md", "utf8").replace("Acme Analytics | Senior Product Analyst, Growth January 2024 – Present Client analytics and campaign decision support", header);
    const result = importSource({ raw, label: "resume.md" });
    if (!result.ok) throw new Error("resume import failed");
    const block = result.value.blocks.find((block) => block.kind === "timeline");
    if (!block || !("entries" in block.payload)) throw new Error("missing timeline");
    const role = block.payload.entries.find((entry) => "title" in entry && entry.title.includes("Acme Analytics"));
    expect(role).toMatchObject({ date: "January 2024 – Present", details: [description, "Cut reporting errors by 22% by diagnosing funnel dropoffs across 3 critical stages", "Lifted dashboard adoption by 14% across 5 teams using automated quality checks"] });
    const bundle = renderBundle(result.value);
    for (const mode of ["email", "web", "document"] as const) {
      expect(bundle.outputs[mode].error).toBeNull();
      expect(bundle.outputs[mode].html).toContain(description);
      expect(bundle.outputs[mode].html).toContain("Cut reporting errors");
    }
  });
});
