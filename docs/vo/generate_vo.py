#!/usr/bin/env python3
"""Generate BrigPay demo voiceover — Gemini Live native audio, voice Kore.
Output: scene1.wav..scene7.wav (PCM16 mono 24kHz) di folder yang sama."""
import asyncio
import os
import sys
import wave

sys.path.insert(0, r"D:\tools\brigie-ai")
from gemini_live_tts import LiveTTS  # noqa: E402

OUT_DIR = os.path.dirname(os.path.abspath(__file__))

SCENES = [
    ("scene1_hook", "Small businesses lose weeks every year chasing unpaid invoices. What if an AI did the chasing, for you?"),
    ("scene2_intro", "Meet BrigPay. An AI agent that creates real PayPal invoices, and chases late payers automatically. Just talk to it."),
    ("scene3_invoice", "Tell it who to bill, and for what. BrigPay calls the real PayPal Invoicing API. The invoice is created and emailed in seconds. And here it is on the dashboard: sent, tracked, live."),
    ("scene4_whopays", "Ask who owes you money. The agent sums it up instantly: outstanding, overdue, and who to chase first."),
    ("scene5_chase", "One click, or one sentence, and BrigPay sweeps every overdue invoice, sending PayPal payment reminders automatically. Reminders tracked. Follow-ups handled. No awkward emails written by you."),
    ("scene6_paid", "The customer pays with PayPal, and the dashboard updates the moment the money lands. That's the full loop: invoice, chase, paid."),
    ("scene7_close", "BrigPay. Built on PayPal's Invoicing API, Gemini AI, and AG Grid. Free, open source, and ready for the millions of small businesses who just want to get paid. The repo is in the description."),
]


def load_key() -> str:
    env_path = r"D:\tools\brigie-ai\.env.local"
    with open(env_path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.strip()
            if line.startswith("GEMINI_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("GEMINI_API_KEY tidak ditemukan di .env.local brigie")


async def main() -> None:
    key = load_key()
    tts = LiveTTS(api_key=key, voice="Kore")
    for name, text in SCENES:
        pcm = bytearray()
        async for chunk in tts.stream(text):
            pcm += chunk
        path = os.path.join(OUT_DIR, f"{name}.wav")
        with wave.open(path, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(24000)
            w.writeframes(bytes(pcm))
        print(f"{name}: {len(pcm)//2/24000:.1f}s  ({len(pcm)} bytes)")
    await tts.close()


if __name__ == "__main__":
    asyncio.run(main())
