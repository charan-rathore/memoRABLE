/**
 * A name initial is not the end of a sentence.
 *
 * "October 12: Rent transfer to S. Iyer, Rs 28,000" split at "S." and the
 * timeline memory read "Rent transfer to S." - the payee and the amount
 * gone from the event a person would search for later. Single-letter
 * initials (S. Iyer, R. K. Narayan) join mr/dr/prof in the do-not-split
 * set: a period after one capital letter does not end the thought.
 */
import { describe, expect, it } from "vitest";
import { importSource } from "@/import/import-source";
import { splitSentences } from "@/understanding/language";

const statement = `# HDFC Bank — Statement for October 2026

Account: 50100448291. Period: October 1 to October 31, 2026.

## Transactions
- October 12: Rent transfer to S. Iyer, Rs 28,000
- October 18: Amazon order, Rs 3,499
`;

describe("name initials", () => {
  it("keeps 'S. Iyer' inside one sentence", () => {
    const sentences = splitSentences("Rent transfer to S. Iyer, Rs 28,000");
    expect(sentences).toEqual(["Rent transfer to S. Iyer, Rs 28,000"]);
  });

  it("keeps chained initials together", () => {
    const sentences = splitSentences("Donated to the R. K. Narayan memorial fund in May");
    expect(sentences).toEqual(["Donated to the R. K. Narayan memorial fund in May"]);
  });

  it("timeline title keeps the payee and amount", () => {
    const result = importSource({ raw: statement, label: "statement.md" });
    if (!result.ok) throw new Error("import failed");
    const block = result.value.blocks.find((b) => b.kind === "timeline");
    const entries = (block?.payload as { entries?: Array<{ date: string; title: string }> } | undefined)?.entries ?? [];
    const rent = entries.find((e) => /Rent transfer/.test(e.title));
    expect(rent, "rent transaction missing from timeline").toBeDefined();
    expect(rent!.title).toContain("Iyer");
    expect(rent!.title).toContain("28,000");
  });

  it("still splits real sentence boundaries", () => {
    expect(splitSentences("Mr. Sharma called. He left early.")).toEqual([
      "Mr. Sharma called.",
      "He left early.",
    ]);
    expect(splitSentences("The rent is due. Pay by the 5th.")).toEqual([
      "The rent is due.",
      "Pay by the 5th.",
    ]);
  });
});
