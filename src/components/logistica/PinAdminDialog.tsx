import { useState, useEffect, useRef } from "react"
import { ShieldCheck, Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { logisticaRastreamentoApi } from "@/lib/api"
import { toast } from "sonner"

interface PinAdminDialogProps {
  open: boolean
  title: string
  description: string
  acao?: string
  onCancel: () => void
  onConfirmed: () => void
}

/**
 * Substitui o antigo `window.prompt("Digite a senha...")` que comparava
 * a senha diretamente no código-fonte do app (visível a qualquer pessoa
 * pelo DevTools). Agora o PIN é validado no servidor via
 * POST /logistica/rastreamento/validar-pin-admin.
 */
export function PinAdminDialog({ open, title, description, acao, onCancel, onConfirmed }: PinAdminDialogProps) {
  const [pin, setPin] = useState("")
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setPin("")
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  const confirmar = async () => {
    if (!pin) return
    setLoading(true)
    try {
      const res: any = await logisticaRastreamentoApi.validarPinAdmin(pin, acao)
      if (res?.valido) {
        onConfirmed()
      } else {
        toast.error("PIN incorreto")
        setPin("")
        inputRef.current?.focus()
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Erro ao validar PIN")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader>
          <div className="w-12 h-12 rounded-full bg-teal-100 dark:bg-teal-950/40 flex items-center justify-center mb-2">
            <ShieldCheck className="w-6 h-6 text-teal-600" />
          </div>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && confirmar()}
          placeholder="PIN administrativo"
          className="w-full text-center text-2xl tracking-[0.5em] py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
        />

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="flex-1" onClick={onCancel} disabled={loading}>
            Cancelar
          </Button>
          <Button className="flex-1 bg-teal-600 hover:bg-teal-700" onClick={confirmar} disabled={loading || !pin}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
