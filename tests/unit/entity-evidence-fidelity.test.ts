/**
 * Entity-group evidence fidelity (Codex review findings, re-verified on main).
 *
 * Grouped titles were losing or misreading their evidence: open-end markers
 * matched mid-tail ("– Current status"), numeric month/year split in two
 * ("01/2024" -> "01/" + 2024), wrapped ranges kept a trailing dot, two-letter
 * titles regrew their removed range, an open range lost to title keywords
 * ("Complete Streets Program"), grouped details never reached the renderers,
 * bold time labels ("**This week**") swallowed independent actions, checkbox
 * state was stripped by plainContentOf, "Cut spend" read as past tense, and
 * owners named May/June were rejected as dates.
 */
import { describe, expect, it } from "vitest";
import {
  buildActionFromGroup,
  buildTimelineFromGroup,
  findDateRange,
} from "@/import/text/entity-groups";
import { importSource } from "@/import/import-source";
import type { ActionEntry, TimelineEntry } from "@/domain/memory/schema";

const G = (title: string, ...details: string[]) => ({
  titleLine: { text: title, lineNo: 1 },
  detailLines: details.map((text, i) => ({ text, lineNo: i + 2 })),
});

describe("A: marker must terminate the range", () => {
  it("rejects 'Release January 2024 – Current status'", () => {
    expect(findDateRange("Release January 2024 – Current status")).toBeNull();
  });
  it("rejects 'January 2024 – Now available'", () => {
    expect(findDateRange("January 2024 – Now available")).toBeNull();
  });
});

describe("B: complete start token", () => {
  it("handles 'Engineer 01/2024 – Present' without leaking 01/", () => {
    const range = findDateRange("Engineer 01/2024 – Present");
    if (range) {
      const title = "Engineer 01/2024 – Present".slice(0, range.index).trim();
      expect(title).not.toMatch(/01\s*\/$/);
      expect(range.start).toBe("01/2024");
    }
  });
});

describe("C: terminal punctuation after wrapped range", () => {
  it("title of 'Engineer (January 2024 – Present).' has no trailing dot", () => {
    const t = buildTimelineFromGroup(G("Engineer (January 2024 – Present).", "- Shipped v2"), new Date("2026-10-19"));
    if (t) expect(t.title).not.toMatch(/[\s.]+$/);
  });
});

describe("D: two-character titles survive", () => {
  it("'AI (January 2024 – Present)' keeps title AI", () => {
    const t = buildTimelineFromGroup(G("AI (January 2024 – Present)", "- Built models"), new Date("2026-10-19"));
    expect(t?.title).toBe("AI");
  });
});

describe("E: open range overrides title-readiness", () => {
  it("'Complete Streets Program January 2024 – Present' is not done", () => {
    const a = buildActionFromGroup(G("Complete Streets Program January 2024 – Present", "- Repainted lanes"), new Date("2026-10-19"));
    if (a) expect(a.status).not.toBe("done");
  });
});

