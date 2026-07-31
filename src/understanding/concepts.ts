import { contentTokens, isStopword, normalizeKey, stem, stemTokens, tokenize } from "./language";

/**
 * Step two of understanding: what does this document keep coming back to?
 *
 * A concept is not the most frequent word. It is the idea that appears in the
 * most *places* — a term repeated ten times inside one paragraph is a writing
 * tic, while a term mentioned once in each of five sections is what the
 * document is actually about. Spread is therefore weighted above raw count.
 */

export interface Concept {
  /** The phrase as the document wrote it, in its most common casing. */
  phrase: string;
  /** How many times it appears. */
  count: number;
  /** How many distinct sections mention it. */
  spread: number;
  /** count x spread, the ranking used everywhere downstream. */
  weight: number;
}

export interface ConceptInput {
  /** Section titles carry disproportionate weight and are passed separately. */
  headings: readonly string[];
  /** Content grouped by section, so spread can be measured. */
  sections: readonly (readonly string[])[];
}

const MAX_PHRASE_WORDS = 3;
const MIN_SPREAD_FOR_THEME = 2;

/**
 * Words documents use to talk about themselves.
 *
 * "Phase", "task" and "section" are everywhere in a well-organized document
 * and tell you nothing about its subject. Counted naively they always win,
 * and the result is a summary that says the document is about being a
 * document. They are barred from standing alone, though they may still appear
 * inside a real phrase such as "data cleaning phase".
 */
const META_TERMS = new Set([
  "appendix", "chapter", "checklist", "column", "content", "context", "deliverable",
  "detail", "details", "diagram", "document", "documentation", "example", "examples",
  "figure", "goal", "goals", "heading", "implementation", "input", "inputs", "item",
  "items", "list", "note", "notes", "objective", "objectives", "outline", "output",
  "outputs", "overview", "page", "paragraph", "part", "phase", "phases", "point",
  "points", "process", "purpose", "requirement", "requirements", "result", "results",
  "scope", "section", "sections", "stage", "stages", "step", "steps", "structure",
  "summary", "table", "task", "tasks", "template", "version", "work",
]);

export function extractConcepts(input: ConceptInput, limit = 12): Concept[] {
  const counts = new Map<string, { display: string; count: number; sections: Set<number> }>();
  const heads = new Heads();

  const record = (phrase: string, sectionIndex: number, boost = 1) => {
    const key = normalizeKey(phrase);
    if (key.length < 3) return;
    const existing = counts.get(key);
    if (existing) {
      existing.count += boost;
      existing.sections.add(sectionIndex);
      return;
    }
    counts.set(key, { display: phrase.trim(), count: boost, sections: new Set([sectionIndex]) });
  };

  input.sections.forEach((lines, sectionIndex) => {
    for (const line of lines) {
      heads.read(line);
      for (const phrase of candidatePhrases(line)) record(phrase, sectionIndex);
    }
  });

  // A heading is the author naming a concept out loud; it counts for more.
  input.headings.forEach((heading, index) => {
    heads.read(heading);
    for (const phrase of candidatePhrases(heading)) record(phrase, index, 3);
  });

  const concepts: Concept[] = [];
  for (const entry of counts.values()) {
    const spread = entry.sections.size;
    if (entry.count < 2 && spread < MIN_SPREAD_FOR_THEME) continue;
    if (heads.endsMidName(entry.display)) continue;
    // "Fleet analytics" is worth more than "fleet" and "analytics" apart,
    // even though it can only ever be counted fewer times than either.
    const words = entry.display.trim().split(/\s+/).length;
    concepts.push({
      phrase: entry.display,
      count: entry.count,
      spread,
      weight: entry.count * Math.max(1, spread) * (1 + 0.6 * (words - 1)),
    });
  }

  concepts.sort((a, b) => b.weight - a.weight || b.spread - a.spread || a.phrase.localeCompare(b.phrase));
  return dropContainedPhrases(concepts).slice(0, limit);
}

/**
 * Which words can end a noun phrase, and which only ever lean on one.
 *
 * "Dual" is a real word that a document can repeat a dozen times, but it is
 * never what the document is about: it always arrives attached to something,
 * as in "dual-source" or "dual-sourcing". A summary that lists it as a theme
 * is quoting half a term. The test is positional rather than lexical, so it
 * needs no vocabulary and works on jargon the author invented: if a word is
 * always followed by another content word and never closes a phrase, it is a
 * modifier and cannot stand alone.
 */
class Heads {
  private readonly free = new Map<string, number>();
  private readonly followers = new Map<string, Set<string>>();

