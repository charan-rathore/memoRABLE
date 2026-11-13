import { analyze } from "./analyze";

/**
 * A small, curated equivalence lexicon for engineering vocabulary: the
 * abbreviations and synonyms people actually alternate between when they
 * describe the same problem. Expansion happens at query time only, at a
 * reduced weight, so exact wording still wins. Whether it helps is decided by
 * the benchmark (arm `bm25f+lex`), not assumed.
 */
const GROUPS: string[][] = [
  ["k8s", "kubernetes"], ["ts", "typescript"], ["js", "javascript"], ["py", "python"],
  ["env", "environment"], ["env var", "environment variable"], ["config", "configuration", "settings"],
  ["oom", "out of memory", "heap out of memory"], ["crash", "crashes", "segfault", "segmentation fault"],
  ["hang", "freeze", "unresponsive", "stuck"], ["slow", "lag", "latency", "performance"],
  ["ssr", "server side rendering", "server rendering"], ["csr", "client side rendering"],
  ["hmr", "hot reload", "fast refresh", "hot module replacement"], ["rsc", "react server components", "server components"],
  ["auth", "authentication", "login", "sign in"], ["authz", "authorization", "permission"],
  ["db", "database"], ["repo", "repository"], ["pr", "pull request"], ["ci", "continuous integration", "pipeline"],
  ["deps", "dependencies", "dependency"], ["pkg", "package"], ["npm", "node package manager"],
  ["dir", "directory", "folder"], ["cwd", "working directory"], ["fs", "file system", "filesystem"],
  ["ws", "websocket"], ["http2", "h2"], ["tls", "ssl", "https certificate"],
  ["cors", "cross origin"], ["csp", "content security policy"], ["xss", "cross site scripting"],
  ["ui", "interface"], ["ux", "user experience"], ["a11y", "accessibility", "screen reader"], ["i18n", "internationalization", "translation"],
  ["dark mode", "dark theme"], ["keybinding", "shortcut", "hotkey", "keyboard shortcut"],
  ["intellisense", "autocomplete", "completion", "suggestion"], ["lint", "linter", "eslint"],
  ["ext", "extension", "plugin"], ["terminal", "shell", "console"], ["debugger", "debugging", "breakpoint"],
  ["wsl", "windows subsystem for linux"], ["mac", "macos", "osx"], ["win", "windows"],
  ["build fails", "build error", "compile error", "compilation error"], ["404", "not found"], ["500", "internal server error"],
  ["redirect", "redirection"], ["middleware", "proxy"], ["cache", "caching", "revalidate", "stale"],
  ["image", "img", "picture"], ["font", "typeface"], ["css", "styles", "stylesheet"],
  ["route", "routing", "router"], ["app router", "app dir", "app directory"], ["pages router", "pages dir"],
  ["edge runtime", "edge function"], ["serverless", "lambda", "function"], ["turbopack", "turbo"],
  ["webpack", "bundler"], ["memory leak", "leak", "memory growth"], ["regression", "broke after upgrade", "worked before"],
];

const index = new Map<string, string[][]>();
for (const g of GROUPS) {
  const analyzed = g.map((p) => analyze(p, { wholes: false }));
  for (const a of analyzed) {
    const key = a.join(" ");
    if (!key) continue;
    index.set(key, [...(index.get(key) ?? []), ...analyzed.filter((x) => x.join(" ") !== key)]);
  }
}

/**
 * Expansion terms for an analyzed query. Matches single terms and adjacent
 * pairs/triples. Returns terms not already in the query.
 */
export function expand(queryTermsInOrder: string[]): string[] {
  const have = new Set(queryTermsInOrder);
  const add = new Set<string>();
  for (let n = 3; n >= 1; n--) {
    for (let i = 0; i + n <= queryTermsInOrder.length; i++) {
      const key = queryTermsInOrder.slice(i, i + n).join(" ");
      for (const alt of index.get(key) ?? []) for (const t of alt) if (!have.has(t)) add.add(t);
    }
  }
  return [...add];
}

export const LEXICON_SIZE = GROUPS.length;
