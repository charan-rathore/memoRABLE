import { NextResponse } from "next/server";
import { allowlistedUrls, checkOneSource, type SourceStatus } from "./core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Bounded live check of the Umbrex playbook pages the market-research pack
 * cites. NOT a proxy: the URL set is fixed server-side in ./core from the
 * bundled pack's own source list - callers cannot supply URLs. Public pages
 * only; no auth, no credentials, no paywall circumvention. See ./core for
 * the fetch/cache/redirect/body-boundary implementation.
 */
export async function GET() {
  const now = Date.now();
  const urls = allowlistedUrls();
  // Sequential, low-volume courtesy fetches; the allowlist is ~12 URLs.
  const sources: SourceStatus[] = [];
  for (const url of urls) {
    sources.push(await checkOneSource(url, now));
  }
  return NextResponse.json({
    checkedAt: new Date(now).toISOString(),
    allowlistedCount: urls.length,
    sources,
    note: "Observed accessibility only: a 200 means a response was received, not that full chapter text is public. http-error (e.g. 520) means the page failed at fetch time; it does not establish paywall status. Per-source fetchedAt is the actual fetch time; entries served from cache say so. Guidance text is bundled in the pack with its own retrieval stamp.",
  });
}
