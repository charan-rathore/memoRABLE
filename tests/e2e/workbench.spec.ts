import { expect, test, type Page } from "@playwright/test";

/**
 * End-to-end coverage of the five-verb journey:
 * Bring → Understand → Remember → Arrange → Publish.
 * Runs against the production build (playwright.config webServer).
 */

const MEMORY_NAMES = [
  "Snapshot",
  "Signals — quarter over quarter",
  "Timeline — H2 2026",
  "Risks — 3 open",
  "Decisions — 2 settled · 1 requested",
  "Action Items — 3 open",
];

function memNames(page: Page) {
  return page.locator("ul[aria-label='Memory Blocks in order'] .mem .name");
}

async function openMobileTab(page: Page, tab: "Bring" | "Memories" | "Publish", isMobile: boolean) {
  if (isMobile) {
    await page
      .getByRole("navigation", { name: "Workbench sections" })
      .getByRole("button", { name: tab, exact: true })
      .click();
  }
}

test.describe("preloaded document", () => {
  test("opens with the Atlas brief already remembered as six blocks", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/memoRABLE/i);
    await expect(page.locator(".doc-title .t")).toHaveText("Q3 Board Report");
    await expect(memNames(page)).toHaveText(MEMORY_NAMES.map((n) => n)); // exact order, all six

    // Document-first: the default output is the Document preview in a sandboxed iframe.
    const frame = page.frameLocator("iframe[title='Document output preview']");
    await expect(frame.locator("text=Momentum, with room to compound.").first()).toBeVisible();

    // The journey strip shows the completed story.
    await expect(page.getByText("6 memories").first()).toBeVisible();
  });

  test("has no critical or serious accessibility violations", async ({ page }) => {
    test.slow();
    const { AxeBuilder } = await import("@axe-core/playwright");
    await page.goto("/");
    // The preview iframe is visible in every layout (mobile's default tab is Publish).
    await page.locator("iframe[title='Document output preview']").waitFor();
    // Scope to the app shell: the previews are `sandbox=""` iframes, so axe can
    // never get its script into them and would block until the test times out.
    const results = await new AxeBuilder({ page }).exclude("iframe").analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});

