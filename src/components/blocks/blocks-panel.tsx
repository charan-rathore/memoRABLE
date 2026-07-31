"use client";

import type { MemoryBlock } from "@/domain/memory/schema";
import { BLOCK_KIND_LABELS, BLOCK_KIND_SUBTITLES } from "@/domain/memory/schema";

/**
 * The six memories: selection for the inspector, and explicit up/down
 * arrangement. No drag dependency. works for keyboard and touch.
 */
export function BlocksPanel({
  blocks,
  selectedBlockId,
  onSelect,
  onMove,
  onHover,
  revealCount,
  enterKey,
}: {
  blocks: MemoryBlock[];
  selectedBlockId: string | null;
  onSelect: (blockId: string | null) => void;
  onMove: (blockId: string, direction: -1 | 1) => void;
  /** Soft-highlight the memory's source while hovered. */
  onHover?: (blockId: string | null) => void;
  /** Replay reveal: when set, only the first N blocks are shown. */
  revealCount?: number | null;
  /** Changes when a new document arrives, so the list can enter as a group. */
  enterKey?: string | null;
}) {
  const visible = revealCount === null || revealCount === undefined ? blocks : blocks.slice(0, revealCount);
  const staggered = revealCount != null || Boolean(enterKey);
  return (
    <section className="card mem-card" aria-labelledby="mem-h">
      <div className="card-h" id="mem-h">
        <h3>Memories</h3>
        <span className="ct">{blocks.length} types</span>
      </div>
      <div className="card-b">
        <ul className="mem-list" aria-label="Memory Blocks in order" key={enterKey ?? "static"}>
          {visible.map((block, index) => (
            <li key={block.id} style={{ display: "contents" }}>
              <div
                className={`mem${block.id === selectedBlockId ? " sel pulse" : ""}${staggered ? " entering" : ""}`}
                style={staggered ? { animationDelay: `${Math.min(index * 40, 240)}ms` } : undefined}
                onMouseEnter={() => onHover?.(block.id)}
                onMouseLeave={() => onHover?.(null)}
              >
                <button
                  type="button"
                  aria-label={`${block.title}: show details`}
                  aria-pressed={block.id === selectedBlockId}
                  onClick={() => onSelect(block.id === selectedBlockId ? null : block.id)}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 9,
                    flex: 1,
                    minWidth: 0,
                    textAlign: "left",
                  }}
                >
                  <span className="idx">{String(index + 1).padStart(2, "0")}</span>
                  <span className="mem-copy">
                    <span className="name">{block.title}</span>
                    <span className="sub">{BLOCK_KIND_SUBTITLES[block.kind]}</span>
                  </span>
                  <span className="kind">{BLOCK_KIND_LABELS[block.kind].toLowerCase()}</span>
                </button>
                <span className="mv" role="group" aria-label={`Move ${block.title}`}>
                  <button
                    type="button"
                    className="mvbtn"
                    aria-label={`Move ${block.title} up`}
                    disabled={index === 0}
                    onClick={() => onMove(block.id, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="mvbtn"
                    aria-label={`Move ${block.title} down`}
                    disabled={index === blocks.length - 1}
                    onClick={() => onMove(block.id, 1)}
                  >
                    ↓
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ul>
        <p className="memfoot">six types cover the anatomy of a document</p>
      </div>
    </section>
  );
}
