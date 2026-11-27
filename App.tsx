import { useCallback, useEffect, useRef, useState } from 'react'
import { LANGUAGES, STRINGS, speechCode, type Intent, type Lang } from './i18n'
import {
  askAssistant,
  loadConversations,
  loadPrefs,
  looksSensitive,
  saveConversations,
  savePrefs,
  spokenText,
  uid,
  type Conversation,
  type Message,
  type Prefs,
} from './store'
import { hasVoiceFor, onVoicesChanged, speak, stopSpeaking, ttsSupported, useVoiceInput, type VoiceError, type VoiceResult } from './speech'
import {
  CheckIcon,
  EditIcon,
  GlobeIcon,
  HistoryIcon,
  INTENT_ICON,
  KeyboardIcon,
  LinkIcon,
  MicIcon,
  PhoneIcon,
  PlayIcon,
  PlusIcon,
  RepeatIcon,
  SendIcon,
  ShieldIcon,
  SlowIcon,
  StopIcon,
  TrashIcon,
  WifiOffIcon,
  XIcon,
} from './icons'

const SLOW_RATE = 0.72
const NORMAL_RATE = 0.95

function maskSensitive(text: string) {
  return text
    .replace(/\b(?:\d[ -]?){13,19}\b/g, '••••')
    .replace(/\b(otp|pin|cvv|password)\b(\D{0,15})\d{3,8}/gi, (_m, w, mid) => `${w}${mid}••••`)
}

const LANG_PAIR_LABEL: Record<string, string> = {
  'en+ta': 'Tanglish',
  'en+hi': 'Hinglish',
  'en+te': 'Tenglish',
  'en+kn': 'Kanglish',
  'en+ml': 'Manglish',
}

function mixLabel(langs: string[]) {
  const uniq = [...new Set(langs.filter((l) => l !== 'other'))].sort()
  if (uniq.length < 2) return null
  return LANG_PAIR_LABEL[uniq.join('+')] ?? uniq.map((l) => l.toUpperCase()).join(' + ')
}

function greetingMessage(l: Lang): Message {
  return {
    id: uid(),
    role: 'assistant',
    text: STRINGS[l].greeting,
    at: Date.now(),
    lang: l,
    meta: {
      intent: 'general',
      status: 'local',
      steps: [],
      question: '',
      confirmDetails: '',
      quickReplies: [],
      sources: [],
      detectedLanguages: [],
    },
  }
}

function localReply(l: Lang, text: string): Message {
  return { ...greetingMessage(l), text }
}

