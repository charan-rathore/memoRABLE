import { describe, expect, it } from "vitest";
import { parseTimelineLine } from "@/import/text/patterns";
import { importSource } from "@/import/import-source";
import { renderBundle } from "@/render/render-bundle";

describe("table repair preserves existing trailing state", () => {
  it.each([
    ["done", "done"],
    ["shipped", "shipped"],
    ["in progress", "on-track"],
    ["complete", "done"],
    ["released", "shipped"],
  ])("keeps dash suffix %s without a closing pipe", (status, state) => {
    const raw = `| Build | November 14, 2026 | - ${status}`;
    expect(parseTimelineLine(raw)?.state).toBe(state);
  });

  it("keeps parenthesized status without a closing pipe", () => {
    expect(parseTimelineLine("| Build | November 14, 2026 | (done)")?.state).toBe("done");
  });

  it("does not reinterpret a status before a closing pipe", () => {
    expect(parseTimelineLine("| Build | November 14, 2026 | done |")?.state).toBe("planned");
  });
});

describe("date count requires complete tokens", () => {
  it.each(["Marketing", "Marching", "Novemberish"])("ignores month substrings in %s", (title) => {
    expect(parseTimelineLine(`| 1 | ${title} | November 14, 2026 |`)).toMatchObject({
      date: "November 14, 2026",
      title: `1 - ${title}`,
      state: "planned",
    });
  });

  it("still declines an additional actual date", () => {
    const raw = "| 1 | Due November 1, 2026 | November 14, 2026 |";
    expect(parseTimelineLine(raw)?.title).toContain("|");
  });
});

it("preserves repaired date, title and state through import and all output modes", () => {
  const raw = "# Release Plan\n\n## Timeline\n\n| 1 | Marketing | November 14, 2026 | - shipped\n";
  const result = importSource({ raw, label: "release-plan.md" });
  expect(result.ok).toBe(true);
  if (!result.ok) return;

  const timeline = result.value.blocks.find((block) => block.kind === "timeline");
  expect(timeline?.payload).toMatchObject({
    entries: expect.arrayContaining([
      expect.objectContaining({
        date: "November 14, 2026",
        title: "1 - Marketing",
        state: "shipped",
      }),
    ]),
  });

  const bundle = renderBundle(result.value);
  for (const mode of ["web", "email", "document"] as const) {
    expect(bundle.outputs[mode].error).toBeNull();
    expect(bundle.outputs[mode].html).toContain("Marketing");
    expect(bundle.outputs[mode].html).toContain("November 14, 2026");
  }
});
