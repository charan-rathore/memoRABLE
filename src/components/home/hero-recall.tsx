"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SearchIndex, type SearchDoc } from "@/search/engine";
import { analyze } from "@/search/analyze";
import { ClosedSpline, damp, decayFromHalfLife, type Vec2 } from "@/motion/curves";

/**
 * The hero is the product: a live search over a demo memory, with the
 * memory itself orbiting the search box.
 *
 * Motion is driven by src/motion/curves.ts:
 *  - cards ride a closed uniform cubic B-spline (C², so no acceleration jumps)
 *    sampled by arc length (constant on-screen speed);
 *  - every reaction to a query (cards pulled toward the box, the orbit slowing
 *    down, the rest fading) is frame-rate independent exponential damping.
 * The orbit is decoration for sighted users (aria-hidden); the results list is
 * the accessible answer. Paused off screen; still under reduced motion.
 */

type NoteKind = "worked" | "learned" | "decided" | "task";
interface DemoNote { id: string; kind: NoteKind; text: string; createdAt: string; status?: string; supersededBy?: string }
interface DemoIssue { id: string; kind: "issue" | "pr"; title: string; body: string; labels: string[]; url: string; createdAt: string; state: string }
interface DemoMemory { notes: DemoNote[]; issues: DemoIssue[] }

const EXAMPLES = ["hydration mismatch", "why did we stop using Redis?", "ERR_REQUIRE_ESM", "turbopack memory", "flaky test on windows"];
const ORBIT_NOTES = ["n1", "n4", "n5", "n8", "n9", "n13", "n14", "n3"];
const KIND_LABEL: Record<NoteKind, string> = { worked: "Worked on", learned: "Learned", decided: "Decided", task: "Task" };
const STATUS_LABEL: Record<string, string> = { approved: "Approved", proposed: "Proposed", unresolved: "Unresolved", superseded: "Replaced" };

interface Result {
  id: string;
  title: string;
  kind: NoteKind | "issue" | "pr";
  meta: string;
  url?: string;
  status?: string;
  replacedBy?: string;
  promoted?: boolean;
  matched: Set<string>;
}

