import type { ReactElement } from "react";
import { Column, ColumnLayouts, Row, Table } from "@unlayer/react-elements";
import type { MemoryBlock, RisksPayload } from "@/domain/memory/schema";
import { colors, severityColor } from "../tokens";
import { escapeHtml } from "../safe-inline";
import { emptyBlockRow, notesRows, sectionLabelRow, PAD, type BlockRenderContext } from "./common";

/**
 * Risks — the one genuinely tabular memory. The exporter silently ignores the
 * convenient `headerBackgroundColor` / `contentColor` props, so the designed
 * table is built through per-cell `values.table` — the only route that actually
 * emits background, colour and padding today.
 */
export function renderRisksRows(block: MemoryBlock, ctx: BlockRenderContext): ReactElement[] {
  const payload = block.payload as RisksPayload;
  const entries = payload.entries;
  const notes = payload.notes ?? [];
  const rows: ReactElement[] = [...sectionLabelRow(block, ctx)];

  if (entries.length === 0) {
    rows.push(emptyBlockRow(block, "No risks were recognized in this source — nothing was invented.", ctx.surface));
    rows.push(...notesRows(block, notes, ctx.surface));
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

  const cell = (text: string, opts: { color?: string; backgroundColor?: string; align?: "left" | "center" } = {}) => ({
    width: 0,
    text,
    color: opts.color ?? colors.ink,
    backgroundColor: opts.backgroundColor,
    padding: "9px 11px",
    textAlign: opts.align ?? ("left" as const),
  });

  rows.push(
    <Row
      key={`${block.id}-table`}
      layout={ColumnLayouts.OneColumn}
      backgroundColor={ctx.surface}
      padding={notes.length === 0 ? PAD.last : PAD.body}
    >
      <Column padding="6px 0px">
        <Table
          enableHeader
          stripedRows
          stripedRowsBackgroundColor={colors.surface2}
          values={
            {
              enableHeader: true,
              table: {
                headers: [
                  {
                    height: 0,
                    cells: headers.map((h) =>
                      cell(h, { color: colors.paper, backgroundColor: colors.ink }),
                    ),
                  },
                ],
                rows: entries.map((e) => ({
                  height: 0,
                  cells: [
                    cell(escapeHtml(e.risk)),
                    ...(hasSeverity
                      ? [
                          cell(escapeHtml(e.severity ?? "—"), {
                            color: e.severity ? severityColor(e.severity) : colors.ink3,
                            align: "center",
                          }),
                        ]
                      : []),
                    ...(hasMitigation
                      ? [cell(escapeHtml(e.mitigation ?? "—"), { color: colors.ink2 })]
                      : []),
                  ],
                })),
                footers: [],
              },
            } as never
          }
          border={{
            borderTopWidth: "0px",
            borderLeftWidth: "0px",
            borderRightWidth: "0px",
            borderBottomWidth: "1px",
            borderBottomStyle: "solid",
            borderBottomColor: colors.line,
          }}
        />
      </Column>
    </Row>,
  );
  rows.push(...notesRows(block, notes, ctx.surface));
  return rows;
}
