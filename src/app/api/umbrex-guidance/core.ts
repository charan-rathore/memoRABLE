import { UMBREX_GUIDANCE_PACK } from "@/understanding/market-research/guidance-pack";

/**
 * Bounded live check of the Umbrex playbook pages the market-research pack
 * cites. NOT a proxy: the URL set is fixed server-side from the bundled
 * pack's own source list - callers cannot supply URLs. Public pages only;
 * no auth, no credentials, no paywall circumvention.
 *
 * For each allowlisted URL the route reports what was actually observed:
 * HTTP status, fetch time, page title and UTF-8 byte length. Redirects are
 * NOT followed automatically: a redirect is only followed (max 2 hops) when
 * its target stays on the allowlisted origin, otherwise it is reported as
 * observed. Access failures are reported as observed (e.g. http 520) -
 * never relabeled as paywalled or readable. Guidance content itself stays
 * bundled in the pack; this route verifies current accessibility and stamps
 * fetch time.
 */

let fetchTimeoutMs = 8000;
const MAX_BODY_BYTES = 2_000_000;

/** Test hook: shorten the per-source deadline so timeout specs stay fast. */
export function __setUmbrexFetchTimeoutForTests(ms: number): void {
  fetchTimeoutMs = ms;
}
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h per-URL cache
const MAX_REDIRECT_HOPS = 2;
const ALLOWED_ORIGIN = "https://umbrex.com";

export interface SourceStatus {
  url: string;
  outcome: "readable" | "http-error" | "unreachable";
  httpStatus?: number;
  title?: string;
  /** UTF-8 bytes of the response body (not UTF-16 code units). */
  byteLength?: number;
  /** Set when a redirect to a disallowed origin was observed and refused. */
  detail?: string;
  /** Bounded raw page-text prefix (mechanical parse, unverified). */
  excerpt?: string;
  fetchedAt: string;
  fromCache: boolean;
}

interface CacheEntry {
  status: Omit<SourceStatus, "fromCache">;
  cachedAt: number;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<SourceStatus>>();

/** Test hook: reset the per-URL cache between specs. */
export function __clearUmbrexGuidanceCacheForTests(): void {
  cache.clear();
  inFlight.clear();
}

/** The fixed allowlist: exactly the URLs the bundled pack cites. */
export function allowlistedUrls(): string[] {
  const urls = new Set<string>();
  for (const step of UMBREX_GUIDANCE_PACK) {
    for (const url of step.sources) urls.add(url);
  }
  return [...urls];
}

/** Runtime validation of allowlist entries - never trust pack contents blindly. */
function isAllowlisted(url: string): boolean {
  try {
    const u = new URL(url);
    return u.origin === ALLOWED_ORIGIN && u.protocol === "https:";
  } catch {
    return false;
  }
}

function extractTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
  return m && m[1] ? m[1].trim() : undefined;
}

const EXCERPT_CHARS = 1200;

/** Bounded raw page-text prefix: tags/scripts/styles stripped, whitespace
 * collapsed. An unverified mechanical parse - shown as such, never distilled
 * into guidance claims. */
function extractExcerpt(html: string): string {
  const noScripts = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
  const text = noScripts
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, EXCERPT_CHARS);
}

/** Race a promise against a hard deadline - terminates even for stalled bodies. */
function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("source deadline exceeded")), Math.max(ms, 1))),
  ]);
}

interface CheckedResponse {
  httpStatus: number;
  ok: boolean;
  refusedLocation: string | null;
  bodyText: string;
  bodyTruncated: boolean;
}

/** Read a response body with a hard byte cap and deadline - bounds actual
 * consumption; an over-cap body is cancelled, not fully downloaded. */
