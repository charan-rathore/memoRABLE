# Design principles

The interface is an **Editorial Paper** system: a quiet page where the document is the hero and the tooling steps back. These principles were applied to every screen and are encoded in `src/app/globals.css` and `src/render/tokens.ts`.

## 1. Paper, not chrome

- Background is paper (`#FAF9F5`), surfaces are white, separators are hairlines (`#E7E4DA`) — no heavy panels, no shadows-as-decoration.
- Ink is near-black (`#14130F`), with a single restrained accent: cobalt (`#1E3BD6`), used only for selection, primary actions, and the brand mark.
- Three typefaces with fixed jobs: Georgia serif for document voice (headings, the Document output), system sans for UI, and a monospace for metadata (counts, hashes, locators, statuses).

## 2. Output-first

The default view is the finished thing: the app opens on a remembered document, published as a **Document**, before any input happens. Controls live in the rails; the center canvas belongs to the output. Mode switching (Web page / Email / Document) swaps the artifact, never the layout.

## 3. One verb per beat

The journey strip is the whole story — **Bring → Understand → Remember → Arrange → Publish** — with honest statuses (done, active, error: "couldn't understand · N errors"). Nothing in the UI asks the user to do anything outside those five verbs.

## 4. Provenance is a first-class surface

Every memory shows *Remembered from*: a method label a human can trust ("Exact JSON", "Recognized locally", "Verified example"), the locator (`blocks[1] · signals`, `heading "Signals" · lines 12–18`), and the escaped excerpt, with *View source* highlighting the exact range. Trust is shown, not claimed.

## 5. Motion must earn its place

Small durations, standard easing, staggered reveals capped at 80ms steps. Under `prefers-reduced-motion`, animation collapses to near-zero and the replay shows its whole story instantly without autoplay. The replay itself is presentation-only — it snapshots and restores state, runs the *real* import, and can be stopped with Escape at any moment.

## 6. Responsive without a second app

One workbench, three layouts. Below 960px the rails collapse into bottom tabs — **Bring · Memories · Publish** — defaulting to Publish so the output stays first. The tab bar is fixed and always clickable; touch targets stay ≥ 40px; nothing requires hover (arrange controls appear on selection and focus, not just hover).

## 7. Clinical honesty

Errors say what happened and what was preserved ("We couldn't understand this JSON. Nothing was changed."). Stale previews are badged as stale. Disabled exports say why. Empty states say what to do next. The confirmation that ends the flow is one word: **Published.**
