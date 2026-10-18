import { NextResponse } from "next/server";
import { connection } from "next/server";
import * as paypal from "@/lib/paypal";
import * as db from "@/lib/db";

export async function GET() {
  await connection(); // always dynamic — PayPal data must never be prerendered
  try {
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
        invoice_date: r.invoice_date || existing?.invoice_date || "",
        due_date: r.due_date || existing?.due_date || "",
        reminder_count: existing?.reminder_count || 0,
        last_reminder_at: existing?.last_reminder_at || null,
        created_via: existing?.created_via || "seed",
        created_at: existing?.created_at || r.metadata?.created_date || new Date().toISOString(),
      });
    }
    await db.logEvent("SYNC.COMPLETED", null, `Synced ${remote.length} invoices from PayPal`);
  } catch (e) {
    console.error("/api/invoices sync error:", e);
    const cached = await db.getInvoices();
    if (cached.length === 0) {
      return NextResponse.json(
        { error: "Could not sync with PayPal right now. Showing cached data next time." },
        { status: 502 }
      );
    }
    return NextResponse.json({
      invoices: cached,
      events: await db.getEvents(30),
      warning: "PayPal unreachable — showing cached data.",
    });
  }

  const invoices = await db.getInvoices();
  const events = await db.getEvents(30);
  return NextResponse.json({ invoices, events });
}
