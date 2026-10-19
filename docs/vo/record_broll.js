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
    // passes 2-3: keep motion alive so intro (ss10.5) + outro (ss20..32.7) never overlap
    await glide(page, [
      [640, 300, 900],
      [1100, 400, 900],
      [700, 560, 800],
      [480, 480, 900],
      [1100, 290, 1000],
      [640, 340, 1000],
    ]);
    await glide(page, [
      [560, 420, 800],
      [1100, 250, 900],
      [560, 540, 900],
      [1150, 480, 900],
      [640, 300, 900],
      [480, 600, 1100],
      [1100, 330, 900],
    ]);
    await sleep(3000); // buffer: recording must reach >= 34s
    await ctx.close();
    console.log("broll dashboard done");
  }

  await browser.close();
  console.log("BROLL DONE →", OUT);
})().catch((e) => { console.error("BROLL ERROR:", e.message); process.exit(1); });
