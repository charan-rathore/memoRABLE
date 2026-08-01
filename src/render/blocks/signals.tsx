import type { ReactElement } from "react";
import { Column, ColumnLayouts, Heading, Paragraph, Row } from "@unlayer/react-elements";
import type { MemoryBlock, SignalEntry, SignalsPayload } from "@/domain/memory/schema";
import { trendColor } from "../tokens";
import { escapeHtml, inlineText } from "../safe-inline";
import {
  emptyBlockRow,
  notesRows,
  sectionLabelRow,
  asideParagraph,
  padFor,
  scaledPx,
  type BlockRenderContext,
} from "./common";

/**
 * Signals: the numbers, set as cards rather than a bare grid so a figure
 * reads as a figure. Email keeps to two across; anything narrower collapses
 * badly in Outlook. Card chrome follows the active preset's calloutStyle.
 */
export function renderSignalsRows(block: MemoryBlock, ctx: BlockRenderContext): ReactElement[] {
  const payload = block.payload as SignalsPayload;
  const entries = payload.entries;
  const notes = payload.notes ?? [];
  const rows: ReactElement[] = [...sectionLabelRow(block, ctx)];
  const pad = padFor(ctx.theme);

  if (entries.length === 0) {
    rows.push(
      emptyBlockRow(block, "No signals were recognized in this source. Nothing was invented.", ctx.surface, ctx.theme),
    );
    rows.push(...notesRows(block, notes, ctx.surface, ctx.theme));
    return rows;
  }

  const perRow =
    ctx.mode === "email"
      ? 2
      : ctx.theme.webHorizontal && ctx.mode === "web"
        ? Math.min(entries.length, 4)
        : ctx.theme.chartEmphasis
          ? Math.min(entries.length, 3)
          : entries.length === 4
            ? 2
            : Math.min(entries.length, 3);
  for (let i = 0; i < entries.length; i += perRow) {
    const chunk = entries.slice(i, i + perRow);
    const isLast = i + perRow >= entries.length && !entries.some((e) => e.implication) && notes.length === 0;
    rows.push(kpiRow(block, ctx, chunk, i, isLast));
  }

  const withMeaning = entries.filter((e) => e.implication);
  if (withMeaning.length > 0) {
    rows.push(
      <Row
        key={`${block.id}-meaning`}
        layout={ColumnLayouts.OneColumn}
        backgroundColor={ctx.surface}
        padding={notes.length === 0 ? pad.last : pad.body}
      >
        <Column>
          {withMeaning.map((entry, i) =>
            asideParagraph(
              `What ${entry.label} tends to mean: ${entry.implication}`,
              `${block.id}-impl-${i}`,
              ctx.theme,
            ),
          )}
        </Column>
      </Row>,
    );
  }

  rows.push(...notesRows(block, notes, ctx.surface, ctx.theme));
  return rows;
}

function kpiRow(
  block: MemoryBlock,
  ctx: BlockRenderContext,
  chunk: SignalEntry[],
  offset: number,
  isLast: boolean,
): ReactElement {
  const c = ctx.theme.colors;
  const f = ctx.theme.fonts;
  const pad = padFor(ctx.theme);
  const scale = ctx.theme.fontScale;
  const callout = ctx.theme.calloutStyle;
  const cardColor =
    callout === "plain" ? ctx.surface : ctx.surface === c.surface ? c.surface2 : c.surface;
  const layout =
    chunk.length === 1
      ? ColumnLayouts.OneColumn
      : chunk.length === 2
        ? ColumnLayouts.TwoEqual
        : chunk.length === 3
          ? ColumnLayouts.ThreeEqual
          : ColumnLayouts.FourEqual;
  const side = pad.side;
  return (
    <Row
      key={`${block.id}-kpi-${offset}`}
      layout={layout}
      backgroundColor={ctx.surface}
      padding={isLast ? pad.last : `0px ${side} 10px ${side}`}
    >
      {chunk.map((entry, i) => (
        <Column
          key={`${block.id}-kpi-${offset}-${i}`}
          padding="16px 18px"
          backgroundColor={cardColor}
          borderRadius={callout === "plain" ? "0px" : "12px"}
          border={
            callout === "plain"
              ? {
                  borderRightWidth: i === chunk.length - 1 ? "0px" : "12px",
                  borderRightStyle: "solid",
                  borderRightColor: ctx.surface,
                }
              : {
                  borderTopWidth: callout === "rule" ? "0px" : "1px",
                  borderTopStyle: "solid",
                  borderTopColor: c.line,
                  borderBottomWidth: callout === "rule" ? "0px" : "1px",
                  borderBottomStyle: "solid",
                  borderBottomColor: c.line,
                  borderLeftWidth: "3px",
                  borderLeftStyle: "solid",
                  borderLeftColor: entry.value !== undefined ? c.accent : c.line2,
                  borderRightWidth: i === chunk.length - 1 ? "0px" : "12px",
                  borderRightStyle: "solid",
                  borderRightColor: ctx.surface,
                }
          }
        >
          {entry.value !== undefined ? (
            <Paragraph
              html={inlineText(entry.label.toUpperCase())}
              fontFamily={f.mono}
              fontSize={scaledPx(10, scale)}
              color={c.ink3}
              letterSpacing="0.11em"
              lineHeight="150%"
            />
          ) : null}
          <Heading
            headingType="h3"
            fontFamily={f.sans}
            fontSize={scaledPx(entry.value !== undefined ? 26 : 14, scale)}
            fontWeight={entry.value !== undefined ? 700 : 600}
            color={c.ink}
            lineHeight="122%"
          >
            {escapeHtml(entry.value !== undefined ? String(entry.value) : entry.label)}
          </Heading>
          {entry.delta !== undefined ? (
            <Paragraph
              html={inlineText(formatDelta(entry.delta, entry.trend))}
              fontFamily={f.mono}
              fontSize={scaledPx(11.5, scale)}
              color={trendColor(entry.trend)}
              lineHeight="150%"
            />
          ) : null}
        </Column>
      ))}
    </Row>
  );
}

function formatDelta(delta: string | number, trend: SignalEntry["trend"]): string {
  const text = String(delta);
  if (trend === "up" && !/^[+▲\-]/.test(text)) return `+${text}`;
  if (trend === "down" && !/^[-▼+]/.test(text)) return `−${text}`;
  return text;
}
