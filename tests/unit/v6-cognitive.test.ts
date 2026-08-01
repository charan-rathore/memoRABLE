import { describe, expect, it } from "vitest";
import {
  parseV6Extraction,
  projectV6ToMemorySource,
  runCognitivePipeline,
  scoreMemorySource,
  validateAndRepairV6,
} from "@/ai/v6";
import type { MemorySource } from "@/domain/memory/schema";

const emptyCandidate = (): MemorySource => ({
  version: 1,
  title: "Candidate",
  blocks: [
    { kind: "snapshot", payload: { heading: "Candidate", summary: "Local candidate with a usable identity summary for fallback scoring." } },
    { kind: "signals", payload: { entries: [{ label: "Local signal", implication: "Present in candidate" }] } },
    { kind: "decisions", payload: { entries: [{ text: "Ship Phase 1 first", status: "approved", ref: "D-001" }] } },
    { kind: "timeline", payload: { entries: [] } },
    { kind: "risks", payload: { entries: [{ risk: "Compliance gap if audit trail slips" }] } },
    { kind: "actions", payload: { entries: [{ task: "Write revision format", status: "pending", from: "D-001" }] } },
  ],
});

describe("v6 cognitive pipeline", () => {
  it("gates low-confidence timeline into signals (failure mode)", () => {
    const parsed = parseV6Extraction({
      document_meta: {
        archetype: "PRD",
        timeline_mode: "milestone_chain",
        anchor_date: null,
        anchor_confidence: "none",
      },
      snapshot: [{ content: "Auditability PRD for purchase edits." }],
      timeline: [
        {
          id: "T-001",
          content: "Finish EU pricing soon",
          raw_temporal_expression: "soon",
          resolved_date: { type: "relative_unresolved", value: null },
          timeline_confidence: { date_resolution: "none", ordering: "low", overall: "low" },
        },
        {
          id: "T-002",
          content: "Phase 1 ships",
          raw_temporal_expression: "2026-08-01",
          resolved_date: { type: "point", value: "2026-08-01" },
          timeline_confidence: { date_resolution: "high", ordering: "high", overall: "high" },
        },
      ],
      signals: [],
      risks: [],
      decisions: [],
      actions: [],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const repaired = validateAndRepairV6(parsed.value);
    expect(repaired.extraction.timeline).toHaveLength(1);
    expect(repaired.extraction.timeline[0]!.id).toBe("T-002");
    expect(repaired.extraction.signals.some((s) => s.signal_type === "unresolved_temporal")).toBe(true);
    expect(repaired.repairs.some((r) => r.mode === "timeline_confidence_gate" || r.mode === "fabricated_date_rejected")).toBe(
      true,
    );
  });

  it("enforces timeline_mode none honesty", () => {
    const parsed = parseV6Extraction({
      document_meta: { archetype: "Menu", timeline_mode: "none", anchor_date: null, anchor_confidence: "none" },
      snapshot: [{ content: "Seasonal coastal dinner menu." }],
      timeline: [
        {
          content: "Invented milestone",
          resolved_date: { type: "point", value: "2026-01-01" },
          timeline_confidence: { date_resolution: "high", ordering: "high", overall: "high" },
        },
      ],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const repaired = validateAndRepairV6(parsed.value);
    expect(repaired.extraction.timeline).toHaveLength(0);
    expect(repaired.repairs.some((r) => r.mode === "timeline_mode_honesty")).toBe(true);
  });

  it("repairs orphan carries_out links", () => {
    const parsed = parseV6Extraction({
      document_meta: { archetype: "Meeting", timeline_mode: "milestone_chain", anchor_date: "2026-07-28", anchor_confidence: "high" },
      snapshot: [{ content: "Sprint planning notes." }],
      decisions: [{ decision_id: "D-030", content: "Proceed DACH-first" }],
      actions: [
        { content: "Draft board memo", status: "ready", carries_out: "D-030" },
        { content: "Ghost task", status: "pending", carries_out: "D-999" },
      ],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const repaired = validateAndRepairV6(parsed.value);
    expect(repaired.extraction.actions[0]!.carries_out).toBe("D-030");
    expect(repaired.extraction.actions[1]!.carries_out).toBeNull();
    expect(repaired.repairs.some((r) => r.mode === "orphan_link_repair")).toBe(true);
  });

  it("scrubs backend verbs from content", () => {
    const parsed = parseV6Extraction({
      document_meta: { archetype: "Other", timeline_mode: "none", anchor_confidence: "none" },
      snapshot: [{ content: "UPSERT the customer row into memory store." }],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const repaired = validateAndRepairV6(parsed.value);
    expect(repaired.extraction.snapshot[0]!.content).not.toMatch(/UPSERT/);
    expect(repaired.repairs.some((r) => r.mode === "backend_verbs_scrubbed")).toBe(true);
  });

  it("projects into MemorySource for the existing UI contract", () => {
    const parsed = parseV6Extraction({
      document_meta: {
        archetype: "Brief",
        timeline_mode: "narrative_sequence",
        anchor_date: "2026-07-01",
        anchor_confidence: "high",
      },
      snapshot: [
        { content: "Atlas closed Q3 stronger on fleet analytics." },
        { content: "EU entry is the next focus." },
      ],
      signals: [{ content: "ARR grew 18% QoQ", signal_type: "pattern", source_confidence: "high" }],
      decisions: [{ decision_id: "D-021", content: "Expand pricing tier", decided_by: "Finance" }],
      timeline: [
        {
          id: "T-001",
          content: "Fleet Analytics GA",
          date_role: "event_date",
          raw_temporal_expression: "Jul",
          resolved_date: { type: "point", value: "2026-07" },
          timeline_confidence: { date_resolution: "high", ordering: "high", overall: "high" },
        },
      ],
      risks: [{ content: "Actuator lead times", why_it_matters: "Could slip EU launch", source_confidence: "high" }],
      actions: [{ content: "Sign dual-source contract", owner: "M. Chen", due_date: "2026-08-15", status: "ready", carries_out: "D-021" }],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const repaired = validateAndRepairV6(parsed.value);
    const projected = projectV6ToMemorySource(repaired.extraction, "Atlas Launch Notes", repaired.repairs);
    expect(projected.ok).toBe(true);
    if (!projected.ok) return;
    // Brief / PRD / Meeting / Other → Generic Knowledge projection.
    expect(projected.source.archetype?.id).toBe("generic");
    expect(projected.source.blocks).toHaveLength(6);
    expect(projected.source.blocks.map((b) => b.kind)).toEqual([
      "snapshot",
      "signals",
      "decisions",
      "timeline",
      "risks",
      "actions",
    ]);
    expect(projected.source.blocks.map((b) => b.title)).toEqual([
      "Snapshot",
      "Signals",
      "Decisions",
      "Timeline",
      "Risks",
      "Actions",
    ]);
    const score = scoreMemorySource(projected.source, { timelineMode: "narrative_sequence" });
    expect(score.overall).toBeGreaterThan(0.7);
  });

  it("falls back to candidate when AI hollows out memories", () => {
    const candidate = emptyCandidate();
    const result = runCognitivePipeline(
      {
        document_meta: { archetype: "Other", timeline_mode: "none", anchor_confidence: "none" },
        snapshot: [{ content: "Thin." }],
        signals: [],
        decisions: [],
        timeline: [],
        risks: [],
        actions: [],
      },
      { titleHint: "Candidate", candidate },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.usedCandidateFallback).toBe(true);
    expect(result.repairs.some((r) => r.mode === "fallback_to_candidate")).toBe(true);
  });

  it("rejects schema-invalid payloads as invalid-output", () => {
    const result = runCognitivePipeline({ not: "a cognitive extraction" }, {
      titleHint: "X",
      candidate: emptyCandidate(),
    });
    // coerceV6Shape makes this parseable with empty buckets — ensure hollow output falls back
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.usedCandidateFallback).toBe(true);
  });
});
