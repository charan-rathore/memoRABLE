/**
 * Hackathon demo reel — picture + quiet music bed (no TTS).
 * You record voice separately; see docs/demo-voiceover-script.md.
 *
 * Chapters:
 *   Title → Product story → User research (3 feedbacks) →
 *   Zoom on 44,859 AI line edits → memoRABLE × Unlayer end card
 *
 * Usage:
 *   SKIP_SHOTS=1 node scripts/make-demo-video.mjs [baseURL]
 */
import { chromium } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdir, rm, readdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";

const run = promisify(execFile);

const baseURL = process.argv[2] ?? "https://memo-rable.vercel.app";
const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const outDir = path.join(root, "public", "media");
const researchDir = path.join(outDir, "research");
const workDir = path.join(outDir, ".demo-work");
const W = 1440;
const H = 900;
const FPS = 30;
const XFADE = 0.5;
const CRF = 14;
const PRESET = "medium";
/** Picture + VO length. Voice plays at 1× — never time-stretched. */
const TARGET_SEC = 60;
const VO_RAW = path.join(researchDir, "voiceover-raw.m4a");

const END_CARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  @import url("https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:wght@400;500;600&display=swap");
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 100%; height: 100%; overflow: hidden; background: #0c0c0c; color: #f4f1ea; }
  body {
    font-family: "DM Sans", system-ui, sans-serif;
    display: grid; place-items: center;
    background:
      radial-gradient(ellipse 80% 60% at 20% 20%, rgba(232, 88, 68, 0.18), transparent 55%),
      radial-gradient(ellipse 70% 50% at 85% 75%, rgba(90, 120, 255, 0.12), transparent 50%),
      #0c0c0c;
  }
  .stage { width: 100%; max-width: 1100px; padding: 48px; text-align: center; }
  .eyebrow {
    font-size: 13px; letter-spacing: 0.22em; text-transform: uppercase;
    color: rgba(244,241,234,0.55); font-weight: 500;
    opacity: 0; animation: rise 0.7s 0.15s cubic-bezier(.2,.8,.2,1) forwards;
  }
  .line {
    margin: 28px 0 36px; font-family: "Instrument Serif", Georgia, serif;
    font-size: clamp(40px, 5.2vw, 68px); line-height: 1.08; font-weight: 400;
  }
  .morph { display: inline-block; min-height: 1.15em;
    opacity: 0; animation: rise 0.8s 0.35s cubic-bezier(.2,.8,.2,1) forwards; }
  .brands {
    display: flex; align-items: center; justify-content: center; gap: 28px;
    margin-top: 8px; opacity: 0;
    animation: rise 0.8s 1.1s cubic-bezier(.2,.8,.2,1) forwards;
  }
  .brand { display: flex; align-items: center; gap: 12px; font-size: 22px; font-weight: 600; letter-spacing: -0.02em; }
  .mark { width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center; overflow: hidden; }
  .mark-m {
    background: linear-gradient(145deg, #1a1a1a, #2a2a2a);
    border: 1px solid rgba(244,241,234,0.18);
    color: #f4f1ea; font-family: "Instrument Serif", Georgia, serif; font-size: 22px; font-style: italic;
  }
  .mark-u { background: #fff; padding: 6px; }
  .mark-u img { width: 100%; height: 100%; object-fit: contain; }
  .x {
    width: 28px; height: 28px; border-radius: 999px;
    border: 1px solid rgba(244,241,234,0.25);
    display: grid; place-items: center; color: rgba(244,241,234,0.55); font-size: 13px;
  }
  .sub {
    margin-top: 28px; font-size: 16px; color: rgba(244,241,234,0.62);
    opacity: 0; animation: rise 0.7s 1.45s cubic-bezier(.2,.8,.2,1) forwards;
  }
  .pixels {
    position: fixed; inset: 0; pointer-events: none;
    background: repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.015) 3px, rgba(255,255,255,0.015) 4px);
    mix-blend-mode: soft-light; opacity: 0; animation: fade 1.2s 0.2s forwards;
  }
  .burst {
    position: absolute; inset: 0; pointer-events: none;
    background: radial-gradient(circle at 50% 48%, rgba(232,88,68,0.22), transparent 35%);
    opacity: 0; animation: pulse 1.8s 1.2s ease-out forwards;
  }
  @keyframes rise {
    from { opacity: 0; transform: translateY(18px); filter: blur(8px); }
    to { opacity: 1; transform: translateY(0); filter: blur(0); }
  }
  @keyframes fade { to { opacity: 1; } }
  @keyframes pulse {
    0% { opacity: 0; transform: scale(0.85); }
    35% { opacity: 1; }
    100% { opacity: 0.35; transform: scale(1.15); }
  }
