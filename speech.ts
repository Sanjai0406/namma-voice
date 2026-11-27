import { useCallback, useEffect, useRef, useState } from 'react'
import type { Lang } from './i18n'

/* =====================================================================
 * Text to speech (browser speechSynthesis)
 * ===================================================================== */

const synth: SpeechSynthesis | undefined = typeof window !== 'undefined' ? window.speechSynthesis : undefined

function voicesFor(speechLang: string): SpeechSynthesisVoice[] {
  if (!synth) return []
  const base = speechLang.split('-')[0].toLowerCase()
  const all = synth.getVoices()
  const exact = all.filter((v) => v.lang.replace('_', '-').toLowerCase() === speechLang.toLowerCase())
  const loose = all.filter((v) => v.lang.toLowerCase().startsWith(base))
  return exact.length ? exact : loose
}

export function ttsSupported() {
  return !!synth
}

export function hasVoiceFor(speechLang: string) {
  return voicesFor(speechLang).length > 0
}

/** Voices load asynchronously in Chrome; call to get notified. */
export function onVoicesChanged(cb: () => void) {
  if (!synth) return () => {}
  synth.addEventListener?.('voiceschanged', cb)
  return () => synth.removeEventListener?.('voiceschanged', cb)
}

/** Split long text into sentence-sized chunks: Chrome cuts off long utterances. */
function chunk(text: string): string[] {
  const parts = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?।॥])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const out: string[] = []
  for (const p of parts) {
    if (p.length <= 200) out.push(p)
    else out.push(...(p.match(/.{1,200}(\s|$)/g) ?? [p]).map((s) => s.trim()))
  }
  return out
}

let speakToken = 0

export function speak(
  text: string,
  speechLang: string,
  rate: number,
  handlers: { onStart?: () => void; onEnd?: () => void } = {},
) {
  if (!synth || !text.trim()) {
    handlers.onEnd?.()
    return
  }
  synth.cancel()
  const token = ++speakToken
  const voice = voicesFor(speechLang)[0]
  const pieces = chunk(text)
  let i = 0
  const next = () => {
    if (token !== speakToken) return
    if (i >= pieces.length) {
      handlers.onEnd?.()
      return
    }
    const u = new SpeechSynthesisUtterance(pieces[i++])
    u.lang = speechLang
    if (voice) u.voice = voice
    u.rate = rate
    u.pitch = 1
    u.onend = next
    u.onerror = next
    synth.speak(u)
  }
  handlers.onStart?.()
  next()
}

export function stopSpeaking() {
  speakToken++
  synth?.cancel()
}

/* =====================================================================
 * Speech to text
 *  - "browser": Web Speech API (Chrome, Edge, Safari)
 *  - "cloud":   noise-suppressed mic capture -> WAV -> /api/transcribe
 * ===================================================================== */

export type ListenState = 'idle' | 'listening' | 'processing'
export type VoiceError = 'no-speech' | 'denied' | 'unsupported' | 'network'
export type VoiceResult = {
  text: string
  confidence: number | null
  clarity: 'clear' | 'unclear'
  source: 'browser' | 'cloud'
}

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
  channelCount: 1,
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const SR: any = typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null
const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)
const canCapture = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const write = (o: number, s: string) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)))
  write(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  write(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Blob([view], { type: 'audio/wav' })
}

function downsample(input: Float32Array, from: number, to: number) {
  if (to >= from) return input
  const ratio = from / to
  const out = new Float32Array(Math.floor(input.length / ratio))
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio)
    const end = Math.min(input.length, Math.floor((i + 1) * ratio))
    let sum = 0
    for (let j = start; j < end; j++) sum += input[j]
    out[i] = sum / Math.max(1, end - start)
  }
  return out
}

async function blobToBase64(blob: Blob) {
  const buf = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return btoa(bin)
}

