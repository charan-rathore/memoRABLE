import { expect, test, type Page } from "@playwright/test";

/**
 * End-to-end coverage of the five-verb journey:
 * Bring → Understand → Remember → Arrange → Publish.
 * Runs against the production build (playwright.config webServer).
 */

const MEMORY_NAMES = [
  "Snapshot",
  "Signals",
  "Timeline",
  "Risks",
  "Decisions",
  "Actions",
];

// Entrance animations. the brand splash above all. settle immediately, so
// tests wait on state rather than on choreography.
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

function memNames(page: Page) {
  return page.locator("ul[aria-label='Memory Blocks in order'] .mem .name");
}

/**
 * The app opens on the home screen. Every workbench test starts by bringing
 * the board brief in, which is also the journey a first-time visitor takes.
 */
async function dismissOverlays(page: Page) {
  // The brand splash covers the page while it plays; under reduced motion this
  // is a short hold. The first-visit demo may then open on top.
  await page.getByTestId("brand-splash").waitFor({ state: "detached" });
  const demo = page.getByTestId("demo-video");
  if (await demo.count()) {
    await demo.getByRole("button", { name: "Close demo" }).click();
    await demo.waitFor({ state: "detached" });
  }
}

async function enterWorkbench(page: Page) {
  await page.goto("/");
  await dismissOverlays(page);
  await page.getByRole("button", { name: "Open a sample brief" }).click();
  await page.locator(".shell").waitFor();
}

async function openMobileTab(page: Page, tab: "Bring" | "Memories" | "Publish", isMobile: boolean) {
  if (isMobile) {
    await page
      .getByRole("navigation", { name: "Workbench sections" })
      .getByRole("button", { name: tab, exact: true })
      .click();
  }
}

test.describe("home screen", () => {
  test("offers exactly two ways in, and nothing else", async ({ page }) => {
    await page.goto("/");
    await dismissOverlays(page);

    const home = page.getByTestId("home-screen");
    await expect(home.getByRole("heading", { name: "Turn information into memory." })).toBeVisible();
    await expect(home.locator(".home-card")).toHaveCount(2);
    await expect(home.getByText("Drop a file")).toBeVisible();
    await expect(home.getByText("Paste text")).toBeVisible();

    // None of the workbench is on show before there is anything to work on.
    await expect(page.locator(".shell")).toHaveCount(0);
    await expect(page.locator(".journey")).toHaveCount(0);
    await expect(page.locator("iframe")).toHaveCount(0);
  });

  test("the brand splash plays every time the home screen loads", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("brand-splash")).toBeVisible();
    await dismissOverlays(page);
    await expect(page.getByTestId("home-screen")).toBeVisible();

    // A full reload must play the splash again. it is not a once-per-session toll.
    await page.reload();
    await expect(page.getByTestId("brand-splash")).toBeVisible();
    await page.getByTestId("brand-splash").waitFor({ state: "detached" });
  });

  test("pasting text moves the visitor into the workbench", async ({ page }) => {
    await page.goto("/");
    await dismissOverlays(page);

    await page.getByRole("button", { name: /Paste text/ }).click();
    await page
      .getByLabel("Paste JSON, Markdown or plain text")
      .fill("# Field notes\n\nThe pilot held.\n\n## Risks\n\n- Vendor lead times slipped\n");
    await page.getByRole("button", { name: "Remember this" }).click();

    await expect(page.locator(".shell")).toBeVisible();
    await expect(page.locator(".doc-title .t")).toHaveText("Field notes");
    await expect(memNames(page)).toHaveCount(6);
  });

  test("the wordmark returns to the start", async ({ page }) => {
    await enterWorkbench(page);
    await page.getByRole("button", { name: "memoRABLE home" }).click();
    await page.getByTestId("brand-splash").waitFor({ state: "detached" });
    await expect(page.getByTestId("home-screen")).toBeVisible();
    await expect(page.locator(".shell")).toHaveCount(0);
  });

  test("counts what this browser has done, and says where the count lives", async ({ page }) => {
    await page.goto("/");
    await dismissOverlays(page);

    // A first visit has nothing to report, and three zeros are worse than silence.
    await expect(page.getByTestId("local-tally")).toHaveCount(0);

    await page.getByRole("button", { name: "Open a sample brief" }).click();
    await page.locator(".shell").waitFor();
    await page.getByRole("button", { name: "memoRABLE home" }).click();
    await page.getByTestId("brand-splash").waitFor({ state: "detached" });

    const tally = page.getByTestId("local-tally");
    await expect(tally).toContainText("1 document remembered · 6 memories");
    await expect(tally).toContainText("counted in this browser and nowhere else");
  });

  test("has no critical or serious accessibility violations", async ({ page }) => {
    const { AxeBuilder } = await import("@axe-core/playwright");
    await page.goto("/");
    await dismissOverlays(page);
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});

