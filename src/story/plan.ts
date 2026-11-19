/**
 * Story planning: a parsed document becomes a sequence of beats to scroll
 * through, each with one thing to say and the one chart that says it.
 *
 * The taste lives here, as rules, so it is the same every time and can be
 * tested (src/story/DESIGN.md explains each one):
 *
 *  1. One idea per screen. A beat has a line, a big word, and at most one chart.
 *  2. Only what the document says. Nothing is drawn that the source didn't state;
 *     a value the parser can't read as a number is shown as words, never guessed.
 *  3. Never two units on one axis. Each measure gets its own scale, from zero.
 *  4. A chart only when it beats a sentence: two or more readable measures, two or
 *     more phases, a link between a decision and its work. Otherwise prose.
 *  5. Counts are words up to twelve ("three choices"), digits after.
 *  6. Colour fields alternate light and dark so each beat reads as a new page,
 *     and the accent appears once per beat.
 */
import type {
  ActionsPayload,
  DecisionsPayload,
  MemoryDocument,
  RisksPayload,
  SignalsPayload,
  SnapshotPayload,
  TimelinePayload,
} from "@/domain/memory/schema";

interface Payloads { snapshot: SnapshotPayload; signals: SignalsPayload; timeline: TimelinePayload; decisions: DecisionsPayload; risks: RisksPayload; actions: ActionsPayload }

export type Field = "moss" | "oat" | "butter" | "clay" | "night";

export interface Measure {
  label: string;
  /** The value exactly as the source wrote it. */
  shown: string;
  /** Read as a number, when it can be. */
  now: number | null;
  /** The value before the change, when the delta states it in a unit we can read. */
  before: number | null;
  delta?: string;
  trend?: "up" | "flat" | "down";
  implication?: string;
}

export interface Phase {
  date: string;
  title: string;
  state?: "shipped" | "on-track" | "planned" | "done";
  produces?: string;
  /** Index of the phase whose output this one needs, when the source names it. */
  needs: number | null;
}

export interface Choice {
  ref?: string;
  text: string;
  status?: "approved" | "requested" | "proposed" | "rejected";
  /** The stamp's word when it isn't a decision's status: "found" for a paper's findings. */
  stamp?: string;
  because?: string;
  /** Actions that carry this decision out. */
  work: Array<{ task: string; owner?: string; due?: string; status?: string }>;
}

export interface Pressure {
  risk: string;
  severity?: "high" | "medium" | "low";
  because?: string;
  consequence?: string;
  mitigation?: string;
}

export type Beat =
  | { kind: "open"; field: Field; eyebrow: string; title: string; line: string; hook?: string; byline?: string }
  | { kind: "numbers"; field: Field; eyebrow: string; big: string; line: string; measures: Measure[]; chart: "bars" | "words" }
  | { kind: "path"; field: Field; eyebrow: string; big: string; line: string; phases: Phase[] }
  | { kind: "choices"; field: Field; eyebrow: string; big: string; line: string; choices: Choice[] }
  | { kind: "pressure"; field: Field; eyebrow: string; big: string; line: string; risks: Pressure[] }
  | { kind: "next"; field: Field; eyebrow: string; big: string; line: string; tasks: Array<{ task: string; owner?: string; due?: string; status?: string }> }
  | { kind: "close"; field: Field; eyebrow: string; line: string; source: string; blocks: number };

export interface Story {
  title: string;
  beats: Beat[];
}

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
/** "three choices", "one risk": counts read as words, digits only past twelve. */
export const count = (n: number, one: string, many = `${one}s`) => `${WORDS[n] ?? n} ${n === 1 ? one : many}`;

/** First sentence, for a line that has to fit on a screen. */
export function firstSentence(text: string, max = 180): string {
  const m = /^(.+?[.!?])(\s|$)/.exec(text.trim());
  const s = (m?.[1] ?? text).trim();
  return s.length <= max ? s : `${s.slice(0, s.lastIndexOf(" ", max - 1))}…`;
}

const NUM = /^([^\d\-+.]*?)\s*([-+]?\d[\d,]*(?:\.\d+)?)\s*([a-zA-Z%]*)\s*(.*)$/;
const SCALE: Record<string, number> = { k: 1e3, K: 1e3, m: 1e6, M: 1e6, b: 1e9, B: 1e9, bn: 1e9 };

