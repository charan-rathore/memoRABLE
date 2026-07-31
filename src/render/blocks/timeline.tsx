import type { ReactElement } from "react";
import { Column, ColumnLayouts, Paragraph, Row } from "@unlayer/react-elements";
import type { MemoryBlock, TimelineEntry, TimelinePayload } from "@/domain/memory/schema";
import { colors, fonts, HAIRLINE, statusColor, statusLabel } from "../tokens";
import { inlineBold, inlineText } from "../safe-inline";
import { emptyBlockRow, notesRows, sectionLabelRow, PAD, type BlockRenderContext } from "./common";

/** Timeline — date · milestone · state, ruled like a schedule. */
export function renderTimelineRows(block: MemoryBlock, ctx: BlockRenderContext): ReactElement[] {
  const payload = block.payload as TimelinePayload;
  const entries = payload.entries;
  const notes = payload.notes ?? [];
  const rows: ReactElement[] = [...sectionLabelRow(block, ctx)];

  if (entries.length === 0) {
    rows.push(emptyBlockRow(block, "No timeline entries were recognized in this source — nothing was invented.", ctx.surface));
    rows.push(...notesRows(block, notes, ctx.surface));
    return rows;
  }

  entries.forEach((entry, i) => {
    const last = i === entries.length - 1;
    rows.push(timelineRow(block, ctx, entry, i, last && notes.length === 0, !last));
  });
  rows.push(...notesRows(block, notes, ctx.surface));
  return rows;
}

function timelineRow(
  block: MemoryBlock,
  ctx: BlockRenderContext,
  entry: TimelineEntry,
  index: number,
  isLast: boolean,
  hairline: boolean,
): ReactElement {
  const cellBorder = hairline ? HAIRLINE : undefined;
  return (
    <Row
      key={`${block.id}-timeline-${index}`}
      layout={ColumnLayouts.ThreeNarrowWideNarrow}
      backgroundColor={ctx.surface}
      padding={isLast ? PAD.last : PAD.body}
    >
      <Column padding="12px 12px 12px 0px" border={cellBorder}>
        <Paragraph
          html={inlineText(entry.date.toUpperCase())}
          fontFamily={fonts.mono}
          fontSize="11px"
          color={colors.ink3}
          letterSpacing="0.08em"
          lineHeight="150%"
        />
      </Column>
      <Column padding="12px 12px" border={cellBorder}>
        <Paragraph html={inlineBold(entry.title)} fontFamily={fonts.sans} fontSize="13.5px" color={colors.ink} lineHeight="150%" />
      </Column>
      <Column padding="12px 0px 12px 12px" border={cellBorder}>
        <Paragraph
          html={inlineText(statusLabel(entry.state).toUpperCase())}
          fontFamily={fonts.mono}
          fontSize="10.5px"
          color={statusColor(entry.state)}
          letterSpacing="0.1em"
          textAlign="right"
          lineHeight="150%"
        />
      </Column>
    </Row>
  );
}
