import { useEffect, useMemo, useRef, useState, useId } from "react"
import { CameraOff } from "lucide-react"
import { Html5Qrcode } from "html5-qrcode"

export interface QrCameraScannerProps {
  onResult: (code: string) => void
  active: boolean
  divId?: string
  className?: string
}

export function QrCameraScanner({ onResult, active, divId, className = "" }: QrCameraScannerProps) {
  const reactId = useId()
  const actualDivId = divId || `qr-reader-${reactId.replace(/:/g, '')}`
  
  const divRef = useRef<HTMLDivElement>(null)
  const scannerRef = useRef<any>(null)
  const onResultRef = useRef(onResult)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [session, setSession] = useState(0)
  const canUseCamera = useMemo(() => {
    if (typeof window === "undefined") return false
    const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    return window.isSecureContext || isLocalhost
  }, [])

  onResultRef.current = onResult

  useEffect(() => {
    if (!active || !divRef.current) return

    setError(null)
    if (!canUseCamera) {
      setError("A câmera só funciona em HTTPS (ou localhost em desenvolvimento).")
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Câmera indisponível neste dispositivo/navegador.")
      return
    }

    let mounted = true

    const initScanner = async () => {
      try {
        setStarting(true)
        if (!mounted || !divRef.current) return
        const scanner = new Html5Qrcode(actualDivId)
        scannerRef.current = scanner

        await scanner.start(
          { facingMode: "environment" },
          { fps: 12, qrbox: { width: 260, height: 260 } },
          (decodedText: string) => {
            const trimmed = decodedText.trim()
            const normalized = trimmed.startsWith("0") ? trimmed.replace(/^0+/, "") || "0" : trimmed
            onResultRef.current(normalized)
          },
          () => {}
        )
        if (mounted) setStarting(false)
      } catch (e: any) {
        const name = String(e?.name || "")
        const msg = String(e?.message || e || "")
        if (!mounted) return
        setStarting(false)
        if (name === "NotAllowedError" || msg.toLowerCase().includes("permission")) {
          setError("Permissão de câmera negada. Ative a permissão do site e tente novamente.")
          return
        }
        if (name === "NotFoundError") {
          setError("Nenhuma câmera foi encontrada neste dispositivo.")
          return
        }
        setError("Não foi possível iniciar a câmera: " + (msg || "erro desconhecido"))
      }
    }

    initScanner()

    return () => {
      mounted = false
      const s = scannerRef.current
      scannerRef.current = null
      if (s) {
        void s
          .stop()
          .then(() => {
            try {
              s.clear?.()
            } catch {
              /* ignore */
            }
          })
          .catch(() => {})
      }
    }
  }, [active, actualDivId, session, canUseCamera])

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-muted/20 rounded-xl border border-dashed border-border gap-3 text-foreground text-sm p-4 text-center">
        <CameraOff className="w-8 h-8 text-destructive" />
        <p>{error}</p>
        <p className="text-xs text-muted-foreground">Verifique permissões do navegador e se está usando HTTPS.</p>
        <button
          type="button"
          onClick={() => {
            setError(null)
            setSession((s) => s + 1)
          }}
          className="px-3 py-1.5 rounded-lg border bg-background hover:bg-muted text-xs font-bold"
        >
          Tentar novamente
        </button>
      </div>
    )
  }

  return (
    <div className={["relative rounded-xl overflow-hidden bg-black", className].filter(Boolean).join(" ")}>
      <div id={actualDivId} ref={divRef} className="w-full" />
      {starting && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white text-sm font-bold">
          Iniciando câmera…
        </div>
      )}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="w-48 h-48 border-2 border-primary/80 rounded-lg relative">
          <span className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-primary rounded-tl" />
          <span className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-primary rounded-tr" />
          <span className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-primary rounded-bl" />
          <span className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-primary rounded-br" />
        </div>
      </div>
      <div className="absolute bottom-2 left-0 right-0 pointer-events-none text-center text-white/80 text-[11px] font-bold">
        Aponte a câmera para o QR Code
      </div>
    </div>
  )
}
