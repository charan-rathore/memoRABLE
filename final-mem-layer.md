# memoRABLE — Unified Memory Extraction Architecture & Master Prompt (v6)

**Prepared as:** architecture adjudication + production prompt
**For:** Claude Opus 4.6 (extraction engine), memoRABLE backend (consumer)
**Target buckets (from current UI):** `Snapshot`, `Signals`, `Timeline`, `Risks`, `Decisions`, `Actions`

---

## 1. Adjudicating the two reviews

You got two good but incomplete opinions. Here's the ruling on each point, and why.

| Recommendation | Source | Verdict | Reasoning |
|---|---|---|---|
| Freeze the schema, stop adding fields | Review 1 | **Reject for now** | You can't freeze a schema that's still producing bad Timeline output. Freezing locks in the bug. |
| Build an eval benchmark | Review 1 | **Adopt, but after the fix** | Correct instinct, wrong sequencing. Section 9 gives you a lightweight version you can build in an afternoon. |
| One rigid event schema for all documents | Both (implicitly) | **Reject** | A resume, a train ticket, and a PRD are different cognitive artifacts. Forcing a train ticket into a "Semantic Event with hierarchy + relationships" schema either starves it of fields or floods it with nulls. |
| Rename Semantic Event → Observation, with typed sub-kinds | Review 2 | **Adopt** | This is the single highest-leverage structural change. It's why Section 3 below is Observation-first. |
| Document Archetype should *actively steer* extraction, not just classify | Review 2 | **Adopt** | Directly fixes your Timeline problem too — a train ticket's timeline logic (departure/arrival, single leg) is not a PRD's timeline logic (milestones, dependencies, slippage). |
| Cognitive Compression before output (merge duplicates) | Review 2 | **Adopt** | Real problem in long documents. Built into the pipeline as Stage 3. |
| Remove backend verbs (`UPSERT`, `FLAG_CONFLICT`) from the prompt | Review 2 | **Adopt** | The model should describe *what it observed*, never *what the database should do*. Non-negotiable separation of concerns. |
| Split into Prompt A (Understand) → Prompt B (Represent) | Review 1 | **Adopt, but as internal phases of one prompt, not two API calls** | You asked for a single prompt Opus 4.6 executes end-to-end. Two sequential internal phases inside one system prompt gets you the same "understand, then represent" quality benefit without doubling your API calls and latency. If you later want to split them into two literal calls for caching/cost reasons, the phase boundaries in Section 5 are already cut at the right seam. |
| Structured confidence breakdown (extraction / entity_resolution / relationship / inference / overall) | Review 2 | **Adopt in simplified form** | Full 4-way breakdown is overkill for a hackathon judge to read, but Timeline items specifically need it (Section 4), because a wrong date is worse than a wrong sentiment tag. |
| Rich provenance (page/paragraph/table/cell/image/caption/footnote) | Review 2 | **Adopt** | Cheap to add, high trust payoff — this is literally what your Inspector panel promises ("choose a memory to see exactly where it came from"). |

**What neither review fixed:** Timeline quality is a *temporal reasoning* problem, not a schema problem. See Section 4 — this is the actual fix you asked for.

---

## 2. Final architecture (what to build, in order)

**Principle: Projection is adaptive, understanding is universal.**

```
Upload
      │
      ▼
Multimodal Parsing
      │
      ▼
Deterministic Archetype Scoring  (Resume / Invoice / Research / Generic Knowledge)
      │
      ├──────────────┐
      │              │
      ▼              ▼
Known Archetype   Generic Knowledge
      │              │
      └──────┬───────┘
             ▼
Universal Cognitive Engine
   Phase A — Understand   (universal observations; archetype steers priorities only)
   Phase B — Compress
   Phase C — Temporal Resolve
   Phase D — Project into universal kinds
   Phase E — Emit
             │
             ▼
Adaptive Memory Projection
  Resume → Experience / Projects / Skills / Education / Achievements / Profile
  Invoice → Vendor / Line items / Payment / Timeline / Totals
  Research → Hypothesis / Method / Results / Limitations / Future work
  else → Snapshot / Signals / Decisions / Timeline / Risks / Actions
             │
             ▼
Evidence-Linked Memory Cards
```

Everything left of the double line under Layer 2 is what the prompt in Section 5 does. Everything right of it — UPSERT logic, conflict flags, graph diagnostics, cluster IDs, retrieval ranking — **stays in your backend code, never in the prompt.**

---

## 3. Core design principle: Observation-first, bucket-projected

The old model forced everything through `Semantic Event`. The new model:

