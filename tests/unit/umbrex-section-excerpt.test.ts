import { describe, it, expect } from "vitest";
import { extractSectionExcerpts } from "../../src/app/api/umbrex-guidance/core";

const SCOPING = "https://umbrex.com/resources/market-sizing-playbook/scoping-and-framing-the-exercise/";
const INDEX = "https://umbrex.com/resources/scenario-planning-playbook/";

const page = (body: string) =>
  `<html><head><title>T</title><style>.x{color:red}</style></head><body>` +
  `<nav><h2 class="elementor-heading-title">How to get started</h2><h2>Find a Consultant</h2></nav>` +
  body +
  `<footer><h2>Contact us</h2><p>form chrome</p></footer></body></html>`;

describe("extractSectionExcerpts", () => {
  it("quotes only the anchored section, never nav or footer chrome", () => {
    const html = page(
      `<h2 id="2-1-clarifying-the-business-question-and-decision-context">2.1 Clarifying the Business Question</h2>` +
      `<p>State the decision this research feeds before collecting anything.</p>` +
      `<h2 id="2-2-setting-market-granularity-and-geographic-scope">2.2 Granularity</h2><p>Other section.</p>`,
    );
    const { sections, note } = extractSectionExcerpts(html, SCOPING);
    expect(note).toBeDefined(); // 2-4 anchor absent from this synthetic page
    expect(sections).toHaveLength(1);
    expect(sections[0]!.anchorId).toBe("2-1-clarifying-the-business-question-and-decision-context");
    expect(sections[0]!.topic).toBe("Clarify the decision");
    expect(sections[0]!.excerpt).toContain("State the decision this research feeds");
    expect(sections[0]!.excerpt).not.toContain("Find a Consultant");
    expect(sections[0]!.excerpt).not.toContain("Other section");
    expect(sections[0]!.excerpt).not.toMatch(/<[a-z]/i);
  });

  it("stops the excerpt at the next same-level heading", () => {
    const html = page(
      `<h2 id="2-4-drafting-the-initial-hypothesis-and-workplan">2.4 Hypotheses</h2>` +
      `<p>Write falsifiable hypotheses.</p><h2 id="9-9-next">Next</h2><p>Do not include me.</p>`,
    );
    const { sections } = extractSectionExcerpts(html, SCOPING);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.excerpt).toContain("falsifiable");
    expect(sections[0]!.excerpt).not.toContain("Do not include me");
  });

  it("tolerates slug-text edits via the numeric prefix, but reports ambiguity", () => {
    const renamed = page(
      `<h2 id="2-1-clarifying-the-question-renamed">2.1 Renamed</h2><p>Content here.</p>`,
    );
    const ok = extractSectionExcerpts(renamed, SCOPING);
    expect(ok.sections[0]?.anchorId).toBe("2-1-clarifying-the-question-renamed");
    const ambiguous = page(
      `<h2 id="2-1-a">A</h2><p>x</p><h2 id="2-1-b">B</h2><p>y</p>` +
      `<h2 id="2-4-drafting-the-initial-hypothesis-and-workplan">H</h2><p>z</p>`,
    );
    const res = extractSectionExcerpts(ambiguous, SCOPING);
    expect(res.sections.map((s) => s.anchorId)).not.toContain("2-1-a");
    expect(res.note).toContain("2-1-clarifying-the-business-question-and-decision-context");
  });

  it("bounds long sections at a sentence boundary without digit-splitting", () => {
    const longSentence = "The model grew 12.5 percent in 2025 across 4 regions. ".repeat(40);
    const html = page(
      `<h2 id="2-1-clarifying-the-business-question-and-decision-context">H</h2><p>${longSentence}</p>`,
    );
    const { sections } = extractSectionExcerpts(html, SCOPING);
    expect(sections[0]!.excerpt.length).toBeLessThanOrEqual(1200);
    expect(sections[0]!.excerpt.endsWith(".")).toBe(true);
    expect(sections[0]!.excerpt).toContain("12.5 percent in 2025");
  });

  it("B1: an anchor id inside an HTML comment is not a heading - gap, not quote", () => {
    const html = page(
      `<!-- <h2 id="2-1-clarifying-the-business-question-and-decision-context">Nav template</h2><p>Book a consultation.</p> -->` +
      `<h2 id="2-4-drafting-the-initial-hypothesis-and-workplan">2.4 Real</h2><p>Genuine hypothesis text.</p>`,
    );
    const { sections, note } = extractSectionExcerpts(html, SCOPING);
    expect(sections.map((x) => x.anchorId)).toEqual(["2-4-drafting-the-initial-hypothesis-and-workplan"]);
    expect(note).toContain("2-1-clarifying-the-business-question-and-decision-context");
    expect(JSON.stringify(sections)).not.toContain("consultation");
  });

  it("B2: a final declared section never bleeds a heading-less footer", () => {
    const html =
      `<html><body><h2 id="2-4-drafting-the-initial-hypothesis-and-workplan">2.4 Hypotheses</h2>` +
      `<p>Write falsifiable hypotheses.</p>` +
      `<footer><p>Subscribe to our newsletter. Book a consultation.</p></footer></body></html>`;
    const { sections } = extractSectionExcerpts(html, SCOPING);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.excerpt).toContain("falsifiable");
    expect(sections[0]!.excerpt).not.toContain("newsletter");
    expect(sections[0]!.excerpt).not.toContain("consultation");
  });

  it("B3: an over-cap single sentence is flagged, and list numbers are not boundaries", () => {
    const oneLong = "A".repeat(1300);
    const htmlLong = page(
      `<h2 id="2-1-clarifying-the-business-question-and-decision-context">H</h2><p>${oneLong}</p>`,
    );
    const flagged = extractSectionExcerpts(htmlLong, SCOPING).sections[0]!;
    expect(flagged.excerpt.length).toBeLessThanOrEqual(1200);
    expect(flagged.truncatedMidSentence).toBe(true);

    const listText = "Intro line. " + "First step done. ".repeat(30) + "2. Second step continues here. " + "More detail. ".repeat(40);
    const htmlList = page(
      `<h2 id="2-1-clarifying-the-business-question-and-decision-context">H</h2><p>${listText}</p>`,
    );
    const sec = extractSectionExcerpts(htmlList, SCOPING).sections[0]!;
    if (sec.excerpt.length >= 1200) {
      // Any cut must not have treated "2. " as the sentence end.
      expect(sec.excerpt.endsWith("2.")).toBe(false);
    }
  });

  it("index pages and moved anchors are declared gaps, never chrome fallbacks", () => {
    const idx = extractSectionExcerpts(page("<p>table of contents</p>"), INDEX);
    expect(idx.sections).toHaveLength(0);
    expect(idx.note).toContain("index/contents page");
    const moved = extractSectionExcerpts(page("<h2>No ids here</h2><p>text</p>"), SCOPING);
    expect(moved.sections).toHaveLength(0);
    expect(moved.note).toContain("not found");
    expect(moved.note).not.toContain("table of contents");
  });
});
