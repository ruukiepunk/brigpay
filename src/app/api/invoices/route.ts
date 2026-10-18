import { NextResponse } from "next/server";
import { connection } from "next/server";
import * as db from "@/lib/db";
import { syncFromPayPal } from "@/lib/sync";

/**
 * GET /api/invoices → always merge latest from PayPal (source of truth) into the
 * local cache, then return invoices + recent events.
 * Serverless /tmp is per-instance & multi-region — never trust the cache alone.
 * Falls back to cached data if PayPal is unreachable.
 */
export async function GET() {
  await connection(); // always dynamic — PayPal data must never be prerendered
  try {
    await syncFromPayPal();
    await db.logEvent("SYNC.COMPLETED", null, "Synced invoices from PayPal");
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
