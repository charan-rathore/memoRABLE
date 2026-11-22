import { describe, expect, it } from "vitest";
import { importSource } from "@/import/import-source";
import type { SignalsPayload } from "@/domain/memory/schema";

function signals(raw: string) {
  const result = importSource({ raw, label: "q.md" });
  if (!result.ok) throw new Error("import failed");
  const block = result.value.blocks.find((b) => b.kind === "signals");
  return (block?.payload as SignalsPayload | undefined)?.entries ?? [];
}

describe("a question the source answers is not an open question", () => {
  it("paren (answered: ...) keeps the line with an Answered question label", () => {
    const entries = signals("# Q\n\n## Questions\n- Which region first? (answered: EU in Q3)\n");
    const entry = entries.find((e) => e.implication?.includes("Which region first"));
    expect(entry).toMatchObject({ label: "Answered question" });
    expect(entry!.implication).toContain("(answered: EU in Q3)");
  });
  it("dash '- answered: ...' keeps the line with an Answered question label", () => {
    const entries = signals("# Q\n\n## Questions\n- What drives churn? - answered: pricing tiers\n");
    const entry = entries.find((e) => e.implication?.includes("What drives churn"));
    expect(entry).toMatchObject({ label: "Answered question" });
    expect(entry!.implication).toContain("answered: pricing tiers");
  });
  it("paren (resolved: ...) uses the source word", () => {
    const entries = signals("# Q\n\n## Questions\n- Should we shard the events table? (resolved: no, single table holds)\n");
    const entry = entries.find((e) => e.implication?.includes("Should we shard"));
    expect(entry).toMatchObject({ label: "Resolved question" });
  });
  it("(unanswered) is still an open question", () => {
    const entries = signals("# Q\n\n## Questions\n- Which region first? (unanswered)\n");
    const entry = entries.find((e) => e.implication?.includes("Which region first"));
    expect(entry).toMatchObject({ label: "Open question" });
  });
  it("a plain question stays an open question", () => {
    const entries = signals("# Q\n\n## Questions\n- Which region should we expand to first?\n");
    const entry = entries.find((e) => e.implication?.includes("Which region"));
    expect(entry).toMatchObject({ label: "Open question" });
  });
  it("an answered marker does not invent a measured value", () => {
    const entries = signals("# Q\n\n## Questions\n- Which region first? (answered: EU in Q3)\n");
    const entry = entries.find((e) => e.implication?.includes("Which region first"));
    expect(entry!.value).toBeUndefined();
  });
});
