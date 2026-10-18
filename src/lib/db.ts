/**
 * BrigPay — lightweight JSON store (source of truth = PayPal; this is a local cache
 * + activity log for the agent & dashboard).
 * Zero native dependencies → runs anywhere (local, Render, Vercel).
 */
import { promises as fs } from "fs";
import path from "path";

export interface StoredInvoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_email: string;
  amount: string;
  currency: string;
  status: string; // DRAFT | SENT | PAYMENT_PENDING | PAID | MARKED_AS_PAID | CANCELLED | REFUNDED
  invoice_date: string;
  due_date: string;
  reminder_count: number;
  last_reminder_at: string | null;
  created_via: "chat" | "seed";
  created_at: string;
}

export interface ActivityEvent {
  id: string;
  type: string; // INVOICE.CREATED | INVOICE.SENT | INVOICE.PAID | INVOICE.CANCELLED | REMINDER.SENT | WEBHOOK.RECEIVED | SWEEP.RUN
  invoice_id: string | null;
  message: string;
  at: string;
}

export interface ChatMessage {
  role: "user" | "model";
  text: string;
  at: string;
}

interface DBShape {
  invoices: StoredInvoice[];
  events: ActivityEvent[];
  chat: ChatMessage[];
  sweep_runs: number;
}

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "db.json");

const EMPTY: DBShape = { invoices: [], events: [], chat: [], sweep_runs: 0 };

async function load(): Promise<DBShape> {
  try {
    const raw = await fs.readFile(DB_PATH, "utf-8");
    return { ...EMPTY, ...JSON.parse(raw) } as DBShape;
  } catch {
    return structuredClone(EMPTY);
  }
}

async function save(db: DBShape): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}

export async function upsertInvoice(inv: StoredInvoice): Promise<void> {
  const db = await load();
  const idx = db.invoices.findIndex((i) => i.id === inv.id);
  if (idx >= 0) db.invoices[idx] = { ...db.invoices[idx], ...inv };
  else db.invoices.push(inv);
  await save(db);
}

export async function getInvoices(): Promise<StoredInvoice[]> {
  const db = await load();
  return db.invoices.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getInvoiceById(id: string): Promise<StoredInvoice | null> {
  const db = await load();
  return db.invoices.find((i) => i.id === id) || null;
}

export async function bumpReminder(id: string): Promise<void> {
  const db = await load();
  const inv = db.invoices.find((i) => i.id === id);
  if (inv) {
    inv.reminder_count += 1;
    inv.last_reminder_at = new Date().toISOString();
    await save(db);
  }
}

export async function logEvent(type: string, invoice_id: string | null, message: string): Promise<void> {
  const db = await load();
  db.events.unshift({
    id: crypto.randomUUID(),
    type,
    invoice_id,
    message,
    at: new Date().toISOString(),
  });
  db.events = db.events.slice(0, 300);
  await save(db);
}

export async function getEvents(limit = 50): Promise<ActivityEvent[]> {
  const db = await load();
  return db.events.slice(0, limit);
}

export async function appendChat(role: "user" | "model", text: string): Promise<void> {
  const db = await load();
  db.chat.push({ role, text, at: new Date().toISOString() });
  db.chat = db.chat.slice(-40);
  await save(db);
}

export async function getChat(): Promise<ChatMessage[]> {
  const db = await load();
  return db.chat;
}

export async function bumpSweep(): Promise<number> {
  const db = await load();
  db.sweep_runs += 1;
  await save(db);
  return db.sweep_runs;
}
