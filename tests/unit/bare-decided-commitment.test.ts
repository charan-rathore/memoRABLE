import { describe, expect, it } from "vitest";
import { importSource } from "@/import/import-source";

function decisions(raw: string) {
  const r = importSource({ raw, label: "d.md" });
  if (!r.ok) throw new Error("import failed");
  const block = r.value.blocks.find((b) => b.kind === "decisions");
  return ((block?.payload as { entries: Array<{ text: string; commitment: string }> })?.entries) ?? [];
}

describe("a decision line that states it was decided is committed", () => {
  it("keeps 'Decided to ...' and 'We decided to ...' on the same commitment", () => {
    const [bare] = decisions("# T\n\n## Decisions\n- Decided to use Postgres\n");
    const [subject] = decisions("# T\n\n## Decisions\n- We decided to use Postgres\n");
    expect(subject?.commitment).toBe("committed");
    expect(bare?.commitment).toBe("committed");
  });

  it("treats 'Agreed to / Agreed:' as committed", () => {
    const entries = decisions("# T\n\n## Decisions\n- Agreed to ship Friday\n- Agreed: freeze scope\n");
    expect(entries.map((e) => e.commitment)).toEqual(["committed", "committed"]);
  });

  it("still reads hedged or questioning lines as considered", () => {
    const entries = decisions("# T\n\n## Decisions\n- Maybe decided to use Redis\n- Could use MySQL for analytics\n");
    expect(entries.every((e) => e.commitment === "considered")).toBe(true);
  });
});

describe("bare decided lines keep hedge precedence", () => {
  it("does not commit questioned, conditional, pending, reversed or disagreeing lines", () => {
    const lines = [
      "Decided to use Postgres?",
      "Agreed to ship Friday if QA passes",
      "Decided to use Postgres unless costs rise",
      "Agreed to use Postgres, pending approval",
      "Decided to use Postgres (reversed later)",
      "Agreed to disagree",
      "Decided to reconsider caching",
    ];
    const raw = `# T\n\n## Decisions\n${lines.map((l) => `- ${l}`).join("\n")}\n`;
    const entries = decisions(raw);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => e.commitment === "considered")).toBe(true);
  });
});
