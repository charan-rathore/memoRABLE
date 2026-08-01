import { describe, expect, it } from "vitest";
import { importSource } from "@/import/import-source";
import { isDecisionChrome, sameDecision } from "@/understanding/language";
import type { DecisionsPayload } from "@/domain/memory/schema";

describe("decision compression inside the Decisions bucket", () => {
  it("treats Key Requirements and Acceptance Criteria restatements as the same decision", () => {
    expect(
      sameDecision(
        "'Edited On' and 'Edited By' columns visible in list views",
        "'Edited On' and 'Edited By' columns visible in PO list view",
      ),
    ).toBe(true);
    expect(
      sameDecision(
        "Auto-increment revision numbers (v1, v2, v3)",
        "Revision number auto-increments with each edit (v1, v2, v3...)",
      ),
    ).toBe(true);
    expect(
      sameDecision(
        "Preserve linked advances during edits",
        "Linked advances remain intact after edits",
      ),
    ).toBe(true);
    expect(
      sameDecision(
        "Approval workflow for post-approval amendments (configurable)",
        "Edits trigger configurable approval workflow",
      ),
    ).toBe(true);
  });

  it("rejects Business Impact chrome as a decision", () => {
    expect(isDecisionChrome("Business Impact")).toBe(true);
    expect(isDecisionChrome("Complete edit history log")).toBe(false);
  });

  it("merges restated requirements from a PRD sample into one entry each", () => {
    const sample = `# Spec
## Key Requirements
- 'Edited On' and 'Edited By' columns visible in list views
- Auto-increment revision numbers (v1, v2, v3)
- Preserve linked advances during edits
- Approval workflow for post-approval amendments (configurable)

## Acceptance Criteria
- 'Edited On' and 'Edited By' columns visible in PO list view
- Revision number auto-increments with each edit (v1, v2, v3...)
- Linked advances remain intact after edits
- Edits trigger configurable approval workflow

## Priority & Impact Matrix
| Priority | Feature | Business Impact |
| --- | --- | --- |
| P0 - Critical | Audit Trail | High |
`;
    const result = importSource({ raw: sample, label: "dedupe.md" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const decisions = result.value.blocks.find((b) => b.kind === "decisions")!
      .payload as DecisionsPayload;
    expect(decisions.entries.filter((e) => /edited on/i.test(e.text))).toHaveLength(1);
    expect(decisions.entries.filter((e) => /revision number|auto-increment/i.test(e.text))).toHaveLength(1);
    expect(decisions.entries.filter((e) => /linked advances/i.test(e.text))).toHaveLength(1);
    expect(decisions.entries.filter((e) => /approval workflow/i.test(e.text))).toHaveLength(1);
    expect(decisions.entries.some((e) => /^business impact$/i.test(e.text.trim()))).toBe(false);
  });
});
