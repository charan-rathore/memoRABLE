# Semantic Understanding Fix Plan

Concrete PR sequence to make semantic understanding the real extraction engine.
Derived from the architecture audit (document graph unused, understanding demoted,
OCR skipped on product path, no Timeline/Actions inference).

## Goals

1. Product path recovers embedded visuals (spreadsheets/screenshots) via OCR.
2. Understanding + document graph drive memory extraction; structure is authority, not the only router.
3. All six memories can be filled from meaning (including Timeline + Actions).
4. Requirements project into Decisions; only risks/actions/phases stay out.
5. Tests prove unstructured prose and the Indent PDF path without OCR cheats where possible.

---

## Ordered PR sequence

### PR1 — Highest leverage (this change set)

**Theme:** OCR on product path + understanding/graph as primary extraction.

| Area | Change |
| --- | --- |
| Product PDF | `readPdfQuick` no longer forces `skipOcr: true`. Pure text PDFs stay fast (no PNGs → no OCR). |
| OCR safety | Cap + size-prefer large images so logos do not dominate. |
| Graph | When a section heading is unknown, assign kind from graph node type. |
| Understanding | Add `inferTimeline` + `inferActions`; expose on `Understanding`. |
| Decisions | Requirements project *into* Decisions; `blocksDecisionInference` only blocks risk / action / phase. |
| Merge | Understanding seeds Timeline/Actions; raise inferred budget; structural still enriches same-line. |

**Exit criteria**

- Unstructured notes with dates/todos populate Timeline + Actions.
- Indent PDF without precomputed OCR still recovers Cases rules when images OCR successfully (or when precomputed is used in CI).
- Existing indent / archetype / v6 tests still green.
- `npm run verify` passes.

### PR2 — Observation-first local core

- Introduce a local `Observation[]` intermediate (mirror v6 types lightly).
- Distill → observations → project by profile (no heading-first routing for body lines).
- Headings become soft priors, not hard bucket walls.

### PR3 — Graph-driven evidence

- Extract candidates from `DocumentGraph` nodes (table rows, requirement lists, questions).
- Every memory entry carries graph node id + page when available.
- Inspector can jump graph → source.

### PR4 — Snapshot / recall quality

- Fix clause joining (missing punctuation between framing + outstanding work).
- Prefer goal/problem/outcome composition over truncated opening paste.

### PR5 — Multimodal + Docling alignment

- Background OCR refine when fast path skipped images (parity with Docling refine).
- Allow Docling refine for table-heavy PRDs (not research-only).

### PR6 — Eval harness

- Expand benchmark with unstructured + OCR-off regression for Indent.
- Score floors for Timeline/Actions presence on prose fixtures.

---

## Non-goals for PR1

- No AI/v6 prompt changes.
- No schema version bump.
- No UI redesign.

---

## Test matrix (PR1)

| Case | Expect |
| --- | --- |
| Unstructured prose with dates + todos | Timeline ≥1, Actions ≥1, Decisions/Risks when stated |
| Headed PRD fixture | Still ≥ existing richness |
| Indent PDF + precomputed OCR | Regression unchanged |
| Requirement line with `must` | Lands in Decisions (not blocked) |
| Phase line | Still not a Decision |
| Pure text PDF (no images) | No OCR cost path |
| `npm run verify` | lint + types + unit/integration + build |
