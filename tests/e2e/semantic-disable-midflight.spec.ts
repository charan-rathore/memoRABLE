import { expect, test, type Page } from "@playwright/test";

/**
 * Real worker, real browser, INSTRUMENTED: the Worker message channel is
 * wrapped so the test can prove a query-embed request (type "embed",
 * kind "query") was posted and still PENDING (no reply for its id) at the
 * moment semantic is turned off. The in-flight search must still settle -
 * keyword arm, matching issue, model off - and a re-enable must serve the
 * next query semantically with fresh request ids completing. This is the
 * in-flight disable path, not the initial-load-failure path.
 */

const ws = (page: Page) => page.locator("#workspace");

async function openWorkspace(page: Page, path = "/") {
  await page.goto(path);
  await page.getByTestId("brand-splash").waitFor({ state: "detached" });
  await ws(page).scrollIntoViewIfNeeded();
  await expect(ws(page).getByText("Saved on this device")).toBeVisible();
}

// On the small-screen layout only the active section is rendered; the Recall
// section must be opened before its controls exist (same helper as the
// recovery spec).
async function openTab(page: Page, name: "Recall" | "Next" | "Review" | "Today") {
  const tabs = ws(page).getByRole("navigation", { name: "Sections" });
  if (await tabs.isVisible()) await tabs.getByRole("button", { name }).click();
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  // Wrap Worker before any app script runs: log embed posts and replies.
  await page.addInitScript(() => {
    const w = window as unknown as { __emb?: { posts: { id: number; type: string; kind?: string }[]; replies: number[] } };
    w.__emb = { posts: [], replies: [] };
    const Orig = window.Worker;
    window.Worker = class extends Orig {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      override postMessage(message: any, options?: any) {
        const data = message as { id?: number; type?: string; kind?: string };
        if (data && typeof data.id === "number" && (data.type === "embed" || data.type === "init"))
          w.__emb!.posts.push({ id: data.id, type: data.type, kind: data.kind });
        super.postMessage(message, options);
      }
      constructor(...args: ConstructorParameters<typeof Orig>) {
        super(...args);
        this.addEventListener("message", (e) => {
          const d = e.data as { id?: number };
          if (d && typeof d.id === "number") w.__emb!.replies.push(d.id);
        });
      }
    } as typeof Worker;
  });
  await openWorkspace(page);
});

test("turning semantic off with a query embed PENDING still returns the matching issue, and re-enable serves the next query", async ({ page }, testInfo) => {
  const status = await page.evaluate(async () => (await fetch("/models/Xenova/bge-small-en-v1.5/config.json")).status);
  test.skip(status !== 200, "model not bundled in this build");
  test.setTimeout(180_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.route("https://api.github.com/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/issues/comments")) return route.fulfill({ json: [] });
    return route.fulfill({
      headers: { etag: 'W/"v1"', "x-ratelimit-remaining": "59" },
      json: [
        { number: 201, title: "Turbopack dev server memory grows over time", body: "After a few hours the process uses 6 GB of RAM and the tab becomes unresponsive. Restarting fixes it for a while, then it climbs again. Repro: npm run dev, edit files for about thirty minutes.", state: "open", html_url: "https://github.com/acme/web/issues/201", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-02T00:00:00Z", labels: [], comments: 0 },
        { number: 202, title: "Memory usage notes", body: "process RAM unresponsive hours process RAM unresponsive hours", state: "open", html_url: "https://github.com/acme/web/issues/202", created_at: "2026-10-03T00:00:00Z", updated_at: "2026-10-03T00:00:00Z", labels: [], comments: 0 },
      ],
    });
  });
  await openTab(page, "Recall");
  const recall = ws(page).locator(".td-recall");
  await recall.getByRole("button", { name: "Turn on semantic search" }).click();
  await expect(recall.getByText("Semantic search on, running on this device")).toBeVisible({ timeout: 150_000 });
  await recall.getByText("Connect a GitHub repo").click();
  await recall.getByRole("textbox", { name: "Repository, as owner/repo" }).fill("https://github.com/acme/web");
  await recall.getByRole("button", { name: "Connect" }).click();
  await expect(recall.locator(".td-repos")).toContainText("acme/web");

  const longQuery = "Turbopack dev server memory grows over time\nAfter a few hours the process uses 6 GB of RAM and the tab becomes unresponsive. Restarting fixes it for a while, then it climbs again. Repro: npm run dev, edit files for about thirty minutes.";
  await ws(page).getByRole("searchbox").fill(longQuery);

  // Proof the race is real: wait for a query embed that is POSTED and has NO
  // reply yet, THEN turn semantic off while it is pending.
  await expect.poll(async () => page.evaluate(() => {
    const emb = (window as unknown as { __emb: { posts: { id: number; type: string; kind?: string }[]; replies: number[] } }).__emb;
    return emb.posts.filter((p) => p.type === "embed" && p.kind === "query" && !emb.replies.includes(p.id)).length;
  }), { timeout: 30_000 }).toBeGreaterThan(0);
  await recall.getByRole("button", { name: "Turn off" }).click();

  const repoHit = recall.locator(".td-result.is-repo").first();
  await expect(repoHit).toContainText("Turbopack dev server memory", { timeout: 30_000 });
  await expect(repoHit.locator("a")).toHaveAttribute("href", "https://github.com/acme/web/issues/201");
  await expect(recall.locator(".td-receipt").last()).toContainText("Keyword search");
  await expect(recall.getByRole("button", { name: "Turn on semantic search" })).toBeVisible(); // model off
  await page.screenshot({ path: testInfo.outputPath("e2e-disable-midflight-recovered.png") });

  // Re-enable: the next query is served semantically, on fresh request ids.
  const postsBefore = await page.evaluate(() => (window as unknown as { __emb: { posts: unknown[] } }).__emb.posts.length);
  await recall.getByRole("button", { name: "Turn on semantic search" }).click();
  await expect(recall.getByText("Semantic search on, running on this device")).toBeVisible({ timeout: 150_000 });
  await ws(page).getByRole("searchbox").fill(longQuery);
  await expect(recall.locator(".td-receipt").last()).toContainText("Semantic + keyword search", { timeout: 30_000 });
  await expect(recall.locator(".td-result.is-repo").first()).toContainText("Turbopack dev server memory");
  const after = await page.evaluate(() => {
    const emb = (window as unknown as { __emb: { posts: { id: number; type: string; kind?: string }[]; replies: number[] } }).__emb;
    const freshQueries = emb.posts.slice().filter((p) => p.type === "embed" && p.kind === "query");
    return { posts: emb.posts.length, settledFresh: freshQueries.filter((p) => emb.replies.includes(p.id)).length };
  });
  expect(after.posts).toBeGreaterThan(postsBefore); // the replacement worker handled new requests
  expect(after.settledFresh).toBeGreaterThan(0); // and its query embeds completed normally
  expect(pageErrors).toEqual([]); // no unhandled rejection or crash from the race
});
