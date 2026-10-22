/**
 * An open question is unresolved by the author's own words.
 *
 * In a cache RFC, "Open question: should search indexes share the same
 * version tag?" was remembered as a COMMITTED decision - the one status an
 * open question cannot have. And under "## Trade-offs", "Write-through
 * invalidation adds roughly 4 ms per price update" became a pending action
 * because the work-verb pattern matched the "write" inside the cache term
 * "write-through". A cost observation is not a todo.
 */
import { describe, expect, it } from "vitest";
import { importSource } from "@/import/import-source";

const rfc = `# RFC: Catalog cache invalidation

## Proposal
- Invalidate product entries on every price write
- Keep list pages at a 60-second TTL

## Trade-offs
- Write-through invalidation adds roughly 4 ms per price update
- Read-through keeps miss latency at one extra hop
- Open question: should search indexes share the same version tag?

## Action items
- [ ] Write the migration guide for the new cache keys
`;

type DecisionEntry = { text: string; commitment?: string };
type ActionEntry = { task: string; status?: string };

function blocks(raw: string) {
  const result = importSource({ raw, label: "rfc.md" });
  if (!result.ok) throw new Error("import failed");
  const find = (kind: string) => result.value.blocks.find((b) => b.kind === kind);
  return {
    decisions: (find("decisions")?.payload as { entries?: DecisionEntry[] } | undefined)?.entries ?? [],
    actions: (find("actions")?.payload as { entries?: ActionEntry[] } | undefined)?.entries ?? [],
    snapshotNotes: (find("snapshot")?.payload as { notes?: string[] } | undefined)?.notes ?? [],
  };
}

describe("open questions", () => {
  it("never becomes a decision, committed or otherwise", () => {
    const { decisions } = blocks(rfc);
    expect(decisions.some((e) => /version tag/.test(e.text))).toBe(false);
  });

  it("keeps the question text preserved", () => {
    const { snapshotNotes, actions } = blocks(rfc);
    const kept =
      snapshotNotes.some((n) => /version tag/.test(n)) ||
      actions.some((a) => /version tag/.test(a.task));
    expect(kept).toBe(true);
  });
});

describe("cache terms that start with work verbs", () => {
  it("does not read 'write-through invalidation' as the work verb 'write'", () => {
    const { actions } = blocks(rfc);
    expect(actions.some((a) => /Write-through invalidation/.test(a.task))).toBe(false);
    expect(actions.some((a) => /Read-through keeps/.test(a.task))).toBe(false);
  });

  it("still reads a real write task as an action", () => {
    const { actions } = blocks(rfc);
    expect(actions.some((a) => /migration guide/.test(a.task))).toBe(true);
  });
});
