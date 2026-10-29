import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const graph = { schema: "graphify-v1", extractor: "test", nodes: [{ id: "source", label: "Original" }], edges: [] };
const response = () => Response.json({ knowledgeGraph: graph });

describe("document graph extraction cache", () => {
  beforeEach(() => { vi.resetModules(); vi.stubEnv("NEXT_PUBLIC_DOCGRAPH", "1"); });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("reuses exact inputs and gives callers independent editable results", async () => {
    const fetcher = vi.fn(async () => response());
    vi.stubGlobal("fetch", fetcher);
    const { graphFromMarkdown } = await import("@/import/docgraph/client");
    const input = { markdown: "# Source\nQueue retries", title: "Source" };
    const [first, second] = await Promise.all([graphFromMarkdown(input), graphFromMarkdown(input)]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(first).toEqual(graph); expect(second).toEqual(graph);
    expect(first).not.toBe(second);
    first!.nodes[0]!.label = "Edited";
    expect((await graphFromMarkdown(input))?.nodes[0]?.label).toBe("Original");
    expect(fetcher).toHaveBeenCalledTimes(1);
    await graphFromMarkdown({ ...input, title: "Other title" });
    await graphFromMarkdown({ ...input, label: "Other label" });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("does not retain failed or malformed graph responses", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ knowledgeGraph: {} })).mockResolvedValueOnce(response());
    vi.stubGlobal("fetch", fetcher);
    const { graphFromMarkdown } = await import("@/import/docgraph/client");
    const input = { markdown: "Retry this source" };
    expect(await graphFromMarkdown(input)).toBeNull();
    expect(await graphFromMarkdown(input)).toBeNull();
    expect(await graphFromMarkdown(input)).toEqual(graph);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("continues uncached when browser digest support is unavailable", async () => {
    vi.stubGlobal("crypto", undefined);
    const fetcher = vi.fn(async () => response());
    vi.stubGlobal("fetch", fetcher);
    const { graphFromMarkdown } = await import("@/import/docgraph/client");
    expect(await graphFromMarkdown({ markdown: "No digest" })).toEqual(graph);
    expect(await graphFromMarkdown({ markdown: "No digest" })).toEqual(graph);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
