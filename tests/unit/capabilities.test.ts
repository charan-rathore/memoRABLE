// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detectCapabilities } from "@/reliability/capabilities";

describe("runtime capability detection", () => {
  let localStorageDescriptor: PropertyDescriptor | undefined;
  let matchMediaDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    localStorageDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
    matchMediaDescriptor = Object.getOwnPropertyDescriptor(window, "matchMedia");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (localStorageDescriptor) {
      Object.defineProperty(window, "localStorage", localStorageDescriptor);
    }
    if (matchMediaDescriptor) {
      Object.defineProperty(window, "matchMedia", matchMediaDescriptor);
    }
  });

  it("returns false for every capability when window is unavailable", () => {
    vi.stubGlobal("window", undefined);
    expect(detectCapabilities()).toEqual({
      fileOpen: false,
      clipboardRead: false,
      clipboardWrite: false,
      downloads: false,
      storage: false,
      touch: false,
    });
  });

  it("contains a failing storage probe without changing other capability results", () => {
    const available = detectCapabilities();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("storage disabled");
      },
    });
    const detected = detectCapabilities();
    expect(detected.storage).toBe(false);
    expect(detected.fileOpen).toBe(available.fileOpen);
    expect(detected.clipboardRead).toBe(available.clipboardRead);
    expect(detected.clipboardWrite).toBe(available.clipboardWrite);
    expect(detected.downloads).toBe(available.downloads);
  });

  it("maps a coarse pointer media query to touch support", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn((query: string) => ({ matches: query === "(pointer: coarse)" })),
    });
    expect(detectCapabilities().touch).toBe(true);
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({ matches: false })),
    });
    expect(detectCapabilities().touch).toBe(false);
  });
});
