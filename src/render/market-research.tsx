/**
 * Market-research output mode: an Umbrex-method prep pack for the current
 * source document.
 *
 * Each of the 10 standing-method steps renders the playbook guidance with
 * source links and access limits, plus an explicit missing-input state.
 * Source excerpts are deliberately NOT auto-mapped to steps: step-relevance
 * cannot be qualified yet (known understanding-stage classification limits,
 * e.g. D4), and showing unsupported excerpts as sizing/scenario inputs would
 * present them as more than they are. Guidance is framework, never market
 * fact; the mode never invents market content and never fetches live data.
 */
import type { ReactElement } from "react";
import {
  Column,
  ColumnLayouts,
  Divider,
  Heading,
  Page,
  Paragraph,
  Row,
} from "@unlayer/react-elements";
import type { MemoryDocument } from "@/domain/memory/schema";
import { escapeHtml, inlineLink } from "./safe-inline";
import type { PublishTheme } from "./themes";
import {
  GUIDANCE_RETRIEVED,
  ILLUSTRATIVE_EXAMPLE_BAN,
  UMBREX_GUIDANCE_PACK,
  type GuidanceStep,
} from "@/understanding/market-research/guidance-pack";

const GAP_LINE = "No step-qualified content identified in this source - research needed.";

export function buildMarketResearchRoot(
  doc: MemoryDocument,
  theme: PublishTheme,
): { root: ReactElement } {
  const c = theme.colors;
  const side = 40;
  const p = (text: string, size = 14, color = c.ink) => (
    <Paragraph
      html={escapeHtml(text)}
      fontFamily={theme.fonts.sans}
      fontSize={`${size}px`}
      color={color}
      lineHeight="165%"
    />
  );
  const label = (text: string) => p(text.toUpperCase(), 10, c.ink2);

  const stepRows = UMBREX_GUIDANCE_PACK.map((step: GuidanceStep) => (
    <Row key={step.id} layout={ColumnLayouts.OneColumn} padding={`18px ${side}px`} backgroundColor={c.surface}>
      <Column>
        <Heading headingType="h2" fontFamily={theme.fonts.serif} fontSize="22px" color={c.ink} lineHeight="130%">
          {escapeHtml(step.title)}
        </Heading>
        {label("Guidance - Umbrex playbooks")}
        {step.guidance.map((g, i) => (
          <Paragraph
            key={`g-${i}`}
            html={escapeHtml(`- ${g}`)}
            fontFamily={theme.fonts.sans}
            fontSize="13px"
            color={c.ink}
            lineHeight="160%"
          />
        ))}
        {step.sources.map((url) => (
          <Paragraph
            key={url}
            html={inlineLink(url, url.replace("https://umbrex.com/resources/", "umbrex.com/.../"), c.accent)}
            fontFamily={theme.fonts.sans}
            fontSize="11px"
            lineHeight="150%"
          />
        ))}
        {step.accessNotes ? p(`Access note: ${step.accessNotes}`, 11, c.ink2) : null}
        <Divider borderTopWidth="1px" borderTopStyle="solid" borderTopColor={c.ink2} />
        {p(GAP_LINE, 13, c.ink2)}
      </Column>
    </Row>
  ));

  return {
    root: (
      <Page
        backgroundColor={c.paper}
        contentWidth={theme.documentContentWidth}
        fontFamily={theme.fonts.sans}
        textColor={c.ink}
        linkStyle={{ linkColor: c.accent, linkUnderline: false }}
        _meta={{ htmlID: "u_content_body_1" }}
      >
        <Row layout={ColumnLayouts.OneColumn} padding={`24px ${side}px 12px`} backgroundColor={c.surface2}>
          <Column>
            {p("memoRABLE", 14, c.ink)}
            <Heading headingType="h1" fontFamily={theme.fonts.serif} fontSize="30px" color={c.ink} lineHeight="125%">
              {escapeHtml(`Market research prep: ${doc.title}`)}
            </Heading>
            {p(
              "An Umbrex-method pack to prepare market research on this source. Guidance is framework, not fact: market figures must come from research you supply, never from the playbooks.",
              13,
              c.ink2,
            )}
            {p(
              "This is preparation, not a completed market study. No source excerpts are shown as step inputs: automatic classification cannot yet qualify which excerpts are relevant to which step, and unsupported excerpts would mislead. Your document's other outputs (Web, Email, Document) contain automatically extracted content that should be reviewed before use.",
              12,
              c.ink2,
            )}
          </Column>
        </Row>
        {stepRows}
        <Row layout={ColumnLayouts.OneColumn} padding={`20px ${side}px 28px`} backgroundColor={c.surface2}>
          <Column>
            {label("Provenance and limits")}
            {p(`Guidance retrieved ${GUIDANCE_RETRIEVED} from Umbrex's public playbook pages; chapters that were not retrievable are marked, with the access mechanism (paywall vs server error) stated as unverified where unknown.`, 11, c.ink2)}
            {p(ILLUSTRATIVE_EXAMPLE_BAN, 11, c.ink2)}
            {p("memoRABLE does not fetch live market data. Steps marked as needing research require external sources you supply.", 11, c.ink2)}
          </Column>
        </Row>
      </Page>
    ),
  };
}
