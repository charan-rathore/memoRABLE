/**
 * Download helpers: sanitized filenames, prompt object-URL revocation, and
 * a clipboard fallback when Blob downloads are unavailable.
 */

export interface DownloadRequest {
  filename: string;
  content: string;
  mimeType: string;
}

export type DownloadOutcome =
  | { ok: true; via: "download" }
  | { ok: true; via: "clipboard" }
  | { ok: false; error: string };

/** Conservative filename: basename only, safe characters, length-capped. */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  const cleaned = base
    .replace(/[\x00-\x1f<>:"|?*]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9._-]/g, "")
    .replace(/^[.]+/, "")
    .slice(0, 80);
  return cleaned.length > 0 ? cleaned : "memorable-output";
}

export function downloadTextFile(request: DownloadRequest): DownloadOutcome {
  const filename = sanitizeFilename(request.filename);
  if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
    let url: string | null = null;
    try {
      const blob = new Blob([request.content], { type: request.mimeType });
      url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      return { ok: true, via: "download" };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      if (url) {
        // Revoke promptly: the download has already been initiated.
        setTimeout(() => URL.revokeObjectURL(url as string), 1000);
      }
    }
  }
  return { ok: false, error: "Downloads are not available in this browser." };
}

/** Clipboard fallback offered when a Blob download fails. */
export async function copyToClipboard(content: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(content);
    return true;
  } catch {
    return false;
  }
}

export function baseNameFor(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "memorable";
}
