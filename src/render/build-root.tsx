import type { ReactElement } from "react";
import { Column, ColumnLayouts, Document, Divider, Email, Heading, Page, Paragraph, Row } from "@unlayer/react-elements";
import type { MemoryDocument } from "@/domain/memory/schema";
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
 * One set of memories, three surfaces. The blocks are shared; the frame around
 * them is not. Print opens on a title page and a table of contents, the web
 * opens on a dark hero and alternates bands down the page, email keeps a
 * narrow masthead and a quiet footer. That is the whole point of writing the
 * content once in Elements and letting each surface set it its own way.
 */

export interface BuiltRoot {
  mode: OutputMode;
  root: ReactElement;
  /** Per-block render metadata (recovered flags) for honest diagnostics. */
  blocks: RenderedBlock[];
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

  const blockRows = renderedBlocks.flatMap((b) => b.rows);

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
        >
          {emailHeaderRow(doc)}
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
        <Document backgroundColor={colors.paper} contentWidth="760px" fontFamily={fonts.serif} textColor={colors.ink}>
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
      <Page backgroundColor={colors.paper} contentWidth="760px" fontFamily={fonts.sans} textColor={colors.ink}>
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

/**
 * Web alternates plain and tinted bands so sections separate at a glance; the
 * hero supplies its own ink background and is exempt. Print and email stay on
 * one surface — banding wastes toner and trips older mail clients.
 */
function surfaceFor(mode: OutputMode, position: number): string {
  if (mode !== "web") return colors.surface;
  return position % 2 === 0 ? colors.surface : colors.paper;
}

/** Rows belonging to the first block — the cover — which contents follows. */
function coverRowCount(blocks: RenderedBlock[]): number {
  return blocks[0]?.rows.length ?? 0;
}

/* --------------------------------- email --------------------------------- */

function emailHeaderRow(doc: MemoryDocument): ReactElement {
  return (
    <Row key="email-header" layout={ColumnLayouts.OneColumn} backgroundColor={colors.ink} padding="16px 40px 16px 40px">
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
    </Row>
  );
}

function emailFooterRows(doc: MemoryDocument): ReactElement[] {
  return [
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
 * A table of contents, built from the memories actually present and in the
 * order they were arranged — the reader's map of a printed report.
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
              html={inlineText(`${roman(doc.blocks.indexOf(block))}. ${block.title}`)}
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

function webFooterRows(doc: MemoryDocument): ReactElement[] {
  return [
    <Row key="web-footer" layout={ColumnLayouts.OneColumn} backgroundColor={colors.ink} padding="30px 44px 34px 44px">
      <Column>
        <Paragraph
          html={inlineText(doc.title)}
          fontFamily={fonts.serif}
          fontSize="16px"
          color={colors.paper}
          lineHeight="150%"
        />
        <Paragraph
          html={inlineText(provenanceLine(doc))}
          fontFamily={fonts.mono}
          fontSize="10.5px"
          color={colors.heroMuted}
          lineHeight="170%"
        />
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
