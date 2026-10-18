/**
 * Test PayPal Invoicing "record-payment" (record an EXTERNAL payment: bank transfer/cash).
 * Runs against sandbox. Prints only statuses — no secrets.
 */
const fs = require("fs");
const https = require("https");

function loadEnv(p) {
  const o = {};
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) o[m[1]] = m[2].trim();
  }
  return o;
}
const env = loadEnv("C:/Users/Hype AMD/projects/brigpay/.env.local");

function req(method, url, token, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const r = https.request(
      { method, hostname: u.hostname, path: u.pathname + u.search, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } },
      (res) => { let d = ""; res.on("data", (c) => (d += c)); res.on("end", () => resolve({ status: res.statusCode, body: d })); }
    );
    r.on("error", reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

function token() {
  const b64 = Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  return new Promise((resolve, reject) => {
    const r = https.request(`${env.PAYPAL_API_BASE}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${b64}`, "Content-Type": "application/x-www-form-urlencoded" },
    }, (res) => { let d = ""; res.on("data", (c) => (d += c)); res.on("end", () => resolve(JSON.parse(d).access_token)); });
    r.on("error", reject);
    r.write("grant_type=client_credentials");
    r.end();
  });
}

const idOf = (i) => i.id || (i.href ? i.href.split("/").filter(Boolean).pop() : "");
const numOf = (i) => i.detail?.invoice_number || i.invoice_number || "";

(async () => {
  const t = await token();
  const API = env.PAYPAL_API_BASE;
  const all = JSON.parse((await req("GET", `${API}/v2/invoicing/invoices?page_size=50&total_required=true`, t)).body);
  const list = all.invoices || all.items || [];
  const target = list.find((i) => numOf(i) === "BRG-8435160"); // Cyberdyne $1,750
  if (!target) { console.log("Cyberdyne invoice not found"); return; }
  const id = idOf(target);
  console.log("target:", numOf(target), "status:", target.status, "id:", id);

  const body = {
    method: "BANK_TRANSFER",
    payment_date: "2026-10-18",
    amount: { value: "1750.00", currency_code: "USD" },
    note: "Customer paid via bank transfer — recorded by BrigPay",
  };
  const r = await req("POST", `${API}/v2/invoicing/invoices/${id}/payments`, t, body);
  console.log("record-payment HTTP:", r.status);
  if (r.status >= 400) console.log("body:", r.body.slice(0, 500));

  const after = JSON.parse((await req("GET", `${API}/v2/invoicing/invoices/${id}?total_required=true`, t)).body);
  console.log("status AFTER:", after.status);
})();
