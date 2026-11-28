import { afterEach, describe, expect, it } from "vitest";
import { DailyEngine } from "@/daily/engine";
import { MemoryStore } from "@/daily/store";
import { isoWeek, mondayOf, weekLetter, ymd } from "@/letter/week";

// The letter is built in the reader's browser. These pin the process zone so
// the result does not depend on where CI runs.
const original = process.env.TZ;
const zone = (tz: string) => { process.env.TZ = tz; };
afterEach(() => { process.env.TZ = original; });

async function engineAt(iso: string) {
  let t = Date.parse(iso);
  const e = await DailyEngine.open({ workspaceId: "w", store: new MemoryStore(), now: () => new Date(t), deviceId: "t" });
  return { e, set: (next: string) => { t = Date.parse(next); }, now: () => new Date(t) };
}

describe("weeks follow the reader's calendar", () => {
  it("files a Monday 01:30 IST entry under Monday of that week, not last Sunday", async () => {
    zone("Asia/Kolkata");
    const { e, now } = await engineAt("2026-11-22T20:00:00Z"); // Mon 23 Nov 01:30 IST
    await e.record({ kind: "decided", text: "Decided to ship on Friday" });
    const v = weekLetter(e.workspace, now());
    expect(v.weekOf).toBe("2026-11-23");
    expect(v.weekEnd).toBe("2026-11-29");
    expect(v.week).toBe(48);
    expect(v.days).toEqual([1, 0, 0, 0, 0, 0, 0]);
    expect(v.decided[0]?.day).toBe("mon");
  });

  it("keeps the UTC result for a UTC reader", () => {
    zone("UTC");
    expect(ymd(mondayOf(new Date("2026-11-22T20:00:00Z")))).toBe("2026-11-16");
    expect(isoWeek(new Date("2026-11-22T20:00:00Z"))).toBe(47);
  });

  it("counts seven whole days across a DST change", async () => {
    zone("Europe/Berlin"); // clocks go back on Sun 25 Oct 2026
    const { e, set, now } = await engineAt("2026-10-19T08:00:00Z");
    await e.record({ kind: "worked", text: "Monday work" });
    set("2026-10-25T22:30:00Z"); // Sun 23:30 CET, after the change
    await e.record({ kind: "worked", text: "Sunday night work" });
    const v = weekLetter(e.workspace, now());
    expect(v.weekOf).toBe("2026-10-19");
    expect(v.weekEnd).toBe("2026-10-25");
    expect(v.days).toEqual([1, 0, 0, 0, 0, 0, 1]);
  });
});
