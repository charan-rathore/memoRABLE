# MEMORABLE_V2_MEMORY_ENGINE.md

> **Role:** Principal AI Architect + Principal Product Designer + Staff LLM Engineer

## Mission

You are not improving a parser.

You are transforming **memoRABLE** from a **document extraction engine** into a **human memory system**.

Read this document as the canonical product specification. Every engineering decision should move the system toward one objective:

> **People should feel that memoRABLE remembered their document—not that it reformatted it.**

---

# Current State Assessment

The current architecture is technically strong.

Pipeline:

```text
Markdown
  ↓
Chunking
  ↓
Classification
  ↓
Rendering
```

Strengths:

- Excellent extraction accuracy
- Conservative hallucination behavior
- Premium PDF renderer
- Clean typography
- Strong timeline extraction
- Good action extraction

Weaknesses:

- Preserves structure more than meaning
- Snapshot behaves like page one instead of recall
- Signals require explicit wording
- Decisions miss implicit commitments
- Risks extract evidence instead of reasoning
- Memory blocks are isolated
- Product feels like an extractor instead of a memory system

Target score:

| Category | Current | Target |
|----------|---------|--------|
| Understanding | 9.2 | 9.8+ |
| Classification | 7.8 | 9.7 |
| Memory Quality | 6.9 | 9.8 |
| Product Differentiation | 8.3 | 9.9 |
| Overall | ~8.5 | 9.7+ |

---

# Fundamental Shift

Old philosophy:

Document
→ Sections
→ Text

New philosophy:

Document
→ Understanding
→ Distillation
→ Memory
→ Relationships
→ Composition

The renderer is already good.

The understanding layer is missing.

---

# New Architecture

```text
Markdown
      ↓
Semantic Understanding
      ↓
Distillation
      ↓
Candidate Memories
      ↓
Relationship Graph
      ↓
Memory Validation
      ↓
Composition
      ↓
Renderer
```

Never classify raw paragraphs directly.

Always understand before remembering.

---

# Core Principle

Every memory must answer:

> "What would a human still remember one week later?"

Never ask:

"What paragraph did this come from?"

---

# Six Memory Layers

## 1. Snapshot

Purpose:

Explain the entire document in under 20 seconds.

Requirements:

- ≤120 words
- Purpose over structure
- No copied paragraphs
- Reads like human recall
- Explains document to someone who never saw it

Bad:

"This document contains six sections..."

Good:

"This guide teaches a structured consulting workflow for solving Amazon KAM assignments by combining decomposition, business reasoning, AI-assisted analysis and actionable recommendations."

---

## 2. Signals

Definition:

Recurring patterns that influence future decisions.

Signals are inferred.

Never require explicit wording.

Examples:

High impressions + low conversion
→ Listing quality issue

Many small prompts outperform one giant prompt

Workflow matters more than answers

Heuristics:

- If...then...
- Comparisons
- Cause/effect
- Repeated themes
- Lessons learned

---

## 3. Decisions

Definition:

Author has committed to a course of action.

Examples:

Use Python automation

Clean data first

Build folder structure

Use many small prompts

Do not confuse with suggestions.

---

## 4. Timeline

Keep current visual layout.

Enhance by linking:

Timeline
↓

Action

↓

Artifact Produced

↓

Dependency

Example:

Phase 1

Understand datasets

↓

Produces

Data Dictionary

↓

Required before

Cleaning

---

## 5. Risks

Current:

Extracts evidence.

Desired:

Store

Observation

↓

Why it matters

↓

Possible consequence

Example:

High impressions with poor conversion

↓

Listing quality issue

↓

Wasted ad spend

---

## 6. Actions

Already strong.

Replace status wording:

OPEN

with

Pending

Suggested

Ready

Actions should reference their parent decision.

---

# Memory Distillation Engine

Before classification:

1. Understand document intent
2. Identify concepts
3. Remove redundancy
4. Infer meaning
5. Compress information
6. Generate candidate memories

Then classify.

Never classify raw chunks.

---

# Memory Relationships

Build a graph.

Signals → Decisions

Decisions → Actions

Timeline → Actions

Signals → Risks

Snapshot → Everything

Expose subtle links in UI.

---

# Provenance

Never show confidence percentages.

Instead display:

Remembered from:

"The Most Important Rule"

or

Phase 6 — Advertising ROI

Trust comes from provenance.

---

# Hallucination Policy

Maintain conservative extraction.

If uncertain:

Do not invent.

Better to omit than hallucinate.

Precision > Recall.

---

# Product Psychology

Users should remember:

"This app remembered my document."

Not:

"This app generated a PDF."

Every label, animation, wording and layout should reinforce memory.

Avoid technical language.

Use cognitive language.

---

# Acceptance Tests

Snapshot:

✓ Under 120 words

✓ Human readable

✓ Explains purpose

Signals:

✓ Inferred

✓ Not copied

Decisions:

✓ Reflect commitments

Timeline:

✓ Connected

Risks:

✓ Observation → Consequence

Actions:

✓ Linked to decisions

Relationships:

✓ Cross references exist

Renderer:

✓ Editorial quality

✓ Minimal

✓ Premium

---

# Implementation Priority

Phase 1

Semantic understanding

Phase 2

Distillation

Phase 3

Improved memory classification

Phase 4

Relationship graph

Phase 5

Renderer refinement

Phase 6

Replay improvements

Phase 7

Judge polish

---

# Definition of Done

The product is complete only when:

- It preserves meaning over structure.
- Every memory feels like human recall.
- Memories reference one another.
- Provenance builds trust.
- Snapshot explains purpose, not headings.
- Signals are inferred.
- Decisions capture commitments.
- Risks explain consequences.
- Timeline is relational.
- Actions implement decisions.
- Users leave saying:
  "It remembered my document."

Never optimize for extraction accuracy alone.

Optimize for remembered understanding.
