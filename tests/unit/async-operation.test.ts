import { describe, expect, it } from "vitest";
import { createAsyncOperation } from "@/components/async-operation";

describe("async document ownership", () => {
  it("invalidates A when B starts, even if A ignores cancellation", async () => {
    const work = createAsyncOperation();
    let resolve!: () => void;
    const delayed = new Promise<void>((done) => { resolve = done; });
    const a = work.begin();
    let document = "A";
    const pending = delayed.then(() => { if (a.isCurrent()) document = "old A result"; });
    const b = work.begin();
    document = "B";
    resolve();
    await pending;
    expect(document).toBe("B");
    expect(a.signal.aborted).toBe(true);
    expect(a.isCurrent()).toBe(false);
    expect(b.isCurrent()).toBe(true);
  });
  it("invalidates work on source edit or unmount", () => {
    const work = createAsyncOperation();
    const a = work.begin();
    work.cancel();
    expect(a.signal.aborted).toBe(true);
    expect(a.isCurrent()).toBe(false);
    expect(work.begin().isCurrent()).toBe(true);
  });
});
