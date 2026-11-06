import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "../../src/app/api/umbrex-guidance/route";
import { allowlistedUrls, checkOneSource, __clearUmbrexGuidanceCacheForTests, __setUmbrexFetchTimeoutForTests } from "../../src/app/api/umbrex-guidance/core";
import { UMBREX_GUIDANCE_PACK } from "../../src/understanding/market-research/guidance-pack";

function fakeResponse(status: number, body: string, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    text: () => Promise.resolve(body),
  } as unknown as Response;
}


describe("readBodyBounded oversized-chunk handling", () => {
  const target = () => allowlistedUrls()[0];

  it("retains an exact prefix of supplied bytes when the first chunk exceeds the cap - never zero-filled", async () => {
    const CAP = 2_000_000;
    const payload = "A".repeat(CAP + 1);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(payload));
        controller.close();
      },
    });
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve(new Response(stream, { status: 200, headers: { "content-type": "text/html" } }))));
    const status = await checkOneSource(target(), Date.now());
    expect(status.outcome).toBe("readable");
    // Retained bytes only: the cap, not the received cap+1.
    expect(status.byteLength).toBe(CAP);
    expect(status.detail).toContain("exceeded");
    // Exact prefix of the supplied bytes - no fabricated NUL padding.
    expect(status.excerpt).toBe("A".repeat(1200));
  });

  it("a never-settling stream cancel() cannot escape the per-source deadline", async () => {
    __setUmbrexFetchTimeoutForTests(4000);
    const CAP = 2_000_000;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("B".repeat(CAP + 1)));
      },
      cancel() {
        return new Promise<void>(() => {}); // never settles
      },
    });
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve(new Response(stream, { status: 200, headers: { "content-type": "text/html" } }))));
    const startedAt = Date.now();
    const status = await checkOneSource(target(), Date.now());
    expect(Date.now() - startedAt).toBeLessThan(3500);
    expect(status.outcome).toBe("readable");
    expect(status.byteLength).toBe(CAP);
    expect(status.detail).toContain("exceeded");
  });
});

describe("umbrex-guidance route", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    __clearUmbrexGuidanceCacheForTests();
  });

  it("allowlist is exactly the pack's cited umbrex.com sources - no caller input", () => {
    const urls = allowlistedUrls();
    const packUrls = new Set(UMBREX_GUIDANCE_PACK.flatMap((s) => [...s.sources]));
    expect(new Set(urls)).toEqual(packUrls);
    expect(urls.length).toBeGreaterThan(5);
    expect(urls.every((u) => u.startsWith("https://umbrex.com/"))).toBe(true);
  });

  it("reports observed statuses without relabeling failures, and caches", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      calls.push(url);
      if (url.includes("scoping")) return Promise.resolve(fakeResponse(200, "<title>Scoping</title><p>x</p>"));
      if (url.includes("data-collection")) return Promise.resolve(fakeResponse(520, ""));
      return Promise.resolve(fakeResponse(200, "<title>T</title>"));
    }));
    const res = await GET();
    const body = await res.json();
    expect(body.allowlistedCount).toBe(allowlistedUrls().length);
    const failing = body.sources.filter((s: { outcome: string }) => s.outcome === "http-error");
    expect(failing.length).toBeGreaterThan(0);
    for (const f of failing) expect(f.httpStatus).toBe(520);
    const readable = body.sources.filter((s: { outcome: string }) => s.outcome === "readable");
    expect(readable.length).toBeGreaterThan(0);
    expect(readable.every((s: { title?: string }) => typeof s.title === "string")).toBe(true);
    // Bounded raw-text excerpt: present on readable sources, stripped of markup.
    for (const r of readable) {
      expect(typeof r.excerpt).toBe("string");
      expect(r.excerpt).not.toMatch(/<[a-z]/i);
      expect(r.excerpt.length).toBeLessThanOrEqual(1200);
    }
    expect(body.note).toContain("does not establish paywall status");
    // Second call: all served from cache, no new fetches.
    const before = calls.length;
    const res2 = await GET();
    const body2 = await res2.json();
    expect(calls.length).toBe(before);
    expect(body2.sources.every((s: { fromCache: boolean }) => s.fromCache)).toBe(true);
  });

  it("maps network failure to unreachable, never throws", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("boom"))));
    const res = await GET();
    const body = await res.json();
    expect(body.sources.every((s: { outcome: string }) => s.outcome === "unreachable")).toBe(true);
  });

  it("refuses redirects to disallowed origins and never fetches them", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      calls.push(url);
      if (url.includes("scoping")) {
        return Promise.resolve(fakeResponse(302, "", { location: "https://evil.example/steal" }));
      }
      return Promise.resolve(fakeResponse(200, "<title>T</title>"));
    }));
    const res = await GET();
    const body = await res.json();
    expect(calls.some((u: string) => u.includes("evil.example"))).toBe(false);
    const refused = body.sources.find((s: { url: string }) => s.url.includes("scoping"));
    expect(refused.outcome).toBe("http-error");
    expect(refused.detail).toContain("redirect refused");
  });

  it("follows same-origin redirects within the hop limit and bounds loops", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      calls.push(url);
      if (url.includes("scoping-v2")) {
        return Promise.resolve(fakeResponse(200, "<title>Moved page</title>"));
      }
      if (url.includes("scoping")) {
        return Promise.resolve(fakeResponse(302, "", { location: "https://umbrex.com/resources/market-sizing-playbook/scoping-v2/" }));
      }
      if (url.includes("communicating-insights")) {
        return Promise.resolve(fakeResponse(302, "", { location: "https://umbrex.com/resources/market-sizing-playbook/communicating-insights-and-driving-action/" }));
      }
      return Promise.resolve(fakeResponse(200, "<title>T</title>"));
    }));
    const res = await GET();
    const body = await res.json();
    const moved = body.sources.find((s: { url: string }) => s.url.endsWith("scoping-and-framing-the-exercise/"));
    expect(moved.outcome).toBe("readable");
    expect(moved.title).toBe("Moved page");
    const looping = body.sources.find((s: { url: string }) => s.url.includes("communicating-insights"));
    expect(looping.outcome).toBe("http-error");
    const loopCalls = calls.filter((u: string) => u.includes("communicating-insights")).length;
    expect(loopCalls).toBeLessThanOrEqual(4); // bounded, never unbounded
  });

  it("terminates when the response body never completes (deadline covers body read)", async () => {
    __setUmbrexFetchTimeoutForTests(150);
    try {
      vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: () => new Promise<string>(() => {}), // never resolves
      } as unknown as Response)));
      const started = Date.now();
      const res = await GET();
      const elapsed = Date.now() - started;
      const body = await res.json();
      expect(body.sources.every((s: { outcome: string }) => s.outcome === "unreachable")).toBe(true);
      expect(elapsed).toBeLessThan(150 * allowlistedUrls().length + 5000);
    } finally {
      __setUmbrexFetchTimeoutForTests(8000);
    }
  });
});
