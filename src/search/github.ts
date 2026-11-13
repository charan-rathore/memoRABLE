import type { SearchDoc } from "./engine";

/**
 * GitHub connector: issues, pull requests and their comments for a repo,
 * fetched by the browser straight from api.github.com (no server in between,
 * so a personal token never leaves the device).
 *
 * Incremental: each sync asks only for items updated since the last cursor,
 * and the first page is a conditional request (If-None-Match), so an
 * unchanged repo costs one 304. GitHub does not count an authorized 304
 * against the primary rate limit; unauthenticated requests are limited to
 * 60 per hour, so large repos need a token.
 */

export interface GithubCursor {
  repo: string;
  /** ISO time of the newest `updated_at` seen. */
  since?: string;
  etag?: string;
  syncedAt?: string;
}

export interface SyncProgress { phase: "issues" | "comments" | "done"; fetched: number; requests: number; rateRemaining?: number }

export interface SyncResult {
  cursor: GithubCursor;
  docs: SearchDoc[];
  requests: number;
  notModified: boolean;
  /** Set when the sync stopped early (rate limit, network); docs so far are still valid. */
  stoppedBecause?: string;
}

interface GhIssue {
  number: number; title: string; body: string | null; state: string; html_url: string;
  created_at: string; updated_at: string; labels: Array<{ name: string } | string>; pull_request?: unknown;
  comments: number;
}
interface GhComment { issue_url: string; body: string | null; updated_at: string; author_association: string }

const MAX_COMMENT_CHARS = 2400;
const MAX_BODY_CHARS = 6000;

export function cleanMarkdown(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/<img[^>]*>/gi, " ")
    .replace(/<\/?details>|<\/?summary>/gi, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function validRepo(s: string): string | null {
  const m = s.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/$/, "").match(/^([\w.-]+)\/([\w.-]+)$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

export async function syncRepo(
  cursor: GithubCursor,
  opts: { token?: string; fetchImpl?: typeof fetch; maxRequests?: number; onProgress?: (p: SyncProgress) => void } = {},
): Promise<SyncResult> {
  const f = opts.fetchImpl ?? fetch;
  const maxRequests = opts.maxRequests ?? 60;
  const headers: Record<string, string> = { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  let requests = 0;
  let rateRemaining: number | undefined;
  const byNumber = new Map<number, SearchDoc & { _updated: string }>();
  const comments = new Map<number, string[]>();
  let newestUpdate = cursor.since;
  let etag = cursor.etag;
  let stoppedBecause: string | undefined;

  const get = async (url: string, conditional?: string) => {
    if (requests >= maxRequests) { stoppedBecause = `stopped after ${maxRequests} requests; sync again to continue`; return null; }
    requests++;
    const res = await f(url, { headers: conditional ? { ...headers, "if-none-match": conditional } : headers });
    const rem = res.headers.get("x-ratelimit-remaining");
    if (rem !== null) rateRemaining = Number(rem);
    if (res.status === 304) return { notModified: true as const };
    if (res.status === 403 || res.status === 429) {
      const reset = Number(res.headers.get("x-ratelimit-reset") ?? 0);
      stoppedBecause = `GitHub rate limit reached${reset ? `; resets at ${new Date(reset * 1000).toLocaleTimeString()}` : ""}${opts.token ? "" : ". Add a token to raise the limit"}`;
      return null;
    }
    if (res.status === 404) throw new Error(`${cursor.repo} wasn't found, or it's private and needs a token with access`);
    if (!res.ok) throw new Error(`GitHub answered ${res.status} for ${cursor.repo}`);
    return { notModified: false as const, data: (await res.json()) as unknown, etag: res.headers.get("etag") ?? undefined, link: res.headers.get("link") ?? "" };
  };

  const since = cursor.since ? `&since=${encodeURIComponent(cursor.since)}` : "";
  let url: string | null = `https://api.github.com/repos/${cursor.repo}/issues?state=all&sort=updated&direction=asc&per_page=100${since}`;
  let first = true;
  while (url) {
    const r = await get(url, first ? cursor.etag : undefined);
    if (!r) break;
    if (r.notModified) return { cursor: { ...cursor, syncedAt: new Date().toISOString() }, docs: [], requests, notModified: true };
    if (first && r.etag) etag = r.etag;
    first = false;
    for (const i of r.data as GhIssue[]) {
      byNumber.set(i.number, {
        id: `${cursor.repo}#${i.number}`,
        kind: i.pull_request ? "pr" : "issue",
        title: i.title,
        body: cleanMarkdown(i.body).slice(0, MAX_BODY_CHARS),
        labels: i.labels.map((l) => (typeof l === "string" ? l : l.name)),
        source: cursor.repo,
        url: i.html_url,
        createdAt: i.created_at,
        state: i.state,
        _updated: i.updated_at,
      });
      if (!newestUpdate || i.updated_at > newestUpdate) newestUpdate = i.updated_at;
    }
    opts.onProgress?.({ phase: "issues", fetched: byNumber.size, requests, ...(rateRemaining !== undefined ? { rateRemaining } : {}) });
    url = /<([^>]+)>;\s*rel="next"/.exec(r.link)?.[1] ?? null;
  }

  // Comments carry the answers ("fixed by upgrading to 16.4.6"); fetch them repo-wide, newest-updated window only.
  if (!stoppedBecause && byNumber.size) {
    let curl: string | null = `https://api.github.com/repos/${cursor.repo}/issues/comments?sort=updated&direction=asc&per_page=100${since}`;
    while (curl) {
      const r = await get(curl);
      if (!r || r.notModified) break;
      for (const c of r.data as GhComment[]) {
        const n = Number(c.issue_url.split("/").pop());
        if (!byNumber.has(n)) continue;
        const list = comments.get(n) ?? [];
        list.push(cleanMarkdown(c.body));
        comments.set(n, list);
      }
      opts.onProgress?.({ phase: "comments", fetched: byNumber.size, requests, ...(rateRemaining !== undefined ? { rateRemaining } : {}) });
      curl = /<([^>]+)>;\s*rel="next"/.exec(r.link)?.[1] ?? null;
    }
  }

  const docs: SearchDoc[] = [...byNumber.values()].map((full) => {
    const d: SearchDoc = { ...full };
    delete (d as Partial<typeof full>)._updated;
    const cs = comments.get(Number(d.id.split("#")[1]));
    return cs?.length ? { ...d, body: `${d.body}\n\n${cs.join("\n\n").slice(0, MAX_COMMENT_CHARS)}`.slice(0, MAX_BODY_CHARS + MAX_COMMENT_CHARS) } : d;
  });
  opts.onProgress?.({ phase: "done", fetched: docs.length, requests, ...(rateRemaining !== undefined ? { rateRemaining } : {}) });
  return {
    cursor: { repo: cursor.repo, ...(newestUpdate ? { since: newestUpdate } : {}), ...(etag ? { etag } : {}), syncedAt: new Date().toISOString() },
    docs,
    requests,
    notModified: false,
    ...(stoppedBecause ? { stoppedBecause } : {}),
  };
}
