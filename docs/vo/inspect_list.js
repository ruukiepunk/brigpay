const { GoogleGenAI } = require("@google/genai");
const fs = require("fs");

function loadEnv(p) {
  const o = {};
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) o[m[1]] = m[2].trim();
  }
  return o;
}
const env = loadEnv("C:/Users/Hype AMD/projects/brigpay/.env.local");

async function paypalToken() {
  const https = require("https");
  const b64 = Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  return await new Promise((resolve, reject) => {
    const req = https.request(`${env.PAYPAL_API_BASE}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${b64}`, "Content-Type": "application/x-www-form-urlencoded" },
    }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => resolve(JSON.parse(d).access_token));
    });
    req.on("error", reject);
    req.write("grant_type=client_credentials");
    req.end();
  });
}

(async () => {
  const token = await paypalToken();
  const https = require("https");
  const raw = await new Promise((resolve, reject) => {
    https.get(`${env.PAYPAL_API_BASE}/v2/invoicing/invoices?page_size=3&total_required=true`, {
      headers: { Authorization: `Bearer ${token}` },
    }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => resolve(d));
    }).on("error", reject);
  });
  const list = JSON.parse(raw);
  const arr = list.invoices || list.items || [];
  if (!arr.length) { console.log("RAW:", raw.slice(0, 400)); return; }
  const inv = arr[0];
  console.log("FIELDS on list item:", Object.keys(inv).sort().join(", "));
  console.log("due_date value:", JSON.stringify(inv.due_date));
  console.log("invoice_date value:", JSON.stringify(inv.invoice_date));
  console.log("metadata:", JSON.stringify(inv.metadata));
  if (inv.detail) console.log("detail keys:", Object.keys(inv.detail).join(", "));
  if (inv.detail) console.log("payment_term:", JSON.stringify(inv.detail.payment_term));
  if (inv.detail) console.log("detail.invoice_date:", inv.detail.invoice_date);
  if (inv.billing_info) console.log("billing_info:", JSON.stringify(inv.billing_info).slice(0, 200));
})();
