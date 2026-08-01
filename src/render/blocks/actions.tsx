import type { ReactElement } from "react";
import { Column, ColumnLayouts, Paragraph, Row } from "@unlayer/react-elements";
import type { ActionEntry, ActionsPayload, MemoryBlock } from "@/domain/memory/schema";
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

/** Actions: task on the left, owner/state on the right, linked back to a decision. */
export function renderActionsRows(block: MemoryBlock, ctx: BlockRenderContext): ReactElement[] {
  const payload = block.payload as ActionsPayload;
  const entries = payload.entries;
  const notes = payload.notes ?? [];
  const rows: ReactElement[] = [...sectionLabelRow(block, ctx)];

  if (entries.length === 0) {
    rows.push(
      emptyBlockRow(block, "No action items were recognized in this source. Nothing was invented.", ctx.surface, ctx.theme),
    );
    rows.push(...notesRows(block, notes, ctx.surface, ctx.theme));
    return rows;
  }

  entries.forEach((entry, i) => {
    const last = i === entries.length - 1;
    rows.push(actionRow(block, ctx, entry, i, last && notes.length === 0, !last));
  });
  rows.push(...notesRows(block, notes, ctx.surface, ctx.theme));
  return rows;
}

function actionRow(
  block: MemoryBlock,
  ctx: BlockRenderContext,
  entry: ActionEntry,
  index: number,
  isLast: boolean,
  showHairline: boolean,
): ReactElement {
  const c = ctx.theme.colors;
  const f = ctx.theme.fonts;
  const pad = padFor(ctx.theme);
  const scale = ctx.theme.fontScale;
  const cellBorder = showHairline ? hairline(c.line) : undefined;
  const who = assignment(entry);
  return (
    <Row
      key={`${block.id}-action-${index}`}
      layout={ColumnLayouts.TwoWideNarrow}
      backgroundColor={ctx.surface}
      padding={isLast ? pad.last : pad.body}
    >
      <Column padding="12px 12px 12px 0px" border={cellBorder}>
        <Paragraph
          html={inlineBold(entry.task)}
          fontFamily={f.sans}
          fontSize={scaledPx(13.5, scale)}
          color={c.ink}
          lineHeight="152%"
        />
        {who ? (
          <Paragraph
            html={inlineText(who)}
            fontFamily={f.mono}
            fontSize={scaledPx(11, scale)}
            color={c.ink3}
            lineHeight="150%"
          />
        ) : null}
        {entry.from ? asideParagraph(`Carries out ${entry.from}`, `${block.id}-from-${index}`, ctx.theme) : null}
      </Column>
      <Column padding="12px 0px 12px 12px" border={cellBorder}>
        {actionStanceLabel(entry) ? (
          <Paragraph
            html={inlineText(actionStanceLabel(entry)!)}
            fontFamily={f.mono}
            fontSize={scaledPx(10.5, scale)}
            color={themedStatusColor(entry.status, c.accent)}
            letterSpacing="0.1em"
            textAlign="right"
            lineHeight="150%"
          />
        ) : null}
      </Column>
    </Row>
  );
}

/** Owner and due date joined only when the source actually stated them. */
function assignment(entry: ActionEntry): string {
  return [entry.owner, entry.due].filter(Boolean).join(" · ");
}

/**
 * Personas and user stories are extracted facts from the source — not suggested work.
 * Hide the readiness chip for those; show SOURCE when we want a factual tag.
 */
function actionStanceLabel(entry: ActionEntry): string | null {
  if (/^(persona|user story)\s*:/i.test(entry.task)) return "SOURCE";
  return statusLabel(entry.status).toUpperCase();
}
