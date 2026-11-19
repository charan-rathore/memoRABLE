# memoRABLE — UI/UX + Architecture Implementation Prompt

# ROLE

You are simultaneously acting as:

- Principal Product Architect
- Principal AI Engineer
- Principal Frontend Engineer
- Senior UX Designer
- Senior React Engineer

Your responsibility is NOT to redesign the application.

Your responsibility is to make the existing product immediately understandable, obviously powered by Elements, and delightful to demonstrate.

You are working on a production codebase.

Preserve architecture.

Avoid unnecessary refactors.

Implement only changes that improve the product according to the success definition below.

---

# DEFINITION OF SUCCESS

A successful implementation satisfies ALL of the following:

✓ A first-time user understands the product in under 5 seconds.

✓ A judge immediately recognizes Elements as a core part of the architecture.

✓ Clicking any memory visibly grounds it in the source document.

✓ PDF upload works with clear, user-friendly limits.

✓ The homepage sells "memory", not "document conversion."

✓ No existing functionality regresses.

✓ No unnecessary refactors are introduced.

✓ The implementation is incremental, production-ready, and maintainable.

If any proposed change does not improve one of these goals,
DO NOT implement it.

---

# PRODUCT FIRST PRINCIPLES

memoRABLE is NOT

- a document generator
- a summarizer
- a parser
- a note-taking app

memoRABLE IS

A Memory Engine.

Users bring one meaningful document.

The system understands it.

Extracts reusable memory blocks.

Keeps every memory grounded to its source.

Publishes those memories into multiple formats using Elements.

Everything must reinforce this mental model.

The product journey should become

Bring
↓

Understand
↓

Remember
↓

Arrange
↓

Publish

NOT

Upload
↓

Generate

---

# CORE PRODUCT MESSAGE

Every UI decision should reinforce these ideas:

Memory

Traceability

Trust

Grounding

Reuse

Composition

Never communicate

Conversion

Generation

Export

---

# IMPLEMENTATION PRIORITIES

Implement in this exact order.

Do not skip earlier priorities.

--------------------------------------------------

PRIORITY 0

MAKE ELEMENTS IMPOSSIBLE TO MISS

Problem

Currently users think this is a document generator.

That is unacceptable.

The competition judges Elements usage.

The product must visibly celebrate Elements.

Implement:

Below the generated memory preview add a new section.

Title

Powered by Elements

Include a small visual flow.

Document

↓

6 Memories

↓

Elements Composition Engine

↓

Email

↓

Web

↓

Document

Whenever the user switches publication formats

Email

Web

Document

display

Composed using Elements

Somewhere visible.

Do not make this intrusive.

It should reinforce architecture.

Never hide Elements.

Celebrate it.

Acceptance criteria

A judge watching for five seconds immediately understands

Elements is central to the product.

--------------------------------------------------

PRIORITY 0

PDF SUPPORT

Support PDF uploads.

Do not remove existing upload types.

Supported

Markdown

Plain Text

README

Docs

PDF

However

The product is memory.

Not search.

Do NOT pretend to support huge books.

Implement a sensible limit.

Example

PDF

Maximum 40 pages

or

First 40 pages processed

Display friendly messaging.

Examples

Bring something worth remembering.

Best for:

Meeting Notes

RFCs

Reports

Research Papers

README

Technical Specs

Guides

If document exceeds limit

Clearly explain

Only first 40 pages are remembered.

Need more?

Split the document.

This is intentional.

No scary errors.

No technical language.

Acceptance criteria

Uploading a normal PDF feels completely natural.

--------------------------------------------------

PRIORITY 0

MEMORY → SOURCE GROUNDING

This is the most important interaction.

Current

Click memory

↓

Inspector changes

New

Click memory

↓

Document viewer scrolls

↓

Exact paragraph highlighted

↓

Sentence highlighted

↓

Memory briefly pulses

↓

Inspector updates

Hovering a memory

should lightly highlight

its source.

The interaction should feel alive.

Not technical.

Acceptance criteria

The demo moment should be

Click

↓

Document scrolls

↓

Highlight appears

↓

Judge instantly understands

"This came from HERE."

--------------------------------------------------

PRIORITY 1

EXPLAIN MEMORY TYPES

Current labels

Snapshot

Signals

Timeline

Risks

Decisions

Actions

are unclear.

Add one-line subtitles.

Example

Snapshot

What this document is about

Signals

Patterns the document suggests

Decisions

Commitments inside the document

Timeline

Important chronological events

Risks

Potential concerns or blockers

Actions

What someone should do next

Do not increase visual clutter.

Small typography.

Secondary text.

Acceptance criteria

A first-time user understands every memory type.

--------------------------------------------------

PRIORITY 1

HOMEPAGE COPY

Current messaging sells uploading.

Instead sell remembering.

Hero

Turn information into memory.

Keep.

Replace subheading.

Current

Upload one document.

Leave with memories,

not notes.

Export them anywhere.

Replace with

Bring one document.

Leave with reusable memories.

Every memory stays linked to its source.

This communicates

Memory

Traceability

Trust

Acceptance criteria

Homepage immediately communicates value.

--------------------------------------------------

PRIORITY 1

PRODUCT STORYTELLING

Show the process.

Instead of

Processing...

Show

Reading

↓

Understanding

↓

Remembering

↓

Arranging

↓

Publishing

Animate progress.

Only subtle transitions.

No flashy effects.

Acceptance criteria

Users understand what the AI is doing.

--------------------------------------------------

PRIORITY 2

MEMORY QUALITY

Improve memory inference.

Signals should identify meaningful patterns.

Not merely extracted text.

Risks should identify genuine concerns.

Not copied sentences.

Actions should feel actionable.

Do not over-engineer.

Only improve prompt quality if required.

--------------------------------------------------

DESIGN PRINCIPLES

Every animation should teach.

Every label should reduce confusion.

Every interaction should improve trust.

Every memory should feel grounded.

Avoid decorative UI.

Avoid unnecessary motion.

Avoid redesigning layouts.

Improve communication.

Not aesthetics.

--------------------------------------------------

TECHNICAL CONSTRAINTS

Maintain current architecture.

Maintain current state management.

Maintain existing APIs.

Do not introduce unnecessary dependencies.

Keep implementation incremental.

Production-ready only.

No TODOs.

No placeholders.

--------------------------------------------------

REGRESSION REQUIREMENTS

Verify that

Existing uploads still work

Memory generation still works

Elements rendering still works

Email generation still works

Document generation still works

Web generation still works

Inspector still works

No styling regressions

No responsiveness regressions

--------------------------------------------------

DELIVERABLE

Implement all Priority 0 items first.

Then Priority 1.

Only then implement Priority 2 if time remains.

Never sacrifice stability for polish.

Always optimize for hackathon judging.

The final product should make a judge think

"This is a clever Memory Engine built around Elements."

Not

"This is another document generator."