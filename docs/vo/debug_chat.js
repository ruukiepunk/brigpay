const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const APP = "https://brigpay.vercel.app";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE ERR:", m.text().slice(0, 200)); });
  page.on("response", (r) => { if (r.url().includes("/api/")) console.log("RESP:", r.status(), r.url()); });

  await page.goto(`${APP}/chat`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  console.log("PAGE TEXT:", (await page.innerText("body")).slice(0, 300).replace(/\n+/g, " | "));

  const input = page.locator("input[placeholder*='Invoice Jane']");
  console.log("input count:", await input.count());
  await input.click();
  await page.keyboard.type("Invoice Tyrell Corporation, rtyrell@tyrell.test, 2400 USD for replicate planning, due in 15 days. Send it now.", { delay: 45 });
  await page.keyboard.press("Enter");

  const resp = await page.waitForResponse(
    (r) => r.url().includes("/api/chat") && r.request().method() === "POST",
    { timeout: 90000 }
  ).catch((e) => { console.log("POST /api/chat TIMEOUT:", e.message); return null; });
  if (resp) console.log("POST /api/chat status:", resp.status(), (await resp.text()).slice(0, 300));

  await page.waitForTimeout(3000);
  console.log("CHAT AFTER:", (await page.innerText("body")).slice(0, 600).replace(/\n+/g, " | "));
  await page.screenshot({ path: path.join(__dirname, "debug_chat.png") });

  await page.goto(`${APP}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(4000);
  console.log("DASH HAS TYRELL:", (await page.innerText("body")).includes("Tyrell"));
  await page.screenshot({ path: path.join(__dirname, "debug_dash.png") });

  await browser.close();
})();
