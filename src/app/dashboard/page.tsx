"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  provideGlobalGridOptions,
  type ColDef,
  type ICellRendererParams,
} from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";

ModuleRegistry.registerModules([AllCommunityModule]);
// AG Grid v33+: we keep the classic CSS-file themes — mark them as legacy (silences error #239)
provideGlobalGridOptions({ theme: "legacy" });

interface Invoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_email: string;
  amount: string;
  currency: string;
  status: string;
  invoice_date: string;
  due_date: string;
  reminder_count: number;
  last_reminder_at: string | null;
  created_at?: string;
  is_overdue?: boolean;
  days_overdue?: number;
}

interface EventRow {
  id: string;
  type: string;
  message: string;
  at: string;
}

const STATUS_STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  PAID: { bg: "rgba(16,185,129,.15)", fg: "#34d399", label: "PAID" },
  MARKED_AS_PAID: { bg: "rgba(16,185,129,.15)", fg: "#34d399", label: "PAID (manual)" },
  SENT: { bg: "rgba(59,130,246,.15)", fg: "#60a5fa", label: "SENT" },
  PAYMENT_PENDING: { bg: "rgba(245,158,11,.15)", fg: "#fbbf24", label: "PENDING" },
  PARTIALLY_PAID: { bg: "rgba(245,158,11,.15)", fg: "#fbbf24", label: "PARTIAL" },
  DRAFT: { bg: "rgba(148,163,184,.15)", fg: "#94a3b8", label: "DRAFT" },
  CANCELLED: { bg: "rgba(148,163,184,.12)", fg: "#64748b", label: "CANCELLED" },
  REFUNDED: { bg: "rgba(239,68,68,.12)", fg: "#f87171", label: "REFUNDED" },
};

function statusOf(inv: { status: string; due_date: string; is_overdue?: boolean }): {
  bg: string;
  fg: string;
  label: string;
} {
  if (inv.is_overdue) {
    return { bg: "rgba(239,68,68,.16)", fg: "#f87171", label: "OVERDUE" };
  }
  return STATUS_STYLES[inv.status] || { bg: "rgba(148,163,184,.15)", fg: "#cbd5e1", label: inv.status };
}

function StatusPill({ data }: ICellRendererParams<Invoice>) {
  const s = statusOf(data!);
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}

function CustomerCell({ data }: ICellRendererParams<Invoice>) {
  return (
    <div className="leading-tight">
      <div className="font-semibold text-[13px]">{data!.customer_name}</div>
      <div className="text-[11px]" style={{ color: "var(--muted)" }}>
        {data!.customer_email}
      </div>
    </div>
  );
}

function DueCell({ data }: ICellRendererParams<Invoice>) {
  const inv = data!;
  return (
    <div className="leading-tight">
      <div className="text-[13px]">{inv.due_date || "—"}</div>
      {inv.is_overdue && inv.days_overdue != null && (
        <div className="text-[11px] font-medium" style={{ color: "#f87171" }}>
          {inv.days_overdue} day{inv.days_overdue === 1 ? "" : "s"} overdue
        </div>
      )}
    </div>
  );
}

function ActionsCell({ data, refresh }: ICellRendererParams<Invoice> & { refresh: () => void }) {
  const inv = data!;
  const [busy, setBusy] = useState(false);
  const unpaid = ["SENT", "PAYMENT_PENDING", "PARTIALLY_PAID"].includes(inv.status);

  const remind = async () => {
    setBusy(true);
    try {
      await fetch("/api/remind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_id: inv.id }),
      });
      refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {unpaid && (
        <button
          onClick={remind}
          disabled={busy}
          className="rounded-md px-2.5 py-1 text-[11px] font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
          style={{ background: "rgba(16,185,129,.15)", color: "#34d399" }}
        >
          {busy ? "Sending…" : "Remind"}
        </button>
      )}
      <a
        href={`https://www.sandbox.paypal.com/invoice/#${inv.id}`}
        target="_blank"
        rel="noreferrer"
        className="text-[11px] font-medium hover:underline"
        style={{ color: "var(--accent-2)" }}
      >
        View ↗
      </a>
    </div>
  );
}

