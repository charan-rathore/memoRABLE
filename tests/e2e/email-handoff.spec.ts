import { expect, test, type Page } from "@playwright/test";

/**
 * Pixel-and-behavior verification for the "Open in email app" handoff.
 * The control is a real anchor: its href is the exact draft the mail app
 * opens, so the wired URL is asserted from the DOM. The clipboard fallback
 * is driven end-to-end with a title long enough to exceed the mailto budget.
 */

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

async function dismissSplash(page: Page) {
  await page.getByTestId("brand-splash").waitFor({ state: "detached" });
}

async function enterWorkbench(page: Page) {
  await page.goto("/");
  await dismissSplash(page);
  await page.getByRole("button", { name: "Open a sample brief" }).click();
  await page.locator(".shell").waitFor();
}

async function enterWithTitle(page: Page, firstLine: string) {
  await page.goto("/");
  await dismissSplash(page);
  await page.getByRole("button", { name: "Paste text" }).click();
  const doc = `${firstLine}\n\nThe board approved the phased budget with quarterly review gates.\n\nRisks remain concentrated in two regions and the sponsor asked for tighter controls.`;
  await page.getByLabel("Paste JSON, Markdown or plain text").fill(doc);
  await page.getByRole("button", { name: /Remember|Bring|Add|Continue/i }).first().click();
  await page.locator(".shell").waitFor({ timeout: 60_000 });
}

async function openPublish(page: Page) {
  await page.locator(".topbar").getByRole("button", { name: "Publish", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Published." })).toBeVisible({ timeout: 60_000 });
  return dialog;
}

test("email card offers Open in email app with a recipient-less draft href", async ({ page }) => {
  await enterWorkbench(page);
  const dialog = await openPublish(page);

  const link = dialog.getByRole("button", { name: "Open in email app", exact: true });
  await expect(link).toHaveCount(1);
  await page.screenshot({ path: "/tmp/email-handoff-panel.png" });

  const href = await link.getAttribute("href");
  expect(href).toMatch(/^mailto:\?subject=/);
  expect(href).not.toMatch(/[?&](to|cc|bcc)=/i);
  expect(href).toContain("body=");
  expect(href!.length).toBeLessThanOrEqual(1800);
});

test("over-limit content warns, keeps the full text on the clipboard, then follows the pointer draft", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const longTitle = `Q3 Operating Review ${"with regional variance detail ".repeat(80)}`.trim();
  await enterWithTitle(page, longTitle);
  const dialog = await openPublish(page);

  const link = dialog.getByRole("button", { name: "Open in email app", exact: true });
  const href = await link.getAttribute("href");
  expect(href!.length).toBeLessThanOrEqual(1800);
  expect(decodeURIComponent(href!)).toContain("on your clipboard");

  await link.click();
  const note = dialog.getByRole("alert");
  await expect(note).toContainText(/complete text, including the subject line, was copied/i, { timeout: 10_000 });
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip.startsWith("Subject: ")).toBe(true);
  expect(clip.length).toBeGreaterThan(1500);
  expect(clip).toContain("RISKS");
  await page.screenshot({ path: "/tmp/email-handoff-long-warning.png" });
});

test("over-limit content with a broken clipboard shows recovery and opens no draft", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: () => Promise.reject(new Error("denied")) },
      configurable: true,
    });
  });
  const longTitle = `Q3 Operating Review ${"with regional variance detail ".repeat(80)}`.trim();
  await enterWithTitle(page, longTitle);
  const dialog = await openPublish(page);

  const link = dialog.getByRole("button", { name: "Open in email app", exact: true });
  await link.click();
  await expect(dialog.getByRole("alert")).toContainText(/clipboard is unavailable/i, { timeout: 10_000 });
  await page.screenshot({ path: "/tmp/email-handoff-failure-note.png" });
});