</style>
</head>
<body>
  <div class="pixels"></div>
  <div class="burst"></div>
  <div class="stage">
    <p class="eyebrow">Memory Engine · Elements Composition</p>
    <h1 class="line"><span class="morph" id="morph"></span></h1>
    <div class="brands">
      <div class="brand">
        <span class="mark mark-m" aria-hidden="true">m</span>
        <span>memoRABLE</span>
      </div>
      <span class="x" aria-hidden="true">×</span>
      <div class="brand">
        <span class="mark mark-u" aria-hidden="true"><img src="/unlayer-mark.png" alt="" /></span>
        <span>Unlayer Elements</span>
      </div>
    </div>
    <p class="sub">One understanding. Email · Web · Document. Grounded to the source.</p>
  </div>
<script>
  const phrases = [
    "Turn information into memory.",
    "Six grounded memories.",
    "Composed with Elements.",
    "memoRABLE × Unlayer.",
  ];
  const el = document.getElementById("morph");
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz·×";
  async function scrambleTo(target, duration = 900) {
    const start = performance.now();
    const len = target.length;
    await new Promise((resolve) => {
      function frame(now) {
        const t = Math.min(1, (now - start) / duration);
        const reveal = Math.floor(t * len);
        let out = "";
        for (let i = 0; i < len; i++) {
          if (target[i] === " ") { out += " "; continue; }
          out += i < reveal ? target[i] : chars[(Math.random() * chars.length) | 0];
        }
        el.textContent = out;
        if (t < 1) requestAnimationFrame(frame);
        else { el.textContent = target; resolve(); }
      }
      requestAnimationFrame(frame);
    });
  }
  (async () => {
    for (let i = 0; i < phrases.length; i++) {
      await scrambleTo(phrases[i], i === 0 ? 1100 : 850);
      await new Promise((r) => setTimeout(r, i === phrases.length - 1 ? 1600 : 550));
    }
  })();
