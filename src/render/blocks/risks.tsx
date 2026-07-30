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

  rows.push(
    <Row
      key={`${block.id}-table`}
      layout={ColumnLayouts.OneColumn}
      backgroundColor={colors.surface}
      padding={notes.length === 0 ? PAD.last : PAD.body}
    >
      <Column padding="6px 0px">
        <Table
          headers={["Risk", "Severity", "Mitigation"]}
          data={entries.map((e) => [escapeHtml(e.risk), escapeHtml(e.severity), escapeHtml(e.mitigation)])}
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
