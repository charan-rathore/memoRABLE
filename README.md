# memoRABLE

**Turn information into memory.**

Bring a board brief as JSON, or rough launch notes as Markdown. memoRABLE understands them — locally, deterministically — and remembers them as **six source-linked Memory Blocks**: snapshot, signals, decisions, timeline, risks, actions. Then it publishes the same memory three ways.

**One memory. Three useful outputs** — a Web page, a 600px Email, and a print Document, all rendered with [Unlayer Elements](https://github.com/unlayer/react-elements).

Open the app and the Atlas Q3 brief is already there, remembered and published as a Document. Press **Replay the 20-second story** to watch the whole journey run the real pipeline in front of you.

## The five verbs

| Verb | What happens |
| --- | --- |
| **Bring** information | Paste, drop a `.json`/`.md`/`.txt` file, or use a checked-in example. Nothing is uploaded. |
| **Understand** | Strict JSON import (all-or-nothing, exact error positions) or a conservative local text parser. No AI by default. |
| **Remember** | Every source becomes exactly six Memory Blocks. Each block carries provenance: *Remembered from* — method, locator, excerpt. |
| **Arrange** | Up/down controls reorder the memories. Ids, provenance and content hashes survive reordering. |
| **Publish** | Ends on **"Published."** — three outputs side by side, each downloadable as standalone HTML, plus the Unlayer design JSON and the canonical memoRABLE JSON. |

## 20-second walkthrough

1. `npm install && npm run dev`, open http://localhost:3000.
2. The Atlas board brief is preloaded — six memories on the left, the Document output on the right.
3. Click a memory — the inspector shows **Remembered from**: `Exact JSON · blocks[1] · signals`, with the escaped source excerpt and *View source* highlighting that exact range.
4. Press **Replay the 20-second story** (top right). It snapshots state, re-runs the *real* import at Understand, reveals the six memories, switches Email → Document, then restores everything. Escape stops it at any time.
5. Paste garbage JSON: the import fails **all-or-nothing** — `We couldn't understand this JSON. Nothing was changed.` with line/column — and your last good memories stay untouched.
6. Move **Signals** down one, switch the top-bar mode Web page / Email / Document, then **Publish** and download any output.

## Unlayer Elements integration

Every output is a real Elements tree — direct `<Email>` / `<Page>` / `<Document>` roots with composed `Row`s, rendered to standalone HTML and to design JSON with the official exporters:

```tsx
// src/render/build-root.tsx — the Document output
<Document backgroundColor={colors.paper} contentWidth="760px" fontFamily={fonts.serif} textColor={colors.ink}>
  {blockRows}   {/* one or more Rows per Memory Block, from the block registry */}
  {footer}
</Document>
```

```ts
// src/render/render-bundle.ts — one tree, both exporters, per mode
base.html = renderToHtml(built.root);
const json = renderToJson(built.root);
```

Each of the six block kinds has its own renderer (`src/render/blocks/*.tsx`) producing Elements `Row`s — KPI grids for signals, a real `Table` for risks, serif numbered sections for the Document mode. A block that fails to render is replaced by an honest *recovery row*; the other five still publish. Generated design JSON is validated against the Elements exporter's own invariants (`src/render/compatibility.ts`), and the Publish panel only offers **Unlayer JSON** downloads for designs that validate.

## Architecture

```
source (JSON / Markdown / text)
  └─ src/import          preflight → strict JSON import  |  conservative text parser
       └─ src/domain/memory     six block schemas, canonicalization, content hashes
            └─ src/render       block renderers → Elements roots → HTML + design JSON
                 └─ src/components   the workbench: bring, memories, inspector, preview, publish
```

- **Deterministic core, no AI by default.** The optional AI extractor (`src/ai`, `ENABLE_AI=true`) is server-only, schema-gated, 8s-timeout, and only ever *improves* a local result — the UI works identically with it off.
- **Reliability as a feature.** All-or-nothing imports, last-good output kept per mode, renderer fault isolation, safe storage wrappers, strict CSP, sandboxed preview iframes (`sandbox=""`), and user content pre-escaped before it ever reaches an Elements `html` prop.

Docs: [architecture](docs/architecture.md) · [reliability](docs/reliability.md) · [design principles](docs/design-principles.md) · [why memory](docs/why-memory.md)

## Local development

```bash
npm install          # Node ≥ 20.9
npm run dev          # http://localhost:3000
npm run verify       # lint + typecheck + unit/integration tests + production build
npm run test:e2e     # Playwright: desktop + mobile projects (needs npx playwright install chromium)
```

108 unit/integration tests (vitest) and 20 e2e tests (Playwright, incl. axe accessibility checks with zero critical/serious violations). CI runs all of it on every push (`.github/workflows/ci.yml`).

## Honest limitations

- The text parser is deliberately conservative: it only recognizes what it can ground (risks need severity + mitigation, actions need owner + due). Everything unrecognized is kept as notes — never dropped, never invented.
- Exports are static HTML/JSON; there is no hosted publish step.
- AI improvement is off by default, optional, and never required for any flow.

## License

MIT — © 2026 Charan Rathore. See [LICENSE](LICENSE).
