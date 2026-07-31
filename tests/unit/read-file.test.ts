// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { formatBytes, readTextFileWithProgress, type ReadProgress } from "@/components/import/read-file";

function fileOf(text: string, name = "brief.md"): File {
  return new File([text], name, { type: "text/markdown" });
}

describe("reading a file with progress", () => {
  it("returns the text and the byte count", async () => {
    const text = "# Quarterly brief\n\n## Signals\n- ARR: $4.2M";
    const result = await readTextFileWithProgress(fileOf(text), () => {}, { revealAfterMs: 0, minVisibleMs: 0 });

    expect(result.text).toBe(text);
    expect(result.bytes).toBe(new Blob([text]).size);
  });

  it("shows nothing for a read that finishes before the reveal threshold", async () => {
    const seen: ReadProgress[] = [];
    // A threshold no local read of a few bytes can cross.
    await readTextFileWithProgress(fileOf("notes"), (progress) => seen.push(progress), {
      revealAfterMs: 10_000,
      minVisibleMs: 0,
    });

    // Not "reported 0%" — reported nothing at all. A bar that flashes in and
    // out is worse than the pause it was trying to explain.
    expect(seen).toEqual([]);
  });

  it("reports progress once the read has been outstanding long enough", async () => {
    const seen: ReadProgress[] = [];
    await readTextFileWithProgress(fileOf("notes"), (progress) => seen.push(progress), {
      revealAfterMs: 0,
      minVisibleMs: 0,
    });

    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((p) => p.visible)).toBe(true);
    expect(seen.at(-1)?.percent).toBe(100);
  });

  it("holds a revealed indicator long enough to be read", async () => {
    const started = Date.now();
    await readTextFileWithProgress(fileOf("notes"), () => {}, { revealAfterMs: 0, minVisibleMs: 120 });

    expect(Date.now() - started).toBeGreaterThanOrEqual(110);
  });

});

describe("formatBytes", () => {
  it("scales the unit to the size", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.00 MB");
  });
});