  read(line: string): void {
    const words = tokenize(line);
    words.forEach((word, index) => {
      const next = words[index + 1];
      const leansOnNext = next !== undefined && next.length >= 3 && !isStopword(next) && !/^\d/.test(next);
      if (!leansOnNext) {
        this.free.set(word, (this.free.get(word) ?? 0) + 1);
        return;
      }
      const seen = this.followers.get(word) ?? new Set<string>();
      // Stemmed, so "dual-source" and "dual-sourcing" count as one follower
      // rather than reading as a word that gets around.
      seen.add(stem(next));
      this.followers.set(word, seen);
    });
  }

  /**
   * True when a phrase stops on a word that never closes one.
   *
   * For a single word this catches the modifier itself ("dual"). For a run it
   * catches a window that opened in the right place and shut in the wrong one:
   * "Series B data" is three words of "Series B data room", and the giveaway
   * is that "data" is never the last thing said.
   *
   * The follower count is what keeps this from eating real terms. "Data" is
   * followed by "room" and nothing else, so the pair is one name and half of
   * it is meaningless. "Analytics" is followed by a launch, a tier and a
   * price, so it is a subject that happens to take modifiers, and dropping it
   * would lose the thing the document is most about.
   */
  endsMidName(phrase: string): boolean {
    const words = normalizeKey(phrase).split(" ");
    const last = words[words.length - 1] ?? "";
    if ((this.free.get(last) ?? 0) > 0) return false;
    return (this.followers.get(last)?.size ?? 0) === 1;
  }
}

/**
 * Candidate phrases from one line: single content words plus the two- and
 * three-word runs between them. Runs are what turn "data" and "dictionary"
 * into "data dictionary", which is the thing the reader remembers.
 */
function candidatePhrases(line: string): string[] {
  const words = tokenize(line);
  if (words.length === 0) return [];
  const out: string[] = [];

  for (const word of words) {
    if (word.length < 4 || isStopword(word) || META_TERMS.has(word)) continue;
    if (/^\d/.test(word)) continue;
    out.push(word);
  }

  for (let size = 2; size <= MAX_PHRASE_WORDS; size++) {
    for (let i = 0; i + size <= words.length; i++) {
      const run = words.slice(i, i + size);
      const first = run[0]!;
      const last = run[run.length - 1]!;
      // A phrase may not start or end on a stopword; "of the data" is noise.
      if (isStopword(first) || isStopword(last)) continue;
      // Nor on an initial or a bare letter: "Series B data room" is a thing,
      // "B data room" is where a naive window happened to open.
      if (first.length < 3 || last.length < 3) continue;
      // A concept is a name, and names do not end in a past-tense verb.
      // "Enterprise pilots converted" is a sentence about a concept, not the
      // concept, and quoting it back reads like a transcript.
      if (size > 1 && /[a-z]{2}ed$/.test(last)) continue;
      if (run.some((w) => /^\d+$/.test(w))) continue;
      if (run.join("").length < 8) continue;
      // A phrase made only of the words a document uses to describe itself is
      // still self-description, however many words it runs to.
      if (run.every((w) => META_TERMS.has(w) || isStopword(w))) continue;
      out.push(run.join(" "));
    }
  }
  return out;
}

/**
 * "data" and "data dictionary" are the same idea counted twice.
 *
 * Whichever ranked higher is already in `kept`, so any later phrase that
 * contains it or is contained by it is that same idea arriving again under a
 * different number of words. Listing both makes a summary read as though the
 * document had two subjects when it had one.
 */
function dropContainedPhrases(concepts: readonly Concept[]): Concept[] {
  const kept: Concept[] = [];
  for (const concept of concepts) {
    const key = ` ${normalizeKey(concept.phrase)} `;
    const words = new Set(stemTokens(concept.phrase));
    const swallowed = kept.some((k) => {
      const other = ` ${normalizeKey(k.phrase)} `;
      if (other === key || other.includes(key) || key.includes(other)) return true;
      // Two words in common is the same idea wearing a different collar.
      // "Fleet analytics" and "fleet-analytics pricing" are one theme, and a
      // reader who is told about both assumes there were two. One word in
      // common is left alone: "data room" and "data model" are not the same.
      const theirs = stemTokens(k.phrase);
      return theirs.filter((w) => words.has(w)).length >= 2;
    });
    if (!swallowed) kept.push(concept);
  }
  return kept;
}

/** The concepts a sentence is about, ranked by the document's own weighting. */
export function conceptsIn(sentence: string, concepts: readonly Concept[]): Concept[] {
  const key = normalizeKey(sentence);
  return concepts.filter((c) => key.includes(normalizeKey(c.phrase)));
}

/**
 * A short noun phrase naming what a line is about, used to label an inferred
 * memory. Falls back to the line's own leading words when no known concept is
 * present, and never to a phrase the line did not contain.
 */
export function labelFor(sentence: string, concepts: readonly Concept[], maxWords = 6): string {
  const matched = conceptsIn(sentence, concepts)[0];
  if (matched) return matched.phrase;
  const words = contentTokens(sentence).slice(0, maxWords);
  return words.length > 0 ? words.join(" ") : "";
}
