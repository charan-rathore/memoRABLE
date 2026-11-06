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
 * fetch time. Readable chapter pages additionally quote bounded verbatim
 * text from declared anchored sections (heading ids on the live page);
 * pages without declared anchors, or whose anchors moved, report a clear
 * gap - navigation chrome is never quoted as guidance.
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
  /** Verbatim section excerpts anchored to declared heading ids. */
  sections?: SectionExcerpt[];
  /** Why no anchored section text is quoted (index page, or anchors gone). */
  excerptNote?: string;
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

const SECTION_EXCERPT_CHARS = 1200;

export interface SectionExcerpt {
  /** Exact live heading id the excerpt was sliced from. */
  anchorId: string;
  /** Declared topic label: the pack's reason for citing this section. */
  topic: string;
  /** Verbatim heading text as published. */
  heading: string;
  /** Bounded verbatim section text, markup stripped, sentence-boundary cut. */
  excerpt: string;
}

interface DeclaredSection {
  anchor: string;
  topic: string;
}

const MSP = "https://umbrex.com/resources/market-sizing-playbook";
const CDDP = "https://umbrex.com/resources/commercial-due-diligence-playbook-2025";

/** Declared section anchors per allowlisted chapter page, grounded
 * 2026-11-06 against the live pages: Umbrex chapter headings carry stable
 * numeric-prefix ids (h2 per section, h3 per numbered step on some CDD
 * chapters); Elementor chrome headings have no such ids. Index/TOC pages
 * (CDD root, competitive-intelligence, scenario-planning) have no anchored
 * chapter sections in public text - a declared gap, never nav-as-guidance.
 * Heading ids are not guaranteed stable: a missing or ambiguous anchor is
 * reported as a gap, never silently substituted. */
const SOURCE_SECTION_ANCHORS: Record<string, DeclaredSection[]> = {
  [`${MSP}/scoping-and-framing-the-exercise/`]: [
    { anchor: "2-1-clarifying-the-business-question-and-decision-context", topic: "Clarify the decision" },
    { anchor: "2-4-drafting-the-initial-hypothesis-and-workplan", topic: "Hypotheses and workplan" },
  ],
  [`${MSP}/foundations-of-market-sizing/`]: [
    { anchor: "1-2-essential-definitions-market-segments-tam-sam-som-share", topic: "TAM/SAM/SOM definitions" },
    { anchor: "1-3-principles-of-sound-market-boundary-definition", topic: "Boundary principles" },
    { anchor: "1-4-typical-failure-modes-and-how-to-avoid-them", topic: "Failure modes" },
  ],
  [`${MSP}/data-collection-and-research-techniques/`]: [
    { anchor: "4-1-secondary-data-sources-landscape", topic: "Secondary source landscape" },
    { anchor: "4-4-data-quality-assurance-checklist", topic: "Data quality assurance" },
  ],
  [`${MSP}/top-down-market-sizing-methodology/`]: [
    { anchor: "4-2-step-by-step-guide-to-building-a-top-down-model", topic: "Top-down step guide" },
  ],
  [`${MSP}/bottom-up-market-sizing-methodology/`]: [
    { anchor: "5-2-step-by-step-guide-to-building-a-bottom-up-model", topic: "Bottom-up step guide" },
  ],
  [`${MSP}/hybrid-triangulation-and-sanity-check-techniques/`]: [
    { anchor: "7-1-three-lens-triangulation-framework-top-down-bottom-up-expert", topic: "Three-lens triangulation" },
    { anchor: "7-3-driver-trees-and-sensitivity-stress-testing", topic: "Driver trees and sensitivity" },
  ],
  [`${MSP}/operationalizing-the-market-sizing-process/`]: [
    { anchor: "10-2-standard-workplan-templates-and-effort-estimates", topic: "Workplan templates" },
  ],
  [`${MSP}/communicating-insights-and-driving-action/`]: [
    { anchor: "11-2-executive-level-storylining-and-think-cell-blueprint", topic: "Executive storylining" },
  ],
  [`${MSP}/toolkits-templates-and-resources/`]: [
    { anchor: "12-4-market-sizing-readiness-self-assessment-checklist", topic: "Readiness checklist" },
  ],
  [`${CDDP}/data-collection-and-research-techniques/`]: [
    { anchor: "4-2-primary-research-design-step-by-step-guide", topic: "Primary research design" },
  ],
  [`${CDDP}/market-size-and-growth-assessment/`]: [
    { anchor: "5-1-tam-sam-som-framework", topic: "TAM/SAM/SOM framework" },
  ],
  [`${CDDP}/competitive-landscape-and-positioning/`]: [
    { anchor: "7-1-competitor-identification-checklist", topic: "Competitor identification" },
  ],
};

