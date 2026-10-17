import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const dir = resolve(root, "docs/architecture");
const html = readFileSync(resolve(dir, "interactive.html"), "utf8");
const svg = readFileSync(resolve(dir, "document-to-memory.svg"), "utf8");

describe("architecture guide", () => {
  it("offers eleven keyboard-native stages and a mobile reading column", () => {
    expect((html.match(/<details /g) ?? []).length).toBe(11);
    expect((html.match(/<summary>/g) ?? []).length).toBe(11);
    expect(html).toContain('name="viewport"');
    expect(html).toContain("@media(max-width:700px)");
  });

  it("resolves all source and asset links without a remote dependency", () => {
    for (const [, target] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      expect(target).not.toMatch(/^(?:https?:|\/\/)/);
      expect(existsSync(resolve(dir, target!)), target).toBe(true);
    }
    expect(html).not.toMatch(/<script\b|<iframe\b|@import|url\(/i);
    expect(svg).not.toMatch(/<script\b|<foreignObject\b/i);
  });

  it("keeps format routing, optional disclosures and failure limits explicit", () => {
    expect(html).toContain("JSON never falls through to text");
    expect(html).toContain("first 40 pages");
    expect(html).toContain("8-second deadline, no automatic retries");
    expect(html).toContain("not the full source or a durable backup");
    expect(html).toContain("not an automatic email send or remote website deployment");
    expect(html).toContain("Preserved locators do not prove new AI claims");
    expect(html + svg).not.toMatch(/jev|typesafe/i);
  });

  it("gives the static diagram accessible structure and routing semantics", () => {
    expect(svg).toContain('role="img" aria-labelledby="title desc"');
    expect(svg).toContain('<title id="title">');
    expect(svg).toContain('<desc id="desc">');
    expect(svg).toContain("strict JSON bypasses text understanding");
    expect(svg).toContain("accepted candidate only");
  });
});
