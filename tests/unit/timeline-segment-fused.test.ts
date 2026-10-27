import { describe, expect, it } from "vitest";
import { importSource } from "@/import/import-source";

/**
 * Publisher-bounded prototype: timeline-local segmentation of an ALREADY
 * ADMITTED fused statement at completed calendar-date terminals. Every
 * segment must independently pass the unchanged gates; every original word
 * survives segmentation; the original fused date must survive among the
 * replacement dates; ANY gap means the entire fused entry stays
 * byte-identical. Nothing outside the timeline lane changes.
 */
function timelineOf(raw: string) {
  const r = importSource({ raw, label: "probe.md" });
  expect(r.ok).toBe(true);
  if (!r.ok) return [];
  const t = r.value.blocks.find((b) => b.kind === "timeline");
  return ((t?.payload as { entries?: { date: string; title: string; state: string }[] } | undefined)?.entries ?? []);
}
function decisionsOf(raw: string) {
  const r = importSource({ raw, label: "probe.md" });
  if (!r.ok) return [];
  const d = r.value.blocks.find((b) => b.kind === "decisions");
  return ((d?.payload as { entries?: { text: string }[] } | undefined)?.entries ?? []).map((e) => e.text);
}
function snapshotOf(raw: string) {
  const r = importSource({ raw, label: "probe.md" });
  if (!r.ok) return {} as { summary?: string; hook?: string; goal?: string };
  const s = r.value.blocks.find((b) => b.kind === "snapshot");
  return (s?.payload ?? {}) as { summary?: string; hook?: string; goal?: string };
}

