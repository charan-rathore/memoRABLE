/**
 * A fraction in a quantity is not a calendar date.
 *
 * "1/2 cup moong dal" made two phantom timeline entries dated "1/2" — the
 * recipe suddenly had a schedule on January 2nd that nobody planned. A
 * month/day reading must yield when the number is measuring something:
 * followed by a unit ("1/2 cup", "1/2 tsp") or completing a mixed number
 * ("2 1/2 hours").
 */
import { describe, expect, it } from "vitest";
import { importSource } from "@/import/import-source";

const recipe = `# Masala Khichdi

Serves 3. Prep 10 minutes, cook 25 minutes.

## Ingredients
- 1 cup rice, 1/2 cup moong dal, rinsed
- 1 tsp cumin, 1/2 tsp turmeric, salt to taste

## Steps
1. Heat ghee, splutter cumin, soften onion for 3 minutes
2. Add rice, dal, turmeric, salt, and 4 cups water
`;

describe("fractions in quantities", () => {
  it("creates no timeline entry from a measured fraction", () => {
    const result = importSource({ raw: recipe, label: "recipe.md" });
    if (!result.ok) throw new Error("import failed");
    const timeline = result.value.blocks.find((b) => b.kind === "timeline");
    const entries = (timeline?.payload as { entries?: Array<{ date: string }> } | undefined)?.entries ?? [];
    expect(entries.some((e) => /^\d{1,2}\/\d{1,2}$/.test(e.date))).toBe(false);
  });

  it("keeps the ingredient lines intact as kept text", () => {
    const result = importSource({ raw: recipe, label: "recipe.md" });
    if (!result.ok) throw new Error("import failed");
    const snapshot = result.value.blocks.find((b) => b.kind === "snapshot");
    const notes = (snapshot?.payload as { notes?: string[] } | undefined)?.notes ?? [];
    expect(notes.some((n) => /1\/2 cup moong dal/.test(n))).toBe(true);
  });

  it("still reads a real numeric date in the same document", () => {
    const doc = `# Dinner Plan\n\n- Groceries on 10/24, cook 10/25 evening\n- 1/2 kg paneer for the main dish\n`;
    const result = importSource({ raw: doc, label: "plan.md" });
    if (!result.ok) throw new Error("import failed");
    const timeline = result.value.blocks.find((b) => b.kind === "timeline");
    const entries = (timeline?.payload as { entries?: Array<{ date: string; title: string }> } | undefined)?.entries ?? [];
    expect(entries.some((e) => e.date === "10/24")).toBe(true);
    expect(entries.some((e) => /^\d{1,2}\/\d{1,2}$/.test(e.date) && /paneer/.test(e.title))).toBe(false);
  });

  it("treats a mixed number as quantity, not a date", () => {
    const doc = `# Bread Notes\n\n- Autolyse 2 1/2 hours before shaping the loaf\n- Bake at 230 C for 35 minutes\n`;
    const result = importSource({ raw: doc, label: "bread.md" });
    if (!result.ok) throw new Error("import failed");
    const timeline = result.value.blocks.find((b) => b.kind === "timeline");
    const entries = (timeline?.payload as { entries?: Array<{ date: string }> } | undefined)?.entries ?? [];
    expect(entries.some((e) => /1\/2/.test(e.date))).toBe(false);
  });
});
