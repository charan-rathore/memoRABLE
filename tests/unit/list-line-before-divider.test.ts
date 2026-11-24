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

describe("a list line directly before a --- divider is not a setext heading", () => {
  it("keeps the last task before the divider", () => {
    const d = doc("# T\n\n## Action Items\n- [ ] Email the vendor\n- [ ] Book the venue\n---\n");
    const tasks = entries(d, "actions").map((e) => e.task);
    expect(tasks).toEqual(["Email the vendor", "Book the venue"]);
  });

  it("keeps a lone task before the divider", () => {
    const d = doc("# T\n\n## Action Items\n- [ ] Email the vendor\n---\n");
    expect(entries(d, "actions").map((e) => e.task)).toEqual(["Email the vendor"]);
  });

  it("keeps the bullet decision before the divider", () => {
    const d = doc("# T\n\n## Decisions\n- Use Postgres for the store\n---\n");
    expect(entries(d, "decisions").map((e) => e.text)).toEqual(["Use Postgres for the store"]);
  });

  it("keeps tasks on both sides of the divider in the same section", () => {
    const d = doc("# T\n\n## Action Items\n- [ ] Email the vendor\n---\n- [ ] Book the venue\n");
    expect(entries(d, "actions").map((e) => e.task)).toEqual(["Email the vendor", "Book the venue"]);
  });

  it("matchHeading refuses a list item as setext text but keeps a plain line", () => {
    expect(matchHeading("- [ ] Email the vendor", "---")).toBeNull();
    expect(matchHeading("- Use Postgres", "---")).toBeNull();
    expect(matchHeading("1. First step", "---")).toBeNull();
    expect(matchHeading("Some intro words", "---")).toEqual({ text: "Some intro words", level: 2 });
  });
});

describe("other block opener lines before a divider", () => {
  it("matchHeading refuses a blockquote or fence line as setext text", () => {
    expect(matchHeading("> quoted note", "---")).toBeNull();
    expect(matchHeading("```ts", "---")).toBeNull();
  });
});
