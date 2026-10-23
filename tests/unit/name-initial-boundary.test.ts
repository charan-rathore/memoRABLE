/**
 * Narrowing follow-up to #77: a lone capital letter ends a real sentence
 * ("option A.", "Appendix A.") just as often as it marks a name initial
 * ("S. Iyer"). The guard must look at what FOLLOWS the initial: a common
 * sentence-starter means the period was a real boundary; anything else
 * (a name, another initial) means it was not.
 */
import { describe, expect, it } from "vitest";
import { splitSentences } from "@/understanding/language";

describe("name initial vs real boundary", () => {
  it("splits a sentence ending in a lone capital letter", () => {
    expect(splitSentences("He chose option A. The rest failed.")).toEqual([
      "He chose option A.",
      "The rest failed.",
    ]);
    expect(splitSentences("See Appendix A. It lists every fee.")).toEqual([
      "See Appendix A.",
      "It lists every fee.",
    ]);
  });

  it("splits every common label + letter boundary", () => {
    for (const label of ["Part", "Point", "Item", "Section", "Step", "Question", "Version"]) {
      expect(splitSentences(`${label} B. The next one moved on.`)).toEqual([
        `${label} B.`,
        "The next one moved on.",
      ]);
    }
  });

  it("splits a label + letter even when the next sentence opens with a name", () => {
    expect(splitSentences("Section A. Raman objected.")).toEqual([
      "Section A.",
      "Raman objected.",
    ]);
  });

  it("handles case variants of labels", () => {
    expect(splitSentences("OPTION A. THE REST FAILED.")).toEqual([
      "OPTION A.",
      "THE REST FAILED.",
    ]);
  });

  it("still keeps initials inside one sentence", () => {
    expect(splitSentences("Rent transfer to S. Iyer, Rs 28,000")).toEqual([
      "Rent transfer to S. Iyer, Rs 28,000",
    ]);
    expect(splitSentences("Met J. K. Rowling at the fair.")).toEqual([
      "Met J. K. Rowling at the fair.",
    ]);
    expect(splitSentences("A. P. J. Abdul Kalam spoke first.")).toEqual([
      "A. P. J. Abdul Kalam spoke first.",
    ]);
    expect(splitSentences("Donated to the R. K. Narayan memorial fund in May")).toEqual([
      "Donated to the R. K. Narayan memorial fund in May",
    ]);
  });

  it("keeps a line-start initial with its name", () => {
    expect(splitSentences("S. Iyer called. He left early.")).toEqual([
      "S. Iyer called.",
      "He left early.",
    ]);
  });

  it("degrades to the old behavior when a lone initial ends a real sentence", () => {
    expect(splitSentences("We waited for S. He arrived late.")).toEqual([
      "We waited for S.",
      "He arrived late.",
    ]);
  });

  it("keeps prior boundary and numeric behavior untouched", () => {
    expect(splitSentences("The rent is due. Pay by the 5th.")).toEqual([
      "The rent is due.",
      "Pay by the 5th.",
    ]);
    expect(splitSentences("Mr. Sharma called. He left early.")).toEqual([
      "Mr. Sharma called.",
      "He left early.",
    ]);
    // Existing decimal guard, unchanged by this fix: "Version 2." merges.
    expect(splitSentences("Version 2. The rollout continued.")).toEqual([
      "Version 2. The rollout continued.",
    ]);
    expect(splitSentences("Measure 3.5 cm. Then cut.")).toEqual([
      "Measure 3.5 cm.",
      "Then cut.",
    ]);
  });
});