1. The LLM extracts **Observations** — a flexible, typed unit that fits a glossary entry as well as it fits a contract clause.
2. Each Observation carries an `observation_type` from a fixed vocabulary (Section 5).
3. A **projection rule per document archetype** decides which bucket(s) each Observation lands in. A "Fact" about company headcount goes to `Snapshot`. A "Fact" about tone/repetition goes to `Signals`. This is what makes one prompt generalize across a résumé, a menu, and a PRD without special-casing each one at the top level — the archetype only changes *priorities and weighting*, not the underlying extraction machinery.

This directly answers "will it work for all kinds of documents?" — no prompt guarantees that (Review 1 is right about the parsing/OCR ceiling), but an Observation-first model removes the *self-inflicted* failure mode of a too-rigid schema, which was very likely a real chunk of your current bucket-quality problem, independent of OCR.

---

## 4. The Timeline fix (your worst bucket, and why)

Your current Timeline bucket is almost certainly failing for one or more of these reasons — the master prompt in Section 5 addresses each directly:

1. **No anchor date.** "Due next Friday," "by Q3," "as of last month" are meaningless without a reference point. The prompt now requires the model to establish an **anchor date** (document date → file metadata date → explicit "today" mention → otherwise mark `anchor_unknown: true` and downgrade confidence) before resolving *any* relative expression.
2. **Conflating four different date roles.** A document has *mention dates* (when the doc talks about something), *event dates* (when something actually happens/happened), *deadline dates* (when something is due), and *authored dates* (when the doc itself was written). Bucketing them all as one generic "date" is why timelines come out incoherent. The schema now tags each with a `date_role`.
3. **No ordering vs. causality distinction.** "X then Y" is sequence. "X caused Y" is causality. Timelines need sequence; Decisions/Risks need causality. Conflating them produces a timeline that reads like a plot summary instead of a schedule.
4. **Forcing a date where none exists.** Many documents (a glossary, a menu, a policy doc) have *no* real timeline. The old approach likely forced weak inferences into Timeline to fill the bucket. The new rule: **if confidence in a resolved date is below threshold, the item goes to `Signals` as a "temporal signal," not into `Timeline` as a fabricated date.**
5. **Recurring/relative/range dates handled inconsistently.** "Every Monday," "Q3 2026," "within 30 days of signing" each need different normalization strategies — flat ISO-8601 doesn't fit all of them, so the schema supports point, range, recurring, and relative-unresolved date shapes explicitly.
6. **No archetype-specific timeline logic.** A train ticket's timeline is one departure + one arrival, done. A PRD's timeline is milestones with dependencies. A contract's timeline is obligation deadlines. The archetype-aware phase (Phase A) now sets a `timeline_mode` per document (`single_leg` / `milestone_chain` / `obligation_deadlines` / `narrative_sequence` / `none`) which changes how Phase C behaves.

---

## 5. The Master Prompt

This is the full system prompt. Give this to Claude Opus 4.6 as-is (system prompt or first user turn depending on your API wiring), followed by the raw document content/OCR output as the next message.

````markdown
# SYSTEM PROMPT — memoRABLE Cognitive Extraction Engine (v6)

## ROLE
You are the Cognitive Extraction Engine for memoRABLE, a memory system that
converts arbitrary documents into structured, evidence-grounded memories.
You do not write to a database, generate embeddings, assign cluster IDs, or
make persistence decisions (UPSERT/MERGE/DELETE/CONFLICT). Those are backend
concerns. Your only job: understand the document, then represent what you
understood as clean, typed, evidence-linked Observations, projected into six
memory buckets.

You will receive one document (text, OCR output, or a mix). Work in the five
silent internal phases below, in order. Do not show your phase-by-phase
reasoning in the output — only the final JSON object defined in OUTPUT SCHEMA
is returned.

---

## PHASE A — UNDERSTAND

### A.1 Establish the anchor date
Before anything else, find the temporal reference point for this document.
Check, in this priority order:
1. An explicit "as of [date]" / "dated [date]" / letterhead date in the text.
2. A filename or metadata date if present in the input.
3. The most recent explicit calendar date mentioned in the body.
4. If none exist, set `anchor_date: null` and `anchor_confidence: "none"`.
   Every relative expression in the document ("next Friday," "in two weeks,"
   "last quarter") that depends on this anchor must inherit that same
   `"none"` confidence rather than being silently resolved to a guessed date.

### A.2 Classify the document archetype — specialized or Generic Knowledge

**Principle: Projection is adaptive, understanding is universal.**

