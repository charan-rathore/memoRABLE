/**
 * Small, dependency-free language primitives shared by the understanding
 * layer.
 *
 * None of this is natural language processing in the academic sense. It is a
 * set of conservative surface heuristics chosen because they fail quietly:
 * every function here either recognizes something clearly or returns nothing,
 * so a caller can never be handed a confident guess.
 */

/** Words that carry structure rather than meaning; dropped before scoring. */
const STOPWORDS = new Set([
  "a", "about", "above", "across", "after", "again", "against", "all", "almost", "also",
  "although", "always", "among", "an", "and", "another", "any", "anything", "are", "around", "as",
  "at", "back", "be", "because", "been", "before", "being", "below", "best", "better", "between",
  "both", "but", "by", "came", "can", "cannot", "come", "could", "did", "do", "does", "doing",
  "done", "down", "during", "each", "either", "else", "enough", "even", "ever", "every", "few",
  "for", "from", "further", "get", "gets", "give", "go", "goes", "going", "good", "got", "had",
  "has", "have", "having", "he", "her", "here", "hers", "him", "his", "how", "however", "i", "if",
  "in", "including", "instead", "into", "is", "it", "its", "itself", "just", "keep", "kind",
  "know", "least", "less", "let", "like", "little", "long", "made", "make", "makes", "making",
  "many", "may", "me", "might", "more", "most", "much", "must", "my", "need", "needs", "never",
  "new", "next", "no", "nor", "not", "now", "of", "off", "often", "on", "once", "one", "only",
  "onto", "or", "other", "others", "our", "out", "over", "own", "per", "put", "rather", "really",
  "same", "see", "seen", "several", "shall", "she", "should", "since", "so", "some", "something",
  "still", "such", "sure", "take", "takes", "than", "that", "the", "their", "them", "then",
  "there", "these", "they", "thing", "things", "this", "those", "though", "through", "thus", "to",
  "too", "toward", "under", "until", "up", "upon", "us", "use", "used", "uses", "using", "very",
  "want", "was", "way", "we", "well", "were", "what", "when", "where", "whether", "which", "while",
  "who", "whom", "why", "will", "with", "within", "without", "would", "yet", "you", "your",
]);

export function isStopword(word: string): boolean {
  return STOPWORDS.has(word.toLowerCase());
}

