import type { ReactElement } from "react";
import { Column, ColumnLayouts, Paragraph, Row } from "@unlayer/react-elements";
import type { DecisionEntry, MemoryBlock, DecisionsPayload } from "@/domain/memory/schema";
import { colors, fonts, HAIRLINE, statusColor, statusLabel } from "../tokens";
import { inlineBold, inlineText } from "../safe-inline";
import { emptyBlockRow, notesRows, sectionLabelRow, PAD, type BlockRenderContext } from "./common";

/** Decisions — ref · text · status rows with hairline separators. */
export function renderDecisionsRows(block: MemoryBlock, ctx: BlockRenderContext): ReactElement[] {
  const payload = block.payload as DecisionsPayload;
  const entries = payload.entries;
  const notes = payload.notes ?? [];
  const rows: ReactElement[] = [sectionLabelRow(block, ctx)];

  if (entries.length === 0) {
    rows.push(emptyBlockRow(block, "No decisions were recognized in this source — nothing was invented."));
    rows.push(...notesRows(block, notes));
    return rows;
  }

  entries.forEach((entry, i) => {
    const last = i === entries.length - 1;
    rows.push(decisionRow(block, entry, i, last && notes.length === 0, !last));
  });
  rows.push(...notesRows(block, notes));
  return rows;
}

function decisionRow(
  block: MemoryBlock,
  entry: DecisionEntry,
  index: number,
  isLast: boolean,
  hairline: boolean,
): ReactElement {
  const cellBorder = hairline ? HAIRLINE : undefined;
  return (
    <Row
      key={`${block.id}-decision-${index}`}
      layout={ColumnLayouts.ThreeNarrowWideNarrow}
      backgroundColor={colors.surface}
      padding={isLast ? PAD.last : PAD.body}
    >
      <Column padding="11px 12px 11px 0px" border={cellBorder}>
        <Paragraph
          html={inlineText(entry.ref ?? "—")}
          fontFamily={fonts.mono}
          fontSize="11.5px"
          color={colors.ink3}
          lineHeight="150%"
        />
      </Column>
      <Column padding="11px 12px" border={cellBorder}>
        <Paragraph html={inlineBold(entry.text)} fontFamily={fonts.sans} fontSize="13.5px" color={colors.ink} lineHeight="150%" />
      </Column>
      <Column padding="11px 0px 11px 12px" border={cellBorder}>
        <Paragraph
          html={inlineText(statusLabel(entry.status))}
          fontFamily={fonts.sans}
          fontSize="12px"
          color={statusColor(entry.status)}
          textAlign="right"
          lineHeight="150%"
        />
      </Column>
    </Row>
  );
}
