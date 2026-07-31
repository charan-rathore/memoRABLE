/**
 * Recent documents remembered in this browser for 7 days.
 * Source text stays local — never uploaded.
 */

const KEY = "memorable.library.v1";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 24;

export interface LibraryDoc {
  id: string;
  title: string;
  label: string;
  sourceText: string;
  savedAt: number;
}

function readAll(): LibraryDoc[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed
      .filter((item): item is LibraryDoc => {
        if (typeof item !== "object" || item === null) return false;
        const d = item as Partial<LibraryDoc>;
        return (
          typeof d.id === "string" &&
          typeof d.title === "string" &&
          typeof d.label === "string" &&
          typeof d.sourceText === "string" &&
          typeof d.savedAt === "number" &&
          now - d.savedAt < TTL_MS
        );
      })
      .sort((a, b) => b.savedAt - a.savedAt)
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

function writeAll(docs: LibraryDoc[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(docs.slice(0, MAX_ENTRIES)));
  } catch {
    /* private mode / quota — silent */
  }
}

export function listLibraryDocs(): LibraryDoc[] {
  const docs = readAll();
  writeAll(docs); // prune expired on read
  return docs;
}

export function searchLibraryDocs(query: string): LibraryDoc[] {
  const q = query.trim().toLowerCase();
  const docs = listLibraryDocs();
  if (!q) return docs;
  return docs.filter(
    (d) =>
      d.title.toLowerCase().includes(q) ||
      d.label.toLowerCase().includes(q) ||
      d.sourceText.toLowerCase().includes(q.slice(0, 80)),
  );
}

export function rememberLibraryDoc(input: {
  title: string;
  label: string;
  sourceText: string;
}): LibraryDoc {
  const docs = listLibraryDocs().filter(
    (d) => d.label !== input.label && d.sourceText !== input.sourceText,
  );
  const entry: LibraryDoc = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title: input.title.slice(0, 200) || "Untitled",
    label: input.label.slice(0, 120) || "Untitled",
    sourceText: input.sourceText.slice(0, 1_048_576),
    savedAt: Date.now(),
  };
  writeAll([entry, ...docs]);
  return entry;
}
