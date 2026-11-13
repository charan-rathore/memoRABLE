# Search architecture

memoRABLE's search covers two kinds of material:

- what you record: notes, decisions, lessons and tasks;
- the issues and pull requests of the GitHub repos you connect.

It should feel like a web search engine for engineering problems. A paraphrase finds the original, an error message finds the issue that fixed it, and an identifier finds the code it names. It runs in the browser.

This document is the handoff. It covers what exists, why each choice was made, the evidence behind it, and how to change it safely.

## Constraints that shaped everything

- **Local-first.** Indexing and querying run on the user's device. There is no search server, no hosted vector database, and no per-query cost.
- **Privacy.** A note never leaves the device. Connecting a repo makes the browser call `api.github.com` directly. A personal token, if the user adds one, stays in the browser and is sent only to GitHub.
- **Evidence before complexity.** Every retrieval strategy is a named arm in `src/search/engine.ts`. A strategy reaches the product only after it beats the baseline on the benchmark, with a confidence interval. Arms that did not help are kept and reported, not deleted.

## Components

```
                 ┌──────────────── query ────────────────┐
                 │                                        │
         analyze.ts (technical tokens)           embedder (bge-small, q8, in a worker)
                 │                                        │
   bm25f.ts (fielded BM25, structured queries)     vector.ts (flat exact cosine, int8)
                 │  + signature.ts (error fingerprints)   │
                 └───────────── fusion.ts ────────────────┘
                     weighted sum (default) / RRF
                                 │
                       ranked hits + receipt (ms, scanned)
```

| File | Role |
|---|---|
| `src/search/analyze.ts` | Turns engineering text into terms. A compound keeps its whole form (`fs.readfilesync`, `err_require_esm`) and also yields the parts people type (`read`, `fil`, `sync`). Versions inside compounds stay intact (`next@16.4.5` gives `16.4.5`). Ids longer than 4 digits are dropped; status codes (404, 500) are kept. `structuredQueryTerms` weights a whole issue used as a query: title ×3, prose ×1, code blocks ×0.3, and drops table rows, key: value environment dumps and bare links. |
| `src/search/bm25f.ts` | BM25F (Robertson, Zaragoza & Taylor 2004) over four fields: title (weight 3, b 0.5), body (1, 0.75), labels (1.5, 0.3) and error signature (2.5, 0.3). Query-term frequency saturates with k3 = 1.2, as in BM25Fext (Sun et al., ASE 2011). Long queries keep their 64 highest-idf terms. Indexing is incremental and removal is exact. |
| `src/search/signature.ts` | Finds error lines and normalizes them. Paths, URLs, UUIDs, hex values, quoted values and numbers become placeholders, so two reports of one crash share a fingerprint. Matches are boosted. |
| `src/search/lexicon.ts` | 60 groups of engineering synonyms and abbreviations (k8s/kubernetes, HMR/fast refresh, OOM/heap out of memory and so on). Expansion happens at query time only, at weight 0.4. |
| `src/search/vector.ts` | Exact flat cosine index. Float32 or int8 scalar quantization with a scale per vector, O(1) delete, and a partial top-k. |
| `src/search/fusion.ts` | Reciprocal Rank Fusion (Cormack, Clarke & Büttcher 2009; k = 60) and a min-max-normalized weighted sum. |
| `src/search/engine.ts` | `SearchIndex`: one document store, every arm, and a `search(text, {arm, k, allow, parts})` that returns hits plus measured ms and the number of postings scanned. |
| `src/search/models.ts` | Model registry (Transformers.js 3.8.1, ONNX Runtime) and `createEmbedder`. |
| `src/search/github.ts` | The GitHub connector (see below). |
| `src/search/eval.ts`, `metrics.ts` | The benchmark runner: Recall@k, MRR@10, nDCG@10, latency percentiles, and a paired bootstrap 95% confidence interval on nDCG against BM25. |

## The benchmark: github-dups-v1

Duplicate issue reports are the natural test of a search engine for engineering problems. A maintainer who marks issue B as a duplicate of A has judged that someone searching with B's words should find A. Ground truth therefore comes from maintainers, not from us.

- **Source.** `bench/search/build-dataset.mjs` produces the data, and runs in CI (`search-lab` workflow, task `dataset`). For each repo, it searches `is:issue is:closed reason:duplicate` and takes GitHub's own `MarkedAsDuplicateEvent` (GraphQL) as the link. If that is missing, it falls back to a "Duplicate of #N" comment written by a maintainer.
- **Contents.** 2,540 issues and PRs from `microsoft/vscode` and `vercel/next.js`, and 191 duplicate pairs. In 12 pairs the original was filed after the duplicate. A triager couldn't have found those, so the realistic setting excludes them, leaving 179 scored queries.
- **Realistic setting** (Rakha, Bezemer & Hassan, TSE 2017). Each query sees only issues from the same repo that were filed before it.
- **Two query modes.** `short` is the title only, like a search box. `full` is title plus body, like checking a new report for duplicates.

### Results (2026-11-13, CI run on `feat/search-core`)

nDCG@10, with the change against plain BM25 and its 95% bootstrap confidence interval:

