import { describe, expect, it } from "vitest";
import { cleanMarkdown, syncRepo, validRepo } from "@/search/github";

function res(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(status === 304 ? null : JSON.stringify(body), { status, headers });
}

const issue = (n: number, updated: string, pr = false) => ({
  number: n, title: `Issue ${n}`, body: `<!-- template -->Body ${n}`, state: "open", html_url: `https://github.com/o/r/issues/${n}`,
  created_at: "2026-01-01T00:00:00Z", updated_at: updated, labels: [{ name: "bug" }], comments: 1, ...(pr ? { pull_request: {} } : {}),
});

describe("GitHub connector", () => {
  it("accepts owner/repo and github.com URLs only", () => {
    expect(validRepo("https://github.com/vercel/next.js")).toBe("vercel/next.js");
    expect(validRepo("vercel/next.js.git")).toBe("vercel/next.js");
    expect(validRepo("not a repo")).toBeNull();
    expect(cleanMarkdown("<!-- x -->hi ![img](a.png)")).toBe("hi");
  });

  it("pages issues, attaches comments, and advances the cursor", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push(`${url} ${(init?.headers as Record<string, string>)["if-none-match"] ?? ""}`.trim());
      if (url.includes("/issues/comments")) return res(200, [{ issue_url: "https://api.github.com/repos/o/r/issues/2", body: "Fixed in 16.4.6", updated_at: "2026-02-03T00:00:00Z", author_association: "MEMBER" }]);
      if (url.includes("page=2")) return res(200, [issue(2, "2026-02-02T00:00:00Z", true)], { "x-ratelimit-remaining": "57" });
      return res(200, [issue(1, "2026-02-01T00:00:00Z")], { etag: 'W/"abc"', link: '<https://api.github.com/repos/o/r/issues?page=2>; rel="next"' });
    }) as typeof fetch;

    const r = await syncRepo({ repo: "o/r" }, { fetchImpl });
    expect(r.docs.map((d) => [d.id, d.kind])).toEqual([["o/r#1", "issue"], ["o/r#2", "pr"]]);
    expect(r.docs[1]!.body).toContain("Fixed in 16.4.6");
    expect(r.docs[0]!.body).toBe("Body 1");
    expect(r.cursor).toMatchObject({ repo: "o/r", since: "2026-02-02T00:00:00Z", etag: 'W/"abc"' });
    expect(r.requests).toBe(3);

    // Unchanged repo: one conditional request, 304, nothing re-downloaded.
    const r2 = await syncRepo(r.cursor, { fetchImpl: (async () => res(304, null)) as unknown as typeof fetch });
    expect(r2).toMatchObject({ notModified: true, requests: 1, docs: [] });
    expect(calls[0]).not.toContain("if-none-match");
  });

  it("stops cleanly at the rate limit and keeps what it fetched", async () => {
    let n = 0;
    const fetchImpl = (async () => (n++ === 0
      ? res(200, [issue(1, "2026-02-01T00:00:00Z")], { link: '<https://api.github.com/x?page=2>; rel="next"' })
      : res(403, { message: "rate limit" }, { "x-ratelimit-reset": "1800000000" }))) as unknown as typeof fetch;
    const r = await syncRepo({ repo: "o/r" }, { fetchImpl });
    expect(r.docs).toHaveLength(1);
    expect(r.stoppedBecause).toMatch(/rate limit/i);
    expect(r.stoppedBecause).toMatch(/token/);
  });
});

import { dequantize, quantize, vectorKey } from "@/search/store";

describe("vector cache", () => {
  it("int8 round-trips within a step, and keys change with content or model", () => {
    const v = Float32Array.from([0.5, -0.25, 0.125, -1]);
    const back = dequantize(quantize(v));
    for (let i = 0; i < v.length; i++) expect(Math.abs(back[i]! - v[i]!)).toBeLessThan(1 / 127 + 1e-6);
    expect(vectorKey("m@q8", "a", "x")).not.toBe(vectorKey("m@q8", "a", "y"));
    expect(vectorKey("m@q8", "a", "x")).not.toBe(vectorKey("m2@q8", "a", "x"));
  });
});
