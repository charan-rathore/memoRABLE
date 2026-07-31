/**
 * A tally that never leaves the browser.
 *
 * The home screen promises that a document is understood here and never
 * uploaded, and there is no server behind this app to break that promise with.
 * So the only usage worth counting is the visitor's own, kept in their own
 * localStorage, shown back to them and to nobody else. Anything that would let
 * us count *users* would require sending something somewhere, and would make
 * the promise on the first screen a lie.
 */

const KEY = "memorable.stats.v1";

export interface LocalStats {
  /** Documents understood on this browser. */
  documents: number;
  /** Memory Blocks made from them. */
  memories: number;
  /** Times the three outputs were published. */
  published: number;
  /** ISO day this browser first used memoRABLE. */
  since: string | null;
}

export const EMPTY_STATS: LocalStats = { documents: 0, memories: 0, published: 0, since: null };

export function readStats(): LocalStats {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY_STATS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return EMPTY_STATS;
    const value = parsed as Partial<Record<keyof LocalStats, unknown>>;
    return {
      documents: count(value.documents),
      memories: count(value.memories),
      published: count(value.published),
      since: typeof value.since === "string" ? value.since : null,
    };
  } catch {
    // Private browsing, a disabled store, or something we wrote in an older
    // shape. A tally is never worth an error.
    return EMPTY_STATS;
  }
}

function write(stats: LocalStats): LocalStats {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(stats));
  } catch {
    /* nothing to do, and nothing worth telling anyone about */
  }
  return stats;
}

/** Count a document and the memories made from it. */
export function recordDocument(memories: number): LocalStats {
  const current = readStats();
  return write({
    documents: current.documents + 1,
    memories: current.memories + Math.max(0, Math.trunc(memories)),
    published: current.published,
    since: current.since ?? today(),
  });
}

/** Count one trip through Publish. */
export function recordPublished(): LocalStats {
  const current = readStats();
  return write({ ...current, published: current.published + 1, since: current.since ?? today() });
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : 0;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The tally as a sentence, or null when there is nothing to say yet. A first
 * visit showing three zeros is worse than showing nothing.
 */
export function summarize(stats: LocalStats): string | null {
  if (stats.documents === 0) return null;
  const parts = [
    `${stats.documents} ${stats.documents === 1 ? "document" : "documents"} remembered`,
    `${stats.memories} ${stats.memories === 1 ? "memory" : "memories"}`,
  ];
  if (stats.published > 0) {
    parts.push(`${stats.published} published`);
  }
  return parts.join(" · ");
}
