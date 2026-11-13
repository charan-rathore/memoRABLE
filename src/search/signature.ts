/**
 * Error signatures.
 *
 * Two reports of the same failure rarely share wording, but they usually
 * share the error line once the incidental parts are removed: paths, line
 * numbers, addresses, ids and quoted values. This is the same idea crash
 * reporters use to group events (fingerprinting), applied to issue text.
 */

const ERROR_LINE = /(?:\b[A-Z][A-Za-z]*(?:Error|Exception)\b|\bERR_[A-Z0-9_]+\b|\bE\d{3,5}\b|\bTS\d{4}\b|\bpanic(?:ked)?\b|\bTraceback\b|\bUnhandled\b|\bModule not found\b|\bCannot (?:find|read|resolve)\b|\bfailed to (?:compile|load|resolve|fetch)\b|\bsegmentation fault\b|\bnot a function\b|\bis not defined\b)/;

export function normalizeErrorLine(line: string): string {
  return line
    .replace(/https?:\/\/\S+/g, "<url>")
    .replace(/(?:[A-Za-z]:)?(?:[\\/][\w.@+-]+){2,}(?::\d+(?::\d+)?)?/g, "<path>")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<uuid>")
    .replace(/\b0x[0-9a-f]+\b/gi, "<hex>")
    .replace(/(["'`])(?:(?!\1).){1,80}\1/g, "<q>")
    .replace(/\b\d+(?:\.\d+)*\b/g, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 160);
}

/** Error lines found in the text, normalized; at most `max`, most specific first. */
export function errorSignatures(text: string, max = 3): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^(?:[>$#]|at\s)\s*/, "");
    if (line.length < 8 || line.length > 400 || !ERROR_LINE.test(line)) continue;
    const sig = normalizeErrorLine(line);
    // A signature that is only placeholders identifies nothing.
    if (sig.replace(/<\w+>|[^a-z]/g, "").length < 6 || seen.has(sig)) continue;
    seen.add(sig);
    out.push(sig);
    if (out.length >= max) break;
  }
  return out;
}

/** FNV-1a, stable across runs and platforms. */
export function hashSignature(sig: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < sig.length; i++) { h ^= sig.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}
