import { describe, expect, it } from "vitest";
import { importSource } from "@/import/import-source";

/**
 * A table-led document put its raw table header row into the snapshot
 * summary ("| Phase | Deliverable | Deadline |"), which the published
 * cover renders verbatim. Table rows are structure, not prose: the
 * document opening must skip them, fall back to the honest composed
 * summary, and keep the raw rows in the notes where nothing is lost.
 */
function snapshotOf(raw: string, label: string) {
  const r = importSource({ raw, label });
  expect(r.ok).toBe(true);
  if (!r.ok) return null;
  const b = r.value.blocks.find((x) => x.kind === "snapshot");
  return (b?.payload ?? null) as { summary?: string; notes?: string[] } | null;
}

describe("the document opening never reads a table row as prose", () => {
  it("skips a table header row under a claimed timeline section", () => {
    const raw = "# Launch Plan\n\n## Timeline\n\n| Phase | Deliverable | Deadline |\n| --- | --- | --- |\n| 1 | Wireframes | November 14, 2026 |\n";
    expect(snapshotOf(raw, "plan.md")?.summary).toBe("This plan pins down Launch Plan.");
  });

  it("skips a table header row in an unclaimed section and keeps the rows as notes", () => {
    const raw = "# Renewals\n\n| Renewal | Amount |\n| --- | --- |\n| November 15, 2026 | Rs 649 |\n| December 2, 2026 | Rs 119 |\n";
    const snap = snapshotOf(raw, "renewals.md");
    expect(snap?.summary).toBe("This set of notes pins down Renewals.");
    expect(snap?.notes).toContain("| Renewal | Amount |");
    expect(snap?.notes).toContain("| November 15, 2026 | Rs 649 |");
  });

  it("skips a table header row under a claimed actions section", () => {
    const raw = "# Launch Plan\n\n## Actions\n\n| Task | Owner | Due |\n| --- | --- | --- |\n| Book venue | Meera | November 14, 2026 |\n";
    expect(snapshotOf(raw, "plan.md")?.summary).toBe("This plan pins down Launch Plan.");
  });

  it("preserves ordinary pipe prose as the opening (bitwise, shell pipeline)", () => {
    // A lone "|" inside prose is not a table: the opening must keep it.
    const raw = "# Masks\n\nUse a | b for the mask in the filter step of this pipeline.\n";
    expect(snapshotOf(raw, "masks.md")?.summary).toBe("Use a | b for the mask in the filter step of this pipeline");
    const shell = "# Logs\n\nStart with cat app.log | grep ERROR to triage the deploy failure quickly.\n";
    expect(snapshotOf(shell, "logs.md")?.summary).toBe("Start with cat app.log | grep ERROR to triage the deploy failure quickly");
  });

  it("preserves pipe prose ahead of a real table block", () => {
    const raw = "# Renewals\n\nTrack cost | renewal pairs for the household this quarter here.\n\n| Renewal | Amount |\n| --- | --- |\n| November 15, 2026 | Rs 649 |\n";
    expect(snapshotOf(raw, "renewals.md")?.summary).toBe("Track cost | renewal pairs for the household this quarter here");
  });

  it("publisher counterexamples: bitwise, absolute value, inline pipeline survive verbatim", () => {
    // Parent-observed expectations: prose is preserved; the inline-code
    // case keeps the pipe but drops backticks (pre-existing markup
    // stripping, not this packet).
    expect(snapshotOf("# Operator Notes\n\nThe bitwise operator a | b combines flags.\n", "operators.md")?.summary)
      .toContain("The bitwise operator a | b combines flags");
    expect(snapshotOf("# Operator Notes\n\nThe expression |x| gives the absolute value.\n", "operators.md")?.summary)
      .toContain("The expression |x| gives the absolute value");
    expect(snapshotOf("# Operator Notes\n\n`cat file | grep term` filters the log.\n", "operators.md")?.summary)
      .toContain("cat file | grep term filters the log");
  });

  it("keeps a real prose opening ahead of a table", () => {
    const raw = "# Renewals\n\nThese are the renewals we track for the household this quarter.\n\n| Renewal | Amount |\n| --- | --- |\n| November 15, 2026 | Rs 649 |\n";
    expect(snapshotOf(raw, "renewals.md")?.summary).toBe(
      "These are the renewals we track for the household this quarter",
    );
  });
});
