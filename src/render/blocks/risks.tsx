import type { ReactElement } from "react";
import { Column, ColumnLayouts, Paragraph, Row, Table } from "@unlayer/react-elements";
import type { MemoryBlock, RisksPayload } from "@/domain/memory/schema";
import { severityColor } from "../tokens";
import { escapeHtml, inlineText } from "../safe-inline";
import { emptyBlockRow, notesRows, sectionLabelRow, PAD, type BlockRenderContext } from "./common";

/**
 * Risks: Table when the preset prefers tables; otherwise spare Paragraph lines
 * (Minimal). Colours come from the active publish theme.
 */
export function renderRisksRows(block: MemoryBlock, ctx: BlockRenderContext): ReactElement[] {
  const payload = block.payload as RisksPayload;
  const entries = payload.entries;
  const notes = payload.notes ?? [];
  const rows: ReactElement[] = [...sectionLabelRow(block, ctx)];
  const c = ctx.theme.colors;
  const f = ctx.theme.fonts;

  if (entries.length === 0) {
    rows.push(emptyBlockRow(block, "No risks were recognized in this source. Nothing was invented.", ctx.surface));
    rows.push(...notesRows(block, notes, ctx.surface));
    return rows;
  }

  if (!ctx.theme.chrome.preferTables) {
    rows.push(
      <Row
        key={`${block.id}-list`}
        layout={ColumnLayouts.OneColumn}
        backgroundColor={ctx.surface}
        padding={notes.length === 0 ? PAD.last : PAD.body}
      >
        <Column>
          {entries.map((e, i) => {
            const parts = [e.risk];
            if (e.severity) parts.push(`(${e.severity})`);
            if (e.mitigation) parts.push(`Mitigation: ${e.mitigation}`);
            return (
              <Paragraph
                key={`${block.id}-r-${i}`}
                html={inlineText(parts.join(" · "))}
                fontFamily={f.sans}
                fontSize="13px"
                color={c.ink}
                lineHeight="170%"
              />
            );
          })}
        </Column>
      </Row>,
    );
    rows.push(...notesRows(block, notes, ctx.surface));
    return rows;
  }

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
    color: opts.color ?? c.ink,
    backgroundColor: opts.backgroundColor,
    padding: "9px 11px",
    textAlign: opts.align ?? ("left" as const),
  });

  const riskCell = (e: (typeof entries)[number]) => {
    const parts = [e.risk];
    if (e.because) parts.push(`Why it matters: ${e.because}`);
    if (e.consequence) parts.push(`If nothing changes: ${e.consequence}`);
    return escapeHtml(parts.join(". "));
  };

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
          stripedRowsBackgroundColor={c.surface2}
          values={
            {
              enableHeader: true,
              table: {
                headers: [
                  {
                    height: 0,
                    cells: headers.map((h) => cell(h, { color: c.paper, backgroundColor: c.ink })),
                  },
                ],
                rows: entries.map((e) => ({
                  height: 0,
                  cells: [
                    cell(riskCell(e)),
                    ...(hasSeverity
                      ? [
                          cell(escapeHtml(e.severity ?? "·"), {
                            color: e.severity ? severityColor(e.severity) : c.ink3,
                            align: "center",
                          }),
                        ]
                      : []),
                    ...(hasMitigation ? [cell(escapeHtml(e.mitigation ?? "·"), { color: c.ink2 })] : []),
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
            borderBottomColor: c.line,
          }}
        />
      </Column>
    </Row>,
  );
  rows.push(...notesRows(block, notes, ctx.surface));
  return rows;
}
