/**
 * BrigPay — PayPal Invoicing API client (Sandbox)
 * Docs: https://developer.paypal.com/docs/api/invoicing/v2/
 */

const API_BASE = process.env.PAYPAL_API_BASE || "https://api-m.sandbox.paypal.com";
const CLIENT_ID = process.env.PAYPAL_CLIENT_ID!;
const CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET!;

export interface InvoiceItem {
  name: string;
  description?: string;
  quantity: string;
  unit_amount: { value: string; currency_code: string };
}

export interface InvoiceTerm {
  term_type?: string;
  due_date?: string;
  term?: string;
}

export interface InvoiceSummary {
  id: string;
  invoice_number?: string;
  detail?: { invoice_number?: string; invoice_date?: string; currency_code?: string; payment_term?: InvoiceTerm };
  status: string;
  total_amount?: { value: string; currency_code: string };
  amount?: { value: string; currency_code: string };
  billing_info?: Array<{ email_address?: string; email?: string; name?: unknown }>;
  primary_recipients?: Array<{
    billing_info?: { email_address?: string; email?: string; name?: unknown };
  }>;
  invoice_date?: string;
  due_date?: string;
  metadata?: { created_date?: string; last_update_date?: string };
  href?: string;
}

/** Map requested due-days to the nearest supported NET term (PayPal computes the date).
 *  Rounds UP so the customer always gets at least the requested time. */
export function termForDays(days: number): string {
  if (days <= 0) return "DUE_ON_RECEIPT";
  if (days <= 10) return "NET_10";
  if (days <= 15) return "NET_15";
  if (days <= 30) return "NET_30";
  if (days <= 45) return "NET_45";
  if (days <= 60) return "NET_60";
  return "NET_90";
}

/** Total amount — classic shape uses total_amount, 2023-12 shape uses amount */
export function amountFrom(r: InvoiceSummary): { value: string; currency: string } {
  const a = r.total_amount || r.amount || { value: "0.00", currency_code: "USD" };
  return { value: a.value || "0.00", currency: a.currency_code || "USD" };
}

let tokenCache: { token: string; expiresAt: number } | null = null;

