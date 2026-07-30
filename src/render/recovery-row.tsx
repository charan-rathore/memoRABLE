import type { ReactElement } from "react";
import { Column, ColumnLayouts, Paragraph, Row } from "@unlayer/react-elements";
import { colors, fonts } from "./tokens";

/**
 * Reliability layer 5 — block isolation. When a single block renderer fails
 * or returns an invalid structure, exactly that block is replaced by this
 * fixed, safe Elements row. It contains no imported content at all.
 */
export function recoveryRow(key: string, blockTitle: string): ReactElement {
  return (
    <Row key={key} layout={ColumnLayouts.OneColumn} backgroundColor={colors.surface} padding="24px 44px">
      <Column
        border={{
          borderTopWidth: "1px",
          borderTopStyle: "solid",
          borderTopColor: colors.line,
          borderBottomWidth: "1px",
          borderBottomStyle: "solid",
          borderBottomColor: colors.line,
          borderLeftWidth: "1px",
          borderLeftStyle: "solid",
          borderLeftColor: colors.line,
          borderRightWidth: "1px",
          borderRightStyle: "solid",
          borderRightColor: colors.line,
        }}
        padding="16px"
      >
        <Paragraph
          html={`<b>${escapeForRecovery(blockTitle)}</b> couldn't be rendered here. Its content is still safe in your source — the other memories are unaffected.`}
          fontFamily={fonts.sans}
          fontSize="13px"
          color={colors.ink2}
          lineHeight="150%"
        />
      </Column>
    </Row>
  );
}

function escapeForRecovery(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}