export function useVoiceInput(opts: {
  speechLang: string
  appLang: Lang
  levelEl: React.RefObject<HTMLElement | null>
  onResult: (r: VoiceResult) => void
  onError: (e: VoiceError) => void
}) {
  const [state, setState] = useState<ListenState>('idle')
  const [interim, setInterim] = useState('')
  const [engine, setEngine] = useState<'browser' | 'cloud' | 'none'>(SR ? 'browser' : canCapture ? 'cloud' : 'none')

  const optsRef = useRef(opts)
  optsRef.current = opts
  const cleanupRef = useRef<() => void>(() => {})
  const stopRef = useRef<() => void>(() => {})

  const setLevel = (v: number) => optsRef.current.levelEl.current?.style.setProperty('--level', v.toFixed(3))

  /** Opens a noise-suppressed mic stream and drives the level meter. Returns analyser utilities. */
  const openMeter = useCallback(async (onFrame?: (rms: number) => void) => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS })
    const Ctx = window.AudioContext || (window as any).webkitAudioContext
    const ctx: AudioContext = new Ctx()
    const src = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    src.connect(analyser)
    const data = new Float32Array(analyser.fftSize)
    let raf = 0
    const tick = () => {
      analyser.getFloatTimeDomainData(data)
      let sum = 0
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
      const rms = Math.sqrt(sum / data.length)
      setLevel(Math.min(1, rms * 9))
      onFrame?.(rms)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    const close = () => {
      cancelAnimationFrame(raf)
      stream.getTracks().forEach((t) => t.stop())
      ctx.close().catch(() => {})
      setLevel(0)
    }
    return { stream, ctx, src, close }
  }, [])

  const startBrowser = useCallback(async () => {
    const o = optsRef.current
    const rec = new SR()
    rec.lang = o.speechLang
    rec.interimResults = true
    rec.continuous = false
    rec.maxAlternatives = 1

    let finalText = ''
    let confidence: number | null = null
    let errored = false
    let meter: { close: () => void } | null = null

    // A parallel meter stream conflicts with recognition on Android; skip it there.
    if (!isAndroid && canCapture) {
      try {
        meter = await openMeter()
      } catch {
        /* the recogniser will report permission problems itself */
      }
    }

    rec.onresult = (e: any) => {
      let fin = ''
      let int = ''
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) {
          fin += r[0].transcript
          if (typeof r[0].confidence === 'number' && r[0].confidence > 0) confidence = r[0].confidence
        } else int += r[0].transcript
      }
      finalText = fin
      setInterim((fin + ' ' + int).trim())
      if (isAndroid) setLevel(0.55 + Math.random() * 0.35)
    }
    rec.onerror = (e: any) => {
      errored = true
      const err = e.error as string
      if (err === 'no-speech') optsRef.current.onError('no-speech')
      else if (err === 'not-allowed' || err === 'service-not-allowed' || err === 'audio-capture') optsRef.current.onError('denied')
      else if (err === 'network') {
        // The browser's speech service is unreachable — switch to cloud transcription for the next attempt.
        if (canCapture) setEngine('cloud')
        optsRef.current.onError('network')
      } else if (err !== 'aborted') optsRef.current.onError('no-speech')
    }
    rec.onend = () => {
      meter?.close()
      setState('idle')
      const text = finalText.trim()
      setInterim('')
      if (text) {
        optsRef.current.onResult({
          text,
          confidence,
          clarity: confidence !== null && confidence < 0.55 ? 'unclear' : 'clear',
          source: 'browser',
        })
      } else if (!errored) optsRef.current.onError('no-speech')
    }

    cleanupRef.current = () => {
      try {
        rec.abort()
      } catch {
        /* noop */
      }
      meter?.close()
    }
    stopRef.current = () => {
      try {
        rec.stop()
      } catch {
        /* noop */
      }
    }
    setState('listening')
    rec.start()
  }, [openMeter])

  const startCloud = useCallback(async () => {
    const chunks: Float32Array[] = []
    let heardSpeech = false
    let lastVoice = performance.now()
    const startedAt = performance.now()
    let finished = false
    let noiseFloor = 0.01

    const meter = await openMeter((rms) => {
      const now = performance.now()
      // Calibrate to the room's background noise in the first ~400 ms.
      if (now - startedAt < 400) noiseFloor = Math.max(noiseFloor, rms * 1.6)
      if (rms > Math.max(0.02, noiseFloor)) {
        heardSpeech = true
        lastVoice = now
      }
      if (finished) return
      if (heardSpeech && now - lastVoice > 1600) finish()
      else if (!heardSpeech && now - startedAt > 6000) finish()
      else if (now - startedAt > 20000) finish()
    })

    const proc = meter.ctx.createScriptProcessor(4096, 1, 1)
    proc.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)))
    meter.src.connect(proc)
    proc.connect(meter.ctx.destination)
    const sampleRate = meter.ctx.sampleRate

    async function finish(cancelled = false) {
      if (finished) return
      finished = true
      proc.disconnect()
      meter.close()
      if (cancelled) return setState('idle')
      if (!heardSpeech) {
        setState('idle')
        return optsRef.current.onError('no-speech')
      }
      setState('processing')
      const total = chunks.reduce((n, c) => n + c.length, 0)
      const all = new Float32Array(total)
      let off = 0
      for (const c of chunks) {
        all.set(c, off)
        off += c.length
      }
      const wav = encodeWav(downsample(all, sampleRate, 16000), 16000)
      try {
        const res = await fetch('/api/transcribe', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ audio: await blobToBase64(wav), mimeType: 'audio/wav', language: optsRef.current.appLang }),
        })
        if (!res.ok) throw new Error(String(res.status))
        const data = await res.json()
        setState('idle')
        if (data.clarity === 'no_speech' || !data.transcript) return optsRef.current.onError('no-speech')
        optsRef.current.onResult({
          text: data.transcript,
          confidence: null,
          clarity: data.clarity === 'unclear' ? 'unclear' : 'clear',
          source: 'cloud',
        })
      } catch {
        setState('idle')
        optsRef.current.onError('network')
      }
    }

    cleanupRef.current = () => finish(true)
    stopRef.current = () => finish()
    setState('listening')
  }, [openMeter])

  const start = useCallback(async () => {
    if (state !== 'idle') return
    stopSpeaking()
    setInterim('')
    try {
      if (engine === 'browser') await startBrowser()
      else if (engine === 'cloud') await startCloud()
      else optsRef.current.onError('unsupported')
    } catch (err) {
      setState('idle')
      const name = (err as DOMException)?.name
      optsRef.current.onError(name === 'NotAllowedError' || name === 'NotFoundError' || name === 'SecurityError' ? 'denied' : 'unsupported')
    }
  }, [engine, state, startBrowser, startCloud])

  const stop = useCallback(() => stopRef.current(), [])
  const cancel = useCallback(() => {
    cleanupRef.current()
    setState('idle')
    setInterim('')
  }, [])

  useEffect(() => () => cleanupRef.current(), [])

  return { state, interim, start, stop, cancel, engine, supported: engine !== 'none' }
}
