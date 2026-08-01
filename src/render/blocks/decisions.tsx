import type { ReactElement } from "react";
import { Column, ColumnLayouts, Paragraph, Row } from "@unlayer/react-elements";
import type { DecisionEntry, MemoryBlock, DecisionsPayload } from "@/domain/memory/schema";
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

/** Decisions: ref, text, status, with commitment and reason when known. */
export function renderDecisionsRows(block: MemoryBlock, ctx: BlockRenderContext): ReactElement[] {
  const payload = block.payload as DecisionsPayload;
  const entries = payload.entries;
  const notes = payload.notes ?? [];
  const rows: ReactElement[] = [...sectionLabelRow(block, ctx)];

  if (entries.length === 0) {
    rows.push(
      emptyBlockRow(block, "No decisions were recognized in this source. Nothing was invented.", ctx.surface, ctx.theme),
    );
    rows.push(...notesRows(block, notes, ctx.surface, ctx.theme));
    return rows;
  }

  entries.forEach((entry, i) => {
    const last = i === entries.length - 1;
    rows.push(decisionRow(block, ctx, entry, i, last && notes.length === 0, !last));
  });
  rows.push(...notesRows(block, notes, ctx.surface, ctx.theme));
  return rows;
}

function decisionRow(
  block: MemoryBlock,
  ctx: BlockRenderContext,
  entry: DecisionEntry,
  index: number,
  isLast: boolean,
  showHairline: boolean,
): ReactElement {
  const c = ctx.theme.colors;
  const f = ctx.theme.fonts;
  const pad = padFor(ctx.theme);
  const scale = ctx.theme.fontScale;
  const cellBorder = showHairline ? hairline(c.line) : undefined;
  const statusBits = [
    statusLabel(entry.status),
    entry.commitment === "committed" ? "committed" : entry.commitment === "considered" ? "considered" : null,
  ].filter(Boolean);
  return (
    <Row
      key={`${block.id}-decision-${index}`}
      layout={ColumnLayouts.ThreeNarrowWideNarrow}
      backgroundColor={ctx.surface}
      padding={isLast ? pad.last : pad.body}
    >
      <Column padding="13px 12px 13px 0px" border={cellBorder}>
        <Paragraph
          html={inlineText(entry.ref ?? "·")}
          fontFamily={f.mono}
          fontSize={scaledPx(11.5, scale)}
          color={entry.ref ? c.accent : c.ink3}
          lineHeight="150%"
        />
      </Column>
      <Column padding="13px 12px" border={cellBorder}>
        <Paragraph
          html={inlineBold(entry.text)}
          fontFamily={f.sans}
          fontSize={scaledPx(13.5, scale)}
          color={c.ink}
          lineHeight="152%"
        />
        {entry.because
          ? asideParagraph(`Because: ${entry.because}`, `${block.id}-because-${index}`, ctx.theme)
          : null}
      </Column>
      <Column padding="13px 0px 13px 12px" border={cellBorder}>
        <Paragraph
          html={inlineText(statusBits.join(" · ").toUpperCase())}
          fontFamily={f.mono}
          fontSize={scaledPx(10.5, scale)}
          color={themedStatusColor(entry.status, c.accent)}
          letterSpacing="0.1em"
          textAlign="right"
          lineHeight="150%"
        />
      </Column>
    </Row>
  );
}
