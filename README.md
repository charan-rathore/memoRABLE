# memoRABLE

**Turn information into memory.**

Bring notes, Markdown or JSON. Understand it once. Publish it everywhere.

![memoRABLE replays the whole journey: a board brief arrives, six memories are found, and the document assembles itself](public/media/replay.gif)

**[Live demo →](https://memo-rable.vercel.app)** — no install, Atlas already remembered.

## Why memoRABLE exists

A document is where information goes to be forgotten. You write the board brief, and the same facts get retyped into an email, a status page, and a slide — each copy drifting a little further from the truth.

memoRABLE reads your document once and *remembers* it, as six source-linked Memory Blocks: snapshot, signals, decisions, timeline, risks, actions. Every memory knows exactly where it came from. From that single memory it publishes a Web page, a 600px Email and a print Document — three outputs that can never disagree, because they are the same memory rendered three ways.

Nothing is uploaded. The understanding happens locally and deterministically, with no AI in the default path.

## The five verbs

| Verb | What happens |
| --- | --- |
| **Bring** information | Paste, drop a `.json`/`.md`/`.txt` file, or use a checked-in example. Nothing is uploaded. |
| **Understand** | Strict JSON import (all-or-nothing, exact error positions) or a conservative local text parser. No AI by default. |
| **Remember** | Every source becomes exactly six Memory Blocks. Each block carries provenance: *Remembered from* — method, locator, excerpt. |
| **Arrange** | Up/down controls reorder the memories. Ids, provenance and content hashes survive reordering. |
| **Publish** | Ends on **"Published."** — three outputs side by side, each downloadable as standalone HTML, plus the Unlayer design JSON and the canonical memoRABLE JSON. |

## 20-second walkthrough

**Output first.** Open the app and the Atlas Q3 brief is already there — remembered as six memories, already published as a Document.

![The workbench on first paint: the journey strip across the top, six memories on the left, and the rendered Document output filling the page](public/media/01-document-first.png)

**Every memory knows where it came from.** Click one and the inspector shows *Remembered from* — the method, the exact locator, and the escaped source excerpt. *View source* highlights that precise range in the original.

![The Signals memory selected, with the inspector showing Remembered from: Exact JSON, blocks[1], signals, and the source excerpt](public/media/02-memories-provenance.png)

**One memory. Three outputs.** Publish ends on "Published." — Web page, Email and Document side by side, each downloadable.

![The Published panel showing Web page, Email and Document thumbnails side by side, each with Download HTML and Unlayer JSON buttons](public/media/03-published-three-outputs.png)

Press **Replay the 20-second story** to watch it happen: the app re-runs the *real* import pipeline in front of you, reveals the six memories one by one, then assembles the document. Escape stops it and restores your state exactly.

Assets above are regenerated from the production build with `npm run media`, so they cannot drift from what the app actually renders.

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

Requires **Node 20.9–24** (`.nvmrc` pins 22). Node 25 is not supported: it deadlocks Next.js 15's build worker.

```bash
nvm use              # or any Node 20.9–24
npm install
npm run dev          # http://localhost:3000

npm run verify       # lint + typecheck + unit/integration tests + production build
npm run test:e2e     # Playwright desktop + mobile (first run: npx playwright install chromium)
npm run media        # regenerate the screenshots and GIF above
```

110 unit/integration tests (Vitest) and 20 Playwright e2e tests — 18 run on every push, 2 are layout-specific skips — including axe accessibility checks with zero critical or serious violations. CI runs the whole gate on every push and pull request ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

## Honest limitations

- The text parser is deliberately conservative: it only recognizes what it can ground (risks need severity + mitigation, actions need owner + due). Everything unrecognized is kept as notes — never dropped, never invented.
- Exports are static HTML/JSON; there is no hosted publish step.
- State lives in memory for the length of a visit; there is no persistence layer.
- AI improvement is off by default, optional, and never required for any flow.

## License

MIT — © 2026 Charan Rathore. See [LICENSE](LICENSE).
