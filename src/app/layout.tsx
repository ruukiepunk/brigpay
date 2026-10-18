import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "BrigPay — AI Invoice Collector",
  description:
    "Chat with an AI agent that creates, sends and chases PayPal invoices for your small business.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen">
          {/* Sidebar */}
          <aside
            className="fixed inset-y-0 left-0 flex w-56 flex-col border-r p-4"
            style={{ borderColor: "var(--border)", background: "var(--panel)" }}
          >
            <div className="mb-8 flex items-center gap-2 px-2 pt-1">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-xl text-lg font-black"
                style={{ background: "var(--accent)", color: "#04110c" }}
              >
                B
              </div>
              <div>
                <div className="text-base font-bold leading-none">BrigPay</div>
                <div className="text-[11px]" style={{ color: "var(--muted)" }}>
                  AI invoice collector
                </div>
              </div>
            </div>

            <nav className="flex flex-col gap-1">
              {[
                { href: "/dashboard", label: "Dashboard", icon: "▦" },
                { href: "/chat", label: "AI Agent", icon: "✦" },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-white/5"
                  style={{ color: "var(--text)" }}
                >
                  <span style={{ color: "var(--accent)" }}>{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="mt-auto px-2 text-[11px] leading-relaxed" style={{ color: "var(--muted)" }}>
              <span
                className="mb-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{ background: "rgba(245, 158, 11, 0.15)", color: "var(--warn)" }}
              >
                SANDBOX MODE
              </span>
              <p>Real PayPal API, test money. Built for the PayPal AI Hackathon.</p>
            </div>
          </aside>

          {/* Main */}
          <main className="ml-56 flex-1 p-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
