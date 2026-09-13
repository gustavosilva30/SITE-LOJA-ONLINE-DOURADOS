import { Component, type ErrorInfo, type ReactNode } from 'react'
import { logErro } from '@/lib/systemLog'

type Props = { children: ReactNode; atendenteId?: string | null }

type State = { hasError: boolean }

/** Captura erros de renderização React e registra em sistema_logs. */
export class SystemLogErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const e = new Error(error.message)
    e.name = error.name
    e.stack = [error.stack, info.componentStack].filter(Boolean).join('\n--- componentes ---\n')
    logErro('Erro React na interface', e, this.props.atendenteId, 'react.boundary')
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 p-8 text-center">
          <p className="text-lg font-bold text-destructive">Algo saiu do esperado nesta página.</p>
          <p className="text-sm text-muted-foreground max-w-md">
            O erro foi registrado para análise. Tente recarregar ou voltar ao menu.
          </p>
          <button
            type="button"
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold"
            onClick={() => window.location.reload()}
          >
            Recarregar página
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
