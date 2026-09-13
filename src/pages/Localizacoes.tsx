import { YardLocationWmsPanel } from "@/components/YardLocationWmsPanel"

export function Localizacoes() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight uppercase">Localizações</h1>
        <p className="text-muted-foreground mt-1">
          Estruture o estoque em pastas e subpastas. Cada local pode ter <strong>Nível 1</strong>, <strong>Nível 2</strong> ou <strong>Nível 3</strong> (andares).
        </p>
      </div>

      <YardLocationWmsPanel />
    </div>
  )
}

