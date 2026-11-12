import { stem } from "@/daily/lexical";
import type { EntryKind } from "@/daily/types";

/** Kind follows how the line starts, until the person picks one. */
export function detectKind(text: string): EntryKind | null {
  const t = text.trimStart().toLowerCase();
  if (/^(decided|decision|approved|agreed|going with|we will|we'll|propose|proposal|should we|open question)\b/.test(t)) return "decided";
  if (/^(learned|learnt|til\b|noticed|found that|turns out)/.test(t)) return "learned";
  if (/^(todo|to do|task|next:|need to|follow up|remember to)\b/.test(t)) return "task";
  if (/^(worked on|built|fixed|shipped|wrote|refactored|profiled|did)\b/.test(t)) return "worked";
  return null;
}

/** "Replaces #a1b2c3" / "supersedes #a1b2c3" links a new decision to the one it replaces. */
export function parseReplaces(text: string): string | null {
  return /\b(?:replaces|supersedes)\s+#([a-z0-9]{6})\b/i.exec(text)?.[1]?.toLowerCase() ?? null;
}

/** Split text into runs, marking words whose stem was matched by recall. */
export function highlight(text: string, matched: string[]): Array<{ t: string; hit: boolean }> {
  if (!matched.length) return [{ t: text, hit: false }];
  const set = new Set(matched);
  const out: Array<{ t: string; hit: boolean }> = [];
  for (const part of text.split(/([A-Za-z0-9]+)/)) {
    if (!part) continue;
    const hit = /^[A-Za-z0-9]+$/.test(part) && set.has(stem(part.toLowerCase()));
    const last = out.at(-1);
    if (last && last.hit === hit) last.t += part; else out.push({ t: part, hit });
  }
  return out;
}

export const KIND_LABEL: Record<EntryKind, string> = { worked: "Worked on", learned: "Learned", decided: "Decided", task: "Task" };

export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function dayLabel(key: string, now = new Date()): string {
  const today = dayKey(now.toISOString());
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (key === today) return "Today";
  if (key === dayKey(y.toISOString())) return "Yesterday";
  const [yy, mm, dd] = key.split("-").map(Number);
  return new Date(yy!, mm! - 1, dd!).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}

export const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

export function formatMs(ms: number): string {
  if (ms < 0.01) return "<0.01 ms";
  if (ms < 1) return `${ms.toFixed(2)} ms`;
  if (ms < 100) return `${ms.toFixed(1)} ms`;
  return `${Math.round(ms)} ms`;
}
