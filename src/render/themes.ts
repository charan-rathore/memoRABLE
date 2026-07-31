import { colors as baseColors, fonts as baseFonts } from "./tokens";

/**
 * Publication presets (Notion-style): one click changes typography, spacing,
 * colours, charts, callouts, margins and layout. No settings panel.
 * Default "editorial" matches the original look for demos and tests.
 */

export const PUBLISH_THEME_IDS = ["editorial", "academic", "minimal", "executive"] as const;
export type PublishThemeId = (typeof PUBLISH_THEME_IDS)[number];

export type ThemeColors = { [K in keyof typeof baseColors]: string };

export interface PublishTheme {
  id: PublishThemeId;
  label: string;
  description: string;
  colors: ThemeColors;
  fonts: typeof baseFonts;
  fontScale: number;
  chartEmphasis: boolean;
  webHorizontal: boolean;
  webContentWidth: `${number}px`;
  /** Padding scale for section bands (applied at root content width / feel). */
  spacing: "tight" | "normal" | "airy";
  calloutStyle: "plain" | "tint" | "rule";
}

const editorial: PublishTheme = {
  id: "editorial",
  label: "Editorial",
  description: "Paper, serif accents, calm reading measure.",
  colors: baseColors,
  fonts: baseFonts,
  fontScale: 1,
  chartEmphasis: false,
  webHorizontal: false,
  webContentWidth: "760px",
  spacing: "normal",
  calloutStyle: "tint",
};

const academic: PublishTheme = {
  id: "academic",
  label: "Academic",
  description: "Serif body, generous margins, quiet figures.",
  colors: {
    ...baseColors,
    accent: "#1A365D",
    accentHover: "#132A4A",
    accentSoft: "#E8EEF5",
    paper: "#FBF9F4",
    surface2: "#F3F0E8",
  },
  fonts: baseFonts,
  fontScale: 1.04,
  chartEmphasis: false,
  webHorizontal: false,
  webContentWidth: "720px",
  spacing: "airy",
  calloutStyle: "rule",
};

const minimal: PublishTheme = {
  id: "minimal",
  label: "Minimal",
  description: "Tight spacing, muted colour, spare charts.",
  colors: {
    ...baseColors,
    accent: "#111111",
    accentHover: "#000000",
    accentSoft: "#F2F2F2",
    paper: "#FFFFFF",
    surface2: "#F7F7F7",
    ink2: "#555555",
    ink3: "#888888",
    line: "#E8E8E8",
  },
  fonts: {
    ...baseFonts,
    serif: baseFonts.sans,
  },
  fontScale: 0.94,
  chartEmphasis: false,
  webHorizontal: false,
  webContentWidth: "680px",
  spacing: "tight",
  calloutStyle: "plain",
};

const executive: PublishTheme = {
  id: "executive",
  label: "Executive",
  description: "Bold accent, chart-forward, confident layout.",
  colors: {
    ...baseColors,
    accent: "#0B5FFF",
    accentHover: "#0847C7",
    accentSoft: "#E8F0FF",
    paper: "#F7F9FC",
    surface2: "#EEF3FA",
  },
  fonts: {
    ...baseFonts,
    serif: baseFonts.sans,
  },
  fontScale: 1.05,
  chartEmphasis: true,
  webHorizontal: true,
  webContentWidth: "880px",
  spacing: "normal",
  calloutStyle: "tint",
};

export const PUBLISH_THEMES: Record<PublishThemeId, PublishTheme> = {
  editorial,
  academic,
  minimal,
  executive,
};

/** Alias used in the UI chip. */
export const PUBLICATION_PRESETS = PUBLISH_THEMES;

export function resolveTheme(id: PublishThemeId | string | undefined): PublishTheme {
  if (id && id in PUBLISH_THEMES) return PUBLISH_THEMES[id as PublishThemeId];
  return editorial;
}

export function isPublishThemeId(value: string): value is PublishThemeId {
  return (PUBLISH_THEME_IDS as readonly string[]).includes(value);
}