async function readBodyBounded(
  res: Response,
  cap: number,
  deadlineAt: number,
): Promise<{ text: string; truncated: boolean }> {
  if (!res.body) {
    // Mocks and synthetic responses: no stream, fall back to text().
    const text = await withDeadline(res.text(), deadlineAt - Date.now());
    return { text, truncated: false };
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  // Retained bytes only: bytes actually stored in chunks. Received bytes that
  // cross the cap are never fabricated into the buffer.
  let retained = 0;
  let truncated = false;
  try {
    for (;;) {
      const remaining = deadlineAt - Date.now();
      if (remaining <= 0) throw new Error("source deadline exceeded");
      const { done, value } = await withDeadline(reader.read(), remaining);
      if (done) break;
      if (value) {
        const fits = cap - retained;
        if (value.length <= fits) {
          chunks.push(value);
          retained += value.length;
        } else {
          if (fits > 0) {
            chunks.push(value.subarray(0, fits));
            retained += fits;
          }
          truncated = true;
          // Never await cancel: a never-settling cancellation must not escape
          // the per-source deadline. The enclosing fetch abort controller
          // remains responsible for stopping outstanding network activity.
          void reader.cancel().catch(() => {});
          break;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(retained);
  let off = 0;
  for (const chunk of chunks) {
    merged.set(chunk, off);
    off += chunk.length;
  }
  return { text: new TextDecoder().decode(merged), truncated };
}

/**
 * One total per-source deadline spans every redirect hop AND the response
 * body read: fetch() resolves at headers, so a body-side timer is required.
 */
async function fetchChecked(url: string): Promise<CheckedResponse> {
  const deadline = Date.now() + fetchTimeoutMs;
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("source deadline exceeded");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining);
    try {
      const res = await fetch(current, {
        signal: controller.signal,
        headers: { "user-agent": "memoRABLE guidance check (public pages only)" },
        redirect: "manual",
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        const next = location ? new URL(location, current).toString() : null;
        if (next && isAllowlisted(next) && hop < MAX_REDIRECT_HOPS) {
          current = next;
          continue;
        }
        return { httpStatus: res.status, ok: false, refusedLocation: next, bodyText: "", bodyTruncated: false };
      }
      // Timer stays armed: the body read is inside the same deadline and
      // byte-capped at the stream level.
      const body = await readBodyBounded(res, MAX_BODY_BYTES, deadline);
      return { httpStatus: res.status, ok: res.ok, refusedLocation: null, bodyText: body.text, bodyTruncated: body.truncated };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("redirect hop limit exceeded");
}

export async function checkOneSource(url: string, now: number): Promise<SourceStatus> {
  const hit = cache.get(url);
  if (hit && now - hit.cachedAt < CACHE_TTL_MS) {
    return { ...hit.status, fromCache: true };
  }
  const pending = inFlight.get(url);
  if (pending) return pending;
  const task = (async (): Promise<SourceStatus> => {
    const fetchedAt = new Date(now).toISOString();
    let status: Omit<SourceStatus, "fromCache">;
    if (!isAllowlisted(url)) {
      status = { url, outcome: "unreachable", detail: "allowlist validation failed", fetchedAt };
    } else {
      try {
        const res = await fetchChecked(url);
        const byteLength = new TextEncoder().encode(res.bodyText).length;
        const truncated = res.bodyTruncated;
        status = res.ok
          ? {
              url,
              outcome: "readable",
              httpStatus: res.httpStatus,
              title: extractTitle(res.bodyText),
              byteLength,
              excerpt: extractExcerpt(res.bodyText),
              fetchedAt,
              ...(truncated ? { detail: "body exceeded 2MB cap" } : {}),
            }
          : {
              url,
              outcome: "http-error",
              httpStatus: res.httpStatus,
              fetchedAt,
              ...(res.refusedLocation ? { detail: `redirect refused: ${res.refusedLocation}` } : {}),
            };
      } catch {
        status = { url, outcome: "unreachable", fetchedAt };
      }
    }
    cache.set(url, { status, cachedAt: now });
    return { ...status, fromCache: false };
  })();
  inFlight.set(url, task);
  try {
    return await task;
  } finally {
    inFlight.delete(url);
  }
}

