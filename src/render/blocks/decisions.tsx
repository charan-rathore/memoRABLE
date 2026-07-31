import type { ReactElement } from "react";
import { Column, ColumnLayouts, Paragraph, Row } from "@unlayer/react-elements";
import type { DecisionEntry, MemoryBlock, DecisionsPayload } from "@/domain/memory/schema";
import { colors, fonts, HAIRLINE, statusColor, statusLabel } from "../tokens";
import { inlineBold, inlineText } from "../safe-inline";
import { emptyBlockRow, notesRows, sectionLabelRow, asideParagraph, PAD, type BlockRenderContext } from "./common";

/** Decisions: ref, text, status, with commitment and reason when known. */
export function renderDecisionsRows(block: MemoryBlock, ctx: BlockRenderContext): ReactElement[] {
  const payload = block.payload as DecisionsPayload;
  const entries = payload.entries;
  const notes = payload.notes ?? [];
  const rows: ReactElement[] = [...sectionLabelRow(block, ctx)];

  if (entries.length === 0) {
    rows.push(emptyBlockRow(block, "No decisions were recognized in this source. Nothing was invented.", ctx.surface));
    rows.push(...notesRows(block, notes, ctx.surface));
    return rows;
  }

  entries.forEach((entry, i) => {
    const last = i === entries.length - 1;
    rows.push(decisionRow(block, ctx, entry, i, last && notes.length === 0, !last));
  });
  rows.push(...notesRows(block, notes, ctx.surface));
  return rows;
}

function decisionRow(
  block: MemoryBlock,
  ctx: BlockRenderContext,
  entry: DecisionEntry,
  index: number,
  isLast: boolean,
  hairline: boolean,
): ReactElement {
  const cellBorder = hairline ? HAIRLINE : undefined;
  const statusBits = [
    statusLabel(entry.status),
    entry.commitment === "committed" ? "committed" : entry.commitment === "considered" ? "considered" : null,
  ].filter(Boolean);
  return (
    <Row
      key={`${block.id}-decision-${index}`}
      layout={ColumnLayouts.ThreeNarrowWideNarrow}
      backgroundColor={ctx.surface}
      padding={isLast ? PAD.last : PAD.body}
    >
      <Column padding="13px 12px 13px 0px" border={cellBorder}>
        <Paragraph
          html={inlineText(entry.ref ?? "·")}
          fontFamily={fonts.mono}
          fontSize="11.5px"
          color={entry.ref ? colors.accent : colors.ink3}
          lineHeight="150%"
        />
      </Column>
      <Column padding="13px 12px" border={cellBorder}>
        <Paragraph html={inlineBold(entry.text)} fontFamily={fonts.sans} fontSize="13.5px" color={colors.ink} lineHeight="152%" />
        {entry.because
          ? asideParagraph(`Because: ${entry.because}`, `${block.id}-because-${index}`)
          : null}
      </Column>
      <Column padding="13px 0px 13px 12px" border={cellBorder}>
        <Paragraph
          html={inlineText(statusBits.join(" · ").toUpperCase())}
          fontFamily={fonts.mono}
          fontSize="10.5px"
          color={statusColor(entry.status)}
          letterSpacing="0.1em"
          textAlign="right"
          lineHeight="150%"
        />
      </Column>
    </Row>
  );
}
