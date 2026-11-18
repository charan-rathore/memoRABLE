/**
 * The week, read from the log: what the Sunday letter says, as plain JSON values.
 *
 * Everything here is derived from the projection (`WorkspaceState`): no model, no
 * guesses. A replaced decision is shown as replaced, a deleted entry is never
 * shown, and the decision that comes back for a second look is the one FSRS says
 * you are most likely to have forgotten the reason for.
 */
import { DESIRED_RETENTION, dueOf, intervalDays, review } from "@/daily/fsrs";
import type { Entry, WorkspaceState } from "@/daily/types";

const DAY = 86_400_000;
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export interface LetterDecision {
  handle: string;
  text: string;
  /** Day of the week it was written, "mon".."sun". */
  day: string;
  /** Set when a later decision replaced it. */
  replacedBy?: string;
  replacedText?: string;
}

export interface LetterRecheck {
  handle: string;
  text: string;
  kind: "decided" | "learned";
  recordedOn: string;
  /** Predicted recall of the reason, 0–100. */
  recall: number;
  reviews: number;
  /** Days to the next check if you answer "still holds". */
  nextIfHolds: number;
}

export interface LetterValues {
  owner: string;
  /** Monday of the week, YYYY-MM-DD (UTC). */
  weekOf: string;
  weekEnd: string;
  /** ISO week number. */
  week: number;
  appUrl: string;
  worked: number;
  tasksDone: number;
  decided: LetterDecision[];
  learned: Array<{ handle: string; text: string }>;
  /** How many entries were written each day, Monday first. */
  days: number[];
  recheck?: LetterRecheck;
  /** How many more decisions or lessons are also due. */
  alsoDue: number;
}

export interface WeekOptions {
  owner?: string;
  appUrl?: string;
  /** Any moment inside the week to write; defaults to `now`. */
  weekContaining?: Date;
}

export function mondayOf(d: Date): Date {
  const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const dow = (new Date(t).getUTCDay() + 6) % 7; // Monday = 0
  return new Date(t - dow * DAY);
}

export function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dow + 3); // Thursday decides the year
  const firstThursday = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((t.getTime() - firstThursday.getTime()) / DAY - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
/** Letters quote what you wrote; trim only trailing punctuation the design adds back. */
const clean = (s: string) => s.replace(/\s+/g, " ").trim().replace(/[.。]+$/, "");

export function weekLetter(state: WorkspaceState, now: Date, opts: WeekOptions = {}): LetterValues {
  const start = mondayOf(opts.weekContaining ?? now);
  const end = new Date(start.getTime() + 7 * DAY);
  const inWeek = (iso: string) => {
    const t = Date.parse(iso);
    return t >= start.getTime() && t < end.getTime();
  };
  const live = [...state.entries.values()].filter((e) => !state.deleted.has(e.id));
  const thisWeek = live.filter((e) => inWeek(e.createdAt)).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));

  const days = DAYS.map(() => 0);
  for (const e of thisWeek) days[Math.floor((Date.parse(e.createdAt) - start.getTime()) / DAY)]! += 1;

  const byId = new Map(live.map((e) => [e.id, e]));
  const decided: LetterDecision[] = thisWeek
    .filter((e) => e.kind === "decided")
    .map((e) => {
      const next = e.supersededBy ? byId.get(e.supersededBy) : undefined;
      return {
        handle: e.handle,
        text: clean(e.text),
        day: DAYS[Math.floor((Date.parse(e.createdAt) - start.getTime()) / DAY)]!,
        ...(next ? { replacedBy: next.handle, replacedText: clean(next.text) } : {}),
      };
    });

  // The one most likely forgotten, across the whole log, not just this week.
  const due = live
    .filter((e): e is Entry & { memory: NonNullable<Entry["memory"]> } =>
      !!e.memory && (e.kind === "decided" || e.kind === "learned") && !e.supersededBy && e.status !== "proposed" && e.status !== "unresolved")
    .map((e) => ({ e, d: dueOf(e.memory, now) }))
    .filter((x) => x.d.retrievability < DESIRED_RETENTION)
    .sort((a, b) => a.d.retrievability - b.d.retrievability || (a.e.id < b.e.id ? -1 : 1));
  const top = due[0];

  return {
    owner: opts.owner ?? "you",
    weekOf: ymd(start),
    weekEnd: ymd(new Date(end.getTime() - DAY)),
    week: isoWeek(start),
    appUrl: (opts.appUrl ?? "https://memo-rable.vercel.app").replace(/\/+$/, ""),
    worked: thisWeek.filter((e) => e.kind === "worked").length,
    tasksDone: thisWeek.filter((e) => e.kind === "task" && e.task === "done").length,
    decided,
    learned: thisWeek.filter((e) => e.kind === "learned").map((e) => ({ handle: e.handle, text: clean(e.text) })),
    days,
    ...(top
      ? {
          recheck: {
            handle: top.e.handle,
            text: clean(top.e.text),
            kind: top.e.kind as "decided" | "learned",
            recordedOn: ymd(new Date(top.e.createdAt)),
            recall: Math.round(top.d.retrievability * 100),
            reviews: top.e.memory.reviews,
            nextIfHolds: Math.max(1, Math.round(intervalDays(review(top.e.memory, 3, now.toISOString()).stability))),
          },
        }
      : {}),
    alsoDue: Math.max(0, due.length - 1),
  };
}

/**
 * Where an answer link lands. The letter never changes anything by itself: link
 * scanners and prefetchers open every link in an email, so the app asks you to
 * confirm the answer before it records one.
 */
export function answerLink(appUrl: string, handle: string, answer: "holds" | "changed"): string {
  return `${appUrl}/?still=${encodeURIComponent(handle)}&answer=${answer}#workspace`;
}
