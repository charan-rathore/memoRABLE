/**
 * Runtime capability detection. Nothing here throws; unsupported features
 * degrade honestly (e.g. file open falls back to paste).
 */

export interface Capabilities {
  fileOpen: boolean;
  clipboardRead: boolean;
  clipboardWrite: boolean;
  downloads: boolean;
  storage: boolean;
  touch: boolean;
}

export function detectCapabilities(): Capabilities {
  if (typeof window === "undefined") {
    return {
      fileOpen: false,
      clipboardRead: false,
      clipboardWrite: false,
      downloads: false,
      storage: false,
      touch: false,
    };
  }
  let storage = false;
  try {
    const probe = "__memorable_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    storage = true;
  } catch {
    storage = false;
  }
  return {
    fileOpen: typeof window !== "undefined" && "FileReader" in window,
    clipboardRead: typeof navigator !== "undefined" && !!navigator.clipboard?.readText,
    clipboardWrite: typeof navigator !== "undefined" && !!navigator.clipboard?.writeText,
    downloads: typeof URL !== "undefined" && typeof URL.createObjectURL === "function",
    storage,
    touch: typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches === true,
  };
}
