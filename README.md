# C Code Helper

C ka question likho, student-style code pao. Normal website, kisi bhi browser me chalegi.

## Laptop par chalane ke steps
1. Node.js (v18+) install karo: https://nodejs.org
2. Is folder me terminal kholo:
   ```
   npm install
   cp .env.example .env      # Windows: copy .env.example .env
   ```
3. `.env` file kholo aur apni Anthropic API key daalo (console.anthropic.com se milti hai).
4. `npm start` chalao, phir browser me http://localhost:3000 kholo.

## Internet par live karna (free options)
Render.com, Railway ya Vercel (Node) par GitHub repo connect karo.
Environment variable me `ANTHROPIC_API_KEY` set karo. Build command: `npm install`, Start command: `npm start`.

## Zaroori baatein
- API key kabhi frontend ya GitHub par mat daalo. `.env` pehle se `.gitignore` me hai.
- Public site banate ho to Anthropic console me monthly spend limit laga do.
- Server me basic rate limit hai (12 requests/minute per IP).

## Aage kya add kar sakte ho
- Online compile + run (Judge0 API)
- Login aur database me history
- Streaming answer (typing effect)
