import { describe, expect, it } from "vitest";
import { importSource } from "@/import/import-source";
import type { DecisionsPayload } from "@/domain/memory/schema";
import { renderBundle } from "@/render/render-bundle";

function decisions(lines: string[]) {
  const raw = `# Board report\n\n## Decision\n${lines.map((l) => `- ${l}`).join("\n")}\n`;
  const result = importSource({ raw, label: "board-report.md" });
  if (!result.ok) throw new Error("import failed");
  const block = result.value.blocks.find((b) => b.kind === "decisions");
  return { entries: (block?.payload as DecisionsPayload | undefined)?.entries ?? [], document: result.value };
}

const AFFIRMATIVE = "The board rejected a hiring freeze through December.";
const REVERSED = "The board rejected a hiring freeze, but subsequently approved it.";
const NEGATED = "The board did not reject a hiring freeze through December.";
const REVOKED = "The board rejected a hiring freeze before reinstating it.";
const CONDITIONAL = "If the board rejected a hiring freeze, the plan would change.";
const REPHRASED = "The board rejected the proposed hiring freeze.";

function expectBadge(document: Parameters<typeof renderBundle>[0], want: boolean) {
  const outputs = renderBundle(document).outputs;
  for (const mode of ["web", "email", "document"] as const) {
    if (want) expect(outputs[mode].html).toMatch(/>\s*Rejected\s*</);
    else expect(outputs[mode].html).not.toMatch(/>\s*Rejected\s*</);
  }
}

describe("merged decision keeps status honest to surviving text", () => {
  it("affirmative then reversed: merged entry is not labelled rejected", () => {
    const { entries, document } = decisions([AFFIRMATIVE, REVERSED]);
    const merged = entries.filter((e) => e.text.includes("hiring freeze"));
    expect(merged).toHaveLength(1);
    expect(merged[0]?.status).not.toBe("rejected");
    expectBadge(document, false);
  });

  it("reversed then affirmative: merged entry is not labelled rejected", () => {
    const { entries, document } = decisions([REVERSED, AFFIRMATIVE]);
    const merged = entries.filter((e) => e.text.includes("hiring freeze"));
    expect(merged).toHaveLength(1);
    expect(merged[0]?.status).not.toBe("rejected");
    expectBadge(document, false);
  });

  it("affirmative then revoked: merged entry is not labelled rejected", () => {
    const { entries, document } = decisions([AFFIRMATIVE, REVOKED]);
    const merged = entries.filter((e) => e.text.includes("hiring freeze"));
    expect(merged).toHaveLength(1);
    expect(merged[0]?.status).not.toBe("rejected");
    expectBadge(document, false);
  });

  it("affirmative then conditional: merged entry is not labelled rejected", () => {
    const { entries, document } = decisions([AFFIRMATIVE, CONDITIONAL]);
    const merged = entries.filter((e) => e.text.includes("hiring freeze"));
    expect(merged).toHaveLength(1);
    expect(merged[0]?.status).not.toBe("rejected");
    expectBadge(document, false);
  });

  it("exact duplicate affirmative lines stay rejected", () => {
    const { entries, document } = decisions([AFFIRMATIVE, AFFIRMATIVE]);
    const merged = entries.filter((e) => e.text.includes("hiring freeze"));
    expect(merged).toHaveLength(1);
    expect(merged[0]?.status).toBe("rejected");
    expectBadge(document, true);
  });

  it("rephrased affirmative restatements agree and stay rejected", () => {
    const { entries, document } = decisions([AFFIRMATIVE, REPHRASED]);
    const merged = entries.filter((e) => e.text.includes("hiring freeze"));
    expect(merged).toHaveLength(1);
    expect(merged[0]?.status).toBe("rejected");
    expectBadge(document, true);
  });

  it("keeps the status when the surviving phrasing states it", () => {
    const { entries, document } = decisions(["Hiring freeze.", AFFIRMATIVE]);
    const merged = entries.filter((e) => e.text.includes("hiring freeze"));
    expect(merged).toHaveLength(1);
    expect(merged[0]?.status).toBe("rejected");
    expectBadge(document, true);
  });

  it("negated plus affirmative: surviving negated text is not labelled rejected", () => {
    const { entries, document } = decisions([NEGATED, AFFIRMATIVE]);
    const merged = entries.filter((e) => e.text.includes("hiring freeze"));
    expect(merged).toHaveLength(1);
    expect(merged[0]?.status).not.toBe("rejected");
    expectBadge(document, false);
  });
});
