import { contentTokens, normalizeKey, splitSentences, unpunctuated } from "./language";

/**
 * Step one of understanding: what is this document *for*?
 *
 * Intent is decided before a single line is classified, because the same
 * sentence means different things in different documents. "Clean the data
 * first" is a decision in a playbook and an aside in a status report. Knowing
 * the shape of the document up front is what lets the later stages read
 * meaning instead of counting bullet points.
 */

export const DOCUMENT_INTENTS = [
  "guide",
  "plan",
  "review",
  "brief",
  "spec",
  "analysis",
  "notes",
] as const;

export type DocumentIntent = (typeof DOCUMENT_INTENTS)[number];

export interface Intent {
  kind: DocumentIntent;
  /** The verb this document performs, e.g. "teaches", "plans", "reviews". */
  verb: string;
  /** What the document is about, drawn from its title. */
  subject: string;
  /** True when the body is dominated by instructions rather than reporting. */
  instructional: boolean;
  /** True when the body is dominated by measured values. */
  measured: boolean;
  /** True when the body is organized around dates or ordered phases. */
  sequenced: boolean;
}

const TITLE_MARKERS: Array<[RegExp, DocumentIntent]> = [
  [/\b(guide|playbook|handbook|tutorial|how\s?to|walkthrough|workflow|method|framework|approach|cookbook|primer)\b/i, "guide"],
  [/\b(spec|specification|rfc|design\s+doc|architecture|requirements?|contract|standard)\b/i, "spec"],
  [/\b(plan|roadmap|schedule|phases?|milestones?|timeline|rollout|launch)\b/i, "plan"],
  [/\b(review|retro|retrospective|post\s?-?mortem|learnings?|results|report|recap|wrap\s?-?up)\b/i, "review"],
  [/\b(analysis|assessment|audit|study|research|teardown|deep\s?dive|investigation|diagnosis)\b/i, "analysis"],
  [/\b(brief|memo|summary|update|digest|overview|snapshot)\b/i, "brief"],
];

const VERB_FOR: Record<DocumentIntent, string> = {
  guide: "walks through",
  plan: "lays out",
  review: "takes stock of",
  brief: "brings you up to speed on",
  spec: "pins down",
  analysis: "works through",
  notes: "records",
};

/** Sentences that tell the reader to do something. */
const IMPERATIVE =
  /^(use|build|create|write|run|start|open|clean|check|add|remove|keep|make|set|pick|choose|avoid|never|always|do not|don't|prefer|ensure|define|split|group|review|send|ship|test|map|list|draft|treat|store|apply|focus|begin|finish|repeat|validate|verify|export|import|document|measure|track)\b/i;

/** A measured claim: a number attached to a unit, currency or percentage. */
const MEASURED =
  /[0-9]+\s*(%|pts?|pp\b|ms\b|bps\b|x\b|k\b|m\b|bn?\b)|[$€£₹]\s*[0-9]|[0-9]+(?:\.[0-9]+)?\s*(hours?|days?|weeks?|months?|users?|customers?|orders?)/i;

/** A time marker: a date, a quarter, or an ordered work unit. */
const SEQUENCED =
  /\b(phase|step|stage|milestone|sprint|week|day|quarter|q[1-4]\b|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|20\d\d-\d\d-\d\d)\b/i;

export interface IntentInput {
  title: string;
  /** Every heading in the document, in order. */
  headings: readonly string[];
  /** Every non-empty content line, in order. */
  lines: readonly string[];
}

export function readIntent(input: IntentInput): Intent {
  const { title, headings, lines } = input;
  const body = lines.join("\n");
  const sentences = lines.flatMap((line) => splitSentences(line));
  const total = Math.max(1, sentences.length);

  const instructionalCount = sentences.filter((s) => IMPERATIVE.test(s.trim())).length;
  const measuredCount = lines.filter((l) => MEASURED.test(l)).length;
  const sequencedCount = [...headings, ...lines].filter((l) => SEQUENCED.test(l)).length;

  const instructional = instructionalCount / total >= 0.22;
  const measured = measuredCount / Math.max(1, lines.length) >= 0.18;
  const sequenced = sequencedCount / Math.max(1, headings.length + lines.length) >= 0.12;

  return {
    kind: chooseKind({ title, headings, body, instructional, measured, sequenced }),
    verb: "",
    // Prefer a purpose sentence from the opening when the title only names the
    // document. "Finsight v3 Specification" tells you the binder; "a financial
    // advisor" tells you what the binder is for.
    subject: purposeFromBody(lines) || subjectOf(title),
    instructional,
    measured,
    sequenced,
  };
}

/**
 * "X is a fully deployable AI-powered financial advisor built to…"
 *
 * The first defining sentence of a document is usually the most honest subject
 * it has. When present, it beats a title that only names the binder.
 */
function purposeFromBody(lines: readonly string[]): string {
  for (const line of lines.slice(0, 12)) {
    const match =
      /\bis\s+(?:a|an)\s+(.{8,90}?)(?:\s+built\b|\s+designed\b|\s+meant\b|\s+intended\b|\s+created\b|[.;]|$)/i.exec(
        line,
      );
    if (!match) continue;
    const purpose = unpunctuated(match[1] ?? "").trim();
    if (contentTokens(purpose).length >= 2) return purpose;
  }
  return "";
}

/** Read intent and attach the verb that matches the chosen kind. */
export function understandIntent(input: IntentInput): Intent {
  const intent = readIntent(input);
  return { ...intent, verb: VERB_FOR[intent.kind] };
}

function chooseKind(args: {
  title: string;
  headings: readonly string[];
  body: string;
  instructional: boolean;
  measured: boolean;
  sequenced: boolean;
}): DocumentIntent {
  // The title is the author's own statement of intent, so it is trusted first.
  for (const [pattern, kind] of TITLE_MARKERS) {
    if (pattern.test(args.title)) return kind;
  }
  // Then the headings, which are the next most deliberate thing in a document.
  const headingText = args.headings.join(" ");
  for (const [pattern, kind] of TITLE_MARKERS) {
    if (pattern.test(headingText)) return kind;
  }
  // Only then does the body get a vote, and only where the shape is decisive.
  if (args.instructional && args.sequenced) return "guide";
  if (args.instructional) return "spec";
  if (args.measured) return "review";
  if (args.sequenced) return "plan";
  return "notes";
}

/**
 * The subject of the document, taken from its title with the document-type
 * noun removed. "Amazon KAM Assignment Guide" becomes "Amazon KAM assignments"
 * rather than repeating "guide" in a sentence that already says it teaches.
 */
const TYPE_NOUN =
  /\b(guide|playbook|handbook|tutorial|walkthrough|spec|specification|rfc|plan|roadmap|review|retro|retrospective|report|recap|analysis|assessment|audit|study|brief|memo|summary|update|overview|notes?|document|doc)\b/gi;

function subjectOf(title: string): string {
  const stripped = unpunctuated(
    title
      .replace(TYPE_NOUN, " ")
      .replace(/\s*[:|·]\s*/g, " ")
      .replace(/\s+/g, " "),
  ).trim();
  // Removing the type noun from "Pasted notes" leaves "Pasted", which names
  // nothing. When too little survives, the original title stands.
  if (contentTokens(stripped).length === 0) return unpunctuated(title);
  if (stripped.split(/\s+/).length < 2 && title.split(/\s+/).length > 1) return unpunctuated(title);
  return stripped;
}

/** True when two intents would produce the same opening sentence. */
export function sameIntent(a: Intent, b: Intent): boolean {
  return a.kind === b.kind && normalizeKey(a.subject) === normalizeKey(b.subject);
}
