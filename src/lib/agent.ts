/**
 * BrigPay — AI Agent (Gemini function calling)
 * Turns plain-English messages into PayPal Invoicing actions.
 */
import { GoogleGenAI, Type, type FunctionDeclaration, type Schema } from "@google/genai";
import * as paypal from "./paypal";
import * as db from "./db";
import * as sync from "./sync";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

const STR: Schema = { type: Type.STRING };
const NUM: Schema = { type: Type.NUMBER };

const TOOLS: FunctionDeclaration[] = [
  {
    name: "create_and_send_invoice",
    description:
      "Create a PayPal invoice and immediately send it to the customer by email. Use when the user asks to invoice, bill, or charge a customer.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        customer_name: { type: Type.STRING, description: "Customer or company name" },
        customer_email: { type: Type.STRING, description: "Customer email address" },
        items: {
          type: Type.ARRAY,
          description: "Line items being billed",
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, description: "Item name, e.g. 'Website redesign'" },
              description: { type: Type.STRING, description: "Optional details" },
              quantity: { type: Type.STRING, description: "Quantity as string, e.g. '1'" },
              unit_amount: { type: Type.STRING, description: "Unit price, e.g. '2500.00' (numbers only)" },
            },
            required: ["name", "quantity", "unit_amount"],
          },
        },
        due_days: { type: Type.NUMBER, description: "Days until payment is due (default 14)" },
        currency_code: { type: Type.STRING, description: "ISO currency, default USD" },
        note: { type: Type.STRING, description: "Optional note shown on the invoice" },
      },
      required: ["customer_name", "customer_email", "items"],
    },
  },
  {
    name: "list_invoices",
    description:
      "List invoices from PayPal with optional status filter. Statuses: DRAFT, SENT, PAYMENT_PENDING, PAID, MARKED_AS_PAID, CANCELLED, REFUNDED, PARTIALLY_PAID. Use for questions like 'who hasn't paid', 'show invoices', 'any overdue'.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        status_filter: { ...STR, description: "Optional status to filter by, e.g. SENT or PAID" },
      },
    },
  },
  {
    name: "send_reminder",
    description:
      "Send a PayPal payment reminder for an existing SENT invoice. Use when the user asks to chase, nudge, or remind a customer about an unpaid invoice. Requires the invoice id (from list_invoices).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        invoice_id: { type: Type.STRING, description: "PayPal invoice id" },
      },
      required: ["invoice_id"],
    },
  },
  {
    name: "get_cashflow_summary",
    description: "Get totals: outstanding money, overdue invoices, paid this month. Use for 'how much am I owed'.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "record_payment",
    description:
      "Record an EXTERNAL payment (bank transfer, cash, check, wire) against an existing invoice. Use when the user says a customer paid outside PayPal. If amount is omitted, the FULL remaining balance is recorded and the invoice becomes PAID. Never ask the user for the amount if it can be looked up via list_invoices.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        invoice_id: { type: Type.STRING, description: "The invoice to record payment against — you may pass EITHER the human invoice number (e.g. BRG-5432701) OR the PayPal invoice id. Both work." },
        amount: { ...STR, description: "Amount paid, e.g. '2400.00'. Omit for full remaining balance." },
        method: {
          ...STR,
          description: "BANK_TRANSFER | CASH | CHECK | DEBIT_ADJUSTMENT | OTHER (default BANK_TRANSFER)",
        },
        note: { ...STR, description: "Optional note, e.g. 'Paid via BCA transfer'" },
      },
      required: ["invoice_id"],
    },
  },
  {
    name: "run_followup_sweep",
    description:
      "Autonomously scan ALL unpaid invoices and send reminders to every overdue customer. Use when the user asks to 'chase everyone', 'follow up on everything', or 'sweep overdue'.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
];