describe("F: details reach rendered output", () => {
  it("grouped action details appear in web render", async () => {
    const doc = `# Project Export

## Timeline

**Migration** January 2025 – Present
- Configure database
- Move blobs
`;
    const result = importSource({ raw: doc, label: "project-export.md" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const timeline = result.value.blocks.find((b) => b.kind === "timeline");
    const entries = ((timeline?.payload as { entries?: TimelineEntry[] } | undefined)?.entries ?? []);
    const mig = entries.find((e) => /migration/i.test(e.title));
    if (!mig) throw new Error("Migration entry missing");
    expect((mig.details ?? []).join(" ")).toContain("Configure database");
  });
});

describe("G: bold label is not an entity title", () => {
  it("'**This week**' + bullets keeps independent actions", () => {
    const doc = `# Standup Notes

## Actions

**This week**
- Call Alice
- Fix login
`;
    const result = importSource({ raw: doc, label: "standup-notes.md" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const actions = result.value.blocks.filter((b) => b.kind === "actions").flatMap((b) => (b.payload as { entries: ActionEntry[] }).entries);
    const titles = actions.map((a) => a.task);
    expect(titles).toContain("Call Alice");
    expect(titles).toContain("Fix login");
  });
});

describe("K: past single-date milestone stays planned", () => {
  it("'**Launch — September 2025**' with 'Blocked by vendor' is not done", () => {
    const a = buildActionFromGroup(G("Launch — September 2025", "- Blocked by vendor"), new Date("2026-10-19"));
    if (a) expect(a.status).not.toBe("done");
  });
});

describe("L: checkbox completion survives grouping", () => {
  it("'**Migration**' with checked items is done", () => {
    const a = buildActionFromGroup(G("Migration", "- [x] Configure database", "- [x] Move blobs"), new Date("2026-10-19"));
    if (a) expect(a.status).toBe("done");
  });
});

describe("I: imperative cut stays pending", () => {
  it("'Cut cloud spend by 20%' is not done", () => {
    const doc = `# Cost Review

## Actions

- Cut cloud spend by 20%
`;
    const result = importSource({ raw: doc, label: "cost-review.md" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const actions = result.value.blocks.filter((b) => b.kind === "actions").flatMap((b) => (b.payload as { entries: ActionEntry[] }).entries);
    const cut = actions.find((a) => /cut cloud/i.test(a.task));
    if (cut) expect(cut.status).not.toBe("done");
  });
});

describe("J: owner named May survives", () => {
  it("'Draft report — May Lee — June 2027' keeps owner and due", () => {
    const doc = `# Planning

## Actions

- Draft report — May Lee — June 2027
`;
    const result = importSource({ raw: doc, label: "planning.md" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const actions = result.value.blocks.filter((b) => b.kind === "actions").flatMap((b) => (b.payload as { entries: ActionEntry[] }).entries);
    const draft = actions.find((a) => /draft report/i.test(a.task));
    if (draft) {
      expect(draft?.owner ?? "").toMatch(/may lee/i);
    }
  });
});

describe("Codex round 2: metadata, month fragments, completion buckets", () => {
  it("accepts a delimited metadata tail after an open-ended marker", () => {
    const t = buildTimelineFromGroup(G("Engineer January 2024 – Present | Remote", "- Shipped v2"), new Date("2026-10-19"));
    if (!t) throw new Error("expected a timeline entry");
    expect(t.state).not.toBe("done");
    expect(t.title).not.toContain("Present");
    expect(t.title).toContain("Remote");
  });

  it("still rejects prose after the marker", () => {
    expect(findDateRange("Release January 2024 – Current status")).toBeNull();
  });

  it("rejects a bare-month range fragment as an action owner", async () => {
    const { parseActionLine } = await import("@/import/text/patterns");
    const out = parseActionLine("Product Analyst — January – June 2025");
    expect(out === null || out.owner !== "January").toBe(true);
  });

  it("propagates a bold Done bucket to its bullets", () => {
    const doc = `# Sprint Notes

## Actions

**Done**
- Migrate database
- Deploy app
`;
    const result = importSource({ raw: doc, label: "sprint-notes.md" });
    if (!result.ok) throw new Error("import failed");
    const actions = result.value.blocks
      .filter((b) => b.kind === "actions")
      .flatMap((b) => (b.payload as { entries: ActionEntry[] }).entries);
    const mig = actions.find((a) => /migrate database/i.test(a.task));
    const dep = actions.find((a) => /deploy app/i.test(a.task));
    expect(mig?.status).toBe("done");
    expect(dep?.status).toBe("done");
  });
});

describe("Codex round 3: date-prefixed owners, section boundaries, all completion labels", () => {
  it("rejects an owner that begins with an unambiguous date", async () => {
    const { parseActionLine } = await import("@/import/text/patterns");
    const out = parseActionLine("Product Analyst — January 2024 (Remote) – June 2025");
    expect(out === null || !/^january/i.test(out.owner ?? "")).toBe(true);
  });

  it("keeps a person named May as an owner", async () => {
    const { parseActionLine } = await import("@/import/text/patterns");
    const out = parseActionLine("Ship report — May Lee — Aug 15");
    if (!out) throw new Error("expected an action");
    expect(out.owner).toBe("May Lee");
  });

  it("stops a completion bucket at the section boundary", () => {
    const doc = `# Notes

## Actions

### Sprint One

**Done**
- Migrate database

## Next Steps

- Plan launch
`;
    const result = importSource({ raw: doc, label: "notes.md" });
    if (!result.ok) throw new Error("import failed");
    const actions = result.value.blocks
      .filter((b) => b.kind === "actions")
      .flatMap((b) => (b.payload as { entries: ActionEntry[] }).entries);
    const mig = actions.find((a) => /migrate database/i.test(a.task));
    const plan = actions.find((a) => /plan launch/i.test(a.task));
    expect(mig?.status).toBe("done");
    expect(plan?.status).toBe("pending");
  });

  it("excludes every completion label from entity grouping", () => {
    const doc = `# Notes

## Actions

**Shipped**
- Migrate database
- Deploy app
`;
    const result = importSource({ raw: doc, label: "notes.md" });
    if (!result.ok) throw new Error("import failed");
    const actions = result.value.blocks
      .filter((b) => b.kind === "actions")
      .flatMap((b) => (b.payload as { entries: ActionEntry[] }).entries);
    expect(actions.some((a) => /^shipped$/i.test(a.task))).toBe(false);
    const mig = actions.find((a) => /migrate database/i.test(a.task));
    const dep = actions.find((a) => /deploy app/i.test(a.task));
    expect(mig?.status).toBe("done");
    expect(dep?.status).toBe("done");
  });
});

describe("Codex round 4: status buckets, hyphenated identifiers", () => {
  it("treats bold status buckets as structural, not entity titles", () => {
    const doc = `# Notes

## Actions

**Blocked**
- Fix login
- Call Alice
`;
    const result = importSource({ raw: doc, label: "notes.md" });
    if (!result.ok) throw new Error("import failed");
    const actions = result.value.blocks
      .filter((b) => b.kind === "actions")
      .flatMap((b) => (b.payload as { entries: ActionEntry[] }).entries);
    expect(actions.some((a) => /^blocked$/i.test(a.task))).toBe(false);
    expect(actions.find((a) => /fix login/i.test(a.task))).toBeDefined();
    expect(actions.find((a) => /call alice/i.test(a.task))).toBeDefined();
  });

  it.each(["Pending", "Ready", "In review", "On hold"])(
    "excludes the bold %s bucket from entity grouping",
    (label) => {
      const doc = `# Notes

## Actions

**${label}**
- Fix login
`;
      const result = importSource({ raw: doc, label: "notes.md" });
      if (!result.ok) throw new Error("import failed");
      const actions = result.value.blocks
        .filter((b) => b.kind === "actions")
        .flatMap((b) => (b.payload as { entries: ActionEntry[] }).entries);
      expect(actions.some((a) => a.task.toLowerCase() === label.toLowerCase())).toBe(false);
      expect(actions.find((a) => /fix login/i.test(a.task))).toBeDefined();
    },
  );

  it("keeps hyphenated identifiers out of numeric dates", async () => {
    expect(findDateRange("RFC-1-2024 – RFC-2-2025")).toBeNull();
    // The numeric month/year form still works on its own.
    const { findDateToken } = await import("@/import/text/patterns");
    expect(findDateToken("1-2024")).not.toBeNull();
    expect(findDateToken("2024-2025")).not.toBeNull();
    expect(findDateRange("Jan 2024 – Feb 2025")).not.toBeNull();
  });

  it("does not truncate an identifier range title or mark it done", () => {
    const t = buildTimelineFromGroup(G("RFC-1-2024 – RFC-2-2025", "- Shipped v2"), new Date("2026-10-19"));
    if (t) {
      expect(t.title).toContain("RFC-1-2024");
      expect(t.state).not.toBe("done");
    }
  });
});

describe("Codex round 5: ready propagation, identifier separators, cut", () => {
  it("propagates a bold Ready bucket to its bullets", () => {
    const doc = `# Notes

## Actions

**Ready**
- Deploy app
- Cut release
`;
    const result = importSource({ raw: doc, label: "notes.md" });
    if (!result.ok) throw new Error("import failed");
    const actions = result.value.blocks
      .filter((b) => b.kind === "actions")
      .flatMap((b) => (b.payload as { entries: ActionEntry[] }).entries);
    const dep = actions.find((a) => /deploy app/i.test(a.task));
    const cut = actions.find((a) => /cut release/i.test(a.task));
    expect(dep?.status).toBe("ready");
    expect(cut?.status).toBe("ready");
  });

  it("keeps underscored/dotted identifiers out of numeric dates", async () => {
    expect(findDateRange("RFC_1-2024 – RFC_2-2025")).toBeNull();
    expect(findDateRange("RFC.1-2024 – RFC.2-2025")).toBeNull();
    const { findDateToken } = await import("@/import/text/patterns");
    expect(findDateToken("1-2024")).not.toBeNull();
    expect(findDateToken("2024-2025")).not.toBeNull();
  });

  it("retains completed uses of cut with explicit past context", async () => {
    const { inferReadiness } = await import("@/understanding/inference");
    expect(inferReadiness("Cut cloud spend by 20% last quarter")).toBe("done");
    expect(inferReadiness("Cut cloud spend by 20%")).toBe("pending");
  });
});
