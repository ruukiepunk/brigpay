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
  const only = process.argv.slice(2); // e.g. "node record_demo.js D E"
  const want = (s) => only.length === 0 || only.includes(s);
  const browser = await chromium.launch({ headless: true });
  const env = envLocal();

  // ---------- SCENE A: chat → invoice Tyrell $2.400 ----------
  if (want("A")) {
    const ctx = await browser.newContext({ viewport: VIEW, recordVideo: { dir: OUT, size: VIEW } });
    const page = await ctx.newPage();
    await page.goto(`${APP}/chat`, { waitUntil: "networkidle" });
    await sleep(1200);
    await typeNatural(
      page,
      "input[placeholder*='Invoice Jane']",
      "Invoice Tyrell Corporation, rtyrell@tyrell.test, 2400 USD for replicate planning, due in 15 days. Send it now."
    );
    await page.keyboard.press("Enter");
    // tunggu agent benar-benar selesai membalas (POST /api/chat selesai)
    await page.waitForResponse(
      (r) => r.url().includes("/api/chat") && r.request().method() === "POST",
      { timeout: 90000 }
    );
    await page.waitForFunction(() => document.body.innerText.includes("BRG-"), { timeout: 30000 });
    await sleep(2500);
    // pindah ke dashboard, row baru kelihatan
    await page.goto(`${APP}/dashboard`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.body.innerText.includes("Tyrell"), { timeout: 30000 });
    await sleep(3000);
    await ctx.close(); // video tersimpan
    console.log("scene A (chat→invoice) done");
  }

  // ---------- SCENE B: "Who hasn't paid me?" ----------
  if (want("B")) {
    const ctx = await browser.newContext({ viewport: VIEW, recordVideo: { dir: OUT, size: VIEW } });
    const page = await ctx.newPage();
    await page.goto(`${APP}/chat`, { waitUntil: "networkidle" });
    await sleep(1000);
    await typeNatural(page, "input[placeholder*='Invoice Jane']", "Who hasn't paid me?");
    await page.keyboard.press("Enter");
    await page.waitForResponse(
      (r) => r.url().includes("/api/chat") && r.request().method() === "POST",
      { timeout: 90000 }
    );
    await sleep(4000);
    await ctx.close();
    console.log("scene B (who hasn't paid) done");
  }

  // ---------- SCENE C: sweep / chase overdue ----------
  if (want("C")) {
    const ctx = await browser.newContext({ viewport: VIEW, recordVideo: { dir: OUT, size: VIEW } });
    const page = await ctx.newPage();
    await page.goto(`${APP}/dashboard`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => /chase/i.test(document.body.innerText), { timeout: 30000 });
    await sleep(1500);
    const chase = page.locator("button", { hasText: /chase/i }).first();
    await chase.click();
    // tunggu sweep selesai → muncul "Sweep #N: X/Y reminders sent"
    await page.waitForFunction(() => /Sweep #\d+/.test(document.body.innerText), { timeout: 120000 });
    await sleep(3000);
    await ctx.close();
    console.log("scene C (chase sweep) done");
  }

  // ---------- SCENE D: user tells agent customer paid → record_payment → PAID ----------
  if (want("D")) {
    const ctx = await browser.newContext({ viewport: VIEW, recordVideo: { dir: OUT, size: VIEW } });
    const page = await ctx.newPage();
    await page.goto(`${APP}/chat`, { waitUntil: "networkidle" });
    await sleep(1200);
    await typeNatural(
      page,
      "input[placeholder*='Invoice Jane']",
      "Good news — Tyrell Corporation just paid invoice BRG-5432701 in full by bank transfer. Record the payment."
    );
    await page.keyboard.press("Enter");
    const resp = await page.waitForResponse(
      (r) => r.url().includes("/api/chat") && r.request().method() === "POST",
      { timeout: 120000 }
    );
    console.log("chat POST status:", resp.status());
    // tunggu balasan model muncul di DOM — lebih andal dari resp.json()
    await page.waitForFunction(() => {
      const t = document.body.innerText;
      return /(recorded|marked as paid|already recorded)/i.test(t) || /(failed|couldn|not found)/i.test(t);
    }, { timeout: 60000 });
    const domText = await page.evaluate(() => document.body.innerText);
    console.log("DOM tail:", domText.split("\n").slice(-6).join(" | ").slice(0, 300));
    if (/(failed|couldn|not found)/i.test(domText)) {
      await ctx.close();
      throw new Error("SCENE D GAGAL — balasan error terlihat di DOM");
    }
    await sleep(3000);
    const vidD = page.video();
    await ctx.close();
    if (vidD) await vidD.saveAs(path.join(OUT, "sceneD.webm"));
    // verifikasi keras: status benar-benar PAID di PayPal
    const env = envLocal();
    const tok = await paypalToken(env);
    const raw = await get(`${env.PAYPAL_API_BASE}/v2/invoicing/invoices?page_size=50`, { Authorization: `Bearer ${tok}` });
    const list = (JSON.parse(raw.body).invoices) || (JSON.parse(raw.body).items) || [];
    const t = list.find((i) => ((i.detail && i.detail.invoice_number) || "").includes("5432701"));
    if (!t || !/PAID/.test(t.status)) throw new Error("SCENE D verifikasi gagal: status=" + (t && t.status));
    console.log("scene D verified ✓ Tyrell status =", t.status);
  } else if (want("E")) {
    // ---------- SCENE E: dashboard reload → status PAID ----------
    await sleep(3000);
    const ctx2 = await browser.newContext({ viewport: VIEW, recordVideo: { dir: OUT, size: VIEW } });
    const page2 = await ctx2.newPage();
    await page2.goto(`${APP}/dashboard`, { waitUntil: "networkidle" });
    await page2.waitForFunction(() => document.body.innerText.includes("Tyrell"), { timeout: 30000 });
    await sleep(1000);
    await page2.reload({ waitUntil: "networkidle" });
    await page2.waitForFunction(() => {
      return Array.from(document.querySelectorAll('[role="row"], tr')).some(
        (el) => el.textContent?.includes("Tyrell") && /PAID/.test(el.textContent || "")
      );
    }, { timeout: 30000 });
    await sleep(4000);
    const vidE = page2.video();
    await ctx2.close();
    if (vidE) await vidE.saveAs(path.join(OUT, "sceneE.webm"));
    console.log("scene E (PAID appears) done");
  } else if (only.length === 0) {
    console.log("scene D+E dilewati (argumen scene tidak disertakan)");
  }

  await browser.close();
  console.log("SEMUA CLIP SELESAI →", OUT);
}

main().catch((e) => {
  console.error("RECORDER ERROR:", e.message);
  process.exit(1);
});
