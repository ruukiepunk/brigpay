const { GoogleGenAI } = require("@google/genai");
const fs = require("fs");

let key = "";
for (const line of fs.readFileSync("D:\\tools\\brigie-ai\\.env.local", "utf8").split(/\r?\n/)) {
  if (line.startsWith("GEMINI_API_KEY=")) { key = line.split("=")[1].trim(); break; }
}

const candidates = [
  "gemini-3.8-flash",
  "gemini-3.8-flash-lite",
  "gemini-flash-latest",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-3-pro",
];

(async () => {
  const ai = new GoogleGenAI({ apiKey: key });
  for (const m of candidates) {
    try {
      const r = await ai.models.generateContent({ model: m, contents: "ping" });
      const txt = r.text || "";
      console.log(`${m} => OK (${txt.slice(0, 30)})`);
    } catch (e) {
      const msg = String(e && e.message || e);
      let tag = "ERR";
      if (msg.includes("429") || msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED")) tag = "QUOTA";
      if (msg.includes("404") || msg.includes("not found") || msg.includes("is not found")) tag = "NOEXIST";
      console.log(`${m} => ${tag}: ${msg.slice(0, 100)}`);
    }
  }
})();
