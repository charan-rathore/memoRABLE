import { describe, expect, it } from "vitest";
import { bodyOf, buildPrintDocument, buildWordDocument, stylesOf } from "@/utils/print-export";

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

  it("prepends the stylesheet when there is no head", () => {
    const printable = buildPrintDocument("<p>fragment</p>");
    expect(printable.startsWith("<style>")).toBe(true);
    expect(printable).toContain("<p>fragment</p>");
  });
});
