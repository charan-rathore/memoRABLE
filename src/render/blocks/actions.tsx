import type { ReactElement } from "react";
import { Column, ColumnLayouts, Paragraph, Row } from "@unlayer/react-elements";
import type { ActionEntry, ActionsPayload, MemoryBlock } from "@/domain/memory/schema";
import { colors, fonts, HAIRLINE, statusLabel } from "../tokens";
import { inlineBold, inlineJoin, inlineText } from "../safe-inline";
import { emptyBlockRow, notesRows, sectionLabelRow, PAD, type BlockRenderContext } from "./common";

/** Actions — task · owner · due · status rows. */
export function renderActionsRows(block: MemoryBlock, ctx: BlockRenderContext): ReactElement[] {
  const payload = block.payload as ActionsPayload;
  const entries = payload.entries;
  const notes = payload.notes ?? [];
  const rows: ReactElement[] = [sectionLabelRow(block, ctx)];

  if (entries.length === 0) {
    rows.push(emptyBlockRow(block, "No action items were recognized in this source — nothing was invented."));
    rows.push(...notesRows(block, notes));
    return rows;
  }

  entries.forEach((entry, i) => {
    const last = i === entries.length - 1;
    rows.push(actionRow(block, entry, i, last && notes.length === 0, !last));
  });
  rows.push(...notesRows(block, notes));
  return rows;
}

function actionRow(
  block: MemoryBlock,
  entry: ActionEntry,
  index: number,
  isLast: boolean,
  hairline: boolean,
): ReactElement {
  const cellBorder = hairline ? HAIRLINE : undefined;
  return (
    <Row
      key={`${block.id}-action-${index}`}
      layout={ColumnLayouts.TwoEqual}
      backgroundColor={colors.surface}
      padding={isLast ? PAD.last : PAD.body}
    >
      <Column padding="10px 12px 10px 0px" border={cellBorder}>
        <Paragraph html={inlineBold(entry.task)} fontFamily={fonts.sans} fontSize="13.5px" color={colors.ink} lineHeight="150%" />
      </Column>
      <Column padding="10px 0px 10px 12px" border={cellBorder}>
        <Paragraph
          html={inlineJoin([inlineText(`${entry.owner} · ${entry.due}`), statusFragment(entry.status)])}
          fontFamily={fonts.sans}
          fontSize="12px"
          color={colors.ink3}
          textAlign="right"
          lineHeight="150%"
        />
      </Column>
    </Row>
  );
}

function statusFragment(status: ActionEntry["status"]): string {
  // Plain text; app-generated label around escaped content only.
  return statusLabel(status);
}
