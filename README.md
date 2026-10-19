# BrigPay — Your AI Invoice Collector

**🟢 Live demo: [brigpay.vercel.app](https://brigpay.vercel.app)** · [Dashboard](https://brigpay.vercel.app/dashboard) · [AI Agent chat](https://brigpay.vercel.app/chat)

**Chat with an AI agent. It sends real PayPal invoices and chases late payers for you.**

Small businesses lose an average of 20 days a year chasing unpaid invoices. BrigPay turns the most annoying part of running a business into a conversation: tell the agent who to bill, and it creates & sends a real PayPal invoice in seconds — then keeps chasing automatically until the money lands.

> Built for the **PayPal AI Hackathon** · Runs fully on the **PayPal Sandbox** (test money, real APIs).

---

## Watch it work

```
You:    "Invoice ACME Corp billing@acmecorp.com $2,500 for website redesign, due in 14 days"

BrigPay: calls PayPal Invoicing API →
         ✅ Invoice #BRG-8684383 created & emailed to the customer
         ✅ Appears on the dashboard as SENT

…14 days later, still unpaid…

BrigPay: ⚡ sweep finds it overdue → PayPal reminder sent automatically
         📋 reminder_count on the dashboard goes up
```

## Features

- **Plain-English invoicing** — "Invoice Jane $800 for logo design, due in 7 days" → real PayPal invoice created + emailed.
- **AI collections agent** — asks `Who hasn't paid me?` → agent queries PayPal and answers with names & totals.
- **Autonomous follow-up sweep** — one click (or one sentence) chases every overdue customer with PayPal payment reminders.
- **PayPal webhooks** — `INVOICING.INVOICE.PAID` / `.CANCELLED` / `.SENT` / `.AUTOMATIC-REMINDER-SENT` events update the dashboard in real time.
- **Record off-PayPal payments** — customer paid by bank transfer, cash, or check? Tell the agent; it records the external payment against the real PayPal invoice (`POST /v2/invoicing/invoices/{id}/payments`) so the books stay accurate. Idempotent — never double-records.
- **AG Grid command center** — sortable/filterable invoice table, auto **OVERDUE** status pills, per-row *Remind* button, summary cards (outstanding, overdue, paid this month, reminders sent), live activity feed.
- **Sandbox-first** — zero real money at risk; everything runs against PayPal Sandbox APIs.

## How it works

```
┌────────────┐   natural language   ┌──────────────────────┐   REST    ┌─────────────────────┐
│  You / SMB │ ───────────────────▶ │  BrigPay AI Agent     │ ────────▶ │  PayPal Sandbox API  │
│  (chat UI) │ ◀─────────────────── │  (Gemini, tool call)  │ ◀──────── │  Invoicing v2        │
└────────────┘      reply + data    └──────────────────────┘   events   │  Webhooks            │
                                          │                             └─────────────────────┘
                                          ▼                                      │
                                 ┌────────────────┐     INVOICE.PAID etc.        │
                                 │  JSON cache DB │ ◀────────────────────────────┘
                                 │  + activity log│
                                 └───────┬────────┘
                                         ▼
                              ┌─────────────────────┐
                              │  AG Grid dashboard  │
                              └─────────────────────┘
```

**The agent has 6 real tools** (Gemini function calling):

| Tool | What it does | PayPal API |
|---|---|---|
| `create_and_send_invoice` | Creates a draft invoice and emails it | `POST /v2/invoicing/invoices` + `/send` |
| `list_invoices` | "Who hasn't paid?" queries | `GET /v2/invoicing/invoices` |
| `send_reminder` | Nudges one customer | `POST /v2/invoicing/invoices/{id}/remind` |
| `run_followup_sweep` | Chases **every** overdue invoice | loop of `/remind` |
| `get_cashflow_summary` | Outstanding / overdue / paid totals | local cache + PayPal |
| `record_payment` | Records a bank-transfer/cash payment | `POST /v2/invoicing/invoices/{id}/payments` |

Webhook receiver: `POST /api/webhooks/paypal` handles `INVOICING.INVOICE.PAID`, `.CANCELLED`, `.SENT` and `.AUTOMATIC-REMINDER-SENT`, keeping the dashboard in sync in real time.

## Tech stack

- **Next.js 16** (App Router, TypeScript) + **Tailwind CSS v4**
- **Gemini** (`gemini-3.8-flash`) function calling — the agent brain, with automatic **Groq** (`gpt-oss-120b`) fallback so the agent stays up even when one LLM provider rate-limits
- **PayPal Invoicing API v2** (sandbox) + **Webhooks** + OAuth2 client-credentials
- **AG Grid 36** (community) — invoice command center
- JSON file cache (PayPal remains the source of truth) · Deployed on **Vercel** (free Hobby)

## API endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/chat` | POST | Talk to the agent (`{message}` → `{reply}`) |
| `/api/invoices` | GET | Cached invoices (`?sync=1` pulls from PayPal) |
| `/api/remind` | POST | Send one reminder (`{invoice_id}`) |
| `/api/sweep` | POST | Chase all overdue invoices |
| `/api/webhooks/paypal` | POST | PayPal webhook receiver |

## Run it locally

```bash
git clone https://github.com/ruukiepunk/brigpay.git
cd brigpay
npm install
```

Create `.env.local` (see `.env.example`):

```bash
PAYPAL_CLIENT_ID=...        # developer.paypal.com → Apps & Credentials (Sandbox)
PAYPAL_CLIENT_SECRET=...
PAYPAL_ENV=sandbox
PAYPAL_API_BASE=https://api-m.sandbox.paypal.com
GEMINI_API_KEY=...          # aistudio.google.com
GEMINI_MODEL=gemini-3.8-flash
GROQ_API_KEY=...            # optional — console.groq.com, automatic fallback when Gemini is rate-limited
```

```bash
npm run dev        # http://localhost:3000
```

Open **/chat**, say something like _"Invoice test@example.com $250 for coaching, due in 15 days"_, then watch **/dashboard**.

## Security

- All secrets live in `.env*` files — **never** committed (`.env*` is gitignored).
- Client-facing error messages are sanitized; full errors are logged server-side only.
- Webhook receiver supports PayPal transmission verification via `PAYPAL_WEBHOOK_ID`.
- Runs 100% on PayPal **Sandbox** — no real customer data, no real money.

## Hackathon

- Event: [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/) (Devpost)
- Tracks: Best Use of PayPal + AI · Agentic Commerce · AG Grid · Most Impactful · Best Demo Delivery
- Author: [ruukiepunk](https://github.com/ruukiepunk)

## License

[MIT](LICENSE) — do whatever you want, attribution appreciated.
