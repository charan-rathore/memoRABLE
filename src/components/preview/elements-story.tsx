"use client";

import type { OutputMode } from "@/domain/memory/types";
import { OUTPUT_MODE_LABELS } from "@/domain/memory/types";
import { ELEMENTS_REPO, elementsFor } from "@/render/elements-used";
import type { PublishThemeId } from "@/render/themes";
import { PUBLISH_THEMES } from "@/render/themes";
import { UnlayerMark } from "../ui/unlayer-mark";

/**
 * Makes Elements impossible to miss: Document → Memories → Composition → outputs.
 * Lists the exact Unlayer Elements (with repo links) used for the active mode.
 */
export function ElementsStory({
  mode,
  blockCount,
  theme,
}: {
  mode: OutputMode;
  blockCount: number;
  theme: PublishThemeId;
}) {
  const memories = blockCount > 0 ? `${blockCount} Memories` : "6 Memories";
  const elements = elementsFor(mode, theme);
  const themeMeta = PUBLISH_THEMES[theme];
  return (
    <section className="elements-story" aria-labelledby="elements-story-h" data-testid="elements-story">
      <div className="es-top">
        <div className="es-copy">
          <h3 id="elements-story-h">Powered by Elements</h3>
          <p className="es-lead">
            One understanding. Composed with{" "}
            <a href={ELEMENTS_REPO} target="_blank" rel="noreferrer">
              Unlayer Elements
            </a>
            . Preset: <b>{themeMeta.label}</b>. {themeMeta.description}
          </p>
        </div>
        <a
          className="es-unlayer"
          href="https://unlayer.com/"
          target="_blank"
          rel="noreferrer"
          aria-label="Unlayer (YC W22). Official site"
        >
          <span className="es-unlayer-mark" aria-hidden="true">
            <UnlayerMark size={40} />
          </span>
          <span className="es-unlayer-text">
            <span className="es-unlayer-name">Unlayer (YC W22)</span>
            <span className="es-unlayer-tag">AI-powered content creation tools for software products</span>
          </span>
        </a>
      </div>
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
      <div className="es-used" data-testid="elements-used">
        <h4>Elements in this {OUTPUT_MODE_LABELS[mode]}</h4>
        <ul>
          {elements.map((el) => (
            <li key={el.name}>
              <a href={el.href} target="_blank" rel="noreferrer">
                {el.name}
              </a>
              <span>{el.role}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
