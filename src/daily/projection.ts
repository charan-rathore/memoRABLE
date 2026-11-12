import type { DailyEvent, DecisionStatus, Entry, WorkspaceState } from "./types";

/**
 * Status only when the words support it. Each rule names itself, so the UI
 * can show why ("because the text says 'should we'").
 */
const STATUS_RULES: Array<{ status: Exclude<DecisionStatus, "superseded">; re: RegExp; basis: string }> = [
  { status: "unresolved", re: /\?\s*$|\b(open question|unresolved|undecided|tbd|not sure)\b/i, basis: "the text asks a question or says it is unresolved" },
  { status: "proposed", re: /\b(propose|proposal|proposed|suggest|should we|maybe|consider|draft)\b/i, basis: "the text proposes rather than decides" },
  { status: "approved", re: /^(decided|approved|agreed|going with|we will|we'll|chose|choose)\b|\b(approved|signed off|agreed to|decided to)\b/i, basis: "the text states a decision was made" },
];

export function inferStatus(kind: Entry["kind"], text: string): { status?: Exclude<DecisionStatus, "superseded">; basis?: string } {
  if (kind !== "decided") return {};
  for (const r of STATUS_RULES) if (r.re.test(text.trim())) return { status: r.status, basis: r.basis };
  return {};
}

export const handleOf = (entryId: string) => entryId.replace(/[^a-z0-9]/gi, "").slice(-6).toLowerCase();

export function emptyState(workspaceId: string): WorkspaceState {
  return { workspaceId, entries: new Map(), sources: new Map(), deleted: new Set(), plans: [], lastSeq: 0 };
}

/** Apply one event. Pure with respect to its inputs; mutates `s` in place for speed. */
export function apply(s: WorkspaceState, e: DailyEvent): string[] {
  s.lastSeq = Math.max(s.lastSeq, e.seq);
  const touched: string[] = [];
  switch (e.type) {
    case "entry.recorded": {
      if (s.deleted.has(e.entryId)) break;
      const inferred = inferStatus(e.kind, e.text);
      s.entries.set(e.entryId, {
        id: e.entryId, handle: handleOf(e.entryId), kind: e.kind, text: e.text, tags: e.tags, refs: e.refs, sourceIds: e.sourceIds,
        createdAt: e.at, updatedAt: e.at, version: 1, supersedes: [],
        ...(inferred.status ? { status: inferred.status, statusBasis: inferred.basis } : {}),
        ...(e.kind === "task" ? { task: "open" as const } : {}),
        history: [{ version: 1, at: e.at, text: e.text }],
      });
      touched.push(e.entryId);
      break;
    }
    case "entry.revised": {
      const x = s.entries.get(e.entryId);
      if (!x) break;
      x.version += 1; x.text = e.text; x.tags = e.tags; x.refs = e.refs; x.updatedAt = e.at;
      x.history.push({ version: x.version, at: e.at, text: e.text });
      if (x.status !== "superseded" && !x.statusBasis?.startsWith("set by")) {
        const inferred = inferStatus(x.kind, e.text);
        if (inferred.status) { x.status = inferred.status; x.statusBasis = inferred.basis; } else { delete x.status; delete x.statusBasis; }
      }
      touched.push(e.entryId);
      break;
    }
    case "entry.status": {
      const x = s.entries.get(e.entryId);
      if (!x || x.status === "superseded") break;
      x.status = e.status; x.statusBasis = e.basis; x.updatedAt = e.at;
      touched.push(e.entryId);
      break;
    }
    case "entry.superseded": {
      const old = s.entries.get(e.entryId), next = s.entries.get(e.by);
      if (!old || !next || e.entryId === e.by) break;
      old.status = "superseded"; old.statusBasis = `superseded by #${next.handle}`; old.supersededBy = e.by; old.updatedAt = e.at;
      if (!next.supersedes.includes(e.entryId)) next.supersedes.push(e.entryId);
      touched.push(e.entryId, e.by);
      break;
    }
    case "entry.deleted": {
      if (s.entries.delete(e.entryId)) touched.push(e.entryId);
      s.deleted.add(e.entryId);
      for (const x of s.entries.values()) {
        if (x.supersededBy === e.entryId) { delete x.supersededBy; delete x.status; delete x.statusBasis; const inf = inferStatus(x.kind, x.text); if (inf.status) { x.status = inf.status; x.statusBasis = inf.basis; } touched.push(x.id); }
        x.supersedes = x.supersedes.filter((id) => id !== e.entryId);
        x.refs = x.refs.filter((id) => id !== e.entryId);
      }
      break;
    }
    case "source.attached": {
      s.sources.set(e.sourceId, { id: e.sourceId, name: e.name, mime: e.mime, bytes: e.bytes, contentHash: e.contentHash, excerpt: e.excerpt, attachedAt: e.at });
      break;
    }
    case "task.state": {
      const x = s.entries.get(e.entryId);
      if (!x || x.kind !== "task") break;
      x.task = e.state; x.updatedAt = e.at;
      touched.push(e.entryId);
      break;
    }
    case "plan.decided": {
      s.plans.push({ at: e.at, candidateId: e.candidateId, decision: e.decision });
      break;
    }
  }
  return touched;
}

export function project(workspaceId: string, events: Iterable<DailyEvent>): WorkspaceState {
  const s = emptyState(workspaceId);
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  // Deletion wins regardless of order: collect tombstones first.
  for (const e of sorted) if (e.type === "entry.deleted") s.deleted.add(e.entryId);
  for (const e of sorted) apply(s, e);
  return s;
}
