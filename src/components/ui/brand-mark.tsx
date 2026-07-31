/**
 * The memoRABLE mark — seven stacked blocks forming an "M" with a cobalt
 * center block. Pure SVG, no imagery.
 */
export function BrandMark({ size = 22, animate = false }: { size?: number; animate?: boolean }) {
  const b = 6; // block size
  const gap = 2;
  const step = b + gap;
  const ink = "#14130F";
  const cobalt = "#1E3BD6";
  // Columns of the "M": heights [3,2,1,3,1,2,3] → seven vertical runs.
  const columns = [3, 2, 1, 3, 1, 2, 3];
  const blocks: { x: number; y: number; center: boolean }[] = [];
  columns.forEach((height, col) => {
    for (let row = 0; row < height; row++) {
      blocks.push({ x: col * step, y: row * step, center: col === 3 && row === 0 });
    }
  });
  const width = columns.length * step - gap;
  const height = 3 * step - gap;
  return (
    <svg
      width={size}
      height={(size * height) / width}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="memoRABLE mark"
      style={{ display: "block", flex: "none" }}
    >
      {blocks.map((blk, i) => (
        <rect
          key={i}
          x={blk.x}
          y={blk.y}
          width={b}
          height={b}
          rx={1.5}
          fill={blk.center ? cobalt : ink}
          className={animate ? "bm-block" : undefined}
          style={animate ? { animationDelay: `${i * 28}ms`, transformOrigin: `${blk.x + b / 2}px ${blk.y + b / 2}px` } : undefined}
        />
      ))}
    </svg>
  );
}
