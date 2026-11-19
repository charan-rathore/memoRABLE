import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { importSource } from "@/import/import-source";
import { layoutToMarkdown, type LayoutLine } from "@/import/pdf/layout";
import { renderBundle } from "@/render/render-bundle";
import type { TimelinePayload } from "@/domain/memory/schema";

function imported(raw: string) {
  const result = importSource({ raw, label: "probe.md" });
  if (!result.ok) throw new Error("import failed");
  return result.value;
}
function timeline(raw: string) {
  const document = imported(raw);
  const block = document.blocks.find((block) => block.kind === "timeline");
  return (block?.payload as TimelinePayload | undefined)?.entries ?? [];
}

describe("PR126 source-fidelity review regressions", () => {
  it("retains the fused source when deduplication would lose a negated same-date sibling", () => {
    const entries = timeline("# Passport Renewal\n\nThe passport renewal is due February 14, 2027. The passport renewal is not due February 14, 2027.\n");
    expect(entries).toEqual([{
      date: "February 14, 2027",
      title: "The passport renewal is due. The passport renewal is not due February 14, 2027.",
      state: "planned",
    }]);
  });

  it("still splits independent date claims when all siblings survive deduplication", () => {
    const entries = timeline("# Passport Renewal\n\nThe passport renewal is due February 14, 2027. The visa application is due March 15, 2027.\n");
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.title)).toEqual([
      "The passport renewal is due.", "The visa application is due.",
    ]);
  });

  it("carries an unheaded resume role's description through actual import and classic rendering", () => {
    const fixture = readFileSync("tests/fixtures/resume-columnar.md", "utf8");
    const description = "Client analytics and campaign decision support";
    const role = `Senior Engineer, Acme January 2022 – December 2023 ${description}`;
    const raw = fixture.replace("alex@example.com | +91 9000000000 | alex-example", `alex@example.com | +91 9000000000 | alex-example\n\n${role}`);
    const document = imported(raw);
    const block = document.blocks.find((block) => block.kind === "timeline");
    const entries = (block?.payload as TimelinePayload | undefined)?.entries ?? [];
    expect(entries.find((entry) => entry.title === "Senior Engineer, Acme")).toMatchObject({ details: [description] });
    const outputs = renderBundle(document).outputs;
    for (const mode of ["web", "email", "document"] as const) {
      expect(outputs[mode].error).toBeNull();
      expect(outputs[mode].html).toContain("Senior Engineer, Acme");
      expect(outputs[mode].html).toContain(description);
    }
  });

  for (const option of ["--dry-run", "--full-index", "-full-index", "--no-color"]) {
    it(`preserves literal PDF bullet option ${option} through layout and import`, () => {
      const line: LayoutLine = {
        text: `• Run git clean ${option} before removing build artifacts.`,
        page: 1, y: 0, fontSize: 10, heading: false,
        headingLevel: null, tableRow: false, cells: [],
      };
      const raw = layoutToMarkdown([{ page: 1, bodySize: 10, lines: [line] }]);
      expect(raw).toContain(option);
      expect(JSON.stringify(imported(raw).blocks)).toContain(option);
    });
  }
});
