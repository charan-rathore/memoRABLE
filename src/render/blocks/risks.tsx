import type { ReactElement } from "react";
import { Column, ColumnLayouts, Row, Table } from "@unlayer/react-elements";
import type { MemoryBlock, RisksPayload } from "@/domain/memory/schema";
import { colors } from "../tokens";
import { escapeHtml } from "../safe-inline";
import { emptyBlockRow, notesRows, sectionLabelRow, PAD, type BlockRenderContext } from "./common";

/** Risks — the one genuinely tabular memory, rendered as a real Table. */
export function renderRisksRows(block: MemoryBlock, ctx: BlockRenderContext): ReactElement[] {
  const payload = block.payload as RisksPayload;
  const entries = payload.entries;
  const notes = payload.notes ?? [];
  const rows: ReactElement[] = [sectionLabelRow(block, ctx)];

  if (entries.length === 0) {
    rows.push(emptyBlockRow(block, "No risks were recognized in this source — nothing was invented."));
    rows.push(...notesRows(block, notes));
    return rows;
  }

  // Columns the source never filled are dropped rather than shown as blanks,
  // so an ungraded risk list reads as a clean list instead of a gappy table.
  const hasSeverity = entries.some((e) => e.severity !== undefined);
  const hasMitigation = entries.some((e) => e.mitigation !== undefined);
  const headers = [
    "Risk",
    ...(hasSeverity ? ["Severity"] : []),
    ...(hasMitigation ? ["Mitigation"] : []),
  ];

  rows.push(
    <Row
      key={`${block.id}-table`}
      layout={ColumnLayouts.OneColumn}
      backgroundColor={colors.surface}
      padding={notes.length === 0 ? PAD.last : PAD.body}
    >
      <Column padding="6px 0px">
        <Table
          headers={headers}
          data={entries.map((e) => [
            escapeHtml(e.risk),
            ...(hasSeverity ? [escapeHtml(e.severity ?? "—")] : []),
            ...(hasMitigation ? [escapeHtml(e.mitigation ?? "—")] : []),
          ])}
          border={{
            borderTopWidth: "1px",
            borderTopStyle: "solid",
            borderTopColor: colors.line,
            borderBottomWidth: "1px",
            borderBottomStyle: "solid",
            borderBottomColor: colors.line,
          }}
        />
      </Column>
    </Row>,
  );
  rows.push(...notesRows(block, notes));
  return rows;
}
