import type { EntryKind, TaskState } from "@/daily/types";

/** One shape per kind so the stream is scannable without reading labels or relying on colour alone. */
export function Glyph({ kind, task, size = 10 }: { kind: EntryKind; task?: TaskState; size?: number }) {
  const s = size;
  const common = { width: s, height: s, viewBox: "0 0 10 10", "aria-hidden": true as const, className: `td-glyph td-k-${kind}` };
  switch (kind) {
    case "worked":
      return <svg {...common}><circle cx="5" cy="5" r="4" fill="currentColor" /></svg>;
    case "learned":
      return <svg {...common}><path d="M5 .8 9.2 5 5 9.2.8 5Z" fill="currentColor" /></svg>;
    case "decided":
      return <svg {...common}><rect x="1" y="1" width="8" height="8" rx="1.5" fill="currentColor" /></svg>;
    case "task":
      return task === "done" ? (
        <svg {...common}><circle cx="5" cy="5" r="4.2" fill="currentColor" /><path d="M3 5.1 4.4 6.5 7.1 3.7" fill="none" stroke="#000" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      ) : (
        <svg {...common}><circle cx="5" cy="5" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.4" />{task === "accepted" && <circle cx="5" cy="5" r="1.6" fill="currentColor" />}</svg>
      );
  }
}
