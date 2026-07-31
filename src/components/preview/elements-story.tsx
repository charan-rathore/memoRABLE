"use client";

import type { OutputMode } from "@/domain/memory/types";
import { OUTPUT_MODE_LABELS } from "@/domain/memory/types";

/**
 * Makes Elements impossible to miss: Document → Memories → Composition → outputs.
 * Presentational only — does not touch the render pipeline.
 */
export function ElementsStory({ mode, blockCount }: { mode: OutputMode; blockCount: number }) {
  const memories = blockCount > 0 ? `${blockCount} Memories` : "6 Memories";
  return (
    <section className="elements-story" aria-labelledby="elements-story-h" data-testid="elements-story">
      <h3 id="elements-story-h">Powered by Elements</h3>
      <p className="es-lead">
        One understanding. Composed once with{" "}
        <a href="https://github.com/unlayer/elements" target="_blank" rel="noreferrer">
          Unlayer Elements
        </a>
        . Published three ways.
      </p>
      <ol className="es-flow" aria-label="Elements composition flow">
        <li>Document</li>
        <li aria-hidden="true">↓</li>
        <li>{memories}</li>
        <li aria-hidden="true">↓</li>
        <li className="es-engine">Elements Composition Engine</li>
        <li aria-hidden="true">↓</li>
        <li className={mode === "email" ? "on" : undefined}>Email</li>
        <li aria-hidden="true">·</li>
        <li className={mode === "web" ? "on" : undefined}>Web</li>
        <li aria-hidden="true">·</li>
        <li className={mode === "document" ? "on" : undefined}>Document</li>
      </ol>
      <p className="es-composed" key={mode} data-testid="composed-using-elements">
        Composed using Elements · {OUTPUT_MODE_LABELS[mode]}
      </p>
    </section>
  );
}
