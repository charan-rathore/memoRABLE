/**
 * PDF and Word exports.
 *
 * Unlayer Elements already renders the Document mode as print-ready HTML, so
 * neither format needs a rendering engine of its own:
 *
 *  - PDF goes through the browser's own print pipeline, which is what
 *    "print-ready HTML" is for. The user picks "Save as PDF" in the dialog.
 *  - Word opens an HTML document natively when it carries the Office
 *    namespaces and is served as `application/msword`.
 *
 * Both reuse the exact HTML shown in the preview, so what is published is what
 * was on screen.
 *
 * Print opens a top-level `blob:` document rather than a hidden iframe. Chrome
 * can drop the PDF `/Dests` name tree when the print root is a subframe, which
 * leaves TOC jump links dangling. A top-level document keeps them.
 */

/** Extract the body of a full HTML document, or return the fragment unchanged. */
export function bodyOf(html: string): string {
  const match = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html);
  return match ? match[1]! : html;
}

/** Extract the contents of every <style> element in the document head. */
export function stylesOf(html: string): string {
  const styles: string[] = [];
  const pattern = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) styles.push(match[1]!);
  return styles.join("\n");
}

const PAGE_CSS = `@page { size: A4; margin: 18mm 16mm; }
@media print {
  html, body { background: #ffffff !important; }
  /* Keep in-document jumps visibly accented — an invisible clickable link is a
     worse affordance than a blue one once the PDF is open. */
  a[href^="#"] { text-decoration: none; color: #1E3BD6; }
  a:not([href^="#"]) { text-decoration: none; color: inherit; }
  table, tr, td, th, img { page-break-inside: avoid; }
  h1, h2, h3 { page-break-after: avoid; }
}`;

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * A Word-openable document. The `mso` block tells Word to open in print view
 * at A4 rather than guessing a web layout.
 */
export function buildWordDocument(html: string, title: string): string {
  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8" />
<title>${escapeAttribute(title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->
<style>
${stylesOf(html)}
${PAGE_CSS}
body { font-family: Georgia, "Times New Roman", serif; }
</style>
</head>
<body>
${bodyOf(html)}
</body>
</html>
`;
}

/** The preview HTML with a print stylesheet appended, ready for the print dialog. */
export function buildPrintDocument(html: string): string {
  const style = `<style>${PAGE_CSS}</style>`;
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${style}</head>`);
  return `${style}${html}`;
}

export type PrintOutcome = { ok: true } | { ok: false; error: string };

/**
 * Print via a top-level blob document so Chrome keeps the PDF named-destination
 * tree that TOC jump links need. Falls back to a same-origin iframe when the
 * popup is blocked.
 */
export function printHtmlDocument(html: string, doc: Document = document): PrintOutcome {
  try {
    const printable = buildPrintDocument(html);
    const blob = new Blob([printable], { type: "text/html" });
    const url = URL.createObjectURL(blob);

    const win = typeof window !== "undefined" ? window.open(url, "_blank") : null;
    if (win) {
      const cleanup = () => {
        try {
          win.close();
        } catch {
          /* already closed */
        }
        URL.revokeObjectURL(url);
      };
      win.addEventListener("load", () => {
        try {
          win.focus();
          win.print();
        } catch {
          cleanup();
          return;
        }
        win.addEventListener("afterprint", cleanup, { once: true });
        // Some browsers never fire afterprint — don't leave the blob hanging.
        window.setTimeout(cleanup, 60_000);
      });
      return { ok: true };
    }

    URL.revokeObjectURL(url);
    return printViaIframe(printable, doc);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Last resort when a popup is blocked — may lose PDF Dest names in some Chromium builds. */
function printViaIframe(printable: string, doc: Document): PrintOutcome {
  try {
    const frame = doc.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.setAttribute("title", "Print preview");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
    frame.srcdoc = printable;

    frame.onload = () => {
      const view = frame.contentWindow;
      if (!view) {
        frame.remove();
        return;
      }
      const cleanup = () => window.setTimeout(() => frame.remove(), 500);
      view.addEventListener("afterprint", cleanup, { once: true });
      try {
        view.focus();
        view.print();
      } catch {
        cleanup();
      }
    };

    doc.body.appendChild(frame);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