</script>
</body>
</html>`;

function researchSlideHtml({ eyebrow, title, imageSrc, holdMs, mode }) {
  const isZoom = mode === "zoom-lines";
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<style>
@import url("https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:wght@400;500;600&display=swap");
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:100%;height:100%;overflow:hidden;background:#0b0b0c;color:#f4f1ea;font-family:"DM Sans",system-ui,sans-serif}
body{display:grid;place-items:center;
  background:radial-gradient(ellipse 70% 55% at 50% 30%,rgba(80,120,255,.1),transparent 55%),#0b0b0c}
.frame{width:100%;height:100%;display:grid;grid-template-rows:auto 1fr;padding:36px 48px 28px;gap:18px}
.copy{text-align:center;z-index:2}
.eyebrow{font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:rgba(244,241,234,.5);
  opacity:0;animation:in .55s .08s forwards}
h1{font-family:"Instrument Serif",Georgia,serif;font-weight:400;font-size:clamp(28px,3.2vw,42px);
  margin-top:10px;line-height:1.15;opacity:0;animation:in .65s .2s forwards}
.stage{position:relative;border-radius:18px;overflow:hidden;
  border:1px solid rgba(255,255,255,.08);
  box-shadow:0 30px 80px rgba(0,0,0,.55);
  background:#111;opacity:0;animation:in .7s .28s forwards}
.stage img{width:100%;height:100%;object-fit:contain;display:block;background:#0e0e10}
${isZoom ? `
.stage{overflow:hidden}
.stage img{
  object-fit:cover;object-position:50% 72%;
  transform-origin:22% 78%;
  animation:zoomLines ${Math.max(holdMs - 200, 1200)}ms cubic-bezier(.2,.7,.2,1) forwards;
  filter:brightness(.55);
}
@keyframes zoomLines{
  0%{transform:scale(1.05);filter:brightness(.5)}
  40%{transform:scale(1.55);filter:brightness(.62)}
  100%{transform:scale(2.4);filter:brightness(.7)}
}
.veil{
  position:absolute;inset:0;
  background:radial-gradient(ellipse 55% 50% at 30% 70%, transparent 0%, rgba(0,0,0,.55) 55%, rgba(0,0,0,.78) 100%);
  pointer-events:none;
}
.stat{
  position:absolute;left:50%;top:58%;transform:translate(-50%,-50%);
  padding:18px 28px;border-radius:18px;text-align:center;
  background:rgba(8,10,12,.9);border:1px solid rgba(34,197,94,.55);
  box-shadow:0 0 0 1px rgba(0,0,0,.4),0 20px 60px rgba(0,0,0,.55),0 0 50px rgba(34,197,94,.2);
  font-size:52px;font-weight:650;letter-spacing:-.03em;color:#fff;
  opacity:0;animation:in .55s .55s forwards;backdrop-filter:blur(10px);
}
.stat small{display:block;font-size:12px;letter-spacing:.18em;text-transform:uppercase;
  color:rgba(190,255,210,.75);font-weight:500;margin-bottom:6px}
` : `
.stage img{animation:ken ${Math.max(holdMs, 1000)}ms linear forwards}
@keyframes ken{from{transform:scale(1.02)}to{transform:scale(1.08)}}
`}
@keyframes in{from{opacity:0;transform:translateY(12px);filter:blur(6px)}to{opacity:1;transform:none;filter:none}}
@keyframes glowIn{to{opacity:1}}
</style></head>
<body>
  <div class="frame">
    <div class="copy">
      <p class="eyebrow">${eyebrow}</p>
      <h1>${title}</h1>
    </div>
    <div class="stage">
      <img src="${imageSrc}" alt="" />
      ${isZoom ? `<div class="veil"></div><div class="stat"><small>Lines of code shipped</small>20,354</div>` : ""}
    </div>
  </div>
</body></html>`;
}

async function serveStatic(handlers) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      const hit = handlers[url.pathname];
      if (!hit) {
        res.writeHead(404);
        res.end("missing");
        return;
      }
      const { body, type } = typeof hit === "function" ? await hit() : hit;
      res.writeHead(200, { "Content-Type": type });
      res.end(body);
    } catch (err) {
      res.writeHead(500);
      res.end(String(err));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return { server, origin: `http://127.0.0.1:${port}` };
}

async function dismissOverlays(page) {
  await page.getByTestId("brand-splash").waitFor({ state: "detached" }).catch(() => {});
  const demo = page.getByTestId("demo-video");
  if (await demo.isVisible().catch(() => false)) {
    const closeDemo = page.getByRole("button", { name: /Close demo/i });
    if (await closeDemo.isVisible().catch(() => false)) await closeDemo.click();
    else await page.keyboard.press("Escape");
    await demo.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
  }
}

async function closeSourceModal(page) {
  const candidates = [
    page.getByRole("button", { name: "Close source view" }),
    page.getByRole("button", { name: "Close", exact: true }),
    page.locator(".scrim"),
  ];
  for (const loc of candidates) {
    if (await loc.isVisible().catch(() => false)) {
      await loc.click({ force: true }).catch(() => {});
      break;
    }
  }
  await page.locator(".scrim").waitFor({ state: "hidden" }).catch(() => {});
  await page.keyboard.press("Escape").catch(() => {});
}

