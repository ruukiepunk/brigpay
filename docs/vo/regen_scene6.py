#!/usr/bin/env python3
"""Regenerate ONLY scene6 VO — versi lebih panjang (D+E total ~18s)."""
import asyncio, os, sys, wave
sys.path.insert(0, r"D:\tools\brigie-ai")
from gemini_live_tts import LiveTTS  # noqa: E402

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
TEXT = ("The customer pays - bank transfer, cash, or PayPal - and BrigPay records it "
        "through the chat, in seconds. Watch the dashboard flip to paid the moment "
        "the money lands. That's the full loop: invoice, chase, paid.")

def load_key() -> str:
    with open(r"D:\tools\brigie-ai\.env.local", "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if line.strip().startswith("GEMINI_API_KEY="):
                return line.strip().split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("key tidak ada")

async def main() -> None:
    tts = LiveTTS(api_key=load_key(), voice="Kore")
    pcm = bytearray()
    async for chunk in tts.stream(TEXT):
        pcm += chunk
    path = os.path.join(OUT_DIR, "scene6_paid_v2.wav")
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(24000)
        w.writeframes(bytes(pcm))
    print(f"scene6_paid_v2: {len(pcm)//2/24000:.1f}s")
    await tts.close()

asyncio.run(main())
