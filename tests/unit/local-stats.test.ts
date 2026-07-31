// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  EMPTY_STATS,
  readStats,
  recordDocument,
  recordPublished,
  summarize,
} from "@/stats/local-stats";

describe("the local tally", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("starts empty", () => {
    expect(readStats()).toEqual(EMPTY_STATS);
  });

  it("counts documents and the memories made from them", () => {
    recordDocument(6);
    recordDocument(4);

    const stats = readStats();
    expect(stats.documents).toBe(2);
    expect(stats.memories).toBe(10);
    expect(stats.since).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("counts trips through publish separately", () => {
    recordDocument(6);
    recordPublished();
    recordPublished();

    expect(readStats().published).toBe(2);
  });

  it("keeps the first-seen day once it is set", () => {
    const first = recordDocument(6).since;
    recordDocument(6);
    expect(readStats().since).toBe(first);
  });

  it("survives a corrupted store rather than throwing", () => {
    window.localStorage.setItem("memorable.stats.v1", "{not json");
    expect(readStats()).toEqual(EMPTY_STATS);
  });

  it("ignores values of the wrong shape", () => {
    window.localStorage.setItem(
      "memorable.stats.v1",
      JSON.stringify({ documents: "many", memories: -3, published: null, since: 7 }),
    );
    expect(readStats()).toEqual(EMPTY_STATS);
  });

  describe("as a sentence", () => {
    it("says nothing on a first visit — three zeros are worse than silence", () => {
      expect(summarize(EMPTY_STATS)).toBeNull();
    });

    it("counts in singular where singular is right", () => {
      expect(summarize({ documents: 1, memories: 1, published: 0, since: null })).toBe(
        "1 document remembered · 1 memory",
      );
    });

    it("mentions publishing only once something has been published", () => {
      expect(summarize({ documents: 3, memories: 18, published: 0, since: null })).toBe(
        "3 documents remembered · 18 memories",
      );
      expect(summarize({ documents: 3, memories: 18, published: 2, since: null })).toBe(
        "3 documents remembered · 18 memories · 2 published",
      );
    });
  });
});