async function recordPage(browser, url, holdMs, label) {
  const videoDir = path.join(workDir, `rec-${label}`);
  await rm(videoDir, { recursive: true, force: true });
  await mkdir(videoDir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    recordVideo: { dir: videoDir, size: { width: W, height: H } },
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(holdMs);
  await context.close();
  const [file] = await readdir(videoDir);
  return path.join(videoDir, file);
}

async function recordTitleCard(browser) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
@import url("https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:wght@400;500&display=swap");
html,body{margin:0;height:100%;background:#0c0c0c;color:#f4f1ea;font-family:"DM Sans",system-ui,sans-serif}
body{display:grid;place-items:center;background:radial-gradient(ellipse 70% 50% at 50% 40%,rgba(244,241,234,0.06),transparent 60%),#0c0c0c}
.wrap{text-align:center;padding:48px;max-width:920px}
.kicker{letter-spacing:.2em;text-transform:uppercase;font-size:12px;color:rgba(244,241,234,.5);opacity:0;animation:in .7s .1s forwards}
h1{font-family:"Instrument Serif",Georgia,serif;font-weight:400;font-size:clamp(36px,4.8vw,58px);line-height:1.12;margin:22px 0 18px;opacity:0;animation:in .8s .25s forwards}
p{font-size:18px;color:rgba(244,241,234,.65);opacity:0;animation:in .7s .55s forwards}
@keyframes in{from{opacity:0;transform:translateY(14px);filter:blur(6px)}to{opacity:1;transform:none;filter:none}}
</style></head><body><div class="wrap">
<div class="kicker">Elements Hackathon · Memory Engine</div>
<h1>People don’t remember documents.<br/>They remember decisions.</h1>
<p>memoRABLE turns one document into six grounded memories — then publishes with Unlayer Elements.</p>
</div></body></html>`;
  const { server, origin } = await serveStatic({
    "/": { body: html, type: "text/html; charset=utf-8" },
  });
  try {
    return await recordPage(browser, `${origin}/`, 4800, "title");
  } finally {
    server.close();
  }
}

async function recordProduct(browser) {
  const videoDir = path.join(workDir, "product");
  await rm(videoDir, { recursive: true, force: true });
  await mkdir(videoDir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    recordVideo: { dir: videoDir, size: { width: W, height: H } },
  });
  const page = await context.newPage();
  const startedAt = Date.now();

  await page.goto(baseURL, { waitUntil: "networkidle", timeout: 60_000 });
  await dismissOverlays(page);
  await page.getByRole("heading", { name: /Turn information into memory/i }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1100);

  await page.getByRole("button", { name: /Open a sample brief/i }).click();
  await page.locator(".shell").waitFor({ timeout: 45_000 });
  await page.locator("iframe[title='Document output preview']").waitFor({ timeout: 45_000 });
  await page.getByText("6 memories").first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(700);

  await page.getByRole("button", { name: /Replay the 20-second story/i }).click();
  await page.locator(".replay-banner").waitFor({ timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(20_500);

  await page.getByRole("button", { name: /Signals: show details/i }).click({ timeout: 10_000 }).catch(() => {});
  await page.getByTestId("inspector").getByText("Remembered from").waitFor({ timeout: 8_000 }).catch(() => {});
  await page.waitForTimeout(1100);
  await closeSourceModal(page);

  await page.getByRole("button", { name: "Email", exact: true }).click().catch(() => {});
  await page.waitForTimeout(550);
  await page.getByRole("button", { name: "Document", exact: true }).click().catch(() => {});
  await page.waitForTimeout(450);

  await page.locator(".topbar").getByRole("button", { name: "Publish", exact: true }).click();
  await page.getByRole("heading", { name: "Published." }).waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1800);

  const elapsed = Date.now() - startedAt;
  await context.close();
  const [file] = await readdir(videoDir);
  return { webm: path.join(videoDir, file), elapsed };
}

async function recordResearchChapter(browser) {
  const mark = await readFile(path.join(outDir, "unlayer-mark.png"));
  const files = {
    "/unlayer-mark.png": { body: mark, type: "image/png" },
    "/feedback-jyoti.png": { body: await readFile(path.join(researchDir, "feedback-jyoti.png")), type: "image/jpeg" },
    "/feedback-nikhil.png": { body: await readFile(path.join(researchDir, "feedback-nikhil.png")), type: "image/jpeg" },
    "/feedback-mohit.png": { body: await readFile(path.join(researchDir, "feedback-mohit.png")), type: "image/jpeg" },
    "/cursor-lines.png": { body: await readFile(path.join(researchDir, "cursor-lines.png")), type: "image/jpeg" },
  };

  const slides = [
    {
      path: "/intro",
      hold: 4500,
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
@import url("https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:wght@400;500&display=swap");
html,body{margin:0;height:100%;background:#0b0b0c;color:#f4f1ea;font-family:"DM Sans",system-ui,sans-serif}
body{display:grid;place-items:center;background:radial-gradient(ellipse 65% 50% at 50% 40%,rgba(90,120,255,.12),transparent 60%),#0b0b0c}
.wrap{text-align:center;max-width:900px;padding:40px}
.k{letter-spacing:.22em;text-transform:uppercase;font-size:12px;color:rgba(244,241,234,.5);opacity:0;animation:in .6s .1s forwards}
h1{font-family:"Instrument Serif",Georgia,serif;font-weight:400;font-size:clamp(34px,4.4vw,54px);margin:18px 0 14px;line-height:1.12;opacity:0;animation:in .7s .25s forwards}
p{font-size:18px;color:rgba(244,241,234,.65);opacity:0;animation:in .65s .45s forwards}
@keyframes in{from{opacity:0;transform:translateY(14px);filter:blur(6px)}to{opacity:1;transform:none;filter:none}}
</style></head><body><div class="wrap">
<div class="k">Built with real users</div>
<h1>User research &amp; feedback analysis — in days, not months.</h1>
<p>Three testers. Concrete asks. Shipped into the product before submission.</p>
</div></body></html>`,
    },
    {
      path: "/jyoti",
      hold: 5200,
      html: researchSlideHtml({
        eyebrow: "Feedback 01 · Jyoti Bisht",
        title: "“I like this!” — early signal that the Elements story lands.",
        imageSrc: "/feedback-jyoti.png",
        holdMs: 5200,
      }),
    },
    {
      path: "/nikhil",
      hold: 5200,
      html: researchSlideHtml({
        eyebrow: "Feedback 02 · Nikhil Mourya",
        title: "Asked for PDF parsing + click-a-memory → auto-scroll. We shipped both.",
        imageSrc: "/feedback-nikhil.png",
        holdMs: 5200,
      }),
    },
    {
      path: "/mohit",
      hold: 5200,
      html: researchSlideHtml({
        eyebrow: "Feedback 03 · Mohit Shrivastava",
        title: "README images & tables still open — everything else worked. Noted.",
        imageSrc: "/feedback-mohit.png",
        holdMs: 5200,
      }),
    },
    {
      path: "/lines",
      hold: 7500,
      html: researchSlideHtml({
        eyebrow: "Build intensity",
        title: "Not vibes — 20,354 lines of code in the sprint that shipped memoRABLE.",
        imageSrc: "/cursor-lines.png",
        holdMs: 7500,
        mode: "zoom-lines",
      }),
    },
  ];

  for (const s of slides) {
    files[s.path] = { body: s.html, type: "text/html; charset=utf-8" };
  }

  const { server, origin } = await serveStatic(files);
  const outs = [];
  try {
    for (const s of slides) {
      const webm = await recordPage(browser, `${origin}${s.path}`, s.hold, s.path.replace("/", ""));
      outs.push({ webm, hold: s.hold / 1000, label: s.path });
      console.log(`research ${s.path} ready`);
    }
  } finally {
    server.close();
  }
  return outs;
}