function ago(iso: string, now: number) {
  const d = Math.round((now - Date.parse(iso)) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
}

function Mark({ text, terms }: { text: string; terms: Set<string> }) {
  if (!terms.size) return <>{text}</>;
  const parts = text.split(/([A-Za-z0-9_]+)/);
  return (
    <>
      {parts.map((p, i) => {
        const hit = /^[A-Za-z0-9_]+$/.test(p) && analyze(p).some((t) => terms.has(t));
        return hit ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>;
      })}
    </>
  );
}

export function KindGlyph({ kind, size = 10 }: { kind: NoteKind | "issue" | "pr"; size?: number }) {
  const c = { width: size, height: size, viewBox: "0 0 10 10", "aria-hidden": true as const, className: `kg kg-${kind}` };
  switch (kind) {
    case "worked": return <svg {...c}><circle cx="5" cy="5" r="4" fill="currentColor" /></svg>;
    case "learned": return <svg {...c}><path d="M5 .8 9.2 5 5 9.2.8 5Z" fill="currentColor" /></svg>;
    case "decided": return <svg {...c}><rect x="1" y="1" width="8" height="8" rx="1.5" fill="currentColor" /></svg>;
    case "task": return <svg {...c}><circle cx="5" cy="5" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>;
    case "pr": return <svg {...c}><circle cx="2.5" cy="2.5" r="1.4" fill="none" stroke="currentColor" strokeWidth="1.1" /><circle cx="2.5" cy="7.5" r="1.4" fill="none" stroke="currentColor" strokeWidth="1.1" /><circle cx="7.5" cy="7.5" r="1.4" fill="none" stroke="currentColor" strokeWidth="1.1" /><path d="M2.5 3.9v2.2M7.5 6.1V4a1.5 1.5 0 0 0-1.5-1.5H5" fill="none" stroke="currentColor" strokeWidth="1.1" /></svg>;
    default: return <svg {...c}><circle cx="5" cy="5" r="3.8" fill="none" stroke="currentColor" strokeWidth="1.2" /><circle cx="5" cy="5" r="1.2" fill="currentColor" /></svg>;
  }
}

export function HeroRecall({ onOpenWorkspace }: { onOpenWorkspace: () => void }) {
  const [memory, setMemory] = useState<DemoMemory | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [receipt, setReceipt] = useState<string>("");
  const [placeholder, setPlaceholder] = useState(EXAMPLES[0]!);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const hitIds = useRef<Set<string>>(new Set());
  const now = useMemo(() => Date.now(), []);

  useEffect(() => {
    let alive = true;
    fetch("/demo/memory.json").then((r) => r.json()).then((m: DemoMemory) => { if (alive) setMemory(m); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const index = useMemo(() => {
    if (!memory) return null;
    const idx = new SearchIndex();
    for (const n of memory.notes) idx.upsert({ id: n.id, kind: "note", title: n.text, body: "", labels: [n.kind], source: "notes", createdAt: n.createdAt } satisfies SearchDoc);
    for (const i of memory.issues) idx.upsert({ id: i.id, kind: i.kind, title: i.title, body: i.body, labels: i.labels, source: "vercel/next.js", url: i.url, createdAt: i.createdAt, state: i.state } satisfies SearchDoc);
    return idx;
  }, [memory]);

  const orbitItems = useMemo(() => {
    if (!memory) return [];
    const notes = ORBIT_NOTES.map((id) => memory.notes.find((n) => n.id === id)!).filter(Boolean);
    const issues = memory.issues.filter((i) => i.title.length < 70).slice(0, 6);
    const mixed: Array<{ id: string; kind: NoteKind | "issue" | "pr"; text: string; sub: string }> = [];
    for (let i = 0; i < Math.max(notes.length, issues.length); i++) {
      const n = notes[i], s = issues[i];
      if (n) mixed.push({ id: n.id, kind: n.kind, text: n.text.length > 92 ? `${n.text.slice(0, 90)}…` : n.text, sub: `Your note, ${ago(n.createdAt, now)}` });
      if (s) mixed.push({ id: s.id, kind: s.kind, text: s.title, sub: `vercel/next.js #${s.id.split("#")[1]}` });
    }
    return mixed.slice(0, 13);
  }, [memory, now]);

  // Run the search (lexical arm chosen by the benchmark; no model, no network).
  useEffect(() => {
    if (!index || !memory) return;
    const q = query.trim();
    if (q.length < 2) { setResults(null); setReceipt(""); hitIds.current = new Set(); return; }
    let alive = true;
    void index.search(q, { arm: "bm25f+sig", k: 6 }).then((res) => {
      if (!alive) return;
      const qterms = new Set(analyze(q));
      const out: Result[] = [];
      for (const h of res.hits) {
        const note = memory.notes.find((n) => n.id === h.id);
        if (note) {
          const replacement = note.supersededBy ? memory.notes.find((n) => n.id === note.supersededBy) : undefined;
          if (replacement && !out.some((r) => r.id === replacement.id)) {
            out.push({ id: replacement.id, title: replacement.text, kind: replacement.kind, meta: `Your note, ${ago(replacement.createdAt, now)}`, ...(replacement.status ? { status: replacement.status } : {}), promoted: true, matched: qterms });
          }
          if (out.some((r) => r.id === note.id)) continue;
          out.push({ id: note.id, title: note.text, kind: note.kind, meta: `Your note, ${ago(note.createdAt, now)}`, ...(note.status ? { status: note.status } : {}), ...(replacement ? { replacedBy: replacement.id } : {}), matched: qterms });
        } else {
          const issue = memory.issues.find((i) => i.id === h.id);
          if (!issue) continue;
          out.push({ id: issue.id, title: issue.title, kind: issue.kind, meta: `vercel/next.js #${issue.id.split("#")[1]}, ${issue.state}`, url: issue.url, matched: qterms, ...(h.signatureMatch ? { status: "same error" } : {}) });
        }
      }
      for (const r of out) if (!r.promoted && out.some((o) => o.replacedBy === r.id)) r.promoted = true;
      hitIds.current = new Set(out.map((r) => r.id));
      setResults(out.slice(0, 6));
      setReceipt(`${out.length ? `${Math.min(out.length, 6)} of ${index.size} items` : `0 of ${index.size} items`} in ${res.ms < 1 ? res.ms.toFixed(2) : res.ms.toFixed(1)} ms, on this device, no model`);
    });
    return () => { alive = false; };
  }, [query, index, memory, now]);

  // Typed placeholder: cycles real example queries while the box is idle.
  useEffect(() => {
    if (focused || query) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let ex = 0, ch = 0, hold = 0;
    const id = window.setInterval(() => {
      const word = EXAMPLES[ex % EXAMPLES.length]!;
      if (ch <= word.length) { setPlaceholder(word.slice(0, ch) || " "); ch++; return; }
      if (hold++ < 28) return;
      hold = 0; ch = 0; ex++;
    }, 55);
    return () => window.clearInterval(id);
  }, [focused, query]);

  // The orbit.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !orbitItems.length) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frameCount = 0;
    let raf = 0, last = performance.now(), visible = true, u = 0, speed = 1, pageVisible = !document.hidden;
    const pos = orbitItems.map(() => ({ x: 0, y: 0, o: 0, s: 1 }));
    let spline: ClosedSpline | null = null;
    let W = 0, H = 0, cx = 0, cy = 0, copyHalf = 0;
    const copyBox = { l: 0, r: 0, t: 0, b: 0 };
    const measureCopy = () => {
      const copy = stage.parentElement?.querySelector(".hx-copy") as HTMLElement | null;
      if (!copy) return;
      const s0 = stage.getBoundingClientRect();
      // Measure the text blocks, not the full-width column.
      let l = Infinity, r = -Infinity, t = Infinity, b = -Infinity;
      for (const el of Array.from(copy.querySelectorAll(".hx-title, .hx-sub, .hx-search, .hx-chips, .hx-results ol, .hx-note"))) {
        const q = (el as HTMLElement).getBoundingClientRect();
        if (!q.width) continue;
        l = Math.min(l, q.left); r = Math.max(r, q.right); t = Math.min(t, q.top); b = Math.max(b, q.bottom);
      }
      if (l < r) Object.assign(copyBox, { l: l - s0.left, r: r - s0.left, t: t - s0.top, b: b - s0.top });
    };
    const layout = () => {
      W = stage.clientWidth; H = stage.clientHeight; cx = W / 2; cy = H * 0.5;
      copyHalf = Math.min(W * 0.5, 360);
      const rx = Math.max(W * 0.45, copyHalf + 160), ry = H * 0.47;
      const pts: Vec2[] = [];
      const N = 10;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        const wobble = 1 + 0.06 * Math.sin(a * 3 + 0.7);
        pts.push({ x: cx + Math.cos(a) * rx * wobble, y: cy + Math.sin(a) * ry * (1 + 0.08 * Math.cos(a * 2)) });
      }
      spline = new ClosedSpline(pts);
      measureCopy();
    };
    layout();
    const ro = new ResizeObserver(layout); ro.observe(stage);
    const io = new IntersectionObserver(([e]) => { visible = !!e?.isIntersecting; if (visible) kick(); }, { threshold: 0 });
    io.observe(stage);
    const onVis = () => { pageVisible = !document.hidden; if (pageVisible) kick(); };
    document.addEventListener("visibilitychange", onVis);

    const fast = decayFromHalfLife(0.11), slow = decayFromHalfLife(0.35);
    const frame = (t: number) => {
      raf = 0;
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      if (!spline) return;
      const hits = hitIds.current;
      const searching = hits.size > 0;
      if ((frameCount++ & 15) === 0) measureCopy(); // results grow and shrink the copy

      speed = damp(speed, searching ? 0.25 : 1, slow, dt);
      if (!reduced) u = (u + dt * speed / 48) % 1; // one lap every 48 s at rest
      orbitItems.forEach((item, i) => {
        const p = spline!.at(u + i / orbitItems.length);
        const depth = (p.y - (cy - H * 0.47)) / (H * 0.94); // 0 top .. 1 bottom
        const isHit = hits.has(item.id);
        let tx = p.x, ty = p.y;
        if (isHit) { tx = p.x + (cx - p.x) * 0.2; ty = p.y + (cy - p.y) * 0.2; }
        // Cards fade as they approach the copy (headline, search, results) so it stays legible.
        const el0 = cardRefs.current[i];
        const hw = (el0?.offsetWidth ?? 232) / 2 + 28, hh = (el0?.offsetHeight ?? 80) / 2 + 20;
        const ox = Math.max(copyBox.l - (tx + hw), tx - hw - copyBox.r, 0);
        const oy = Math.max(copyBox.t - (ty + hh), ty - hh - copyBox.b, 0);
        const gap = Math.max(ox, oy);
        const behind = isHit ? 1 : Math.min(1, gap / 90);
        const baseO = (0.55 + 0.4 * depth) * behind;
        const to = searching ? (isHit ? 1 : 0.08 * behind) : baseO;
        const ts = (0.86 + 0.14 * depth) * (isHit ? 1.06 : 1);
        const c = pos[i]!;
        const k = reduced ? 1e9 : fast;
        c.x = damp(c.x || tx, tx, k, dt); c.y = damp(c.y || ty, ty, k, dt);
        c.o = damp(c.o, to, k, dt); c.s = damp(c.s, ts, k, dt);
        const el = cardRefs.current[i];
        if (el) {
          el.style.transform = `translate3d(${(c.x - el.offsetWidth / 2).toFixed(1)}px, ${(c.y - el.offsetHeight / 2).toFixed(1)}px, 0) scale(${c.s.toFixed(3)})`;
          el.style.opacity = c.o.toFixed(3);
          el.dataset.hit = isHit ? "1" : "0";
          el.style.zIndex = String(Math.round(depth * 10) + (isHit ? 20 : 0));
        }
      });
      // Under reduced motion there is no orbit: one frame per change, no loop.
      if (visible && pageVisible && !reduced) raf = requestAnimationFrame(frame);
    };
    const kick = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };
    kick();
    (stage as HTMLDivElement & { __kick?: () => void }).__kick = kick;
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); document.removeEventListener("visibilitychange", onVis); };
  }, [orbitItems]);

  // Wake the orbit when results change (it may be idle under reduced motion).
  useEffect(() => { (stageRef.current as (HTMLDivElement & { __kick?: () => void }) | null)?.__kick?.(); }, [results]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable))) return;
      if (!inputRef.current) return;
      const r = inputRef.current.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return; // the workspace has its own "/"
      e.preventDefault(); inputRef.current.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const pick = useCallback((q: string) => { setQuery(q); inputRef.current?.focus(); }, []);

  return (
    <section className="hx" aria-labelledby="hx-title">
      <div className="hx-stage" ref={stageRef} aria-hidden="true">
        {orbitItems.map((item, i) => (
          <div key={item.id} className={`hx-card kind-${item.kind}`} ref={(el) => { cardRefs.current[i] = el; }}>
            {/* Decorative: text is drawn by CSS from data attributes; the results list carries the content. */}
            <span className="hx-card-top" data-text={item.sub}><KindGlyph kind={item.kind} /></span>
            <span className="hx-card-text" data-text={item.text} />
          </div>
        ))}
      </div>

      <div className="hx-copy">
        <h1 id="hx-title" className="hx-title">Remember what you decided, and&nbsp;why.</h1>
        <p className="hx-sub">
          memoRABLE keeps a running log of what you worked on, learned and decided, and searches it together with your GitHub issues.
          It runs in your browser, with no account and no model bill.
        </p>

        <form className={`hx-search${results ? " has-results" : ""}`} role="search" onSubmit={(e) => e.preventDefault()}>
          <svg className="hx-search-icon" width="18" height="18" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="m11 11 3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={focused ? "Search notes and GitHub issues" : placeholder}
            aria-label="Search the demo memory: sample notes and real vercel/next.js issues"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd aria-hidden="true">/</kbd>
        </form>

        <div className="hx-chips" aria-label="Try a search">
          {EXAMPLES.map((ex) => <button key={ex} type="button" onClick={() => pick(ex)}>{ex}</button>)}
        </div>

        <div className="hx-strip-wrap" aria-hidden="true">
          <div className="hx-strip">
            {[...orbitItems, ...orbitItems].map((item, i) => (
              <div key={`${item.id}-${i}`} className={`hx-card kind-${item.kind}`}>
                <span className="hx-card-top" data-text={item.sub}><KindGlyph kind={item.kind} /></span>
                <span className="hx-card-text" data-text={item.text} />
              </div>
            ))}
          </div>
        </div>

        <div className="hx-results" aria-live="polite">
          {results && (
            <>
              <ol>
                {results.map((r, i) => (
                  <li key={r.id} className={`hx-result kind-${r.kind}${r.replacedBy ? " is-stale" : ""}`} style={{ animationDelay: `${i * 28}ms` }}>
                    <KindGlyph kind={r.kind} size={11} />
                    <div className="hx-result-body">
                      {r.url ? (
                        <a href={r.url} target="_blank" rel="noreferrer noopener" className="hx-result-title"><Mark text={r.title} terms={r.matched} /></a>
                      ) : (
                        <p className="hx-result-title"><Mark text={r.title} terms={r.matched} /></p>
                      )}
                      <p className="hx-result-meta">
                        <span>{r.meta}</span>
                        {"kind" in r && r.kind !== "issue" && r.kind !== "pr" && <span>{KIND_LABEL[r.kind as NoteKind]}</span>}
                        {r.promoted && <span className="hx-flag st-current">Current decision</span>}
                        {r.replacedBy && <span className="hx-flag">Replaced by a newer decision</span>}
                        {r.status && !r.replacedBy && !r.promoted && <span className={`hx-flag st-${r.status === "same error" ? "current" : r.status}`}>{STATUS_LABEL[r.status] ?? r.status}</span>}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              {results.length === 0 && <p className="hx-empty">Nothing in the demo memory matches that. Try one of the examples, or search your own work below.</p>}
              <p className="hx-receipt">{receipt}</p>
            </>
          )}
          {!results && (
            <p className="hx-note">
              Searching a demo memory: 14 sample notes and {memory ? memory.issues.length : 320} real issues from vercel/next.js.{" "}
              <button type="button" className="hx-link" onClick={onOpenWorkspace}>Start your own below</button>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