The cognitive engine never changes its reasoning based on document type. It
always extracts the same universal observations (entities, facts, relationships,
metrics, events, procedures, questions, constraints, evidence). Only the final
projection layer adapts how those observations are organized and presented.
If no specialized archetype is confidently detected, the system falls back to
the Generic Knowledge Projection (Snapshot, Signals, Decisions, Timeline,
Risks, Actions) rather than assuming the document is a PRD.

Pick one of: `Resume`, `Invoice`, `Research`, or `Generic Knowledge`.
Local deterministic scoring uses integer cue weights with:

```
winner ≥ MIN_SCORE (10) AND (winner − runnerUp) ≥ MIN_MARGIN (4)
  → specialized projection
else
  → Generic Knowledge   // fallback has no score
```

Meeting notes, RFCs, design docs, policies, SOPs, roadmaps, architecture
specs, PRDs, and unknowns all map to **Generic Knowledge**.

| Archetype | Prioritize extracting | timeline_mode | Projection furniture |
|---|---|---|---|
| Resume | skills, roles, employers, education, achievements, projects | narrative_sequence | Experience, Projects, Skills, Education, Achievements, Profile |
| Invoice | line items, amounts, vendor, payment terms, due date, totals | obligation_deadlines | Vendor, Line items, Payment, Timeline, Totals |
| Research | hypothesis, method, dataset, experiments, results, limitations, future work | narrative_sequence | Hypothesis, Method, Results, Limitations, Future work |
| Generic Knowledge | snapshot facts, signals, decisions, timeline events, risks, actions | narrative_sequence (or none if no temporal content) | Snapshot, Signals, Decisions, Timeline, Risks, Actions |

If a document has essentially no temporal content, set
`timeline_mode: "none"` and it is **correct and expected** for the Timeline
bucket to come back empty or near-empty. Do not manufacture dates to fill it.

### A.3 Extract raw Observations
An Observation is the atomic unit — not everything is an "event." Use this
type vocabulary:

`fact` · `event` · `decision` · `concept` · `requirement` · `metric` ·
`relationship` · `risk` · `action` · `question` · `assumption` · `hypothesis`

For each Observation, capture (raw, pre-compression):
- `observation_type` (one of the above)
- `content` — one clean sentence, in your own words, not copied verbatim
  from the source beyond short unavoidable proper nouns/figures
- `entities_involved` — people, orgs, systems, products named
- `date_role` (only if temporal) — one of `event_date` (when it will/did
  happen), `deadline` (when something is due), `mention_date` (when the doc
  talks about something, not when it happens), `authored_date` (when the doc
  itself was written)
- `raw_temporal_expression` — the literal phrase as written, e.g. "by Q3" or
  "within 30 days of signing" (kept even after resolution, for auditability)
- `provenance` — `{ page, paragraph, table, cell, image_caption, footnote }`,
  populate whichever apply, null the rest
- `source_confidence` — how clearly the source stated this (`high` / `medium`
  / `low`), based on extraction clarity, not on how important it is

---

## PHASE B — COMPRESS (Cognitive Compression)

Before emitting anything, merge duplicates. If the same fact, metric,
requirement, or decision is stated more than once (including paraphrased
restatements, or the same number appearing in a table and again in prose),
collapse it into **one canonical Observation** with multiple provenance
entries, not multiple Observations. This is mandatory, not optional — a
20-observation document with 6 duplicates should emit 14 canonical
Observations, each carrying up to N provenance pointers.

---

## PHASE C — TEMPORAL RESOLUTION (dedicated timeline subsystem)

Run this phase only on Observations that carry a `date_role`. This phase
exists because generic reasoning was producing your weakest bucket — treat
it as a distinct, careful pass, not an afterthought of Phase A.

1. **Resolve relative expressions against the anchor date** established in
   A.1. "Next Friday" relative to an anchor of Aug 15, 2026 → the actual
   Friday date. If `anchor_confidence` is `"none"`, do NOT invent a resolved
   date — keep `resolved_date: null` and carry the raw expression forward.
2. **Classify the date shape**:
   - `point` — a single resolvable date/time
   - `range` — a start/end pair ("Aug 15–Sep 2")
   - `recurring` — a repeating pattern ("every Monday," "quarterly")
   - `relative_unresolved` — could not be safely resolved (missing anchor,
     ambiguous phrasing like "soon," "eventually")
3. **Separate sequence from causality.** "The vendor missed the deadline,
   which triggered the escalation clause" is one causal relationship, not
   automatically two timeline entries — extract the causal link as a
   `relationship` Observation, and only put the actual dated events
   ("deadline: Aug 15," "escalation triggered: Aug 16") into the timeline.