async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "create_and_send_invoice": {
      const items = (args.items as Array<Record<string, string>>).map((it) => ({
        name: it.name,
        description: it.description || it.name,
        quantity: it.quantity || "1",
        unit_amount: { value: Number(it.unit_amount).toFixed(2), currency_code: "USD" },
      }));
      const currency = (args.currency_code as string) || "USD";
      const dueDays = typeof args.due_days === "number" ? args.due_days : 14;
      const invoiceNumber = `BRG-${Date.now().toString().slice(-7)}`;

      const inv = await paypal.createInvoice({
        invoiceNumber,
        customerName: args.customer_name as string,
        customerEmail: args.customer_email as string,
        items: items.map((i) => ({ ...i, unit_amount: { ...i.unit_amount, currency_code: currency } })),
        dueDays,
        note: args.note as string | undefined,
        currencyCode: currency,
      });

      await paypal.sendInvoice(inv.id);

      const total = items.reduce((s, i) => s + Number(i.unit_amount.value) * Number(i.quantity), 0);
      await db.upsertInvoice({
        id: inv.id,
        invoice_number: inv.invoice_number,
        customer_name: args.customer_name as string,
        customer_email: args.customer_email as string,
        amount: total.toFixed(2),
        currency,
        status: "SENT",
        invoice_date: new Date().toISOString().slice(0, 10),
        due_date: paypal.dueDateIn(dueDays),
        reminder_count: 0,
        last_reminder_at: null,
        created_via: "chat",
        created_at: new Date().toISOString(),
      });
      await db.logEvent("INVOICE.SENT", inv.id, `Invoice ${inv.invoice_number} (${currency} ${total.toFixed(2)}) sent to ${args.customer_email}`);

      return JSON.stringify({ ok: true, invoice_id: inv.id, invoice_number: inv.invoice_number, total: total.toFixed(2), currency });
    }

    case "list_invoices": {
      const remote = await paypal.listInvoices(50);
      let list = remote.map((i) => {
        const amt = paypal.amountFrom(i);
        return {
          id: i.id,
          invoice_number: paypal.invoiceNumberFrom(i),
          status: i.status,
          total: amt.value,
          currency: amt.currency,
          customer: paypal.recipientNameFrom(i) || paypal.emailFrom(i) || "?",
          due_date: paypal.dueDateFrom(i),
        };
      });
      const f = args.status_filter as string | undefined;
      if (f) list = list.filter((i) => i.status.toUpperCase() === f.toUpperCase());
      // totals computed by CODE — the model must quote these, never re-add itself
      const sum = list.reduce((s, i) => s + Number(i.total || 0), 0);
      return JSON.stringify({
        count: list.length,
        total_amount: sum.toFixed(2),
        currency: list[0]?.currency || "USD",
        invoices: list.slice(0, 25),
      });
    }

    case "send_reminder": {
      const id = args.invoice_id as string;
      await paypal.remindInvoice(id);
      await db.bumpReminder(id);
      await db.logEvent("REMINDER.SENT", id, "Payment reminder sent via PayPal");
      return JSON.stringify({ ok: true, invoice_id: id, action: "reminder sent" });
    }

    case "record_payment": {
      let id = args.invoice_id as string;
      // Accept either the PayPal invoice id OR the human invoice number (BRG-…)
      if (!/^INV2?-/.test(id)) {
        const remote = await paypal.listInvoices(50);
        const match = remote.find((i) => paypal.invoiceNumberFrom(i) === id || paypal.invoiceNumberFrom(i).toUpperCase() === id.toUpperCase());
        if (match?.id) id = match.id;
      }
      const amt = typeof args.amount === "string" && args.amount ? args.amount : undefined;
      await paypal.recordPayment(id, {
        amount: amt ? { value: Number(amt).toFixed(2), currency_code: "USD" } : undefined,
        method: (args.method as string) || "BANK_TRANSFER",
        note: (args.note as string) || undefined,
      });
      await db.updateStatus(id, "MARKED_AS_PAID");
      await db.logEvent(
        "INVOICE.MARKED_AS_PAID",
        id,
        `External payment recorded${amt ? ` ($${Number(amt).toFixed(2)})` : ""} via ${(args.method as string) || "BANK_TRANSFER"}`
      );
      return JSON.stringify({ ok: true, invoice_id: id, action: "payment recorded", status: "MARKED_AS_PAID" });
    }

    case "get_cashflow_summary": {
      const invoices = await sync.syncFromPayPal();
      const outstanding = invoices
        .filter((i) => ["SENT", "PAYMENT_PENDING", "PARTIALLY_PAID"].includes(i.status))
        .reduce((s, i) => s + Number(i.amount), 0);
      const overdue = invoices.filter(
        (i) => ["SENT", "PAYMENT_PENDING"].includes(i.status) && !!i.due_date && i.due_date < new Date().toISOString().slice(0, 10)
      );
      const month = new Date().toISOString().slice(0, 7);
      const paidThisMonth = invoices
        .filter((i) => i.status === "PAID" && i.created_at.slice(0, 7) === month)
        .reduce((s, i) => s + Number(i.amount), 0);
      return JSON.stringify({
        outstanding_total: outstanding.toFixed(2),
        unpaid_count: invoices.filter((i) => ["SENT", "PAYMENT_PENDING"].includes(i.status)).length,
        overdue_count: overdue.length,
        overdue_customers: overdue.map((i) => i.customer_name),
        paid_this_month: paidThisMonth.toFixed(2),
      });
    }

    case "run_followup_sweep": {
      const invoices = await sync.syncFromPayPal();
      const today = new Date().toISOString().slice(0, 10);
      const targets = invoices.filter((i) => ["SENT", "PAYMENT_PENDING"].includes(i.status) && !!i.due_date && i.due_date < today);
      const results: Array<{ customer: string; invoice: string; ok: boolean }> = [];
      for (const t of targets) {
        try {
          await paypal.remindInvoice(t.id);
          await db.bumpReminder(t.id);
          await db.logEvent("REMINDER.SENT", t.id, `Auto sweep: reminder #${t.reminder_count + 1} to ${t.customer_name}`);
          results.push({ customer: t.customer_name, invoice: t.invoice_number, ok: true });
        } catch {
          results.push({ customer: t.customer_name, invoice: t.invoice_number, ok: false });
        }
      }
      await db.bumpSweep();
      return JSON.stringify({ swept: targets.length, results });
    }

    default:
      return JSON.stringify({ error: `Unknown tool ${name}` });
  }
}

