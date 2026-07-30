import type { ReactElement } from "react";
import { Column, ColumnLayouts, Heading, Paragraph, Row } from "@unlayer/react-elements";
import type { MemoryBlock, SnapshotPayload } from "@/domain/memory/schema";
import { colors, fonts } from "../tokens";
import { escapeHtml, inlineText } from "../safe-inline";
import { notesRows, type BlockRenderContext } from "./common";

/** Snapshot — the document's opening: eyebrow, display heading, summary, byline. */
export function renderSnapshotRows(block: MemoryBlock, ctx: BlockRenderContext): ReactElement[] {
  const payload = block.payload as SnapshotPayload;
  const notes = payload.notes ?? [];

  return [
    <Row
      key={`${block.id}-main`}
      layout={ColumnLayouts.OneColumn}
      backgroundColor={colors.surface}
      padding="30px 44px 20px 44px"
    >
      <Column>
        <Heading
          headingType="h4"
          fontFamily={fonts.mono}
          fontSize="11px"
          fontWeight={700}
          color={colors.ink3}
          letterSpacing="0.14em"
          lineHeight="150%"
        >
          {escapeHtml(ctx.documentTitle.toUpperCase())}
        </Heading>
        <Heading
          headingType="h1"
          fontFamily={fonts.serif}
          fontSize={ctx.mode === "email" ? "26px" : "30px"}
          fontWeight={700}
          color={colors.ink}
          lineHeight="118%"
        >
          {escapeHtml(payload.heading)}
        </Heading>
        <Paragraph
          html={inlineText(payload.summary)}
          fontFamily={fonts.sans}
          fontSize={ctx.mode === "email" ? "14px" : "15px"}
          color={colors.ink2}
          lineHeight="160%"
        />
        {payload.byline ? (
          <Paragraph
            html={inlineText(payload.byline)}
            fontFamily={fonts.sans}
            fontSize="12px"
            color={colors.ink3}
            lineHeight="150%"
          />
        ) : null}
      </Column>
    </Row>,
    ...notesRows(block, notes),
  ];
}