async function recordEndCard(browser) {
  const mark = await readFile(path.join(outDir, "unlayer-mark.png"));
  const { server, origin } = await serveStatic({
    "/": { body: END_CARD_HTML, type: "text/html; charset=utf-8" },
    "/unlayer-mark.png": { body: mark, type: "image/png" },
  });
  try {
    return await recordPage(browser, `${origin}/`, 7800, "end");
  } finally {
    server.close();
  }
}

async function probeDuration(file) {
  const { stdout } = await run("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    file,
  ]);
  return Number.parseFloat(stdout.trim());
}

async function normalizeClip({ input, out, t, ss = 0, speed = 1 }) {
  const fadeOutStart = Math.max(0.2, t - 0.35).toFixed(2);
  const speedFilter = speed !== 1 ? `setpts=PTS/${speed},` : "";
  // When speeding, pull more source time so the output still lasts `t`.
  const sourceT = t * speed;
  await run("ffmpeg", [
    "-y",
    "-ss", String(ss),
    "-i", input,
    "-t", String(sourceT),
    "-vf",
    [
      `${speedFilter}scale=${W}:${H}:force_original_aspect_ratio=decrease`,
      `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2`,
      `fps=${FPS}`,
      "format=yuv420p",
      "fade=t=in:st=0:d=0.22",
      `fade=t=out:st=${fadeOutStart}:d=0.32`,
    ].join(","),
    "-c:v", "libx264", "-preset", PRESET, "-crf", String(CRF),
    "-profile:v", "high", "-pix_fmt", "yuv420p",
    "-an",
    out,
  ]);
  return out;
}

