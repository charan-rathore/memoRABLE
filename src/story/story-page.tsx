"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MemoryDocument } from "@/domain/memory/schema";
import { importSource } from "@/import/import-source";
import { isPdfFile, readPdfFile } from "@/import/read-pdf";
import { planStory } from "./plan";
import { loadForStory } from "./handoff";
import { StoryView } from "./story-view";
import "./story.css";

/**
 * The story page. It opens on the sample (or whatever the workbench handed
 * over), and any PDF, Markdown, text or JSON file dropped on it or picked
 * plays here at once, read on this device, before anything is saved or
 * downloaded.
 */
export function StoryPage({ example, samples }: { example: MemoryDocument; samples?: { brief: MemoryDocument; paper: MemoryDocument } }) {
  const [doc, setDoc] = useState<MemoryDocument>(example);
  const [reading, setReading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { const d = loadForStory(); if (d) setDoc(d); }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("sample") === "paper" && samples) setDoc(samples.paper);
    if (params.has("pick")) input.current?.click();
  }, [samples]);
  const story = useMemo(() => planStory(doc), [doc]);
  useEffect(() => { document.title = `${story.title} · memoRABLE`; }, [story.title]);

  const play = async (file: File) => {
    setError(null);
    setReading(file.name);
    try {
      const raw = isPdfFile(file) ? (await readPdfFile(file)).text : await file.text();
      const r = importSource({ raw, label: file.name });
      if (!r.ok) throw new Error(r.errors[0]?.message ?? "This file couldn't be read.");
      setDoc(r.value);
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "This file couldn't be read.");
    } finally {
      setReading(null);
    }
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) void play(f); }}
    >
      <StoryView
        key={doc.contentHash}
        story={story}
        toolbar={
          <nav className="sd-bar-top" aria-label="Story">
            <b>memoRABLE</b>
            <Link href="/">Home</Link>
            {samples && (
              <button type="button" onClick={() => { const next = doc.contentHash === samples.paper.contentHash ? samples.brief : samples.paper; setDoc(next); window.scrollTo({ top: 0 }); }}>
                {doc.contentHash === samples.paper.contentHash ? "Sample brief" : "Sample paper"}
              </button>
            )}
            <button type="button" onClick={() => input.current?.click()}>
              Play your file
            </button>
            <button type="button" className="is-primary" onClick={() => window.print()}>Save as PDF</button>
            <input
              ref={input}
              type="file"
              accept=".pdf,.md,.markdown,.txt,.json,application/pdf,text/plain,application/json"
              hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void play(f); e.target.value = ""; }}
            />
          </nav>
        }
      />
      {(reading || error || dragging) && (
        <div className="sd-drop" role="status" aria-live="polite">
          <p>{reading ? `Reading ${reading} on this device…` : error ? error : "Drop it to play it as a story."}</p>
          {error && <button type="button" onClick={() => setError(null)}>Close</button>}
        </div>
      )}
    </div>
  );
}
