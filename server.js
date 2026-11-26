
const express = require("express");
const fs = require("fs");
const path = require("path");

// Tiny .env loader
try {
  fs.readFileSync(path.join(__dirname, ".env"), "utf8").split("\n").forEach((l) => {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  });
} catch (_) {}

const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.MODEL || "gemini-3.7-flash";
const FALLBACK_MODEL = process.env.FALLBACK_MODEL || "gemini-3.6-flash";
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

// Rate limit: 12 requests per minute per IP
const hits = new Map();

function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 12;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Gemini API with automatic retry
async function callGemini(model, prompt) {
  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const r = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": KEY,
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: prompt.system }],
            },
            contents: [{
              role: "user",
              parts: [{ text: prompt.question }],
            }],
            generationConfig: {
              maxOutputTokens: 2500,
            },
          }),
        }
      );

      const data = await r.json();

      if (r.ok) {
        const parts =
          (data.candidates &&
            data.candidates[0] &&
            data.candidates[0].content &&
            data.candidates[0].content.parts) || [];

        const answer = parts.map((p) => p.text || "").join("");

        if (!answer) {
          throw new Error("EMPTY_RESPONSE");
        }

        return answer;
      }

      if ([500, 502, 503, 504].includes(r.status) && attempt < MAX_RETRIES) {
        console.log(`Model ${model} unavailable. Retry ${attempt + 1}/2`);
        await sleep(1500 * Math.pow(2, attempt));
        continue;
      }

      const error = new Error("GEMINI_API_ERROR");
      error.status = r.status;
      error.details = data;
      throw error;

    } catch (e) {
      if (e.message === "EMPTY_RESPONSE" || e.status) {
        throw e;
      }

      if (attempt < MAX_RETRIES) {
        console.log(`Network error. Retry ${attempt + 1}/2`);
        await sleep(1500 * Math.pow(2, attempt));
        continue;
      }

      throw e;
    }
  }
}

const app = express();

app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/solve", async (req, res) => {
  if (!KEY) {
    return res.status(500).json({
      error: "Server me GEMINI_API_KEY set nahi hai.",
    });
  }

  if (limited(req.ip)) {
    return res.status(429).json({
      error: "Thoda ruko, bahut zyada requests.",
    });
  }

  const { question, mode, lang } = req.body || {};

  if (
    typeof question !== "string" ||
    question.trim().length < 3 ||
    question.length > 4000
  ) {
    return res.status(400).json({
      error: "Question 3 se 4000 characters ke beech hona chahiye.",
    });
  }

  const prompt = {
    system: systemPrompt(mode, lang),
    question: question.trim(),
  };

  try {
    let answer;

    try {
      console.log("Trying primary model:", MODEL);
      answer = await callGemini(MODEL, prompt);

    } catch (primaryError) {
      console.error(
        "Primary model failed:",
        primaryError.status || primaryError.message
      );

      // Fallback for temporary errors and rate limits
      if (
        primaryError.status &&
        ![429, 500, 502, 503, 504].includes(primaryError.status)
      ) {
        throw primaryError;
      }

      if (MODEL === FALLBACK_MODEL) {
        throw primaryError;
      }

      console.log("Switching to backup model:", FALLBACK_MODEL);

      answer = await callGemini(FALLBACK_MODEL, prompt);
    }

    return res.json({ answer });

  } catch (e) {
    console.error("API error:", e.details || e.message);

    if (e.status === 429) {
      return res.status(429).json({
        error: "Free limit khatam ho gayi, thodi der baad try karo.",
      });
    }

    if ([400, 403, 404].includes(e.status)) {
      return res.status(502).json({
        error: "Model ya API configuration me problem hai. Server logs check karo.",
      });
    }

    return res.status(502).json({
      error: "Dono Gemini models abhi unavailable hain. Thodi der baad try karo.",
    });
  }
});

app.listen(PORT, () => {
  console.log("C Code Helper running on port " + PORT);
});


