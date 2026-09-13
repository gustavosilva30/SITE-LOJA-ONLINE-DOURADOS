import { Skeleton } from "@/components/ui/skeleton"

/**
 * Esqueletos por tipo de página. Substituem spinners — a tela renderiza
 * estrutura imediatamente e só os blocos de conteúdo "respiram", o que
 * dá sensação de velocidade (padrão Notion/Linear/Vercel).
 */

/** Layout genérico de uma página de CRM: título + filtros + tabela. */
export function PageSkeleton() {
  return (
    <div className="space-y-6 p-2">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-10 w-24 ml-auto" />
      </div>
      <TableSkeleton rows={8} columns={6} />
    </div>
  )
}

/** Tabela com cabeçalho e N linhas. */
export function TableSkeleton({ rows = 8, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="bg-muted/40 px-4 py-3 grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-3/4" />
        ))}
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="px-4 py-3 grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
            {Array.from({ length: columns }).map((_, c) => (
              <Skeleton key={c} className={`h-4 ${c === 0 ? "w-5/6" : c === columns - 1 ? "w-1/2" : "w-2/3"}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Grid de cards (produtos, sucatas etc). */
export function CardGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border overflow-hidden bg-card">
          <Skeleton className="h-32 w-full rounded-none" />
          <div className="p-3 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-2/3" />
            <div className="flex justify-between pt-1">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-12" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/** Dashboard: KPIs + gráfico + listas. */
export function DashboardSkeleton() {
  return (
    <div className="space-y-6 p-2">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border p-4 space-y-3 bg-card">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
      {/* Chart + list */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl border border-border p-4 space-y-3 bg-card">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-64 w-full" />
        </div>
        <div className="rounded-xl border border-border p-4 space-y-3 bg-card">
          <Skeleton className="h-5 w-32" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Layout de chat (WhatsApp/Atendimento): lista lateral + conversa. */
export function ChatSkeleton() {
  return (
    <div className="flex h-[calc(100vh-4rem)] gap-2 p-2">
      <div className="w-80 rounded-xl border border-border bg-card p-3 space-y-3">
        <Skeleton className="h-9 w-full" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2 py-1">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
      <div className="flex-1 rounded-xl border border-border bg-card flex flex-col">
        <div className="p-3 border-b border-border flex items-center gap-2">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex-1 p-4 space-y-3">
          <Skeleton className="h-12 w-2/3" />
          <Skeleton className="h-8 w-1/2 ml-auto" />
          <Skeleton className="h-16 w-3/4" />
          <Skeleton className="h-10 w-1/3 ml-auto" />
        </div>
      </div>
    </div>
  )
}
