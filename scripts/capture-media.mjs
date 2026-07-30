/**
 * Regenerates the marketing assets in public/media from the running app.
 *
 * Usage:
 *   npm run build && npm run start -- -p 3100
 *   node scripts/capture-media.mjs [baseURL]
 *
 * Every asset is captured from the real production build, so the screenshots in
 * the README can never drift from what the app actually renders. The replay
 * clip records the same 20-second story the app plays for a visitor.
 *
 * GIF conversion requires ffmpeg on PATH; without it the .webm is still written
 * and the script exits successfully.
 */
import { chromium } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdir, rm, readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);

const baseURL = process.argv[2] ?? "http://127.0.0.1:3100";
const outDir = path.resolve(fileURLToPath(new URL("../public/media", import.meta.url)));
const videoDir = path.join(outDir, ".video");

const DESKTOP = { width: 1440, height: 900 };
/** Matches REPLAY_MS in src/components/replay/use-replay.ts, plus a beat to land. */
const REPLAY_MS = 20_000;

async function captureScreens(browser) {
  const context = await browser.newContext({
    viewport: DESKTOP,
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();

  const shot = async (name) => {
    await page.screenshot({ path: path.join(outDir, name) });
    console.log(`captured ${name}`);
  };

  // 1 — Output first: the Atlas document is already remembered and published.
  await page.goto(baseURL, { waitUntil: "networkidle" });
  await page.locator("iframe[title='Document output preview']").waitFor();
  await page.getByText("6 memories").first().waitFor();
  await shot("01-document-first.png");

  // 2 — Six memories with the provenance inspector open on Signals.
  await page.getByRole("button", { name: "Signals — quarter over quarter — show details" }).click();
  const inspector = page.getByTestId("inspector");
  await inspector.getByText("Remembered from").waitFor();
  await shot("02-memories-provenance.png");

  // 3 — One memory, three outputs, side by side.
  await page.locator(".topbar").getByRole("button", { name: "Publish", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("heading", { name: "Published." }).waitFor();
  await page.waitForTimeout(600); // let the three preview iframes settle
  await shot("03-published-three-outputs.png");

  await context.close();
}

async function captureReplay(browser) {
  await rm(videoDir, { recursive: true, force: true });
  const context = await browser.newContext({
    viewport: DESKTOP,
    recordVideo: { dir: videoDir, size: DESKTOP },
  });
  // Recording begins with the first page, so measure the lead-in and trim it
  // later — the GIF should open on the story, not on a static page.
  const startedAt = Date.now();
  const page = await context.newPage();

  await page.goto(baseURL, { waitUntil: "networkidle" });
  await page.locator("iframe[title='Document output preview']").waitFor();

  await page.getByRole("button", { name: "Replay the 20-second story" }).click();
  await page.locator(".replay-banner").waitFor();
  const leadInMs = Date.now() - startedAt;

  await page.waitForTimeout(REPLAY_MS);

  await context.close(); // flushes the video file
  const [file] = await readdir(videoDir);
  return { webm: path.join(videoDir, file), leadInMs };
}

async function toGif({ webm, leadInMs }) {
  const gif = path.join(outDir, "replay.gif");
  const palette = path.join(videoDir, "palette.png");
  const filters = "fps=10,scale=900:-1:flags=lanczos";
  const trim = ["-ss", (leadInMs / 1000).toFixed(2), "-t", String(REPLAY_MS / 1000)];

  // The UI is flat editorial colour, so a small palette with no dithering keeps
  // the file small without visible banding.
  await run("ffmpeg", [
    "-y", ...trim, "-i", webm,
    "-vf", `${filters},palettegen=max_colors=96:stats_mode=diff`,
    palette,
  ]);
  await run("ffmpeg", [
    "-y",
    ...trim,
    "-i", webm,
    "-i", palette,
    "-lavfi", `${filters}[x];[x][1:v]paletteuse=dither=none:diff_mode=rectangle`,
    gif,
  ]);
  return gif;
}

const browser = await chromium.launch();
try {
  await mkdir(outDir, { recursive: true });

  await captureScreens(browser);

  const replay = await captureReplay(browser);
  console.log("captured replay video");

  try {
    const gif = await toGif(replay);
    console.log(`captured ${path.basename(gif)}`);
  } catch (error) {
    console.warn(`GIF conversion skipped (is ffmpeg installed?): ${error.message}`);
  }

  await rm(videoDir, { recursive: true, force: true });
  console.log(`\nAssets written to ${outDir}`);
} finally {
  await browser.close();
}