describe("timeline-local segmentation of admitted fused statements", () => {
  it("passport: two self-qualified date sentences become two clean entries", () => {
    const entries = timelineOf("# Passport Renewal\n\nThe passport renewal is due February 14, 2027. The tatkaal conversion is due November 3, 2026.\n");
    expect(entries).toEqual([
      { date: "February 14, 2027", title: "The passport renewal is due.", state: "planned" },
      { date: "November 3, 2026", title: "The tatkaal conversion is due.", state: "planned" },
    ]);
  });

  it("retain-all: a lost qualifier falls the whole entry back byte-identical", () => {
    // "before"/"after" survive in the fused title; per-segment admission
    // strips them as date lead-ins, so segmentation must not happen.
    for (const qualifier of ["before", "after"]) {
      const entries = timelineOf(`# Passport Renewal\n\nThe passport renewal is due February 14, 2027. The tatkaal conversion is due ${qualifier} November 3, 2026.\n`);
      expect(entries).toEqual([
        {
          date: "February 14, 2027",
          title: `The passport renewal is due. The tatkaal conversion is due ${qualifier} November 3, 2026.`,
          state: "planned",
        },
      ]);
    }
  });

  it("conditions and negation survive segmentation", () => {
    const conditional = timelineOf("# Passport Renewal\n\nThe passport renewal is due February 14, 2027. If the visa is rejected, the tatkaal conversion is due November 3, 2026.\n");
    expect(conditional).toEqual([
      { date: "February 14, 2027", title: "The passport renewal is due.", state: "planned" },
      { date: "November 3, 2026", title: "If the visa is rejected, the tatkaal conversion is due.", state: "planned" },
    ]);
    const negated = timelineOf("# Passport Renewal\n\nThe passport renewal is due February 14, 2027. The tatkaal conversion is not due November 3, 2026.\n");
    expect(negated).toEqual([
      { date: "February 14, 2027", title: "The passport renewal is due.", state: "planned" },
      { date: "November 3, 2026", title: "The tatkaal conversion is not due.", state: "planned" },
    ]);
  });

  it("ELSS: a non-delivery segment keeps the whole fused entry byte-identical", () => {
    const entries = timelineOf("# Source Notes\n\nELSS lock-in for the tranche ends March 31, 2027. Redemption requests before 3:00 PM get same-day NAV.\n");
    expect(entries).toEqual([
      { date: "March 31, 2027", title: "ELSS lock-in for the tranche ends. Redemption requests before 3:00 PM get same-day NAV.", state: "planned" },
    ]);
  });

  it("transport: a non-delivery segment keeps the fused entry byte-identical", () => {
    const entries = timelineOf("# Source Notes\n\nTransport fee Rs 3,500 per month, billed quarterly next January 2, 2027. Late fee Rs 50 per day after the due date.\n");
    expect(entries).toEqual([
      { date: "January 2, 2027", title: "Transport fee Rs 3,500 per month, billed quarterly next. Late fee Rs 50 per day after the due date.", state: "planned" },
    ]);
  });

  it("medicine: a non-delivery segment keeps the fused entry byte-identical", () => {
    const entries = timelineOf("# Source Notes\n\nThe medical course of prescribed medicine ends October 31, 2026. Call if swelling persists after November 2, 2026.\n");
    expect(entries).toEqual([
      { date: "October 31, 2026", title: "The medical course of prescribed medicine ends. Call if swelling persists after November 2, 2026.", state: "planned" },
    ]);
  });

  it("daycare: a paid segment keeps the fused entry byte-identical", () => {
    const entries = timelineOf("# Daycare Fees\n\nFees for November were paid October 28, 2026. The December invoice arrives around November 28, 2026 and is due December 5, 2026.\n");
    expect(entries).toEqual([
      { date: "October 28, 2026", title: "Fees for November were paid. The December invoice arrives around November 28, 2026 and is due December 5, 2026.", state: "planned" },
    ]);
  });

  it("May-5 person: decisions, goal and hook stay byte-identical", () => {
    const raw = "# Source Notes\n\nWe decided to finally ask May 5. She confirmed the detailed plan with everyone.\n";
    expect(decisionsOf(raw)).toEqual(["We decided to finally ask May 5. She confirmed the detailed plan with everyone"]);
    const s = snapshotOf(raw);
    expect(s.goal).toBe("Finally ask May 5. She confirmed the detailed plan with everyone");
    expect(s.hook).toBe("Primary goal: Finally ask May 5. She confirmed the detailed plan with everyone.");
  });

  it("adversarial: terminal exclamation or question force falls back byte-identical", () => {
    const entries = timelineOf("# Passport Renewal\n\nThe passport renewal is due February 14, 2027. The tatkaal conversion is due November 3, 2026?\n");
    expect(entries).toEqual([
      {
        date: "February 14, 2027",
        title: "The passport renewal is due. The tatkaal conversion is due November 3, 2026?",
        state: "planned",
      },
    ]);
  });

  it("adversarial: a leading condition on a non-final segment falls back byte-identical", () => {
    // "If the visa is rejected" may scope both sentences; pinning it to the
    // first entry would present the tatkaal entry as unconditional.
    const entries = timelineOf("# Passport Renewal\n\nIf the visa is rejected, the passport renewal is due February 14, 2027. The tatkaal conversion is due November 3, 2026.\n");
    expect(entries).toEqual([
      {
        date: "February 14, 2027",
        title: "If the visa is rejected, the passport renewal is due. The tatkaal conversion is due November 3, 2026.",
        state: "planned",
      },
    ]);
  });

  it("adversarial: a condition inside the final segment stays attached to its own entry", () => {
    const entries = timelineOf("# Passport Renewal\n\nThe passport renewal is due February 14, 2027. If the visa is rejected, the tatkaal conversion is due November 3, 2026.\n");
    expect(entries[1]).toEqual({
      date: "November 3, 2026",
      title: "If the visa is rejected, the tatkaal conversion is due.",
      state: "planned",
    });
  });

  it("adversarial: a segment title over the admission clamp falls back byte-identical", () => {
    // The tail segment only admits through the mid-sentence branch, which
    // clamps titles to 24 words; the lost words must veto segmentation.
    const longTail = Array.from({ length: 26 }, (_, i) => `requirement${i}`).join(" ");
    const line = `The passport renewal is due February 14, 2027. The board reviews ${longTail} on November 3, 2026 with the committee.`;
    const entries = timelineOf(`# Passport Renewal\n\n${line}\n`);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.date).toBe("February 14, 2027");
    expect(entries[0]!.title).toContain("board reviews");
  });

  it("publisher probe: 'Only if' leading a non-final segment falls back byte-identical", () => {
    const entries = timelineOf("# Passport Renewal\n\nOnly if the visa is rejected, the passport renewal is due February 14, 2027. The tatkaal conversion is due November 3, 2026.\n");
    expect(entries).toEqual([
      {
        date: "February 14, 2027",
        title: "Only if the visa is rejected, the passport renewal is due. The tatkaal conversion is due November 3, 2026.",
        state: "planned",
      },
    ]);
  });

  it("publisher probe: 'In case' leading a non-final segment falls back byte-identical", () => {
    const entries = timelineOf("# Passport Renewal\n\nIn case the visa is rejected, the passport renewal is due February 14, 2027. The tatkaal conversion is due November 3, 2026.\n");
    expect(entries).toEqual([
      {
        date: "February 14, 2027",
        title: "In case the visa is rejected, the passport renewal is due. The tatkaal conversion is due November 3, 2026.",
        state: "planned",
      },
    ]);
  });

  it("publisher probe: a trailing 'only if' keeps the whole fused entry together", () => {
    const entries = timelineOf("# Passport Renewal\n\nThe passport renewal is due February 14, 2027 only if approved. The tatkaal conversion is due November 3, 2026.\n");
    expect(entries).toHaveLength(1);
    expect(entries[0]!.title).toContain("only if approved");
  });

  it("publisher probe: a combining mark survives segmentation exactly", () => {
    const entries = timelineOf("# Passport Renewal\n\nThe renewal for Cafe\u0301 is due February 14, 2027. The tatkaal conversion is due November 3, 2026.\n");
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      date: "February 14, 2027",
      title: "The renewal for Cafe\u0301 is due.",
    });
  });

  it("a fused statement with no date-terminal boundary is untouched", () => {
    const entries = timelineOf("# Notes\n\nUse version 2. It fixes the crash reported by the whole team last week.\n");
    expect(entries).toEqual([]);
  });
});
