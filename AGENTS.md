# AGENTS.md — Namma Voice

## Architecture

- **Vite + React SPA** in `src/`, published from `dist/`. Single screen app (welcome → conversation).
- **Netlify Server** at `netlify/server/index.ts` (handler export, `config.path = '/api/*'`). It is the only backend. Do not add a full-stack framework/template: its catch-all would swallow `/api/*`.
- **AI via Netlify AI Gateway** — zero-config SDK constructors (`new Anthropic()`, `new GoogleGenAI({})`). Never add API key checks.
  - Chat/intent: `claude-sonnet-5-5`, falls back to `claude-haiku-5-5`. Forced tool call `respond` returns structured JSON (intent, status, reply, steps, question, confirm_details, quick_replies, knowledge_ids, detected_languages, topic).
  - Transcription fallback: `gemini-3-flash-preview` with audio inline data (16 kHz mono WAV) and JSON schema output.

## Key files

| File | Purpose |
|---|---|
| `src/App.tsx` | All UI + conversation flow (greeting, listen, confirm read-back, ask, follow-up actions, history, language sheet) |
| `src/speech.ts` | TTS (chunked speechSynthesis) and `useVoiceInput` hook: Web Speech API engine + cloud engine (getUserMedia with noiseSuppression, VAD with noise-floor calibration, WAV encode) |
| `src/i18n.ts` | Languages, greetings, every UI string and suggestion in 6 languages |
| `src/store.ts` | Conversation/prefs persistence (localStorage only), API client, sensitive-data detection |
| `src/icons.tsx` | Inline SVG icons; `INTENT_ICON` maps intents to glyphs |
| `netlify/server/knowledge.ts` | **Verified facts** the model may quote. Add/modify facts here, always with an official source |
| `netlify/server/index.ts` | `/api/chat`, `/api/transcribe`, `/api/health` |

## Conventions & non-obvious decisions

- **Accuracy rule:** the system prompt forbids stating amounts/eligibility/helplines/URLs not present in `knowledge.ts`. Sources shown in the UI come from `knowledge_ids` → `sourcesFor()` server-side, never from model text.
- **Safety:** never ask for OTP/PIN/CVV/passwords. Card-like numbers and `otp/pin … digits` are masked client-side (`maskSensitive` in App) and server-side; the server forces `status: safety_warning` when the latest message was masked.
- **Misheard words:** transcripts containing 4+ digits, low recogniser confidence (<0.55), or Gemini `clarity: unclear` go through the "Did you say…?" card before sending.
- **Hands-free:** after a voice turn, if the reply status is `clarify` / `confirm_details` / `unclear`, listening restarts automatically when TTS finishes.
- **Android:** a parallel `getUserMedia` meter conflicts with Web Speech on Android, so the meter is skipped there (level is simulated from results).
- **Greeting-only conversations are not persisted** (filtered on save) so opening the app doesn't litter history.
- Local quick actions (Understood / Something else) create assistant messages with `status: 'local'`; these are excluded from model context.
- All user-facing strings must exist in all six languages in `i18n.ts`. Language-specific fonts are applied via `[lang]` selectors in `styles.css`.
- Touch targets ≥ 48px; base font 19px (23px with the text-size toggle). Keep high contrast.