/** "$4.2M" → 4.2e6, "121%" → 121, "19 mo" → 19. Anything else → null. */
export function readNumber(v: string | number | undefined): { n: number; unit: string } | null {
  if (typeof v === "number") return Number.isFinite(v) ? { n: v, unit: "" } : null;
  if (!v) return null;
  const m = NUM.exec(v.trim());
  if (!m) return null;
  const [, pre = "", digits = "", suf = "", rest = ""] = m;
  if (rest && !/^[a-z]{1,6}$/i.test(rest)) return null; // "34 people in 3 cities" is a sentence, not a number
  let n = Number(digits.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const scale = SCALE[suf];
  if (scale) n *= scale;
  const unit = suf === "%" ? "%" : scale ? pre.trim() : `${pre.trim()}${suf || rest}`;
  return { n, unit };
}

/**
 * The value before a stated change, only when the delta's unit makes it exact:
 * a percentage of a non-percentage ("+18%" on "$4.2M"), points on a percentage
 * ("+6 pts" on "121%"), or the same unit ("+2 mo" on "19 mo", "+5" on "34").
 */
export function beforeOf(value: string | number | undefined, delta: string | number | undefined): number | null {
  const now = readNumber(value);
  if (!now || delta === undefined || delta === "") return null;
  if (typeof delta === "number") return now.n - delta;
  const d = /^([-+−])\s*(\d+(?:\.\d+)?)\s*(%|pts?|points?|[a-z]+)?$/i.exec(delta.trim());
  if (!d) return null;
  const sign = d[1] === "+" ? 1 : -1;
  const x = Number(d[2]) * sign;
  const unit = (d[3] ?? "").toLowerCase();
  if (unit === "%" && now.unit !== "%") return now.n / (1 + x / 100);
  if (/^p(oin)?ts?$/.test(unit) && now.unit === "%") return now.n - x;
  if (unit === "" || now.unit.toLowerCase().endsWith(unit)) return now.n - x;
  return null;
}

/** Each kind of beat has its own field, so the same kind of page always looks the same. */
const FIELD: Record<Beat["kind"], Field> = { open: "moss", numbers: "oat", path: "night", choices: "butter", pressure: "clay", next: "oat", close: "moss" };

export function planStory(doc: MemoryDocument): Story {
  // A block's payload matches its kind (the schema checks it on import).
  const block = <K extends keyof Payloads>(k: K) => {
    const b = doc.blocks.find((x) => x.kind === k);
    return b ? { payload: b.payload as Payloads[K] } : undefined;
  };
  const beats: Beat[] = [];

  const snap = block("snapshot")?.payload;
  beats.push({
    kind: "open",
    field: FIELD.open,
    eyebrow: doc.sourceLabel || doc.title,
    title: snap?.heading ?? doc.title,
    line: firstSentence(snap?.summary ?? doc.title),
    ...(snap?.hook ? { hook: snap.hook } : {}),
    ...(snap?.byline ? { byline: snap.byline } : {}),
  });

  // A paper's story is what it found, what it measured and where it stops,
  // not what moved and what was decided.
  const findings = (block("timeline")?.payload.entries ?? []).filter((t) => t.observationKind === "research-finding");
  const paper = findings.length > 0;
  if (findings.length) {
    const shown = findings.filter((f) => f.title !== snap?.hook).slice(0, 5);
    if (shown.length) {
      beats.push({
        kind: "choices",
        field: FIELD.choices,
        eyebrow: "what it found",
        big: `${count(shown.length, "finding")}.`,
        line: "In the paper's own words, strongest first.",
        choices: shown.map((f) => ({ text: f.title, stamp: "found", work: [] })),
      });
    }
  }

  const signals = (block("signals")?.payload.entries ?? []).filter((s) => !s.facet && (!paper || s.value !== undefined));
  if (signals.length) {
    const measures: Measure[] = signals.slice(0, 6).map((s) => ({
      label: s.label,
      shown: s.value === undefined ? s.label : String(s.value),
      now: readNumber(s.value)?.n ?? null,
      before: beforeOf(s.value, s.delta),
      ...(s.delta !== undefined && s.delta !== "" ? { delta: String(s.delta) } : {}),
      ...(s.trend ? { trend: s.trend } : {}),
      ...(s.implication ? { implication: s.implication } : {}),
    }));
    const readable = measures.filter((m) => m.now !== null && m.before !== null);
    const moved = measures.filter((m) => m.trend && m.trend !== "flat").length;
    beats.push({
      kind: "numbers",
      field: FIELD.numbers,
      eyebrow: paper ? "what it measured" : "what moved",
      big: paper ? `${count(measures.length, "result")}.` : moved ? `${count(moved, "number")} moved.` : `${count(measures.length, "signal")}.`,
      line: measures.find((m) => m.implication)?.implication ?? "What the document measured, as it wrote it.",
      measures,
      chart: readable.length >= 2 ? "bars" : "words",
    });
  }

  const timeline = (block("timeline")?.payload.entries ?? []).filter((t) => !t.facet && !t.observationKind);
  if (timeline.length >= 2) {
    const phases: Phase[] = timeline.slice(0, 8).map((t, i, all) => ({
      date: t.date,
      title: t.title,
      ...(t.state ? { state: t.state } : {}),
      ...(t.produces ? { produces: t.produces } : {}),
      needs: t.requires ? (() => { const j = all.findIndex((o, k) => k < i && o.produces === t.requires); return j < 0 ? null : j; })() : null,
    }));
    const done = phases.filter((p) => p.state === "shipped" || p.state === "done").length;
    beats.push({
      kind: "path",
      field: FIELD.path,
      eyebrow: "how it got here",
      big: done ? `${WORDS[done] ?? done} of ${WORDS[phases.length] ?? phases.length} done.` : `${count(phases.length, "step")}.`,
      line: phases.some((p) => p.needs !== null) ? "Each step needed what the one before it produced." : "In the order the document gives.",
      phases,
    });
  }

  const actions = (block("actions")?.payload.entries ?? []).filter((a) => !a.facet);
  const decisions = (block("decisions")?.payload.entries ?? []).filter((d) => !d.facet && d.status !== "rejected");
  const used = new Set<number>();
  if (decisions.length) {
    const choices: Choice[] = decisions.slice(0, 6).map((d) => {
      const work = actions
        .map((a, i) => ({ a, i }))
        .filter(({ a }) => a.from !== undefined && (a.from === d.ref || a.from === d.text))
        .map(({ a, i }) => { used.add(i); return { task: a.task, ...(a.owner ? { owner: a.owner } : {}), ...(a.due ? { due: a.due } : {}), ...(a.status ? { status: a.status } : {}) }; });
      return { ...(d.ref ? { ref: d.ref } : {}), text: d.text, ...(d.status ? { status: d.status } : {}), ...(d.because ? { because: d.because } : {}), work };
    });
    const settled = choices.filter((c) => c.status === "approved").length;
    const open = choices.length - settled;
    beats.push({
      kind: "choices",
      field: FIELD.choices,
      eyebrow: "what was decided",
      big: settled && open ? `${WORDS[settled] ?? settled} decided, ${WORDS[open] ?? open} open.` : `${count(choices.length, "choice")}.`,
      line: choices.some((c) => c.work.length) ? "And the work each one set moving." : firstSentence(choices[0]!.because ?? choices[0]!.text),
      choices,
    });
  }

  const risks = (block("risks")?.payload.entries ?? []).filter((r) => !r.facet);
  if (risks.length) {
    const order = { high: 0, medium: 1, low: 2 } as const;
    const sorted = [...risks].sort((a, b) => (order[a.severity ?? "low"] + (a.severity ? 0 : 3)) - (order[b.severity ?? "low"] + (b.severity ? 0 : 3)));
    const top = sorted[0]!;
    beats.push({
      kind: "pressure",
      field: FIELD.pressure,
      eyebrow: paper ? "where it stops" : "what could stop it",
      big: paper ? `${count(risks.length, "limit")}.` : top.severity === "high" ? "one thing could stop it." : `${count(risks.length, "risk")} to watch.`,
      line: top.consequence ? `${sentence(top.risk)} Left alone, ${lower(top.consequence)}.` : sentence(top.risk),
      risks: sorted.slice(0, 5).map((r) => ({ risk: r.risk, ...(r.severity ? { severity: r.severity } : {}), ...(r.because ? { because: r.because } : {}), ...(r.consequence ? { consequence: r.consequence } : {}), ...(r.mitigation ? { mitigation: r.mitigation } : {}) })),
    });
  }

  const rest = actions.filter((a, i) => !used.has(i) && a.status !== "done");
  if (rest.length) {
    beats.push({
      kind: "next",
      field: FIELD.next,
      eyebrow: "what happens next",
      big: `${count(rest.length, "thing")} next.`,
      line: rest.every((a) => a.owner) ? (rest.length === 1 ? "With a name against it." : "Each with a name against it.") : "Some of it not yet assigned to anyone.",
      tasks: rest.slice(0, 6).map((a) => ({ task: a.task, ...(a.owner ? { owner: a.owner } : {}), ...(a.due ? { due: a.due } : {}), ...(a.status ? { status: a.status } : {}) })),
    });
  }

  beats.push({
    kind: "close",
    field: FIELD.close,
    eyebrow: "where this came from",
    line: snap?.hook ?? firstSentence(snap?.summary ?? doc.title),
    source: doc.sourceLabel,
    blocks: doc.blocks.length,
  });

  // Rule 6: no two neighbours share a field (a skipped beat can bring two together).
  for (let i = 1; i < beats.length; i++) if (beats[i]!.field === beats[i - 1]!.field) beats[i]!.field = beats[i - 1]!.field === "oat" ? "night" : "oat";
  return { title: snap?.heading ?? doc.title, beats };
}

const sentence = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);
const lower = (s: string) => s.replace(/[.\s]+$/, "").replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase());
