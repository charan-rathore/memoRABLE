# Reliability

memoRABLE treats reliability as user-visible behavior, not as error pages. The rules below are enforced by tests, not by convention.

## 1. All-or-nothing import

An import either produces a complete, valid six-block document or changes **nothing**. On failure the UI shows a friendly error box (`role="alert"`) with exact positions — `Unexpected token … (line 4, column 17)`, `blocks[2].payload.entries[0].severity` — and the previous document, memories, and preview stay on screen untouched. The source text itself is preserved so the user can fix it in place.

## 2. Last-good outputs, per mode

Each output mode (web / email / document) keeps its last fully-successful render. If a later render fails for one mode, that mode's preview shows the stale output **with an explicit "stale" badge** — never a blank frame, never a silent swap. The other two modes are unaffected.

## 3. Renderer fault isolation

- Every block render is wrapped; a throwing renderer degrades to a visible *recovery row* naming the block, while the other five publish normally.
- `renderBundle` never throws: per-mode try/catch yields `{ html, designJson, error }`; total failure yields a minimal fallback HTML document.
- Generated design JSON is validated against the Elements exporter's invariants (row/cell shape, column counts). The Publish panel disables the **Unlayer JSON** download — with the reason as its tooltip — for any design that fails validation.

## 4. Input hard limits

`src/domain/memory/limits.ts`: 1 MiB source, depth ≤ 12, ≤ 100 blocks/entries/notes per collection, field length caps, 240-char provenance excerpts, AI input capped at 50 KiB with an 8-second abort. Preflight rejects empty input, NUL bytes, BOM, and binary-looking control-character ratios with specific messages.

## 5. Injection safety

- JSON safety walk rejects `__proto__` / `prototype` / `constructor` keys anywhere in the tree.
- User content is pre-escaped before reaching any Elements prop that passes through raw (`Table` cells, `Heading` children, `Paragraph html`, `previewText`). Tests assert hostile markup appears only in escaped form (`&lt;img …&gt;`) in the final HTML.
- Previews render in `<iframe sandbox="" referrerpolicy="no-referrer">`. Responses send CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and a restrictive `Permissions-Policy`.
- Downloads sanitize filenames (basename only, safe characters, length cap) and revoke object URLs promptly; clipboard fallback if a Blob download is unavailable.

## 6. Honest degradation

- The text parser never invents content: no mitigation → not a risk; no owner/due → not an action. Unrecognized text is kept as notes with a visible warning.
- Decisions default to status `proposed`; references show `—` when absent rather than a fabricated id.
- Exports contain no provenance excerpts or locators — what you download is the document, not the debug trail (tested).
- The AI path is off by default; when on, its failures (429, timeout, invalid output) are isolated and announced, and the local result is kept.

## 7. Storage safety

`localStorage` access goes through wrappers that treat quota errors, privacy-mode denials, and corrupt JSON as "empty" — the app boots identically with storage present or absent.

## 8. Accessibility as reliability

Zero critical/serious axe violations in e2e (WCAG AA contrast verified, scrollable regions keyboard-focusable), polite live-region announcements for import/replay/reorder/publish, reduced-motion replay path that shows the story instantly without animation, and keyboard-complete arrange controls (visible on focus-within, no drag dependency).
