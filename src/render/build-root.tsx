import { cloneElement, isValidElement, type ReactElement } from "react";
import {
  Button,
  Column,
  ColumnLayouts,
  Document,
  Divider,
  Email,
  Heading,
  Menu,
  Page,
  Paragraph,
  Row,
} from "@unlayer/react-elements";
import type { MemoryBlock, MemoryDocument } from "@/domain/memory/schema";
import type { OutputMode } from "@/domain/memory/types";
import { colors, fonts } from "./tokens";
import { escapeHtml, inlineText } from "./safe-inline";
import { renderBlockRows, type RenderedBlock } from "./block-registry";
import { roman, type BlockRenderContext } from "./blocks/common";

/**
 * Root builders. Each returns the direct root element (<Email>/<Page>/
 * <Document>) with block rows composed inline — block renderer functions are
 * called directly (never passed as <Component />) so renderToJson walks a
 * recognized Root → Row → Column → Item tree.
 *
 * One set of memories, three surfaces. Beyond shared block content, each
 * surface now uses more of the Elements catalogue: Menu for jump navigation,
 * Button for a clear next step, Row.anchor for destinations that survive
 * email clients and print-to-PDF alike (empty `<a name>` anchors — the form
 * Gmail and Outlook actually honour).
 */

export interface BuiltRoot {
  mode: OutputMode;
  root: ReactElement;
  /** Per-block render metadata (recovered flags) for honest diagnostics. */
  blocks: RenderedBlock[];
}

/** Stable section target — kind is unique in a well-formed document. */
export function sectionAnchor(block: MemoryBlock): string {
  return `section-${block.kind}`;
}

export function buildRoot(doc: MemoryDocument, mode: OutputMode): BuiltRoot {
  const renderedBlocks = doc.blocks.map((block, position) => {
    const ctx: BlockRenderContext = {
      mode,
      position,
      documentTitle: doc.title,
      surface: surfaceFor(mode, position),
    };
    return renderBlockRows(block, ctx);
  });

  // Stamp each block's first row with an Elements `anchor`. That emits
  // `<a name="…">` — the empty-name form that survives Gmail, Outlook Windows
  // and Chrome's print-to-PDF. Item-level `_meta.htmlID` would not.
  const blockRows = renderedBlocks.flatMap((b) => anchoredRows(b));

  if (mode === "email") {
    return {
      mode,
      blocks: renderedBlocks,
      root: (
        <Email
          backgroundColor={colors.paper}
          contentWidth="600px"
          fontFamily={fonts.sans}
          textColor={colors.ink}
          previewText={previewTextOf(doc)}
          linkStyle={{ linkColor: colors.accent, linkUnderline: false }}
          _meta={{ htmlID: "u_content_body_1" }}
        >
          {emailHeaderRows(doc)}
          {blockRows}
          {emailFooterRows(doc)}
        </Email>
      ),
    };
  }

  if (mode === "document") {
    return {
      mode,
      blocks: renderedBlocks,
      root: (
        <Document
          backgroundColor={colors.paper}
          contentWidth="760px"
          fontFamily={fonts.serif}
          textColor={colors.ink}
          linkStyle={{ linkColor: colors.accent, linkUnderline: false }}
          _meta={{ htmlID: "u_content_body_1" }}
        >
          {blockRows.slice(0, coverRowCount(renderedBlocks))}
          {contentsRows(doc)}
          {blockRows.slice(coverRowCount(renderedBlocks))}
          {documentFooterRows(doc)}
        </Document>
      ),
    };
  }

  return {
    mode,
    blocks: renderedBlocks,
    root: (
      <Page
        backgroundColor={colors.paper}
        contentWidth="760px"
        fontFamily={fonts.sans}
        textColor={colors.ink}
        linkStyle={{ linkColor: colors.accent, linkUnderline: false }}
        _meta={{ htmlID: "u_content_body_1" }}
      >
        {webNavRows(doc)}
        {blockRows}
        {webFooterRows(doc)}
      </Page>
    ),
  };
}

export function buildEmailRoot(doc: MemoryDocument): ReactElement {
  return buildRoot(doc, "email").root;
}
export function buildPageRoot(doc: MemoryDocument): ReactElement {
  return buildRoot(doc, "web").root;
}
export function buildDocumentRoot(doc: MemoryDocument): ReactElement {
  return buildRoot(doc, "document").root;
}

function surfaceFor(mode: OutputMode, position: number): string {
  if (mode !== "web") return colors.surface;
  return position % 2 === 0 ? colors.surface : colors.paper;
}

