import type { ReactElement } from "react";
import { Column, ColumnLayouts, Document, Divider, Email, Heading, Page, Paragraph, Row } from "@unlayer/react-elements";
import type { MemoryDocument } from "@/domain/memory/schema";
import type { OutputMode } from "@/domain/memory/types";
import { colors, fonts } from "./tokens";
import { escapeHtml, inlineText } from "./safe-inline";
import { renderBlockRows, type RenderedBlock } from "./block-registry";
import type { BlockRenderContext } from "./blocks/common";

/**
 * Root builders. Each returns the direct root element (<Email>/<Page>/
 * <Document>) with block rows composed inline — block renderer functions are
 * called directly (never passed as <Component />) so renderToJson walks a
 * recognized Root → Row → Column → Item tree.
 */

export interface BuiltRoot {
  mode: OutputMode;
  root: ReactElement;
  /** Per-block render metadata (recovered flags) for honest diagnostics. */
  blocks: RenderedBlock[];
}

export function buildRoot(doc: MemoryDocument, mode: OutputMode): BuiltRoot {
  const renderedBlocks = doc.blocks.map((block, position) => {
    const ctx: BlockRenderContext = { mode, position, documentTitle: doc.title };
    return renderBlockRows(block, ctx);
  });

  const blockRows = renderedBlocks.flatMap((b) => b.rows);
  const footer = footerRow(doc, mode);

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
          {footer}
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
          {blockRows}
          {footer}
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
        {footer}
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

function emailHeaderRow(doc: MemoryDocument): ReactElement {
  return (
    <Row key="email-header" layout={ColumnLayouts.OneColumn} backgroundColor={colors.surface} padding="22px 44px 0px 44px">
      <Column padding="0px 0px 6px 0px">
        <Heading headingType="h4" fontFamily={fonts.mono} fontSize="11px" fontWeight={700} color={colors.ink3} letterSpacing="0.14em">
          {escapeHtml(doc.title.toUpperCase())}
        </Heading>
        <Divider borderTopWidth="1px" borderTopStyle="solid" borderTopColor={colors.line} />
      </Column>
    </Row>
  );
}

function footerRow(doc: MemoryDocument, mode: OutputMode): ReactElement {
  const count = doc.blocks.length;
  const line =
    mode === "email"
      ? `Created from ${count} source-linked Memory Blocks · memoRABLE`
      : `Created from ${count} source-linked Memory Blocks`;
  return (
    <Row key="footer" layout={ColumnLayouts.OneColumn} backgroundColor={colors.surface} padding="0px 44px 28px 44px">
      <Column
        padding="14px 0px 0px 0px"
        border={{ borderTopWidth: "1px", borderTopStyle: "solid", borderTopColor: colors.line }}
      >
        <Paragraph
          html={inlineText(`${doc.title} — ${line}`)}
          fontFamily={fonts.mono}
          fontSize="10.5px"
          color={colors.ink3}
          lineHeight="150%"
        />
      </Column>
    </Row>
  );
}

function previewTextOf(doc: MemoryDocument): string {
  const snapshot = doc.blocks.find((b) => b.kind === "snapshot");
  const summary =
    snapshot && "summary" in snapshot.payload ? String(snapshot.payload.summary) : doc.title;
  const plain = escapeHtml(summary.replace(/\s+/g, " ").trim());
  return plain.length > 140 ? plain.slice(0, 139) + "…" : plain;
}
