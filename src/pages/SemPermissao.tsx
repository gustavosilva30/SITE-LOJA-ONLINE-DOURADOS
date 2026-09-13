import { Link } from "react-router-dom"
import { ShieldOff } from "lucide-react"
import { Button } from "@/components/ui/button"

export function SemPermissao() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <ShieldOff className="h-14 w-14 text-muted-foreground" aria-hidden />
      <div className="space-y-2 max-w-md">
        <h1 className="text-xl font-bold">Sem permissão para esta área</h1>
        <p className="text-sm text-muted-foreground">
          Peça a um administrador para marcar as telas que você pode acessar em Configurações → Atendentes.
        </p>
      </div>
      <Link to="/">
        <Button variant="default">Voltar ao início</Button>
      </Link>
    </div>
  )
}
