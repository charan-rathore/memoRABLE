"use client";

import type { MemoryBlock } from "@/domain/memory/schema";
import { bucketSubtitle, isNotApplicableBlock } from "@/understanding/projection-profiles";

/**
 * Memories rail: selection for the inspector, and explicit up/down arrangement.
 * Titles and set are archetype-projected; universal kinds stay under the hood.
 */
export function BlocksPanel({
  blocks,
  selectedBlockId,
  onSelect,
  onMove,
  onHover,
  revealCount,
  enterKey,
  archetypeId,
  archetypeLabel,
  archetypeScore,
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
  /** Detected document archetype — shapes subtitles. */
  archetypeId?: string | null;
  archetypeLabel?: string | null;
  /** Winner raw score when specialized; omitted for Generic Knowledge. */
  archetypeScore?: number | null;
}) {
  const visible = revealCount === null || revealCount === undefined ? blocks : blocks.slice(0, revealCount);
  const staggered = revealCount != null || Boolean(enterKey);
  const scoreFoot = typeof archetypeScore === "number" ? ` · score ${archetypeScore}` : "";
  const foot = archetypeLabel
    ? `adaptive projection · ${archetypeLabel}${scoreFoot}`
    : "universal observations → adaptive memories";
  return (
    <section className="card mem-card" aria-labelledby="mem-h">
      <div className="card-h" id="mem-h">
        <h3>Memories</h3>
        <span className="ct">{blocks.length} {blocks.length === 1 ? "type" : "types"}</span>
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
                    <span className="sub">
                      {isNotApplicableBlock(block)
                        ? "Not applicable"
                        : bucketSubtitle(archetypeId, block.kind)}
                    </span>
                  </span>
                  <span className="kind">
                    {isNotApplicableBlock(block) ? "n/a" : block.title.toLowerCase()}
                  </span>
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
        <p className="memfoot">{foot}</p>
      </div>
    </section>
  );
}
