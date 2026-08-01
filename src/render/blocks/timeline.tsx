import type { ReactElement } from "react";
import { Column, ColumnLayouts, Paragraph, Row } from "@unlayer/react-elements";
import type { MemoryBlock, TimelineEntry, TimelinePayload } from "@/domain/memory/schema";
import { hairline, statusLabel, themedStatusColor } from "../tokens";
import { inlineBold, inlineText } from "../safe-inline";
import {
  emptyBlockRow,
  notesRows,
  sectionLabelRow,
  asideParagraph,
  padFor,
  scaledPx,
  type BlockRenderContext,
} from "./common";

/** Timeline: date, milestone, state, plus what it produces and what it needs. */
export function renderTimelineRows(block: MemoryBlock, ctx: BlockRenderContext): ReactElement[] {
  const payload = block.payload as TimelinePayload;
  const entries = payload.entries;
  const notes = payload.notes ?? [];
  const rows: ReactElement[] = [...sectionLabelRow(block, ctx)];

  if (entries.length === 0) {
    rows.push(
      emptyBlockRow(block, "No timeline entries were recognized in this source. Nothing was invented.", ctx.surface, ctx.theme),
    );
    rows.push(...notesRows(block, notes, ctx.surface, ctx.theme));
    return rows;
  }

  entries.forEach((entry, i) => {
    const last = i === entries.length - 1;
    rows.push(timelineRow(block, ctx, entry, i, last && notes.length === 0, !last));
  });
  rows.push(...notesRows(block, notes, ctx.surface, ctx.theme));
  return rows;
}

function timelineRow(
  block: MemoryBlock,
  ctx: BlockRenderContext,
  entry: TimelineEntry,
  index: number,
  isLast: boolean,
  showHairline: boolean,
): ReactElement {
  const c = ctx.theme.colors;
  const f = ctx.theme.fonts;
  const pad = padFor(ctx.theme);
  const scale = ctx.theme.fontScale;
  const cellBorder = showHairline ? hairline(c.line) : undefined;
  const chain = [
    entry.requires ? `Needs: ${entry.requires}` : null,
    entry.produces ? `Leaves: ${entry.produces}` : null,
  ].filter(Boolean) as string[];
  return (
    <Row
      key={`${block.id}-timeline-${index}`}
      layout={ColumnLayouts.ThreeNarrowWideNarrow}
      backgroundColor={ctx.surface}
      padding={isLast ? pad.last : pad.body}
    >
      <Column padding="12px 12px 12px 0px" border={cellBorder}>
        <Paragraph
          html={inlineText(entry.date.toUpperCase())}
          fontFamily={f.mono}
          fontSize={scaledPx(11, scale)}
          color={c.ink3}
          letterSpacing="0.08em"
          lineHeight="150%"
        />
      </Column>
      <Column padding="12px 12px" border={cellBorder}>
        <Paragraph
          html={inlineBold(entry.title)}
          fontFamily={f.sans}
          fontSize={scaledPx(13.5, scale)}
          color={c.ink}
          lineHeight="150%"
        />
        {chain.map((line, i) => asideParagraph(line, `${block.id}-chain-${index}-${i}`, ctx.theme))}
      </Column>
      <Column padding="12px 0px 12px 12px" border={cellBorder}>
        <Paragraph
          html={inlineText(statusLabel(entry.state).toUpperCase())}
          fontFamily={f.mono}
          fontSize={scaledPx(10.5, scale)}
          color={themedStatusColor(entry.state, c.accent)}
          letterSpacing="0.1em"
          textAlign="right"
          lineHeight="150%"
        />
      </Column>
    </Row>
  );
}
