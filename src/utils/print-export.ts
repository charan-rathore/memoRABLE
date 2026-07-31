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
  a { text-decoration: none; color: inherit; }
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
 * Print via a hidden same-origin iframe so the workbench itself is never
 * replaced, and pop-up blockers are not involved. The frame is removed once
 * the dialog closes.
 */
export function printHtmlDocument(html: string, doc: Document = document): PrintOutcome {
  try {
    const frame = doc.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.setAttribute("title", "Print preview");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
    frame.srcdoc = buildPrintDocument(html);

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
