import { describe, expect, it } from "vitest";
import { parseTimelineLine } from "../../src/import/text/patterns";

describe("year-span line with a dash-form explicit state (Codex P2 on PR #102)", () => {
  it("an entire final dash segment that is a standalone state wins over the span", () => {
    const e = parseTimelineLine("- 2026–2028 Migration — shipped");
    expect(e?.date).toBe("2026–2028");
    expect(e?.title).toBe("Migration");
    expect(e?.state).toBe("shipped");
  });
  it("accepts an optional terminal period", () => {
    const e = parseTimelineLine("- 2026–2028 Migration — done.");
    expect(e?.title).toBe("Migration");
    expect(e?.state).toBe("done");
  });
  it("keeps negation prose in the title; the span speaks", () => {
    const e = parseTimelineLine("- 2026–2028 Migration — not shipped yet");
    expect(e?.title).toBe("Migration — not shipped yet");
    expect(e?.state).toBe("on-track");
  });
  it("keeps scoped prose in the title", () => {
    const e = parseTimelineLine("- 2026–2028 Migration — shipped (backend only)");
    expect(e?.title).toBe("Migration — shipped (backend only)");
    expect(e?.state).toBe("on-track");
  });
  it("keeps rollout prose in the title", () => {
    const e = parseTimelineLine("- 2026–2028 Docs — for planned rollout");
    expect(e?.title).toBe("Docs — for planned rollout");
    expect(e?.state).toBe("on-track");
  });
  it("still handles the parenthesized explicit state", () => {
    const e = parseTimelineLine("- 2019–2022 Migration (shipped)");
    expect(e?.title).toBe("Migration");
    expect(e?.state).toBe("shipped");
  });
});

describe("dash-state vocabulary sweep (anchored entire final segment)", () => {
  const cases: Array<[string, string]> = [
    ["shipped", "shipped"], ["released", "shipped"], ["launched", "shipped"], ["live", "shipped"],
    ["done", "done"], ["complete", "done"], ["completed", "done"], ["closed", "done"],
    ["on track", "on-track"], ["on-track", "on-track"], ["in progress", "on-track"], ["underway", "on-track"],
    ["planned", "planned"], ["upcoming", "planned"], ["scheduled", "planned"],
  ];
  for (const [label, expected] of cases) {
    it(`extracts "— ${label}" as ${expected}`, () => {
      const e = parseTimelineLine(`- 2026–2028 Migration — ${label}`);
      expect(e?.title).toBe("Migration");
      expect(e?.state).toBe(expected);
    });
    it(`extracts "— ${label}." with a terminal period`, () => {
      const e = parseTimelineLine(`- 2026–2028 Migration — ${label}.`);
      expect(e?.title).toBe("Migration");
      expect(e?.state).toBe(expected);
    });
  }
  it("anchors on the LAST dash segment of a multi-dash title", () => {
    const e = parseTimelineLine("- 2026–2028 Migration — phase 2 — shipped");
    expect(e?.title).toBe("Migration — phase 2");
    expect(e?.state).toBe("shipped");
  });
  it("matches case-insensitively", () => {
    const e = parseTimelineLine("- 2026–2028 Migration — Shipped");
    expect(e?.title).toBe("Migration");
    expect(e?.state).toBe("shipped");
  });
  it("does not strip a state word embedded in prose", () => {
    const e = parseTimelineLine("- 2026–2028 Migration — shipped last quarter");
    expect(e?.title).toBe("Migration — shipped last quarter");
    expect(e?.state).toBe("on-track");
  });
});
