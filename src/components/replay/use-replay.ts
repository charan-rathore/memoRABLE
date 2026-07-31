"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OutputMode } from "@/domain/memory/types";

/**
 * The 20-second replay. a presentation-only story over the REAL pipeline.
 * It never fabricates a separate demo renderer: the import, the six memories
 * and the outputs are the same ones the workbench produces. Canonical state
 * is snapshotted before and restored after, so replay can never mutate the
 * user's document, ids, ordering, hashes or last-good outputs.
 */

export interface ReplayView {
  phase: "intro" | "bring" | "understand" | "remember" | "arrange" | "publish";
  /** 0-based index into the five journey verbs for the strip. */
  journeyStep: number;
  message: string;
  /** Number of memories revealed so far (Remember phase), else null. */
  revealCount: number | null;
  /** 0.1 overall progress for the banner bar. */
  progress: number;
}

interface ReplayCallbacks {
  /** Run the real Atlas import (must be the deterministic pipeline). */
  runRealImport: () => void;
  setMode: (mode: OutputMode) => void;
  /** Snapshot/restore presentation-affected state. */
  snapshot: () => void;
  restore: () => void;
  announce: (message: string) => void;
}

interface TimelineTick {
  at: number;
  apply: () => void;
}

const REPLAY_MS = 20_000;

export function useReplay(callbacks: ReplayCallbacks, reducedMotion: boolean) {
  const [view, setView] = useState<ReplayView | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const cancel = useCallback(() => {
    clearTimers();
    callbacksRef.current.restore();
    setView(null);
    callbacksRef.current.announce("Replay stopped. Your memories are exactly as they were.");
  }, []);

  const start = useCallback(() => {
    clearTimers();
    const cb = callbacksRef.current;
    cb.snapshot();

    // Reduced motion: no autoplay, no stagger. the whole story at once.
    if (reducedMotion) {
      cb.runRealImport();
      setView({
        phase: "publish",
        journeyStep: 4,
        message: "One memory. Three useful outputs.",
        revealCount: null,
        progress: 1,
      });
      cb.announce("Replay shown without motion: six memories, published as Web, Email and Document.");
      timers.current.push(
        setTimeout(() => {
          callbacksRef.current.restore();
          setView(null);
        }, 4000),
      );
      return;
    }

    const ticks: TimelineTick[] = [
      {
        at: 0,
        apply: () => {
          setView({ phase: "intro", journeyStep: 0, message: "Turn information into memory.", revealCount: null, progress: 0 });
          cb.announce("Replaying the memoRABLE story. Press Escape or Stop to end it at any time.");
        },
      },
      {
        at: 3000,
        apply: () =>
          setView({ phase: "bring", journeyStep: 0, message: "Bring information: this is the Atlas brief.", revealCount: null, progress: 0.15 }),
      },
      {
        at: 7000,
        apply: () => {
          // The real deterministic import runs here. not a demo renderer.
          cb.runRealImport();
          setView({ phase: "understand", journeyStep: 1, message: "Understanding it: reading, recognizing, remembering…", revealCount: 0, progress: 0.35 });
        },
      },
      // Staggered reveal of the six real memories (max 80 ms stagger each).
      ...[1, 2, 3, 4, 5, 6].map((count, i) => ({
        at: 8200 + i * 700,
        apply: () =>
          setView({
            phase: "remember" as const,
            journeyStep: 2,
            message: count === 6 ? "Six memories, each linked to its source." : `Remembering it: memory ${count} of 6…`,
            revealCount: count,
            progress: 0.4 + i * 0.03,
          }),
      })),
      {
        at: 12500,
        apply: () =>
          setView({ phase: "arrange", journeyStep: 3, message: "Arrange it: all six, always. The order is yours.", revealCount: null, progress: 0.62 }),
      },
      {
        at: 16000,
        apply: () => {
          cb.setMode("email");
          setView({ phase: "publish", journeyStep: 4, message: "Publish it: the same memory, as an Email.", revealCount: null, progress: 0.8 });
        },
      },
      {
        at: 18200,
        apply: () => {
          cb.setMode("document");
          setView({ phase: "publish", journeyStep: 4, message: "One memory. Three useful outputs.", revealCount: null, progress: 0.95 });
        },
      },
      {
        at: REPLAY_MS,
        apply: () => {
          callbacksRef.current.restore();
          setView(null);
          callbacksRef.current.announce("Replay finished. Everything you saw was the real pipeline.");
        },
      },
    ];

    for (const tick of ticks) {
      // The intro tick (at: 0) applies synchronously so the replay banner is
      // visible the moment start() returns. no visible flash, and tests with
      // fake timers see the intro phase immediately.
      if (tick.at <= 0) {
        tick.apply();
      } else {
        timers.current.push(setTimeout(tick.apply, tick.at));
      }
    }
  }, [reducedMotion]);

  useEffect(() => clearTimers, []);

  return { view, start, cancel, active: view !== null };
}
