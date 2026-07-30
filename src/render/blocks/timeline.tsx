import type { ReactElement } from "react";
import { Column, ColumnLayouts, Paragraph, Row } from "@unlayer/react-elements";
import type { MemoryBlock, TimelineEntry, TimelinePayload } from "@/domain/memory/schema";
import { colors, fonts, HAIRLINE, statusColor, statusLabel } from "../tokens";
import { inlineBold, inlineText } from "../safe-inline";
import { emptyBlockRow, notesRows, sectionLabelRow, PAD, type BlockRenderContext } from "./common";

/** Timeline — date · milestone · state rows. */
export function renderTimelineRows(block: MemoryBlock, ctx: BlockRenderContext): ReactElement[] {
  const payload = block.payload as TimelinePayload;
  const entries = payload.entries;
  const notes = payload.notes ?? [];
  const rows: ReactElement[] = [sectionLabelRow(block, ctx)];

  if (entries.length === 0) {
    rows.push(emptyBlockRow(block, "No timeline entries were recognized in this source — nothing was invented."));
    rows.push(...notesRows(block, notes));
    return rows;
  }

  entries.forEach((entry, i) => {
    const last = i === entries.length - 1;
    rows.push(timelineRow(block, entry, i, last && notes.length === 0, !last));
  });
  rows.push(...notesRows(block, notes));
  return rows;
}

function timelineRow(
  block: MemoryBlock,
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
      backgroundColor={colors.surface}
      padding={isLast ? PAD.last : PAD.body}
    >
      <Column padding="10px 12px 10px 0px" border={cellBorder}>
        <Paragraph
          html={inlineText(entry.date)}
          fontFamily={fonts.mono}
          fontSize="11.5px"
          color={colors.ink3}
          lineHeight="150%"
        />
      </Column>
      <Column padding="10px 12px" border={cellBorder}>
        <Paragraph html={inlineBold(entry.title)} fontFamily={fonts.sans} fontSize="13.5px" color={colors.ink} lineHeight="150%" />
      </Column>
      <Column padding="10px 0px 10px 12px" border={cellBorder}>
        <Paragraph
          html={inlineText(statusLabel(entry.state))}
          fontFamily={fonts.sans}
          fontSize="12px"
          color={statusColor(entry.state)}
          textAlign="right"
          lineHeight="150%"
        />
      </Column>
    </Row>
  );
}
