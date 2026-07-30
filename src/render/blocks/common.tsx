import type { ReactElement } from "react";
import { Column, ColumnLayouts, Divider, Heading, Paragraph, Row } from "@unlayer/react-elements";
import type { MemoryBlock } from "@/domain/memory/schema";
import type { OutputMode } from "@/domain/memory/types";
import { colors, fonts } from "../tokens";
import { escapeHtml, inlineText } from "../safe-inline";

/** Context threaded to every block renderer. */
export interface BlockRenderContext {
  mode: OutputMode;
  /** 0-based position of the block in the current arrangement. */
  position: number;
  documentTitle: string;
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

export function roman(position: number): string {
  return ROMAN[position] ?? String(position + 1);
}

export const PAD = {
  label: "26px 44px 6px 44px",
  body: "0px 44px 0px 44px",
  last: "0px 44px 26px 44px",
} as const;

/**
 * Section label row. Document mode uses a serif roman-numeral heading
 * ("II. Signals"); Web and Email use a small letter-spaced eyebrow.
 */
export function sectionLabelRow(block: MemoryBlock, ctx: BlockRenderContext, suffix?: string): ReactElement {
  const title = suffix ? `${block.title} ${suffix}` : block.title;
  return (
    <Row key={`${block.id}-label`} layout={ColumnLayouts.OneColumn} backgroundColor={colors.surface} padding={PAD.label}>
      <Column>
        {ctx.mode === "document" ? (
          <Heading
            headingType="h2"
            fontFamily={fonts.serif}
            fontSize="19px"
            fontWeight={700}
            color={colors.ink}
            lineHeight="130%"
          >
            {escapeHtml(`${roman(ctx.position)}. ${title}`)}
          </Heading>
        ) : (
          <Heading
            headingType="h2"
            fontFamily={fonts.mono}
            fontSize="11px"
            fontWeight={700}
            color={colors.ink2}
            letterSpacing="0.14em"
            lineHeight="150%"
          >
            {escapeHtml(title.toUpperCase())}
          </Heading>
        )}
      </Column>
    </Row>
  );
}

/** Honest empty state for a block whose section was absent/unclear. */
export function emptyBlockRow(block: MemoryBlock, message: string): ReactElement {
  return (
    <Row key={`${block.id}-empty`} layout={ColumnLayouts.OneColumn} backgroundColor={colors.surface} padding={PAD.last}>
      <Column>
        <Paragraph html={inlineText(message)} fontFamily={fonts.sans} fontSize="13px" color={colors.ink3} lineHeight="150%" />
      </Column>
    </Row>
  );
}

/**
 * "Kept as text" — unclear source lines preserved verbatim (escaped) so the
 * local parser is visibly lossless. Appends after recognized entries.
 */
export function notesRows(block: MemoryBlock, notes: readonly string[]): ReactElement[] {
  if (notes.length === 0) return [];
  return [
    <Row key={`${block.id}-notes-label`} layout={ColumnLayouts.OneColumn} backgroundColor={colors.surface} padding="14px 44px 0px 44px">
      <Column border={{ borderTopWidth: "1px", borderTopStyle: "solid", borderTopColor: colors.line }} padding="12px 0px 0px 0px">
        <Heading headingType="h4" fontFamily={fonts.mono} fontSize="10px" fontWeight={700} color={colors.ink3} letterSpacing="0.12em">
          KEPT AS TEXT
        </Heading>
      </Column>
    </Row>,
    <Row key={`${block.id}-notes`} layout={ColumnLayouts.OneColumn} backgroundColor={colors.surface} padding={PAD.last}>
      <Column>
        {notes.map((note, i) => (
          <Paragraph
            key={`${block.id}-note-${i}`}
            html={inlineText(note)}
            fontFamily={fonts.sans}
            fontSize="12.5px"
            color={colors.ink3}
            lineHeight="150%"
          />
        ))}
      </Column>
    </Row>,
  ];
}

/** Thin rule used between blocks inside a mode root. */
export function blockSpacerRow(key: string, backgroundColor: string): ReactElement {
  return (
    <Row key={key} layout={ColumnLayouts.OneColumn} backgroundColor={backgroundColor} padding="0px 44px">
      <Column padding="0px">
        <Divider borderTopWidth="1px" borderTopStyle="solid" borderTopColor={colors.line} />
      </Column>
    </Row>
  );
}
