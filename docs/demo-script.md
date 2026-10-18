# BrigPay — Demo Video Script

Event: PayPal AI Hackathon (Devpost) · Target durasi: **~2 menit** · Bahasa: **English**
Voiceover: Gemini Live TTS (`D:\tools\brigie-ai\gemini_live_tts.py`, voice "Kore", natural)
Rekaman: OBS (Display Capture, 1920x1080) → ffmpeg potong per scene → 1280x720 final

## Scene 1 — HOOK (0:00–0:12)
- Visual: judul animasi sederhana (dark navy, logo B hijau) — dibuat via HTML → screenshot / ffmpeg drawtext
- VO: "Small businesses lose weeks every year chasing unpaid invoices. What if an AI did the chasing — for you?"

## Scene 2 — INTRO (0:12–0:22)
- Visual: buka dashboard BrigPay (data 6 invoice kelihatan), zoom kartu Outstanding
- VO: "Meet BrigPay — an AI agent that creates real PayPal invoices, and chases late payers automatically. Just talk to it."

## Scene 3 — CHAT → INVOICE (0:22–0:50)
- Visual: tab AI Agent → ketik (manual ketik pelan biar natural): "Invoice Globex Shipping, accounts@globex.test, 480 USD for freight consulting, due in 15 days. Send it now."
- Tunggu reply agent → invoice number muncul
- Pindah ke dashboard → row baru Globex ada (status SENT)
- VO: "Tell it who to bill and for what. BrigPay calls the real PayPal Invoicing API — the invoice is created and emailed in seconds. And here it is on the dashboard: sent, tracked, live."

## Scene 4 — WHO HASN'T PAID (0:50–1:10)
- Visual: chat: "Who hasn't paid me?" → reply agent nunjuk total outstanding
- VO: "Ask who owes you money — the agent sums it up instantly: outstanding, overdue, who to chase first."

## Scene 5 — AUTONOMOUS CHASE (1:10–1:40)
- Visual: dashboard → tombol "⚡ Chase 2 overdue" (Initech & Wayne yang telat) → klik → results muncul → reminder_count naik di grid → activity feed kirim event REMINDER.SENT
- VO: "One click — or one sentence — and BrigPay sweeps every overdue invoice, sending PayPal payment reminders automatically. Reminders, tracked. Follow-ups, zero awkward emails written by you."

## Scene 6 — GETTING PAID (1:40–2:00) *(butuh akun buyer sandbox)*
- Visual: buka link invoice di sandbox.paypal.com (buyer) → bayar → kembali ke dashboard → refresh → status PAID, "Paid this month" naik
- VO: "The customer pays with PayPal — and the dashboard updates the moment the money lands. That's the full loop: invoice, chase, paid."

## Scene 7 — CLOSE (2:00–2:20)
- Visual: layar penuh dashboard + overlay teks: "BrigPay · PayPal Invoicing API · Gemini AI · AG Grid · MIT License" + repo URL
- VO: "BrigPay — built on PayPal's Invoicing API, Gemini AI, and AG Grid. Free, open source, and ready for the millions of small businesses who just want to get paid. Repo's in the description."

## Catatan produksi
- Ketik manual di browser waktu rekam (jangan paste) → terlihat natural
- Jeda 1-2 detik sebelum/ sesudah aksi penting (buat potongan ffmpeg)
- Suara TTS: generate per scene (7 file WAV) → ffmpeg concat + overlay ke video
- Cek level audio: VO -14 LUFS target, jangan lebih
- Jangan tampilkan .env / kredensial di layar — tutup tab terminal
