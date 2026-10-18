/**
 * BrigPay demo recorder — Playwright (background, tanpa menyentuh layar user).
 * Satu halaman = satu scene = satu file webm (di docs/vo/clips/).
 *
 * Jalankan: node record_demo.js            (scene tanpa buyer)
 *           SET BUYER_EMAIL=.. BUYER_PASSWORD=.. node record_demo.js   (termasuk scene PAID)
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const https = require("https");

const APP = "https://brigpay.vercel.app";
const OUT = path.join(__dirname, "clips");
const VIEW = { width: 1280, height: 720 };

function envLocal() {
  const txt = fs.readFileSync(path.join(__dirname, "..", "..", ".env.local"), "utf8");
  const o = {};
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) o[m[1]] = m[2].trim();
  }
  return o;
}

function get(url, headers) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => resolve({ status: res.statusCode, body: d }));
    }).on("error", reject);
  });
}

async function paypalToken(env) {
  const b64 = Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const r = await new Promise((resolve, reject) => {
    const req = https.request(
      `${env.PAYPAL_API_BASE}/v1/oauth2/token`,
      {
        method: "POST",
        headers: { Authorization: `Basic ${b64}`, "Content-Type": "application/x-www-form-urlencoded" },
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => resolve(d));
      }
    );
    req.on("error", reject);
    req.write("grant_type=client_credentials");
    req.end();
  });
  return JSON.parse(r).access_token;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function typeNatural(page, selector, text) {
  await page.click(selector);
  await page.keyboard.type(text, { delay: 45 });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const env = envLocal();

  // ---------- SCENE A: chat → invoice Cyberdyne $1.750 ----------
  {
    const ctx = await browser.newContext({ viewport: VIEW, recordVideo: { dir: OUT, size: VIEW } });
    const page = await ctx.newPage();
    await page.goto(`${APP}/chat`, { waitUntil: "networkidle" });
    await sleep(1200);
    await typeNatural(
      page,
      "input[placeholder*='Invoice Jane']",
      "Invoice Cyberdyne Systems, ap@cyberdyne.test, 1750 USD for robotics consulting, due in 15 days. Send it now."
    );
    await page.keyboard.press("Enter");
    // tunggu balasan agent (invoice number muncul)
    await page.waitForFunction(() => document.body.innerText.includes("BRG-"), { timeout: 60000 });
    await sleep(2500);
    // pindah ke dashboard, row baru kelihatan
    await page.goto(`${APP}/dashboard`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.body.innerText.includes("Cyberdyne"), { timeout: 30000 });
    await sleep(3000);
    await ctx.close(); // video tersimpan
    console.log("scene A (chat→invoice) done");
  }

  // ---------- SCENE B: "Who hasn't paid me?" ----------
  {
    const ctx = await browser.newContext({ viewport: VIEW, recordVideo: { dir: OUT, size: VIEW } });
    const page = await ctx.newPage();
    await page.goto(`${APP}/chat`, { waitUntil: "networkidle" });
    await sleep(1000);
    await typeNatural(page, "input[placeholder*='Invoice Jane']", "Who hasn't paid me?");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => /outstanding|overdue|owed/i.test(document.body.innerText), { timeout: 60000 });
    await sleep(4000);
    await ctx.close();
    console.log("scene B (who hasn't paid) done");
  }

  // ---------- SCENE C: sweep / chase overdue ----------
  {
    const ctx = await browser.newContext({ viewport: VIEW, recordVideo: { dir: OUT, size: VIEW } });
    const page = await ctx.newPage();
    await page.goto(`${APP}/dashboard`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => /chase/i.test(document.body.innerText), { timeout: 30000 });
    await sleep(1500);
    const chase = page.locator("button", { hasText: /chase/i }).first();
    await chase.click();
    // tunggu sweep selesai → activity feed kirim event
    await page.waitForFunction(() => /REMINDER|reminder/i.test(document.body.innerText), { timeout: 120000 });
    await sleep(3000);
    await ctx.close();
    console.log("scene C (chase sweep) done");
  }

  // ---------- SCENE D: buyer bayar → PAID (butuh kredensial buyer sandbox) ----------
  if (process.env.BUYER_EMAIL && process.env.BUYAL_PASSWORD) {
    console.log("BUYAL_PASSWORD typo guard: skip"); // guard typo, pakai BUYER_PASSWORD
  }
  if (process.env.BUYER_EMAIL && process.env.BUYER_PASSWORD) {
    // invoice terbaru dari app
    const invRes = await get(`${APP}/api/invoices`);
    const list = JSON.parse(invRes.body).invoices || [];
    const target = list.find((i) => i.customer_name.includes("Cyberdyne")) || list[0];
    const token = await paypalToken(env);
    const invRaw = await get(`${env.PAYPAL_API_BASE}/v2/invoicing/invoices/${target.id}`, {
      Authorization: `Bearer ${token}`,
    });
    const inv = JSON.parse(invRaw.body);
    const payLink = (inv.links || []).find((l) => l.rel === "payer-view")?.href;
    if (!payLink) throw new Error("pay link tidak ditemukan");

    const ctx = await browser.newContext({ viewport: VIEW, recordVideo: { dir: OUT, size: VIEW } });
    const page = await ctx.newPage();
    await page.goto(payLink, { waitUntil: "networkidle" });
    // login buyer kalau diminta
    if (page.url().includes("signin")) {
      await page.fill("#email", process.env.BUYER_EMAIL);
      await page.click("#btnNext");
      await sleep(1500);
      await page.fill("#password", process.env.BUYER_PASSWORD);
      await page.click("#btnLogin");
      await page.waitForLoadState("networkidle");
    }
    await sleep(1500);
    // klik Pay Now (selector defensif)
    const payBtn = page.locator("button:has-text('Pay Now'), button:has-text('Pay now'), button[type=submit]").first();
    await payBtn.click({ timeout: 30000 }).catch(() => {});
    await sleep(4000);
    await ctx.close();
    console.log("scene D (buyer pays) done — tunggu webhook ~5 dtk, lalu:");

    // ---------- SCENE E: dashboard refresh → status PAID ----------
    await sleep(5000);
    const ctx2 = await browser.newContext({ viewport: VIEW, recordVideo: { dir: OUT, size: VIEW } });
    const page2 = await ctx2.newPage();
    await page2.goto(`${APP}/dashboard`, { waitUntil: "networkidle" });
    await page2.waitForFunction(() => document.body.innerText.includes("Cyberdyne"), { timeout: 30000 });
    await sleep(1000);
    await page2.reload({ waitUntil: "networkidle" });
    await page2.waitForFunction(() => /PAID/i.test(document.body.innerText), { timeout: 30000 });
    await sleep(4000);
    await ctx2.close();
    console.log("scene E (PAID appears) done");
  } else {
    console.log("scene D+E dilewati (BUYER_EMAIL/BUYER_PASSWORD belum di-set)");
  }

  await browser.close();
  console.log("SEMUA CLIP SELESAI →", OUT);
}

main().catch((e) => {
  console.error("RECORDER ERROR:", e.message);
  process.exit(1);
});
