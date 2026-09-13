import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Users, Eye, MousePointerClick, Repeat, ChevronUp, ChevronDown, Clock,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { getApiBaseUrl } from '@/lib/apiBase'
import { getAuthToken } from '@/lib/auth'
import { fmtDateTime } from '@/lib/format'
import { getPeriodDates, type PeriodKey } from '@/lib/dashboardHelper'

const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: 'hoje', label: 'Hoje' },
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: 'mes', label: 'Este mês' },
  { key: '90d', label: '90 dias' },
]

interface Kpis {
  unique_visitors: number
  sessions: number
  pageviews: number
  clicks: number
  returning_visitors: number
  avg_session_seconds: number | null
}

interface AnalyticsPack {
  kpis: Kpis
  kpis_prev: Kpis | null
  daily: { day: string; unique_visitors: number; pageviews: number }[]
  top_pages: { page_path: string; views: number; label: string }[]
  top_clicks: { event_name: string; clicks: number }[]
  returning_visitors: {
    visitor_id: string
    customer_id: string | null
    customer_name: string | null
    customer_phone: string | null
    visit_count: number
    first_seen: string
    last_seen: string
  }[]
}

async function fetchPack(period: PeriodKey): Promise<AnalyticsPack> {
  const { start, end, prevStart, prevEnd } = getPeriodDates(period)
  const params = new URLSearchParams({ start, end })
  if (prevStart && prevEnd) {
    params.set('prev_start', prevStart)
    params.set('prev_end', prevEnd)
  }
  const token = getAuthToken()
  const res = await fetch(`${getApiBaseUrl()}/api/admin/store-analytics/pack?${params.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.detail || 'Erro ao carregar analytics')
  return data
}

function GrowthBadge({ current, prev }: { current: number; prev: number }) {
  if (prev === 0 && current === 0) return <span className="text-xs text-muted-foreground">—</span>
  if (prev === 0) {
    return (
      <span className="text-xs text-emerald-500 flex items-center gap-0.5">
        <ChevronUp className="w-3 h-3" /> Novo
      </span>
    )
  }
  const pct = ((current - prev) / prev) * 100
  const pos = pct >= 0
  return (
    <span className={`text-xs flex items-center gap-0.5 font-semibold ${pos ? 'text-emerald-500' : 'text-rose-500'}`}>
      {pos ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  )
}

function fmtDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—'
  const total = Math.round(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function KpiCard({
  icon: Icon, label, value, prev, loading, formatValue,
}: { icon: any; label: string; value: number; prev?: number; loading: boolean; formatValue?: (v: number) => string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">
            <Icon className="w-4 h-4 text-slate-600" />
          </div>
          {!loading && prev !== undefined && <GrowthBadge current={value} prev={prev} />}
        </div>
        <div className="mt-3">
          {loading ? (
            <Skeleton className="h-7 w-16" />
          ) : (
            <p className="text-2xl font-black">{formatValue ? formatValue(value) : value.toLocaleString('pt-BR')}</p>
          )}
          <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function AnalyticsTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-lg text-xs">
      <p className="font-bold mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={String(p.dataKey)} className="text-muted-foreground">
          <span style={{ color: p.color }}>{p.name}:</span> {p.value?.toLocaleString('pt-BR')}
        </p>
      ))}
    </div>
  )
}

export function StoreAnalyticsPage() {
  const [period, setPeriod] = useState<PeriodKey>('7d')

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['store-analytics', period],
    queryFn: () => fetchPack(period),
    staleTime: 60_000,
  })

  const dailyChartData = useMemo(
    () => (data?.daily || []).map((d) => ({ ...d, label: d.day.slice(5) })),
    [data]
  )

  const kpis = data?.kpis
  const kpisPrev = data?.kpis_prev

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Analytics da Loja</h1>
          <p className="text-sm text-muted-foreground">
            Visitantes, page views e cliques na loja online — inclui visitantes anônimos e logados.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PERIOD_OPTIONS.map((opt) => (
            <Button
              key={opt.key}
              size="sm"
              variant={period === opt.key ? 'default' : 'outline'}
              onClick={() => setPeriod(opt.key)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {isError && (
        <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
          {(error as Error)?.message || 'Erro ao carregar dados de analytics.'}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard icon={Users} label="Visitantes únicos" value={kpis?.unique_visitors ?? 0} prev={kpisPrev?.unique_visitors} loading={isLoading} />
        <KpiCard icon={Repeat} label="Sessões / visitas" value={kpis?.sessions ?? 0} prev={kpisPrev?.sessions} loading={isLoading} />
        <KpiCard icon={Eye} label="Page views" value={kpis?.pageviews ?? 0} prev={kpisPrev?.pageviews} loading={isLoading} />
        <KpiCard icon={MousePointerClick} label="Cliques" value={kpis?.clicks ?? 0} prev={kpisPrev?.clicks} loading={isLoading} />
        <KpiCard icon={Repeat} label="Visitantes que voltaram" value={kpis?.returning_visitors ?? 0} prev={kpisPrev?.returning_visitors} loading={isLoading} />
        <KpiCard
          icon={Clock}
          label="Tempo médio no site"
          value={kpis?.avg_session_seconds ?? 0}
          prev={kpisPrev?.avg_session_seconds ?? undefined}
          loading={isLoading}
          formatValue={fmtDuration}
        />
      </div>
      <p className="text-xs text-muted-foreground -mt-4">
        Tempo médio no site considera só visitas com mais de uma página vista (visitas de uma página só não têm duração para medir).
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Visitantes e page views por dia</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyChartData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="visitorsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="pageviewsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<AnalyticsTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="unique_visitors" name="Visitantes" stroke="#4f46e5" fill="url(#visitorsGrad)" strokeWidth={2} />
                  <Area type="monotone" dataKey="pageviews" name="Page views" stroke="#10b981" fill="url(#pageviewsGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Páginas mais vistas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : !data?.top_pages.length ? (
              <p className="text-sm text-muted-foreground">Sem dados no período.</p>
            ) : (
              data.top_pages.map((p) => (
                <div key={p.page_path} className="flex items-center justify-between gap-3 text-sm py-1.5 border-b last:border-0">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.label}</p>
                    <p className="truncate font-mono text-[10px] text-muted-foreground">{p.page_path}</p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">{p.views.toLocaleString('pt-BR')}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cliques mais frequentes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : !data?.top_clicks.length ? (
              <p className="text-sm text-muted-foreground">Sem dados no período.</p>
            ) : (
              data.top_clicks.map((c) => (
                <div key={c.event_name} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                  <span className="truncate">{c.event_name}</span>
                  <Badge variant="secondary">{c.clicks.toLocaleString('pt-BR')}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Visitantes que mais voltaram</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : !data?.returning_visitors.length ? (
            <p className="text-sm text-muted-foreground">Ninguém voltou mais de uma vez no período.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4">Visitante</th>
                    <th className="py-2 pr-4">Visitas</th>
                    <th className="py-2 pr-4">Primeira vez</th>
                    <th className="py-2">Última vez</th>
                  </tr>
                </thead>
                <tbody>
                  {data.returning_visitors.map((v) => (
                    <tr key={v.visitor_id} className="border-b last:border-0">
                      <td className="py-2 pr-4">
                        {v.customer_name ? (
                          <div>
                            <p className="font-medium">{v.customer_name}</p>
                            <p className="text-xs text-muted-foreground">{v.customer_phone}</p>
                          </div>
                        ) : (
                          <span className="font-mono text-xs text-muted-foreground">visitante anônimo · {v.visitor_id}</span>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        <Badge variant="secondary">{v.visit_count}x</Badge>
                      </td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">{fmtDateTime(v.first_seen)}</td>
                      <td className="py-2 text-xs text-muted-foreground">{fmtDateTime(v.last_seen)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
