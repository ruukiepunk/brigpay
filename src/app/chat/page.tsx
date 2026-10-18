"use client";

import { useEffect, useRef, useState } from "react";

interface Msg {
  role: "user" | "model";
  text: string;
}

const QUICK_ACTIONS = [
  "Who hasn't paid me?",
  "Chase everyone who is overdue",
  "Invoice ACME Corp billing@acme.com $2,500 for website redesign, due in 14 days",
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/chat", { method: "GET" })
      .then((r) => (r.ok ? r.json() : { history: [] }))
      .then((d) => {
        if (Array.isArray(d.history)) setMessages(d.history.map((m: { role: "user" | "model"; text: string }) => ({ role: m.role, text: m.text })));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: msg }]);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      const data = await res.json();
      setMessages((m) => [...m, { role: "model", text: data.reply || `Error: ${data.error || "no reply"}` }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "model", text: `Network error: ${String(e)}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-3xl flex-col">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">AI Collections Agent</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Tell it what to do in plain English — it operates real PayPal Invoicing APIs.
        </p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto rounded-2xl border p-5" style={{ borderColor: "var(--border)", background: "var(--panel)" }}>
        {messages.length === 0 && (
          <div className="space-y-3 pt-8 text-center">
            <div className="text-4xl">✦</div>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Try one of these:
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {QUICK_ACTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  className="rounded-full border px-3 py-1.5 text-[12px] transition-opacity hover:opacity-75"
                  style={{ borderColor: "var(--border)", color: "var(--text)" }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === "user" ? "chat-bubble-user rounded-br-md" : "chat-bubble-agent rounded-bl-md"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex justify-start">
            <div className="chat-bubble-agent flex items-center gap-1.5 rounded-2xl rounded-bl-md px-4 py-3">
              <span className="thinking-dot h-2 w-2 rounded-full" style={{ background: "var(--accent)" }} />
              <span className="thinking-dot h-2 w-2 rounded-full" style={{ background: "var(--accent)" }} />
              <span className="thinking-dot h-2 w-2 rounded-full" style={{ background: "var(--accent)" }} />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="mt-4 flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder='e.g. "Invoice Jane $800 for logo design, due in 7 days, jane@studio.com"'
          className="flex-1 rounded-xl border px-4 py-3 text-sm outline-none focus:ring-1"
          style={{ background: "var(--panel)", borderColor: "var(--border)", color: "var(--text)" }}
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-xl px-6 py-3 text-sm font-bold text-[#04110c] transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{ background: "var(--accent)" }}
        >
          Send
        </button>
      </form>
    </div>
  );
}
