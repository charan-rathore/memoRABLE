/**
 * Read a text file, reporting real progress.
 *
 * The percentage comes from FileReader's own `loaded/total` — never from a
 * timed ramp. A ramp that has to be slowed down to be seen is not feedback, it
 * is theatre, and it becomes a lie the moment a file is large enough to
 * disagree with the clock.
 *
 * Most local files finish inside a single frame, and a bar that flashes in and
 * out is worse than no bar at all. So the indicator is withheld until the read
 * has actually been outstanding for `revealAfterMs`; below that threshold the
 * caller is told nothing and shows nothing. Once shown it stays for
 * `minVisibleMs`, which is what stops a 40ms blink at the far end.
 */

export interface FileReadResult {
  text: string;
  bytes: number;
}

export interface ReadProgress {
  /** 0–100, from bytes actually read. */
  percent: number;
  /** False until the read has been slow enough to be worth reporting. */
  visible: boolean;
}

export interface ReadOptions {
  /** Nothing is shown before this; below it, the read reads as instant. */
  revealAfterMs?: number;
  /** Once shown, hold at least this long so it cannot blink. */
  minVisibleMs?: number;
}

export function readTextFileWithProgress(
  file: File,
  onProgress: (progress: ReadProgress) => void,
  options: ReadOptions = {},
): Promise<FileReadResult> {
  const revealAfterMs = options.revealAfterMs ?? 300;
  const minVisibleMs = options.minVisibleMs ?? 300;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const started = now();
    let percent = 0;
    let text: string | null = null;
    let done = false;
    let revealedAt: number | null = null;
    let frame = 0;

    const stop = () => {
      if (frame) cancelRaf(frame);
      frame = 0;
    };

    const tick = () => {
      const elapsed = now() - started;
      // Decided on elapsed time alone: a read that has already finished inside
      // the threshold is exactly the one that should never have been announced.
      if (revealedAt === null && elapsed >= revealAfterMs) revealedAt = elapsed;
      if (revealedAt !== null) onProgress({ percent, visible: true });

      if (done) {
        // Either it was never slow enough to show, or it has been shown long
        // enough to have been read.
        const held = revealedAt === null || elapsed - revealedAt >= minVisibleMs;
        if (held) {
          stop();
          resolve({ text: text ?? "", bytes: file.size });
          return;
        }
      }
      frame = raf(tick);
    };

    reader.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        percent = Math.max(0, Math.min(100, (event.loaded / event.total) * 100));
      }
    };
    reader.onload = () => {
      text = typeof reader.result === "string" ? reader.result : "";
      percent = 100;
      done = true;
    };
    reader.onerror = () => {
      stop();
      reject(reader.error ?? new Error("The file could not be read."));
    };
    reader.onabort = () => {
      stop();
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
