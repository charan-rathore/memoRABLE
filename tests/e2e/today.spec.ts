import { expect, test, type Page } from "@playwright/test";

/**
 * The daily journey on /today: capture -> recall -> next -> review, with
 * supersession, deletion, persistence across reloads, and offline use.
 * Everything runs in the browser; no network or model is involved.
 */

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/today");
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(" ");
  await expect(page.getByText("Saved on this device")).toBeVisible();
});

const entry = (page: Page) => page.getByRole("textbox", { name: "Entry text" });

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
  await expect(page.locator(".td-receipt")).toContainText(/matches? in/);

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
  await expect(page.locator(".td-receipt")).toContainText("No matches");
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
