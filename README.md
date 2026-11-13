# memoRABLE

**Your working memory for engineering.** Capture what you worked on, find decisions when they matter, and decide what to do next—without waiting for a model.

[**Try the live workspace**](https://memo-rable.vercel.app/#workspace) · [Explore the real search demo](https://memo-rable.vercel.app/#proof) · [Open a sample brief](https://memo-rable.vercel.app/#briefs) · [How the architecture works](docs/architecture/DAILY_SYSTEM.md)

The homepage is the actual product: the story and working local workspace are on the same page. There is no separate simulated app. The opening search uses clearly labeled example notes and real, linked Next.js issues. Your own notes remain on your device.

## One useful loop, every day

1. **Capture:** record work, lessons, decisions and tasks. Link a previous entry with its handle; explicitly replace a decision when it changes.
2. **Recall:** search your notes and connected GitHub issues/PRs using local keyword retrieval. Optionally turn on local semantic search.
3. **Move forward:** review open tasks and the reason behind a suggested next action. Accept, revise or skip; those choices are recorded.
4. **Check progress:** see the seven-day activity breakdown and *measured* local operation receipts, without invented model-call savings.

Try the homepage example about why a decision changed. Then scroll to **Your workspace** and record your own entry. A separate document-to-brief flow can read a supported source and produce editable email, web and document outputs.

## Search: measured on real duplicate issues

The repository includes a frozen [technical search benchmark](bench/search/) with **179 scored duplicate-issue queries** from VS Code and Next.js. Each query can only retrieve issues created before it; the relevant earlier issue was identified by maintainers.

| Retrieval arm | Whole-issue Recall@10 | Title-only Recall@10 |
| --- | ---: | ---: |
| Plain BM25 | 72.6% | 88.3% |
| Fielded BM25F | 83.2% | 88.3% |
| bge-small-en-v1.5, quantized, dense | **96.6%** | 93.3% |
| Hybrid weighted fusion (bge-small + keyword) | 95.0% | **91.6%** |

These are retrieval scores on this dataset, **not** answer correctness, global search quality, or model-generated accuracy. Title-only hybrid has the highest measured nDCG@10 in the benchmark; dense retrieval has the highest nDCG@10 for whole-issue queries. A 2,540-item exact vector scan was fast enough in the reported CI environment; no ANN infrastructure was justified. Error fingerprints and the synonym lexicon made no meaningful improvement here.

See [dataset construction, all arms, confidence intervals, ablations and limitations](docs/search/ARCHITECTURE.md). The CI evaluations use pinned queries and named policies; a changed dataset must receive a new version.

### What happens in your browser

- **Immediately:** local BM25F keyword retrieval, even without a model or network.
- **Opt-in semantic search:** downloads approximately **34 MB** of self-hosted bge-small weights once, then embeds and searches on your device in a Web Worker. The first load depends on the device and connection. If unavailable, keyword search remains functional.
- **Smaller index:** int8 vectors are cached in IndexedDB by content hash and model identity. The benchmark found no measurable ranking-quality loss versus float32 on these queries.
- **Connected repositories:** the browser requests public issues and PRs directly from GitHub; an optional access token for private or larger syncs is held in browser storage and sent to GitHub, not our server. Browser-held tokens are **not encrypted**; use a narrowly scoped credential.
- **No cross-device sync yet:** notes, source entries, local vectors and feedback are browser-local. Clearing browser data can remove them. Do not confuse local storage with a cloud backup.

## Architecture: four layers, real boundaries

~~~text
Daily capture / source / GitHub issues
        │
        ▼
1  Local source & event log       IndexedDB · source IDs · explicit links
        │
        ▼
2  Memory and search              projections · BM25F · optional embeddings
        │
        ▼
3  Deterministic execution        bounded recall · cache invalidation · next-action rules
        │
        ▼
4  Usable experience & evidence   search · brief · review · local measured receipts
~~~

This is a map of responsibilities, not a claim that a full graph database, autonomous multi-agent runtime, hosted inference router, or machine unlearning exists.

- [Daily system: paths, event flow, invariants and failure modes](docs/architecture/DAILY_SYSTEM.md)
- [Search engineering and benchmark](docs/search/ARCHITECTURE.md)
- [Design system, accessibility and motion](docs/design/SYSTEM.md)
- [Document-to-memory architecture](docs/architecture.md)
- [Evidence Core contract](src/evidence-core/contracts.ts)

The daily engine's one-hop handle links and explicit supersession are deliberately simpler than a semantic knowledge graph. Cache invalidation follows affected dependencies. Deletion removes local note text and derived search state; it does **not** erase upstream GitHub content, backups, external models or other devices.

## A second workflow: document to brief

Import a PDF, Markdown, plain-text or memoRABLE JSON source. A conservative local parser produces inspectable memory blocks and editable outputs via Unlayer Elements.

- JSON import is strict and all-or-nothing.
- PDF reading uses pdf.js, with selective OCR and visible warnings. The homepage limits uploads to 2 MB and reads at most the first 40 PDF pages.
- AI is optional and not used for normal local capture/recall.
- OCR, scanned documents and ambiguous extraction require human review. A cited quotation and the interpretation made from it are different things.

[Try a source-backed brief](https://memo-rable.vercel.app/#briefs). The video/GIF under [public/media](public/media/) illustrates the older document journey; the **live homepage** is the current daily-memory experience.

## Develop and verify

Requires Node 20.9–24; this repository's [.nvmrc](.nvmrc) pins Node 22.

~~~sh
git clone https://github.com/charan-rathore/memoRABLE.git
cd memoRABLE
nvm use
npm ci
npm run dev
~~~

Open http://localhost:3000.

~~~sh
npm run verify       # lint, types, units, production build
npm run test:e2e     # Playwright desktop and mobile (install Chromium first)
~~~

The published search experiment also uses [the search-lab workflow](.github/workflows/search-lab.yml) for real embedding-model evaluation. Do not replace held-out performance evidence with screenshots or simulated metrics.

## Honest current limits

The duplicate-issue benchmark covers two repositories and only 179 questions; it is not proof of search quality on every personal note or codebase. Semantic search adds an initial download and local compute cost. The daily memory planner uses explicit rules, not neural reasoning. GitHub sync does not include Discussions. There is no multi-device synchronization, durable cloud account, verified graph unlearning, or autonomous external action.

The product is useful precisely because the supported local workflow works without those systems.

## License

MIT — © 2026 Charan Rathore. See [LICENSE](LICENSE).
