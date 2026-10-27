import { describe, expect, it } from "vitest";
import { importSource } from "@/import/import-source";
import { parseObligationDateLine } from "@/import/text/patterns";

function snapshotOf(raw: string) {
  const r = importSource({ raw, label: "probe.md" });
  if (!r.ok) throw new Error("import failed");
  const snap = r.value.blocks.find((b) => b.kind === "snapshot");
  const timeline = r.value.blocks.find((b) => b.kind === "timeline");
  return { snap, timeline };
}

describe("PR91 review repairs (Codex P2s, publisher-verified on exact heads)", () => {
  it("keeps pronoun-led stated requirements as the goal, in their own words", () => {
    const { snap } = snapshotOf("# Requirements\n\nWe must encrypt all stored customer records.\n");
    expect(snap && "goal" in snap.payload ? snap.payload.goal : "").toBe(
      "We must encrypt all stored customer records",
    );
  });

  it("keeps team-led stated requirements as the goal", () => {
    const { snap } = snapshotOf("# Requirements\n\nThe team must retain access logs for seven years.\n");
    expect(snap && "goal" in snap.payload ? snap.payload.goal : "").toBe(
      "The team must retain access logs for seven years",
    );
  });

  it("still keeps system-led requirements (regression guard)", () => {
    const { snap } = snapshotOf("# Requirements\n\nThe system must encrypt all stored customer records.\n");
    expect(snap && "goal" in snap.payload ? snap.payload.goal : "").toBe(
      "The system must encrypt all stored customer records",
    );
  });

  it("still rejects shaky pronoun-led claims that state no requirement", () => {
    const { snap } = snapshotOf("# Plans\n\nWe will probably ship next month.\n");
    expect(snap && "goal" in snap.payload ? snap.payload.goal : "").toBeFalsy();
  });

  it("reads modal 'May' as a modal, not a month: the real date survives", () => {
    const { timeline } = snapshotOf("# Invoice\n\nPayment due: May be extended to November 10, 2026\n");
    const entries = (
      timeline && "entries" in timeline.payload ? timeline.payload.entries : []
    ) as Array<{ date: string; title: string }>;
    expect(entries).toHaveLength(1);
    expect(entries[0]!.date).toBe("November 10, 2026");
    expect(entries[0]!.title).toContain("May");
  });

  it("parseObligationDateLine keeps the full calendar date over a modal head", () => {
    const v = parseObligationDateLine("Payment due: May be extended to November 10, 2026");
    expect(v?.date).toBe("November 10, 2026");
  });

  it("keeps the head-date shortcut for unambiguous calendar heads", () => {
    const v = parseObligationDateLine("Date: 2 December 2026 and 3 December 2026");
    expect(v?.date).toBe("2 December 2026");
  });

  it("never surfaces an unbounded opening as the summary", () => {
    const long = Array.from({ length: 140 }, (_, i) => `detail${i}`).join(" ");
    const { snap } = snapshotOf(
      `# Project Notes\n\n${long}.\n\n## Risks\n\nThe deployment may fail because the upstream service is unavailable.\n`,
    );
    const summary = snap && "summary" in snap.payload ? String(snap.payload.summary) : "";
    expect(summary.split(/\s+/).length).toBeLessThanOrEqual(24);
    expect(summary).not.toContain("detail30");
  });
});

describe("PR91 review repairs v2 - publisher boundary probes", () => {
  const noGoal = (line: string) => {
    const { snap } = snapshotOf(`# Requirements\n\n${line}\n`);
    expect(snap && "goal" in snap.payload ? snap.payload.goal : "").toBeFalsy();
  };
  it("rejects a negated requirement as a goal", () =>
    noGoal("We must not encrypt customer records unless legal counsel authorizes the migration."));
  it("rejects a hedged requirement as a goal", () =>
    noGoal("We probably must encrypt customer records before launch."));
  it("rejects a tentative might-decide line", () =>
    noGoal("We might decide that the system must encrypt customer records."));
  it("rejects a negated decision mentioning a requirement", () =>
    noGoal("We decided not to require that the team must encrypt all stored records."));
  it("rejects a hedged promise mentioning a requirement", () =>
    noGoal("We will probably decide whether the system must retain customer records."));
  it("rejects a reader instruction", () => noGoal("You must provide your passport before the appointment."));
  it("keeps an affirmative shall requirement", () => {
    const { snap } = snapshotOf("# Requirements\n\nWe shall retain access logs for seven years.\n");
    expect(snap && "goal" in snap.payload ? snap.payload.goal : "").toBe(
      "We shall retain access logs for seven years",
    );
  });
  it("never cuts a conditional opening mid-condition", () => {
    const first =
      "The team is authorized to publish the customer report with all supporting financial records and technical appendices only after legal counsel has signed the written approval";
    const { snap } = snapshotOf(
      `# Project Notes\n\n${first}.\n\n## Risks\n\nThe deployment may fail because the upstream service is unavailable.\n`,
    );
    const summary = snap && "summary" in snap.payload ? String(snap.payload.summary) : "";
    expect(summary).not.toMatch(/\.\.\.$/);
    expect(summary.includes("only after legal counsel")).toBe(summary.includes("signed the written approval"));
  });
});
