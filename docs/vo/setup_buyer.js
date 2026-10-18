/**
 * BrigPay — buyer sandbox setup (ONE manual login, rest fully automated).
 *
 *   node setup_buyer.js          → opens real Chrome, waits for login, then:
 *        creates BUYER account → reads its password from the dashboard DOM
 *        (never printed) → logs into sandbox.paypal.com as that buyer
 *        → saves storage state → writes .buyer.json (gitignored)
 *
 * Screenshots in docs/vo/shots/ let the operator supervise every step.
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = __dirname;
const SHOTS = path.join(BASE, "shots");
const PROFILE = path.join(BASE, ".buyer-profile");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(page, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  try {
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`), timeout: 10000 });
    console.log(`shot: ${name}`);
  } catch (e) {
    console.log(`shot FAILED ${name}: ${e.message.slice(0, 80)}`);
  }
}

async function tryClick(page, selectors, label) {
  for (const s of selectors) {
    const el = page.locator(s).first();
    try {
      if (await el.isVisible({ timeout: 2500 })) {
        await el.click({ timeout: 3000 });
        console.log(`clicked ${label} via ${s}`);
        return true;
      }
    } catch { /* try next */ }
  }
  console.log(`MISS ${label}`);
  return false;
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
  });
  const page = ctx.pages()[0] || (await ctx.newPage());

  await page.goto("https://developer.paypal.com/dashboard/applications/sandbox", { waitUntil: "domcontentloaded" });
  await sleep(5000);
  await shot(page, "01_landing");

  // ---------- STEP 1: user login (max 15 min) ----------
  console.log("WAITING_FOR_LOGIN (max 15 min) — log in in the opened Chrome window");
  const deadline = Date.now() + 15 * 60 * 1000;
  let loggedIn = false;
  while (Date.now() < deadline) {
    if (!/signin|login|auth|oauth/i.test(page.url())) { loggedIn = true; break; }
    await sleep(5000);
  }
  if (!loggedIn) { console.log("TIMEOUT_NO_LOGIN"); await ctx.close(); process.exit(2); }
  console.log("LOGIN_DETECTED");
  await sleep(6000);

  // ---------- STEP 2: sandbox accounts page ----------
  await page.goto("https://developer.paypal.com/dashboard/sandbox/accounts", { waitUntil: "domcontentloaded" }).catch(() => {});
  await sleep(8000);
  await shot(page, "02_accounts");

  // ---------- STEP 3: create buyer account ----------
  const clicked = await tryClick(page, [
    'button:has-text("Create account")',
    'a:has-text("Create account")',
    'button:has-text("Create test account")',
    '[data-testid*="create"]',
  ], "create-account-btn");
  await sleep(3500);
  await shot(page, "03_create_dialog");

  if (clicked) {
    // pick Buyer / Personal type
    await tryClick(page, [
      'input[value="BUYER"]',
      'input[value="PERSONAL"]',
      'label:has-text("Buyer")',
      'label:has-text("Personal")',
      'span:has-text("Buyer")',
      'div[role="radio"]:has-text("Buyer")',
      'div[role="radio"]:has-text("Personal")',
    ], "buyer-type");
    await sleep(1500);
    await shot(page, "04_type_selected");
    await tryClick(page, [
      'button:has-text("Create account")',
      'button:has-text("Create")',
      'button[type="submit"]',
    ], "confirm-create");
    await sleep(9000);
    await shot(page, "05_created");
  }

  // ---------- STEP 4: harvest new buyer email + password ----------
  // reload list so the fresh account is visible
  await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
  await sleep(7000);
  await shot(page, "06_list_after");

  let buyerEmail = "";
  try {
    const emails = await page.locator("text=/sb-[a-z0-9]+@(personal|example)\\.(com|net)/i").allInnerTexts();
    const personal = emails.find((e) => /personal/i.test(e));
    buyerEmail = (personal || emails[0] || "").trim().split(/\s+/)[0];
  } catch { /* empty */ }
  if (!buyerEmail) {
    console.log("NO_EMAIL_FOUND — inspect shots/06_list_after.png; stopping before password step");
    await ctx.storageState({ path: path.join(BASE, ".dev-state.json") });
    await ctx.close();
    process.exit(3);
  }
  console.log("BUYER_EMAIL_FOUND:", buyerEmail);

  // reveal password: open the row's options/copy-password control
  let buyerPassword = "";
  try {
    const row = page.locator(`text=${buyerEmail}`).first();
    const rowWrap = row.locator("xpath=ancestor::*[self::tr or @role='row' or contains(@class,'row')][1]");
    const optBtn = rowWrap.locator('button:has-text("Copy password"), button:has-text("View password"), button[aria-label*="password" i], button:has-text("...")').first();
    if (await optBtn.isVisible({ timeout: 3000 })) {
      await optBtn.click({ timeout: 3000 });
      await sleep(2500);
      await shot(page, "07_password_revealed");
      // password may now be visible as text in the row, a toast, or an input
      buyerPassword =
        (await rowWrap.locator('input[type="text"]').first().inputValue({ timeout: 2000 }).catch(() => "")) ||
        (await page.locator('[class*="password"], [data-testid*="password"]').first().innerText({ timeout: 2000 }).catch(() => "")) ||
        "";
      if (!buyerPassword) {
        const bodyText = await page.innerText("body");
        const m = bodyText.match(/Password[:\s]+([^\s]{6,})/i);
        if (m) buyerPassword = m[1];
      }
    }
  } catch { /* fallthrough */ }

  if (!buyerPassword) {
    console.log("NO_PASSWORD — password step failed; dev session saved. Inspect shots/07*.png");
    await ctx.storageState({ path: path.join(BASE, ".dev-state.json") });
    await ctx.close();
    process.exit(4);
  }
  console.log("BUYER_PASSWORD_CAPTURED (not printed)");

  // ---------- STEP 5: save creds (gitignored) + login as buyer on sandbox ----------
  fs.writeFileSync(path.join(BASE, ".buyer.json"), JSON.stringify({ email: buyerEmail, password: buyerPassword }, null, 2));

  const buyerCtx = await chromium.launchPersistentContext(path.join(BASE, ".buyer-paypal-profile"), {
    headless: true,
    viewport: { width: 1280, height: 720 },
    locale: "en-US",
  });
  const bpage = await buyerCtx.newPage();
  await bpage.goto("https://www.sandbox.paypal.com/signin", { waitUntil: "domcontentloaded" });
  await sleep(4000);
  try {
    const emailInput = bpage.locator("#email, input[name='email']").first();
    if (await emailInput.isVisible({ timeout: 5000 })) {
      await emailInput.fill(buyerEmail);
      await bpage.locator("#btnNext, button[type='submit']").first().click({ timeout: 3000 });
      await sleep(3000);
      const pwInput = bpage.locator("#password, input[name='password']").first();
      await pwInput.waitFor({ timeout: 8000 });
      await pwInput.fill(buyerPassword);
      await bpage.locator("#btnLogin, button[type='submit']").first().click({ timeout: 3000 });
      await sleep(6000);
    }
  } catch (e) {
    console.log("buyer login step issue:", e.message.slice(0, 100));
  }
  await shot(bpage, "08_buyer_login");
  const signedIn = !/signin|login/i.test(bpage.url());
  console.log("BUYER_SANDBOX_LOGIN:", signedIn ? "OK" : "UNCERTAIN (check shots/08)");
  await buyerCtx.storageState({ path: path.join(BASE, ".buyer-state.json") });
  await buyerCtx.close();

  await ctx.close();
  console.log("ALL_DONE buyer setup");
}

main().catch((e) => { console.error("SETUP ERROR:", e.message); process.exit(1); });
