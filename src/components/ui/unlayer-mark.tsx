/**
 * Unlayer mark: circuit nodes into a 2×2 block cluster.
 * Matches the public Unlayer logo geometry; colour follows currentColor.
 */
export function UnlayerMark({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size * 0.9}
      viewBox="0 0 120 108"
      role="img"
      aria-label="Unlayer"
      style={{ display: "block", flex: "none" }}
    >
      <g fill="currentColor" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        {/* connectors */}
        <path d="M18 14 V40 H48" fill="none" />
        <path d="M18 54 H40 L48 68" fill="none" />
        <path d="M40 96 H62 L74 78" fill="none" />
        {/* nodes */}
        <circle cx="18" cy="14" r="6" stroke="none" />
        <circle cx="18" cy="54" r="6" stroke="none" />
        <circle cx="40" cy="96" r="6" stroke="none" />
        {/* lone square */}
        <rect x="28" y="78" width="22" height="22" rx="5" stroke="none" />
        {/* 2×2 cluster */}
        <rect x="48" y="28" width="28" height="28" rx="5" stroke="none" />
        <rect x="82" y="28" width="28" height="28" rx="5" stroke="none" />
        <rect x="48" y="62" width="28" height="28" rx="5" stroke="none" />
        <rect x="82" y="62" width="28" height="28" rx="5" stroke="none" />
      </g>
    </svg>
  );
}
