import type { ReactElement } from "react";
import { Column, ColumnLayouts, Paragraph, Row } from "@unlayer/react-elements";
import type { ActionEntry, ActionsPayload, MemoryBlock } from "@/domain/memory/schema";
import { colors, fonts, HAIRLINE, statusColor, statusLabel } from "../tokens";
import { inlineBold, inlineText } from "../safe-inline";
import { emptyBlockRow, notesRows, sectionLabelRow, PAD, type BlockRenderContext } from "./common";

/** Actions — task on the left, whoever owns it and its state on the right. */
export function renderActionsRows(block: MemoryBlock, ctx: BlockRenderContext): ReactElement[] {
  const payload = block.payload as ActionsPayload;
  const entries = payload.entries;
  const notes = payload.notes ?? [];
  const rows: ReactElement[] = [...sectionLabelRow(block, ctx)];

  if (entries.length === 0) {
    rows.push(emptyBlockRow(block, "No action items were recognized in this source — nothing was invented.", ctx.surface));
    rows.push(...notesRows(block, notes, ctx.surface));
    return rows;
  }

  entries.forEach((entry, i) => {
    const last = i === entries.length - 1;
    rows.push(actionRow(block, ctx, entry, i, last && notes.length === 0, !last));
  });
  rows.push(...notesRows(block, notes, ctx.surface));
  return rows;
}

function actionRow(
  block: MemoryBlock,
  ctx: BlockRenderContext,
  entry: ActionEntry,
  index: number,
  isLast: boolean,
  hairline: boolean,
): ReactElement {
  const cellBorder = hairline ? HAIRLINE : undefined;
  const who = assignment(entry);
  return (
    <Row
      key={`${block.id}-action-${index}`}
      layout={ColumnLayouts.TwoWideNarrow}
      backgroundColor={ctx.surface}
      padding={isLast ? PAD.last : PAD.body}
    >
      <Column padding="12px 12px 12px 0px" border={cellBorder}>
        <Paragraph html={inlineBold(entry.task)} fontFamily={fonts.sans} fontSize="13.5px" color={colors.ink} lineHeight="152%" />
        {who ? (
          <Paragraph html={inlineText(who)} fontFamily={fonts.mono} fontSize="11px" color={colors.ink3} lineHeight="150%" />
        ) : null}
      </Column>
      <Column padding="12px 0px 12px 12px" border={cellBorder}>
        <Paragraph
          html={inlineText(statusLabel(entry.status).toUpperCase())}
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

/** Owner and due date joined only when the source actually stated them. */
function assignment(entry: ActionEntry): string {
  return [entry.owner, entry.due].filter(Boolean).join(" · ");
}
