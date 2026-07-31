import type { FontFamilyInput } from "@unlayer/react-elements";

/**
 * Editorial Paper design tokens, shared by every output mode.
 * Single source of truth for the Elements renderers (the app UI mirrors
 * these values in globals.css).
 */

export const fonts: Record<"serif" | "sans" | "mono", FontFamilyInput> = {
  serif: { label: "Georgia", value: "Georgia, 'Iowan Old Style', 'Times New Roman', serif" },
  sans: {
    label: "System Sans",
    value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
  },
  mono: { label: "Mono", value: "ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace" },
};

export const colors = {
  paper: "#FAF9F5",
  surface: "#FFFFFF",
  surface2: "#F4F2EB",
  ink: "#14130F",
  ink2: "#54534B",
  ink3: "#8C8A7E",
  line: "#E7E4DA",
  line2: "#D9D5C8",
  /** Text set on the ink hero band, where the paper/ink relationship inverts. */
  heroInk: "#D5D2C6",
  heroMuted: "#95928A",
  accent: "#1E3BD6",
  accentSoft: "#EEF0FB",
  ok: "#1E7F4F",
  okSoft: "#E9F4EE",
  warn: "#A85B0A",
  warnSoft: "#FAF1E4",
  err: "#C03434",
  errSoft: "#FAECEC",
} as const;

export const HAIRLINE = {
  borderBottomWidth: "1px",
  borderBottomStyle: "solid",
  borderBottomColor: colors.line,
} as const;

export function trendColor(trend: "up" | "flat" | "down" | undefined): string {
  if (trend === "up") return colors.ok;
  if (trend === "down") return colors.err;
  return colors.ink3;
}

export function severityColor(severity: "high" | "medium" | "low"): string {
  if (severity === "high") return colors.err;
  if (severity === "medium") return colors.warn;
  return colors.ink3;
}

export function statusColor(status: string): string {
  switch (status) {
    case "approved":
    case "shipped":
    case "done":
      return colors.ok;
    case "requested":
    case "on-track":
    case "open":
      return colors.accent;
    case "rejected":
      return colors.err;
    default:
      return colors.ink3;
  }
}

export function statusLabel(status: string): string {
  switch (status) {
    case "on-track":
      return "On track";
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}