function coverRowCount(blocks: RenderedBlock[]): number {
  return blocks[0]?.rows.length ?? 0;
}

function anchoredRows(block: RenderedBlock): ReactElement[] {
  if (block.rows.length === 0) return [];
  const [first, ...rest] = block.rows;
  const anchor = `section-${block.kind}`;
  if (!isValidElement(first)) return block.rows;
  return [cloneElement(first, { anchor } as { anchor: string }), ...rest];
}

function menuItems(doc: MemoryDocument) {
  return doc.blocks
    .filter((b) => b.kind !== "snapshot")
    .map((b) => ({
      text: b.title.replace(/\s+[—–-].*$/, "").trim(),
      href: `#${sectionAnchor(b)}`,
      // Elements defaults menu links to _blank — wrong for in-document jumps.
      target: "_self" as const,
    }));
}

/* --------------------------------- email --------------------------------- */

function emailHeaderRows(doc: MemoryDocument): ReactElement[] {
  const items = menuItems(doc);
  return [
    <Row key="email-header" layout={ColumnLayouts.OneColumn} backgroundColor={colors.ink} padding="18px 40px 10px 40px">
      <Column padding="0px">
        <Heading
          headingType="h4"
          fontFamily={fonts.mono}
          fontSize="11px"
          fontWeight={700}
          color={colors.paper}
          letterSpacing="0.16em"
          lineHeight="150%"
        >
          {escapeHtml(doc.title.toUpperCase())}
        </Heading>
      </Column>
    </Row>,
    items.length > 0 ? (
      <Row key="email-nav" layout={ColumnLayouts.OneColumn} backgroundColor={colors.ink} padding="0px 40px 16px 40px">
        <Column padding="0px">
          <Menu
            items={items}
            layout="horizontal"
            align="left"
            separator=" · "
            linkColor={colors.heroMuted}
            fontFamily={fonts.mono}
            fontSize="10.5px"
            fontWeight={600}
            letterSpacing="0.04em"
            containerPadding="0px"
          />
        </Column>
      </Row>
    ) : (
      <Row key="email-nav-spacer" layout={ColumnLayouts.OneColumn} backgroundColor={colors.ink} padding="0px 40px 8px 40px">
        <Column padding="0px">
          <Paragraph html="&nbsp;" fontSize="1px" color={colors.ink} />
        </Column>
      </Row>
    ),
  ];
}

function emailFooterRows(doc: MemoryDocument): ReactElement[] {
  const firstJump = doc.blocks.find((b) => b.kind !== "snapshot");
  return [
    <Row key="email-cta" layout={ColumnLayouts.OneColumn} backgroundColor={colors.surface} padding="8px 40px 4px 40px">
      <Column>
        {firstJump ? (
          <Button
            href={`#${sectionAnchor(firstJump)}`}
            text="Jump to the memories"
            backgroundColor={colors.accent}
            color={colors.paper}
            hoverBackgroundColor={colors.accentHover}
            fontFamily={fonts.sans}
            fontSize="13px"
            fontWeight={700}
            borderRadius="8px"
            padding="10px 18px"
            containerPadding="8px 0px"
          />
        ) : null}
      </Column>
    </Row>,
    <Row key="email-footer" layout={ColumnLayouts.OneColumn} backgroundColor={colors.surface2} padding="20px 40px 24px 40px">
      <Column>
        <Paragraph
          html={inlineText(`${doc.title} — ${provenanceLine(doc)} · memoRABLE`)}
          fontFamily={fonts.mono}
          fontSize="10.5px"
          color={colors.ink3}
          lineHeight="160%"
        />
      </Column>
    </Row>,
  ];
}

/* ------------------------------- document -------------------------------- */

/**
 * A clickable table of contents. Each entry is an Elements Paragraph with an
 * in-document anchor — the one kind of "interactivity" that survives
 * print-to-PDF and most email clients.
 */