function SummaryCard({ label, value, hint, color }: { label: string; value: string; hint?: string; color?: string }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--panel)" }}>
      <div className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--muted)" }}>
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold" style={{ color: color || "var(--text)" }}>
        {value}
      </div>
      {hint && (
        <div className="mt-0.5 text-[11px]" style={{ color: "var(--muted)" }}>
          {hint}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [quickFilter, setQuickFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [sweeping, setSweeping] = useState(false);
  const [sweepMsg, setSweepMsg] = useState<string | null>(null);
  const [gridApi, setGridApi] = useState<unknown>(null);

  const load = useCallback(async (sync: boolean) => {
    try {
      const res = await fetch(sync ? "/api/invoices?sync=1" : "/api/invoices");
      const data = await res.json();
      if (res.ok) {
        setInvoices(data.invoices || []);
        setEvents(data.events || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(true);
  }, [load]);

  // "Today" is computed client-side only (avoids unstable `new Date()` during prerender)
  const [today, setToday] = useState("");
  useEffect(() => {
    setToday(new Date().toISOString().slice(0, 10));
  }, []);

  useEffect(() => {
    (gridApi as { setGridOption?: (k: string, v: unknown) => void })?.setGridOption?.("quickFilterText", quickFilter);
  }, [quickFilter, gridApi]);

  const withFlags = useMemo(
    () =>
      invoices.map((i) => {
        const is_overdue =
          !!today && ["SENT", "PAYMENT_PENDING"].includes(i.status) && !!i.due_date && i.due_date < today;
        const days_overdue = is_overdue
          ? Math.round((Date.parse(today) - Date.parse(i.due_date)) / 86400000)
          : 0;
        return { ...i, is_overdue, days_overdue };
      }),
    [invoices, today]
  );

  const rows = useMemo(
    () =>
      statusFilter === "ALL" ? withFlags : withFlags.filter((i) => statusOf(i).label === statusFilter),
    [withFlags, statusFilter]
  );

  const outstanding = withFlags
    .filter((i) => ["SENT", "PAYMENT_PENDING", "PARTIALLY_PAID"].includes(i.status))
    .reduce((s, i) => s + Number(i.amount), 0);
  const overdue = withFlags.filter((i) => i.is_overdue);
  const month = today.slice(0, 7);
  const paidThisMonth = withFlags
    .filter((i) => ["PAID", "MARKED_AS_PAID"].includes(i.status) && i.created_at?.slice(0, 7) === month)
    .reduce((s, i) => s + Number(i.amount), 0);
  const remindersSent = withFlags.reduce((s, i) => s + i.reminder_count, 0);

  const colDefs: ColDef<Invoice>[] = [
    { field: "invoice_number", headerName: "Invoice", width: 130, cellStyle: { fontFamily: "ui-monospace, monospace", fontSize: "12px" } },
    { field: "customer_name", headerName: "Customer", flex: 1.4, minWidth: 200, cellRenderer: CustomerCell },
    {
      field: "amount",
      headerName: "Amount",
      width: 140,
      sortable: true,
      cellRenderer: (p: ICellRendererParams<Invoice>) => {
        const v = Number(p.value).toLocaleString("en-US", { minimumFractionDigits: 2 });
        return <span className="font-bold">{p.data?.currency === "USD" ? "$" : `${p.data?.currency} `}{v}</span>;
      },
    },
    { field: "status", headerName: "Status", width: 140, cellRenderer: StatusPill },
    { field: "due_date", headerName: "Due date", width: 150, cellRenderer: DueCell },
    {
      field: "reminder_count",
      headerName: "Reminders",
      width: 120,
      cellRenderer: (p: ICellRendererParams<Invoice>) => (
        <span
          className="rounded px-2 py-0.5 text-[12px] font-semibold"
          style={{
            background: p.value > 0 ? "rgba(245,158,11,.12)" : "transparent",
            color: p.value > 0 ? "#fbbf24" : "var(--muted)",
          }}
        >
          {p.value ?? 0}
        </span>
      ),
    },
    {
      field: "id",
      headerName: "",
      width: 170,
      sortable: false,
      filter: false,
      cellRenderer: (p: ICellRendererParams<Invoice>) => <ActionsCell {...p} refresh={() => load(false)} />,
    },
  ];

  const runSweep = async () => {
    setSweeping(true);
    setSweepMsg(null);
    try {
      const res = await fetch("/api/sweep", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        const ok = (data.results || []).filter((r: { ok: boolean }) => r.ok).length;
        setSweepMsg(`Sweep #${data.run}: ${ok}/${data.overdue} reminders sent`);
        await load(false);
      } else {
        setSweepMsg(`Sweep failed: ${data.error}`);
      }
    } finally {
      setSweeping(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Invoice command center</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Live data from PayPal Sandbox · {invoices.length} invoices
          </p>
        </div>
        <div className="flex items-center gap-2">
          {sweepMsg && (
            <span className="rounded-md px-3 py-1.5 text-[12px]" style={{ background: "var(--panel-2)", color: "var(--muted)" }}>
              {sweepMsg}
            </span>
          )}
          <button
            onClick={() => { setSyncing(true); load(true).finally(() => setSyncing(false)); }}
            disabled={syncing}
            className="rounded-lg border px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
            style={{ borderColor: "var(--border)", background: "var(--panel)" }}
          >
            {syncing ? "Syncing…" : "↻ Sync with PayPal"}
          </button>
          <button
            onClick={runSweep}
            disabled={sweeping || overdue.length === 0}
            className="rounded-lg px-4 py-2 text-sm font-bold text-[#04110c] transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ background: "var(--accent)" }}
          >
            {sweeping ? "Chasing…" : `⚡ Chase ${overdue.length} overdue`}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <SummaryCard label="Outstanding" value={`$${outstanding.toLocaleString("en-US", { minimumFractionDigits: 2 })}`} hint="Awaiting payment" />
        <SummaryCard label="Overdue" value={String(overdue.length)} color={overdue.length ? "#f87171" : undefined} hint={overdue.length ? overdue.map((o) => o.customer_name).slice(0, 2).join(", ") : "All clear"} />
        <SummaryCard label="Paid this month" value={`$${paidThisMonth.toLocaleString("en-US", { minimumFractionDigits: 2 })}`} color="#34d399" />
        <SummaryCard label="Reminders sent" value={String(remindersSent)} color="#fbbf24" hint="By AI agent & sweeps" />
      </div>

      <div className="flex gap-6">
        <div className="flex-1">
          <div className="mb-3 flex items-center gap-3">
            <input
              value={quickFilter}
              onChange={(e) => setQuickFilter(e.target.value)}
              placeholder="Search customer, invoice #, amount…"
              className="w-72 rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ background: "var(--panel)", borderColor: "var(--border)", color: "var(--text)" }}
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ background: "var(--panel)", borderColor: "var(--border)", color: "var(--text)" }}
            >
              {["ALL", "SENT", "OVERDUE", "PENDING", "PAID", "CANCELLED"].map((s) => (
                <option key={s} value={s}>{s === "ALL" ? "All statuses" : s}</option>
              ))}
            </select>
          </div>

          <div className="ag-theme-quartz-dark rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)", height: 520 }}>
            <AgGridReact<Invoice>
              rowData={rows}
              columnDefs={colDefs}
              defaultColDef={{ resizable: true, sortable: true, filter: true }}
              onGridReady={(p) => setGridApi(p.api)}
              loading={loading}
              animateRows
            />
          </div>
        </div>

        <div className="w-72 shrink-0">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            Live activity
          </h2>
          <div className="space-y-2 overflow-y-auto pr-1" style={{ maxHeight: 560 }}>
            {events.length === 0 && (
              <p className="text-[12px]" style={{ color: "var(--muted)" }}>
                No activity yet — create an invoice from the AI Agent tab.
              </p>
            )}
            {events.map((e) => (
              <div key={e.id} className="rounded-lg border p-2.5" style={{ borderColor: "var(--border)", background: "var(--panel)" }}>
                <div className="flex items-center justify-between">
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                    style={{
                      background: e.type.includes("PAID") ? "rgba(16,185,129,.15)" : e.type.includes("REMINDER") ? "rgba(245,158,11,.15)" : "rgba(59,130,246,.15)",
                      color: e.type.includes("PAID") ? "#34d399" : e.type.includes("REMINDER") ? "#fbbf24" : "#60a5fa",
                    }}
                  >
                    {e.type}
                  </span>
                  <span className="text-[10px]" style={{ color: "var(--muted)" }}>
                    {new Date(e.at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <p className="mt-1.5 text-[12px] leading-snug">{e.message}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
