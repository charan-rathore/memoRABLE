import { describe, expect, it } from "vitest";
import { importSource } from "@/import/import-source";
import type { RisksPayload } from "@/domain/memory/schema";
import { parseRiskLine, parseRiskLineLenient } from "@/import/text/patterns";

function risks(raw: string) {
  const result = importSource({ raw, label: "r.md" });
  if (!result.ok) throw new Error("import failed");
  const block = result.value.blocks.find((b) => b.kind === "risks");
  return (block?.payload as RisksPayload | undefined)?.entries ?? [];
}

describe("risk table header row is furniture, not a risk", () => {
  it("header row does not become a risk entry; data row still parses", () => {
    const entries = risks("# R\n\n## Risks\n| Risk | Severity | Mitigation |\n| --- | --- | --- |\n| Support backlog could hurt retention | high | add weekend rotation |\n");
    expect(entries.some((e) => e.risk.includes("| Risk |"))).toBe(false);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ risk: "Support backlog could hurt retention", severity: "high", mitigation: "add weekend rotation" });
  });
  it("header row with impact/likelihood vocabulary is also furniture", () => {
    const entries = risks("# R\n\n## Risks\n| Risk | Impact | Likelihood |\n| --- | --- | --- |\n| Vendor onboarding could stall launches (high): earlier kickoff\n");
    expect(entries.some((e) => e.risk.includes("| Risk |"))).toBe(false);
  });
  it("a real risk whose text starts with the word Risk still parses", () => {
    const entries = risks("# R\n\n## Risks\n- Risk of outage during migration (high): stage the cutover\n");
    const entry = entries.find((e) => e.risk.includes("Risk of outage"));
    expect(entry).toMatchObject({ severity: "high", mitigation: "stage the cutover" });
  });
  it("a single-column line containing pipes is not furniture", () => {
    const entries = risks("# R\n\n## Risks\n- Support backlog | could hurt retention (high): add weekend rotation\n");
    expect(entries.length).toBeGreaterThan(0);
  });
});

describe("lenient length boundary unchanged", () => {
  it("lenient drops a pipe row over 300 chars, exactly as on base; strict still parses it via collect", () => {
    const long = "Support backlog could hurt retention " + "and churn compounds weekly ".repeat(12);
    const raw = `| ${long} | high | add weekend rotation |`;
    expect(parseRiskLineLenient(raw)).toBeNull();
    expect(parseRiskLine(raw)).not.toBeNull();
  });
});
