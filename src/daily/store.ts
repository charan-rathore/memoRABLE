import type { DailyEvent } from "./types";

/**
 * Local-first event storage. The browser uses IndexedDB (see idb-store.ts in
 * the workspace PR); tests and the benchmark use MemoryStore. Sync is
 * optional and not part of this contract.
 */
export interface EventStore {
  load(workspaceId: string): Promise<DailyEvent[]>;
  append(event: DailyEvent): Promise<void>;
  /**
   * Remove an entry's text from every stored event, in place. Used by explicit
   * deletion. The tombstone event remains so the deletion itself is auditable.
   */
  redact(workspaceId: string, entryId: string): Promise<number>;
}

export const REDACTED = "[deleted]";

export function redactEvent(e: DailyEvent, entryId: string): DailyEvent | null {
  if (e.type === "entry.recorded" && e.entryId === entryId) return { ...e, text: REDACTED, tags: [], refs: [], redacted: true };
  if (e.type === "entry.revised" && e.entryId === entryId) return { ...e, text: REDACTED, tags: [], refs: [], redacted: true };
  return null;
}

export class MemoryStore implements EventStore {
  private logs = new Map<string, DailyEvent[]>();
  async load(workspaceId: string) { return [...(this.logs.get(workspaceId) ?? [])]; }
  async append(event: DailyEvent) {
    const log = this.logs.get(event.workspaceId) ?? [];
    log.push(structuredClone(event));
    this.logs.set(event.workspaceId, log);
  }
  async redact(workspaceId: string, entryId: string) {
    const log = this.logs.get(workspaceId) ?? [];
    let n = 0;
    for (let i = 0; i < log.length; i++) {
      const r = redactEvent(log[i]!, entryId);
      if (r) { log[i] = r; n++; }
    }
    return n;
  }
  /** Raw view for audits and leak tests. */
  dump(workspaceId: string) { return JSON.stringify(this.logs.get(workspaceId) ?? []); }
}
