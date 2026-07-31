import type { FontFamilyInput } from "@unlayer/react-elements";
import { colors as baseColors } from "./tokens";

/**
 * Publication presets. Each one changes colour, type, spacing, charts,
 * callouts, margins, layout AND which Elements chrome is composed in.
 * Default "editorial" keeps the original demo look.
 */

export const PUBLISH_THEME_IDS = ["editorial", "academic", "minimal", "executive"] as const;
export type PublishThemeId = (typeof PUBLISH_THEME_IDS)[number];

export type ThemeColors = { [K in keyof typeof baseColors]: string };

export interface ThemeFonts {
  serif: FontFamilyInput;
  sans: FontFamilyInput;
  mono: FontFamilyInput;
}

export interface ThemeChrome {
  /** Web/email jump Menu */
  showNavMenu: boolean;
  /** Cross-memory conversation band */
  showConversation: boolean;
  /** Document table of contents */
  showToc: boolean;
  /** Footer Button CTA */
  showFooterButton: boolean;
  /** Prefer Table-heavy risks (executive/academic) vs paragraph lists */
  preferTables: boolean;
  /** Menu separator string */
  menuSeparator: string;
}

export interface PublishTheme {
  id: PublishThemeId;
  label: string;
  description: string;
  colors: ThemeColors;
  fonts: ThemeFonts;
  fontScale: number;
  chartEmphasis: boolean;
  webHorizontal: boolean;
  webContentWidth: `${number}px`;
  documentContentWidth: `${number}px`;
  spacing: "tight" | "normal" | "airy";
  calloutStyle: "plain" | "tint" | "rule";
  chrome: ThemeChrome;
}

const mono: FontFamilyInput = {
  label: "Mono",
  value: "ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
};

/** Warm paper + Georgia. Magazine editorial (current default). */
const editorial: PublishTheme = {
  id: "editorial",
  label: "Editorial",
  description: "Warm paper, Georgia display, magazine rules and Menu.",
  colors: baseColors,
  fonts: {
    serif: { label: "Georgia", value: "Georgia, 'Iowan Old Style', 'Times New Roman', serif" },
    sans: {
      label: "System Sans",
      value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
    },
    mono,
  },
  fontScale: 1,
  chartEmphasis: false,
  webHorizontal: false,
  webContentWidth: "760px",
  documentContentWidth: "760px",
  spacing: "normal",
  calloutStyle: "tint",
  chrome: {
    showNavMenu: true,
    showConversation: true,
    showToc: true,
    showFooterButton: true,
    preferTables: true,
    menuSeparator: "  ",
  },
};

/** Scholarly calm: forest accent, Palatino, TOC + rules, no loud CTAs. */
const academic: PublishTheme = {
  id: "academic",
  label: "Academic",
  description: "Cream stone, Palatino, forest accent, TOC and quiet rules.",
  colors: {
    ...baseColors,
    paper: "#F5F5F4",
    surface: "#FFFDFA",
    surface2: "#EEEBE4",
    ink: "#1A1814",
    ink2: "#4A4740",
    ink3: "#8A857C",
    line: "#D9D4C8",
    line2: "#C8C2B4",
    accent: "#1F5E4E",
    accentHover: "#174638",
    accentSoft: "#E4F0EB",
    heroInk: "#D5D2C6",
    heroMuted: "#95928A",
  },
  fonts: {
    serif: {
      label: "Palatino",
      value: "Palatino, 'Palatino Linotype', 'Book Antiqua', 'Iowan Old Style', Georgia, serif",
    },
    sans: {
      label: "Source Sans",
      value: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
    },
    mono,
  },
  fontScale: 1.03,
  chartEmphasis: false,
  webHorizontal: false,
  webContentWidth: "700px",
  documentContentWidth: "680px",
  spacing: "airy",
  calloutStyle: "rule",
  chrome: {
    showNavMenu: true,
    showConversation: false,
    showToc: true,
    showFooterButton: false,
    preferTables: true,
    menuSeparator: " · ",
  },
};

/** Near-monochrome, Helvetica, no Menu/TOC chrome. Spare Elements tree. */
const minimal: PublishTheme = {
  id: "minimal",
  label: "Minimal",
  description: "White, Helvetica, no Menu or TOC. Only Rows and type.",
  colors: {
    ...baseColors,
    paper: "#FFFFFF",
    surface: "#FFFFFF",
    surface2: "#F4F4F4",
    ink: "#111111",
    ink2: "#444444",
    ink3: "#888888",
    line: "#E5E5E5",
    line2: "#D0D0D0",
    accent: "#111111",
    accentHover: "#000000",
    accentSoft: "#F0F0F0",
    heroInk: "#F5F5F5",
    heroMuted: "#A0A0A0",
  },
  fonts: {
    serif: {
      label: "Helvetica",
      value: "Helvetica Neue, Helvetica, Arial, sans-serif",
    },
    sans: {
      label: "Helvetica",
      value: "Helvetica Neue, Helvetica, Arial, sans-serif",
    },
    mono: {
      label: "Mono",
      value: "Menlo, Consolas, monospace",
    },
  },
  fontScale: 0.92,
  chartEmphasis: false,
  webHorizontal: false,
  webContentWidth: "640px",
  documentContentWidth: "640px",
  spacing: "tight",
  calloutStyle: "plain",
  chrome: {
    showNavMenu: false,
    showConversation: false,
    showToc: false,
    showFooterButton: false,
    preferTables: false,
    menuSeparator: " ",
  },
};

/** Board / KPI: cool blue, system UI, Menu + Buttons + chart grids. */
const executive: PublishTheme = {
  id: "executive",
  label: "Executive",
  description: "Cool slate, UI sans, Menu, Buttons and chart-forward cards.",
  colors: {
    ...baseColors,
    paper: "#F4F7FB",
    surface: "#FFFFFF",
    surface2: "#E8EEF6",
    ink: "#0F172A",
    ink2: "#334155",
    ink3: "#64748B",
    line: "#D8E0EC",
    line2: "#C0CBD9",
    accent: "#0B5FFF",
    accentHover: "#0847C7",
    accentSoft: "#E0ECFF",
    heroInk: "#E2E8F0",
    heroMuted: "#94A3B8",
  },
  fonts: {
    serif: {
      label: "UI Sans",
      value: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    },
    sans: {
      label: "UI Sans",
      value: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    },
    mono,
  },
  fontScale: 1.04,
  chartEmphasis: true,
  webHorizontal: true,
  webContentWidth: "920px",
  documentContentWidth: "800px",
  spacing: "normal",
  calloutStyle: "tint",
  chrome: {
    showNavMenu: true,
    showConversation: true,
    showToc: false,
    showFooterButton: true,
    preferTables: true,
    menuSeparator: "  |  ",
  },
};

export const PUBLISH_THEMES: Record<PublishThemeId, PublishTheme> = {
  editorial,
  academic,
  minimal,
  executive,
};

export const PUBLICATION_PRESETS = PUBLISH_THEMES;

export function resolveTheme(id: PublishThemeId | string | undefined): PublishTheme {
  if (id && id in PUBLISH_THEMES) return PUBLISH_THEMES[id as PublishThemeId];
  return editorial;
}

export function isPublishThemeId(value: string): value is PublishThemeId {
  return (PUBLISH_THEME_IDS as readonly string[]).includes(value);
}