function contentsRows(doc: MemoryDocument): ReactElement[] {
  const sections = doc.blocks.slice(1);
  if (sections.length === 0) return [];
  const half = Math.ceil(sections.length / 2);
  const columns = [sections.slice(0, half), sections.slice(half)].filter((c) => c.length > 0);
  return [
    <Row key="contents-label" layout={ColumnLayouts.OneColumn} backgroundColor={colors.surface} padding="6px 44px 8px 44px">
      <Column border={{ borderTopWidth: "1px", borderTopStyle: "solid", borderTopColor: colors.line }} padding="14px 0px 0px 0px">
        <Heading
          headingType="h4"
          fontFamily={fonts.mono}
          fontSize="10px"
          fontWeight={700}
          color={colors.ink3}
          letterSpacing="0.16em"
          lineHeight="150%"
        >
          CONTENTS
        </Heading>
      </Column>
    </Row>,
    <Row
      key="contents"
      layout={columns.length === 2 ? ColumnLayouts.TwoEqual : ColumnLayouts.OneColumn}
      backgroundColor={colors.surface}
      padding="0px 44px 26px 44px"
    >
      {columns.map((group, columnIndex) => (
        <Column key={`contents-col-${columnIndex}`} padding="0px 16px 0px 0px">
          {group.map((block) => (
            <Paragraph
              key={`contents-${block.id}`}
              html={tocLink(doc, block)}
              fontFamily={fonts.serif}
              fontSize="13.5px"
              color={colors.ink2}
              lineHeight="185%"
            />
          ))}
        </Column>
      ))}
    </Row>,
  ];
}

function tocLink(doc: MemoryDocument, block: MemoryBlock): string {
  const label = escapeHtml(`${roman(doc.blocks.indexOf(block))}. ${block.title}`);
  return `<a href="#${sectionAnchor(block)}" style="color:${colors.ink};text-decoration:none">${label}</a>`;
}

function documentFooterRows(doc: MemoryDocument): ReactElement[] {
  return [
    <Row key="doc-footer" layout={ColumnLayouts.OneColumn} backgroundColor={colors.surface} padding="10px 44px 40px 44px">
      <Column padding="0px">
        <Divider borderTopWidth="1px" borderTopStyle="solid" borderTopColor={colors.line} />
        <Paragraph
          html={inlineText(`${doc.title} — ${provenanceLine(doc)}`)}
          fontFamily={fonts.mono}
          fontSize="10.5px"
          color={colors.ink3}
          lineHeight="180%"
        />
      </Column>
    </Row>,
  ];
}

/* ---------------------------------- web ---------------------------------- */

function webNavRows(doc: MemoryDocument): ReactElement[] {
  const items = menuItems(doc);
  if (items.length === 0) return [];
  return [
    <Row key="web-nav" layout={ColumnLayouts.OneColumn} backgroundColor={colors.ink} padding="14px 44px 14px 44px">
      <Column padding="0px">
        <Menu
          items={[
            { text: "Cover", href: `#${sectionAnchor(doc.blocks[0]!)}`, target: "_self" },
            ...items,
          ]}
          layout="horizontal"
          align="left"
          separator="  "
          linkColor={colors.heroInk}
          fontFamily={fonts.mono}
          fontSize="11px"
          fontWeight={600}
          letterSpacing="0.06em"
          containerPadding="0px"
        />
      </Column>
    </Row>,
  ];
}

function webFooterRows(doc: MemoryDocument): ReactElement[] {
  const firstJump = doc.blocks.find((b) => b.kind !== "snapshot");
  return [
    <Row key="web-footer" layout={ColumnLayouts.OneColumn} backgroundColor={colors.ink} padding="34px 44px 38px 44px">
      <Column>
        <Paragraph
          html={inlineText(doc.title)}
          fontFamily={fonts.serif}
          fontSize="18px"
          color={colors.paper}
          lineHeight="140%"
        />
        <Paragraph
          html={inlineText(provenanceLine(doc))}
          fontFamily={fonts.mono}
          fontSize="10.5px"
          color={colors.heroMuted}
          lineHeight="170%"
        />
        {firstJump ? (
          <Button
            href={`#${sectionAnchor(firstJump)}`}
            text="Back to the first memory"
            backgroundColor={colors.accent}
            color={colors.paper}
            hoverBackgroundColor={colors.accentHover}
            fontFamily={fonts.sans}
            fontSize="13px"
            fontWeight={700}
            borderRadius="8px"
            padding="10px 18px"
            containerPadding="16px 0px 0px 0px"
          />
        ) : null}
      </Column>
    </Row>,
  ];
}

/* --------------------------------- shared -------------------------------- */

function provenanceLine(doc: MemoryDocument): string {
  return `Created from ${doc.blocks.length} source-linked Memory Blocks`;
}

function previewTextOf(doc: MemoryDocument): string {
  const snapshot = doc.blocks.find((b) => b.kind === "snapshot");
  const summary =
    snapshot && "summary" in snapshot.payload ? String(snapshot.payload.summary) : doc.title;
  const plain = escapeHtml(summary.replace(/\s+/g, " ").trim());
  return plain.length > 140 ? plain.slice(0, 139) + "…" : plain;
}
