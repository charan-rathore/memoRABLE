# The Sunday letter: design rules

The letter is one week of your own log, read back to you on Sunday. It is written
once as four [Hyper Elements](https://hyperelements.dev) templates that share one
theme (`theme.ts`) and one set of fields (`fields.ts`):

| Template | Root | What it's for |
|---|---|---|
| `memorable.WeekLetter` (`email.tsx`) | Email | the letter in your inbox |
| `memorable.WeekPage` (`page.tsx`) | Page | the same week as a web page |
| `memorable.DecisionRecord` (`record.tsx`) | Document | one A4 page per decision, to file or print |
| `memorable.WeekCard` (`card.tsx`) | Canvas | the image you post on Monday (1200×630, 1080×1080) |

## What it should feel like

A letter from someone who was paying attention, not a dashboard. Large type that
says one true thing, then the evidence underneath it.

- **Flat fields of colour, one per band.** Cobalt for what you did, pink for the
  question, cream for the record, ink for the sign-off. Never a gradient, glow,
  blur, shadow or glass.
- **Two voices.** Archivo Black says the fact ("four things."). Crimson Text
  italic says how it reads to a person ("this week you decided"). DM Sans
  carries the body text. Anonymous Pro carries the notes: lowercase, prefixed
  with `>`. Never a third display face.
- **One accent, once per screen.** The tomato dot that ends a headline. On
  cobalt it warms to `#ff8a5c` so it still clears 3:1.
- **Counts are words.** "four things", not "4 items". Digits only past twelve.
- **Say where the numbers came from.** "74% likely you still remember why" is
  FSRS-5's predicted recall, and the letter says that below 90% the decision
  comes back. No unexplained scores.

## What it never does

These are the habits that make a screen read as machine-made:

- emoji as icons, sparkle or ✨ "AI" badges, rocket or celebration copy
- a grid of three equal cards with an icon, a title and two lines each
- purple-to-blue gradients, glassmorphism, neon on black
- buttons that say "Get started", "Unlock", "Supercharge" or "Learn more"
- text under 14px, or contrast under 4.5:1 (3:1 for 24px and up)
- centred paragraphs. Only a headline may be centred.

## Links never change anything

Mail clients and corporate scanners open every link in an email. "Still holds"
and "It changed" carry the question (`?still=<handle>&answer=holds`); the app
shows it and records the answer only when you press the button
(`src/components/today/letter-prompt.tsx`). Unsubscribing (`?letter=off`) is
undoable on the page it lands on.

## Guardrails that are checked

Every template declares its rules, and `check()` holds the example to them in
`tests/unit/sunday-letter.test.tsx`:

- the email must pass lint's `unsubscribe`, `link-text`, `lang` and `contrast`
  rules and `layout/overflow`, and may link only to `memo-rable.vercel.app`
- the page must pass `link-text`, `lang`, `contrast`, `heading-order` and `heading-one`
- the record and the card are checked for layout and fields

`npm run letter` writes every output to `out/letter/`. CI does the same and keeps
the files as the `sunday-letter` artifact.
