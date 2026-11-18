/**
 * The Sunday letter's theme. Written once; the email, the page, the record and
 * the card all take it, so they agree without copying values.
 *
 * Direction (see DESIGN.md beside this file):
 * - Flat fields of colour, one per section. No gradients, glows or shadows.
 * - One heavy grotesk (Archivo Black) for what you did, one serif italic
 *   (Crimson Text) for how it reads to a person. Never a third display face.
 * - One accent, used once per screen: the tomato dot that ends a headline.
 * - Notes in a typewriter mono, lowercase, prefixed with ">".
 */
import { defineTheme } from "@hyper-elements/react";

export const INK = {
  cobalt: "#1b3ccf",
  pink: "#f2a5c6",
  cream: "#f4ede1",
  paper: "#fbf8f2",
  ink: "#201e1f",
  /** The one accent, on cream and ink (3.44:1 and 4.14:1, large text only: it only ever ends a headline). */
  dot: "#e8431b",
  /** The same gesture on cobalt, warmed until it clears 3:1 (3.49:1). */
  dotOnCobalt: "#ff8a5c",
  /** Notes on cream: 5.6:1 on #f4ede1. */
  stone: "#6b6458",
  /** Notes on cobalt: cream at a readable tint, 6.9:1 on cobalt. */
  mist: "#d9dcf6",
  /** Notes on pink: 7.4:1. */
  plum: "#5a2440",
  rule: "#d8cfbf",
} as const;

export const FONT_URL = "https://memo-rable.vercel.app/fonts/letter";

export const FACES = {
  display: "'Archivo Black', 'Arial Black', 'Helvetica Neue', Arial, sans-serif",
  voice: "'Crimson Text', Georgia, 'Times New Roman', serif",
  body: "'DM Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif",
  note: "'Anonymous Pro', 'Courier New', Courier, monospace",
} as const;

/** Web fonts for roots that load them; every stack falls back to a system face. */
export const fontFaces = [
  { family: "Archivo Black", src: `${FONT_URL}/ArchivoBlack-Regular.ttf`, format: "truetype", weight: 400, style: "normal" },
  { family: "Crimson Text", src: `${FONT_URL}/CrimsonText-Italic.ttf`, format: "truetype", weight: 400, style: "italic" },
  { family: "Crimson Text", src: `${FONT_URL}/CrimsonText-Regular.ttf`, format: "truetype", weight: 400, style: "normal" },
  { family: "DM Sans", src: `${FONT_URL}/DMSans-Regular.ttf`, format: "truetype", weight: 400, style: "normal" },
  { family: "DM Sans", src: `${FONT_URL}/DMSans-Bold.ttf`, format: "truetype", weight: 700, style: "normal" },
  { family: "Anonymous Pro", src: `${FONT_URL}/AnonymousPro-Regular.ttf`, format: "truetype", weight: 400, style: "normal" },
] as const;

export const letterTheme = defineTheme({
  colors: {
    background: INK.cream,
    foreground: INK.ink,
    primary: INK.ink,
    primaryForeground: INK.cream,
    muted: INK.stone,
    border: INK.rule,
    cobalt: INK.cobalt,
    pink: INK.pink,
    cream: INK.cream,
    paper: INK.paper,
    dot: INK.dot,
    mist: INK.mist,
    plum: INK.plum,
  },
  fonts: { body: FACES.body, heading: FACES.display },
  fontSizes: { body: 16 },
  lineHeights: { body: 1.55 },
  elements: {
    Heading: {
      fontWeight: 400,
      letterSpacing: -0.5,
      lineHeight: 1,
      by: {
        level: {
          1: { fontSize: 64, letterSpacing: -2, mobile: { fontSize: 44 } },
          2: { fontSize: 30, letterSpacing: -0.8, lineHeight: 1.1, mobile: { fontSize: 24 } },
          3: { fontSize: 20, letterSpacing: -0.3, lineHeight: 1.2 },
        },
      },
    },
    Button: {
      fontFamily: FACES.body,
      fontWeight: 700,
      fontSize: 15,
      padding: [14, 22],
      borderRadius: 999,
      hover: { backgroundColor: "#000000" },
    },
    Link: { color: INK.ink, textDecoration: "underline" },
  },
  styles: {
    /** The serif italic: the human half of a headline. */
    voice: { fontFamily: FACES.voice, fontStyle: "italic", fontWeight: 400, letterSpacing: 0 },
    /** Typewriter notes. */
    note: { fontFamily: FACES.note, fontSize: 14, lineHeight: 1.55, letterSpacing: 0.1 },
    /** A handle, as you'd type it. */
    handle: { fontFamily: FACES.note, fontSize: 14, letterSpacing: 0.3 },
  },
});
