import { describe, expect, it } from "vitest";
import { DailyEngine } from "@/daily/engine";
import { DESIRED_RETENTION, initialState, intervalDays, retrievability, review } from "@/daily/fsrs";
import { project } from "@/daily/projection";
import { MemoryStore } from "@/daily/store";

const DAY = 86_400_000;

function clock(start = "2026-11-01T09:00:00.000Z") {
  let t = Date.parse(start);
  return { now: () => new Date(t), advance: (ms: number) => { t += ms; } };
}

async function engine() {
  const c = clock();
  const store = new MemoryStore();
  const e = await DailyEngine.open({ workspaceId: "w", store, now: c.now, deviceId: "t" });
  return { e, c, store };
}

describe("FSRS-5 model", () => {
  it("has 90% recall exactly one stability after review, decaying monotonically", () => {
    expect(retrievability(0, 5)).toBeCloseTo(1, 10);
    expect(retrievability(5, 5)).toBeCloseTo(0.9, 10);
    expect(retrievability(10, 5)).toBeLessThan(retrievability(6, 5));
    expect(intervalDays(7, 0.9)).toBeCloseTo(7, 10);
    expect(intervalDays(7, 0.8)).toBeGreaterThan(7);
  });

  it("grows stability on 'holds', grows it less on 'unsure', and cuts it on 'changed'", () => {
    const s0 = initialState("2026-11-01T00:00:00.000Z");
    const at = "2026-11-05T00:00:00.000Z";
    const good = review(s0, 3, at), hard = review(s0, 2, at), again = review(s0, 1, at);
    expect(good.stability).toBeGreaterThan(s0.stability);
    expect(hard.stability).toBeLessThan(good.stability);
    expect(again.stability).toBeLessThanOrEqual(s0.stability);
    expect(again.lapses).toBe(1);
    expect(hard.difficulty).toBeGreaterThan(good.difficulty);
    for (const s of [good, hard, again]) expect(s.difficulty).toBeGreaterThanOrEqual(1), expect(s.difficulty).toBeLessThanOrEqual(10);
  });

  it("produces expanding intervals for a decision that keeps holding", () => {
    let s = initialState("2026-01-01T00:00:00.000Z");
    let t = Date.parse(s.lastReview);
    const intervals: number[] = [];
    for (let i = 0; i < 4; i++) {
      t += intervalDays(s.stability) * DAY;
      s = review(s, 3, new Date(t).toISOString());
      intervals.push(intervalDays(s.stability));
    }
    for (let i = 1; i < intervals.length; i++) expect(intervals[i]!).toBeGreaterThan(intervals[i - 1]!);
  });
});

describe("daily engine: re-confirmation", () => {
  it("brings an approved decision back once predicted recall falls below target, never before", async () => {
    const { e, c } = await engine();
    const d = await e.record({ kind: "decided", text: "Decided to keep Postgres instead of DynamoDB" });
    expect(e.dueForReconfirm()).toEqual([]);
    c.advance(Math.ceil(intervalDays(d.memory!.stability)) * DAY + DAY);
    const due = e.dueForReconfirm();
    expect(due.map((x) => x.entryId)).toEqual([d.id]);
    expect(due[0]!.retrievability).toBeLessThan(DESIRED_RETENTION);
    expect(due[0]!.nextIfHolds).toBeGreaterThan(Math.round(intervalDays(d.memory!.stability)));
  });

  it("'holds' pushes the next check out; the entry leaves the due list", async () => {
    const { e, c } = await engine();
    const d = await e.record({ kind: "learned", text: "Learned: retries need idempotency keys" });
    c.advance(10 * DAY);
    expect(e.dueForReconfirm()).toHaveLength(1);
    const after = await e.reconfirm(d.id, "holds");
    expect(after.memory!.reviews).toBe(1);
    expect(e.dueForReconfirm()).toEqual([]);
    expect(Date.parse(e.nextReconfirmAt()!)).toBeGreaterThan(c.now().getTime() + 7 * DAY);
  });

  it("'changed' reopens a decision so it stops looking authoritative", async () => {
    const { e, c } = await engine();
    const d = await e.record({ kind: "decided", text: "Decided to cache sessions in Redis" });
    c.advance(5 * DAY);
    const after = await e.reconfirm(d.id, "changed");
    expect(after.status).toBe("unresolved");
    expect(after.statusBasis).toBe("you said it no longer holds");
    expect(e.next().map((p) => p.entryId)).toContain(d.id);
  });

  it("never resurfaces superseded entries, tasks or open proposals", async () => {
    const { e, c } = await engine();
    const old = await e.record({ kind: "decided", text: "Decided to use REST" });
    await e.record({ kind: "decided", text: "Decided to use gRPC instead", supersedes: old.id });
    await e.record({ kind: "task", text: "Write the migration" });
    await e.record({ kind: "decided", text: "Should we shard the users table?" });
    c.advance(60 * DAY);
    const due = e.dueForReconfirm(10).map((x) => e.entry(x.entryId)!.text);
    expect(due).toEqual(["Decided to use gRPC instead"]);
    await expect(e.reconfirm(old.id, "holds")).rejects.toThrow(/replaced/);
  });

  it("rebuilds identical memory state from the event log", async () => {
    const { e, c, store } = await engine();
    const d = await e.record({ kind: "decided", text: "Decided to pin Node 22" });
    c.advance(4 * DAY);
    await e.reconfirm(d.id, "unsure");
    expect(project("w", await store.load("w")).entries.get(d.id)!.memory).toEqual(e.entry(d.id)!.memory);
  });
});

describe("daily engine: as-of views", () => {
  it("answers what was in force at a past time, including later supersession", async () => {
    const { e, c } = await engine();
    const rest = await e.record({ kind: "decided", text: "Decided to expose a REST API" });
    c.advance(3 * DAY);
    const mid = c.now();
    c.advance(3 * DAY);
    const grpc = await e.record({ kind: "decided", text: "Decided to move to gRPC", supersedes: rest.id });

    const then = await e.asOf(mid);
    expect(then.entries.get(rest.id)!.status).not.toBe("superseded");
    expect(then.entries.has(grpc.id)).toBe(false);

    const now = await e.asOf(c.now());
    expect(now.entries.get(rest.id)!.supersededBy).toBe(grpc.id);
    expect(now.entries.get(rest.id)!.supersededAt).toBe(c.now().toISOString());
  });

  it("keeps deleted entries out of every past view", async () => {
    const { e, c } = await engine();
    const secret = await e.record({ kind: "learned", text: "Learned the staging password is hunter2" });
    const before = c.now();
    c.advance(DAY);
    await e.delete(secret.id);
    const past = await e.asOf(before);
    expect(past.entries.has(secret.id)).toBe(false);
    expect(JSON.stringify([...past.entries.values()])).not.toContain("hunter2");
  });
});
