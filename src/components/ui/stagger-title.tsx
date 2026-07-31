"use client";

/**
 * Origin-inspired Stagger Text Rise, rebuilt in CSS.
 * Originkit itself is Framer-locked and pulls in framer-motion; for a calm
 * editorial surface we keep the idea — words rising into place, 40ms apart —
 * and drop the dependency so the first paint stays compositor-only.
 */
export function StaggerTitle({
  text,
  as: Tag = "h1",
  className,
}: {
  text: string;
  as?: "h1" | "h2" | "p";
  className?: string;
}) {
  const words = text.split(/(\s+)/);
  return (
    <Tag className={className} aria-label={text}>
      {words.map((word, i) =>
        /^\s+$/.test(word) ? (
          <span key={`s-${i}`}>{" "}</span>
        ) : (
          <span key={`w-${i}`} className="stagger-word" style={{ animationDelay: `${i * 40}ms` }}>
            {word}
          </span>
        ),
      )}
    </Tag>
  );
}
