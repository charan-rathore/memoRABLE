import { expect, test, type Page } from "@playwright/test";

/**
 * Semantic failure recovery in the real UI: when the model cannot load, the
 * existing alert appears, keyword search keeps working, and the person can
 * retry with the same "Turn on semantic search" action until it is ready.
 * The failure is forced by aborting the model weight files only; the tiny
 * availability probe (config.json) is left intact so the control stays on.
 */

const ws = (page: Page) => page.locator("#workspace");

async function openWorkspace(page: Page, path = "/") {
  await page.goto(path);
  await page.getByTestId("brand-splash").waitFor({ state: "detached" });
  await ws(page).scrollIntoViewIfNeeded();
  await expect(ws(page).getByText("Saved on this device")).toBeVisible();
}

async function openTab(page: Page, name: "Recall" | "Next" | "Review" | "Today") {
  const tabs = ws(page).getByRole("navigation", { name: "Sections" });
  if (await tabs.isVisible()) await tabs.getByRole("button", { name }).click();
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  // Fail the model download, not the availability probe.
  await page.route("**/models/**", (route) => {
    if (route.request().url().endsWith("config.json")) return route.continue();
    return route.abort();
  });
  await openWorkspace(page);
});

test("model load failure shows the alert, keeps keyword search, and the retry action recovers", async ({ page }, testInfo) => {
  const status = await page.evaluate(async () => (await fetch("/models/Xenova/bge-small-en-v1.5/config.json")).status);
  test.skip(status !== 200, "model not bundled in this build");
  test.setTimeout(180_000);

  // Something to find by keyword while semantic is broken.
  await openTab(page, "Today");
  const entry = ws(page).getByRole("textbox", { name: "Entry text" });
  await entry.fill("Learned that the dev server leaks memory over long sessions");
  await entry.press("ControlOrMeta+Enter");
  await expect(page.locator(".td-entry-text", { hasText: "dev server leaks memory" }).first()).toBeVisible();

  // Turn it on: the aborted download fails fast, the alert and retry action appear.
  await openTab(page, "Recall");
  const recall = ws(page).locator(".td-recall");
  await recall.getByRole("button", { name: "Turn on semantic search" }).click();
  const alert = recall.getByRole("alert");
  await expect(alert).toContainText("Semantic search isn't working right now", { timeout: 60_000 });
  await expect(alert).toContainText("Keyword search still works");
  const retry = recall.getByRole("button", { name: "Turn on semantic search" });
  await expect(retry).toBeVisible();

  // The raw cause stays tucked away until asked for.
  const details = recall.locator("details", { has: page.getByText("Technical details") });
  await expect(details.getByText("/models/Xenova/bge-small-en-v1.5", { exact: false })).toBeHidden();

  // Keyword search still works in the error state.
  await ws(page).getByRole("searchbox").fill("dev server memory");
  await expect(recall.locator(".td-result").first()).toContainText("dev server leaks memory");
  await page.screenshot({ path: testInfo.outputPath("ui-error-state.png"), fullPage: false });

  // Opening Technical details reveals the raw cause.
  await details.locator("summary").click();
  await expect(details.getByText("/models/Xenova/bge-small-en-v1.5", { exact: false })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("ui-error-details-open.png"), fullPage: false });

  // Restore the network and retry with the same action: it becomes ready.
  await page.unroute("**/models/**");
  await retry.click();
  await expect(recall.getByText("Semantic search on, running on this device")).toBeVisible({ timeout: 150_000 });
  await expect(recall.getByRole("alert")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("ui-retry-ready.png"), fullPage: false });
});
