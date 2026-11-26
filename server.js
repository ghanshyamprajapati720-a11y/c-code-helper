
// C Code Helper: small Express server that keeps the API key on the backend.
const express = require("express");
const fs = require("fs");
const path = require("path");

// Tiny .env loader (no extra package needed)
try {
  fs.readFileSync(path.join(__dirname, ".env"), "utf8").split("\n").forEach((l) => {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  });
} catch (_) {}

const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.MODEL || "gemini-3.8-flash";
const PORT = process.env.PORT || 3000;

const STYLES = {
  student:
    "Write the program exactly like a first or second year student would in a lab file: simple variable names, stdio.h only unless truly needed, scanf/printf, plain loops, no clever tricks.",
  exam:
    "Write it in university exam format: first a short Algorithm (numbered steps), then the full C program, then a Sample Run. Keep code simple and neat.",
  optimized:
    "Write clean, efficient C code with good naming and the best common approach. After the code, mention time and space complexity in one line.",
};
const LANGS = {
  hinglish: "Explain in simple Hinglish (Hindi written in English letters). Code comments stay in simple English.",
  english: "Explain in simple English. Code comments stay in simple English.",
  hindi: "Explain in simple Hindi (Devanagari). Code comments stay in simple English.",
};

function systemPrompt(mode, lang) {
  return [
    "You are a C programming tutor for engineering students.",
    STYLES[mode] || STYLES.student,
    "Always put the complete, compilable program in ONE ```c code block. Avoid non-standard headers like conio.h and avoid gets(). Use int main() with return 0.",
    "After the code, give: Sample Input/Output, then 2-4 short lines on how the logic works.",
    LANGS[lang] || LANGS.hinglish,
    "If the question is not about C programming, reply in one line that you only help with C.",
  ].join("\n");
}

// Very small in-memory rate limit: 12 requests per minute per IP
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 12;
}

const app = express();
app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/solve", async (req, res) => {
  if (!KEY) return res.status(500).json({ error: "Server me GEMINI_API_KEY set nahi hai." });
  if (limited(req.ip)) return res.status(429).json({ error: "Thoda ruko, bahut zyada requests." });

  const { question, mode, lang } = req.body || {};
  if (typeof question !== "string" || question.trim().length < 3 || question.length > 4000)
    return res.status(400).json({ error: "Question 3 se 4000 characters ke beech hona chahiye." });

  try {
    const r = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt(mode, lang) }] },
          contents: [{ role: "user", parts: [{ text: question.trim() }] }],
          generationConfig: { maxOutputTokens: 2500 },
        }),
      }
    );
    const data = await r.json();
    if (!r.ok) {
      console.error("API error:", JSON.stringify(data));
      const msg = r.status === 429 ? "Free limit khatam ho gayi, thodi der baad try karo." : "AI service se error aaya. Dobara try karo.";
      return res.status(502).json({ error: msg });
    }
    const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    const text = parts.map((p) => p.text || "").join("");
    if (!text) return res.status(502).json({ error: "Khaali jawab aaya. Question thoda badal ke try karo." });
    res.json({ answer: text });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error. Dobara try karo." });
  }
});

app.listen(PORT, () => console.log("C Code Helper running on http://localhost:" + PORT));

