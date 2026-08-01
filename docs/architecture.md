# Architecture

memoRABLE is a single Next.js 15 (App Router) application. Everything interesting happens in a deterministic pipeline with four stages, each a pure, unit-tested module boundary.

## Frozen hackathon pipeline

```
Upload
      │
      ▼
Multimodal Parsing
      │
      ▼
Deterministic Archetype Scoring
      │
      ├──────────────┐
      │              │
      ▼              ▼
Known Archetype   Generic Knowledge
(Resume / Invoice / Research)
      │              │
      └──────┬───────┘
             ▼
Universal Cognitive Engine
             │
             ▼
Universal Observations
             │
             ▼
Semantic Compression
             │
             ▼
Adaptive Memory Projection
             │
             ▼
Evidence-Linked Memory Cards
```

**Principle: Projection is adaptive, understanding is universal.**

The cognitive engine never changes its reasoning based on document type. It
always extracts the same universal observations. Only the final projection
layer adapts furniture:

| Detected | Projection |
|---|---|
| Resume | Experience · Projects · Skills · Education · Achievements · Profile |
| Invoice | Vendor · Line items · Payment · Timeline · Totals |
| Research | Research Question · Key Findings · Evidence · Insights · Limitations · Future Directions |
| else → Generic Knowledge | Snapshot · Signals · Decisions · Timeline · Risks · Actions |

Specialized win rule (deterministic integer scores):

```
winner ≥ MIN_SCORE (10) AND (winner − runnerUp) ≥ MIN_MARGIN (4)
  → specialized projection
else
  → Generic Knowledge  // fallback has no score of its own
```

PRD is not a fallback archetype. Meeting notes, RFCs, design docs, policies,
SOPs, roadmaps, and architecture specs all project as Generic Knowledge.

Debug always exposes Detected Archetype, raw Resume/Research/Invoice scores,
Projection, and matched cue reasons (e.g. `✓ Education ✓ Experience`).

```
┌────────────────────────────────────────────────────────────────────┐
│ source (pasted/dropped/example: JSON, Markdown, plain text)        │
│   ├─ src/import/preflight.ts        size/encoding/binary guards    │
│   ├─ src/import/json/import-json.ts strict, all-or-nothing         │
│   └─ src/import/text/parse-text.ts  conservative local parser      │
├────────────────────────────────────────────────────────────────────┤
│ src/understanding                                                  │
│   archetype.ts           weighted Resume/Invoice/Research scoring  │
│   projection-profiles.ts adaptive furniture (3 + Generic)          │
├────────────────────────────────────────────────────────────────────┤
│ src/domain/memory                                                  │
│   schema.ts        six block kinds + provenance, strict zod        │
│   canonicalize.ts  NFC/CRLF normalization, stable hashing          │
│   normalize.ts     block ids, document id + content hash           │
├────────────────────────────────────────────────────────────────────┤
│ src/render                                                         │
│   blocks/*.tsx     one renderer per block kind → Elements Rows     │
│   build-root.tsx   direct <Email>/<Page>/<Document> roots          │
│   render-bundle.ts renderToHtml + renderToJson, never throws       │
│   compatibility.ts validates generated design JSON                 │
├────────────────────────────────────────────────────────────────────┤
│ src/components (client workbench)                                  │
│   import panel → journey strip → blocks panel → inspector          │
│   preview (sandboxed iframe) → publish panel → downloads           │
└────────────────────────────────────────────────────────────────────┘
```

## The six Memory Blocks

`snapshot · signals · decisions · timeline · risks · actions` — the universal observation kinds. Specialized archetypes relabel these for presentation; Generic Knowledge keeps the classic six labels. A block is:

```ts
{
  id: "blk_signals_3f9a1c…",          // sha256 of canonical content
  kind: "signals",
  title: "Signals — quarter over quarter",
  payload: { entries: […] },          // per-kind strict schema
  provenance: {
    method: "exact-json" | "recovered" | "verified-example" | "ai" | …,
    locator: "blocks[1] · signals",   // where in the source
    excerpt: "…",                     // capped, escaped on render
  },
}
```

Reordering changes `sourceOrder` only — ids, provenance and payload are untouched; the document content hash is recomputed.

## Import: two exclusive paths

`src/import/import-source.ts` routes by detection (`looksLikeJson`), never both. The integration test spies on both parsers to prove exclusivity.

- **JSON** — syntax errors carry line/column; a safety walk rejects deep nesting and `__proto__`/`prototype`/`constructor` keys with `$`-paths; the payload is validated by a discriminated union on `kind`, so errors point at the exact block and field. Any failure discards everything (all-or-nothing) and the UI keeps the last good document.
- **Text/Markdown** — heading classification into the six kinds, then conservative per-kind line parsers. Ambiguity is kept as notes (`text.unrecognized-section` warnings), never forced into a shape. Provenance degrades honestly to `recovered` with `heading "X" · lines A–B` locators.
- **Verified examples** — the checked-in Atlas notes carry a fingerprint-gated verified extraction, marked `verified-example`.
- **AI (optional, off by default)** — `src/ai` + `/api/extract`. Server-only, fixed prompt, schema-gated output, 8s abort, no retries. It can only *improve* an already-local result and keeps the original locators. `GET /api/extract` advertises `{enabled}` so the UI never shows a dead button.

## Render: one memory, three outputs

Each block kind renders to Unlayer Elements `Row`s (`src/render/blocks/`). `build-root.tsx` composes the rows under a **direct** root element per mode — `<Email contentWidth="600px">`, `<Page>`, `<Document fontFamily=serif>` — and `render-bundle.ts` runs `renderToHtml` + `renderToJson` per mode in isolation: one mode's failure never takes down the others, and a block-level failure becomes a visible recovery row instead of a blank output.

Escaping is deliberate and tested: `Table` cell text and `Heading` string children pass through the Elements exporter **raw**, so all user content is pre-escaped (`safe-inline.ts`) before it reaches a renderer. Preview HTML is shown in `sandbox=""` iframes, and `next.config.ts` sets CSP, `X-Frame-Options: DENY`, `nosniff`, `no-referrer`.

## State: a pure reducer

`workbench-state.ts` holds the document, per-mode outputs, per-mode **last-good** outputs, errors, mode, and a 4-entry LRU render cache keyed by `contentHash:mode`. Every UI action is a reducer event (`imported`, `importFailed`, `reordered`, `modeChanged`, `restored`, …), which is why the 20-second replay can snapshot, perform, and restore without ever mutating the user's memory.

## Entry point

`src/app/page.tsx` is a server component: it imports the Atlas fixture, renders all three outputs at build time, and hands them to the client workbench — so the very first paint already shows a remembered, published document (static prerender, no client round-trip). It throws loudly if the fixture ever drifts from the schema.
