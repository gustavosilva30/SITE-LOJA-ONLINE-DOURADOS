import { useEffect, useRef, useState, useCallback } from "react"
import { X, Video, StopCircle, RotateCw } from "lucide-react"
import { cn } from "@/lib/utils"

interface Props {
  isOpen: boolean
  maxVideos?: number
  onSave: (files: File[]) => void
  onClose: () => void
}

interface CapturedVideo {
  file: File
  previewUrl: string
}

export function SucataVideoCameraModal({
  isOpen,
  maxVideos = 3,
  onSave,
  onClose,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])

  const [videos, setVideos] = useState<CapturedVideo[]>([])
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const timerRef = useRef<number | null>(null)
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment")
  
  const isMaxReached = videos.length >= maxVideos

  const startCamera = useCallback(async (facing: "environment" | "user") => {
    setCameraError(null)
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing },
        audio: true
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
    } catch (err: any) {
      console.error("Camera error:", err)
      setCameraError(
        err.name === "NotAllowedError"
          ? "Permissão da câmera/microfone negada. Autorize no navegador."
          : err.name === "NotFoundError"
          ? "Câmera ou microfone não encontrados."
          : "Erro ao acessar câmera: " + err.message
      )
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      startCamera(facingMode)
    } else {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
      if (timerRef.current) {
        window.clearInterval(timerRef.current)
      }
      setVideos([])
    }
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
      if (timerRef.current) {
        window.clearInterval(timerRef.current)
      }
    }
  }, [isOpen, startCamera, facingMode])

  const toggleCamera = () => {
    if (isRecording) return
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"))
  }

  const startRecording = () => {
    if (!streamRef.current || isMaxReached) return
    
    chunksRef.current = []
    
    // Tenta usar um formato comprimido se suportado
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') 
                     ? 'video/webm;codecs=vp9' 
                     : 'video/webm'

    const recorder = new MediaRecorder(streamRef.current, {
      mimeType,
      videoBitsPerSecond: 250000 // 250kbps para otimização extrema
    })

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data)
      }
    }

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType })
      const url = URL.createObjectURL(blob)
      const ts = new Date().toISOString().replace(/[:.]/g, "-")
      const file = new File([blob], `video-${ts}.webm`, { type: mimeType })
      
      setVideos(prev => [...prev, { file, previewUrl: url }])
      setIsRecording(false)
      setRecordingTime(0)
      if (timerRef.current) window.clearInterval(timerRef.current)
    }

    recorder.start()
    mediaRecorderRef.current = recorder
    setIsRecording(true)
    setRecordingTime(0)

    timerRef.current = window.setInterval(() => {
      setRecordingTime(prev => {
        // Limite de 60 segundos por vídeo
        if (prev >= 59) {
          stopRecording()
          return 60
        }
        return prev + 1
      })
    }, 1000)
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop()
    }
  }

  const removeVideo = (index: number) => {
    if (isRecording) return
    setVideos((prev) => {
      const copy = [...prev]
      URL.revokeObjectURL(copy[index].previewUrl)
      copy.splice(index, 1)
      return copy
    })
  }

  const handleSave = () => {
    if (isRecording) return
    onSave(videos.map(v => v.file))
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[300] flex flex-col bg-black text-white sm:p-4 animate-in fade-in zoom-in-95 duration-200">
      <div className="flex items-center justify-between p-4 bg-black/50 z-10 sm:rounded-t-lg">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Video className="w-5 h-5 text-blue-400" />
          Gravar Vídeo ({videos.length}/{maxVideos})
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleCamera}
            disabled={isRecording}
            className="p-2 bg-slate-800 rounded-full hover:bg-slate-700 disabled:opacity-50"
            title="Alternar câmera"
          >
            <RotateCw className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={isRecording}
            className="p-2 bg-slate-800 rounded-full hover:bg-slate-700 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="relative flex-1 flex flex-col items-center justify-center bg-black overflow-hidden sm:rounded-b-lg">
        {cameraError ? (
          <div className="text-center p-6 max-w-md">
            <p className="text-red-400 mb-4">{cameraError}</p>
            <button
              onClick={() => startCamera(facingMode)}
              className="px-4 py-2 bg-blue-600 rounded text-white"
            >
              Tentar Novamente
            </button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted // Não dar feedback de audio da própria câmera para não dar eco
              className="absolute inset-0 w-full h-full object-cover"
            />
            {isRecording && (
              <div className="absolute top-4 right-4 bg-red-600 text-white px-3 py-1 rounded-full text-sm font-bold animate-pulse flex items-center gap-2 z-10">
                <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                {formatTime(recordingTime)} / 1:00
              </div>
            )}
            <div className="absolute bottom-8 flex flex-col items-center w-full z-10">
              <div className="flex gap-4 mb-6 px-4 overflow-x-auto w-full justify-center">
                {videos.map((vid, idx) => (
                  <div key={idx} className="relative w-16 h-16 rounded-md border-2 border-white/50 overflow-hidden bg-slate-900 shrink-0">
                    <video src={vid.previewUrl} className="w-full h-full object-cover" />
                    <button
                      onClick={() => removeVideo(idx)}
                      className="absolute top-0 right-0 bg-red-600 p-0.5 rounded-bl disabled:opacity-50"
                      disabled={isRecording}
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
              </div>

              {!isMaxReached ? (
                isRecording ? (
                  <button
                    onClick={stopRecording}
                    className="w-16 h-16 rounded-full bg-red-600 border-4 border-red-300 flex items-center justify-center hover:bg-red-500 transition-colors"
                  >
                    <StopCircle className="w-8 h-8 text-white" />
                  </button>
                ) : (
                  <button
                    onClick={startRecording}
                    className="w-16 h-16 rounded-full bg-red-600 border-4 border-white flex items-center justify-center hover:bg-red-500 transition-colors"
                  >
                    <Video className="w-8 h-8 text-white" />
                  </button>
                )
              ) : (
                <div className="text-amber-400 font-medium mb-4">
                  Máximo de {maxVideos} vídeos alcançado
                </div>
              )}

              {videos.length > 0 && !isRecording && (
                <button
                  onClick={handleSave}
                  className="mt-6 px-8 py-3 bg-blue-600 rounded-full text-white font-medium shadow-lg hover:bg-blue-500 transition-all flex items-center gap-2"
                >
                  Concluir ({videos.length})
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
