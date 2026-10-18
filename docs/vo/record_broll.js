/**
 * B-roll recorder: gentle dashboard footage for intro/outro scenes.
 * Mouse glides over the grid + activity feed. Headless, background-safe.
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const APP = "https://brigpay.vercel.app";
const OUT = path.join(__dirname, "clips");
const VIEW = { width: 1280, height: 720 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function glide(page, points) {
  for (const [x, y, t] of points) {
    await page.mouse.move(x, y, { steps: 25 });
    await sleep(t);
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  // ---------- BROLL: dashboard overview ----------
  {
    const ctx = await browser.newContext({ viewport: VIEW, recordVideo: { dir: OUT, size: VIEW } });
    const page = await ctx.newPage();
    await page.goto(`${APP}/dashboard`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.body.innerText.includes("Outstanding") || document.body.innerText.includes("OUTSTANDING") || document.body.innerText.includes("command center"), { timeout: 30000 });
    await sleep(1500);
    await glide(page, [
      [640, 300, 900],
      [480, 480, 800],
      [480, 620, 900],
      [700, 560, 800],
      [1100, 400, 1000],
      [1100, 290, 1200],
    ]);
    // hover a grid row to show interactivity
    await glide(page, [[480, 360, 1500]]);
    await sleep(800);
    await ctx.close();
    console.log("broll dashboard done");
  }

  await browser.close();
  console.log("BROLL DONE →", OUT);
})().catch((e) => { console.error("BROLL ERROR:", e.message); process.exit(1); });
