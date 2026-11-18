/**
 * Handing a parsed document to the story page. It stays in this tab's
 * sessionStorage: nothing is uploaded, and a reload keeps the story.
 */
import { memoryDocumentSchema, type MemoryDocument } from "@/domain/memory/schema";

export const STORY_KEY = "memorable.story.v1";

export function saveForStory(doc: MemoryDocument): boolean {
  try { window.sessionStorage.setItem(STORY_KEY, JSON.stringify(doc)); return true; } catch { return false; }
}

/** The handed-over document, only if it still matches the schema. */
export function loadForStory(): MemoryDocument | null {
  try {
    const raw = window.sessionStorage.getItem(STORY_KEY);
    if (!raw) return null;
    const parsed = memoryDocumentSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
