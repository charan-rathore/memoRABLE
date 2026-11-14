import { expect, test, type Page } from "@playwright/test";

/**
 * Semantic failure in the real UI, functional-only tree: when the model
 * cannot load, the existing alert appears and keyword search keeps working.
 * The failure is forced by aborting the model weight files only; the tiny
 * availability probe (config.json) is left intact so the control stays on.
 * The error-state retry action is a held UI change and is not exercised here.
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

test("model load failure shows the alert and keyword search keeps working", async ({ page }) => {
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
  await expect(alert).toContainText("The model didn't load", { timeout: 60_000 });
  await expect(alert).toContainText("Keyword search still works");

  // Keyword search still works in the error state.
  await ws(page).getByRole("searchbox").fill("dev server memory");
  await expect(recall.locator(".td-result").first()).toContainText("dev server leaks memory");

  // The error-state retry action is a separate UI change pending approval and
  // is NOT part of this functional-only tree; the functional retry path
  // (enableSemantic after a failure) is covered by unit tests.
});
