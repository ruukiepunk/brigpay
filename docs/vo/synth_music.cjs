// BrigPay video ambient bed — ORIGINAL composition (public domain / CC0 by authorship).
// No third-party audio is used anywhere in the final video.
// Slow warm pad, 4-chord loop x2, lowpassed, fades baked in. Output: build/music.wav
const fs = require("fs");
const path = require("path");

const SR = 44100;
const DUR = 84.9;
const N = Math.round(SR * DUR);
const XF = 2.4; // crossfade seconds between chords

const L = new Float64Array(N);
const R = new Float64Array(N);

// Am9 -> Fmaj9 -> G6/9 -> Cmaj9  (x2, ends resolved on C)
const CHORDS = [
  [[110.0, 0.5], [164.81, 0.28], [261.63, 0.2], [329.63, 0.15], [493.88, 0.1]], // Am9
  [[87.31, 0.5], [130.81, 0.28], [220.0, 0.2], [329.63, 0.15], [392.0, 0.1]],    // Fmaj9
  [[98.0, 0.5], [146.83, 0.28], [246.94, 0.2], [329.63, 0.15], [440.0, 0.1]],    // G6/9
  [[130.81, 0.5], [196.0, 0.28], [329.63, 0.15], [392.0, 0.2], [493.88, 0.1]],   // Cmaj9
];

const LOOPS = 2;
const LEN = DUR / (CHORDS.length * LOOPS); // 10.6125s per chord instance
const DETUNE = 0.0013;

function env(t, s, e, x) {
  if (t <= s - x || t >= e + x) return 0;
  if (t < s + x) {
    const u = (t - (s - x)) / (2 * x);
    const v = Math.sin((u * Math.PI) / 2);
    return v * v;
  }
  if (t <= e - x) return 1;
  const u = (t - (e - x)) / (2 * x);
  const v = Math.cos((u * Math.PI) / 2);
  return v * v;
}

let instances = 0;
for (let k = 0; k < CHORDS.length * LOOPS; k++) {
  const start = k * LEN;
  const end = start + LEN;
  const chord = CHORDS[k % CHORDS.length];
  const i0 = Math.max(0, Math.floor((start - XF) * SR));
  const i1 = Math.min(N, Math.ceil((end + XF) * SR));
  if (i0 >= i1) continue;
  instances++;

  // build oscillators for this chord instance
  const oscs = [];
  chord.forEach(([f, amp], ni) => {
    const base = ((k * 7 + ni * 13) % 360) * (Math.PI / 180);
    oscs.push({ w: (2 * Math.PI * f * (1 + DETUNE)) / SR, ph: base, a: amp / 2, side: "L" });
    oscs.push({ w: (2 * Math.PI * f * (1 - DETUNE)) / SR, ph: base + 1.1, a: amp / 2, side: "R" });
    // warm 2nd harmonic (mono, quiet)
    oscs.push({ w: (2 * Math.PI * f * 2) / SR, ph: base + 0.4, a: amp * 0.16, side: "B" });
  });

  let ph = oscs.map((o) => o.ph);
  for (let i = i0; i < i1; i++) {
    const t = i / SR;
    const w = env(t, start, end, XF);
    if (w <= 0) continue;
    for (let j = 0; j < oscs.length; j++) {
      const o = oscs[j];
      const s = Math.sin(ph[j]);
      ph[j] += o.w;
      if (ph[j] > 2 * Math.PI) ph[j] -= 2 * Math.PI;
      const v = w * o.a * s;
      if (o.side !== "R") L[i] += v;
      if (o.side !== "L") R[i] += v;
    }
  }
}

// gentle one-pole lowpass (softens everything, sits far under narration)
const a = 1 - Math.exp((-2 * Math.PI * 2100) / SR);
let yL = 0, yR = 0;
for (let i = 0; i < N; i++) {
  yL += a * (L[i] - yL);
  yR += a * (R[i] - yR);
  L[i] = yL;
  R[i] = yR;
}

// master fades (music only; VO mix has its own fade)
function smooth(u) { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); }
for (let i = 0; i < N; i++) {
  const t = i / SR;
  let g = smooth(t / 1.2);
  g *= smooth((DUR - t) / 1.5);
  L[i] *= g;
  R[i] *= g;
}

// normalize peak -> 0.6 (ffmpeg later scales by volume=0.12 => peak ~-23 dBFS)
let peak = 0;
for (let i = 0; i < N; i++) {
  const al = Math.abs(L[i]), ar = Math.abs(R[i]);
  if (al > peak) peak = al;
  if (ar > peak) peak = ar;
}
const norm = peak > 0 ? 0.6 / peak : 1;

// write 16-bit stereo WAV
const outDir = path.join(__dirname, "build");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "music.wav");
const data = Buffer.alloc(44 + N * 4);
data.write("RIFF", 0);
data.writeUInt32LE(36 + N * 4, 4);
data.write("WAVE", 8);
data.write("fmt ", 12);
data.writeUInt32LE(16, 16);
data.writeUInt16LE(1, 20);
data.writeUInt16LE(2, 22);
data.writeUInt32LE(SR, 24);
data.writeUInt32LE(SR * 4, 28);
data.writeUInt16LE(4, 32);
data.writeUInt16LE(16, 34);
data.write("data", 36);
data.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  const l = Math.max(-1, Math.min(1, L[i] * norm));
  const r = Math.max(-1, Math.min(1, R[i] * norm));
  data.writeInt16LE((l * 32767) | 0, 44 + i * 4);
  data.writeInt16LE((r * 32767) | 0, 44 + i * 4 + 2);
}
fs.writeFileSync(outFile, data);
console.log("music.wav ok:", (data.length / 1048576).toFixed(1) + "MB", instances + " chord instances");
