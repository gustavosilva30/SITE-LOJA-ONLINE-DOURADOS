import { useCallback, useEffect, useRef, useState } from 'react'

export type VoiceRecorderState = 'idle' | 'recording' | 'error'

export interface UseVoiceRecorderReturn {
  state: VoiceRecorderState
  transcript: string
  interimTranscript: string
  errorMsg: string | null
  isSupported: boolean
  start: () => void
  stop: () => void
  reset: () => void
  audioBlob: Blob | null
}

// Tipos da Web Speech API que não estão no lib padrão do TypeScript
interface SpeechRecognitionEvent extends Event {
  resultIndex: number
  results: SpeechRecognitionResultList
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string
}
interface SpeechRecognition extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition
    webkitSpeechRecognition: new () => SpeechRecognition
  }
}

function getSpeechRecognition(): (new () => SpeechRecognition) | null {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null
}

export function useVoiceRecorder(): UseVoiceRecorderReturn {
  const [state, setState] = useState<VoiceRecorderState>('idle')
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const finalTranscriptRef = useRef('')

  const isSupported = getSpeechRecognition() !== null

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
    mediaRecorderRef.current?.stop()
  }, [])

  const start = useCallback(async () => {
    const SpeechRec = getSpeechRecognition()
    if (!SpeechRec) {
      setErrorMsg('Seu navegador não suporta reconhecimento de voz. Use Chrome ou Edge.')
      setState('error')
      return
    }

    setTranscript('')
    setInterimTranscript('')
    setErrorMsg(null)
    setAudioBlob(null)
    finalTranscriptRef.current = ''
    chunksRef.current = []

    // Iniciar gravação de áudio para salvar o arquivo
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      mediaRecorderRef.current = mr
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        if (chunksRef.current.length > 0) {
          setAudioBlob(new Blob(chunksRef.current, { type: 'audio/webm' }))
        }
      }
      mr.start()
    } catch {
      // Gravação de áudio é opcional — continua mesmo sem permissão de microfone para arquivo
    }

    const rec = new SpeechRec()
    rec.lang = 'pt-BR'
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 1
    recognitionRef.current = rec

    rec.onresult = (e: SpeechRecognitionEvent) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) {
          finalTranscriptRef.current += t + ' '
        } else {
          interim += t
        }
      }
      setTranscript(finalTranscriptRef.current.trim())
      setInterimTranscript(interim)
    }

    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error === 'not-allowed') {
        setErrorMsg('Permissão de microfone negada. Autorize o acesso e tente novamente.')
      } else if (e.error === 'no-speech') {
        setErrorMsg('Nenhuma fala detectada. Tente novamente.')
      } else {
        setErrorMsg(`Erro: ${e.error}`)
      }
      setState('error')
      mediaRecorderRef.current?.stop()
    }

    rec.onend = () => {
      setTranscript(finalTranscriptRef.current.trim())
      setInterimTranscript('')
      setState('idle')
      mediaRecorderRef.current?.stop()
    }

    rec.start()
    setState('recording')
  }, [])

  const reset = useCallback(() => {
    recognitionRef.current?.stop()
    mediaRecorderRef.current?.stop()
    setTranscript('')
    setInterimTranscript('')
    setErrorMsg(null)
    setAudioBlob(null)
    finalTranscriptRef.current = ''
    setState('idle')
  }, [])

  // Limpeza ao desmontar
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop()
      mediaRecorderRef.current?.stop()
    }
  }, [])

  return { state, transcript, interimTranscript, errorMsg, isSupported, start, stop, reset, audioBlob }
}
