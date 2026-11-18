import type { Metadata } from "next";
import { importSource } from "@/import/import-source";
import { ATLAS_JSON_SOURCE } from "@/import/examples/catalog";
import { StoryPage } from "@/story/story-page";

export const metadata: Metadata = {
  title: "A document, as a story · memoRABLE",
  description: "Any brief, report or set of notes, parsed into memories and told as a story you scroll through.",
};

/** Opens on the Atlas brief; the workbench's "Play as a story" hands over whatever was imported. */
export default function Page() {
  const result = importSource({ raw: ATLAS_JSON_SOURCE, label: "atlas-q3-brief.json" });
  if (!result.ok) throw new Error(`Atlas fixture failed to import: ${result.errors.map((e) => e.message).join("; ")}`);
  return <StoryPage example={result.value} />;
}
