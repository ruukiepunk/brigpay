# BrigPay — Devpost Submission Description

> Copy-paste text below into the Devpost submission form.
> Video link: paste the YouTube URL after upload (see checklist at the bottom).

---

## One-liner

**BrigPay is an AI collections agent for small businesses: talk to it in plain English and it sends real PayPal invoices, chases late payers automatically, records off-PayPal payments, and shows everything live on an AG Grid command center.**

## The problem

Small businesses and freelancers lose an average of ~20 days a year chasing unpaid invoices. Invoicing tools make it easy to *send* an invoice — nobody makes the *chasing* (and the bookkeeping after the customer finally pays by bank transfer) automatic. That follow-up work is unpaid labor that falls on the business owner.

## What BrigPay does

1. **Invoice by conversation** — "Invoice ACME Corp billing@acmecorp.com $2,500 for website redesign, due in 14 days." The agent calls the real PayPal Invoicing API, creates the invoice, and emails it. Seconds later it's on the dashboard as SENT.
2. **Answers cashflow questions** — "Who hasn't paid me?" → the agent queries PayPal and replies with totals and customer names (all arithmetic done in code, never by the LLM).
3. **Autonomous follow-up sweeps** — "Chase everyone who is overdue" → the agent finds every overdue invoice and sends PayPal payment reminders in a loop, with per-invoice results and a tracked reminder count.
4. **Records off-PayPal payments** — the customer paid by bank transfer, cash, or check? Tell the agent; it records the external payment against the real PayPal invoice (`POST /v2/invoicing/invoices/{id}/payments`), so PayPal stays the single source of truth. The call is idempotent — a duplicated agent turn can never double-record a payment.
5. **Real-time dashboard** — PayPal webhooks (`INVOICING.INVOICE.PAID`, `.CANCELLED`, `.SENT`, `.AUTOMATIC-REMINDER-SENT`) plus a sync-on-load path keep the AG Grid command center current: sortable/filterable invoice grid, automatic OVERDUE pills (computed from due dates), per-row Remind, summary cards (outstanding / overdue / paid this month / reminders sent), and a live activity feed of everything the agent did.

## How it works

- **Agent**: Google Gemini (`gemini-3.8-flash`) with function calling over 6 tools (`create_and_send_invoice`, `list_invoices`, `send_reminder`, `run_followup_sweep`, `get_cashflow_summary`, `record_payment`). If Gemini is rate-limited, the agent **transparently falls back to Groq** (`openai/gpt-oss-120b`) via OpenAI-compatible function calling — the demo keeps running even when one LLM provider is down. Tool outputs are pre-computed in code (totals, overdue flags) so the model quotes numbers verbatim instead of doing mental math.
- **PayPal**: Invoicing API v2 (create → send → remind → record payment → cancel), OAuth2 client-credentials, webhook subscriptions with transmission verification — all against the **sandbox** (test money, real APIs).
- **Frontend**: Next.js 16 (App Router) + TypeScript + Tailwind v4; **AG Grid 36** for the invoice command center.
- **State**: JSON cache in `/tmp` with seed hydration; PayPal is always the source of truth (serverless instances re-sync before reads).
- **Deploy**: free Vercel Hobby — **live at https://brigpay.vercel.app** (dashboard `/dashboard`, agent `/chat`).

## Why it's more than a demo

- **Complete product, not a proof of concept**: chat interface + dashboard + webhooks + background sweep — an owner could run their real (sandbox) collections from it today.
- **Agentic, not just "AI-summarized"**: the agent *acts* — creates and emails invoices, sends reminders, records payments — with every action visible in the activity feed.
- **Honest books**: recording external (non-PayPal) payments is what real SMB accounting needs; BrigPay does it against the actual PayPal invoice instead of a separate shadow list.
- **Resilient by design**: dual-LLM fallback, idempotent payment recording, code-computed totals, webhook + sync dual-path — details that separate a working product from a happy-path script.

## Try it

1. Open **https://brigpay.vercel.app/chat**
2. Ask: *"Who hasn't paid me?"*
3. Say: *"Chase everyone who is overdue"*
4. Open **https://brigpay.vercel.app/dashboard** and watch the grid + activity feed
5. Bonus: *"Tyrell just paid invoice BRG-5432701 by bank transfer — record it"* → the row flips to PAID (manual)

Repo (MIT): https://github.com/ruukiepunk/brigpay
Live app: https://brigpay.vercel.app
Video: [PASTE YOUTUBE LINK]

## Built with (sponsor tools)

- **PayPal Developer Platform** (Invoicing v2, Webhooks, OAuth2) — central to everything
- **AG Grid** — invoice command center
- *(AI: Google Gemini with Groq fallback)*

---

## Checklist saat submit (jangan lupa)

- [ ] Pilih kategori: **Best Use of PayPal + AI**, **Best Use of Agentic Commerce**, **Best Use of AG Grid**, **Most Impactful**, **Best Demo Delivery** (opsional: Most Creative)
- [ ] Upload video final `docs/vo/brigpay-final.mp4` ke **YouTube (public)** → tempel link di kolom video
- [ ] Isi deskripsi dari file ini
- [ ] Repo URL: `https://github.com/ruukiepunk/brigpay`
- [ ] Testing notes: live URL sudah jalan, tidak perlu install; untuk lokal: clone → `.env.local` (lihat `.env.example`) → `npm install && npm run dev`
