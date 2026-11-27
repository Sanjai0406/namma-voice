import type { Config, Context } from '@netlify/server'
import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenAI, Type } from '@google/genai'
import { knowledgeAsPrompt, sourcesFor } from './knowledge.ts'

const anthropic = new Anthropic()
const gemini = new GoogleGenAI({})

const CHAT_MODELS = ['claude-sonnet-5-5', 'claude-haiku-5-5']
const TRANSCRIBE_MODEL = 'gemini-3-flash-preview'

const LANGS: Record<string, string> = {
  ta: 'Tamil',
  hi: 'Hindi',
  te: 'Telugu',
  kn: 'Kannada',
  ml: 'Malayalam',
  en: 'English (simple Indian English)',
}

const KNOWLEDGE_PROMPT = knowledgeAsPrompt()

function systemPrompt(lang: string) {
  const langName = LANGS[lang] ?? LANGS.en
  return `You are "Namma Voice", a warm, patient voice assistant that helps people across India — senior citizens, rural families, small shop owners, daily-wage workers — with everyday services. You sound like a helpful neighbour at the local e-Sevai centre, not a chatbot.

USER'S PREFERRED LANGUAGE: ${langName}.
- Always write "reply", "steps", "question", "confirm_details" and "quick_replies" in ${langName}${lang === 'en' ? '' : ', in its native script'}. Use everyday spoken words, not formal or literary language. Common English words people actually use (bill, bank, OTP, app, online, number) may stay in English.
- Users often mix languages (Tanglish, Hinglish, Tenglish, Kanglish, Manglish) and may write romanised text. Understand it naturally. Regional accents and speech-to-text errors are common: interpret charitably, but never guess important details.

YOUR JOB EACH TURN:
1. Classify intent: banking | utilities | schemes | appointments | general.
2. If essential information is missing, ask exactly ONE short follow-up question (status "clarify"). Examples: which electricity provider / state, which scheme, which bank.
3. If the user gave an important detail (consumer number, account-related number, date, name, amount), repeat it back and ask them to confirm before using it (status "confirm_details").
4. If the message is garbled, empty or makes no sense, politely ask them to repeat, maybe closer to the microphone (status "unclear"). Do NOT guess an answer.
5. Otherwise answer (status "answer"): 1–3 short spoken sentences in "reply", plus up to 4 very short next "steps". End by gently checking if they understood or need more help — put that check in "question".

STRICT SAFETY & ACCURACY RULES:
- You only GUIDE. You cannot see accounts, bills, balances, application status, or make payments/bookings. Never claim a payment, booking or application is done or confirmed.
- Only state amounts, eligibility rules, helpline numbers and websites that appear in VERIFIED FACTS below. If something is not covered, say you don't have verified details and point them to the official office, website or helpline. Never invent eligibility rules, amounts, dates, numbers or URLs.
- NEVER ask for OTP, UPI PIN, ATM PIN, CVV, passwords, full card numbers or full account numbers. If the user shares or offers any of these, tell them firmly but kindly to never share it with anyone (status "safety_warning"), and mention 1930 if fraud may have happened.
- For emergencies (medical, fire, crime), immediately give 112 / 108 / 100.
- Keep it short: this is read aloud. No markdown, no emojis, no bullet characters inside strings.

VERIFIED FACTS (the only facts you may quote):
${KNOWLEDGE_PROMPT}`
}

const RESPOND_TOOL: Anthropic.Tool = {
  name: 'respond',
  description: 'Send the spoken + written response back to the user.',
  input_schema: {
    type: 'object',
    properties: {
      intent: { type: 'string', enum: ['banking', 'utilities', 'schemes', 'appointments', 'general'] },
      status: {
        type: 'string',
        enum: ['answer', 'clarify', 'confirm_details', 'unclear', 'safety_warning'],
      },
      reply: { type: 'string', description: 'What the assistant says aloud. 1–3 short sentences.' },
      steps: { type: 'array', items: { type: 'string' }, description: 'Up to 4 very short next steps. Empty if not needed.' },
      question: { type: 'string', description: 'ONE follow-up or understanding-check question, or empty string.' },
      confirm_details: { type: 'string', description: 'The detail being read back for confirmation, or empty string.' },
      quick_replies: {
        type: 'array',
        items: { type: 'string' },
        description: 'Up to 3 short tap-able answers the user is likely to say next (in the preferred language).',
      },
      knowledge_ids: { type: 'array', items: { type: 'string' }, description: 'IDs of VERIFIED FACTS entries used.' },
      detected_languages: {
        type: 'array',
        items: { type: 'string', enum: ['ta', 'hi', 'te', 'kn', 'ml', 'en', 'other'] },
        description: 'Languages present in the latest user message.',
      },
      topic: { type: 'string', description: '2–4 word English title for this conversation topic.' },
    },
    required: ['intent', 'status', 'reply', 'steps', 'question', 'quick_replies', 'knowledge_ids', 'detected_languages', 'topic'],
  },
}

/** Mask anything that looks like card numbers or OTP / PIN codes before it leaves the server. */
function maskSensitive(text: string): { text: string; masked: boolean } {
  let masked = false
  let out = text.replace(/\b(?:\d[ -]?){13,19}\b/g, () => {
    masked = true
    return '[number hidden]'
  })
  out = out.replace(/\b(otp|pin|cvv|password|passcode)\b([^\d]{0,15})(\d{3,8})/gi, (_m, w, mid) => {
    masked = true
    return `${w}${mid}[hidden]`
  })
  return { text: out, masked }
}

