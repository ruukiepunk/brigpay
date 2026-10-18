/**
 * BrigPay — single source-of-truth sync: pull PayPal → upsert into local cache.
 * Serverless /tmp is per-instance & multi-region, so every data consumer
 * (dashboard API, agent tools, sweep) must sync before reading.
 */
import * as paypal from "./paypal";
import * as db from "./db";

export async function syncFromPayPal(): Promise<db.StoredInvoice[]> {
  const remote = await paypal.listInvoices(50);
  for (const r of remote) {
    const email = paypal.emailFrom(r) || "unknown@example.com";
    const name = paypal.recipientNameFrom(r) || email;
    const existing = await db.getInvoiceById(r.id);
    const amt = paypal.amountFrom(r);
    await db.upsertInvoice({
      id: r.id,
      invoice_number: paypal.invoiceNumberFrom(r) || existing?.invoice_number || "?",
      customer_name: name || existing?.customer_name || email,
      customer_email: email !== "unknown@example.com" ? email : existing?.customer_email || email,
      amount: amt.value !== "0.00" ? amt.value : existing?.amount || "0.00",
      currency: amt.currency !== "USD" ? amt.currency : existing?.currency || "USD",
      status: r.status,
      invoice_date: paypal.invoiceDateFrom(r) || existing?.invoice_date || "",
      due_date: paypal.dueDateFrom(r) || existing?.due_date || "",
      reminder_count: existing?.reminder_count || 0,
      last_reminder_at: existing?.last_reminder_at || null,
      created_via: existing?.created_via || "seed",
      created_at: existing?.created_at || paypal.invoiceDateFrom(r) || new Date().toISOString(),
    });
  }
  return db.getInvoices();
}