/**
 * Natural-speed VO only — never atempo / asetrate.
 * Keeps the opening story + stitches the closing brand beat so ~60s stays clear.
 */
async function prepareVoiceover(totalSec) {
  const voOut = path.join(workDir, "voiceover-1x.wav");
  const rawDur = await probeDuration(VO_RAW);
  const list = path.join(workDir, "vo-concat.txt");
  const a = path.join(workDir, "vo-a.wav");
  const b = path.join(workDir, "vo-b.wav");

  // Opening through research (~0–48s), then closing brand (~89.4–end).
  const openLen = Math.min(48, Math.max(40, totalSec - 12));
  const closeStart = Math.min(89.4, Math.max(0, rawDur - 12));
  const closeLen = Math.max(6, totalSec - openLen);

  console.log(
    `VO at 1× (no stretch): 0–${openLen.toFixed(1)}s + ${closeStart.toFixed(1)}s–end → ~${totalSec}s`,
  );

  await run("ffmpeg", [
    "-y", "-ss", "0", "-t", String(openLen), "-i", VO_RAW,
    "-af", "afade=t=in:d=0.05,afade=t=out:st=" + (openLen - 0.25).toFixed(2) + ":d=0.25",
    "-ar", "44100", "-ac", "2", a,
  ]);
  await run("ffmpeg", [
    "-y", "-ss", String(closeStart), "-t", String(closeLen + 1), "-i", VO_RAW,
    "-af", "afade=t=in:d=0.2,afade=t=out:st=" + (closeLen - 0.35).toFixed(2) + ":d=0.35",
    "-ar", "44100", "-ac", "2", "-t", String(closeLen), b,
  ]);
  await writeFile(list, `file '${a}'\nfile '${b}'\n`);
  await run("ffmpeg", [
    "-y", "-f", "concat", "-safe", "0", "-i", list,
    "-af", `apad=whole_dur=${totalSec},atrim=0:${totalSec},loudnorm=I=-16:TP=-1.5:LRA=11`,
    "-ar", "44100", "-ac", "2",
    "-t", String(totalSec),
    voOut,
  ]);
  return voOut;
}