| Arm | Short R@10 | Short nDCG | Full R@10 | Full nDCG |
|---|---|---|---|---|
| `bm25` (one field) | 0.883 | 0.761 | 0.726 | 0.617 |
| `bm25f` (fields + structured query) | 0.883 | 0.784 (+0.023, 0.008 to 0.040) | 0.832 | 0.707 (+0.090, 0.051 to 0.133) |
| `bm25f+sig` | 0.883 | 0.782 | 0.832 | 0.707 |
| `bm25f+sig+lex` | 0.883 | 0.786 | 0.827 | 0.704 |
| `dense`, bge-small-en-v1.5 q8 | 0.933 | 0.826 (+0.065) | **0.966** | **0.877 (+0.260, 0.204 to 0.318)** |
| `hybrid-wsum`, bge-small | 0.916 | **0.840 (+0.080, 0.053 to 0.108)** | 0.950 | 0.839 |
| `hybrid-rrf`, bge-small | 0.905 | 0.825 | 0.939 | 0.810 |
| `dense`, bge-small, **int8 vectors** | 0.933 | 0.823 | 0.966 | 0.876 |
| `dense`, arctic-embed-xs q8 | 0.922 | 0.800 | 0.972 | 0.867 |
| `dense`, all-MiniLM-L6-v2 q8 | 0.911 | 0.783 | 0.927 | 0.780 |

Retrieval latency on a CI runner, excluding query embedding: lexical p95 ≤ 2 ms, and a dense scan of 2,540 vectors p95 < 0.6 ms.

The CI log gives the full tables, the per-repo breakdowns and the embedding throughput.

### Decisions taken from these numbers

1. **Model: bge-small-en-v1.5, q8 ONNX (about 34 MB), with int8 vectors.** It is best or tied on nDCG in both modes. Int8 vectors cost nothing measurable (0.876 against 0.877) and use a quarter of the memory. all-MiniLM-L6-v2, the usual default, is clearly worse.
2. **Search box (short queries): `hybrid-wsum`.** It has the best ranking quality (nDCG 0.840). The lexical side also keeps exact identifiers and error codes (`ERR_REQUIRE_ESM`) on top, which dense vectors blur.
3. **Find similar or duplicate (a whole issue or note as the query): `dense`.** For long text, adding keywords lowers quality: nDCG falls from 0.877 to 0.839 with the weighted sum and to 0.810 with RRF.
4. **Before the model has loaded** (first visit, offline, or a low-end device), the product uses `bm25f+sig`. It needs nothing loaded and is still clearly better than plain BM25 on long queries.
5. **Kept as arms but not used, because they made no measurable difference here:**
   - Error signatures: few duplicate pairs in this set share an error line.
   - The lexicon: +0.002 on short queries, with a confidence interval that includes zero.

   Both are cheap and stay available. A benchmark with more stack traces may show their value.
6. **Not yet earned: ANN indexes (HNSW), rerankers, a graph database.** An exact scan is well under a millisecond at this size. A cross-encoder reranker would add model weight and latency for gains we have not measured.

## GitHub connector (`src/search/github.ts`)

- The browser calls `GET /repos/{o}/{r}/issues?state=all&sort=updated&direction=asc&since=…` (issues and PRs) and `GET /repos/{o}/{r}/issues/comments?since=…` (comments, attached to their issue). Each issue keeps up to 6,000 characters of body and 2,400 of comments.
- Sync is incremental. The cursor stores the newest `updated_at` and the ETag of the first page. An unchanged repo costs one conditional request answered with 304. GitHub does not count an authorized 304 against the primary rate limit.
- Rate limits: 60 requests an hour without a token, 5,000 with one. The sync stops cleanly at the limit and keeps what it fetched. It also stops at a configurable request budget (60 by default).
- Not covered yet: GitHub Discussions (GraphQL, which needs a token), and private repos (they work with a token that has access).

## Running and changing it

- Unit tests and lexical arms run in CI on every push: `npm run test`, which includes `tests/unit/search-*.test.ts`. The floors in `search-bench.test.ts` fail the build if recall regresses.
- Dense arms need model weights, so they run in the `search-lab` workflow:
  - on `workflow_dispatch` with task `eval`;
  - or on a push to a `feat/search-*` branch whose commit message contains `[lab:eval]`.

  Results go to the job log and to the step summary.
- Rebuilding the dataset uses the same workflow with task `dataset`. It prints the gzipped JSON to the log, for environments that cannot download artifacts. The result is a new version (`github-dups-v2`); a published version is never edited.
- To add an arm:
  1. add it to `ARMS` in `engine.ts`;
  2. implement it in `SearchIndex.search`;
  3. run the lab eval;
  4. ship it only if its nDCG interval against the current default excludes zero, and its latency fits the budget (p95 < 50 ms for the search box).

## References

- S. Robertson, H. Zaragoza, M. Taylor. *Simple BM25 extension to multiple weighted fields.* CIKM 2004.
- C. Sun, D. Lo, S.-C. Khoo, J. Jiang. *Towards more accurate retrieval of duplicate bug reports.* ASE 2011 (BM25Fext, REP).
- M. Rakha, C.-P. Bezemer, A. E. Hassan. *Revisiting the performance evaluation of automated approaches for the retrieval of duplicate issue reports.* TSE 2017.
- T. Zhang et al. *Duplicate Bug Report Detection: How Far Are We?* TOSEM 2023 (a simple retrieval baseline often beats deep models).
- G. Cormack, C. Clarke, S. Büttcher. *Reciprocal rank fusion outperforms Condorcet and individual rank learning methods.* SIGIR 2009.
- S. Xiao et al. *C-Pack: Packaged resources to advance general Chinese embedding* (the BGE models). 2023.
- L. Merrick et al. *Arctic-Embed: Scalable, Efficient, and Accurate Text Embedding Models.* 2024.
- GitHub REST API docs: best practices, and conditional requests (an authorized 304 is not counted against the primary rate limit).
