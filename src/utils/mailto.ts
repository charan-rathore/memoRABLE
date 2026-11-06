/**
 * "Open in email app": hand the composed Email output to the user's own mail
 * client as a draft. The draft opens with no recipient, no cc and no bcc -
 * addressing and sending stay with the user, in their app.
 *
 * Mail apps and browsers disagree on how long a mailto: URL can be, so
 * nothing is ever cut to fit. A body (or subject) that would push the URL
 * past MAILTO_URL_LIMIT goes to the clipboard untouched, the draft body says
 * so, and the caller shows the warning. A shortened email is data loss; a
 * clipboard copy is not.
 */

import { bodyOf } from "@/utils/print-export";

/** Whole-URL budget, conservative enough for older mail handlers. */
export const MAILTO_URL_LIMIT = 1800;

export interface EmailHandoff {
  url: string;
  /** True when the draft is a pointer and the real content is on the clipboard. */
  truncated: boolean;
  /** The complete content when truncated; the caller must place it on the clipboard BEFORE opening the draft. */
  clipboardText: string | null;
  /** User-visible explanation when truncated; empty otherwise. */
  warning: string;
}

const GENERIC_SUBJECT = "Composed email";

/**
 * A mail client's draft headers come from the DECODED subject, so CR/LF and
 * other control characters must never reach it: a decoded "\r\nBcc: x" would
 * be header-looking text inside a header. Replaced with spaces here; the
 * clipboard fallback keeps the original subject untouched, because there it
 * is document content, not a header.
 */
export function safeMailSubject(value: string): string {
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/ +/g, " ")
    .trim();
}

const POINTER_BODY =
  "The full composed email was too long to pass to your mail app directly, so the complete text is on your clipboard. Paste it here, then restore the subject line from the clipboard if needed.";

/**
 * Rendered Email HTML to plain text, parsed through the DOM so entities
 * decode exactly as the browser showed them and link destinations survive:
 * an anchor keeps its absolute URL in parentheses after its text, and an
 * image with alt text keeps the alt. Block elements become lines, list items
 * get a dash.
 */
export function htmlToPlainText(html: string): string {
  const container = document.createElement("div");
  container.innerHTML = bodyOf(html)
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "");
  const out: string[] = [];
  const BLOCK = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "TR", "TABLE", "UL", "OL", "BLOCKQUOTE", "SECTION", "ARTICLE", "HEADER", "FOOTER"]);
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out.push((node.textContent ?? "").replace(/\s+/g, " "));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    if (el.tagName === "BR") {
      out.push("\n");
      return;
    }
    if (el.tagName === "IMG") {
      const alt = el.getAttribute("alt")?.trim();
      if (alt) out.push(alt);
      return;
    }
    if (el.tagName === "LI") out.push("\n- ");
    el.childNodes.forEach(walk);
    if (el.tagName === "A") {
      const href = el.getAttribute("href") ?? "";
      if (/^https?:\/\//i.test(href)) out.push(` (${href})`);
      return;
    }
    if (el.tagName === "TD" || el.tagName === "TH") {
      out.push("  ");
      return;
    }
    if (BLOCK.has(el.tagName)) out.push("\n");
  };
  container.childNodes.forEach(walk);
  return out
    .join("")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildEmailHandoff({
  subject,
  bodyText,
}: {
  subject: string;
  bodyText: string;
}): EmailHandoff {
  const headerSubject = safeMailSubject(subject) || GENERIC_SUBJECT;
  const direct = `mailto:?subject=${encodeURIComponent(headerSubject)}${bodyText.length > 0 ? `&body=${encodeURIComponent(bodyText)}` : ""}`;
  if (direct.length <= MAILTO_URL_LIMIT) {
    return { url: direct, truncated: false, clipboardText: null, warning: "" };
  }
  // Nothing is shortened to fit: the clipboard carries the subject and body
  // whole, and the draft points at it under a subject that always fits.
  const clipboardText = `Subject: ${subject}\n\n${bodyText}`;
  const pointer = `mailto:?subject=${encodeURIComponent(GENERIC_SUBJECT)}&body=${encodeURIComponent(POINTER_BODY)}`;
  return {
    url: pointer.length <= MAILTO_URL_LIMIT ? pointer : `mailto:?subject=${encodeURIComponent(GENERIC_SUBJECT)}`,
    truncated: true,
    clipboardText,
    warning:
      "This email is too long to open directly in your mail app. The complete text, including the subject line, was copied to your clipboard - paste it into the email draft on your device.",
  };
}
