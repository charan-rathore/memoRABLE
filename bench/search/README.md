# github-dups-v1

`github-dups-v1.json` is a retrieval benchmark built from real GitHub issues that maintainers closed as duplicates.

- **Size:** 2,540 issues and PRs from `microsoft/vscode` and `vercel/next.js`, with 191 duplicate pairs. 179 of them can be answered in the realistic setting, where each query only sees issues filed before it.
- **Relevance labels:** taken from GitHub's `MarkedAsDuplicateEvent`. If that is missing, from a maintainer's "Duplicate of #N" comment.
- **Built by:** `build-dataset.mjs`, in the `search-lab` CI workflow. Issue bodies are cleaned of template boilerplate and truncated to 1,400 characters.
- **Never edited in place:** a rebuild becomes `github-dups-v2`.

Results, decisions and method are in [docs/search/ARCHITECTURE.md](../../docs/search/ARCHITECTURE.md).

The data is public issue text from those repositories. It is kept here only to measure retrieval, and every item keeps its `owner/repo#number`.
