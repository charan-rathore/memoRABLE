import { describe, expect, it } from "vitest";
import { importSource } from "@/import/import-source";
import { matchHeading } from "@/import/text/sections";

function doc(raw: string) {
  const r = importSource({ raw, label: "d.md" });
  if (!r.ok) throw new Error("import failed");
  return r.value;
}
function entries(d: ReturnType<typeof doc>, kind: string) {
  const b = d.blocks.find((x) => x.kind === kind);
  return ((b?.payload as { entries?: Array<Record<string, unknown>> })?.entries) ?? [];
}

describe("a glyph-marked item directly before a --- divider is not a setext heading", () => {
  it("keeps the check-glyph task before the divider", () => {
    const d = doc("# T\n\n## Action Items\n✓ Send the invoice\n---\n");
    expect(entries(d, "actions").map((e) => e.task)).toEqual(["Send the invoice"]);
  });

  it("keeps the arrow-marked task before the divider", () => {
    const d = doc("# T\n\n## Action Items\n→ Follow up with legal\n---\n");
    expect(entries(d, "actions").map((e) => e.task)).toEqual(["Follow up with legal"]);
  });

  it("matchHeading refuses a glyph item as setext text", () => {
    expect(matchHeading("✓ Send the invoice", "---")).toBeNull();
    expect(matchHeading("→ Use Postgres", "===")).toBeNull();
    expect(matchHeading("Some intro words", "---")).toEqual({ text: "Some intro words", level: 2 });
  });
});