test.describe("bring + understand", () => {
  test("invalid JSON is rejected all-or-nothing with a friendly error and last-good intact", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/");
    await openMobileTab(page, "Bring", isMobile);

    await page.getByRole("button", { name: "Paste" }).click();
    await page.getByLabel("Paste JSON, Markdown or plain text").fill('{"version": 1, "title": "broken"');
    await page.getByRole("button", { name: "Remember this information" }).click();

    const alert = page.locator(".error-box[role='alert']");
    await expect(alert).toContainText("Nothing was changed");
    await expect(alert).toContainText("line");

    // Last good is untouched: all six memories, document preview still there.
    await expect(memNames(page)).toHaveCount(6);
    await openMobileTab(page, "Publish", isMobile);
    await expect(page.locator("iframe[title='Document output preview']")).toBeAttached();
  });

  test("the Markdown example is recognized locally and switches to the Web output", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/");
    await openMobileTab(page, "Bring", isMobile);

    await page.getByRole("button", { name: "Launch notes · Markdown" }).click();

    await expect(memNames(page)).toHaveCount(6);
    await expect(page.locator(".doc-title .t")).toHaveText("Atlas Launch Notes");
    await openMobileTab(page, "Publish", isMobile);
    // A fresh import flips the preview to the Web page output.
    await expect(page.locator("iframe[title='Web page output preview']")).toBeAttached();
    await expect(
      page.getByRole("button", { name: "Web page" }).first(),
    ).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("remember + arrange", () => {
  test("selecting a memory shows 'Remembered from' provenance and the source excerpt", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/");
    await openMobileTab(page, "Memories", isMobile);

    await page.getByRole("button", { name: "Signals — quarter over quarter — show details" }).click();

    const inspector = page.getByTestId("inspector");
    await expect(inspector.getByText("Remembered from")).toBeVisible();
    await expect(inspector.getByText("Exact JSON")).toBeVisible();
    await expect(inspector.getByText(/blocks\[1\]/)).toBeVisible();
  });

  test("up/down buttons rearrange the memories and the new order sticks", async ({ page, isMobile }) => {
    test.skip(isMobile === true, "arrange is covered on desktop");
    await page.goto("/");

    await page.getByRole("button", { name: "Signals — quarter over quarter — show details" }).click();
    await page.getByRole("button", { name: "Move Signals — quarter over quarter down" }).click();

    await expect(memNames(page)).toHaveText([
      "Snapshot",
      "Timeline — H2 2026",
      "Signals — quarter over quarter",
      "Risks — 3 open",
      "Decisions — 2 settled · 1 requested",
      "Action Items — 3 open",
    ]);

    // Edge controls: the first memory cannot move up, the last cannot move down.
    await page.getByRole("button", { name: "Snapshot — show details" }).click();
    await expect(page.getByRole("button", { name: "Move Snapshot up" })).toBeDisabled();
    await page.getByRole("button", { name: "Action Items — 3 open — show details" }).click();
    await expect(page.getByRole("button", { name: "Move Action Items — 3 open down" })).toBeDisabled();
  });
});

test.describe("publish", () => {
  test("mode switch swaps the sandboxed preview", async ({ page, isMobile }) => {
    await page.goto("/");
    await openMobileTab(page, "Publish", isMobile);

    await page.getByRole("button", { name: "Email", exact: true }).click();
    await expect(page.locator("iframe[title='Email output preview']")).toBeAttached();

    await page.getByRole("button", { name: "Document", exact: true }).click();
    await expect(page.locator("iframe[title='Document output preview']")).toBeAttached();
  });

  test("Publish ends on 'Published.' with working downloads", async ({ page }) => {
    await page.goto("/");
    await page.locator(".topbar").getByRole("button", { name: "Publish", exact: true }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Published." })).toBeVisible();
    await expect(dialog.getByText("one memory, three useful outputs")).toBeVisible();

    // Three output cards, each with a downloadable HTML export.
    const htmlButtons = dialog.getByRole("button", { name: "Download HTML" });
    await expect(htmlButtons).toHaveCount(3);

    const downloadPromise = page.waitForEvent("download");
    await htmlButtons.first().click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/-web\.html$/);

    const canonicalPromise = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "memoRABLE JSON (canonical)" }).click();
    const canonical = await canonicalPromise;
    expect(canonical.suggestedFilename()).toMatch(/\.memorable\.json$/);

    await dialog.getByRole("button", { name: "Close publish panel" }).click();
    await expect(dialog).not.toBeVisible();
  });
});

test.describe("replay", () => {
  test("the story starts instantly and Escape stops it, restoring state", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Replay the 20-second story" }).click();
    const banner = page.locator(".replay-banner");
    await expect(banner).toContainText("Turn information into memory.");

    await page.keyboard.press("Escape");
    await expect(banner).not.toBeVisible();

    // Everything restored: still the Atlas document, all six memories.
    await expect(page.locator(".doc-title .t")).toHaveText("Q3 Board Report");
    await expect(memNames(page)).toHaveCount(6);
  });
});

test.describe("mobile shell", () => {
  test("bottom tabs switch between Bring, Memories and Publish", async ({ page, isMobile }) => {
    test.skip(!isMobile, "mobile-only layout");
    await page.goto("/");

    const tabs = page.getByRole("navigation", { name: "Workbench sections" });
    await expect(tabs).toBeVisible();

    // Default tab is Publish — the preview is front and center.
    await expect(page.locator("iframe[title='Document output preview']")).toBeAttached();

    await tabs.getByRole("button", { name: "Memories" }).click();
    await expect(memNames(page)).toHaveCount(6);

    await tabs.getByRole("button", { name: "Bring" }).click();
    await expect(page.getByRole("button", { name: "Launch notes · Markdown" })).toBeVisible();
  });
});
