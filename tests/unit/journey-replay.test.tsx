// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { journeyOf } from "@/components/journey-strip";
import { initialWorkbenchState, workbenchReducer } from "@/components/workbench-state";
import { useReplay } from "@/components/replay/use-replay";
import { importSource } from "@/import/import-source";
import { renderBundle } from "@/render/render-bundle";
import { ATLAS_JSON_SOURCE } from "@/import/examples/catalog";
import type { Diagnostic } from "@/reliability/diagnostics";

function initialState() {
  const result = importSource({ raw: ATLAS_JSON_SOURCE, label: "atlas-q3-brief.json" });
  if (!result.ok) throw new Error("import failed");
  return initialWorkbenchState({
    sourceText: ATLAS_JSON_SOURCE,
    sourceLabel: "atlas-q3-brief.json",
    document: result.value,
    outputs: renderBundle(result.value).outputs,
    at: "preloaded",
  });
}

describe("journeyOf", () => {
  it("reflects the completed preloaded journey", () => {
    const steps = journeyOf(initialState(), null, null);
    expect(steps.map((s) => s.label)).toEqual([
      "Bring information",
      "Understand",
      "Remember",
      "Arrange",
      "Publish",
    ]);
    expect(steps[0]!.status).toBe("done");
    expect(steps[2]!.lines.some((l) => l.includes("6 grounded memories"))).toBe(true);
  });

  it("surfaces the error state without hiding memories", () => {
    const errors: Diagnostic[] = [{ code: "json.syntax", message: "x" }];
    const failed = workbenchReducer(initialState(), {
      type: "importFailed",
      sourceText: "{",
      sourceLabel: "bad.json",
      errors,
    });
    const steps = journeyOf(failed, null, null);
    expect(steps[1]!.status).toBe("error");
    expect(steps[1]!.lines.some((l) => /errors kept|failed/i.test(l))).toBe(true);
    expect(steps[2]!.lines.some((l) => l.includes("6 grounded memories"))).toBe(true);
  });
});

describe("useReplay", () => {
  function callbacks() {
    return {
      runRealImport: vi.fn(),
      setMode: vi.fn(),
      snapshot: vi.fn(),
      restore: vi.fn(),
      announce: vi.fn(),
    };
  }

  it("runs the staged 20-second timeline with the real import at Understand", () => {
    vi.useFakeTimers();
    const cb = callbacks();
    const { result } = renderHook(() => useReplay(cb, false));
    act(() => result.current.start());
    expect(cb.snapshot).toHaveBeenCalledOnce();
    expect(result.current.view?.phase).toBe("intro");

    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.view?.phase).toBe("bring");

    act(() => vi.advanceTimersByTime(4000));
    expect(result.current.view?.phase).toBe("understand");
    expect(cb.runRealImport).toHaveBeenCalledOnce(); // real pipeline, not a demo renderer

    act(() => vi.advanceTimersByTime(1200));
    expect(result.current.view?.revealCount).toBeGreaterThan(0);

    act(() => vi.advanceTimersByTime(4400));
    expect(result.current.view?.phase).toBe("arrange");

    act(() => vi.advanceTimersByTime(3500));
    expect(cb.setMode).toHaveBeenCalledWith("email");

    act(() => vi.advanceTimersByTime(4000)); // past 20s total
    expect(result.current.view).toBeNull();
    expect(cb.restore).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("cancel restores state and stops timers", () => {
    vi.useFakeTimers();
    const cb = callbacks();
    const { result } = renderHook(() => useReplay(cb, false));
    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(5000));
    act(() => result.current.cancel());
    expect(result.current.view).toBeNull();
    expect(cb.restore).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(20000));
    expect(cb.setMode).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("reduced motion applies the whole story at once without autoplay", () => {
    vi.useFakeTimers();
    const cb = callbacks();
    const { result } = renderHook(() => useReplay(cb, true));
    act(() => result.current.start());
    expect(cb.runRealImport).toHaveBeenCalledOnce();
    expect(result.current.view?.phase).toBe("publish");
    expect(result.current.view?.message).toBe("One memory. Three useful outputs.");
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.view).toBeNull();
    vi.useRealTimers();
  });
});
