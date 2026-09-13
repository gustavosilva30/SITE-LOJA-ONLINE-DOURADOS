import { Component, type ReactNode } from "react"

/**
 * Error Boundary que detecta erros de carregamento de chunks (Vite/Rollup)
 * após um deploy — quando o browser tenta buscar um hash antigo que já não existe
 * no servidor e recebe HTML (fallback de SPA) em vez de JS, causando:
 *   - "Failed to fetch dynamically imported module"
 *   - "Expected a JavaScript module script but the server responded with a MIME type of text/html"
 *
 * Solução: forçar um `window.location.reload()` para que o browser carregue
 * o index.html atualizado com os hashes corretos.
 */
interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

const CHUNK_ERROR_PATTERNS = [
  "Failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "Importing a module script failed",
  "Expected a JavaScript module script",
  "MIME type",
]

function isChunkError(error: unknown): boolean {
  if (!error) return false
  const msg = String((error as any).message || error || "").toLowerCase()
  return CHUNK_ERROR_PATTERNS.some((p) => msg.includes(p.toLowerCase()))
}

export class ChunkErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error): void {
    if (isChunkError(error)) {
      // Limpa caches para garantir que o reload traga assets atualizados
      if (typeof window !== "undefined" && "caches" in window) {
        caches.keys().then((names) => {
          for (const name of names) caches.delete(name)
        }).catch(() => {})
      }
      if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistrations().then((regs) => {
          for (const reg of regs) reg.unregister()
        }).catch(() => {})
      }

      // Evita loop de reload se já tentamos uma vez
      const key = "__chunk_reload_ts"
      const last = Number(sessionStorage.getItem(key) || 0)
      const now = Date.now()
      if (now - last < 10_000) {
        // Menos de 10s desde o último reload — não tenta de novo para não criar loop
        console.warn("[ChunkErrorBoundary] Chunk error repetido — não farei reload automático.", error.message)
        return
      }
      sessionStorage.setItem(key, String(now))
      console.warn("[ChunkErrorBoundary] Chunk error detectado — forçando reload para buscar novos hashes.", error.message)
      window.location.reload()
    }
  }

  private handleCleanReload = () => {
    if (typeof window !== "undefined" && "caches" in window) {
      caches.keys().then((names) => {
        return Promise.all(names.map((n) => caches.delete(n)))
      }).then(() => {
        window.location.reload()
      }).catch(() => {
        window.location.reload()
      })
    } else {
      window.location.reload()
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'sans-serif', backgroundColor: '#000D2B', color: '#fff', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', fontWeight: 800 }}>Uma nova versão da loja está disponível!</h2>
          <p style={{ marginBottom: '1.5rem', color: 'rgba(255,255,255,0.7)', maxWidth: '400px' }}>
            Atualizamos nosso catálogo e recursos. Clique no botão abaixo para carregar a versão mais recente.
          </p>
          <button 
            onClick={this.handleCleanReload}
            style={{ padding: '0.75rem 1.75rem', backgroundColor: '#B6D433', color: '#001A54', border: 'none', borderRadius: '0.75rem', cursor: 'pointer', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}
          >
            Atualizar Agora
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
