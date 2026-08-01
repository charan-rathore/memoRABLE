/**
 * Conversation strip + signal/decision stance rendering.
 */
import { describe, expect, it } from "vitest";
import { importSource } from "@/import/import-source";
import { renderBundle } from "@/render/render-bundle";
import type { MemoryDocument } from "@/domain/memory/schema";

const SAMPLE = `# Spec

## Key Requirements
- Complete edit history log showing timestamp and user — committed
- Auto-increment revision numbers — considered

# Open Questions
1. Should we limit the number of times a PO can be amended after approval?
2. What should be the default approval workflow for post-approval amendments?

## Success Metrics
- Accountability: 100% of edits traceable to specific users
`;

function docOf(): MemoryDocument {
  const result = importSource({ raw: SAMPLE, label: "stance-sample.md" });
  if (!result.ok) throw new Error("import failed");
  return result.value;
}

describe("publication render — conversation, open questions, decision stance", () => {
  it("does not repeat identical Signals informs Decisions lines", () => {
    const html = renderBundle(docOf()).outputs.web.html;
    const matches = html.match(/informs/gi) ?? [];
    // At most a handful of distinct conversation links — never four identical block-level lines.
    const repeatedBlockLine = html.match(/Signals informs Decisions/g) ?? [];
    expect(repeatedBlockLine.length).toBeLessThanOrEqual(1);
    expect(matches.length).toBeLessThanOrEqual(6);
  });

  it("puts open-question implication text inside the signal card", () => {
    const html = renderBundle(docOf()).outputs.web.html;
    expect(html).toMatch(/Should we limit the number of times a PO can be amended/i);
    expect(html).toMatch(/default approval workflow/i);
    // Label is chrome; the question body must also appear.
    expect(html).toMatch(/Open question/i);
  });

  it("renders decision stance as Proposed / committed, not PROPOSED · COMMITTED wrap", () => {
    const html = renderBundle(docOf()).outputs.web.html;
    expect(html).toMatch(/Proposed\s*\/\s*committed/i);
    expect(html).not.toMatch(/PROPOSED\s*·\s*COMMITTED/);
  });
});