export default function App() {
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs)
  const [phase, setPhase] = useState<'welcome' | 'app'>('welcome')
  const [convos, setConvos] = useState<Conversation[]>(loadConversations)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [speakingId, setSpeakingId] = useState<string | null>(null)
  const [pending, setPending] = useState<VoiceResult | null>(null)
  const [hint, setHint] = useState<{ text: string; kind: 'info' | 'warn' } | null>(null)
  const [textMode, setTextMode] = useState(false)
  const [draft, setDraft] = useState('')
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  const [sheet, setSheet] = useState<'lang' | 'history' | null>(null)
  const [voicesTick, setVoicesTick] = useState(0)

  const lang: Lang = prefs.lang ?? 'en'
  const t = STRINGS[lang]
  const active = convos.find((c) => c.id === activeId) ?? null
  const messages = active?.messages ?? []
  const last = messages[messages.length - 1]

  const levelRef = useRef<HTMLDivElement>(null)
  const threadEnd = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const lastVia = useRef<Message['via']>('voice')
  const listenAfterSpeak = useRef(false)
  const startListeningRef = useRef<() => void>(() => {})

  const setPrefs = (p: Partial<Prefs>) =>
    setPrefsState((prev) => {
      const next = { ...prev, ...p }
      savePrefs(next)
      return next
    })

  // Persist history — skip conversations that only contain the greeting.
  useEffect(() => {
    saveConversations(convos.filter((c) => c.messages.some((m) => m.role === 'user')))
  }, [convos])

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  useEffect(() => onVoicesChanged(() => setVoicesTick((n) => n + 1)), [])

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.classList.toggle('large-text', prefs.large)
  }, [lang, prefs.large])

  useEffect(() => {
    threadEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, busy, pending, last?.id])

  const updateConvo = useCallback((id: string, fn: (c: Conversation) => Conversation) => {
    setConvos((list) => list.map((c) => (c.id === id ? fn(c) : c)))
  }, [])

  /* ---------------- speech output ---------------- */

  const speakText = useCallback(
    (id: string, text: string, l: Lang, rate?: number) => {
      speak(text, speechCode(l), rate ?? (prefs.slow ? SLOW_RATE : NORMAL_RATE), {
        onStart: () => setSpeakingId(id),
        onEnd: () => {
          setSpeakingId((cur) => (cur === id ? null : cur))
          if (listenAfterSpeak.current) {
            listenAfterSpeak.current = false
            setTimeout(() => startListeningRef.current(), 250)
          }
        },
      })
    },
    [prefs.slow],
  )

  const speakMessage = useCallback(
    (m: Message, rate?: number, force = false) => {
      if (!prefs.autoSpeak && !force) return
      speakText(m.id, spokenText(m), m.lang, rate ?? (prefs.slow ? SLOW_RATE : NORMAL_RATE))
    },
    [prefs.autoSpeak, prefs.slow, speakText],
  )

  const stopVoice = () => {
    listenAfterSpeak.current = false
    stopSpeaking()
    setSpeakingId(null)
  }

  /* ---------------- conversation ---------------- */

  const newConversation = useCallback(
    (l: Lang, greet = true) => {
      const g = greetingMessage(l)
      const c: Conversation = { id: uid(), title: '', lang: l, createdAt: Date.now(), updatedAt: Date.now(), messages: [g] }
      setConvos((list) => [c, ...list.filter((x) => x.messages.some((m) => m.role === 'user'))])
      setActiveId(c.id)
      setPending(null)
      setHint(null)
      if (greet) speakText(g.id, g.text, l, prefs.slow ? SLOW_RATE : NORMAL_RATE)
      return c
    },
    [prefs.slow, speakText],
  )

  const checkHealth = useCallback(async () => {
    try {
      const r = await fetch('/api/health', { cache: 'no-store' })
      setOnline(r.ok)
      return r.ok
    } catch {
      setOnline(false)
      return false
    }
  }, [])

  const runAssistant = useCallback(
    async (cid: string, msgs: Message[]) => {
      setBusy(true)
      setHint(null)
      stopSpeaking()
      try {
        const r = await askAssistant(lang, msgs)
        const a: Message = {
          id: uid(),
          role: 'assistant',
          text: r.reply,
          at: Date.now(),
          lang,
          meta: {
            intent: r.intent,
            status: r.status,
            steps: r.steps ?? [],
            question: r.question ?? '',
            confirmDetails: r.confirmDetails ?? '',
            quickReplies: r.quickReplies ?? [],
            sources: r.sources ?? [],
            detectedLanguages: r.detectedLanguages ?? [],
            sensitiveMasked: r.sensitiveMasked,
          },
        }
        updateConvo(cid, (c) => ({
          ...c,
          messages: [...msgs, a],
          title: c.title || r.topic || msgs.find((m) => m.role === 'user')?.text.slice(0, 40) || '',
          intent: r.intent !== 'general' ? r.intent : c.intent ?? r.intent,
          updatedAt: Date.now(),
          lang,
        }))
        setOnline(true)
        // Keep the conversation hands-free when the assistant needs one more answer.
        if (lastVia.current === 'voice' && ['clarify', 'confirm_details', 'unclear'].includes(r.status)) listenAfterSpeak.current = true
        speakMessage(a)
      } catch {
        const failedMsgs = msgs.map((m, i) => (i === msgs.length - 1 ? { ...m, failed: true } : m))
        updateConvo(cid, (c) => ({ ...c, messages: failedMsgs, updatedAt: Date.now() }))
        const ok = await checkHealth()
        setHint({ text: ok ? t.failed : t.offline, kind: 'warn' })
      } finally {
        setBusy(false)
      }
    },
    [checkHealth, lang, speakMessage, t.failed, t.offline, updateConvo],
  )

  const submit = useCallback(
    (raw: string, via: Message['via']) => {
      const text = raw.trim()
      if (!text || busy) return
      setPending(null)
      setDraft('')
      const convo = active ?? newConversation(lang, false)
      const sensitive = looksSensitive(text)
      const user: Message = { id: uid(), role: 'user', text: sensitive ? maskSensitive(text) : text, at: Date.now(), lang, via }
      const msgs = [...convo.messages, user]
      lastVia.current = via
      updateConvo(convo.id, (c) => ({ ...c, messages: msgs, updatedAt: Date.now() }))
      if (sensitive) setHint({ text: t.neverShare, kind: 'warn' })
      void runAssistant(convo.id, msgs)
    },
    [active, busy, lang, newConversation, runAssistant, t.neverShare, updateConvo],
  )

  const retryFailed = useCallback(async () => {
    if (!active || busy) return
    const ok = await checkHealth()
    if (!ok) {
      setHint({ text: t.offline, kind: 'warn' })
      return
    }
    const msgs = active.messages.map((m) => (m.failed ? { ...m, failed: false } : m))
    updateConvo(active.id, (c) => ({ ...c, messages: msgs }))
    void runAssistant(active.id, msgs)
  }, [active, busy, checkHealth, runAssistant, t.offline, updateConvo])

  const addLocalExchange = (userText: string | null, reply: string, listenAfter = false) => {
    if (!active) return
    const extra: Message[] = []
    if (userText) extra.push({ id: uid(), role: 'user', text: userText, at: Date.now(), lang, via: 'tap' })
    const a = localReply(lang, reply)
    extra.push(a)
    updateConvo(active.id, (c) => ({ ...c, messages: [...c.messages, ...extra], updatedAt: Date.now() }))
    listenAfterSpeak.current = listenAfter
    speakText(a.id, a.text, lang, prefs.slow ? SLOW_RATE : NORMAL_RATE)
  }

  const changeLanguage = (l: Lang) => {
    setSheet(null)
    stopVoice()
    setPrefs({ lang: l })
    if (phase === 'welcome') return startApp(l)
    if (!active) return newConversation(l)
    const g = greetingMessage(l)
    updateConvo(active.id, (c) => ({ ...c, lang: l, messages: [...c.messages, g] }))
    speakText(g.id, g.text, l, prefs.slow ? SLOW_RATE : NORMAL_RATE)
  }

  const startApp = (l: Lang) => {
    setPrefs({ lang: l })
    setPhase('app')
    newConversation(l)
  }

  /* ---------------- speech input ---------------- */

  const onVoiceResult = useCallback(
    (r: VoiceResult) => {
      setHint(null)
      // Read back anything important (numbers) or low-confidence before acting on it.
      const important = /\d{4,}/.test(r.text.replace(/[\s-]/g, ''))
      if (r.clarity === 'unclear' || important || looksSensitive(r.text)) {
        setPending(r)
        speakText('hint', `${STRINGS[lang].didYouSay} ${r.text}`, lang)
      } else submit(r.text, 'voice')
    },
    [lang, speakText, submit],
  )

  const onVoiceError = useCallback(
    (e: VoiceError) => {
      const s = STRINGS[lang]
      if (e === 'no-speech') {
        setHint({ text: s.noSpeech, kind: 'info' })
        speakText('hint', s.noSpeech, lang)
      } else if (e === 'denied') {
        setHint({ text: s.micDenied, kind: 'warn' })
        setTextMode(true)
      } else if (e === 'unsupported') {
        setHint({ text: s.micUnsupported, kind: 'warn' })
        setTextMode(true)
      } else {
        void checkHealth().then((ok) => setHint({ text: ok ? s.unclear : s.offline, kind: 'warn' }))
      }
    },
    [checkHealth, lang, speakText],
  )

  const voice = useVoiceInput({
    speechLang: speechCode(lang),
    appLang: lang,
    levelEl: levelRef,
    onResult: onVoiceResult,
    onError: onVoiceError,
  })

  startListeningRef.current = () => {
    if (!voice.supported || busy || textMode) return
    setHint(null)
    setPending(null)
    void voice.start()
  }

  const onMic = () => {
    if (voice.state === 'listening') return voice.stop()
    if (voice.state === 'processing' || busy) return
    if (!voice.supported) {
      setHint({ text: t.micUnsupported, kind: 'warn' })
      setTextMode(true)
      return
    }
    stopVoice()
    setHint(null)
    setPending(null)
    void voice.start()
  }

  useEffect(() => {
    if (textMode) setTimeout(() => inputRef.current?.focus(), 50)
  }, [textMode])

  /* ---------------- derived ---------------- */

  void voicesTick
  const noVoice = ttsSupported() && typeof window !== 'undefined' && window.speechSynthesis.getVoices().length > 0 && !hasVoiceFor(speechCode(lang))
  const hasUser = messages.some((m) => m.role === 'user')
  const showFollowups = !busy && last?.role === 'assistant' && !pending && voice.state === 'idle'
  const hasFailed = messages.some((m) => m.failed)

  const status =
    voice.state === 'listening'
      ? t.listening
      : voice.state === 'processing' || busy
        ? t.thinking
        : speakingId
          ? t.speaking
          : t.tapToSpeak

  /* ---------------- render ---------------- */

  if (phase === 'welcome') {
    return <Welcome current={prefs.lang} onPick={startApp} />
  }

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => newConversation(lang)} aria-label={t.newChat}>
          <Kolam />
          <span className="brand-name">
            Namma <em>Voice</em>
          </span>
        </button>
        <div className="topbar-actions">
          <span className={`net ${online ? 'ok' : 'down'}`} role="status" aria-live="polite">
            <span className="net-dot" />
            <span className="net-label">{online ? t.online : t.offline}</span>
          </span>
          <button className="chip-btn lang-btn" onClick={() => setSheet('lang')} aria-label={t.changeLanguage}>
            <GlobeIcon size={20} />
            <span>{LANGUAGES.find((l) => l.code === lang)!.native}</span>
          </button>
          <button
            className={`icon-btn ${prefs.large ? 'on' : ''}`}
            onClick={() => setPrefs({ large: !prefs.large })}
            aria-label={t.textSize}
            aria-pressed={prefs.large}
          >
            <span className="aa">
              A<small>A</small>
            </span>
          </button>
          <button className="icon-btn" onClick={() => setSheet('history')} aria-label={t.history}>
            <HistoryIcon />
          </button>
        </div>
      </header>

      {!online && (
        <div className="offline-bar" role="alert">
          <WifiOffIcon size={22} />
          <span>{t.offline}</span>
          <button onClick={() => (hasFailed ? retryFailed() : checkHealth())}>
            <RepeatIcon size={18} /> {t.retry}
          </button>
        </div>
      )}

      <main className="thread" aria-live="polite">
        <div className="ribbon">
          <ShieldIcon size={18} />
          <span>
            {t.guidanceOnly}. <strong>{t.neverShare}.</strong>
          </span>
        </div>

        {messages.map((m, i) =>
          m.role === 'user' ? (
            <UserBubble key={m.id} m={m} t={t} onRetry={retryFailed} busy={busy} />
          ) : (
            <AssistantBubble
              key={m.id}
              m={m}
              t={t}
              first={i === 0}
              speaking={speakingId === m.id}
              onPlay={() => (speakingId === m.id ? stopVoice() : speakMessage(m, undefined, true))}
            />
          ),
        )}

        {busy && (
          <div className="bubble assistant thinking" aria-label={t.thinking}>
            <span className="dots">
              <i />
              <i />
              <i />
            </span>
            <span className="thinking-label">{t.thinking}</span>
          </div>
        )}

        {showFollowups && !hasUser && (
          <section className="suggestions" aria-label={t.trySaying}>
            <h2>{t.trySaying}</h2>
            <div className="suggestion-grid">
              {t.suggestions.map((s, i) => {
                const Icon = INTENT_ICON[s.intent]
                return (
                  <button key={s.text} className={`suggestion cat-${s.intent}`} style={{ animationDelay: `${i * 70}ms` }} onClick={() => submit(s.text, 'tap')}>
                    <span className="suggestion-icon">
                      <Icon size={22} />
                    </span>
                    <span className="suggestion-text">“{s.text}”</span>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {showFollowups && hasUser && last.meta && (
          <div className="followups">
            {last.meta.quickReplies.length > 0 && (
              <div className="quick-replies">
                {last.meta.quickReplies.map((q) => (
                  <button key={q} className="quick" onClick={() => submit(q, 'tap')}>
                    {q}
                  </button>
                ))}
              </div>
            )}
            <div className="actions" role="group">
              <button className="action good" onClick={() => addLocalExchange(t.understood, t.understoodReply)}>
                <CheckIcon size={20} /> {t.understood}
              </button>
              <button className="action" onClick={() => speakMessage(last, undefined, true)}>
                <RepeatIcon size={20} /> {t.repeat}
              </button>
              <button
                className={`action ${prefs.slow ? 'on' : ''}`}
                onClick={() => {
                  const slow = !prefs.slow
                  setPrefs({ slow })
                  speakMessage(last, slow ? SLOW_RATE : NORMAL_RATE, true)
                }}
              >
                <SlowIcon size={20} /> {prefs.slow ? t.normalSpeed : t.slower}
              </button>
              <button className="action" onClick={() => setSheet('lang')}>
                <GlobeIcon size={20} /> {t.changeLanguage}
              </button>
              <button className="action" onClick={() => addLocalExchange(t.somethingElse, t.somethingElseReply, voice.supported && !textMode)}>
                <PlusIcon size={20} /> {t.somethingElse}
              </button>
            </div>
          </div>
        )}
        <div ref={threadEnd} className="thread-end" />
      </main>

      <footer className={`dock state-${voice.state} ${busy ? 'busy' : ''}`}>
        {noVoice && <p className="dock-note">{t.noVoice}</p>}

        {hint && !pending && (
          <div className={`hint ${hint.kind}`} role="alert">
            <span>{hint.text}</span>
            <button className="hint-close" onClick={() => setHint(null)} aria-label="Close">
              <XIcon size={18} />
            </button>
          </div>
        )}

        {pending && (
          <div className="confirm" role="dialog" aria-label={t.didYouSay}>
            <p className="confirm-q">{t.didYouSay}</p>
            <p className="confirm-text">“{pending.text}”</p>
            <div className="confirm-actions">
              <button className="btn primary" onClick={() => submit(pending.text, 'voice')}>
                <CheckIcon size={20} /> {t.yesSend}
              </button>
              <button className="btn" onClick={() => startListeningRef.current()}>
                <MicIcon size={20} /> {t.tryAgain}
              </button>
              <button
                className="btn ghost"
                onClick={() => {
                  setDraft(pending.text)
                  setPending(null)
                  setTextMode(true)
                }}
              >
                <EditIcon size={20} /> {t.edit}
              </button>
            </div>
          </div>
        )}

        {voice.state === 'listening' && voice.interim && <p className="interim">{voice.interim}</p>}

        {textMode ? (
          <form
            className="text-row"
            onSubmit={(e) => {
              e.preventDefault()
              submit(draft, 'text')
            }}
          >
            {voice.supported && (
              <button type="button" className="round-btn" onClick={() => setTextMode(false)} aria-label={t.useMic}>
                <MicIcon />
              </button>
            )}
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t.typePlaceholder}
              aria-label={t.typePlaceholder}
              enterKeyHint="send"
              lang={lang}
            />
            <button type="submit" className="round-btn send" disabled={!draft.trim() || busy} aria-label={t.send}>
              <SendIcon />
            </button>
          </form>
        ) : (
          <div className="mic-row">
            <button className="side-btn" onClick={() => setTextMode(true)} aria-label={t.typeInstead}>
              <KeyboardIcon size={26} />
              <span>{t.typeInstead}</span>
            </button>

            <div className="mic-wrap" ref={levelRef}>
              <span className="ring r1" />
              <span className="ring r2" />
              <span className="ring r3" />
              <button
                className="mic"
                onClick={onMic}
                aria-label={voice.state === 'listening' ? t.stop : t.tapToSpeak}
                aria-pressed={voice.state === 'listening'}
                disabled={busy || voice.state === 'processing'}
              >
                {voice.state === 'listening' ? <StopIcon size={40} /> : <MicIcon size={44} />}
              </button>
            </div>

            {speakingId ? (
              <button className="side-btn" onClick={stopVoice} aria-label={t.stop}>
                <StopIcon size={24} />
                <span>{t.stop}</span>
              </button>
            ) : (
              <button
                className={`side-btn ${prefs.slow ? 'on' : ''}`}
                onClick={() => setPrefs({ slow: !prefs.slow })}
                aria-pressed={prefs.slow}
                aria-label={t.slower}
              >
                <SlowIcon size={26} />
                <span>{prefs.slow ? t.slower : t.normalSpeed}</span>
              </button>
            )}
          </div>
        )}
        {!textMode && (
          <p className="status" aria-live="assertive">
            {status}
          </p>
        )}
      </footer>

      {sheet === 'lang' && (
        <Sheet title={t.chooseLanguage} onClose={() => setSheet(null)}>
          <LanguageGrid current={lang} onPick={changeLanguage} />
        </Sheet>
      )}

      {sheet === 'history' && (
        <Sheet title={t.history} onClose={() => setSheet(null)} side>
          <History
            convos={convos.filter((c) => c.messages.some((m) => m.role === 'user'))}
            activeId={activeId}
            t={t}
            onOpen={(id) => {
              stopVoice()
              setActiveId(id)
              setSheet(null)
            }}
            onNew={() => {
              setSheet(null)
              newConversation(lang)
            }}
            onDelete={(id) => {
              setConvos((list) => list.filter((c) => c.id !== id))
              if (id === activeId) newConversation(lang, false)
            }}
            onClear={() => {
              setConvos([])
              newConversation(lang, false)
            }}
          />
        </Sheet>
      )}
    </div>
  )
}

/* =====================================================================
 * Pieces
 * ===================================================================== */

type T = (typeof STRINGS)['en']

function UserBubble({ m, t, onRetry, busy }: { m: Message; t: T; onRetry: () => void; busy: boolean }) {
  return (
    <div className={`bubble user ${m.failed ? 'failed' : ''}`} lang={m.lang}>
      <p>
        {m.via === 'voice' && <MicIcon size={16} className="via" />}
        {m.text}
      </p>
      {m.failed && (
        <button className="retry" onClick={onRetry} disabled={busy}>
          <WifiOffIcon size={16} /> {t.failed} · <strong>{t.retry}</strong>
        </button>
      )}
    </div>
  )
}

function AssistantBubble({ m, t, speaking, onPlay, first }: { m: Message; t: T; speaking: boolean; onPlay: () => void; first: boolean }) {
  const meta = m.meta
  const local = meta?.status === 'local'
  const Icon = meta ? INTENT_ICON[meta.intent as Intent] : null
  const mix = meta ? mixLabel(meta.detectedLanguages) : null
  const lt = STRINGS[m.lang]
  return (
    <article className={`bubble assistant status-${meta?.status ?? 'answer'} ${first ? 'first' : ''} ${speaking ? 'is-speaking' : ''}`} lang={m.lang}>
      {!local && meta && (
        <div className="meta-row">
          {Icon && (
            <span className={`badge cat-${meta.intent}`}>
              <Icon size={16} /> {lt.intents[meta.intent as Intent]}
            </span>
          )}
          {mix && <span className="badge mix">{mix}</span>}
        </div>
      )}

      {meta?.status === 'safety_warning' && (
        <p className="safety">
          <ShieldIcon size={20} /> {lt.neverShare}
        </p>
      )}

      <p className="reply">{m.text}</p>
      {first && m.lang === 'ta' && STRINGS.ta.greetingRoman && local && <p className="roman">{STRINGS.ta.greetingRoman}</p>}

      {meta?.confirmDetails && (
        <div className="check">
          <span className="check-label">{lt.checkThis}</span>
          <strong>{meta.confirmDetails}</strong>
        </div>
      )}

      {meta && meta.steps.length > 0 && (
        <div className="steps">
          <span className="steps-label">{lt.nextSteps}</span>
          <ol>
            {meta.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
      )}

      {meta?.question && <p className="question">{meta.question}</p>}

      {meta && meta.sources.length > 0 && (
        <div className="sources">
          <span className="sources-label">{lt.sources}</span>
          <div className="source-list">
            {meta.sources.map((s) => (
              <span key={s.name} className="source">
                <span className="source-name">{s.name}</span>
                {s.phone && (
                  <a href={`tel:${s.phone.replace(/[^\d]/g, '')}`} className="source-link">
                    <PhoneIcon size={15} /> {s.phone}
                  </a>
                )}
                {s.url && (
                  <a href={s.url} target="_blank" rel="noreferrer" className="source-link">
                    <LinkIcon size={15} /> {s.url.replace(/^https?:\/\/(www\.)?/, '')}
                  </a>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {ttsSupported() && (
        <button className={`play ${speaking ? 'on' : ''}`} onClick={onPlay} aria-label={speaking ? t.stop : t.play}>
          {speaking ? <StopIcon size={18} /> : <PlayIcon size={18} />}
          <span>{speaking ? t.stop : t.play}</span>
          {speaking && (
            <span className="eq" aria-hidden>
              <i />
              <i />
              <i />
              <i />
            </span>
          )}
        </button>
      )}
    </article>
  )
}

function LanguageGrid({ current, onPick }: { current: Lang | null; onPick: (l: Lang) => void }) {
  return (
    <div className="lang-grid">
      {LANGUAGES.map((l, i) => (
        <button
          key={l.code}
          className={`lang-tile ${current === l.code ? 'current' : ''}`}
          onClick={() => onPick(l.code)}
          lang={l.code}
          style={{ animationDelay: `${120 + i * 60}ms` }}
        >
          <span className="lang-glyph" aria-hidden>
            {l.sample}
          </span>
          <span className="lang-native">{l.native}</span>
          <span className="lang-en">{l.english}</span>
        </button>
      ))}
    </div>
  )
}

function Welcome({ current, onPick }: { current: Lang | null; onPick: (l: Lang) => void }) {
  const welcomes = ['வணக்கம்', 'नमस्ते', 'నమస్కారం', 'ನಮಸ್ಕಾರ', 'നമസ്കാരം', 'Hello']
  const [i, setI] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % welcomes.length), 1800)
    return () => clearInterval(id)
  }, [welcomes.length])
  return (
    <div className="welcome">
      <div className="welcome-art" aria-hidden>
        <Kolam big />
      </div>
      <div className="welcome-head">
        <p className="welcome-hello" key={i}>
          {welcomes[i]}
        </p>
        <h1>
          Namma <em>Voice</em>
        </h1>
        <p className="welcome-sub">Speak in your language. Get help with bills, banks, schemes &amp; appointments.</p>
      </div>
      {current && (
        <button className="start-btn" onClick={() => onPick(current)}>
          <MicIcon size={28} />
          <span>{STRINGS[current].start}</span>
          <small>{LANGUAGES.find((l) => l.code === current)!.native}</small>
        </button>
      )}
      <p className="welcome-pick">{current ? 'Or choose another language' : 'Choose your language · மொழி · भाषा · భాష · ಭಾಷೆ · ഭാഷ'}</p>
      <LanguageGrid current={current} onPick={onPick} />
      <p className="welcome-foot">
        <ShieldIcon size={16} /> Guidance only. We never ask for OTP, PIN or passwords.
      </p>
    </div>
  )
}

function Sheet({ title, onClose, children, side }: { title: string; onClose: () => void; children: React.ReactNode; side?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className={`sheet ${side ? 'side' : ''}`} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <XIcon />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}

function History({
  convos,
  activeId,
  t,
  onOpen,
  onNew,
  onDelete,
  onClear,
}: {
  convos: Conversation[]
  activeId: string | null
  t: T
  onOpen: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  onClear: () => void
}) {
  const fmt = (ts: number) => new Date(ts).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  return (
    <div className="history">
      <button className="btn primary wide" onClick={onNew}>
        <PlusIcon size={20} /> {t.newChat}
      </button>
      {convos.length === 0 ? (
        <div className="empty">
          <Kolam />
          <p>{t.noHistory}</p>
        </div>
      ) : (
        <ul>
          {convos.map((c) => {
            const Icon = INTENT_ICON[(c.intent ?? 'general') as Intent]
            const userCount = c.messages.filter((m) => m.role === 'user').length
            return (
              <li key={c.id} className={c.id === activeId ? 'current' : ''}>
                <button className="history-item" onClick={() => onOpen(c.id)}>
                  <span className={`history-icon cat-${c.intent ?? 'general'}`}>
                    <Icon size={20} />
                  </span>
                  <span className="history-text">
                    <span className="history-title">{c.title || '…'}</span>
                    <span className="history-sub">
                      {LANGUAGES.find((l) => l.code === c.lang)?.native} · {fmt(c.updatedAt)} · {userCount} <MicIcon size={12} />
                    </span>
                  </span>
                </button>
                <button className="icon-btn subtle" onClick={() => onDelete(c.id)} aria-label="Delete">
                  <TrashIcon size={20} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {convos.length > 0 && (
        <button className="btn ghost danger wide" onClick={onClear}>
          <TrashIcon size={18} /> {t.clearAll}
        </button>
      )}
      <p className="privacy">
        <ShieldIcon size={16} /> {t.privacy}
      </p>
    </div>
  )
}

/** Kolam-inspired dot-and-loop mark. */
function Kolam({ big }: { big?: boolean }) {
  const dots = []
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) dots.push(<circle key={`${x}${y}`} cx={12 + x * 12} cy={12 + y * 12} r={1.9} />)
  return (
    <svg className={`kolam ${big ? 'big' : ''}`} viewBox="0 0 48 48" aria-hidden>
      <g className="kolam-loops" fill="none" strokeWidth="2.2" strokeLinecap="round">
        <path d="M24 4c6 0 8 8 14 8s6 6 6 12-8 8-8 14-6 6-12 6-8-8-14-8-6-6-6-12 8-8 8-14S18 4 24 4Z" />
        <path d="M24 14c3 0 4 4 7 4s3 3 3 6-4 4-4 7-3 3-6 3-4-4-7-4-3-3-3-6 4-4 4-7 3-3 6-3Z" />
      </g>
      <g className="kolam-dots">{dots}</g>
    </svg>
  )
}
