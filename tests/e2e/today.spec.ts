import { expect, test, type Page } from "@playwright/test";

/**
 * The daily journey in the workspace at the bottom of the homepage:
 * capture -> recall -> next -> review, with supersession, deletion,
 * persistence across reloads, and offline use. No network or model involved.
 */

const ws = (page: Page) => page.locator("#workspace");

async function openWorkspace(page: Page, path = "/") {
  await page.goto(path);
  await page.getByTestId("brand-splash").waitFor({ state: "detached" });
  await ws(page).scrollIntoViewIfNeeded();
  await expect(ws(page).getByText("Saved on this device")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openWorkspace(page);
});

const entry = (page: Page) => ws(page).getByRole("textbox", { name: "Entry text" });

async function record(page: Page, text: string) {
  await entry(page).fill(text);
  await entry(page).press("ControlOrMeta+Enter");
  await expect(entry(page)).toHaveValue("");
  await expect(page.locator(".td-entry-text", { hasText: text }).first()).toBeVisible();
}

async function openTab(page: Page, name: "Recall" | "Next" | "Review" | "Today") {
  const tabs = ws(page).getByRole("navigation", { name: "Sections" });
  if (await tabs.isVisible()) await tabs.getByRole("button", { name }).click();
}

test("captures, recalls, supersedes and deletes, and survives a reload", async ({ page }) => {
  await record(page, "Decided to store embeddings in pgvector");
  await record(page, "Learned that cache keys must include permission state");

  // Capture triggers recall: the earlier decision appears while typing.
  await entry(page).fill("Decided embeddings live in SQLite");
  const related = page.locator(".td-related");
  await expect(related).toContainText("Decided to store embeddings in pgvector");
  const handle = (await related.locator(".td-link-btn").first().innerText()).trim();
  expect(handle).toMatch(/^#[a-z0-9]{6}$/);

  // Replace it explicitly.
  await entry(page).fill(`Decided embeddings live in SQLite. Replaces ${handle}`);
  await expect(page.getByText(`Replaces ${handle}`, { exact: true })).toBeVisible();
  await entry(page).press("ControlOrMeta+Enter");
  const old = page.locator(".td-entry", { hasText: "Decided to store embeddings in pgvector" });
  await expect(old.locator(".td-status")).toContainText("Replaced by");

  // Recall puts the current decision first and flags the old one.
  await openTab(page, "Recall");
  await ws(page).getByRole("searchbox").fill("where do embeddings live");
  const results = page.locator(".td-result");
  await expect(results.first()).toContainText("SQLite");
  await expect(page.locator(".td-result.is-stale")).toContainText("pgvector");
  await expect(ws(page).locator(".td-receipt").first()).toContainText(/matches? in/);

  // Persisted in IndexedDB.
  await openWorkspace(page);
  await expect(page.locator(".td-entry-text", { hasText: "SQLite" })).toBeVisible();
  await expect(page.locator(".td-entry", { hasText: "pgvector" }).locator(".td-status")).toContainText("Replaced by");

  // Delete the lesson; it leaves the stream and recall, and stays gone after reload.
  const lesson = page.locator(".td-entry", { hasText: "cache keys must include" });
  await lesson.hover();
  await lesson.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("group", { name: "Confirm delete" }).getByRole("button", { name: "Delete" }).click();
  await expect(lesson).toHaveCount(0);
  await openTab(page, "Recall");
  await ws(page).getByRole("searchbox").fill("cache keys permission");
  await expect(ws(page).locator(".td-receipt").first()).toContainText("No matches");
  await openWorkspace(page);
  await expect(page.locator(".td-entry", { hasText: "cache keys must include" })).toHaveCount(0);
});

test("suggests the next task with reasons and records accept and skip", async ({ page }) => {
  await record(page, "TODO write the offline sync conflict policy");
  await record(page, "Should we expose receipts to every user?");
  await openTab(page, "Next");
  const next = page.locator(".td-next-card");
  await expect(next).toBeVisible();
  await expect(page.locator(".td-reasons li").first()).toBeVisible();
  const first = (await next.locator(".td-next-title p").innerText()).trim();
  await ws(page).getByRole("button", { name: "Skip for today" }).click();
  await expect(next.locator(".td-next-title p")).not.toHaveText(first);
  await ws(page).getByRole("button", { name: "Work on this" }).click();
  await expect(ws(page).getByRole("button", { name: /Mark done|Work on this/ })).toBeVisible();

  await openTab(page, "Review");
  await expect(page.getByText("How the system performed")).toBeVisible();
  const review = page.locator(".td-review");
  await expect(review.locator("div", { hasText: /^Model calls/ }).locator("dd")).toHaveText("0");
  await expect(review.locator("div", { hasText: /^Spend/ }).locator("dd")).toHaveText("$0.00");
});

test("keeps working offline and says so", async ({ page, context }) => {
  await context.setOffline(true);
  await expect(ws(page).getByText("Offline, still saving here")).toBeVisible();
  await record(page, "Worked on the offline path");
  await page.reload().catch(() => undefined); // a reload may fail offline; the open tab keeps working
  await context.setOffline(false);
  await openWorkspace(page);
  await expect(page.locator(".td-entry-text", { hasText: "Worked on the offline path" })).toBeVisible();
  await expect(page.getByText("Sync not set up").first()).toBeAttached();
});

test("/today redirects to the workspace on the homepage", async ({ page }) => {
  await openWorkspace(page, "/today");
  expect(new URL(page.url()).hash).toBe("#workspace");
});

test("the page is pitch black and the empty state demo respects reduced motion", async ({ page }) => {
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(0, 0, 0)");
  const loop = page.locator(".td-loop");
  if (await loop.count()) {
    const anim = await loop.locator(".td-loop-new").evaluate((el) => getComputedStyle(el).animationName);
    expect(anim).toBe("none");
  }
});

test("connects a GitHub repo and searches its issues alongside notes", async ({ page }) => {
  // GitHub is mocked: CI must not depend on api.github.com or its rate limits.
  await page.route("https://api.github.com/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/issues/comments")) return route.fulfill({ json: [{ issue_url: "https://api.github.com/repos/acme/web/issues/101", body: "Fixed by upgrading to 16.4.6", updated_at: "2026-10-03T00:00:00Z", author_association: "MEMBER" }] });
    return route.fulfill({
      headers: { etag: 'W/"v1"', "x-ratelimit-remaining": "59" },
      json: [
        { number: 101, title: "Turbopack dev server memory grows over time", body: "After a few hours the process uses 6 GB.", state: "open", html_url: "https://github.com/acme/web/issues/101", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-02T00:00:00Z", labels: [{ name: "bug" }], comments: 1 },
        { number: 102, title: "Hydration mismatch when rendering dates", body: "Server renders UTC, client renders local time.", state: "closed", html_url: "https://github.com/acme/web/issues/102", created_at: "2026-10-04T00:00:00Z", updated_at: "2026-10-05T00:00:00Z", labels: [], comments: 0, pull_request: {} },
      ],
    });
  });
  await record(page, "Learned that restarting the dev server daily hides the memory leak");
  await openTab(page, "Recall");
  const recall = ws(page).locator(".td-recall");
  await recall.getByText("Connect a GitHub repo").click();
  await recall.getByRole("textbox", { name: "Repository, as owner/repo" }).fill("https://github.com/acme/web");
  await recall.getByRole("button", { name: "Connect" }).click();
  await expect(recall.locator(".td-repos")).toContainText("acme/web");
  await expect(recall.locator(".td-repos")).toContainText("2 items");

  await ws(page).getByRole("searchbox").fill("dev server memory leak");
  await expect(recall.locator(".td-result").first()).toContainText("restarting the dev server");
  const repoHit = recall.locator(".td-result.is-repo").first();
  await expect(repoHit).toContainText("Turbopack dev server memory");
  await expect(repoHit.locator("a")).toHaveAttribute("href", "https://github.com/acme/web/issues/101");
  await expect(recall.locator(".td-receipt").last()).toContainText(/over 2 repo items/);

  // Kept in this browser across reloads; removing it removes its items.
  await openWorkspace(page);
  await openTab(page, "Recall");
  await expect(ws(page).locator(".td-repos")).toContainText("acme/web");
  await ws(page).locator(".td-repos").getByRole("button", { name: "Remove" }).click();
  await expect(ws(page).locator(".td-repos")).toHaveCount(0);
});

test("turns on semantic search when this build ships the model", async ({ page }) => {
  const status = await page.evaluate(async () => (await fetch("/models/Xenova/bge-small-en-v1.5/config.json")).status);
  test.skip(status !== 200, "model not bundled in this build");
  test.setTimeout(180_000);
  await record(page, "Learned that the dev server leaks memory over long sessions");
  await openTab(page, "Recall");
  const recall = ws(page).locator(".td-recall");
  await recall.getByRole("button", { name: "Turn on semantic search" }).click();
  await expect(recall.getByText("Semantic search on, running on this device")).toBeVisible({ timeout: 150_000 });
  await ws(page).getByRole("searchbox").fill("process RAM keeps increasing");
  await expect(recall.locator(".td-receipt").last()).toContainText("Semantic + keyword search");
});