async function xfadeChain(clips) {
  // clips: [{file, duration}]
  if (clips.length === 1) return clips[0].file;
  let filter = "";
  let last = "[0:v]";
  let timeline = clips[0].duration;
  for (let i = 1; i < clips.length; i++) {
    const offset = Math.max(0.15, timeline - XFADE);
    const out = i === clips.length - 1 ? "[vout]" : `[v${i}]`;
    filter += `${last}[${i}:v]xfade=transition=fade:duration=${XFADE}:offset=${offset.toFixed(3)}${out};`;
    last = out;
    timeline = offset + clips[i].duration;
  }
  filter = filter.replace(/;$/, "");
  const outPath = path.join(workDir, "picture.mp4");
  const inputs = clips.flatMap((c) => ["-i", c.file]);
  await run("ffmpeg", [
    "-y",
    ...inputs,
    "-filter_complex", filter,
    "-map", "[vout]",
    "-c:v", "libx264", "-preset", PRESET, "-crf", String(CRF),
    "-profile:v", "high", "-pix_fmt", "yuv420p",
    "-an",
    outPath,
  ], { maxBuffer: 20 * 1024 * 1024 });
  return outPath;
}

async function compose(titleWebm, productWebm, researchClips, endWebm) {
  const mp4 = path.join(outDir, "demo-30s.mp4");
  const gif = path.join(outDir, "replay.gif");

  // ~60s after xfades: sum(t) − (n−1)*XFADE ≈ TARGET_SEC. Natural picture pace for 1× VO.
  const plan = [
    { in: titleWebm, t: 6.5, ss: 0.08, speed: 1, label: "c0" },
    { in: productWebm, t: 22.0, ss: 0.8, speed: 1.15, label: "c1" },
    ...researchClips.map((r, i) => ({
      in: r.webm,
      t: i === 0 ? 4.2 : i === 4 ? 7.2 : 5.0,
      ss: 0.05,
      speed: 1,
      label: `r${i}`,
    })),
    { in: endWebm, t: 7.0, ss: 0.06, speed: 1, label: "cend" },
  ];

  const normalized = [];
  for (const p of plan) {
    const out = path.join(workDir, `${p.label}.mp4`);
    await normalizeClip({ input: p.in, out, t: p.t, ss: p.ss, speed: p.speed });
    const duration = await probeDuration(out);
    normalized.push({ file: out, duration });
    console.log(`normalized ${p.label} ${duration.toFixed(2)}s`);
  }

  let silent = await xfadeChain(normalized);
  let totalSec = await probeDuration(silent);

  // Lock picture to TARGET_SEC without distorting audio later.
  if (Math.abs(totalSec - TARGET_SEC) > 0.35) {
    const factor = totalSec / TARGET_SEC;
    const locked = path.join(workDir, "picture-60.mp4");
    console.log(`lock picture ${totalSec.toFixed(2)}s → ${TARGET_SEC}s (visual only ×${factor.toFixed(3)})`);
    await run("ffmpeg", [
      "-y", "-i", silent,
      "-filter:v", `setpts=PTS/${factor},fps=${FPS},format=yuv420p`,
      "-an",
      "-c:v", "libx264", "-preset", PRESET, "-crf", String(CRF),
      "-profile:v", "high", "-pix_fmt", "yuv420p",
      "-t", String(TARGET_SEC),
      locked,
    ]);
    silent = locked;
    totalSec = await probeDuration(silent);
  }

  console.log(`picture locked at ${totalSec.toFixed(2)}s — mixing natural-speed VO`);
  const voPath = await prepareVoiceover(totalSec);

  const demoMp4 = path.join(outDir, "demo.mp4");
  await run("ffmpeg", [
    "-y",
    "-i", silent,
    "-i", voPath,
    "-filter_complex",
    "[1:a]aformat=sample_rates=44100:channel_layouts=stereo,alimiter=limit=0.95[a]",
    "-map", "0:v",
    "-map", "[a]",
    "-c:v", "libx264", "-preset", PRESET, "-crf", String(CRF),
    "-profile:v", "high", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "256k",
    "-shortest",
    "-movflags", "+faststart",
    demoMp4,
  ]);
  // Keep legacy filename for older README links.
  await run("ffmpeg", ["-y", "-i", demoMp4, "-c", "copy", mp4]);

  const palette = path.join(workDir, "palette.png");
  const filters = "fps=10,scale=840:-1:flags=lanczos";
  await run("ffmpeg", [
    "-y", "-i", silent,
    "-vf", `${filters},palettegen=max_colors=96:stats_mode=diff`,
    palette,
  ]);
  await run("ffmpeg", [
    "-y", "-i", silent, "-i", palette,
    "-lavfi", `${filters}[x];[x][1:v]paletteuse=dither=none:diff_mode=rectangle`,
    gif,
  ]);

  const webm = path.join(outDir, "demo.webm");
  await run("ffmpeg", [
    "-y", "-i", demoMp4,
    "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "30",
    "-c:a", "libopus", "-b:a", "160k",
    webm,
  ]);
  await run("ffmpeg", ["-y", "-i", webm, "-c", "copy", path.join(outDir, "demo-30s.webm")]);

  const silentMaster = path.join(outDir, "demo-silent-master.mp4");
  await run("ffmpeg", [
    "-y", "-i", silent,
    "-c:v", "libx264", "-preset", PRESET, "-crf", String(CRF),
    "-profile:v", "high", "-pix_fmt", "yuv420p",
    "-an",
    "-movflags", "+faststart",
    silentMaster,
  ]);

  return { mp4: demoMp4, legacyMp4: mp4, gif, webm, silentMaster, totalSec };
}