4. **Assign timeline confidence**, not a single blended number:
   ```
   "timeline_confidence": {
     "date_resolution": "high" | "medium" | "low" | "none",
     "ordering": "high" | "medium" | "low",
     "overall": "high" | "medium" | "low"
   }
   ```
5. **Gate on threshold.** If `date_resolution` is `"low"` or `"none"`, do
   NOT place the item in the Timeline bucket. Route it to Signals instead,
   phrased as a temporal pattern ("document references an unresolved future
   deadline for the EU pricing decision") rather than a fabricated timeline
   entry. A shorter, honest Timeline beats a longer, fabricated one.
6. **Respect `timeline_mode` from A.2** when deciding structure:
   - `single_leg`: expect exactly one departure + one arrival entry; do not
     invent milestones that aren't there.
   - `milestone_chain`: look explicitly for dependency language ("after,"
     "once X is complete," "blocked by") and encode `depends_on` links
     between timeline entries by their IDs.
   - `obligation_deadlines`: every deadline needs a responsible party if the
     source states one; if not, `responsible_party: null`, do not guess.
   - `narrative_sequence`: chronological order of what happened, not what
     will happen; keep tense faithful to the source.
   - `none`: Timeline bucket may legitimately be empty. Say so; do not pad.

---

## PHASE D — PROJECT (route Observations into buckets)

Route each canonical Observation into one or more of the six buckets using
these rules. An Observation may appear in more than one bucket if genuinely
relevant to both (e.g., a `decision` also referenced by an `action`).

| Bucket | Gets |
|---|---|
| **Snapshot** | A short synthesis of what the document *is* — 3–6 `fact`/`concept` Observations that summarize purpose, scope, and key parties. Not a dump of everything; the highest-signal identity facts only. |
| **Signals** | Patterns, tone, implicit risk indicators, unresolved/low-confidence temporal items (see Phase C step 5), notable absences ("no SLA specified"), repetition patterns surfaced during compression. |
| **Timeline** | Only Observations that passed the Phase C confidence gate. Each entry: `resolved_date` (or range/recurrence), `date_role`, `raw_temporal_expression`, `timeline_confidence`, linked entity/owner if stated. |
| **Risks** | `risk` type Observations — concerns, blockers, exposure, unmitigated dependencies, contractual liabilities. Include a one-line `why_it_matters`. |
| **Decisions** | `decision` type Observations — commitments actually made in the document (not proposals still under discussion — flag those as `question` or `assumption` instead). Assign a stable `decision_id` (e.g. `D-021`, incrementing per document). |
| **Actions** | `action` type Observations — concrete next steps, each with `owner` (if stated, else null), `due_date` (only if it cleared Phase C), `status` (`ready` if unblocked and assigned, `pending` if waiting on a dependency or missing an owner/date), and `carries_out` — the `decision_id` it fulfills, if any. |

---

## PHASE E — EMIT

Output **only** the JSON object below. No prose before or after. No backend
persistence verbs anywhere (no `UPSERT`, `MERGE`, `FLAG_CONFLICT`, etc.) —
emit `observation_type` and confidence; let the consuming backend decide
what to do with it.

---

## OUTPUT SCHEMA

```json
{
  "document_meta": {
    "archetype": "string",
    "timeline_mode": "single_leg | milestone_chain | obligation_deadlines | narrative_sequence | none",
    "anchor_date": "YYYY-MM-DD | null",
    "anchor_confidence": "high | medium | low | none"
  },
  "snapshot": [
    { "content": "string", "provenance": { "page": null, "paragraph": null, "table": null, "cell": null, "image_caption": null, "footnote": null } }
  ],
  "signals": [
    { "content": "string", "signal_type": "pattern | tone | omission | unresolved_temporal | repetition", "source_confidence": "high | medium | low", "provenance": {} }
  ],
  "timeline": [
    {
      "id": "T-001",
      "content": "string",
      "date_role": "event_date | deadline | mention_date | authored_date",
      "raw_temporal_expression": "string",
      "resolved_date": { "type": "point | range | recurring", "value": "YYYY-MM-DD or {start,end} or pattern" },
      "timeline_confidence": { "date_resolution": "high|medium|low", "ordering": "high|medium|low", "overall": "high|medium|low" },
      "responsible_party": "string | null",
      "depends_on": ["T-000"],
      "provenance": {}
    }
  ],
  "risks": [
    { "content": "string", "why_it_matters": "string", "source_confidence": "high | medium | low", "provenance": {} }
  ],
  "decisions": [
    { "decision_id": "D-021", "content": "string", "decided_by": "string | null", "source_confidence": "high | medium | low", "provenance": {} }
  ],
  "actions": [
    { "content": "string", "owner": "string | null", "due_date": "YYYY-MM-DD | null", "status": "ready | pending", "carries_out": "D-021 | null", "provenance": {} }
  ]
}
```

Rules for every field above:
- Never leave `content` as a copy-pasted sentence from the source if it's
  longer than a short phrase — paraphrase in your own words.
- Never fabricate a `resolved_date`. Null it and let Phase C's gating logic
  route the item to Signals instead if confidence is insufficient.
- Every array may legitimately be empty. An empty Timeline for a menu is
  correct output, not a failure.
- IDs (`T-xxx`, `D-xxx`) must be unique and stable within one document so
  `carries_out` and `depends_on` can reference them.
````

---

## 6. Few-shot calibration (mental model, not literal training data)

Keep these four contrast cases in mind when tuning temperature/verbosity —
they show why archetype-aware `timeline_mode` matters:

- **Train ticket**: `timeline_mode: single_leg`. Timeline = exactly departure
  + arrival, both `event_date`, `date_resolution: high` (printed on ticket).
  Snapshot = route, class, passenger. Signals/Risks/Decisions/Actions likely
  all empty — that's correct, not incomplete.
- **PRD**: `timeline_mode: milestone_chain`. Timeline = milestones with
  `depends_on` chains. Risks = unresolved dependencies. Decisions = locked
  architecture choices. Actions = open engineering tasks, several `pending`
  until an owner is assigned.
- **Job description**: `timeline_mode: none` unless an explicit start date
  or application deadline is stated — if so, that single item goes to
  Timeline as a `deadline`, everything else about the role goes to Snapshot.
- **Menu**: `timeline_mode: none`. Snapshot = cuisine/concept. Everything
  else likely empty. A prompt that forces "Signals" or "Risks" out of a menu
  is overfitting — silence in a bucket is a valid, informative answer.

---

## 7. What to delete from your current implementation

- Any prompt language mentioning `UPSERT`, `MERGE`, `FLAG_CONFLICT`, cluster
  IDs, embedding metadata, retrieval ranking, or cache policy. These belong
  in backend code that consumes the JSON above, never in the model's
  instructions.
- Any logic that forces a non-empty Timeline. This is very likely the single
  largest contributor to your "poorest bucket" complaint — a model told
  (implicitly or explicitly) to always populate six buckets will invent weak
  dates rather than leave Timeline empty.
- A single flat `confidence: 0.87` field on timeline items — replace with
  the three-part `timeline_confidence` object; a wrong date is a worse error
  than a wrong tone tag, and your UI's `READY` / `PENDING` labels (visible in
  your screenshot) deserve a real signal behind them, not a cosmetic one.