// ---------------------------------------------------------------------------
// Groq fallback (OpenAI-compatible) — used when Gemini free tier is rate-limited
// ---------------------------------------------------------------------------

const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

const GEMINI_TO_JSON_TYPE: Record<string, string> = {
  STRING: "string",
  NUMBER: "number",
  BOOLEAN: "boolean",
  ARRAY: "array",
  OBJECT: "object",
};

function geminiSchemaToJSON(s: Schema): Record<string, unknown> {
  const out: Record<string, unknown> = { type: GEMINI_TO_JSON_TYPE[String(s.type)] || "string" };
  if (s.description) out.description = s.description;
  if (s.properties) {
    out.properties = Object.fromEntries(
      Object.entries(s.properties).map(([k, v]) => [k, geminiSchemaToJSON(v as Schema)])
    );
  }
  if (s.items) out.items = geminiSchemaToJSON(s.items);
  if (s.required) out.required = s.required;
  return out;
}

function toOpenAITools() {
  return TOOLS.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: geminiSchemaToJSON(t.parameters as Schema),
    },
  }));
}

function isQuotaError(e: unknown): boolean {
  const m = String(e instanceof Error ? e.message : e);
  return m.includes("429") || m.includes("RESOURCE_EXHAUSTED") || m.includes("quota");
}

