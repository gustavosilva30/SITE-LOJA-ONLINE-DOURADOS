import { useEffect, useRef, useState } from "react"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

const POLL_MS = 3 * 60 * 1000

type VersionFile = { version?: string; build?: number }

function versionJsonUrl(cacheBust: number): string {
  const base = import.meta.env.BASE_URL || "/"
  const path = base.endsWith("/") ? `${base}version.json` : `${base}/version.json`
  return `${path}?cb=${cacheBust}`
}

/**
 * Compara /version.json (atualizado a cada deploy) com o valor carregado na abertura.
 * Só ativo em produção para não incomodar no Vite dev.
 */
export function UpdateAvailableBanner() {
  const initialBuildRef = useRef<number | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!import.meta.env.PROD) return

    let cancelled = false

    const fetchVersion = async () => {
      try {
        const res = await fetch(versionJsonUrl(Date.now()), {
          headers: { Accept: "application/json" },
        })
        if (!res.ok || cancelled) return
        const data = (await res.json()) as VersionFile
        const build = typeof data.build === "number" ? data.build : 0

        if (initialBuildRef.current === null) {
          initialBuildRef.current = build
          return
        }
        if (build > 0 && build !== initialBuildRef.current) {
          setVisible(true)
        }
      } catch {
        /* rede / JSON inválido — ignora */
      }
    }

    void fetchVersion()
    const interval = setInterval(fetchVersion, POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === "visible") void fetchVersion()
    }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", fetchVersion)

    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", fetchVersion)
    }
  }, [])

  if (!visible) return null

  return (
    <div
      role="status"
      className="fixed bottom-0 left-0 right-0 z-[200] flex flex-wrap items-center justify-center gap-3 border-t border-primary/30 bg-background/95 px-4 py-3 text-center shadow-[0_-8px_30px_rgba(0,0,0,0.12)] backdrop-blur-md supports-[backdrop-filter]:bg-background/80"
    >
      <p className="text-sm font-semibold text-foreground">
        Nova atualização disponível — atualize a página para carregar a versão mais recente.
      </p>
      <Button
        type="button"
        size="sm"
        className="gap-2 font-bold"
        onClick={() => {
          window.location.reload()
        }}
      >
        <RefreshCw className="h-4 w-4" />
        Atualizar página
      </Button>
    </div>
  )
}
