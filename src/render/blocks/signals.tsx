import type { ReactElement } from "react";
import { Column, ColumnLayouts, Heading, Paragraph, Row } from "@unlayer/react-elements";
import type { MemoryBlock, SignalEntry, SignalsPayload } from "@/domain/memory/schema";
import { colors, fonts, trendColor } from "../tokens";
import { escapeHtml, inlineText } from "../safe-inline";
import { emptyBlockRow, notesRows, sectionLabelRow, asideParagraph, PAD, type BlockRenderContext } from "./common";

/**
 * Signals: the numbers, set as cards rather than a bare grid so a figure
 * reads as a figure. Email keeps to two across; anything narrower collapses
 * badly in Outlook.
 */
export function renderSignalsRows(block: MemoryBlock, ctx: BlockRenderContext): ReactElement[] {
  const payload = block.payload as SignalsPayload;
  const entries = payload.entries;
  const notes = payload.notes ?? [];
  const rows: ReactElement[] = [...sectionLabelRow(block, ctx)];

  if (entries.length === 0) {
    rows.push(emptyBlockRow(block, "No signals were recognized in this source. Nothing was invented.", ctx.surface));
    rows.push(...notesRows(block, notes, ctx.surface));
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
        padding={notes.length === 0 ? PAD.last : PAD.body}
      >
        <Column>
          {withMeaning.map((entry, i) =>
            asideParagraph(
              `What ${entry.label} tends to mean: ${entry.implication}`,
              `${block.id}-impl-${i}`,
            ),
          )}
        </Column>
      </Row>,
    );
  }

  rows.push(...notesRows(block, notes, ctx.surface));
  return rows;
}

function kpiRow(
  block: MemoryBlock,
  ctx: BlockRenderContext,
  chunk: SignalEntry[],
  offset: number,
  isLast: boolean,
): ReactElement {
  // Cards always take the opposite tone to the band they sit on, so a figure
  // reads as a card wherever the section lands in the arrangement.
  const cardColor = ctx.surface === colors.surface ? colors.surface2 : colors.surface;
  const layout =
    chunk.length === 1
      ? ColumnLayouts.OneColumn
      : chunk.length === 2
        ? ColumnLayouts.TwoEqual
        : chunk.length === 3
          ? ColumnLayouts.ThreeEqual
          : ColumnLayouts.FourEqual;
  return (
    <Row
      key={`${block.id}-kpi-${offset}`}
      layout={layout}
      backgroundColor={ctx.surface}
      padding={isLast ? PAD.last : "0px 44px 10px 44px"}
    >
      {chunk.map((entry, i) => (
        <Column
          key={`${block.id}-kpi-${offset}-${i}`}
          padding="16px 18px"
          backgroundColor={cardColor}
          borderRadius="12px"
          border={{
            borderTopWidth: "1px",
            borderTopStyle: "solid",
            borderTopColor: colors.line,
            borderBottomWidth: "1px",
            borderBottomStyle: "solid",
            borderBottomColor: colors.line,
            borderLeftWidth: "3px",
            borderLeftStyle: "solid",
            borderLeftColor: entry.value !== undefined ? colors.accent : colors.line2,
            // Columns sit flush, so the gutter has to be drawn: a border in the
            // section's own colour reads as space between the cards.
            borderRightWidth: i === chunk.length - 1 ? "0px" : "12px",
            borderRightStyle: "solid",
            borderRightColor: ctx.surface,
          }}
        >
          {/* A measured signal leads with its value; a qualitative one is the
              label itself, set as the heading so the grid stays even. */}
          {entry.value !== undefined ? (
            <Paragraph
              html={inlineText(entry.label.toUpperCase())}
              fontFamily={fonts.mono}
              fontSize="10px"
              color={colors.ink3}
              letterSpacing="0.11em"
              lineHeight="150%"
            />
          ) : null}
          <Heading
            headingType="h3"
            fontFamily={fonts.sans}
            fontSize={entry.value !== undefined ? "26px" : "14px"}
            fontWeight={entry.value !== undefined ? 700 : 600}
            color={colors.ink}
            lineHeight="122%"
          >
            {escapeHtml(entry.value !== undefined ? String(entry.value) : entry.label)}
          </Heading>
          {entry.delta !== undefined ? (
            <Paragraph
              html={inlineText(formatDelta(entry.delta, entry.trend))}
              fontFamily={fonts.mono}
              fontSize="11.5px"
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
