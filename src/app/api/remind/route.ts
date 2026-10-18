import { NextRequest, NextResponse } from "next/server";
import * as paypal from "@/lib/paypal";
import * as db from "@/lib/db";

/** POST /api/remind { invoice_id } — send one PayPal reminder */
export async function POST(req: NextRequest) {
  try {
    const { invoice_id } = (await req.json()) as { invoice_id?: string };
    if (!invoice_id) return NextResponse.json({ error: "invoice_id required" }, { status: 400 });

    const local = await db.getInvoiceById(invoice_id);
    await paypal.remindInvoice(invoice_id);
    await db.bumpReminder(invoice_id);
    await db.logEvent("REMINDER.SENT", invoice_id, `Manual reminder to ${local?.customer_name || "customer"}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("/api/remind error:", e);
    return NextResponse.json({ error: "Could not send the reminder. Please try again." }, { status: 500 });
  }
}
