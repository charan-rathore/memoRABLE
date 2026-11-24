import { describe, expect, it } from "vitest";
import { importSource } from "@/import/import-source";
import { stripEmphasis } from "@/import/text/patterns";

function doc(raw: string) {
  const r = importSource({ raw, label: "d.md" });
  if (!r.ok) throw new Error("import failed");
  return r.value;
}
function entries(d: ReturnType<typeof doc>, kind: string) {
  const b = d.blocks.find((x) => x.kind === kind);
  return ((b?.payload as { entries?: Array<Record<string, unknown>> })?.entries) ?? [];
}

describe("inline markdown links collapse to their text like other emphasis", () => {
  it("strips link syntax from a task", () => {
    const d = doc("# T\n\n## Action Items\n- [ ] Review [the spec](https://example.com/spec) with Sam\n");
    expect(entries(d, "actions").map((e) => e.task)).toEqual(["Review the spec with Sam"]);
  });

  it("strips link syntax from a decision and a risk", () => {
    const d = doc("# T\n\n## Decisions\n- Use [Postgres](https://postgresql.org) for the store\n\n## Risks\n- [Vendor](https://vendor.example) may slip\n");
    expect(entries(d, "decisions").map((e) => e.text)).toEqual(["Use Postgres for the store"]);
    expect(entries(d, "risks").map((e) => e.risk)).toEqual(["Vendor may slip"]);
  });

  it("stripEmphasis collapses links and images to their text", () => {
    expect(stripEmphasis("Review [the spec](https://example.com/spec) now")).toBe("Review the spec now");
    expect(stripEmphasis("See [the guide](https://example.com/g \"title\")")).toBe("See the guide");
    expect(stripEmphasis("![diagram](https://example.com/d.png) overview")).toBe("diagram overview");
    expect(stripEmphasis("Link [with parens](https://example.com/a_(b)) end")).toBe("Link with parens end");
    expect(stripEmphasis("Bare https://example.com stays")).toBe("Bare https://example.com stays");
  });
});

describe("decision and timeline text strips emphasis like the other kinds", () => {
  it("strips backticks and bold from a decision", () => {
    const d = doc("# T\n\n## Decisions\n- Use `Postgres` and **Redis** for the store\n");
    expect(entries(d, "decisions").map((e) => e.text)).toEqual(["Use Postgres and Redis for the store"]);
  });

  it("strips backticks and bold from a timeline title", () => {
    const d = doc("# T\n\n## Timeline\n- Nov 3: `kickoff` **meeting**\n");
    expect(entries(d, "timeline").map((e) => e.title)).toEqual(["kickoff meeting"]);
  });
});

describe("a bolded timeline date leaves no colon residue in the title", () => {
  it("parses '**Nov 3**: kickoff' like the unbolded line", () => {
    const d = doc("# T\n\n## Timeline\n- **Nov 3**: kickoff\n- Nov 4: freeze\n");
    const e = entries(d, "timeline");
    expect(e.map((x) => x.date)).toEqual(["Nov 3", "Nov 4"]);
    expect(e.map((x) => x.title)).toEqual(["kickoff", "freeze"]);
  });
});

describe("malformed link destinations never stall the import", () => {
  it("leaves unclosed and paren-bomb destinations as plain text", () => {
    // These inputs sent the first revision of the pattern into exponential
    // backtracking; the suite timeout is the guard, the text must survive.
    const bombs = [
      `[x](${"a".repeat(40000)}`,
      `[x](${"(".repeat(20000)}`,
      `[x](${"a(".repeat(10000)}`,
      `[x](${"()".repeat(10000)}`,
    ];
    for (const bomb of bombs) expect(stripEmphasis(bomb)).toBe(bomb);
  });

  it("still collapses a URL with balanced parens", () => {
    expect(stripEmphasis("Link [with parens](https://example.com/a_(b)) end")).toBe("Link with parens end");
  });
});