async function runGroqAgent(
  userMessage: string,
  history: Array<{ role: "user" | "model"; text: string }>
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured");

  type ChatMsg = Record<string, unknown>;
  const messages: ChatMsg[] = [
    { role: "system", content: SYSTEM_INSTRUCTION },
    ...history.slice(-10).map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.text })),
    { role: "user", content: userMessage },
  ];

  let reply = "";
  for (let step = 0; step < 5; step++) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: GROQ_MODEL, messages, tools: toOpenAITools(), tool_choice: "auto" }),
    });
    if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> } }>;
    };
    const msg = data.choices?.[0]?.message;
    const toolCalls = msg?.tool_calls || [];

    if (toolCalls.length === 0) {
      reply = (msg?.content || "").trim();
      break;
    }

    messages.push({ role: "assistant", content: msg?.content ?? null, tool_calls: toolCalls });
    for (const tc of toolCalls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments || "{}");
      } catch {
        /* keep empty args */
      }
      let result: string;
      try {
        result = await executeTool(tc.function.name, args);
      } catch (e) {
        result = JSON.stringify({ error: String(e).slice(0, 300) });
      }
      messages.push({ role: "tool", tool_call_id: tc.id, content: result });
    }
  }

  return reply || "I could not produce a response. Please try again.";
}

const SYSTEM_INSTRUCTION = `You are BrigPay, a sharp, friendly AI collections agent for small businesses.
You operate real PayPal Invoicing APIs through your tools.

Rules:
- Always confirm amounts and emails before creating an invoice: if the user didn't give an email, ask for it.
- Default currency is USD; default due date is 14 days unless told otherwise.
- When asked about unpaid customers, use list_invoices and summarize in 1-3 sentences: always include the total dollar amount AND mention 2-3 customer names with amounts. Quote names (customer field), not invoice numbers.
- NEVER add up amounts yourself. Tools return pre-computed totals (total_amount, outstanding_total) — quote those numbers verbatim. Mental math is forbidden.
- When asked to chase people, use run_followup_sweep or send_reminder.
- When the user says a customer paid (bank transfer, cash, check — outside PayPal), you MUST call record_payment in that same turn. Pass the invoice number the user gave (e.g. BRG-5432701) as invoice_id — it resolves the PayPal id automatically. If they say "paid in full" or give no amount, omit amount so the FULL balance is recorded. NEVER ask the user for the amount or to confirm — just record it and report what you did. Asking a question instead of calling the tool is a failure.
- Keep replies SHORT (1-3 sentences) and concrete. No markdown tables. Prices formatted like $1,250.00.
- You never say you can't take real actions: you CAN create, send, and remind via PayPal sandbox.
- If a tool fails, say plainly what failed and suggest the next step.`;

export async function runAgent(
  userMessage: string,
  history: Array<{ role: "user" | "model"; text: string }> = []
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  try {
    if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
    return await runGeminiAgent(userMessage, history);
  } catch (e) {
    if (!isQuotaError(e)) throw e;
    console.warn("Gemini rate-limited — falling back to Groq");
    return await runGroqAgent(userMessage, history);
  }
}

async function runGeminiAgent(
  userMessage: string,
  history: Array<{ role: "user" | "model"; text: string }>
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  const contents = [
    ...history.slice(-10).map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("model" as const),
      parts: [{ text: m.text }],
    })),
    { role: "user" as const, parts: [{ text: userMessage }] },
  ];

  let reply = "";
  for (let step = 0; step < 5; step++) {
    const res = await ai.models.generateContent({
      model: MODEL,
      contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: [{ functionDeclarations: TOOLS }],
      },
    });

    const parts = res.candidates?.[0]?.content?.parts || [];
    const fnCalls = parts.filter((p) => p.functionCall);

    if (fnCalls.length === 0) {
      reply = parts.map((p) => p.text || "").join("").trim();
      break;
    }

    // execute every requested tool call, then feed results back
    contents.push({ role: "model", parts: parts.filter((p) => p.functionCall) as never });
    const fnResponses = [];
    for (const p of fnCalls) {
      const call = p.functionCall!;
      const args = (call.args || {}) as Record<string, unknown>;
      let result: string;
      try {
        result = await executeTool(call.name!, args);
      } catch (e) {
        result = JSON.stringify({ error: String(e).slice(0, 300) });
      }
      fnResponses.push({
        functionResponse: { name: call.name, response: { result: JSON.parse(result) } },
      });
    }
    contents.push({ role: "user", parts: fnResponses as never });
  }

  return reply || "I could not produce a response. Please try again.";
}
