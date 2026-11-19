import { describe, expect, it } from "vitest";
import { readRisk } from "@/understanding/inference";
import { importSource } from "@/import/import-source";

describe("consequence split never leaves a dangling auxiliary on the observation", () => {
  it("declines the split when a modal is stranded, keeping the whole literal", () => {
    const r = readRisk("Failure to comply will result in proceedings under the Rent Control Act");
    expect(r).not.toBeNull();
    expect(r!.risk).toBe("Failure to comply will result in proceedings under the Rent Control Act");
    expect(r!.consequence).toBeUndefined();
  });
  it("declines the split for a negated stranded modal, never asserting the opposite", () => {
    const r = readRisk("The export may not result in lost drafts during migration");
    expect(r).not.toBeNull();
    expect(r!.risk).toBe("The export may not result in lost drafts during migration");
    expect(r!.consequence).toBeUndefined();
  });
  it("keeps an observation with no stranded auxiliary untouched", () => {
    const r = readRisk("Two suppliers missed delivery windows resulting in penalty fees");
    expect(r).not.toBeNull();
    expect(r!.risk).toBe("Two suppliers missed delivery windows");
  });
  it("renders the legal-notice problem as the whole literal", () => {
    const r = importSource({
      raw: "# Legal Notice\n\nFailure to comply will result in proceedings under the Rent Control Act. Mitigation: vacate on time [high]\n",
      label: "x.md",
    });
    if (!r.ok) throw new Error("import failed");
    const snap = r.value.blocks.find((b) => b.kind === "snapshot");
    const problem = snap && "problem" in snap.payload ? (snap.payload.problem as string) : undefined;
    expect(problem).toBe("Failure to comply will result in proceedings under the Rent Control Act");
  });
});

describe("hedged consequences keep the source's uncertainty", () => {
  it("never renders 'could result in' as a definite causing", () => {
    const r = readRisk("The rollout could result in data loss for regional users");
    expect(r).not.toBeNull();
    expect(r!.risk).toBe("The rollout could result in data loss for regional users");
    expect(r!.consequence).toBeUndefined();
  });
  it("never renders 'may result in' as a definite causing", () => {
    const r = readRisk("Missing backups may result in permanent data loss");
    expect(r).not.toBeNull();
    expect(r!.risk).toBe("Missing backups may result in permanent data loss");
    expect(r!.consequence).toBeUndefined();
  });
});

describe("contracted stranded modals also decline the split", () => {
  it.each([
    "Missing backups won't result in data loss",
    "Regular snapshots can't result in lost drafts",
    "The backup couldn’t result in partial restores",
    "The mirror wouldn't result in stale reads",
    "The archive mustn't result in exposed keys",
  ])("keeps the whole literal: %s", (sentence) => {
    const r = readRisk(sentence);
    expect(r).not.toBeNull();
    expect(r!.risk).toBe(sentence);
    expect(r!.consequence).toBeUndefined();
  });
});
