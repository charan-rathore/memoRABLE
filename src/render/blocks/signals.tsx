import type { ReactElement } from "react";
import { Column, ColumnLayouts, Heading, Paragraph, Row } from "@unlayer/react-elements";
import type { MemoryBlock, SignalEntry, SignalsPayload } from "@/domain/memory/schema";
import { colors, fonts, trendColor } from "../tokens";
import { escapeHtml, inlineText } from "../safe-inline";
import { emptyBlockRow, notesRows, sectionLabelRow, PAD, type BlockRenderContext } from "./common";

/** Signals — key metrics in a KPI grid (values are Headings, never Paragraphs). */
export function renderSignalsRows(block: MemoryBlock, ctx: BlockRenderContext): ReactElement[] {
  const payload = block.payload as SignalsPayload;
  const entries = payload.entries;
  const rows: ReactElement[] = [sectionLabelRow(block, ctx)];

  if (entries.length === 0) {
    rows.push(emptyBlockRow(block, "No signals were recognized in this source — nothing was invented."));
    rows.push(...notesRows(block, payload.notes ?? []));
    return rows;
  }

  for (let i = 0; i < entries.length; i += 4) {
    const chunk = entries.slice(i, i + 4);
    const isLast = i + 4 >= entries.length;
    rows.push(kpiRow(block, chunk, i, isLast && (payload.notes ?? []).length === 0));
  }
  rows.push(...notesRows(block, payload.notes ?? []));
  return rows;
}

function kpiRow(block: MemoryBlock, chunk: SignalEntry[], offset: number, isLast: boolean): ReactElement {
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
      backgroundColor={colors.surface}
      padding={isLast ? PAD.last : PAD.body}
    >
      {chunk.map((entry, i) => (
        <Column key={`${block.id}-kpi-${offset}-${i}`} padding="10px 16px 10px 0px">
          {/* A measured signal leads with its value; a qualitative one is the
              label itself, set as the heading so the grid stays even. */}
          {entry.value !== undefined ? (
            <Paragraph
              html={inlineText(entry.label.toUpperCase())}
              fontFamily={fonts.mono}
              fontSize="10px"
              color={colors.ink3}
              letterSpacing="0.1em"
              lineHeight="150%"
            />
          ) : null}
          <Heading
            headingType="h3"
            fontFamily={fonts.sans}
            fontSize={entry.value !== undefined ? "22px" : "14px"}
            fontWeight={entry.value !== undefined ? 700 : 600}
            color={colors.ink}
            lineHeight="125%"
          >
            {escapeHtml(entry.value !== undefined ? String(entry.value) : entry.label)}
          </Heading>
          {entry.delta !== undefined ? (
            <Paragraph
              html={inlineText(formatDelta(entry.delta, entry.trend))}
              fontFamily={fonts.sans}
              fontSize="11px"
              color={trendColor(entry.trend)}
              lineHeight="140%"
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
