import { isValidElement, type ReactElement } from "react";
import { Row } from "@unlayer/react-elements";
import type { BlockKind, MemoryBlock } from "@/domain/memory/schema";
import { renderSnapshotRows } from "./blocks/snapshot";
import { renderSignalsRows } from "./blocks/signals";
import { renderDecisionsRows } from "./blocks/decisions";
import { renderTimelineRows } from "./blocks/timeline";
import { renderRisksRows } from "./blocks/risks";
import { renderActionsRows } from "./blocks/actions";
import { recoveryRow } from "./recovery-row";
import type { BlockRenderContext } from "./blocks/common";

export type BlockRenderer = (block: MemoryBlock, ctx: BlockRenderContext) => ReactElement[];

/**
 * The block registry: exactly six implemented kinds. Adding a seventh means
 * registering a renderer here — see docs/adding-a-block.md.
 */
export const blockRenderers: Record<BlockKind, BlockRenderer> = {
  snapshot: renderSnapshotRows,
  signals: renderSignalsRows,
  decisions: renderDecisionsRows,
  timeline: renderTimelineRows,
  risks: renderRisksRows,
  actions: renderActionsRows,
};

export interface RenderedBlock {
  blockId: string;
  kind: BlockKind;
  rows: ReactElement[];
  /** True when the renderer failed and the recovery row was substituted. */
  recovered: boolean;
}

/**
 * Render one block with full isolation: a throwing renderer or an invalid
 * structure (non-Row nodes) replaces ONLY this block with a fixed safe row.
 */
export function renderBlockRows(block: MemoryBlock, ctx: BlockRenderContext): RenderedBlock {
  const renderer = blockRenderers[block.kind];
  try {
    const rows = renderer(block, ctx);
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error(`renderer for "${block.kind}" returned no rows`);
    }
    for (const row of rows) {
      if (!isValidElement(row) || row.type !== Row) {
        throw new Error(`renderer for "${block.kind}" returned a non-Row node`);
      }
    }
    return { blockId: block.id, kind: block.kind, rows, recovered: false };
  } catch {
    return {
      blockId: block.id,
      kind: block.kind,
      rows: [recoveryRow(`${block.id}-recovery`, block.title)],
      recovered: true,
    };
  }
}