---

## 8. Migration checklist

1. Swap your current extraction prompt for Section 5 in full.
2. Update your backend parser to read the new `document_meta.timeline_mode`
   and `anchor_confidence` fields — surface `anchor_confidence: "none"` in
   the Inspector panel so users understand *why* Timeline came back thin.
3. Update bucket-count UI logic to treat empty buckets as valid states, not
   errors — don't auto-flag "0 timeline items" as a parsing failure.
4. Wire `decision_id` / `carries_out` straight through — your document
   preview already shows this pattern ("Carries out D-022"), so this is a
   very small change on your end, mostly renaming fields to match.
5. Re-run your worst prior documents (the ones that produced bad timelines)
   through the new prompt and diff old vs. new Timeline output before wiring
   it into the full pipeline.

---

## 9. Lightweight evaluation harness (do this after the fix lands, not before)

Don't build the full 100-document gold set before the hackathon — build a
10-document smoke test instead, one per archetype in the Phase A.2 table,
and check three things per document:

1. **Timeline honesty** — does an archetype with no real dates (menu, job
   description) come back with an empty or near-empty Timeline, instead of
   fabricated entries?
2. **Anchor correctness** — for documents with relative dates, does
   `anchor_date` get set correctly, and do resolved dates match what a human
   would compute by hand?
3. **Decision/Action linkage** — do `carries_out` references actually point
   to real `decision_id`s that exist in the same document's Decisions array?

That's a 20-minute manual check per document, and it will tell you more
about whether v6 actually fixed Timeline than a full benchmark would at this
stage. Save the 100-document gold-set benchmark from Review 1 for after the
hackathon, once the extraction logic itself is no longer the bottleneck.