# Design system and motion

This is the handoff for the look and feel of the live site (`/`: the story on top, the workspace below). The code is the source of truth. This page explains why it is the way it is.

## Tokens (`src/app/globals.css`, `:root`)

- **Surfaces.** `--paper` is `#000`. On top of it sit `--surface` (`#0c0c0e`), `--surface-2` and `--surface-3`. Hierarchy comes from these layers, not from shadows.
- **Text.** `--ink` is `#f4f4f5`. `--ink-2` (10.6:1) and `--ink-3` (6.4:1) are the secondary tones. In the workspace, `--faint` is `#84848c` (4.7:1 on the raised panels).
  - Every small-text tone passes WCAG AA, and the homepage axe audit enforces it.
- **Hue carries information, never decoration.** Each kind of memory has one hue: worked `#8ab4ff`, learned `#f5c451`, decided `#c9a2ff`, task `#5ee0b5`.
  - A shape always repeats the hue, so colour is never the only signal: a dot for worked, a diamond for learned, a square for decided, a ring for a task.
- **Links and focus.** Lifted cobalt `--accent` is `#93a9ff` (8.9:1).
- **Primary actions.** White fill with black text (`--on-ink`).
- **Type.** Geist and Geist Mono are self-hosted (`src/app/fonts`, SIL OFL), so the site makes no third-party font requests.
  - Display: 560 weight, −0.042 to −0.048em tracking.
  - Body: 15–17px.
  - Mono only for typed things: handles, receipts, code.

## Motion (`src/motion/curves.ts`, tested in `tests/unit/motion-curves.test.ts`)

It follows Freya Holmér's *The Beauty of Bézier Curves*, *The Continuity of Splines* and *Lerp smoothing is broken*.

1. **Never `a = lerp(a, b, k)` per frame.** That moves differently at different frame rates. Use `damp(a, b, λ, dt) = b + (a − b)·e^(−λ·dt)`, with `λ = ln2 / halfLife`.
   - The tests prove 24 fps and 120 fps agree to 1e-12.
   - Half-lives: 0.11 s for reactions, 0.35 s for the orbit's speed changes.
2. **Paths that never jerk.** A closed uniform cubic B-spline is C² (position, velocity and acceleration are continuous). That is why the hero orbit never "ticks" at the joins.
   - Use Catmull-Rom instead when a path must pass through its points.
   - Use cubic Bézier for UI curves and easing.
3. **Constant speed.** An arc-length lookup table maps distance to the spline parameter `t`, so equal time means equal on-screen distance.
4. **Easing matches CSS exactly.** `cssCubicBezier(x1, y1, x2, y2)` solves `x(t)` with Newton's method. The signature curve is expo-out `(0.16, 1, 0.3, 1)`, the same as `--ease-enter`.
5. **Scroll-pinned chapters** (`src/motion/scroll-scene.ts`, `src/components/home/chapters.tsx`). The story is told the way Wispr Flow tells theirs: a tall section with a sticky stage, scrubbed by scroll.
   - The scene is a pure function of progress `p` (0 → 1 while pinned). Every scroll position has exactly one frame, so there are no empty mid-loop moments, and scrolling back plays the story backwards.
   - Raw progress is smoothed with `damp` (half-life 70 ms), so wheel ticks become motion. Under reduced motion the smoothing is off and the scene follows the scrollbar exactly.
   - Objects travel on cubic Béziers (`flight`) and bank along the tangent while in the air; the bank fades to zero on landing.
   - The thread through a day's notes is Catmull-Rom (`catmullRomPath`), because it must pass through every note. It is drawn by arc length (`getTotalLength` and `stroke-dashoffset`).
   - Timing windows use `span(p, a, b)` shaped with Emil Kowalski's curves: `EASE_OUT (0.23, 1, 0.32, 1)` for arrivals, `EASE_IO (0.77, 0, 0.175, 1)` for things moving on screen. Staggers follow importance (decisions land first), never a uniform delay.
   - Scatter layouts come from a seeded PRNG (`rng`), so the page looks the same on every load.
6. **Budget.**
   - Animate transform and opacity only.
   - Pause off screen (IntersectionObserver) and in hidden tabs.
   - Under `prefers-reduced-motion`, hold a still final frame.
   - Decorative motion is `aria-hidden`, and its text is CSS pseudo-content. The accessible answer is always a real list.

## What counts as AI-generated design here (and what we do instead)

| Tell | Here |
|---|---|
| Cream background with a serif display and a terracotta accent | Black, with Instrument Serif only for chapter headlines and Geist for everything you read or use; hues that mean something. One chapter floods to periwinkle paper (`#e3e7ff`), because search is the moment the page changes state |
| Near-black with one acid accent | Four semantic hues and a white primary action |
| ALL-CAPS eyebrows over every heading | Sentence-case headings, no eyebrows |
| "01 / 02 / 03" markers on content that isn't a sequence | Numbers only for real sequences; the daily loop uses verbs instead |
| Fake metrics and decorative graphs | Every number is measured in CI (`bench/`), with a link to the method |
| Fade-up entrances on every section | One hero entrance. Everything else moves only to show what changed, plus three short loops that demonstrate the product |
| Cards with identical radius and shadow | Radius follows hierarchy (18–20 for panels, 12–14 for inputs, 8–10 for chips); no drop shadows on black |

## The story order

1. **Your work, remembered.** A scattered day of notes flies into one log, joined by a thread.
2. **Write it down.** Three lines are typed and land; the third replaces the first, which is struck through and linked.
3. **Find it again.** The page floods to paper from the search box. The query pulls three matches out of a wall of notes and issues; keyword score puts the old Redis decision first, then the replacement rule swaps them.
4. **See what's next.** Open items lift out of the week into a ranked list, each with the rule that put it there.
5. **The number.** Keyword search versus memoRABLE on the duplicate-issue benchmark, counted up as you scroll.
6. Search that reads engineering text (the live analyzer), then the live demo search, briefs and your workspace.

Each section answers the question the previous one raises.

## Verifying a visual change

Build the components with bun, stub Next's runtime modules (`next/image`, `next/link`), and drive them with Playwright at 1440 and 390 px. PR #110's description has the exact steps. For the chapters, screenshot each one at several progress values (scroll to `top + (height − innerHeight) × p`); a frame where nothing is on stage is a bug. Then check the Vercel preview, and production after merge.
