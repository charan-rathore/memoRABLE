import { describe, expect, it } from "vitest";
import { bodyOf, buildPrintDocument, buildWordDocument, stylesOf, unwrapLeadingLayoutTable } from "@/utils/print-export";

const SAMPLE = [
  "<!DOCTYPE html>",
  '<html><head><meta charset="utf-8" />',
  "<style>.a { color: red; }</style>",
  "<style>.b { color: blue; }</style>",
  "</head>",
  '<body class="doc"><h1>Finsight</h1><p>Body copy.</p></body>',
  "</html>",
].join("\n");

describe("bodyOf", () => {
  it("extracts the body of a full document", () => {
    expect(bodyOf(SAMPLE)).toContain("<h1>Finsight</h1>");
    expect(bodyOf(SAMPLE)).not.toContain("<style>");
  });

  it("returns a fragment unchanged", () => {
    expect(bodyOf("<p>just a fragment</p>")).toBe("<p>just a fragment</p>");
  });
});

describe("stylesOf", () => {
  it("collects every style block", () => {
    const styles = stylesOf(SAMPLE);
    expect(styles).toContain(".a { color: red; }");
    expect(styles).toContain(".b { color: blue; }");
  });

  it("returns empty string when there are no styles", () => {
    expect(stylesOf("<p>x</p>")).toBe("");
  });
});

describe("buildWordDocument", () => {
  const word = buildWordDocument(SAMPLE, 'Finsight "v3" & co');

  it("carries the Office namespaces Word needs to open it natively", () => {
    expect(word).toContain("urn:schemas-microsoft-com:office:word");
    expect(word).toContain("<w:View>Print</w:View>");
  });

  it("keeps the rendered content and its styles", () => {
    expect(word).toContain("<h1>Finsight</h1>");
    expect(word).toContain(".a { color: red; }");
    expect(word).toContain("@page");
  });

  it("escapes the title into the head", () => {
    expect(word).toContain("Finsight &quot;v3&quot; &amp; co");
  });
});

describe("buildPrintDocument", () => {
  it("injects the page stylesheet into an existing head", () => {
    const printable = buildPrintDocument(SAMPLE);
    expect(printable).toContain("@page");
    expect(printable.indexOf("@page")).toBeLessThan(printable.indexOf("</head>"));
    expect(printable).toContain("<h1>Finsight</h1>");
  });

  it("keeps in-document jumps visibly accented in print", () => {
    // An invisible clickable TOC entry is a worse affordance than a blue one.
    const printable = buildPrintDocument(SAMPLE);
    expect(printable).toContain('a[href^="#"]');
    expect(printable).toContain("#1E3BD6");
  });

  it("unwraps a leading single-cell layout table in the Word path only", () => {
    const wrapped = '<table role="presentation" id="u_content_body_1"><tbody><tr><td><p>INNER CONTENT</p></td></tr></tbody></table><p>after</p>';
    expect(unwrapLeadingLayoutTable(wrapped)).toBe('<div><p>INNER CONTENT</p></div><p>after</p>');
    // Conditional comments before the wrapper still unwrap.
    const withComment = '<!--[if IE]><div><![endif]-->' + wrapped;
    // mso/IE conditional comments carry inert table markup; the guard must ignore it.
    const mso = '<table id="u_content_body_1"><tbody><tr><td><!--[if (mso)|(IE)]><table><tr><td><![endif]--><p>INNER2</p><!--[if (mso)|(IE)]></td></tr></table><![endif]--></td></tr></tbody></table><p>tail</p>';
    expect(unwrapLeadingLayoutTable(withComment)).toContain('<p>INNER CONTENT</p>');
    const unwrappedMso = unwrapLeadingLayoutTable(mso);
    expect(unwrappedMso).toContain('<p>INNER2</p>');
    expect(unwrappedMso).not.toContain('u_content_body_1');
    // Tables without the renderer's wrapper id are never touched.
    const data = '<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>';
    expect(unwrapLeadingLayoutTable(data)).toBe(data);
    const notLeading = '<p>x</p>' + wrapped;
    expect(unwrapLeadingLayoutTable(notLeading)).toBe(notLeading);
    // The print/HTML path keeps the original markup.
    expect(buildPrintDocument(wrapped)).toContain('u_content_body_1');
    // The Word document no longer opens with the wrapper table.
    expect(buildWordDocument(wrapped, "T")).toContain('<p>INNER CONTENT</p>');
    expect(buildWordDocument(wrapped, "T")).not.toContain('id="u_content_body_1"');
  });

  it("Word wrapper lets tall tables break so page 1 is not blank", () => {
    // LibreOffice/Word honor page-break-inside: avoid strictly; a full-page
    // Unlayer wrapper table was pushed past a blank first page. The Word
    // stylesheet must override the print avoid rule for tables, after it.
    const doc = buildWordDocument(SAMPLE, "Title");
    const avoid = doc.indexOf("table, tr, td, th, img { page-break-inside: avoid; }");
    const allow = doc.indexOf("table, tr, td, th { page-break-inside: auto; }");
    expect(avoid).toBeGreaterThan(-1);
    expect(allow).toBeGreaterThan(avoid);
    // The print path keeps the strict avoid rule (Chrome handles tall rows).
    const printable = buildPrintDocument(SAMPLE);
    expect(printable).toContain("page-break-inside: avoid");
    expect(printable).not.toContain("page-break-inside: auto");
  });

  it("prepends the stylesheet when there is no head", () => {
    const printable = buildPrintDocument("<p>fragment</p>");
    expect(printable.startsWith("<style>")).toBe(true);
    expect(printable).toContain("<p>fragment</p>");
  });
});
