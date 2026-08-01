import { memorySourceSchema, type MemorySource } from "@/domain/memory/schema";
import { LIMITS } from "@/domain/memory/limits";
import { projectAdaptiveMemories } from "@/understanding/projection-profiles";
import type { DocumentArchetype } from "@/understanding/archetype";
import type { V6Extraction } from "./schema";
import type { FailureMode, RepairEvent } from "./validate";

/**
 * Project validated v6 Observations into the existing MemorySource contract
 * so the UI/render pipeline stays unchanged.
 */

export type ProjectResult =
  | {
      ok: true;
      source: MemorySource;
      repairs: RepairEvent[];
    }
  | {
      ok: false;
      mode: FailureMode;
      detail: string;
      repairs: RepairEvent[];
    };

export function projectV6ToMemorySource(
  extraction: V6Extraction,
  titleHint: string,
  priorRepairs: RepairEvent[] = [],
): ProjectResult {
  const repairs = [...priorRepairs];
  const title = clamp(titleHint || extraction.document_meta.archetype || "Remembered document", LIMITS.maxTitleLength);

  const snapshotNotes = extraction.snapshot.slice(1, 6).map((s) => clamp(s.content, LIMITS.maxFieldLength));
  const summaryParts = extraction.snapshot.slice(0, 3).map((s) => s.content.trim()).filter(Boolean);
  const summary =
    summaryParts.join(" ").trim() ||
    `A ${extraction.document_meta.archetype} remembered with timeline mode ${extraction.document_meta.timeline_mode}.`;

  const heading = clamp(
    title.length > 80 ? `${extraction.document_meta.archetype}` : title,
    LIMITS.maxFieldLength,
  );

  const archetypeId = normalizeArchetype(extraction.document_meta.archetype);

  const source: MemorySource = {
    version: 1,
    title,
    archetype: {
      id: archetypeId,
      label: extraction.document_meta.archetype || archetypeId,
    },
    blocks: projectAdaptiveMemories(
      [
        {
          kind: "snapshot" as const,
          payload: {
            heading,
            summary: clamp(summary, LIMITS.maxFieldLength),
            ...(snapshotNotes.length > 0 ? { notes: snapshotNotes } : {}),
            ...(extraction.document_meta.anchor_date
              ? { byline: `Anchor ${extraction.document_meta.anchor_date} · ${extraction.document_meta.anchor_confidence}` }
              : extraction.document_meta.anchor_confidence === "none"
                ? { byline: "No reliable date anchor" }
                : {}),
          },
        },
        {
          kind: "signals" as const,
          payload: {
            entries: extraction.signals.slice(0, LIMITS.maxEntriesPerBlock).map((s) => ({
              label: clamp(shortLabel(s.content), 120),
              implication: clamp(s.content, LIMITS.maxFieldLength),
              ...(s.signal_type === "tone" || s.signal_type === "omission" ? {} : {}),
            })),
          },
        },
        {
          kind: "decisions" as const,
          payload: {
            entries: extraction.decisions.slice(0, LIMITS.maxEntriesPerBlock).map((d) => ({
              ref: clamp(d.decision_id ?? "D", 40),
              text: clamp(d.content, LIMITS.maxFieldLength),
              status: "approved" as const,
              commitment: "committed" as const,
              ...(d.decided_by ? { because: clamp(`Decided by ${d.decided_by}`, LIMITS.maxFieldLength) } : {}),
            })),
          },
        },
        {
          kind: "timeline" as const,
          payload: {
            entries: extraction.timeline.slice(0, LIMITS.maxEntriesPerBlock).map((t) => ({
              date: clamp(formatResolvedDate(t), 80),
              title: clamp(t.content, LIMITS.maxFieldLength),
              state: stateFromRole(t.date_role),
              ...(t.depends_on?.[0] ? { requires: clamp(t.depends_on.join(", "), 240) } : {}),
              ...(t.responsible_party ? { produces: clamp(t.responsible_party, 240) } : {}),
            })),
          },
        },
        {
          kind: "risks" as const,
          payload: {
            entries: extraction.risks.slice(0, LIMITS.maxEntriesPerBlock).map((r) => ({
              risk: clamp(r.content, LIMITS.maxFieldLength),
              ...(r.why_it_matters
                ? {
                    because: clamp(r.content, LIMITS.maxFieldLength),
                    consequence: clamp(r.why_it_matters, LIMITS.maxFieldLength),
                  }
                : {}),
              severity: confidenceToSeverity(r.source_confidence),
            })),
          },
        },
        {
          kind: "actions" as const,
          payload: {
            entries: extraction.actions.slice(0, LIMITS.maxEntriesPerBlock).map((a) => ({
              task: clamp(a.content, LIMITS.maxFieldLength),
              status: mapActionStatus(a.status),
              ...(a.owner ? { owner: clamp(a.owner, 120) } : {}),
              ...(a.due_date ? { due: clamp(a.due_date, 80) } : {}),
              ...(a.carries_out ? { from: clamp(a.carries_out, LIMITS.maxFieldLength) } : {}),
            })),
          },
        },
      ],
      archetypeId,
    ),
  };

  const parsed = memorySourceSchema.safeParse(source);
  if (!parsed.success) {
    return {
      ok: false,
      mode: "projection_failed",
      detail: parsed.error.issues.slice(0, 6).map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      repairs: [
        ...repairs,
        { mode: "projection_failed", detail: "Projected MemorySource failed schema validation." },
      ],
    };
  }

  return { ok: true, source: parsed.data, repairs };
}

function clamp(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

function shortLabel(content: string): string {
  const first = content.split(/[.!?]/)[0]?.trim() || content;
  const words = first.split(/\s+/).slice(0, 8).join(" ");
  return words.length > 0 ? words : content.slice(0, 80);
}

function formatResolvedDate(t: V6Extraction["timeline"][number]): string {
  const raw = t.raw_temporal_expression?.trim();
  const resolved = t.resolved_date;
  if (!resolved) return raw || "unspecified";
  const value = resolved.value;
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object") {
    if (value.start && value.end) return `${value.start}–${value.end}`;
    if (value.start) return value.start;
    if (value.pattern) return value.pattern;
  }
  return raw || resolved.type;
}

function stateFromRole(role: V6Extraction["timeline"][number]["date_role"]): "shipped" | "on-track" | "planned" | "done" {
  if (role === "authored_date" || role === "mention_date") return "done";
  if (role === "deadline") return "planned";
  return "on-track";
}

function confidenceToSeverity(
  conf: "high" | "medium" | "low" | undefined,
): "high" | "medium" | "low" | undefined {
  if (!conf) return undefined;
  return conf;
}

function mapActionStatus(
  status: "ready" | "pending" | "suggested" | "done" | undefined,
): "ready" | "pending" | "suggested" | "done" {
  if (status === "ready" || status === "done" || status === "suggested") return status;
  return "pending";
}

function normalizeArchetype(raw: string | undefined): DocumentArchetype {
  const key = (raw ?? "other").toLowerCase().replace(/\s+/g, "_");
  const known: DocumentArchetype[] = [
    "resume",
    "prd",
    "research",
    "contract",
    "invoice",
    "ticket",
    "job",
    "menu",
    "meeting",
    "policy",
    "glossary",
    "slides",
    "brief",
    "other",
  ];
  return (known.includes(key as DocumentArchetype) ? key : "other") as DocumentArchetype;
}
