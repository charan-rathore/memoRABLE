#!/usr/bin/env node
/**
 * Builds public/demo/memory.json, the memory the homepage searches before you
 * have your own: 14 sample engineering notes (written for the demo, labelled
 * as samples in the UI) and recent real issues from vercel/next.js taken from
 * the github-dups-v1 benchmark (public GitHub issues, linked to their source).
 *
 * Usage: node scripts/build-demo-memory.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const NOTES = [
  { kind: "worked", day: -1, text: "Fixed the hydration mismatch on the pricing page: the server rendered dates in UTC, the browser in local time. Formatting now happens on the client." },
  { kind: "learned", day: -1, text: "Hydration errors from browser extensions (password managers, Grammarly) add attributes to <body>. suppressHydrationWarning on body is the accepted fix." },
  { kind: "decided", day: -9, status: "superseded", supersededBy: "n4", text: "Decided to cache search results in Redis for 10 minutes." },
  { kind: "decided", day: -3, status: "approved", text: "Decided to cache search results in Edge Config instead of Redis. Redis round trips cost 40 ms at p95; Edge Config reads are under 1 ms. Replaces the Redis decision." },
  { kind: "learned", day: -6, text: "revalidateTag only purges the Data Cache. Static pages also need revalidatePath, or the Full Route Cache keeps serving the old HTML." },
  { kind: "task", day: 0, text: "Write a regression test for the middleware redirect loop on trailing slashes." },
  { kind: "decided", day: -12, status: "approved", text: "Agreed to pin Node 20 in CI until the require(esm) change in Node 22 is handled in our build scripts." },
  { kind: "learned", day: -12, text: "ERR_REQUIRE_ESM came from a transitive dependency that went ESM-only in a minor release. Pinning it fixed the build; upgrading needs a dynamic import." },
  { kind: "worked", day: -2, text: "Profiled the dev server: Turbopack memory grows about 200 MB an hour with 3,000 routes. Restarting it daily until the leak is understood." },
  { kind: "decided", day: -4, status: "proposed", text: "Proposal: generate OpenAPI types at build time instead of committing them to the repo." },
  { kind: "learned", day: -8, text: "Server Actions run with the user's cookies. Re-check the session inside every action; never trust the form alone." },
  { kind: "task", day: -1, text: "Follow up on the flaky Playwright test on Windows: the snapshot includes the machine's time zone." },
  { kind: "worked", day: -5, text: "Moved feature flags to Edge Config. Flag reads dropped from 35 ms to under 1 ms at p95." },
  { kind: "decided", day: -2, status: "unresolved", text: "Should we self-host fonts instead of next/font/google? Offline development keeps failing on the font download." },
];

const set = JSON.parse(readFileSync("bench/search/github-dups-v1.json", "utf8"));
const issues = set.docs
  .filter((d) => d.repo === "vercel/next.js")
  .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  .slice(0, 320)
  .map((d) => ({
    id: d.id,
    kind: d.isPr ? "pr" : "issue",
    title: d.title,
    body: d.body.slice(0, 600),
    labels: d.labels.slice(0, 4),
    url: `https://github.com/${d.repo}/${d.isPr ? "pull" : "issues"}/${d.number}`,
    createdAt: d.createdAt,
    state: d.state,
  }));

const now = Date.parse(set.builtAt);
const notes = NOTES.map((n, i) => ({
  id: `n${i + 1}`,
  kind: n.kind,
  text: n.text,
  createdAt: new Date(now + n.day * 86_400_000).toISOString(),
  ...(n.status ? { status: n.status } : {}),
  ...(n.supersededBy ? { supersededBy: n.supersededBy } : {}),
}));

mkdirSync("public/demo", { recursive: true });
writeFileSync("public/demo/memory.json", JSON.stringify({ version: 1, builtFrom: set.version, notes, issues }));
console.log(`wrote public/demo/memory.json: ${notes.length} notes, ${issues.length} issues`);
