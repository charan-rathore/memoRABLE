import { expect, test } from "@playwright/test";

/**
 * The story view: a document told one screen at a time. Checked as a reader
 * meets it: every beat is there in order, the numbers end on the document's
 * own values, the workbench hands over what was imported, and print gives
 * one finished page per beat.
 */

test("tells the sample brief as seven beats, ending on the document's own numbers", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/story");
  await expect(page.getByRole("heading", { level: 1, name: "Momentum, with room to compound." })).toBeVisible();
  await expect(page.locator(".sd-ch")).toHaveCount(7);
  for (const label of ["four numbers moved.", "two of four done.", "two decided, one open.", "one thing could stop it."]) {
    await expect(page.getByRole("heading", { name: label })).toHaveCount(1);
  }
  // Scroll to where the numbers chapter has finished building: every counted-up
  // value lands on exactly what the source wrote.
  await page.evaluate(() => {
    const ch = document.querySelector<HTMLElement>(".sd-k-numbers")!;
    window.scrollTo(0, ch.offsetTop + ch.offsetHeight - 2 * window.innerHeight + 4);
  });
  await page.waitForTimeout(800);
  await expect(page.locator("[data-value]")).toHaveText(["$4.2M", "121%", "19 mo", "34"]);
  expect(errors).toEqual([]);
});

test("plays what the workbench imported, not the sample", async ({ page, isMobile }) => {
  test.skip(isMobile, "on phones the preview, and the link above it, sit behind the Publish tab");
  await page.goto("/");
  await page.getByTestId("brand-splash").waitFor({ state: "detached" });
  await page.getByRole("button", { name: "Open a sample brief" }).click();
  await page.locator(".shell").waitFor();
  await page.getByRole("link", { name: "Play as a story" }).click();
  await expect(page).toHaveURL(/\/story$/);
  await expect(page.locator(".sd-ch").first()).toBeVisible();
  const stored = await page.evaluate(() => sessionStorage.getItem("memorable.story.v1"));
  expect(stored).toContain("\"blocks\"");
});

test("prints one finished page per beat", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/story");
  await page.emulateMedia({ media: "print" });
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  const pdf = await page.pdf({ format: "A4", landscape: true, printBackground: true, preferCSSPageSize: true });
  const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  expect(pages).toBe(7);
});
