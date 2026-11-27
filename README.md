# Namma Voice

A mobile-first, voice-first assistant that helps people across India — senior citizens, rural families, small shop owners and daily-wage workers — get guidance on everyday services by simply speaking in their own language.

Namma Voice understands **Tamil, Hindi, Telugu, Kannada, Malayalam and English**, including mixed speech such as Tanglish and Hinglish, and helps with:

- **Electricity & utility bills** – how to check / pay, which provider, complaint numbers
- **Banking information** – balance options, complaints, fraud safety (never asks for OTP/PIN)
- **Government schemes** – PM-KISAN, Ayushman Bharat PM-JAY, APY, PMSBY/PMJJBY, Ujjwala, pensions, ration
- **Appointments** – Aadhaar, passport, doctor / eSanjeevani
- **General help** – emergency numbers and more

It only gives guidance. It never makes payments or bookings, and it quotes only a curated set of verified facts with official sources.

## How a conversation works

1. Pick a language — the assistant greets you aloud.
2. Tap the big microphone and speak. A live level meter and transcript show it is listening.
3. The assistant identifies the intent (banking, utilities, schemes, appointments, general).
4. If something essential is missing, it asks **one** short question — and keeps listening hands-free.
5. It answers aloud and on screen with numbered next steps and official helplines/websites.
6. It checks you understood — tap *Understood*, *Repeat*, *Slower*, *Change language* or *Something else*.

Real-world voice handling: noise-suppressed microphone capture, "Did you say…?" read-back before acting on numbers or low-confidence speech, polite requests to repeat (never a guessed answer), online/offline status with retry, and a typing fallback.

## Tech

- **Frontend:** React 19 + Vite, plain CSS, Baloo font family (one design across all six scripts)
- **Speech:** browser Web Speech API for speech-to-text and text-to-speech; automatic fallback to cloud transcription (noise-suppressed WAV capture → Gemini) when the browser has no recogniser or its speech service is unreachable
- **Backend:** Netlify Server (`netlify/server/index.ts`) handling `/api/*`
  - `POST /api/chat` – intent recognition + response via Claude (Netlify AI Gateway), restricted to verified facts
  - `POST /api/transcribe` – multilingual / code-switched transcription via Gemini (Netlify AI Gateway)
  - `GET /api/health` – connectivity check
- **Privacy:** conversation history is stored only on the device (localStorage); the server stores nothing. OTP/PIN/card-like numbers are masked before they leave the phone and again on the server.

## Run locally

Requires Node 24+ and the Netlify CLI.

```bash
npm install
netlify dev --port 8889
```

Open http://localhost:8889. AI Gateway credentials are injected automatically by Netlify once the site has a production deploy. Microphone access needs `localhost` or HTTPS.

## Updating verified information

All scheme amounts, eligibility rules, helplines and websites live in `netlify/server/knowledge.ts`. The assistant is instructed to quote only these facts. Review this file periodically against official sources.

## Ideas for later

- Offline phrasebook for the most common questions
- Optional server-side neural TTS for devices without Indian-language voices
- More state-specific entries (state pension amounts, state portals)
