/**
 * Safe inline handling.
 *
 * Imported/model content is ALWAYS escaped before it enters an Elements
 * `html` prop. The only tags that ever appear in rendered output are
 * app-generated (`<b>`, `<i>`) wrapped around already-escaped text.
 * Imported HTML is never passed through, and the `Html` tool is never used
 * for user content.
 */

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ESCAPES[ch] ?? ch);
}

/** Plain escaped text for Paragraph `html` props. */
export function inlineText(value: string): string {
  return escapeHtml(value);
}

/** App-generated bold wrapper around escaped text. */
export function inlineBold(value: string): string {
  return `<b>${escapeHtml(value)}</b>`;
}

/** App-generated italic wrapper around escaped text. */
export function inlineItalic(value: string): string {
  return `<i>${escapeHtml(value)}</i>`;
}

/** Join already-built inline fragments with an escaped separator. */
export function inlineJoin(parts: readonly string[], separator = " · "): string {
  return parts.filter((p) => p.length > 0).join(escapeHtml(separator));
}
