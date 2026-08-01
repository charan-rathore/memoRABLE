import type { ReactElement } from "react";
import { Column, ColumnLayouts, Divider, Heading, Paragraph, Row } from "@unlayer/react-elements";
import type { MemoryBlock } from "@/domain/memory/schema";
import type { OutputMode } from "@/domain/memory/types";
import { isNotApplicableBlock, NOT_APPLICABLE_NOTE } from "@/understanding/projection-profiles";
import type { PublishTheme } from "../themes";
import { resolveTheme } from "../themes";
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
  /** Active publish theme (default editorial = legacy look). */
  theme: PublishTheme;
}

export function defaultThemeContext(
  mode: OutputMode,
  position: number,
  documentTitle: string,
  theme = resolveTheme("editorial"),
): BlockRenderContext {
  const surface =
    mode !== "web" ? theme.colors.surface : position % 2 === 0 ? theme.colors.surface : theme.colors.paper;
  return { mode, position, documentTitle, surface, theme };
}

export function scaledPx(base: number, scale: number): string {
  return `${Math.round(base * scale)}px`;
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

export function roman(position: number): string {
  return ROMAN[position] ?? String(position + 1);
}

export function ordinal(position: number): string {
  return String(position + 1).padStart(2, "0");
}

/** Legacy constant — prefer `padFor(theme)` so spacing presets take effect. */
export const PAD = {
  label: "30px 44px 4px 44px",
  rule: "0px 44px 10px 44px",
  body: "0px 44px 0px 44px",
  last: "0px 44px 30px 44px",
} as const;

export function padFor(theme: PublishTheme) {
  const m = theme.spacing === "tight" ? 0.72 : theme.spacing === "airy" ? 1.28 : 1;
  const side = Math.round(44 * m);
  return {
    label: `${Math.round(30 * m)}px ${side}px ${Math.round(4 * m)}px ${side}px`,
    rule: `0px ${side}px ${Math.round(10 * m)}px ${side}px`,
    body: `0px ${side}px 0px ${side}px`,
    last: `0px ${side}px ${Math.round(30 * m)}px ${side}px`,
    side: `${side}px`,
  };
}

/**
 * Section opening. Print gets a serif roman-numeral heading ("II. Signals")
 * under a full rule; screen and email get a numbered eyebrow over a short
 * accent tick. the same content, set the way each surface reads best.
 */
export function sectionLabelRow(block: MemoryBlock, ctx: BlockRenderContext, suffix?: string): ReactElement[] {
  const title = suffix ? `${block.title} ${suffix}` : block.title;
  const c = ctx.theme.colors;
  const f = ctx.theme.fonts;
  const pad = padFor(ctx.theme);
  const scale = ctx.theme.fontScale;
  const callout = ctx.theme.calloutStyle;

  if (ctx.mode === "document") {
    const rows: ReactElement[] = [
      <Row key={`${block.id}-label`} layout={ColumnLayouts.OneColumn} backgroundColor={ctx.surface} padding={pad.label}>
        <Column>
          <Heading
            headingType="h2"
            fontFamily={f.serif}
            fontSize={scaledPx(20, scale)}
            fontWeight={700}
            color={c.ink}
            lineHeight="130%"
          >
            {escapeHtml(`${roman(ctx.position)}. ${title}`)}
          </Heading>
        </Column>
      </Row>,
    ];
    if (callout !== "plain") {
      rows.push(
        <Row key={`${block.id}-label-rule`} layout={ColumnLayouts.OneColumn} backgroundColor={ctx.surface} padding={pad.rule}>
          <Column padding="0px">
            <Divider
              borderTopWidth="1px"
              borderTopStyle="solid"
              borderTopColor={callout === "rule" ? c.ink : c.line2}
            />
          </Column>
        </Row>,
      );
    }
    return rows;
  }

  const rows: ReactElement[] = [
    <Row key={`${block.id}-label`} layout={ColumnLayouts.OneColumn} backgroundColor={ctx.surface} padding={pad.label}>
      <Column>
        <Heading
          headingType="h2"
          fontFamily={f.mono}
          fontSize={scaledPx(11, scale)}
          fontWeight={700}
          color={c.ink2}
          letterSpacing="0.14em"
          lineHeight="150%"
        >
          {escapeHtml(`${ordinal(ctx.position)} · ${title.toUpperCase()}`)}
        </Heading>
      </Column>
    </Row>,
  ];
  if (callout !== "plain") {
    rows.push(
      <Row key={`${block.id}-label-tick`} layout={ColumnLayouts.OneColumn} backgroundColor={ctx.surface} padding={pad.rule}>
        <Column padding="0px">
          <Divider
            borderTopWidth={callout === "rule" ? "1px" : "2px"}
            borderTopStyle="solid"
            borderTopColor={callout === "rule" ? c.ink2 : c.accent}
            width={callout === "rule" ? "100%" : "34px"}
            textAlign="left"
          />
        </Column>
      </Row>,
    );
  }
  return rows;
}

/**
 * A quiet aside under a memory: the reasoning that turns a fact into a
 * remembered thought. Kept short and soft so it reads like a friend leaning
 * in, not like another column of data.
 */
export function asideParagraph(text: string, key: string, theme: PublishTheme = resolveTheme("editorial")): ReactElement {
  return (
    <Paragraph
      key={key}
      html={inlineText(text)}
      fontFamily={theme.fonts.sans}
      fontSize={scaledPx(12.5, theme.fontScale)}
      color={theme.colors.ink3}
      lineHeight="155%"
    />
  );
}

/** Honest empty state — N/A when archetype omits meaning; otherwise absent/unclear. */
export function emptyBlockMessage(block: MemoryBlock, fallback: string): string {
  if (isNotApplicableBlock(block)) return NOT_APPLICABLE_NOTE;
  return fallback;
}

/** Honest empty state for a block whose section was absent/unclear. */
export function emptyBlockRow(
  block: MemoryBlock,
  message: string,
  surface: string = resolveTheme("editorial").colors.surface,
  theme: PublishTheme = resolveTheme("editorial"),
): ReactElement {
  const c = theme.colors;
  const pad = padFor(theme);
  const tinted = theme.calloutStyle === "tint";
  const copy = emptyBlockMessage(block, message);
  return (
    <Row key={`${block.id}-empty`} layout={ColumnLayouts.OneColumn} backgroundColor={surface} padding={pad.last}>
      <Column
        padding="12px 14px"
        backgroundColor={tinted ? c.surface2 : surface}
        borderRadius={theme.calloutStyle === "plain" ? "0px" : "10px"}
        border={
          theme.calloutStyle === "plain"
            ? undefined
            : {
                borderTopWidth: theme.calloutStyle === "rule" ? "0px" : "1px",
                borderTopStyle: "solid",
                borderTopColor: c.line,
                borderLeftWidth: theme.calloutStyle === "rule" ? "3px" : "0px",
                borderLeftStyle: "solid",
                borderLeftColor: c.accent,
              }
        }
      >
        <Paragraph
          html={inlineText(copy)}
          fontFamily={theme.fonts.sans}
          fontSize={scaledPx(13, theme.fontScale)}
          color={c.ink3}
          lineHeight="150%"
        />
      </Column>
    </Row>
  );
}

/**
 * "Kept as text". unclear source lines preserved verbatim (escaped) so the
 * local parser is visibly lossless. Appends after recognized entries.
 */
export function notesRows(
  block: MemoryBlock,
  notes: readonly string[],
  surface: string = resolveTheme("editorial").colors.surface,
  theme: PublishTheme = resolveTheme("editorial"),
): ReactElement[] {
  // N/A is rendered via emptyBlockRow — don't duplicate it under Notes.
  const visible = notes.filter((n) => n !== NOT_APPLICABLE_NOTE);
  if (visible.length === 0) return [];
  const c = theme.colors;
  const f = theme.fonts;
  const pad = padFor(theme);
  const side = pad.side;
  return [
    <Row
      key={`${block.id}-notes-label`}
      layout={ColumnLayouts.OneColumn}
      backgroundColor={surface}
      padding={`16px ${side} 0px ${side}`}
    >
      <Column
        border={
          theme.calloutStyle === "plain"
            ? undefined
            : { borderTopWidth: "1px", borderTopStyle: "solid", borderTopColor: c.line }
        }
        padding="12px 0px 0px 0px"
      >
        <Heading
          headingType="h4"
          fontFamily={f.mono}
          fontSize={scaledPx(10, theme.fontScale)}
          fontWeight={700}
          color={c.ink3}
          letterSpacing="0.12em"
        >
          PRESERVED FROM SOURCE
        </Heading>
      </Column>
    </Row>,
    <Row key={`${block.id}-notes`} layout={ColumnLayouts.OneColumn} backgroundColor={surface} padding={pad.last}>
      <Column>
        {visible.map((note, i) => (
          <Paragraph
            key={`${block.id}-note-${i}`}
            html={inlineText(note)}
            fontFamily={f.sans}
            fontSize={scaledPx(12.5, theme.fontScale)}
            color={c.ink3}
            lineHeight="150%"
          />
        ))}
      </Column>
    </Row>,
  ];
}

/** Thin rule used between blocks inside a mode root. */
export function blockSpacerRow(key: string, backgroundColor: string, theme: PublishTheme = resolveTheme("editorial")): ReactElement {
  const side = padFor(theme).side;
  if (theme.calloutStyle === "plain") {
    return (
      <Row key={key} layout={ColumnLayouts.OneColumn} backgroundColor={backgroundColor} padding={`${Math.round(12 * (theme.spacing === "tight" ? 0.7 : 1))}px ${side}`}>
        <Column padding="0px" />
      </Row>
    );
  }
  return (
    <Row key={key} layout={ColumnLayouts.OneColumn} backgroundColor={backgroundColor} padding={`0px ${side}`}>
      <Column padding="0px">
        <Divider borderTopWidth="1px" borderTopStyle="solid" borderTopColor={theme.colors.line} />
      </Column>
    </Row>
  );
}
