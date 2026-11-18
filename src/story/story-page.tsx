"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { MemoryDocument } from "@/domain/memory/schema";
import { planStory } from "./plan";
import { StoryView } from "./story-view";
import { loadForStory } from "./handoff";
import "./story.css";

/** The story page: the document handed over from the workbench, or the example it was given. */
export function StoryPage({ example }: { example: MemoryDocument }) {
  const [doc, setDoc] = useState<MemoryDocument>(example);
  useEffect(() => { const d = loadForStory(); if (d) setDoc(d); }, []);
  const story = useMemo(() => planStory(doc), [doc]);
  useEffect(() => { document.title = `${story.title} · memoRABLE`; }, [story.title]);

  return (
    <StoryView
      key={doc.contentHash}
      story={story}
      toolbar={
        <nav className="sd-bar-top" aria-label="Story">
          <b>memoRABLE</b>
          <Link href="/#briefs">Back<span className="sd-wide"> to the brief</span></Link>
          <button type="button" className="is-primary" onClick={() => window.print()}>Save as PDF</button>
        </nav>
      }
    />
  );
}
