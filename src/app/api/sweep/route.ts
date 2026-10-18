import { NextResponse } from "next/server";
import * as paypal from "@/lib/paypal";
import * as db from "@/lib/db";
import { syncFromPayPal } from "@/lib/sync";

/**
 * POST /api/sweep — autonomous follow-up run:
 * scans every unpaid invoice, sends PayPal reminders for overdue ones.
 * This is the same logic the agent triggers via run_followup_sweep.
 */
export async function POST() {
  try {
    const invoices = await syncFromPayPal();
    const today = new Date().toISOString().slice(0, 10);
    const targets = invoices.filter(
      (i) => ["SENT", "PAYMENT_PENDING", "PARTIALLY_PAID"].includes(i.status) && !!i.due_date && i.due_date < today
    );

    const results: Array<{ customer: string; invoice: string; amount: string; ok: boolean }> = [];
    for (const t of targets) {
      try {
        await paypal.remindInvoice(t.id);
        await db.bumpReminder(t.id);
        await db.logEvent("REMINDER.SENT", t.id, `Sweep: reminder to ${t.customer_name} (${t.invoice_number})`);
        results.push({ customer: t.customer_name, invoice: t.invoice_number, amount: t.amount, ok: true });
      } catch (e) {
        await db.logEvent("REMINDER.FAILED", t.id, `Sweep failed for ${t.customer_name}: ${String(e).slice(0, 120)}`);
        results.push({ customer: t.customer_name, invoice: t.invoice_number, amount: t.amount, ok: false });
      }
    }

    const run = await db.bumpSweep();
    await db.logEvent("SWEEP.RUN", null, `Sweep #${run}: ${results.filter((r) => r.ok).length}/${targets.length} reminders sent`);

    return NextResponse.json({ run, overdue: targets.length, results });
  } catch (e) {
    console.error("/api/sweep error:", e);
    return NextResponse.json({ error: "Sweep failed. Please try again." }, { status: 500 });
  }
}