function stripMarkup(fragment: string): string {
  return fragment
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Cut at the last sentence boundary within the cap; never split solely on
 * an unqualified digit boundary (figures, versions, years, list numbers). */
function boundAtSentence(text: string, cap: number): string {
  if (text.length <= cap) return text;
  const window = text.slice(0, cap);
  const lastStop = window.lastIndexOf(". ");
  if (lastStop > cap * 0.5) return window.slice(0, lastStop + 1).trim();
  const lastSpace = window.lastIndexOf(" ");
  return (lastSpace > 0 ? window.slice(0, lastSpace) : window).trim();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface HeadingMatch {
  level: number;
  id: string;
  headEnd: number;
}

/** Locate the section heading: exact id first, else tolerate slug-text edits
 * via the numeric prefix (e.g. "4-2-"). More than one prefix hit is
 * ambiguous and reported missing rather than guessed. */
function findSectionHeading(html: string, anchor: string): HeadingMatch | null {
  const exactRe = new RegExp(`<h([23])\\b[^>]*\\bid="${escapeRe(anchor)}"[^>]*>`, "gi");
  const exact = [...html.matchAll(exactRe)];
  if (exact.length === 1) {
    const m = exact[0]!;
    return { level: Number(m[1]), id: anchor, headEnd: m.index! + m[0].length };
  }
  if (exact.length > 1) return null;
  const prefix = anchor.match(/^\d+(?:-\d+)*-/)?.[0];
  if (!prefix) return null;
  const prefixRe = new RegExp(`<h([23])\\b[^>]*\\bid="(${escapeRe(prefix)}[^"]*)"[^>]*>`, "gi");
  const hits = [...html.matchAll(prefixRe)];
  if (hits.length !== 1) return null;
  const m = hits[0]!;
  return { level: Number(m[1]), id: m[2]!, headEnd: m.index! + m[0].length };
}

export interface SectionExtraction {
  sections: SectionExcerpt[];
  note?: string;
}

/** Slice declared anchored sections out of a live page. Content between the
 * heading and the next same-or-higher-level heading is quoted verbatim and
 * bounded; anything else on the page (nav, footer, forms) is never quoted. */
export function extractSectionExcerpts(html: string, url: string): SectionExtraction {
  const declared = SOURCE_SECTION_ANCHORS[url];
  if (!declared) {
    return {
      sections: [],
      note: "No anchored chapter sections are declared for this page (index/contents page); nothing is quoted from it.",
    };
  }
  const sections: SectionExcerpt[] = [];
  const missing: string[] = [];
  for (const d of declared) {
    const h = findSectionHeading(html, d.anchor);
    if (!h) {
      missing.push(d.anchor);
      continue;
    }
    const headCloseRe = new RegExp(`</h${h.level}\\s*>`, "ig");
    headCloseRe.lastIndex = h.headEnd;
    const headClose = headCloseRe.exec(html);
    const contentStart = headClose ? headClose.index + headClose[0].length : h.headEnd;
    const nextRe = h.level === 2 ? /<h2\b/gi : /<h[23]\b/gi;
    nextRe.lastIndex = contentStart;
    const next = nextRe.exec(html);
    const rawSection = html.slice(contentStart, next ? next.index : html.length);
    const headingText = stripMarkup(html.slice(h.headEnd, headClose ? headClose.index : h.headEnd));
    const excerpt = boundAtSentence(stripMarkup(rawSection), SECTION_EXCERPT_CHARS);
    if (!excerpt) {
      missing.push(d.anchor);
      continue;
    }
    sections.push({ anchorId: h.id, topic: d.topic, heading: headingText, excerpt });
  }
  if (missing.length === declared.length) {
    return {
      sections,
      note: `Declared section anchor(s) not found on the live page (${missing.join(", ")}); the page structure may have changed - nothing is quoted.`,
    };
  }
  return {
    sections,
    ...(missing.length
      ? { note: `Some declared anchors were not found on the live page: ${missing.join(", ")}.` }
      : {}),
  };
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
              ...(() => {
                const ex = extractSectionExcerpts(res.bodyText, url);
                return {
                  ...(ex.sections.length ? { sections: ex.sections } : {}),
                  ...(ex.note ? { excerptNote: ex.note } : {}),
                };
              })(),
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

