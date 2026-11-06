import { describe, expect, it } from "vitest";
import { importSource } from "../../src/import/import-source";
import { renderMode } from "../../src/render/render-bundle";
import { UMBREX_GUIDANCE_PACK } from "../../src/understanding/market-research/guidance-pack";

const SOURCE = `# Acme EV charging market brief

Acme wants to decide whether to enter the Indian DC fast-charging market in 2027.

## Snapshot

The Indian EV fleet is growing quickly. Charging operators Tata Power and Statiq run public networks.

## Key numbers

- Public DC fast chargers in India: roughly 12,000 (2025, industry estimate)
- Acme target: 500 chargers in 3 years

## Plan

- Phase 1: pilot 50 highway chargers by mid-2027
`;

const GAP = "No step-qualified content identified in this source - research needed.";

describe("market-research output mode", () => {
  const imported = importSource({ raw: SOURCE, label: "acme-brief.md" });
  if (!imported.ok) throw new Error("fixture import failed");
  const doc = imported.value;
  const out = renderMode(doc, "market-research", "editorial", SOURCE);

  it("renders without error and produces html and valid design JSON", () => {
    expect(out.error).toBeNull();
    expect(out.html).toBeTruthy();
    expect(out.designJsonError).toBeNull();
  });

  it("contains every standing-method step title from the guidance pack", () => {
    for (const step of UMBREX_GUIDANCE_PACK) {
      expect(out.html).toContain(step.title);
    }
  });

  it("shows the explicit missing-input state on every step - never invented coverage", () => {
    const count = out.html!.split(GAP).length - 1;
    expect(count).toBe(UMBREX_GUIDANCE_PACK.length);
  });

  it("does not present source figures as step inputs while relevance is unqualified", () => {
    // The fixture's own numbers must not appear anywhere in the prep pack:
    // auto-mapping excerpts to steps is deliberately off (see renderer doc).
    expect(out.html).not.toContain("12,000");
    expect(out.html).not.toContain("500 chargers");
    expect(out.html).not.toContain("Tata Power");
  });

  it("does not present an invoice's figures as market inputs (relevance regression)", () => {
    const inv = importSource({ raw: `# Invoice INV-2044\n\n## Line items\n- Seats - $12,000\n\nSubtotal: $15,500\nAmount due: $15,500\n`, label: "inv.md" });
    if (!inv.ok) throw new Error("invoice fixture failed");
    const o = renderMode(inv.value, "market-research", "editorial");
    expect(o.error).toBeNull();
    expect(o.html).not.toContain("$15,500");
    expect(o.html).not.toContain("$12,000");
  });

  it("does not present a research paper's claims as market inputs (relevance regression)", () => {
    const paper = importSource({ raw: `# Sparse Attention Study\n\n## Hypothesis\nRetention preserves quality above 92% of dense attention.\n\n## Results\nLearned-sparse attention reduced inference time by 41%.\n`, label: "paper.md" });
    if (!paper.ok) throw new Error("paper fixture failed");
    const o = renderMode(paper.value, "market-research", "editorial");
    expect(o.error).toBeNull();
    expect(o.html).not.toContain("92%");
    expect(o.html).not.toContain("41%");
  });

  it("discloses provenance: umbrex.com links, retrieval date, illustrative-example ban", () => {
    expect(out.html).toContain("umbrex.com");
    expect(out.html).toContain("2026-11-06");
    expect(out.html!.toLowerCase()).toContain("illustrative");
  });

  it("labels guidance as guidance and never shows playbook example figures as data", () => {
    expect(out.html).toMatch(/[Gg]uidance/);
    expect(out.html).not.toContain("75 million");
    expect(out.html).not.toContain("EV battery startup engaged");
  });

  it("states it is preparation, not a completed market study", () => {
    expect(out.html).toContain("preparation, not a completed market study");
  });

  it("survives malformed documents without throwing (regression)", () => {
    const cases: unknown[] = [
      [{ id: "b1", kind: "signals", payload: { entries: null } }],
      [{ id: "b1", kind: "snapshot", payload: null }],
      [],
    ];
    for (const blocks of cases) {
      const o = renderMode({ ...doc, blocks } as never, "market-research", "editorial");
      expect(o.error).toBeNull();
      expect(o.html).toContain(GAP);
    }
  });
});
