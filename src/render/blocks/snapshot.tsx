import type { ReactElement } from "react";
import {
  Column,
  ColumnLayouts,
  Divider,
  Heading,
  Paragraph,
  Row,
  type FontFamilyInput,
} from "@unlayer/react-elements";
import type { MemoryBlock, SnapshotPayload } from "@/domain/memory/schema";
import { escapeHtml, inlineText } from "../safe-inline";
import { notesRows, sectionLabelRow, padFor, scaledPx, type BlockRenderContext } from "./common";

/**
 * Snapshot — the opening. In first position it becomes the cover, and each
 * surface gets the cover it deserves: a dark hero band on the web, a compact
 * masthead in email, a ruled title page in print. Colours and type follow the
 * active publish preset so Editorial / Academic / Minimal / Executive read as
 * different publications, not just different chrome.
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

  return [...cover, ...notesRows(block, notes, coverSurface(ctx, isCover), ctx.theme)];
}

function coverSurface(ctx: BlockRenderContext, isCover: boolean): string {
  return isCover && ctx.mode === "web" ? ctx.theme.colors.surface : ctx.surface;
}

/* --------------------------------- web ---------------------------------- */

/** Ink band, full bleed: the one place the page raises its voice. */
function webHero(block: MemoryBlock, ctx: BlockRenderContext, payload: SnapshotPayload): ReactElement[] {
  const c = ctx.theme.colors;
  const f = ctx.theme.fonts;
  const scale = ctx.theme.fontScale;
  const pad = padFor(ctx.theme);
  const side = pad.side;
  return [
    <Row
      key={`${block.id}-hero`}
      layout={ColumnLayouts.OneColumn}
      backgroundColor={c.ink}
      padding={`${Math.round(64 * (ctx.theme.spacing === "tight" ? 0.75 : 1))}px ${side} ${Math.round(58 * (ctx.theme.spacing === "tight" ? 0.75 : 1))}px ${side}`}
    >
      <Column>
        <Paragraph
          html={inlineText(ctx.documentTitle.toUpperCase())}
          fontFamily={f.mono}
          fontSize={scaledPx(11, scale)}
          color={c.heroMuted}
          letterSpacing="0.18em"
          lineHeight="150%"
        />
        <Heading
          headingType="h1"
          fontFamily={f.serif}
          fontSize={scaledPx(42, scale)}
          fontWeight={700}
          color={c.paper}
          lineHeight="112%"
        >
          {escapeHtml(payload.heading)}
        </Heading>
        {primaryFrame(payload, {
          labelColor: c.heroMuted,
          bodyColor: c.paper,
          fontLabel: f.mono,
          fontBody: f.serif,
          scale,
          size: 17,
        })}
        {!payload.goal && !payload.problem && !payload.outcome && payload.hook ? (
          <Paragraph
            html={inlineText(payload.hook)}
            fontFamily={f.serif}
            fontSize={scaledPx(18, scale)}
            color={c.paper}
            lineHeight="145%"
          />
        ) : null}
        <Paragraph
          html={inlineText(payload.summary)}
          fontFamily={f.sans}
          fontSize={scaledPx(16, scale)}
          color={c.heroInk}
          lineHeight="165%"
        />
        {payload.byline ? (
          <Paragraph
            html={inlineText(payload.byline)}
            fontFamily={f.mono}
            fontSize={scaledPx(11.5, scale)}
            color={c.heroMuted}
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
  const c = ctx.theme.colors;
  const f = ctx.theme.fonts;
  const scale = ctx.theme.fontScale;
  const side = padFor(ctx.theme).side;
  const rows: ReactElement[] = [];
  if (ctx.theme.calloutStyle !== "plain") {
    rows.push(
      <Row
        key={`${block.id}-cover-rule`}
        layout={ColumnLayouts.OneColumn}
        backgroundColor={ctx.surface}
        padding={`48px ${side} 0px ${side}`}
      >
        <Column padding="0px">
          <Divider
            borderTopWidth={ctx.theme.calloutStyle === "rule" ? "1px" : "3px"}
            borderTopStyle="solid"
            borderTopColor={c.ink}
          />
        </Column>
      </Row>,
    );
  }
  rows.push(
    <Row
      key={`${block.id}-cover`}
      layout={ColumnLayouts.OneColumn}
      backgroundColor={ctx.surface}
      padding={`22px ${side} 26px ${side}`}
    >
      <Column>
        <Paragraph
          html={inlineText(ctx.documentTitle.toUpperCase())}
          fontFamily={f.mono}
          fontSize={scaledPx(10.5, scale)}
          color={c.ink3}
          letterSpacing="0.18em"
          lineHeight="150%"
        />
        <Heading
          headingType="h1"
          fontFamily={f.serif}
          fontSize={scaledPx(34, scale)}
          fontWeight={700}
          color={c.ink}
          lineHeight="116%"
        >
          {escapeHtml(payload.heading)}
        </Heading>
        {primaryFrame(payload, {
          labelColor: c.ink3,
          bodyColor: c.ink,
          fontLabel: f.mono,
          fontBody: f.serif,
          scale,
          size: 15,
        })}
        {!payload.goal && !payload.problem && !payload.outcome && payload.hook ? (
          <Paragraph
            html={inlineText(payload.hook)}
            fontFamily={f.serif}
            fontSize={scaledPx(16, scale)}
            color={c.ink}
            lineHeight="150%"
          />
        ) : null}
        <Paragraph
          html={inlineText(payload.summary)}
          fontFamily={f.serif}
          fontSize={scaledPx(15, scale)}
          color={c.ink2}
          lineHeight="168%"
        />
        {payload.byline ? (
          <Paragraph
            html={inlineText(payload.byline)}
            fontFamily={f.sans}
            fontSize={scaledPx(12, scale)}
            color={c.ink3}
            lineHeight="150%"
          />
        ) : null}
      </Column>
    </Row>,
  );
  return rows;
}

/* --------------------------------- email --------------------------------- */

/** Compact masthead: one accent tick, the headline, the summary. */
function emailMasthead(block: MemoryBlock, ctx: BlockRenderContext, payload: SnapshotPayload): ReactElement[] {
  const c = ctx.theme.colors;
  const f = ctx.theme.fonts;
  const scale = ctx.theme.fontScale;
  const rows: ReactElement[] = [];
  if (ctx.theme.calloutStyle !== "plain") {
    rows.push(
      <Row key={`${block.id}-mast`} layout={ColumnLayouts.OneColumn} backgroundColor={ctx.surface} padding="30px 40px 6px 40px">
        <Column padding="0px 0px 12px 0px">
          <Divider
            borderTopWidth={ctx.theme.calloutStyle === "rule" ? "1px" : "2px"}
            borderTopStyle="solid"
            borderTopColor={ctx.theme.calloutStyle === "rule" ? c.ink2 : c.accent}
            width={ctx.theme.calloutStyle === "rule" ? "100%" : "34px"}
            textAlign="left"
          />
        </Column>
      </Row>,
    );
  }
  rows.push(
    <Row
      key={`${block.id}-mast-body`}
      layout={ColumnLayouts.OneColumn}
      backgroundColor={ctx.surface}
      padding={ctx.theme.calloutStyle === "plain" ? "30px 40px 26px 40px" : "0px 40px 26px 40px"}
    >
      <Column>
        <Heading
          headingType="h1"
          fontFamily={f.serif}
          fontSize={scaledPx(27, scale)}
          fontWeight={700}
          color={c.ink}
          lineHeight="118%"
        >
          {escapeHtml(payload.heading)}
        </Heading>
        {primaryFrame(payload, {
          labelColor: c.ink3,
          bodyColor: c.ink,
          fontLabel: f.mono,
          fontBody: f.serif,
          scale,
          size: 14,
        })}
        {!payload.goal && !payload.problem && !payload.outcome && payload.hook ? (
          <Paragraph
            html={inlineText(payload.hook)}
            fontFamily={f.serif}
            fontSize={scaledPx(15, scale)}
            color={c.ink}
            lineHeight="145%"
          />
        ) : null}
        <Paragraph
          html={inlineText(payload.summary)}
          fontFamily={f.sans}
          fontSize={scaledPx(14.5, scale)}
          color={c.ink2}
          lineHeight="165%"
        />
        {payload.byline ? (
          <Paragraph
            html={inlineText(payload.byline)}
            fontFamily={f.sans}
            fontSize={scaledPx(12, scale)}
            color={c.ink3}
            lineHeight="150%"
          />
        ) : null}
      </Column>
    </Row>,
  );
  return rows;
}

/* ------------------------- snapshot out of position ----------------------- */

function plainSnapshotRow(block: MemoryBlock, ctx: BlockRenderContext, payload: SnapshotPayload): ReactElement {
  const c = ctx.theme.colors;
  const f = ctx.theme.fonts;
  const scale = ctx.theme.fontScale;
  const side = padFor(ctx.theme).side;
  return (
    <Row key={`${block.id}-main`} layout={ColumnLayouts.OneColumn} backgroundColor={ctx.surface} padding={`0px ${side} 30px ${side}`}>
      <Column>
        <Heading
          headingType="h3"
          fontFamily={f.serif}
          fontSize={scaledPx(ctx.mode === "email" ? 20 : 24, scale)}
          fontWeight={700}
          color={c.ink}
          lineHeight="122%"
        >
          {escapeHtml(payload.heading)}
        </Heading>
        {primaryFrame(payload, {
          labelColor: c.ink3,
          bodyColor: c.ink,
          fontLabel: f.mono,
          fontBody: f.serif,
          scale,
          size: 14,
        })}
        {!payload.goal && !payload.problem && !payload.outcome && payload.hook ? (
          <Paragraph
            html={inlineText(payload.hook)}
            fontFamily={f.serif}
            fontSize={scaledPx(15, scale)}
            color={c.ink}
            lineHeight="150%"
          />
        ) : null}
        <Paragraph
          html={inlineText(payload.summary)}
          fontFamily={f.sans}
          fontSize={scaledPx(ctx.mode === "email" ? 14 : 15, scale)}
          color={c.ink2}
          lineHeight="160%"
        />
        {payload.byline ? (
          <Paragraph
            html={inlineText(payload.byline)}
            fontFamily={f.sans}
            fontSize={scaledPx(12, scale)}
            color={c.ink3}
            lineHeight="150%"
          />
        ) : null}
      </Column>
    </Row>
  );
}

/** Primary Goal / Problem / Outcome — the memories a snapshot should frame. */
function primaryFrame(
  payload: SnapshotPayload,
  style: {
    labelColor: string;
    bodyColor: string;
    fontLabel: FontFamilyInput;
    fontBody: FontFamilyInput;
    scale: number;
    size: number;
  },
): ReactElement[] {
  const rows: Array<[string, string | undefined]> = [
    ["Primary goal", payload.goal],
    ["Primary problem", payload.problem],
    ["Primary business outcome", payload.outcome],
  ];
  return rows
    .filter(([, value]) => Boolean(value))
    .map(([label, value], i) => (
      <Paragraph
        key={`frame-${i}`}
        html={inlineText(`${label.toUpperCase()} — ${value}`)}
        fontFamily={style.fontBody}
        fontSize={scaledPx(style.size, style.scale)}
        color={style.bodyColor}
        lineHeight="145%"
      />
    ));
}
