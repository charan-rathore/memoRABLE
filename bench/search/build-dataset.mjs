#!/usr/bin/env node
/**
 * Builds bench/search/github-dups-v1.json: a retrieval benchmark made of real
 * GitHub issues that maintainers closed as duplicates.
 *
 *   query    = the duplicate issue (title, and title + body)
 *   relevant = the issue it was marked a duplicate of (the "canonical")
 *   corpus   = every canonical + recent issues and PRs from the same repo
 *
 * Ground truth comes from GitHub's own MarkedAsDuplicateEvent (GraphQL), with
 * a fallback to "Duplicate of #N" in maintainer comments. Nothing is labelled
 * by us, so the benchmark measures what maintainers actually judged.
 *
 * Usage: GITHUB_TOKEN=... node bench/search/build-dataset.mjs [out.json]
 * Network: api.github.com only. Runs in CI (search-lab workflow).
 */
import { writeFileSync } from "node:fs";

const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) throw new Error("GITHUB_TOKEN is required");
const OUT = process.argv[2] ?? "bench/search/github-dups-v1.json";

const REPOS = [
  { repo: "microsoft/vscode", duplicates: 160, distractorPages: 12 },
  { repo: "vercel/next.js", duplicates: 160, distractorPages: 12 },
];
const BODY_CHARS = 1400;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function gh(path, init = {}, attempt = 0) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: { authorization: `Bearer ${TOKEN}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", ...(init.headers ?? {}) },
  });
  if ((res.status === 403 || res.status === 429) && attempt < 4) {
    const reset = Number(res.headers.get("x-ratelimit-reset") ?? 0) * 1000;
    const wait = Math.min(65_000, Math.max(5_000, reset - Date.now() + 1000));
    console.warn(`rate limited on ${path}; waiting ${Math.round(wait / 1000)}s`);
    await sleep(wait);
    return gh(path, init, attempt + 1);
  }
  if (!res.ok) throw new Error(`${res.status} ${path}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}
const graphql = (query, variables) => gh("/graphql", { method: "POST", body: JSON.stringify({ query, variables }) });

/** Remove template noise that every issue in a repo shares; keep the person's words. */
export function cleanBody(body) {
  return (body ?? "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/<img[^>]*>/gi, " ")
    .replace(/^\s*(- \[[ x]\]|###? (Does this issue occur when all extensions are disabled|Link to the code that reproduces|To Reproduce|Current vs\. Expected behavior|Provide environment information|Which area\(s\) are affected|Which stage\(s\) are affected|Additional context|Verify canary release)).*$/gim, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, BODY_CHARS);
}

const DUP_QUERY = `query($owner:String!,$name:String!,$n:Int!){repository(owner:$owner,name:$name){issue(number:$n){
  number title body createdAt stateReason labels(first:10){nodes{name}}
  timelineItems(itemTypes:[MARKED_AS_DUPLICATE_EVENT],last:5){nodes{... on MarkedAsDuplicateEvent{canonical{... on Issue{number} ... on PullRequest{number}}}}}
  comments(first:30){nodes{body authorAssociation}}
}}}`;

const ISSUE_QUERY = `query($owner:String!,$name:String!,$n:Int!){repository(owner:$owner,name:$name){issueOrPullRequest(number:$n){
  __typename ... on Issue{number title body createdAt state labels(first:10){nodes{name}}}
  ... on PullRequest{number title body createdAt state labels(first:10){nodes{name}}}
}}}`;

function toDoc(repo, node, isPr) {
  return {
    id: `${repo}#${node.number}`,
    repo,
    number: node.number,
    title: node.title,
    body: cleanBody(node.body),
    labels: (node.labels?.nodes ?? node.labels ?? []).map((l) => (typeof l === "string" ? l : l.name)),
    state: String(node.state ?? "").toLowerCase(),
    isPr: !!isPr,
    createdAt: node.createdAt ?? node.created_at,
  };
}

const docs = new Map();
const queries = [];

for (const { repo, duplicates, distractorPages } of REPOS) {
  const [owner, name] = repo.split("/");
  console.log(`\n== ${repo}`);

  // 1. Duplicates, newest first (search API: 30 req/min, 1000 results max).
  const dupNumbers = [];
  for (let page = 1; dupNumbers.length < duplicates * 1.6 && page <= 10; page++) {
    const r = await gh(`/search/issues?q=${encodeURIComponent(`repo:${repo} is:issue is:closed reason:duplicate`)}&sort=created&order=desc&per_page=100&page=${page}`);
    dupNumbers.push(...r.items.map((i) => i.number));
    if (r.items.length < 100) break;
    await sleep(2100);
  }

  // 2. Resolve each duplicate to its canonical.
  let resolved = 0;
  for (const n of dupNumbers) {
    if (resolved >= duplicates) break;
    const d = (await graphql(DUP_QUERY, { owner, name, n })).data?.repository?.issue;
    if (!d) continue;
    let canonical = d.timelineItems.nodes.map((x) => x.canonical?.number).find(Boolean);
    if (!canonical) {
      for (const c of d.comments.nodes) {
        if (!["OWNER", "MEMBER", "COLLABORATOR", "CONTRIBUTOR"].includes(c.authorAssociation)) continue;
        const m = c.body.match(/duplicate (?:of )?(?:#|https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/(?:issues|pull)\/)(\d+)/i);
        if (m) { canonical = Number(m[1]); break; }
      }
    }
    if (!canonical || canonical === n) continue;
    const cid = `${repo}#${canonical}`;
    if (!docs.has(cid)) {
      const c = (await graphql(ISSUE_QUERY, { owner, name, n: canonical })).data?.repository?.issueOrPullRequest;
      if (!c) continue;
      docs.set(cid, toDoc(repo, c, c.__typename === "PullRequest"));
    }
    queries.push({
      id: `${repo}#${n}`,
      repo,
      title: d.title,
      body: cleanBody(d.body),
      labels: d.labels.nodes.map((l) => l.name),
      createdAt: d.createdAt,
      relevant: [cid],
    });
    resolved++;
    if (resolved % 20 === 0) console.log(`  ${resolved} pairs`);
  }

  // 3. Distractors: recent issues and PRs, excluding the duplicates themselves.
  const dupIds = new Set(queries.map((q) => q.id));
  for (let page = 1; page <= distractorPages; page++) {
    const items = await gh(`/repos/${repo}/issues?state=all&sort=created&direction=desc&per_page=100&page=${page}`);
    for (const i of items) {
      const id = `${repo}#${i.number}`;
      if (dupIds.has(id) || docs.has(id)) continue;
      docs.set(id, toDoc(repo, { ...i, labels: i.labels }, !!i.pull_request));
    }
    if (items.length < 100) break;
  }
  console.log(`  corpus so far ${docs.size}, queries ${queries.length}`);
}

const out = {
  version: "github-dups-v1",
  builtAt: new Date().toISOString(),
  source: "GitHub issues closed as duplicate; relevance from MarkedAsDuplicateEvent or maintainer 'Duplicate of #N' comments.",
  repos: REPOS.map((r) => r.repo),
  docs: [...docs.values()].sort((a, b) => (a.id < b.id ? -1 : 1)),
  queries,
};
writeFileSync(OUT, JSON.stringify(out));
console.log(`\nwrote ${OUT}: ${out.docs.length} docs, ${out.queries.length} queries`);