/** Lowercase alphanumeric tokens, punctuation and possessives removed. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .split(/[^a-z0-9+#.]+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter((t) => t.length > 0);
}

/** Content tokens: no stopwords, no bare numbers, nothing shorter than three. */
export function contentTokens(text: string): string[] {
  return tokenize(text).filter((t) => t.length >= 3 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

/**
 * Crude suffix stripping, used only when deciding whether two memories are
 * about the same thing.
 *
 * "Dual-source the actuators" and "sign the dual-sourcing contract" are one
 * decision and the action that carries it out, and a matcher that compares
 * whole words cannot see it. This is not a real stemmer and does not need to
 * be: it runs on both sides of a comparison, so it only has to be wrong in
 * the same way twice.
 */
const SUFFIXES = ["ations", "ation", "ingly", "ising", "izing", "ings", "ing", "edly", "ed", "ies", "ies", "es", "s", "ly", "ments", "ment", "ness"];

export function stem(word: string): string {
  let out = word.toLowerCase();
  if (out.length <= 4) return out;
  for (const suffix of SUFFIXES) {
    if (out.length - suffix.length >= 3 && out.endsWith(suffix)) {
      out = out.slice(0, -suffix.length);
      break;
    }
  }
  return out.endsWith("e") && out.length > 4 ? out.slice(0, -1) : out;
}

/** Content tokens reduced to stems, for same-thing comparisons. */
export function stemTokens(text: string): string[] {
  return contentTokens(text).map(stem);
}

/** A comparison key that ignores case, punctuation and spacing. */
export function normalizeKey(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

/**
 * Split prose into sentences. Abbreviations and decimals are the usual way a
 * naive splitter embarrasses itself, so both are held together explicitly.
 */
const ABBREVIATIONS = /\b(?:e\.g|i\.e|etc|vs|approx|fig|no|mr|mrs|ms|dr|prof|inc|ltd|co|st|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.$/i;

export function splitSentences(text: string): string[] {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat === "") return [];
  const out: string[] = [];
  let buffer = "";
  const parts = flat.split(/(?<=[.!?])\s+/);
  for (const part of parts) {
    buffer = buffer === "" ? part : `${buffer} ${part}`;
    // A decimal point or a known abbreviation is not the end of a thought.
    if (ABBREVIATIONS.test(buffer) || /\d\.$/.test(buffer)) continue;
    out.push(buffer.trim());
    buffer = "";
  }
  if (buffer.trim() !== "") out.push(buffer.trim());
  return out.filter((s) => s.length > 0);
}

/** Jaccard overlap of content tokens. Used to recognize restated material. */
export function overlap(a: string, b: string): number {
  const left = new Set(contentTokens(a));
  const right = new Set(contentTokens(b));
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared++;
  return shared / (left.size + right.size - shared);
}

/** Two statements say the same thing when most of their content words agree. */
export function saysTheSame(a: string, b: string): boolean {
  if (normalizeKey(a) === normalizeKey(b)) return true;
  return overlap(a, b) >= 0.72;
}

/**
 * Drop restatements, keeping the first phrasing of each idea. Documents repeat
 * themselves constantly, and a memory that repeats with them is a transcript.
 */
export function dedupeByMeaning<T>(items: readonly T[], textOf: (item: T) => string): T[] {
  const kept: T[] = [];
  for (const item of items) {
    const text = textOf(item);
    if (text.trim() === "") continue;
    if (kept.some((k) => saysTheSame(textOf(k), text))) continue;
    kept.push(item);
  }
  return kept;
}

/**
 * Normalize requirement phrasing so Key Requirements and Acceptance Criteria
 * that restate the same product rule collapse to one memory.
 */
export function normalizeDecisionText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/\b(po|indent|grn)\s+list\s+views?\b/g, "list view")
    .replace(/\blist\s+views?\b/g, "list view")
    .replace(/\bauto-?increments?\b/g, "auto increment")
    .replace(/\brevision\s+numbers?\b/g, "revision number")
    .replace(/\bwith each edit\b/g, "")
    .replace(/\bremain(?:s)? intact\b/g, "preserve")
    .replace(/\bpreserve[sd]?\b/g, "preserve")
    .replace(/\blinked advances\b/g, "linked advance")
    .replace(/\bapproval workflows?\b/g, "approval workflow")
    .replace(/\bconfigurable\b/g, "")
    .replace(/\bvisible in\b/g, "visible")
    .replace(/\bshows?\b/g, "show")
    .replace(/\bincludes?\b/g, "include")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Distinctive requirement phrases that identify the same product rule. */
const DECISION_ANCHORS = [
  "edited on",
  "edited by",
  "revision number",
  "auto increment",
  "linked advance",
  "approval workflow",
  "edit history",
  "visual indicator",
  "pdf export",
  "editor name",
  "edit button",
  "amend po",
  "grn creation",
] as const;

/**
 * Decisions restated across sections need a looser match than generic prose:
 * "Edited On columns visible in list views" ≈ "…visible in PO list view".
 */
export function sameDecision(a: string, b: string): boolean {
  if (saysTheSame(a, b)) return true;
  const na = normalizeDecisionText(a);
  const nb = normalizeDecisionText(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) {
    const shorter = na.length <= nb.length ? na : nb;
    if (contentTokens(shorter).length >= 3) return true;
  }
  const left = new Set(stemTokens(na));
  const right = new Set(stemTokens(nb));
  if (left.size === 0 || right.size === 0) return false;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared++;
  const ratio = shared / Math.min(left.size, right.size);
  if (shared >= 3 && ratio >= 0.62) return true;
  // Shared rule anchor + moderate stem overlap (Key Req ↔ Acceptance Criteria).
  // Refuse when each side carries a distinctive unshared anchor (e.g. auto-increment
  // vs pdf export both mentioning "revision number").
  const aAnchors = DECISION_ANCHORS.filter((p) => na.includes(p));
  const bAnchors = DECISION_ANCHORS.filter((p) => nb.includes(p));
  const sharedAnchors = aAnchors.filter((p) => bAnchors.includes(p));
  if (sharedAnchors.length === 0) return false;
  const aOnly = aAnchors.filter((p) => !bAnchors.includes(p));
  const bOnly = bAnchors.filter((p) => !aAnchors.includes(p));
  if (aOnly.length > 0 && bOnly.length > 0) return false;
  return shared >= 2 && ratio >= 0.45;
}

/** Section chrome / column headers that must never become Decisions. */
export function isDecisionChrome(text: string): boolean {
  const key = normalizeKey(text);
  if (!key) return true;
  if (
    /^(business impact|priority|feature|status|module|field|remarks?|rules?|note|summary|overview|context)$/i.test(
      key,
    )
  ) {
    return true;
  }
  // Bare status labels from Cases sheet chrome, not product rules.
  if (/^(po|grn|indent)\s*:\s*(delivery|payable|fulfilled)/i.test(key)) return true;
  return false;
}

/** Trim to a whole-word budget, ending on a word rather than mid-syllable. */
export function clampWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text.trim();
  return words.slice(0, maxWords).join(" ").replace(/[,;:]$/, "") + "...";
}

/**
 * Shorten a fragment for use inside a sentence.
 *
 * Unlike `clampWords` this leaves no ellipsis, because a trailing "..." in the
 * middle of a paragraph reads as a bug rather than as brevity. The cut is
 * taken at the last comma or dash if there is one, and any dangling function
 * word is dropped so the result still ends like a phrase.
 */
export function shorten(text: string, maxWords: number): string {
  const trimmed = unpunctuated(text);
  const words = trimmed.split(/\s+/);
  if (words.length <= maxWords) return trimmed;

  const head = words.slice(0, maxWords).join(" ");
  const breakAt = Math.max(head.lastIndexOf(","), head.lastIndexOf(" - "), head.lastIndexOf(";"));
  let out = breakAt > head.length * 0.5 ? head.slice(0, breakAt) : head;
  while (out.split(/\s+/).length > 2 && readsAsFragment(out)) {
    out = out.split(/\s+/).slice(0, -1).join(" ");
  }
  return unpunctuated(out);
}

const SPELLED = [
  "no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve",
];

/** Small counts read better as words inside a sentence a person would speak. */
export function spellCount(n: number): string {
  return SPELLED[n] ?? String(n);
}

/** Sentence case without touching acronyms or names already capitalized. */
export function sentenceCase(text: string): string {
  const trimmed = text.trim();
  if (trimmed === "") return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/** Strip a terminal period so a fragment can be composed into a longer line. */
export function unpunctuated(text: string): string {
  return text.trim().replace(/[.;,]+$/, "").trim();
}

/** Lowercase a leading word unless it looks like a proper noun or acronym. */
export function decapitalize(text: string): string {
  const trimmed = text.trim();
  const first = trimmed.split(/\s+/)[0] ?? "";
  if (first.length > 1 && first === first.toUpperCase()) return trimmed;
  if (/^[A-Z][a-z]+[A-Z]/.test(first)) return trimmed;
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
}

/**
 * Words a clause must not end on.
 *
 * Clipping a sentence to a word budget is how a phrase like "the objective is
 * to" survives into a summary, where it reads as a sentence someone forgot to
 * finish. A fragment is dropped rather than patched, because there is no
 * honest way to guess the half that is missing.
 */
const DANGLING =
  /\b(?:a|an|the|to|of|for|with|in|on|at|by|from|and|or|but|is|are|was|were|be|been|that|this|which|as|into|than|then|so|its|their|our|your|it)$/i;

export function readsAsFragment(text: string): boolean {
  const trimmed = unpunctuated(text);
  if (trimmed === "") return true;
  if (wordCount(trimmed) < 2) return true;
  return DANGLING.test(trimmed);
}

/**
 * Join a list the way a person speaks one: "a, b and c". No serial comma, and
 * no trailing "and" when there is nothing to join.
 */
export function speakList(items: readonly string[]): string {
  const clean = items.map((i) => i.trim()).filter((i) => i.length > 0);
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean[0]!;
  return `${clean.slice(0, -1).join(", ")} and ${clean[clean.length - 1]}`;
}
