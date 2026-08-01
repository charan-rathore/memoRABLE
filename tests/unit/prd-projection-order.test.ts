/**
 * PRD projection order: extract all → project → compress inside buckets.
 * Compression before routing merges User Stories into Decisions.
 */
import { describe, expect, it } from "vitest";
import { importSource } from "@/import/import-source";
import { classifyHeading } from "@/import/text/sections";
import {
  parseCasesRuleLine,
  parseOpenQuestionLine,
  parseUserStoryLine,
} from "@/import/text/patterns";
import type {
  ActionsPayload,
  DecisionsPayload,
  SignalsPayload,
  SnapshotPayload,
} from "@/domain/memory/schema";

const PRD_SAMPLE = `# Product Requirements Document

## Business Context
We are onboarding mid-market organizations with stricter compliance requirements.

## Key Requirements
- Complete edit history log showing timestamp and user name
- Auto-increment revision numbers (v1, v2, v3)

# Cases – Sheet
## Editability rules
- After PO creation, indent quantity cannot be reduced below the highest recorded quantity.
- Note: No changes are allowed once the contract is closed.
- Material removal allowed only when Not Delivered and No Payable recorded.
- Changes maintain backward compatibility with Indent statuses.

# User Stories & Acceptance Criteria
## 4.1 As a Purchase Manager
User Story: I want to see a complete edit history for every PO, including who made changes, when, and what was modified, so that I can maintain accountability during audits.

## Acceptance Criteria
- Edit history log displays: timestamp, user name, field changed

# Priority & Impact Matrix
| Priority | Feature | Business Impact |
| --- | --- | --- |
| P0 - Critical | PO Edit History & Audit Trail | High - Compliance |

# Open Questions
1. Should we limit the number of times a PO can be amended after approval?
2. What should be the default approval workflow for post-approval amendments?
`;

describe("PRD projection order + semantic layers", () => {
  it("routes Cases – Sheet headings to decisions", () => {
    expect(classifyHeading("Cases – Sheet")).toBe("decisions");
    expect(classifyHeading("Cases - Sheet (embedded spreadsheet)")).toBe("decisions");
    expect(classifyHeading("Open Questions")).toBe("signals");
    expect(classifyHeading("Acceptance Criteria")).toBe("decisions");
    expect(classifyHeading("User Stories & Acceptance Criteria")).toBe("actions");
    expect(classifyHeading("4.1 As a Purchase Manager")).toBe("actions");
  });

  it("parses user stories, cases rules, and open questions as first-class types", () => {
    const story = parseUserStoryLine(
      "User Story: I want to see a complete edit history for every PO so that I can audit changes.",
    );
    expect(story?.task).toMatch(/^User story:/i);
    expect(story?.status).toBe("pending");

    const rule = parseCasesRuleLine(
      "- After PO creation, indent quantity cannot be reduced below the highest recorded quantity.",
    );
    expect(rule?.text).toMatch(/cannot be reduced/i);
    expect(rule?.status).toBe("approved");
    expect(rule?.commitment).toBe("committed");

    const q = parseOpenQuestionLine(
      "1. Should we limit the number of times a PO can be amended after approval?",
    );
    expect(q?.label).toBe("Open question");
    expect(q?.implication).toMatch(/should we limit/i);
  });

  it("keeps stories, cases rules, and questions in distinct buckets after compress", () => {
    const result = importSource({ raw: PRD_SAMPLE, label: "prd-sample.md" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const doc = result.value;

    const decisions = doc.blocks.find((b) => b.kind === "decisions")!.payload as DecisionsPayload;
    const actions = doc.blocks.find((b) => b.kind === "actions")!.payload as ActionsPayload;
    const signals = doc.blocks.find((b) => b.kind === "signals")!.payload as SignalsPayload;
    const snapshot = doc.blocks.find((b) => b.kind === "snapshot")!.payload as SnapshotPayload;

    const decisionText = decisions.entries.map((e) => e.text).join("\n").toLowerCase();
    expect(decisionText).toMatch(/cannot be reduced|no changes are allowed/);
    // Cases rules must not vanish into snapshot notes only.
    const snapshotDump = `${snapshot.summary}\n${(snapshot.notes ?? []).join("\n")}`.toLowerCase();
    const casesOnlyInNotes =
      !/cannot be reduced|no changes are allowed/.test(decisionText) &&
      /cannot be reduced|no changes are allowed/.test(snapshotDump);
    expect(casesOnlyInNotes).toBe(false);

    const actionText = actions.entries.map((e) => e.task).join("\n").toLowerCase();
    expect(actionText).toMatch(/user story:\s*i want/);
    // Story must not be collapsed into a decision about edit history.
    expect(decisionText).not.toMatch(/user story:\s*i want/);

    const signalText = signals.entries
      .map((e) => `${e.label} ${e.implication ?? ""}`)
      .join("\n")
      .toLowerCase();
    expect(signalText).toMatch(/should we limit|default approval workflow/);

    expect(decisions.entries.every((e) => e.status && e.commitment)).toBe(true);
  });
});
