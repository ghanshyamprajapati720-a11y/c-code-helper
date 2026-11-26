
const express = require("express");
const fs = require("fs");
const path = require("path");

// Tiny .env loader
try {
  fs.readFileSync(path.join(__dirname, ".env"), "utf8")
    .split("\n")
    .forEach((l) => {
      const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2];
      }
    });
} catch (_) {}

const KEY = process.env.GROQ_API_KEY;
const MODEL = "openai/gpt-oss-20b";
const PORT = process.env.PORT || 3000;

// Response styles
const STYLES = {
  student:
    "Write the program exactly like a first or second year student would in a lab file: simple variable names, stdio.h only unless truly needed, scanf/printf, plain loops, no clever tricks.",

  exam:
    "Write it in university exam format: first a short Algorithm (numbered steps), then the full C program, then a Sample Run. Keep code simple and neat.",

  optimized:
    "Write clean, efficient C code with good naming and the best common approach. After the code, mention time and space complexity in one line.",
};

// Languages
const LANGS = {
  hinglish:
    "Explain in simple Hinglish (Hindi written in English letters). Code comments stay in simple English.",

  english:
    "Explain in simple English. Code comments stay in simple English.",

  hindi:
    "Explain in simple Hindi (Devanagari). Code comments stay in simple English.",
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

  const arr = (hits.get(ip) || []).filter(
    (t) => now - t < 60000
  );

  arr.push(now);
  hits.set(ip, arr);

  return arr.length > 12;
}

// Express application
const app = express();

app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));

// Main solve API
app.post("/api/solve", async (req, res) => {

  if (!KEY) {
    return res.status(500).json({
      error: "Server me GROQ_API_KEY set nahi hai.",
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

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 20000);

  try {

    console.log("Groq model:", MODEL);

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",

        signal: controller.signal,

        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + KEY,
        },

        body: JSON.stringify({

          model: MODEL,

          messages: [
            {
              role: "system",
              content: systemPrompt(mode, lang),
            },
            {
              role: "user",
              content: question.trim(),
            },
          ],

          max_completion_tokens: 2500,

          reasoning_effort: "low",

          temperature: 0.3,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {

      console.error(
        "Groq API Error:",
        JSON.stringify(data)
      );

      if (response.status === 429) {
        return res.status(429).json({
          error: "Free API limit reached. Thodi der baad try karo.",
        });
      }

      if (response.status === 401) {
        return res.status(500).json({
          error: "Invalid Groq API key. Render settings check karo.",
        });
      }

      return res.status(502).json({
        error: "Groq AI service error. Dobara try karo.",
      });
    }

    const answer =
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content;

    if (!answer || !answer.trim()) {
      return res.status(502).json({
        error: "Khaali jawab aaya. Dobara try karo.",
      });
    }

    console.log("Answer generated successfully.");

    return res.json({
      answer: answer.trim(),
    });

  } catch (error) {

    console.error("Server Error:", error);

    if (error.name === "AbortError") {
      return res.status(504).json({
        error: "Request timed out. Please try again.",
      });
    }

    return res.status(500).json({
      error: "Server error. Dobara try karo.",
    });

  } finally {
    clearTimeout(timeout);
  }
});

// Start server
app.listen(PORT, () => {
  console.log(
    "C Code Helper running on port " + PORT
  );
});



