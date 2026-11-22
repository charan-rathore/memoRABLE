import { describe, expect, it } from "vitest";
import { importSource } from "@/import/import-source";
import type { DecisionsPayload } from "@/domain/memory/schema";

function decisions(raw: string) {
  const result = importSource({ raw, label: "d.md" });
  if (!result.ok) throw new Error("import failed");
  const block = result.value.blocks.find((b) => b.kind === "decisions");
  return ((block?.payload as DecisionsPayload | undefined)?.entries ?? []).map((e) => e.text);
}

describe("decisions keep the order the source states them", () => {
  it("a numbered list is not reordered when some lines are read by inference", () => {
    const out = decisions("# D\n\n## Decisions\n1. Use Postgres\n2. Ship Nov 14\n3. Hire two engineers\n");
    expect(out).toEqual(["Use Postgres", "Ship Nov 14", "Hire two engineers"]);
  });
  it("explicit 'Decided to' bullets stay in order", () => {
    const out = decisions("# D\n\n## Decisions\n- Decided to use Postgres\n- Decided to ship on Nov 14\n- Decided to hire two engineers\n");
    expect(out).toEqual(["Decided to use Postgres", "Decided to ship on Nov 14", "Decided to hire two engineers"]);
  });
});
