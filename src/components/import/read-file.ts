/**
 * Read a text file, reporting progress.
 *
 * A local file usually finishes in a few milliseconds, so raw FileReader
 * progress would jump straight to 100% and read as a flicker rather than
 * feedback. The reported percentage is therefore paced by a clock as well as
 * by the read: it never outruns elapsed time against `minDurationMs`, and
 * never overstates how much has actually been read.
 */

export interface FileReadResult {
  text: string;
  bytes: number;
}

export function readTextFileWithProgress(
  file: File,
  onProgress: (percent: number) => void,
  minDurationMs = 520,
): Promise<FileReadResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const started = now();
    let readPercent = 0;
    let finished = false;
    let frame = 0;

    const paced = () => {
      const elapsed = now() - started;
      const clock = minDurationMs <= 0 ? 100 : (elapsed / minDurationMs) * 100;
      return Math.max(0, Math.min(100, Math.min(readPercent, clock)));
    };

    const tick = () => {
      const percent = paced();
      onProgress(percent);
      if (finished && percent >= 100) {
        cancel();
        resolve({ text: text ?? "", bytes: file.size });
        return;
      }
      frame = raf(tick);
    };

    const cancel = () => {
      if (frame) cancelRaf(frame);
      frame = 0;
    };

    let text: string | null = null;

    reader.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        readPercent = (event.loaded / event.total) * 100;
      }
    };
    reader.onload = () => {
      text = typeof reader.result === "string" ? reader.result : "";
      readPercent = 100;
      finished = true;
    };
    reader.onerror = () => {
      cancel();
      reject(reader.error ?? new Error("The file could not be read."));
    };
    reader.onabort = () => {
      cancel();
      reject(new Error("Reading was cancelled."));
    };

    reader.readAsText(file);
    frame = raf(tick);
  });
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function raf(callback: () => void): number {
  if (typeof requestAnimationFrame === "function") return requestAnimationFrame(callback);
  return setTimeout(callback, 16) as unknown as number;
}

function cancelRaf(handle: number): void {
  if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(handle);
  else clearTimeout(handle);
}

/** Human file size for the progress caption. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