type ChatMessage = { role: 'user' | 'assistant'; content: string }

async function handleChat(req: Request) {
  const body = (await req.json().catch(() => null)) as { language?: string; messages?: ChatMessage[] } | null
  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: 'messages required' }, { status: 400 })
  }
  const lang = body.language && LANGS[body.language] ? body.language : 'en'

  let sensitiveMasked = false
  const history: Anthropic.MessageParam[] = []
  const recent = body.messages.slice(-14)
  recent.forEach((m, i) => {
    if (!m || typeof m.content !== 'string' || !m.content.trim()) return
    const role = m.role === 'assistant' ? 'assistant' : 'user'
    const { text, masked } = role === 'user' ? maskSensitive(m.content.slice(0, 2000)) : { text: m.content.slice(0, 2000), masked: false }
    if (masked && i === recent.length - 1) sensitiveMasked = true
    const prev = history[history.length - 1]
    if (prev && prev.role === role) prev.content = `${prev.content}\n${text}`
    else history.push({ role, content: text })
  })
  while (history.length && history[0].role !== 'user') history.shift()
  if (!history.length || history[history.length - 1].role !== 'user') {
    return Response.json({ error: 'last message must be from user' }, { status: 400 })
  }

  let lastError: unknown
  for (const model of CHAT_MODELS) {
    try {
      const msg = await anthropic.messages.create({
        model,
        max_tokens: 900,
        system: [{ type: 'text', text: systemPrompt(lang), cache_control: { type: 'ephemeral' } }],
        tools: [RESPOND_TOOL],
        tool_choice: { type: 'tool', name: 'respond' },
        messages: history,
      })
      const tool = msg.content.find((c) => c.type === 'tool_use')
      if (!tool || tool.type !== 'tool_use') throw new Error('no tool output')
      const r = tool.input as Record<string, unknown>
      const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()) : []) as string[]
      const ids = arr(r.knowledge_ids)
      return Response.json({
        intent: r.intent ?? 'general',
        status: sensitiveMasked ? 'safety_warning' : (r.status ?? 'answer'),
        reply: String(r.reply ?? ''),
        steps: arr(r.steps).slice(0, 4),
        question: String(r.question ?? ''),
        confirmDetails: String(r.confirm_details ?? ''),
        quickReplies: arr(r.quick_replies).slice(0, 3),
        detectedLanguages: arr(r.detected_languages),
        topic: String(r.topic ?? ''),
        sources: sourcesFor(ids),
        sensitiveMasked,
      })
    } catch (err) {
      lastError = err
      console.error(`chat model ${model} failed`, err)
    }
  }
  console.error('all chat models failed', lastError)
  return Response.json({ error: 'assistant_unavailable' }, { status: 502 })
}

async function handleTranscribe(req: Request) {
  const body = (await req.json().catch(() => null)) as { audio?: string; mimeType?: string; language?: string } | null
  if (!body?.audio || typeof body.audio !== 'string') {
    return Response.json({ error: 'audio required' }, { status: 400 })
  }
  if (body.audio.length > 4_000_000) {
    return Response.json({ error: 'audio too long' }, { status: 413 })
  }
  const lang = body.language && LANGS[body.language] ? body.language : 'en'
  const mimeType = (body.mimeType || 'audio/webm').split(';')[0]

  try {
    const res = await gemini.models.generateContent({
      model: TRANSCRIBE_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { data: body.audio, mimeType } },
            {
              text: `Transcribe this short voice message from an Indian user. Their preferred language is ${LANGS[lang]}, but they may mix languages (e.g. Tamil + English, Hindi + English) and have a regional accent. Write each word in the script of the language it was spoken in (English words in Latin script). Do not translate, do not answer, do not add words. If there is no speech, return clarity "no_speech". If the speech is too noisy or mumbled to transcribe confidently, return clarity "unclear" with your best partial transcript.`,
            },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            transcript: { type: Type.STRING },
            clarity: { type: Type.STRING, enum: ['clear', 'unclear', 'no_speech'] },
            languages: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ['transcript', 'clarity'],
        },
      },
    })
    const parsed = JSON.parse(res.text ?? '{}')
    return Response.json({
      transcript: String(parsed.transcript ?? '').trim(),
      clarity: parsed.clarity ?? 'clear',
      languages: Array.isArray(parsed.languages) ? parsed.languages : [],
    })
  } catch (err) {
    console.error('transcribe failed', err)
    return Response.json({ error: 'transcription_unavailable' }, { status: 502 })
  }
}

export default async (req: Request, _context: Context) => {
  const { pathname } = new URL(req.url)

  if (pathname === '/api/health') {
    return Response.json({ ok: true, time: Date.now() }, { headers: { 'cache-control': 'no-store' } })
  }
  if (req.method !== 'POST') {
    return Response.json({ error: 'not found' }, { status: 404 })
  }
  if (pathname === '/api/chat') return handleChat(req)
  if (pathname === '/api/transcribe') return handleTranscribe(req)
  return Response.json({ error: 'not found' }, { status: 404 })
}

export const config: Config = {
  path: '/api/*',
}
