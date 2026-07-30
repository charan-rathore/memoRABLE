/**
 * Optional local persistence (reliability layer 4). Every storage access is
 * wrapped: any exception (private mode, quota, disabled storage) falls back
 * to in-memory behavior without surfacing an error to the user.
 */

const KEY = "memorable:last-document:v1";

export interface StoredDocumentRef {
  contentHash: string;
  savedAt: string;
}

export function safeLoadRef(): StoredDocumentRef | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDocumentRef>;
    if (typeof parsed.contentHash === "string" && typeof parsed.savedAt === "string") {
      return { contentHash: parsed.contentHash, savedAt: parsed.savedAt };
    }
    return null;
  } catch {
    return null;
  }
}

export function safeSaveRef(ref: StoredDocumentRef): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ref));
    return true;
  } catch {
    return false;
  }
}

export function safeClearRef(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* in-memory continues */
  }
}
