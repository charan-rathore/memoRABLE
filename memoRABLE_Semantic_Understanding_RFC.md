# memoRABLE Semantic Understanding RFC (Competition Edition)

> This document is intentionally concise compared to a full internal RFC, but is designed to serve as the **single system prompt** for Cursor/Grok to redesign the document understanding pipeline.

## Mission

You are **not** a document summarizer.

You are building the semantic understanding engine for memoRABLE.

The objective is to transform arbitrary documents into a grounded semantic representation before extracting memories.

Never generate memories directly from raw OCR.

## Benchmark

The attached PRD (Indent_PO_GRN) is the canonical regression document.

The pipeline MUST correctly identify:
- Business Context
- Summary
- Problem Statement
- Ticket Breakdown
- Key Requirements
- Embedded spreadsheet/image ("Cases – Sheet")
- User Stories
- Acceptance Criteria
- Business Impact
- Priority Matrix
- Success Metrics
- Open Questions

A failure such as "No decisions recognized" on this document is considered a pipeline failure, not an LLM failure.

## Core Principles

1. Parse first.
2. Understand second.
3. Build evidence graph.
4. Extract memories last.
5. Every memory must cite evidence.

## Required Pipeline

### Stage 1 — Layout Analysis
- Detect headings by typography and spacing.
- Preserve reading order.
- Preserve hierarchy.
- Preserve tables.
- Preserve lists.

### Stage 2 — Multimodal Extraction
Treat embedded screenshots as first-class content.
OCR every image.
Merge OCR with surrounding text.

### Stage 3 — Semantic Segmentation
Chunk by semantic section, never fixed token windows.

### Stage 4 — Document Graph
Build nodes for:
- Sections
- Tables
- Images
- Lists
- Requirements
- Decisions
- Risks
- Metrics
- Open questions

Link related nodes.

### Stage 5 — Memory Extraction

Extract only after graph completion.

Supported memories:
- Snapshot
- Decisions
- Risks
- Actions
- Signals
- Timeline

Each memory requires:
- title
- description
- confidence
- exact evidence
- section
- page reference

Reject unsupported memories.

## Table Understanding

Tables are semantic objects.

Extract:
- headers
- rows
- relationships
- priorities
- identifiers

Never flatten into plain text.

## Image Understanding

If an image contains a spreadsheet:
- OCR
- identify headers
- associate with nearby section
- summarize purpose
- link as evidence

## Grounding

Every output must contain:
- page
- section
- quote span

If evidence is missing:
Return LOW_CONFIDENCE instead of hallucinating.

## Confidence

HIGH:
Multiple supporting evidence.

MEDIUM:
Single explicit statement.

LOW:
Inference.

## Regression Test

Using the supplied PRD, expected understanding includes:

Business Context:
Mid-market onboarding requiring auditability.

Problem:
Missing audit trails, revision history, amendment support.

Requirements:
Edit history, revisions, approval workflow.

Visual:
Spreadsheet describing editability rules.

Stories:
Purchase Manager, Project Manager, Site Engineer, Finance.

Business Impact:
Compliance, accountability, efficiency.

Priority Matrix:
P0 Audit Trail
P1 Amendment
P2 Module Edits

Metrics:
Adoption
Efficiency
Quality

Open Questions:
4 explicit unresolved questions.

If any of the above are absent, the pipeline fails.

## Acceptance Criteria

- Zero hallucinated sections.
- Preserve hierarchy.
- Recover embedded spreadsheet.
- Preserve all tables.
- ≥95% heading recall.
- Every memory linked to evidence.
- Never output "No decisions found" when explicit decisions/requirements exist.

