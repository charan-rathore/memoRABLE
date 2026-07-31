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
  /**
   * Background for this block's rows. Web alternates plain and tinted bands so
   * a long page reads as sections rather than one unbroken column; print and
   * email stay on one surface, where banding costs ink and clients choke on it.
   */
  surface: string;
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

export function roman(position: number): string {
  return ROMAN[position] ?? String(position + 1);
}

export function ordinal(position: number): string {
  return String(position + 1).padStart(2, "0");
}

export const PAD = {
  label: "30px 44px 4px 44px",
  rule: "0px 44px 10px 44px",
  body: "0px 44px 0px 44px",
  last: "0px 44px 30px 44px",
} as const;

/**
 * Section opening. Print gets a serif roman-numeral heading ("II. Signals")
 * under a full rule; screen and email get a numbered eyebrow over a short
 * accent tick — the same content, set the way each surface reads best.
 */
export function sectionLabelRow(block: MemoryBlock, ctx: BlockRenderContext, suffix?: string): ReactElement[] {
  const title = suffix ? `${block.title} ${suffix}` : block.title;
  if (ctx.mode === "document") {
    return [
      <Row key={`${block.id}-label`} layout={ColumnLayouts.OneColumn} backgroundColor={ctx.surface} padding={PAD.label}>
        <Column>
          <Heading
            headingType="h2"
            fontFamily={fonts.serif}
            fontSize="20px"
            fontWeight={700}
            color={colors.ink}
            lineHeight="130%"
          >
            {escapeHtml(`${roman(ctx.position)}. ${title}`)}
          </Heading>
        </Column>
      </Row>,
      <Row key={`${block.id}-label-rule`} layout={ColumnLayouts.OneColumn} backgroundColor={ctx.surface} padding={PAD.rule}>
        <Column padding="0px">
          <Divider borderTopWidth="1px" borderTopStyle="solid" borderTopColor={colors.line2} />
        </Column>
      </Row>,
    ];
  }
  return [
    <Row key={`${block.id}-label`} layout={ColumnLayouts.OneColumn} backgroundColor={ctx.surface} padding={PAD.label}>
      <Column>
        <Heading
          headingType="h2"
          fontFamily={fonts.mono}
          fontSize="11px"
          fontWeight={700}
          color={colors.ink2}
          letterSpacing="0.14em"
          lineHeight="150%"
        >
          {escapeHtml(`${ordinal(ctx.position)} · ${title.toUpperCase()}`)}
        </Heading>
      </Column>
    </Row>,
    <Row key={`${block.id}-label-tick`} layout={ColumnLayouts.OneColumn} backgroundColor={ctx.surface} padding={PAD.rule}>
      <Column padding="0px">
        <Divider borderTopWidth="2px" borderTopStyle="solid" borderTopColor={colors.accent} width="34px" textAlign="left" />
      </Column>
    </Row>,
  ];
}

/**
 * A quiet aside under a memory: the reasoning that turns a fact into a
 * remembered thought. Kept short and soft so it reads like a friend leaning
 * in, not like another column of data.
 */
export function asideParagraph(text: string, key: string): ReactElement {
  return (
    <Paragraph
      key={key}
      html={inlineText(text)}
      fontFamily={fonts.sans}
      fontSize="12.5px"
      color={colors.ink3}
      lineHeight="155%"
    />
  );
}

/** Honest empty state for a block whose section was absent/unclear. */
export function emptyBlockRow(block: MemoryBlock, message: string, surface: string = colors.surface): ReactElement {
  return (
    <Row key={`${block.id}-empty`} layout={ColumnLayouts.OneColumn} backgroundColor={surface} padding={PAD.last}>
      <Column
        padding="12px 14px"
        backgroundColor={colors.surface2}
        borderRadius="10px"
        border={{ borderTopWidth: "1px", borderTopStyle: "solid", borderTopColor: colors.line }}
      >
        <Paragraph html={inlineText(message)} fontFamily={fonts.sans} fontSize="13px" color={colors.ink3} lineHeight="150%" />
      </Column>
    </Row>
  );
}

/**
 * "Kept as text" — unclear source lines preserved verbatim (escaped) so the
 * local parser is visibly lossless. Appends after recognized entries.
 */
export function notesRows(
  block: MemoryBlock,
  notes: readonly string[],
  surface: string = colors.surface,
): ReactElement[] {
  if (notes.length === 0) return [];
  return [
    <Row key={`${block.id}-notes-label`} layout={ColumnLayouts.OneColumn} backgroundColor={surface} padding="16px 44px 0px 44px">
      <Column border={{ borderTopWidth: "1px", borderTopStyle: "solid", borderTopColor: colors.line }} padding="12px 0px 0px 0px">
        <Heading headingType="h4" fontFamily={fonts.mono} fontSize="10px" fontWeight={700} color={colors.ink3} letterSpacing="0.12em">
          KEPT AS TEXT
        </Heading>
      </Column>
    </Row>,
    <Row key={`${block.id}-notes`} layout={ColumnLayouts.OneColumn} backgroundColor={surface} padding={PAD.last}>
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