test.describe("the brief in the workbench", () => {
  test("arrives already remembered as six blocks", async ({ page }) => {
    await enterWorkbench(page);

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
    await enterWorkbench(page);
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
    await enterWorkbench(page);
    await openMobileTab(page, "Bring", isMobile);

    await page.getByRole("button", { name: /Bring something else/ }).click();
    await page.getByRole("button", { name: "Paste", exact: true }).click();
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

  test("the Markdown example is recognized locally and lands on the Document output", async ({
    page,
    isMobile,
  }) => {
    await enterWorkbench(page);
    await openMobileTab(page, "Bring", isMobile);

    await page.getByRole("button", { name: /Bring something else/ }).click();
    await page.getByRole("button", { name: /Launch notes/ }).click();

    await expect(memNames(page)).toHaveCount(6);
    await expect(page.locator(".doc-title .t")).toHaveText("Atlas Launch Notes");
    await openMobileTab(page, "Publish", isMobile);
    // Document-first: every import lands on the Document output.
    await expect(page.locator("iframe[title='Document output preview']")).toBeAttached();
    await expect(
      page.getByRole("button", { name: "Document", exact: true }).first(),
    ).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("remember + arrange", () => {
  test("selecting a memory shows 'Remembered from' provenance and the source excerpt", async ({
    page,
    isMobile,
  }) => {
    await enterWorkbench(page);
    await openMobileTab(page, "Memories", isMobile);

    await page.getByRole("button", { name: "Signals: show details" }).click();

    const inspector = page.getByTestId("inspector");
    await expect(inspector.getByText("Remembered from")).toBeVisible();
    await expect(inspector.getByText("Exact JSON")).toBeVisible();
    await expect(inspector.getByText(/blocks\[1\]/)).toBeVisible();
  });

  test("up/down buttons rearrange the memories and the new order sticks", async ({ page, isMobile }) => {
    test.skip(isMobile === true, "arrange is covered on desktop");
    await enterWorkbench(page);

    await page.getByRole("button", { name: "Signals: show details" }).click();
    await page.getByRole("button", { name: "Move Signals down" }).click();

    await expect(memNames(page)).toHaveText([
      "Snapshot",
      "Timeline",
      "Signals",
      "Risks",
      "Decisions",
      "Actions",
    ]);

    // Edge controls: the first memory cannot move up, the last cannot move down.
    await page.getByRole("button", { name: "Snapshot: show details" }).click();
    await expect(page.getByRole("button", { name: "Move Snapshot up" })).toBeDisabled();
    await page.getByRole("button", { name: "Actions: show details" }).click();
    await expect(page.getByRole("button", { name: "Move Actions down" })).toBeDisabled();
  });
});

test.describe("publish", () => {
  test("mode switch swaps the sandboxed preview", async ({ page, isMobile }) => {
    await enterWorkbench(page);
    await openMobileTab(page, "Publish", isMobile);

    await page.getByRole("button", { name: "Email", exact: true }).click();
    await expect(page.locator("iframe[title='Email output preview']")).toBeAttached();

    await page.getByRole("button", { name: "Document", exact: true }).click();
    await expect(page.locator("iframe[title='Document output preview']")).toBeAttached();
  });

  test("Publish ends on 'Published.' with working downloads", async ({ page }) => {
    await enterWorkbench(page);
    await page.locator(".topbar").getByRole("button", { name: "Publish", exact: true }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Published." })).toBeVisible();
    await expect(dialog.getByText("one memory, three useful outputs")).toBeVisible();

    // Three output cards, each offering HTML, PDF, Word and design JSON.
    const htmlButtons = dialog.getByRole("button", { name: "HTML", exact: true });
    await expect(htmlButtons).toHaveCount(3);
    await expect(dialog.getByRole("button", { name: "PDF", exact: true })).toHaveCount(3);
    await expect(dialog.getByRole("button", { name: "Word", exact: true })).toHaveCount(3);

    const downloadPromise = page.waitForEvent("download");
    await htmlButtons.first().click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/-web\.html$/);

    const wordPromise = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Word", exact: true }).first().click();
    const word = await wordPromise;
    expect(word.suggestedFilename()).toMatch(/-web\.doc$/);

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
    await enterWorkbench(page);

    await page.getByRole("button", { name: "Replay the 20-second story" }).click();
    // Reduced motion collapses the choreography to its end state, so the
    // banner's wording depends on the setting. that it narrates at all does not.
    const banner = page.locator(".replay-banner");
    await expect(banner).toBeVisible();
    await expect(banner.locator(".rb-msg")).not.toBeEmpty();

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
    await enterWorkbench(page);

    const tabs = page.getByRole("navigation", { name: "Workbench sections" });
    await expect(tabs).toBeVisible();

    // Default tab is Publish. the preview is front and center.
    await expect(page.locator("iframe[title='Document output preview']")).toBeAttached();

    await tabs.getByRole("button", { name: "Memories" }).click();
    await expect(memNames(page)).toHaveCount(6);

    await tabs.getByRole("button", { name: "Bring" }).click();
    await expect(page.getByRole("button", { name: /Bring something else/ })).toBeVisible();
  });
});