async function refreshScreenshots(browser) {
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const shot = async (name) => {
    await page.screenshot({ path: path.join(outDir, name) });
    console.log(`captured ${name}`);
  };

  await page.goto(baseURL, { waitUntil: "networkidle", timeout: 60_000 });
  await dismissOverlays(page);
  await page.getByTestId("home-screen").waitFor().catch(() => {});
  await shot("00-home.png");

  await page.getByRole("button", { name: /Open a sample brief/i }).click();
  await page.locator(".shell").waitFor({ timeout: 45_000 });
  await page.locator("iframe[title='Document output preview']").waitFor({ timeout: 45_000 });
  await page.getByText("6 memories").first().waitFor({ timeout: 30_000 });
  await shot("01-document-first.png");

  await page.getByRole("button", { name: /Signals: show details/i }).click();
  await page.getByTestId("inspector").getByText("Remembered from").waitFor({ timeout: 15_000 });
  await shot("02-memories-provenance.png");
  await closeSourceModal(page);

  await page.locator(".topbar").getByRole("button", { name: "Publish", exact: true }).click();
  await page.getByRole("heading", { name: "Published." }).waitFor({ timeout: 20_000 });
  await page.waitForTimeout(600);
  await shot("03-published-three-outputs.png");
  await context.close();
}

const browser = await chromium.launch();
try {
  await mkdir(workDir, { recursive: true });
  await mkdir(outDir, { recursive: true });

  console.log(`Recording against ${baseURL}`);
  if (process.env.SKIP_SHOTS !== "1") await refreshScreenshots(browser);
  else console.log("SKIP_SHOTS=1 — keeping existing screenshots");

  const titleWebm = await recordTitleCard(browser);
  console.log("title card ready");

  const product = await recordProduct(browser);
  console.log(`product reel ready (${(product.elapsed / 1000).toFixed(1)}s raw)`);

  const research = await recordResearchChapter(browser);
  const endWebm = await recordEndCard(browser);
  console.log("end card ready");

  const assets = await compose(titleWebm, product.webm, research, endWebm);
    console.log(
      `\nWrote ${assets.totalSec.toFixed(1)}s reel (VO at 1×):\n  ${assets.mp4}\n  ${assets.legacyMp4}\n  ${assets.webm}\n  ${assets.silentMaster}\n  ${assets.gif}`,
    );
} finally {
  await browser.close();
  if (process.env.KEEP_WORK === "1") console.log(`KEEP_WORK=1 — left ${workDir}`);
  else await rm(workDir, { recursive: true, force: true }).catch(() => {});
}
