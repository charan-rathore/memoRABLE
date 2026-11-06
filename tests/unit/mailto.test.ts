// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { buildEmailHandoff, htmlToPlainText, MAILTO_URL_LIMIT } from "@/utils/mailto";

describe("htmlToPlainText", () => {
  it("strips tags and keeps block structure as lines", () => {
    const html = "<html><head><style>body{color:red}</style></head><body><h1>Title</h1><p>First&nbsp;para</p><p>Second para</p><ul><li>One</li><li>Two</li></ul></body></html>";
    const text = htmlToPlainText(html);
    expect(text.indexOf("Title")).toBeLessThan(text.indexOf("First"));
    expect(text).toContain("First para");
    expect(text).toContain("- One");
    expect(text).not.toContain("<h1>");
    expect(text).not.toContain("color:red");
  });

  it("decodes entities exactly as rendered, including numeric ones", () => {
    expect(htmlToPlainText("<p>A &amp; B &lt; C &#8217; D</p>")).toBe("A & B < C ’ D");
  });

  it("preserves absolute link destinations and meaningful image alt text", () => {
    const text = htmlToPlainText('<p>Read the <a href="https://example.com/report">report</a>.</p><p><a href="#section-2">jump</a></p><img src="chart.png" alt="Revenue chart">');
    expect(text).toContain("report (https://example.com/report)");
    expect(text).toContain("jump");
    expect(text).not.toContain("jump (#section-2)");
    expect(text).toContain("Revenue chart");
  });
});

describe("buildEmailHandoff", () => {
  it("opens the user's mail app with no recipient, no cc, no bcc", () => {
    const result = buildEmailHandoff({ subject: "Q3 Board Report", bodyText: "Short body." });
    expect(result.url.startsWith("mailto:?subject=")).toBe(true);
    expect(result.url).toContain(encodeURIComponent("Q3 Board Report"));
    expect(result.url).toContain(encodeURIComponent("Short body."));
    expect(result.url).not.toMatch(/[?&](cc|bcc)=/);
    expect(result.truncated).toBe(false);
  });

  it("treats header-looking text in subject and body as data, never as headers", () => {
    const result = buildEmailHandoff({ subject: "Hi?bcc=evil@example.com", bodyText: "x" });
    expect(result.url.startsWith("mailto:?subject=")).toBe(true);
    expect(result.url).not.toMatch(/[?&](cc|bcc)=/);
  });

  it("keeps the full body verbatim when it fits", () => {
    const body = "Line one.\n\nLine two with 100% real numbers & symbols <ok>.";
    const result = buildEmailHandoff({ subject: "S", bodyText: body });
    expect(result.truncated).toBe(false);
    expect(decodeURIComponent(result.url.split("body=")[1]!)).toBe(body);
  });

  it("never silently truncates: over-limit bodies go to the clipboard whole, with a warning and a pointer body", () => {
    const longBody = "Full sentence with details. ".repeat(400);
    const result = buildEmailHandoff({ subject: "Long doc", bodyText: longBody });
    expect(result.truncated).toBe(true);
    expect(result.url.length).toBeLessThanOrEqual(MAILTO_URL_LIMIT);
    expect(result.clipboardText).toContain(longBody);
    expect(result.warning.length).toBeGreaterThan(0);
    expect(decodeURIComponent(result.url.split("body=")[1]!)).not.toContain(longBody.slice(0, 60));
  });

  it("enforces the URL limit in every branch, including long subjects and empty bodies", () => {
    const longSubject = "A".repeat(2000);
    for (const bodyText of ["", "short", "Body. ".repeat(500)]) {
      const result = buildEmailHandoff({ subject: longSubject, bodyText });
      expect(result.url.length).toBeLessThanOrEqual(MAILTO_URL_LIMIT);
      expect(result.truncated).toBe(true);
      expect(result.clipboardText).toContain(longSubject);
      if (bodyText) expect(result.clipboardText).toContain(bodyText);
    }
  });

  it("strips control characters from the header subject so decoded text cannot inject headers", () => {
    for (const evil of [
      "Quarterly report\r\nBcc: attacker@example.com",
      "Report\nCc: attacker@example.com",
      "Title\r only",
      "NUL\u0000byte",
    ]) {
      const result = buildEmailHandoff({ subject: evil, bodyText: "x" });
      const decodedSubject = decodeURIComponent(result.url.split("subject=")[1]!.split("&")[0]!);
      // The words may remain as ordinary subject text; the header break may not.
      expect(decodedSubject).not.toMatch(/[\r\n\u0000-\u001F\u007F]/);
    }
  });

  it("keeps the original subject untouched in the clipboard fallback, where it is content not a header", () => {
    const longBody = "Body text. ".repeat(400);
    const subject = "Line one\nLine two " + "x".repeat(100);
    const result = buildEmailHandoff({ subject, bodyText: longBody });
    expect(result.truncated).toBe(true);
    expect(result.clipboardText).toContain(subject);
  });

  it("empty body still opens a usable draft", () => {
    const result = buildEmailHandoff({ subject: "Only a title", bodyText: "" });
    expect(result.url.startsWith("mailto:?subject=")).toBe(true);
    expect(result.truncated).toBe(false);
  });
});
