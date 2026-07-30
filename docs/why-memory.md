# Why memory

Most tools treat a document as the end of the line: paste text in, get a prettier text out. memoRABLE treats a document as the *beginning* — information that should be **remembered** in a form that stays useful.

## Information wants structure

A board brief and a set of launch notes look different, but they are made of the same six things: what happened (**snapshot**), what moved (**signals**), what was decided (**decisions**), what happens when (**timeline**), what could go wrong (**risks**), and who does what (**actions**). memoRABLE calls these the six Memory Blocks. They are the anatomy of a document — fixed, knowable, and complete.

Because the target shape never changes, the app can make guarantees a free-form editor cannot:

- **Every import produces all six, or fails entirely.** There is no half-remembered document.
- **Every memory knows where it came from.** *Remembered from* — the method, the exact location in the source, the excerpt. Memory without provenance is just content; provenance is what makes it trustworthy.
- **Memory survives editing.** Reordering blocks changes their order, not their identity: ids, hashes, and provenance are preserved.

## One memory, three useful outputs

Once information is remembered as structured blocks, publishing is a rendering decision, not a rewrite. The same six blocks become a fluid **Web page**, a 600px **Email**, and a serif **Document** — rendered by Unlayer Elements, downloadable as standalone HTML or as design JSON you can open in an Unlayer editor. Arrange the memories once and all three outputs rearrange together.

## Why deterministic

The pipeline is local and deterministic by design: same source in, same memory out — byte-for-byte reproducible, testable, private (nothing leaves the browser). AI is an optional, explicit *improvement* step layered on top of the local result, never a requirement and never a black box between your source and your memory. When the parser can't ground something, it says so and keeps the text as notes instead of inventing structure.

## Why "memoRABLE"

The name is the thesis: information worth keeping should be **memorable** — structured enough to remember, grounded enough to trust, and portable enough to publish anywhere. The capital **RABLE** is the workbench itself: Bring, Understand, Remember, Arrange, Publish.