/** OAuth2 client-credentials token with in-memory cache */
export async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.token;

  const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    throw new Error(`PayPal token failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return tokenCache.token;
}

async function ppFetch(path: string, options: RequestInit = {}) {
  const token = await getAccessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    console.error(`PayPal API error ${res.status} ${path}:`, text.slice(0, 500));
    const err = new Error(
      `PayPal API ${res.status}: ${(body as { message?: string })?.message || text.slice(0, 200)}`
    );
    (err as { status?: number }).status = res.status;
    throw err;
  }
  return body;
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Create invoice as draft (status DRAFT) — schema 2023-12: fields nested under `detail` */
export async function createInvoice(params: {
  invoiceNumber: string;
  customerName: string;
  customerEmail: string;
  items: InvoiceItem[];
  dueDays: number; // converted to nearest NET_x term
  note?: string;
  currencyCode?: string;
}): Promise<{ id: string; invoice_number: string; href: string }> {
  const currency = params.currencyCode || "USD";
  const body = {
    detail: {
      invoice_number: params.invoiceNumber,
      invoice_date: new Date().toISOString().slice(0, 10),
      currency_code: currency,
      note: params.note || "Thank you for your business!",
      terms: "Late payments may incur a reminder.",
      memo: "Invoiced by BrigPay AI agent",
      // 2023-12 schema: term-based due dates only (PayPal computes the date)
      payment_term: { term_type: termForDays(params.dueDays ?? 14) },
    },
    primary_recipients: [
      {
        billing_info: {
          // PayPal v2 expects a Name object, not a plain string
          name: {
            given_name: params.customerName.split(" ")[0] || params.customerName,
            surname: params.customerName.split(" ").slice(1).join(" ") || "-",
          },
          email_address: params.customerEmail,
        },
      },
    ],
    items: params.items.map((it) => ({ ...it, unit_amount: { ...it.unit_amount, currency_code: currency } })),
    configuration: {
      partial_payment: { allow_partial_payment: false },
      allow_tip: false,
    },
  };

  const res = (await ppFetch("/v2/invoicing/invoices", {
    method: "POST",
    body: JSON.stringify(body),
  })) as { id?: string; href?: string };

  // 2023-12 schema returns a HATEOAS link { rel, href, method } — id lives in the href
  const id = res.id || (res.href ? res.href.split("/").filter(Boolean).pop() : undefined);
  if (!id) {
    throw new Error("PayPal created the invoice but returned no id");
  }

  return { id, invoice_number: params.invoiceNumber, href: res.href || "" };
}

/** Send a draft invoice to the customer's email */
export async function sendInvoice(invoiceId: string, sendToMerchant = false): Promise<void> {
  await ppFetch(`/v2/invoicing/invoices/${invoiceId}/send`, {
    method: "POST",
    body: JSON.stringify({ send_to_invoicer: sendToMerchant }),
  });
}

/** Send a payment reminder for an already-sent invoice */
export async function remindInvoice(invoiceId: string): Promise<void> {
  await ppFetch(`/v2/invoicing/invoices/${invoiceId}/remind`, {
    method: "POST",
    body: JSON.stringify({ send_to_invoicer: false }),
  });
}

/** Cancel an invoice */
export async function cancelInvoice(invoiceId: string, subject: string, note: string): Promise<void> {
  await ppFetch(`/v2/invoicing/invoices/${invoiceId}/cancel`, {
    method: "POST",
    body: JSON.stringify({ subject, note, send_to_invoicer: false }),
  });
}

/** List invoices (most recent first) — handles classic `invoices` and 2023-12 `items` shapes */
export async function listInvoices(pageSize = 50): Promise<InvoiceSummary[]> {
  const data = (await ppFetch(
    `/v2/invoicing/invoices?page_size=${pageSize}&total_required=true`,
    { method: "GET" }
  )) as { invoices?: InvoiceSummary[]; items?: InvoiceSummary[] };
  return data.items || data.invoices || [];
}

/** Get a single invoice by id */
export async function getInvoice(invoiceId: string): Promise<InvoiceSummary> {
  return (await ppFetch(`/v2/invoicing/invoices/${invoiceId}?total_required=true`)) as InvoiceSummary;
}

/** Today + N days as YYYY-MM-DD */
export function dueDateIn(days: number): string {
  return addDays(days);
}

/** PayPal may return name as string or {given_name, surname} — normalize to string */
export function nameToString(n: unknown): string {
  if (!n) return "";
  if (typeof n === "string") return n;
  const o = n as { given_name?: string; surname?: string };
  return [o.given_name, o.surname].filter(Boolean).join(" ");
}

/** Extract recipient email from either classic or 2023-12 response shape */
export function emailFrom(r: InvoiceSummary): string {
  return (
    r.billing_info?.[0]?.email_address ||
    r.billing_info?.[0]?.email ||
    r.primary_recipients?.[0]?.billing_info?.email_address ||
    r.primary_recipients?.[0]?.billing_info?.email ||
    ""
  );
}

/** Extract recipient display name from either response shape */
export function recipientNameFrom(r: InvoiceSummary): string {
  return (
    nameToString(r.billing_info?.[0]?.name) ||
    nameToString(r.primary_recipients?.[0]?.billing_info?.name) ||
    ""
  );
}

/** invoice_number lives at top level (classic) or under detail (2023-12) */
export function invoiceNumberFrom(r: InvoiceSummary): string {
  return r.invoice_number || r.detail?.invoice_number || "";
}

/** List responses omit top-level dates — they live under detail (2023-12 schema) */
export function dueDateFrom(r: InvoiceSummary): string {
  return r.due_date || r.detail?.payment_term?.due_date || "";
}

export function invoiceDateFrom(r: InvoiceSummary): string {
  return r.invoice_date || r.detail?.invoice_date || "";
}
