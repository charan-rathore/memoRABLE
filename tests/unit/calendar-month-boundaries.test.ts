import { describe, expect, it } from "vitest";
import { importSource } from "@/import/import-source";
import { parseTimelineLine } from "@/import/text/patterns";

const boundaries: Array<[string, number]> = [
  ["January", 31], ["February", 28], ["March", 31], ["April", 30],
  ["May", 31], ["June", 30], ["July", 31], ["August", 31],
  ["September", 30], ["October", 31], ["November", 30], ["December", 31],
];
function timelineDates(line: string): string[] {
  const result = importSource({ raw: `# Launch\n\n## Timeline\n- ${line}\n`, label: "calendar.md" });
  if (!result.ok) throw new Error("calendar fixture import failed");
  const block = result.value.blocks.find((block) => block.kind === "timeline");
  return block && "entries" in block.payload ? block.payload.entries.map((entry) => "date" in entry ? String(entry.date) : "") : [];
}

describe("calendar boundaries through the public parser and actual import", () => {
  for (const [month, lastDay] of boundaries) {
    it(`${month} accepts its last day and rejects the following day in both named forms`, () => {
      for (const date of [`${lastDay} ${month} 2026`, `${month} ${lastDay}, 2026`]) {
        expect(parseTimelineLine(`Ship launch by ${date}.`)?.date).toBe(date);
        expect(timelineDates(`Ship launch by ${date}.`)).toContain(date);
      }
      for (const date of [`${lastDay + 1} ${month} 2026`, `${month} ${lastDay + 1}, 2026`]) {
        expect(parseTimelineLine(`Ship launch by ${date}.`)?.date).not.toBe(date);
        expect(timelineDates(`Ship launch by ${date}.`)).not.toContain(date);
      }
    });
  }
  it.each([[1900, false], [2000, true], [2024, true], [2026, false], [2028, true]])("February29 leap-year control %s", (year, valid) => {
    const date = `29 February ${year}`;
    expect(parseTimelineLine(`Ship launch by ${date}.`)?.date === date).toBe(valid);
    expect(timelineDates(`Ship launch by ${date}.`).includes(date)).toBe(valid);
  });
});
