import { describe, expect, it } from "vitest";
import { importSource } from "@/import/import-source";
import type { DecisionsPayload } from "@/domain/memory/schema";
import { renderBundle } from "@/render/render-bundle";

function decision(text: string) {
  const result = importSource({ raw: `# Board report\n\n## Decision\n- ${text}\n`, label: "board-report.md" });
  if (!result.ok) throw new Error("import failed");
  const block = result.value.blocks.find((block) => block.kind === "decisions");
  const entries = (block?.payload as DecisionsPayload | undefined)?.entries ?? [];
  return { entry: entries.find((entry) => entry.text.includes("hiring freeze")), document: result.value };
}

describe("source-stated board rejection", () => {
  for (const actor of ["The board", "The team", "The committee", "Leadership"]) {
    it(`keeps ${actor.toLowerCase()}'s explicit rejection in actual import`, () => {
      const { entry, document } = decision(`${actor} rejected a hiring freeze through December.`);
      expect(entry).toMatchObject({ status: "rejected" });
      expect(entry?.commitment).not.toBe("committed");
      const outputs = renderBundle(document).outputs;
      for (const mode of ["web", "email", "document"] as const) {
        expect(outputs[mode].html).toContain("Rejected");
        expect(outputs[mode].html).not.toMatch(/>\s*Considered\s*</);
      }
    });
  }

  for (const text of [
    "The board did not reject a hiring freeze through December.",
    "The board never rejected a hiring freeze through December.",
    "If the board rejected a hiring freeze, the plan would change.",
    "The board might have rejected a hiring freeze through December.",
    "The board reportedly rejected a hiring freeze through December.",
    "Did the board reject a hiring freeze through December?",
    "The board rejected a hiring freeze?",
    "The board has not yet rejected a hiring freeze through December.",
    "The board considered whether leadership rejected a hiring freeze.",
    "The board rejected neither a hiring freeze nor layoffs.",
    "The board rejected no hiring freeze through December.",
    "The board rejected a hiring freeze, but subsequently approved it.",
    "The board rejected a hiring freeze and later approved it.",
    "The board rejected a hiring freeze before reinstating it.",
    "The board rejected a hiring freeze, although the rejection was later overturned.",
    "The board rejected a hiring freeze pending a final vote.",
    "The board rejected nothing about a hiring freeze.",
    "The board rejected a hiring freeze without final authorization.",
    "The board rejected a hiring freeze subject to a later vote.",
    "The board rejected a hiring freeze only if revenue falls.",
  ]) {
    it(`does not invent rejection for ${text}`, () => {
      const { entry, document } = decision(text);
      const outputs = renderBundle(document).outputs;
      expect(entry?.status).not.toBe("rejected");
      for (const mode of ["web", "email", "document"] as const) {
        expect(outputs[mode].html).not.toMatch(/>\s*Rejected\s*</);
      }
    });
  }
});
