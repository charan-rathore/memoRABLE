/**
 * Technical text analysis.
 *
 * Engineering text is not prose: it mixes identifiers (useEffect,
 * ERR_REQUIRE_ESM, fs.readFileSync), paths (next/navigation), versions
 * (16.4.5), error codes (TS2345) and stack traces. A prose tokenizer either
 * glues these into one rare token nobody types, or shreds them into noise.
 *
 * This analyzer emits both views of a compound: the whole token (exact
 * matches, error codes) and its parts (people type "read file sync", not
 * "readFileSync"). Parts are stemmed; wholes are not.
 */

const STOP = new Set(
  (
    "a about above after again all also am an and any are as at be because been before being below between both but by can " +
    "could did do does doing down during each few for from further had has have having he her here hers him his how i if in " +
    "into is it its itself just me more most my no nor not now of off on once only or other our ours out over own same she " +
    "should so some such than that the their theirs them then there these they this those through to too under until up very " +
    "was we were what when where which while who whom why will with would you your yours " +
    // issue-tracker filler that carries no topic
    "please thanks thank hi hello using use used get got getting seems seem like try tried trying want would also still"
  ).split(" "),
);

// Identifier-ish runs: words, dotted/slashed paths, versions, error codes.
const TOKEN_RE = /[A-Za-z_$@][\w$@-]*(?:[./:\\][\w$@-]+)*|\d+(?:\.\d+)+[a-z0-9-]*|\d+/g;

export function stem(w: string): string {
  if (w.length <= 3 || /\d/.test(w)) return w;
  let r = w;
  if (w.length > 4) {
    for (const [suf, rep] of [["ies", "y"], ["ing", ""], ["ed", ""], ["es", ""], ["s", ""]] as const) {
      if (w.endsWith(suf) && w.length - suf.length >= 3) { r = w.slice(0, -suf.length) + rep; break; }
    }
  }
  if (r.length >= 4 && r.endsWith("e")) r = r.slice(0, -1);
  return r;
}

/** Split camelCase, PascalCase, snake_case, kebab-case, dotted and slashed compounds. */
export function splitCompound(raw: string): string[] {
  return raw
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s._\-/:\\$@]+/)
    .filter(Boolean);
}

export interface AnalyzeOptions {
  /** Emit whole compound tokens in addition to parts (default true). */
  wholes?: boolean;
}

/** Text to index terms. Deterministic; order preserved (duplicates kept for tf). */
export function analyze(text: string, opts: AnalyzeOptions = {}): string[] {
  const wholes = opts.wholes ?? true;
  const out: string[] = [];
  for (const m of text.normalize("NFKC").matchAll(TOKEN_RE)) {
    const raw = m[0];
    if (/^\d+$/.test(raw)) {
      // Bare numbers: keep short ones (status codes, ports), drop ids/timestamps.
      if (raw.length <= 4) out.push(raw);
      continue;
    }
    if (/^\d+(?:\.\d+)+/.test(raw)) { out.push(raw.toLowerCase()); continue; } // version
    const parts = splitCompound(raw);
    const lower = raw.toLowerCase();
    const isCompound = parts.length > 1;
    if (isCompound && wholes && lower.length <= 48) out.push(lower);
    for (const p of parts) {
      const w = p.toLowerCase();
      if (w.length < 2 || STOP.has(w)) continue;
      if (/^\d+$/.test(w) && w.length > 4) continue;
      out.push(stem(w));
    }
  }
  return out;
}

/** Unique query terms with their in-query frequency (long queries repeat terms). */
export function queryTerms(text: string): Map<string, number> {
  const qtf = new Map<string, number>();
  for (const t of analyze(text)) qtf.set(t, (qtf.get(t) ?? 0) + 1);
  return qtf;
}
