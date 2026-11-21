import { describe, expect, it } from "vitest";
import { importSource } from "@/import/import-source";
import type { RisksPayload } from "@/domain/memory/schema";

function risks(raw: string) {
  const result = importSource({ raw, label: "risk-report.md" });
  if (!result.ok) throw new Error("import failed");
  const block = result.value.blocks.find((b) => b.kind === "risks");
  return (block?.payload as RisksPayload | undefined)?.entries ?? [];
}

describe("negated severity must not surface (negation-only fix)", () => {
  it("(not high) suffix keeps verbatim risk with no severity", () => {
    const entries = risks("# R\n\n## Risks\n- Support backlog could hurt retention (not high): add weekend rotation\n");
    const entry = entries.find((e) => e.risk.includes("Support backlog"));
    expect(entry).toBeDefined();
    expect(entry!.severity).toBeUndefined();
    expect(entry!.risk).toContain("(not high)");
  });
  it("(not low) suffix keeps verbatim risk with no severity", () => {
    const entries = risks("# R\n\n## Risks\n- Vendor onboarding could stall launches (not low): earlier kickoff\n");
    const entry = entries.find((e) => e.risk.includes("Vendor onboarding"));
    expect(entry).toBeDefined();
    expect(entry!.severity).toBeUndefined();
    expect(entry!.risk).toContain("(not low)");
  });
  it("affirmative (high) still parses to severity high", () => {
    const entries = risks("# R\n\n## Risks\n- Support backlog could hurt retention (high): add weekend rotation\n");
    const entry = entries.find((e) => e.risk.includes("Support backlog"));
    expect(entry).toMatchObject({ severity: "high", mitigation: "add weekend rotation" });
  });
  it("affirmative (med) still normalizes to medium", () => {
    const entries = risks("# R\n\n## Risks\n- Hiring pace may slow delivery (med): revisit plan\n");
    const entry = entries.find((e) => e.risk.includes("Hiring pace"));
    expect(entry).toMatchObject({ severity: "medium" });
  });
});

describe("negated table severity (RED on base)", () => {
  it("table cell 'not high' keeps risk+mitigation with severity omitted", () => {
    const entries = risks("# R\n\n## Risks\n| Risk | Severity | Mitigation |\n| --- | --- | --- |\n| Support backlog could hurt retention | not high | add weekend rotation |\n");
    const entry = entries.find((e) => e.risk.includes("Support backlog"));
    expect(entry).toBeDefined();
    expect(entry!.risk).toBe("Support backlog could hurt retention");
    expect(entry!.severity).toBeUndefined();
    expect(entry!.mitigation).toBe("add weekend rotation");
  });
});
