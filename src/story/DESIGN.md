# A document, as a story

`/story` takes the six memories the importer found in a document (snapshot,
signals, timeline, decisions, risks, actions) and tells them one screen at a
time. The workbench's **Play as a story** hands over whatever was imported:
a PDF, Markdown, plain text or JSON. **Save as PDF** prints one finished page
per beat.

```
document ──► importer ──► six memories ──► planStory() ──► beats ──► StoryView
 (pdf, md,    (parse,       (typed,          (taste, as      (one idea   (pinned chapters,
  txt, json)   OCR, check)   source-linked)   tested rules)   per screen) scroll-scrubbed)
```

## The taste, as rules (`plan.ts`, tested in `tests/unit/story-plan.test.ts`)

1. **One idea per screen.** A beat has a line, one big phrase and at most one chart.
2. **Only what the document says.** Every fact on screen is the document's own
   text. A value the parser can't read as a number is shown as words, never guessed.
3. **Never two units on one axis.** "$4.2M", "121%" and "19 mo" each get their own
   scale, starting from zero. The bar before the change is drawn only when the delta
   states it exactly: a percentage of a non-percentage, points on a percentage, or
   the same unit.
4. **A chart only when it beats a sentence.** That means two or more readable
   measures, two or more steps, or a decision linked to the work it set moving.
   Otherwise the beat is prose.
5. **Counts are words** up to twelve ("two of four done.").
6. **Each kind of beat has its own colour field**, and no two neighbours share one.
   The accent appears once per beat: the dot that ends the big phrase.

## Palette and type

A field notebook. It is deliberately not the Sunday letter's cobalt and pink,
and not the reference portfolio's palette either.

| Field | Hex | Text | Accent | Beat |
|---|---|---|---|---|
| moss | `#1f3d2f` | oat | butter | opening, closing |
| oat | `#efe7d6` | ink | clay | numbers, next |
| night | `#121513` | `#e9e4d8` | butter | the path |
| butter | `#f2cf63` | ink | `#8f3315` | decisions |
| clay | `#b4471f` | `#fff6ec` | butter | risks |

The type comes from three faces already in the app, each with one job:

- **Instrument Serif** says what the page says.
- **Geist** says what it means.
- **Geist Mono** (lowercase, `>`-prefixed) says where it came from.

## Motion (`motion.ts`)

Taken from how the reference moves, frame by frame. Each movement is a pure
function of scroll position, never a timer:

- **curtain.** The next field slides up over the last one as an arch whose
  corners flatten as it settles.
- **set.** The big phrase's letters come up out of a mask one after another, and
  the dot lands last with a small overshoot.
- **rise.** The line's words come up from just below and straighten out, like
  type being set.
- **lift.** Covered things are revealed one at a time, left to right (the
  cloches): the cover lifts, then the bar grows and the number counts up from its
  old value to the one the document gives.
- **draw.** The path is drawn by arc length, and each step arrives as the line
  reaches it. Arcs show which step needed what the previous one produced.

Smoothing is frame-rate independent exponential decay with a 60 ms half-life.
Reduced motion turns it off and drops the arch. In print, every chapter is
drawn finished.

## Never

- gradients, glows, glass or drop shadows
- an animation that loops or plays without the reader scrolling
- emoji, sparkles or "AI" badges
- a three-card feature grid
- a chart with two units on one axis
- a number the document didn't write
