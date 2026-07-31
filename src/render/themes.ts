import { colors as baseColors, fonts as baseFonts } from "./tokens";

/**
 * Lightweight publish themes. Default ("editorial") matches today's look exactly
 * so existing demos and tests stay stable. Other themes only tweak palette,
 * type scale, signal density, and web column flow — no new dependencies.
 */

export const PUBLISH_THEME_IDS = ["editorial", "signal", "compact", "horizon"] as const;
export type PublishThemeId = (typeof PUBLISH_THEME_IDS)[number];

export type ThemeColors = { [K in keyof typeof baseColors]: string };

export interface PublishTheme {
  id: PublishThemeId;
  label: string;
  description: string;
  colors: ThemeColors;
  fonts: typeof baseFonts;
  /** Multiplier for body/heading font sizes in block rows. */
  fontScale: number;
  /** Prefer denser KPI grids (charts/cards emphasis). */
  chartEmphasis: boolean;
  /** Web pages use wider multi-column horizontal flow where safe. */
  webHorizontal: boolean;
  webContentWidth: `${number}px`;
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
};

const signal: PublishTheme = {
  id: "signal",
  label: "Signal",
  description: "Larger figures, stronger accent, chart-forward cards.",
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
  fontScale: 1.06,
  chartEmphasis: true,
  webHorizontal: false,
  webContentWidth: "820px",
};

const compact: PublishTheme = {
  id: "compact",
  label: "Compact",
  description: "Smaller type, tighter bands, more on one screen.",
  colors: {
    ...baseColors,
    accent: "#2A2A28",
    accentHover: "#14130F",
    accentSoft: "#F0EFE8",
  },
  fonts: baseFonts,
  fontScale: 0.92,
  chartEmphasis: false,
  webHorizontal: false,
  webContentWidth: "700px",
};

const horizon: PublishTheme = {
  id: "horizon",
  label: "Horizon",
  description: "Wide web flow, multi-column bands, airy measure.",
  colors: {
    ...baseColors,
    accent: "#0F6B5C",
    accentHover: "#0B5246",
    accentSoft: "#E7F4F1",
    paper: "#F5FAF8",
    surface2: "#EAF3F0",
  },
  fonts: baseFonts,
  fontScale: 1.02,
  chartEmphasis: true,
  webHorizontal: true,
  webContentWidth: "960px",
};

export const PUBLISH_THEMES: Record<PublishThemeId, PublishTheme> = {
  editorial,
  signal,
  compact,
  horizon,
};

export function resolveTheme(id: PublishThemeId | string | undefined): PublishTheme {
  if (id && id in PUBLISH_THEMES) return PUBLISH_THEMES[id as PublishThemeId];
  return editorial;
}

export function isPublishThemeId(value: string): value is PublishThemeId {
  return (PUBLISH_THEME_IDS as readonly string[]).includes(value);
}
