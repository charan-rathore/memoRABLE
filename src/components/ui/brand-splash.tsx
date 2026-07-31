"use client";

import { useEffect, useRef, useState } from "react";
import { BrandMark } from "./brand-mark";

/**
 * The opening moment: the mark assembles in the centre of the screen while the
 * home sits blurred behind it, then both resolve into place.
 *
 * It plays every time the visitor arrives on the home screen (including a
 * full reload), never blocks input for longer than its own animation, and
 * collapses to a brief static hold when they have asked for reduced motion.
 */

/** Past about 1.2s a brand moment stops being a moment and becomes a toll booth. */
const HOLD_MS = 780;
const REDUCED_HOLD_MS = 400;
const EXIT_MS = 300;

export function BrandSplash({ onFinished }: { onFinished: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const finishedRef = useRef(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hold = reduced ? REDUCED_HOLD_MS : HOLD_MS;

    const finish = () => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      setLeaving(true);
      window.setTimeout(onFinished, reduced ? 0 : EXIT_MS);
    };

    const holdTimer = window.setTimeout(finish, hold);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Enter" || event.key === " ") finish();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", finish);

    return () => {
      window.clearTimeout(holdTimer);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", finish);
    };
  }, [onFinished]);

  return (
    <div className={`splash${leaving ? " leaving" : ""}`} role="presentation" data-testid="brand-splash">
      <div className="splash-inner">
        <div className="splash-mark">
          <BrandMark size={132} animate />
        </div>
        <div className="splash-word">
          memo<b>RABLE</b>
        </div>
        <div className="splash-line">Turn information into memory.</div>
      </div>
    </div>
  );
}
