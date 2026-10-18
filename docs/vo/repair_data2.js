/**
 * Repair data part 2:
 *  - cancel Tyrell dup + old Initech + old Wayne (key = invoices|items, id from href)
 *  - send the two already-created overdue DRAFTs (BRG-7700101, BRG-7700890)
 *  - print final list
 * No secrets printed.
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
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => resolve({ status: res.statusCode, body: d }));
      }
    );
    r.on("error", reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

async function token() {
  const b64 = Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  return await new Promise((resolve, reject) => {
    const r = https.request(`${env.PAYPAL_API_BASE}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${b64}`, "Content-Type": "application/x-www-form-urlencoded" },
    }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => resolve(JSON.parse(d).access_token));
    });
    r.on("error", reject);
    r.write("grant_type=client_credentials");
    r.end();
  });
}

const idOf = (inv) => inv.id || (inv.href ? inv.href.split("/").filter(Boolean).pop() : "");
const numOf = (inv) => inv.detail?.invoice_number || inv.invoice_number || "";

(async () => {
  const t = await token();
  const API = env.PAYPAL_API_BASE;

  const all = JSON.parse((await req("GET", `${API}/v2/invoicing/invoices?page_size=50&total_required=true`, t)).body);
  const list = all.invoices || all.items || [];
  console.log(`found ${list.length} invoices`);

  // 1) cancel duplicates/superseded
  const cancelNums = ["BRG-0558464", "BRG-1609221", "BRG-1613196"];
  for (const inv of list) {
    if (cancelNums.includes(numOf(inv)) && ["SENT", "DRAFT"].includes(inv.status)) {
      const r = await req("POST", `${API}/v2/invoicing/invoices/${idOf(inv)}/cancel`, t, {
        subject: "Superseded — reissued",
        note: "Demo data cleanup: replaced with corrected invoice.",
      });
      console.log(`cancel ${numOf(inv)} (${inv.status}): HTTP ${r.status}`);
    }
  }

  // 2) send the overdue drafts
  for (const inv of list) {
    if (["BRG-7700101", "BRG-7700890"].includes(numOf(inv)) && inv.status === "DRAFT") {
      const r = await req("POST", `${API}/v2/invoicing/invoices/${idOf(inv)}/send`, t, {});
      console.log(`send ${numOf(inv)}: HTTP ${r.status} ${r.status !== 202 && r.status !== 204 ? r.body.slice(0, 150) : ""}`);
    }
  }

  // 3) final list
  const after = JSON.parse((await req("GET", `${API}/v2/invoicing/invoices?page_size=50&total_required=true`, t)).body);
  const alist = after.invoices || after.items || [];
  console.log("--- final ---");
  for (const i of alist) {
    console.log(`${numOf(i)} ${i.status} due=${i.detail?.payment_term?.due_date || "-"}`);
  }
})();
