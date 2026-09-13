import { useState, useEffect } from "react"
import { ListOrdered, Sparkles, ChevronLeft } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface EntregaResumo {
  id: string
  cliente_nome?: string
  bairro?: string
}

interface EscolherOrdemRotaDialogProps {
  open: boolean
  entregas: EntregaResumo[]
  onCancel: () => void
  onConfirm: (primeiraEntregaId?: string) => void
}

/**
 * Substitui o antigo fluxo de `window.confirm` + `window.prompt` numérico
 * usado para (opcionalmente) escolher a primeira entrega de uma rota
 * otimizada. Mesma funcionalidade, com uma UI tocável e no padrão visual
 * do app — sem depender de diálogos nativos do navegador.
 */
export function EscolherOrdemRotaDialog({ open, entregas, onCancel, onConfirm }: EscolherOrdemRotaDialogProps) {
  const [etapa, setEtapa] = useState<"pergunta" | "lista">("pergunta")

  useEffect(() => {
    if (open) setEtapa("pergunta")
  }, [open])

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-sm rounded-2xl">
        {etapa === "pergunta" ? (
          <>
            <DialogHeader>
              <DialogTitle>Gerar rota otimizada</DialogTitle>
              <DialogDescription>
                Deseja escolher manualmente qual será a primeira entrega, ou prefere deixar o app calcular a melhor ordem de tudo?
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 mt-2">
              <Button
                className="justify-start gap-2 bg-teal-600 hover:bg-teal-700 h-12"
                onClick={() => onConfirm(undefined)}
              >
                <Sparkles className="w-4 h-4" />
                Deixar o app escolher a melhor ordem
              </Button>
              <Button
                variant="outline"
                className="justify-start gap-2 h-12"
                onClick={() => setEtapa("lista")}
              >
                <ListOrdered className="w-4 h-4" />
                Eu escolho a primeira entrega
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <button onClick={() => setEtapa("pergunta")} className="p-1 -ml-1 rounded-full hover:bg-muted">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <DialogTitle>Qual é a primeira entrega?</DialogTitle>
              </div>
              <DialogDescription>Toque na entrega que deve ser visitada primeiro.</DialogDescription>
            </DialogHeader>
            <div className="max-h-80 overflow-y-auto space-y-1.5 mt-1">
              {entregas.map((e, idx) => (
                <button
                  key={e.id}
                  onClick={() => onConfirm(e.id)}
                  className={cn(
                    "w-full text-left p-3 rounded-xl border border-slate-200 dark:border-slate-800",
                    "hover:border-teal-500 hover:bg-teal-50/50 dark:hover:bg-teal-950/20 transition-colors",
                    "flex items-center gap-3"
                  )}
                >
                  <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-xs font-bold shrink-0">
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{e.cliente_nome || "Cliente"}</p>
                    {e.bairro && <p className="text-xs text-muted-foreground truncate">{e.bairro}</p>}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
