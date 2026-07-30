// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { baseNameFor, copyToClipboard, downloadTextFile, sanitizeFilename } from "@/utils/download";

describe("sanitizeFilename", () => {
  it("keeps safe names", () => {
    expect(sanitizeFilename("q3-board-report.html")).toBe("q3-board-report.html");
  });

  it("strips path traversal and unsafe characters", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("..\\..\\win\\system32")).toBe("system32");
    expect(sanitizeFilename('a<b>:"|?*.html')).toBe("ab.html");
    expect(sanitizeFilename("my report final v2.json")).toBe("my-report-final-v2.json");
  });

  it("never returns an empty or dotfile name", () => {
    expect(sanitizeFilename("...")).toBe("memorable-output");
    expect(sanitizeFilename("")).toBe("memorable-output");
    expect(sanitizeFilename(".hidden")).toBe("hidden");
  });
});

describe("downloadTextFile", () => {
  it("creates and promptly revokes an object URL", () => {
    const createUrl = vi.fn(() => "blob:mock");
    const revokeUrl = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL: createUrl, revokeObjectURL: revokeUrl });
    vi.useFakeTimers();
    const result = downloadTextFile({ filename: "report.html", content: "<html></html>", mimeType: "text/html" });
    expect(result.ok).toBe(true);
    expect(createUrl).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1500);
    expect(revokeUrl).toHaveBeenCalledWith("blob:mock");
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});

describe("copyToClipboard fallback", () => {
  it("returns false when the clipboard rejects", async () => {
    Object.assign(navigator, {
      clipboard: { writeText: () => Promise.reject(new Error("denied")) },
    });
    expect(await copyToClipboard("x")).toBe(false);
  });
});

describe("baseNameFor", () => {
  it("slugs titles and falls back safely", () => {
    expect(baseNameFor("Q3 Board Report")).toBe("q3-board-report");
    expect(baseNameFor("!!!")).toBe("memorable");
  });
});
