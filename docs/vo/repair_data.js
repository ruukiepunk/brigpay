/**
 * Repair demo data:
 *  1) cancel duplicate/artifact invoices (Tyrell dup, old Initech, old Wayne)
 *  2) reissue Initech $1,200 & Wayne $890 with PAST invoice dates → genuinely OVERDUE
 * Values printed: only invoice numbers/statuses. Secrets never printed.
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

(async () => {
  const t = await token();
  const API = env.PAYPAL_API_BASE;

  // ---- cancel: Tyrell dup BRG-0558464, old Initech BRG-1609221, old Wayne BRG-1613196 ----
  const listRes = await req("GET", `${API}/v2/invoicing/invoices?page_size=50&total_required=true`, t);
  const all = JSON.parse(listRes.body).invoices || [];
  const cancelNums = ["BRG-0558464", "BRG-1609221", "BRG-1613196"];
  for (const inv of all) {
    const num = inv.detail?.invoice_number || inv.invoice_number;
    if (cancelNums.includes(num) && inv.status === "SENT") {
      const r = await req("POST", `${API}/v2/invoicing/invoices/${inv.id}/cancel`, t, {
        subject: "Superseded — reissued",
        note: "Demo data cleanup: replaced with corrected invoice.",
      });
      console.log(`cancel ${num}: HTTP ${r.status}`);
    }
  }

  // ---- create genuinely overdue invoices (invoice_date in the past) ----
  async function makeOverdue(num, name, email, value, invDate, term) {
    const body = {
      invoice_number: num,
      invoice_date: invDate,
      detail: {
        invoice_date: invDate,
        currency_code: "USD",
        note: term,
        payment_term: { term_type: term },
        billing_info: [{ name, email_address: email }],
      },
      items: [{ name: `Professional services — ${name}`, quantity: "1", unit_amount: { value, currency_code: "USD" } }],
      configuration: { partial_payment: { allow_partial_payment: true, allow_tip: false } },
    };
    const c = await req("POST", `${API}/v2/invoicing/invoices`, t, body);
    if (c.status !== 201) {
      console.log(`create ${num}: HTTP ${c.status} ${c.body.slice(0, 200)}`);
      return;
    }
    const id = JSON.parse(c.body).id;
    const s = await req("POST", `${API}/v2/invoicing/invoices/${id}/send`, t, {});
    console.log(`create+send ${num} (${name}, ${value}, date=${invDate}, ${term}): create=${c.status} send=${s.status} id=${id}`);
  }

  await makeOverdue("BRG-7700101", "Initech Solutions", "ap@initech.test", "1200.00", "2026-09-20", "NET_10");
  await makeOverdue("BRG-7700890", "Wayne Enterprises", "accounting@wayne.test", "890.00", "2026-10-01", "NET_10");

  // ---- final list ----
  const after = JSON.parse((await req("GET", `${API}/v2/invoicing/invoices?page_size=50&total_required=true`, t)).body).invoices || [];
  console.log("--- final ---");
  for (const i of after) {
    const num = i.detail?.invoice_number || i.invoice_number;
    const due = i.detail?.payment_term?.due_date || "-";
    console.log(`${num} ${i.status} due=${due}`);
  }
})();
