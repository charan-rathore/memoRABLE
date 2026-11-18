import type { LetterValues } from "./week";

/** One real-feeling week from the demo workspace: the template's example, the README's screenshots. */
export const sampleWeek: LetterValues = {
  owner: "charan",
  weekOf: "2026-11-16",
  weekEnd: "2026-11-22",
  week: 47,
  appUrl: "https://memo-rable.vercel.app",
  worked: 11,
  tasksDone: 4,
  decided: [
    {
      handle: "k2x9q1",
      text: "Cache search results in Redis for 10 minutes",
      day: "mon",
      replacedBy: "p7d3la",
      replacedText: "Cache in Edge Config instead of Redis",
    },
    { handle: "p7d3la", text: "Cache in Edge Config instead of Redis", day: "tue" },
    { handle: "m4q8rz", text: "Pin Node 22 in CI until require(esm) is handled", day: "wed" },
    { handle: "b1c6tw", text: "Generate OpenAPI types at build time, not by hand", day: "fri" },
  ],
  learned: [
    { handle: "h5n2ve", text: "Redis round trips cost 40 ms from the edge" },
    { handle: "w8a1sk", text: "revalidateTag only purges the Data Cache" },
  ],
  days: [3, 5, 2, 4, 3, 0, 1],
  recheck: {
    handle: "r3v7ye",
    text: "Keep Postgres instead of moving to DynamoDB",
    kind: "decided",
    recordedOn: "2026-10-29",
    recall: 74,
    reviews: 1,
    nextIfHolds: 23,
  },
  alsoDue: 2,
};
