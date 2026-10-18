import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "@/lib/agent";
import * as db from "@/lib/db";

export const maxDuration = 60;

/** GET /api/chat — chat history (last 40 messages) */
export async function GET() {
  const history = await db.getChat();
  return NextResponse.json({ history });
}

export async function POST(req: NextRequest) {
  try {
    const { message } = (await req.json()) as { message?: string };
    if (!message?.trim()) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    const history = await db.getChat();
    await db.appendChat("user", message);

    const reply = await runAgent(message, history);
    await db.appendChat("model", reply);

    return NextResponse.json({ reply });
  } catch (e) {
    // Security protocol: log detail lengkap di server, kirim pesan aman ke client
    console.error("/api/chat error:", e);
    return NextResponse.json(
      { error: "Something went wrong running the agent. Please try again." },
      { status: 500 }
    );
  }
}
