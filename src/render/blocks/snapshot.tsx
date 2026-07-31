import type { ReactElement } from "react";
import { Column, ColumnLayouts, Divider, Heading, Paragraph, Row } from "@unlayer/react-elements";
import type { MemoryBlock, SnapshotPayload } from "@/domain/memory/schema";
import { colors, fonts } from "../tokens";
import { escapeHtml, inlineText } from "../safe-inline";
import { notesRows, sectionLabelRow, type BlockRenderContext } from "./common";

/**
 * Snapshot — the opening. In first position it becomes the cover, and each
 * surface gets the cover it deserves: a dark hero band on the web, a compact
 * masthead in email, a ruled title page in print. Moved out of first position
 * it degrades gracefully into an ordinary section.
 */
export function renderSnapshotRows(block: MemoryBlock, ctx: BlockRenderContext): ReactElement[] {
  const payload = block.payload as SnapshotPayload;
  const notes = payload.notes ?? [];
  const isCover = ctx.position === 0;

  const cover = isCover
    ? ctx.mode === "web"
      ? webHero(block, ctx, payload)
      : ctx.mode === "document"
        ? documentCover(block, ctx, payload)
        : emailMasthead(block, ctx, payload)
    : [...sectionLabelRow(block, ctx), plainSnapshotRow(block, ctx, payload)];

  return [...cover, ...notesRows(block, notes, coverSurface(ctx, isCover))];
}

function coverSurface(ctx: BlockRenderContext, isCover: boolean): string {
  return isCover && ctx.mode === "web" ? colors.surface : ctx.surface;
}

/* --------------------------------- web ---------------------------------- */

/** Ink band, full bleed: the one place the page raises its voice. */
function webHero(block: MemoryBlock, ctx: BlockRenderContext, payload: SnapshotPayload): ReactElement[] {
  return [
    <Row key={`${block.id}-hero`} layout={ColumnLayouts.OneColumn} backgroundColor={colors.ink} padding="64px 44px 58px 44px">
      <Column>
        <Paragraph
          html={inlineText(ctx.documentTitle.toUpperCase())}
          fontFamily={fonts.mono}
          fontSize="11px"
          color={colors.heroMuted}
          letterSpacing="0.18em"
          lineHeight="150%"
        />
        <Heading
          headingType="h1"
          fontFamily={fonts.serif}
          fontSize="42px"
          fontWeight={700}
          color={colors.paper}
          lineHeight="112%"
        >
          {escapeHtml(payload.heading)}
        </Heading>
        <Paragraph
          html={inlineText(payload.summary)}
          fontFamily={fonts.sans}
          fontSize="16px"
          color={colors.heroInk}
          lineHeight="165%"
        />
        {payload.byline ? (
          <Paragraph
            html={inlineText(payload.byline)}
            fontFamily={fonts.mono}
            fontSize="11.5px"
            color={colors.heroMuted}
            lineHeight="150%"
          />
        ) : null}
      </Column>
    </Row>,
  ];
}

/* ------------------------------- document -------------------------------- */

/** A title page: heavy rule, title, byline, closing hairline. */
function documentCover(block: MemoryBlock, ctx: BlockRenderContext, payload: SnapshotPayload): ReactElement[] {
  return [
    <Row key={`${block.id}-cover-rule`} layout={ColumnLayouts.OneColumn} backgroundColor={ctx.surface} padding="48px 44px 0px 44px">
      <Column padding="0px">
        <Divider borderTopWidth="3px" borderTopStyle="solid" borderTopColor={colors.ink} />
      </Column>
    </Row>,
    <Row key={`${block.id}-cover`} layout={ColumnLayouts.OneColumn} backgroundColor={ctx.surface} padding="22px 44px 26px 44px">
      <Column>
        <Paragraph
          html={inlineText(ctx.documentTitle.toUpperCase())}
          fontFamily={fonts.mono}
          fontSize="10.5px"
          color={colors.ink3}
          letterSpacing="0.18em"
          lineHeight="150%"
        />
        <Heading headingType="h1" fontFamily={fonts.serif} fontSize="34px" fontWeight={700} color={colors.ink} lineHeight="116%">
          {escapeHtml(payload.heading)}
        </Heading>
        <Paragraph html={inlineText(payload.summary)} fontFamily={fonts.serif} fontSize="15px" color={colors.ink2} lineHeight="168%" />
        {payload.byline ? (
          <Paragraph html={inlineText(payload.byline)} fontFamily={fonts.sans} fontSize="12px" color={colors.ink3} lineHeight="150%" />
        ) : null}
      </Column>
    </Row>,
  ];
}

/* --------------------------------- email --------------------------------- */

/** Compact masthead: one accent tick, the headline, the summary. */
function emailMasthead(block: MemoryBlock, ctx: BlockRenderContext, payload: SnapshotPayload): ReactElement[] {
  return [
    <Row key={`${block.id}-mast`} layout={ColumnLayouts.OneColumn} backgroundColor={ctx.surface} padding="30px 40px 6px 40px">
      <Column padding="0px 0px 12px 0px">
        <Divider borderTopWidth="2px" borderTopStyle="solid" borderTopColor={colors.accent} width="34px" textAlign="left" />
      </Column>
    </Row>,
    <Row key={`${block.id}-mast-body`} layout={ColumnLayouts.OneColumn} backgroundColor={ctx.surface} padding="0px 40px 26px 40px">
      <Column>
        <Heading headingType="h1" fontFamily={fonts.serif} fontSize="27px" fontWeight={700} color={colors.ink} lineHeight="118%">
          {escapeHtml(payload.heading)}
        </Heading>
        <Paragraph html={inlineText(payload.summary)} fontFamily={fonts.sans} fontSize="14.5px" color={colors.ink2} lineHeight="165%" />
        {payload.byline ? (
          <Paragraph html={inlineText(payload.byline)} fontFamily={fonts.sans} fontSize="12px" color={colors.ink3} lineHeight="150%" />
        ) : null}
      </Column>
    </Row>,
  ];
}

/* ------------------------- snapshot out of position ----------------------- */

function plainSnapshotRow(block: MemoryBlock, ctx: BlockRenderContext, payload: SnapshotPayload): ReactElement {
  return (
    <Row key={`${block.id}-main`} layout={ColumnLayouts.OneColumn} backgroundColor={ctx.surface} padding="0px 44px 30px 44px">
      <Column>
        <Heading
          headingType="h3"
          fontFamily={fonts.serif}
          fontSize={ctx.mode === "email" ? "20px" : "24px"}
          fontWeight={700}
          color={colors.ink}
          lineHeight="122%"
        >
          {escapeHtml(payload.heading)}
        </Heading>
        <Paragraph
          html={inlineText(payload.summary)}
          fontFamily={fonts.sans}
          fontSize={ctx.mode === "email" ? "14px" : "15px"}
          color={colors.ink2}
          lineHeight="160%"
        />
        {payload.byline ? (
          <Paragraph html={inlineText(payload.byline)} fontFamily={fonts.sans} fontSize="12px" color={colors.ink3} lineHeight="150%" />
        ) : null}
      </Column>
    </Row>
  );
}
