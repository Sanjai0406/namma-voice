import type { Intent, Lang } from './i18n'

export type AssistantMeta = {
  intent: Intent
  status: 'answer' | 'clarify' | 'confirm_details' | 'unclear' | 'safety_warning' | 'local'
  steps: string[]
  question: string
  confirmDetails: string
  quickReplies: string[]
  sources: { name: string; url?: string; phone?: string }[]
  detectedLanguages: string[]
  sensitiveMasked?: boolean
}

export type Message = {
  id: string
  role: 'user' | 'assistant'
  text: string
  at: number
  lang: Lang
  meta?: AssistantMeta
  /** user message whose request failed (network etc.) */
  failed?: boolean
  via?: 'voice' | 'text' | 'tap'
}

export type Conversation = {
  id: string
  title: string
  lang: Lang
  createdAt: number
  updatedAt: number
  intent?: Intent
  messages: Message[]
}

const KEY = 'namma-voice:conversations:v1'
const PREFS = 'namma-voice:prefs:v1'

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)

export function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Conversation[]) : []
  } catch {
    return []
  }
}

export function saveConversations(list: Conversation[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 40)))
  } catch {
    /* storage full or blocked — history is best-effort */
  }
}

export type Prefs = { lang: Lang | null; slow: boolean; large: boolean; autoSpeak: boolean }

export function loadPrefs(): Prefs {
  const d: Prefs = { lang: null, slow: false, large: false, autoSpeak: true }
  try {
    return { ...d, ...JSON.parse(localStorage.getItem(PREFS) || '{}') }
  } catch {
    return d
  }
}

export function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREFS, JSON.stringify(p))
  } catch {
    /* noop */
  }
}

/** Text form of an assistant turn, used both for read-aloud and for model context. */
export function spokenText(m: Message) {
  if (m.role !== 'assistant' || !m.meta) return m.text
  const parts = [m.text]
  if (m.meta.confirmDetails) parts.push(m.meta.confirmDetails)
  if (m.meta.steps.length) parts.push(m.meta.steps.map((s, i) => `${i + 1}. ${s}`).join(' '))
  if (m.meta.question) parts.push(m.meta.question)
  return parts.join(' ')
}

export type ChatReply = Omit<AssistantMeta, 'status'> & { status: AssistantMeta['status']; reply: string; topic: string }

export async function askAssistant(lang: Lang, messages: Message[], signal?: AbortSignal): Promise<ChatReply> {
  const payload = messages
    .filter((m) => !m.failed || m === messages[messages.length - 1])
    .filter((m) => m.meta?.status !== 'local')
    .map((m) => ({ role: m.role, content: spokenText(m) }))
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ language: lang, messages: payload }),
    signal,
  })
  if (!res.ok) throw new Error(`chat ${res.status}`)
  return res.json()
}

/** Client-side guard: detect when someone is about to share an OTP / PIN / card number. */
export function looksSensitive(text: string) {
  return /\b(?:\d[ -]?){13,19}\b/.test(text) || /\b(otp|pin|cvv|password)\b\D{0,15}\d{3,8}/i.test(text)
}
