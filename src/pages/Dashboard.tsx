import { useEffect, useState, useCallback, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { DashboardSkeleton } from "@/components/skeletons/PageSkeletons"
import { Link, useNavigate } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DollarSign, ShoppingBag, PackageOpen, TrendingUp, ArrowUpRight,
  Users, Percent, RefreshCw, Award, Calendar, CreditCard,
  ChevronUp, ChevronDown, BellRing, TrendingDown, Brain, ListChecks, Zap,
  PanelTop, Sparkles, Tags,
} from "lucide-react"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Bar, PieChart, Pie, Cell, Legend, ComposedChart, Line, Brush,
} from "recharts"
import { motion } from "framer-motion"
import { toast } from "sonner"
import { dashboardApi } from "@/lib/api"
import { fmt, fmtDate } from "@/lib/format"
import { Modal } from "@/components/ui/modal"
import {
  PeriodKey,
  MonthRow,
  PaymentSlice,
  CategoriaVendasRow,
  DashStats,
  emptyStats,
  getPeriodDates,
  fetchDashboardStatsHelper,
} from "@/lib/dashboardHelper"

const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "mes", label: "Este mês" },
  { key: "90d", label: "90 dias" },
  { key: "ano", label: "Este ano" },
  { key: "custom", label: "Personalizado" },
]

/** Paleta com tons distinguíveis para daltonismo */
const PIE_COLORS_SAFE = ["#2563eb", "#16a34a", "#ca8a04", "#dc2626", "#7c3aed", "#0e7490", "#c2410c"]

const motionContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.04 },
  },
}

const motionItem = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 380, damping: 26 } },
}

function periodRangeLabel(period: PeriodKey, custom?: { start: string; end: string }) {
  if (period === "custom" && custom?.start && custom?.end) {
    const a = custom.start <= custom.end ? custom.start : custom.end
    const b = custom.start <= custom.end ? custom.end : custom.start
    return `${fmtDate(a)} – ${fmtDate(b)}`
  }
  const { start, end } = getPeriodDates(period)
  return `${fmtDate(start)} – ${fmtDate(end)}`
}



function GrowthBadge({ current, prev }: { current: number; prev: number }) {
  if (prev === 0 && current === 0) return <span className="text-xs text-muted-foreground">—</span>
  if (prev === 0)
    return (
      <span className="text-xs text-emerald-500 flex items-center gap-0.5">
        <ChevronUp className="w-3 h-3" />
        Novo
      </span>
    )
  const pct = ((current - prev) / prev) * 100
  const pos = pct >= 0
  return (
    <span className={`text-xs flex items-center gap-0.5 font-semibold ${pos ? "text-emerald-500" : "text-rose-500"}`}>
      {pos ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  )
}

function MiniSparkline({ data, loading }: { data: { day: string; total: number }[]; loading: boolean }) {
  if (loading) return <Skeleton className="h-10 w-full mt-2 rounded-md" aria-hidden />
  if (!data?.length) return null
  const chartData = data.map((r) => ({
    ...r,
    label: r.day.slice(5),
  }))
  return (
    <div className="h-11 w-full mt-2 -mx-1" aria-hidden>
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <AreaChart data={chartData} margin={{ top: 2, right: 2, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="miniSpark" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="total" stroke="#10b981" strokeWidth={1.5} fill="url(#miniSpark)" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function DashboardTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div
      role="tooltip"
      className="bg-card border border-border rounded-lg px-3 py-2 shadow-lg text-xs max-w-[240px]"
    >
      <p className="font-bold mb-1 text-foreground">{label}</p>
      {payload.map((p: any) => {
        const pct = p.payload?.pctSlice
        const extra = pct != null && String(p.dataKey) === "value" ? ` (${pct.toFixed(1)}% do total)` : ""
        const val = typeof p.value === "number" ? fmt(p.value) : p.value
        return (
          <p key={String(p.name)} className="text-muted-foreground">
            <span style={{ color: p.color }}>{p.name}:</span> {val}
            {extra}
          </p>
        )
      })}
    </div>
  )
}

function buildDestaquesText(stats: DashStats, period: PeriodKey): string[] {
  const out: string[] = []
  const { faturamento, faturamentoPrev, vendasCount, vendasCountPrev, estoqueBaixo, mlFaturamento, contasVencendo } =
    stats

  if (faturamentoPrev > 0) {
    const d = ((faturamento - faturamentoPrev) / faturamentoPrev) * 100
    if (d <= -5) out.push(`Receita ${d.toFixed(1)}% abaixo do período anterior — vale rever preços e canal de vendas.`)
    else if (d >= 10) out.push(`Receita ${d.toFixed(1)}% acima do período anterior.`)
  }
  if (vendasCountPrev > 0) {
    const d = ((vendasCount - vendasCountPrev) / vendasCountPrev) * 100
    if (Math.abs(d) >= 15 && out.length < 3)
      out.push(`Volume de vendas ${d >= 0 ? "subiu" : "caiu"} ${Math.abs(d).toFixed(0)}% vs período anterior.`)
  }
  if (faturamento > 0 && mlFaturamento / faturamento >= 0.35 && out.length < 3)
    out.push("Mercado Livre concentra parte relevante da receita no período selecionado.")
  if (estoqueBaixo > 0 && out.length < 3) out.push(`${estoqueBaixo} produto(s) com estoque no limite ou abaixo do mínimo (> 0).`)
  if (contasVencendo > 0 && out.length < 3) out.push(`${contasVencendo} conta(s) a vencer nos próximos dias.`)
  return out.slice(0, 3)
}

export function Dashboard() {
  const navigate = useNavigate()
  const [period, setPeriod] = useState<PeriodKey>("mes")
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return d.toISOString().split("T")[0]
  })
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().split("T")[0])
  const [modalTopCategorias, setModalTopCategorias] = useState(false)
  const [modalTopClientes, setModalTopClientes] = useState(false)
  const [rankingClientesTab, setRankingClientesTab] = useState<"top" | "inativos">("top")
  const [clientesInativos, setClientesInativos] = useState<
    { cliente_id: string; nome: string; ultimaCompra: string; diasSemComprar: number }[]
  >([])
  const [loadingInativos, setLoadingInativos] = useState(false)
  const [inativosCarregados, setInativosCarregados] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(
    () => typeof window !== "undefined" && localStorage.getItem("dashboard_hide_shortcuts") !== "1"
  )

  const hideShortcutsRow = useCallback(() => {
    localStorage.setItem("dashboard_hide_shortcuts", "1")
    setShowShortcuts(false)
  }, [])

  const showShortcutsRow = useCallback(() => {
    localStorage.removeItem("dashboard_hide_shortcuts")
    setShowShortcuts(true)
  }, [])

  const fetchDashboardStats = useCallback(async (): Promise<DashStats> => {
    return fetchDashboardStatsHelper(period, customStart, customEnd)
  }, [period, customStart, customEnd])

  const dashboardQuery = useQuery({
    queryKey: ['dashboard', period, period === 'custom' ? customStart : null, period === 'custom' ? customEnd : null],
    queryFn: fetchDashboardStats,
    staleTime: 60_000,
  })

  const stats = dashboardQuery.data ?? emptyStats
  const loading = dashboardQuery.isLoading
  const lastUpdated = dashboardQuery.dataUpdatedAt ? new Date(dashboardQuery.dataUpdatedAt) : null

  useEffect(() => {
    if (dashboardQuery.error) {
      console.error("Dashboard error:", dashboardQuery.error)
      toast.error("Falha ao carregar o dashboard. Verifique a conexão e tente novamente.")
    }
  }, [dashboardQuery.error])

  const loadClientesInativos = useCallback(async () => {
    if (inativosCarregados) return
    setLoadingInativos(true)
    try {
      const rows = await dashboardApi.clientesInativos()
      setClientesInativos(rows)
      setInativosCarregados(true)
    } catch (e) {
      console.error(e)
      toast.error("Não foi possível carregar o ranking de inatividade.")
      setClientesInativos([])
      setInativosCarregados(true)
    } finally {
      setLoadingInativos(false)
    }
  }, [inativosCarregados])

  // (refetch automático fica a cargo do useQuery — staleTime/gcTime controlam)

  useEffect(() => {
    if (rankingClientesTab === "inativos") void loadClientesInativos()
  }, [rankingClientesTab, loadClientesInativos])

  const destaques = useMemo(() => buildDestaquesText(stats, period), [stats, period])

  const handleMonthBarClick = (row: MonthRow) => {
    if (row?.mesKey && /^\d{4}-\d{2}$/.test(row.mesKey)) navigate(`/relatorios?mes=${row.mesKey}`)
  }

  const featureLinks = [
    { icon: Brain, label: "AI Pricing", desc: "Sugestões de preço via IA", href: "/produtos", color: "text-purple-500", bg: "bg-purple-500/10" },
    { icon: ListChecks, label: "Checklist Desmonte", desc: "Entrada rápida de peças", href: "/sucatas", color: "text-amber-500", bg: "bg-amber-500/10" },
    { icon: ShoppingBag, label: "Pedidos Loja", desc: "Vendas da Loja Online", href: "/admin/store/orders", color: "text-rose-600", bg: "bg-rose-500/10" },
    { icon: Zap, label: "Sales AI", desc: "WhatsApp para Orçamento", href: "/sales-ai", color: "text-emerald-500", bg: "bg-emerald-500/10" },
  ]

  // Skeleton só na carga inicial; refresh subsequente mantém os dados visíveis
  if (loading && !lastUpdated) {
    return <DashboardSkeleton />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Central de inteligência do negócio.</p>
          <p className="text-xs text-muted-foreground mt-2 font-medium">
            Período dos KPIs:{" "}
            <span className="text-foreground">
              {periodRangeLabel(period, period === "custom" ? { start: customStart, end: customEnd } : undefined)}
            </span>
            {lastUpdated && (
              <>
                {" "}
                · Atualizado às <span className="text-foreground">{lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-col items-stretch sm:items-end gap-2">
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {PERIOD_OPTIONS.map((p) => (
              <Button
                key={p.key}
                size="sm"
                variant={period === p.key ? "default" : "outline"}
                className="h-8 text-xs"
                onClick={() => setPeriod(p.key)}
              >
                {p.label}
              </Button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 shrink-0"
              onClick={() => dashboardQuery.refetch()}
              disabled={loading}
              aria-label="Atualizar dados"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
          {period === "custom" && (
            <div className="flex flex-wrap items-center gap-2 justify-end w-full max-w-md">
              <label className="text-[11px] text-muted-foreground whitespace-nowrap">De</label>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs w-[140px]"
              />
              <label className="text-[11px] text-muted-foreground whitespace-nowrap">até</label>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs w-[140px]"
              />
            </div>
          )}
          {!showShortcuts && (
            <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1 self-end" onClick={showShortcutsRow}>
              <PanelTop className="w-3 h-3" />
              Mostrar atalhos
            </Button>
          )}
        </div>
      </div>

      {(stats?.alertas || []).length > 0 && (
        <motion.div
          className="flex flex-wrap gap-2"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          role="region"
          aria-label="Alertas operacionais"
        >
          {(stats?.alertas || []).map((alerta, i) => (
            <Link
              key={i}
              to={alerta.includes("conta") ? "/financeiro" : "/produtos?estoque=baixo"}
              className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-xs px-3 py-1.5 rounded-full font-medium hover:bg-amber-500/20 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50"
            >
              <BellRing className="w-3 h-3 shrink-0" aria-hidden />
              {alerta}
              <ArrowUpRight className="w-3 h-3 opacity-60" aria-hidden />
            </Link>
          ))}
        </motion.div>
      )}

      {!loading && destaques.length > 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="py-3 pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Destaques do período
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm text-muted-foreground space-y-1">
            {destaques.map((t, i) => (
              <p key={i}>
                • {t}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {showShortcuts && (
        <div className="space-y-2">
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" className="h-7 text-[10px] text-muted-foreground" onClick={hideShortcutsRow}>
              Ocultar atalhos
            </Button>
          </div>
          <motion.div
            className="grid gap-3 md:grid-cols-5"
            variants={motionContainer}
            initial="hidden"
            animate="show"
          >
            {featureLinks.map((feat, i) => (
              <motion.div key={i} variants={motionItem}>
                <Link to={feat.href} className="block h-full">
                  <Card className="border-border/50 hover:border-primary/50 transition-all hover:scale-[1.02] active:scale-[0.99] h-full">
                    <CardContent className="p-4 flex flex-col items-center text-center">
                      <div className={`w-10 h-10 rounded-xl ${feat.bg} flex items-center justify-center mb-3`}>
                        <feat.icon className={`h-6 w-6 ${feat.color}`} />
                      </div>
                      <h3 className="font-bold text-xs uppercase tracking-tight">{feat.label}</h3>
                      <p className="text-[10px] text-muted-foreground mt-1 leading-tight">{feat.desc}</p>
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        </div>
      )}

      <motion.div
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        variants={motionContainer}
        initial="hidden"
        animate="show"
      >
        {[
          {
            title: "Receita Total",
            icon: DollarSign,
            iconBg: "bg-emerald-500/10",
            iconClass: "text-emerald-500",
            value: fmt(stats.faturamento),
            footer: (
              <>
                <GrowthBadge current={stats.faturamento} prev={stats.faturamentoPrev} />
                <span className="text-[10px] text-muted-foreground uppercase font-bold">vs período anterior</span>
              </>
            ),
            spark: true,
            linkTo: "/relatorios",
          },
          {
            title: "Vendas Realizadas",
            icon: ShoppingBag,
            iconBg: "bg-blue-500/10",
            iconClass: "text-blue-500",
            value: String(stats.vendasCount),
            footer: (
              <>
                <GrowthBadge current={stats.vendasCount} prev={stats.vendasCountPrev} />
                <span className="text-[10px] text-muted-foreground uppercase font-bold">vs período anterior</span>
              </>
            ),
            spark: false,
            linkTo: "/vendas",
          },
          {
            title: "Ticket Médio",
            icon: Percent,
            iconBg: "bg-violet-500/10",
            iconClass: "text-violet-500",
            value: fmt(stats.ticketMedio),
            footer: (
              <>
                <GrowthBadge current={stats.ticketMedio} prev={stats.ticketMedioPrev} />
                <span className="text-[10px] text-muted-foreground uppercase font-bold">vs período anterior</span>
              </>
            ),
            spark: false,
            linkTo: "/relatorios",
          },
          {
            title: "Estoque Crítico",
            icon: PackageOpen,
            iconBg: "bg-rose-500/10",
            iconClass: "text-rose-500",
            value: `${stats.estoqueBaixo} itens`,
            valueClass: "text-rose-500",
            footer: (
              <p className="text-[10px] text-muted-foreground uppercase font-bold leading-snug">Mín. &gt; 0 e estoque ≤ mínimo</p>
            ),
            spark: false,
            linkTo: "/produtos?estoque=baixo",
          },
        ].map((k, idx) => (
          <motion.div key={k.title} variants={motionItem}>
            <Link to={k.linkTo} className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl">
              <Card className="border-border/50 bg-card/50 backdrop-blur-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 h-full">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-bold text-muted-foreground uppercase tracking-widest">{k.title}</CardTitle>
                  <div className={`w-8 h-8 rounded-lg ${k.iconBg} flex items-center justify-center`}>
                    <k.icon className={`h-4 w-4 ${k.iconClass}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <>
                      <Skeleton className="h-9 w-36 mb-2" />
                      <Skeleton className="h-4 w-28" />
                    </>
                  ) : (
                    <>
                      <div className={`text-3xl font-black ${k.valueClass || ""}`}>{k.value}</div>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">{k.footer}</div>
                      {k.spark && <MiniSparkline data={stats.sparklineReceita} loading={loading} />}
                    </>
                  )}
                </CardContent>
              </Card>
            </Link>
          </motion.div>
        ))}
      </motion.div>
      
      {/* Métrica de Produtividade por Atendente */}
      {!loading && (stats?.atendenteMetricas || []).length > 0 && (
        <Card className="border-border/50 bg-card/50 backdrop-blur-xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Award className="w-4 h-4 text-primary" />
              Produtividade da Equipe
            </CardTitle>
          </CardHeader>
          <CardContent className="min-h-[300px]">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {(stats?.atendenteMetricas || []).map((m, i) => {
                const totalReg = (stats?.atendenteMetricas || []).reduce((acc, curr) => acc + curr.registros, 0)
                const totalFot = (stats?.atendenteMetricas || []).reduce((acc, curr) => acc + curr.fotos, 0)
                const totalLoc = (stats?.atendenteMetricas || []).reduce((acc, curr) => acc + curr.localizados, 0)
                
                const regPct = totalReg > 0 ? (m.registros / totalReg) * 100 : 0
                const fotPct = totalFot > 0 ? (m.fotos / totalFot) * 100 : 0
                const locPct = totalLoc > 0 ? (m.localizados / totalLoc) * 100 : 0

                return (
                  <div key={i} className="space-y-3 p-3 rounded-lg border border-border/40 bg-background/30">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-bold text-sm leading-tight">{m.nome}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">{m.papel}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px] h-5">{i + 1}º</Badge>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] font-medium">
                          <span>Cadastramentos</span>
                          <span className="text-primary">{m.registros} ({regPct.toFixed(1)}%)</span>
                        </div>
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary transition-all" style={{ width: `${regPct}%` }} />
                        </div>
                      </div>
                      
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] font-medium">
                          <span>Fotos Adicionadas</span>
                          <span className="text-cyan-600">{m.fotos} ({fotPct.toFixed(1)}%)</span>
                        </div>
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-cyan-500 transition-all" style={{ width: `${fotPct}%` }} />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] font-medium">
                          <span>Produtos Localizados</span>
                          <span className="text-emerald-600">{m.localizados} ({locPct.toFixed(1)}%)</span>
                        </div>
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${locPct}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <motion.div
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        variants={motionContainer}
        initial="hidden"
        animate="show"
      >
        {[
          { title: "Receita Hoje", sub: "Vendas do dia", icon: Calendar, value: fmt(stats.vendasHoje), valueClass: "text-emerald-500" },
          { title: "Despesas do Mês", sub: "Contas a pagar", icon: TrendingDown, value: fmt(stats.despesasMes), valueClass: "text-rose-500" },
          { title: "Mercado Livre", sub: "Canal ML", icon: TrendingUp, value: fmt(stats.mlFaturamento), valueClass: "text-amber-500" },
          { title: "Total de Clientes", sub: "Clientes ativos", icon: Users, value: String(stats.clientesTotal), valueClass: "" },
        ].map((s) => (
          <motion.div key={s.title} variants={motionItem}>
            <Card className="border-border/50 bg-card/30 backdrop-blur-md shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{s.title}</CardTitle>
                <s.icon className={`h-4 w-4 ${s.valueClass || "text-muted-foreground"}`} />
              </CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-8 w-24" /> : <div className={`text-2xl font-black ${s.valueClass}`}>{s.value}</div>}
                <p className="text-[10px] text-muted-foreground mt-1 uppercase font-bold">{s.sub}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      <div className="grid gap-4 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle className="text-base">Receitas, despesas e saldo por mês</CardTitle>
            <p className="text-[11px] text-muted-foreground">Clique numa barra para abrir o relatório de vendas daquele mês.</p>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="h-[320px] w-full">
              {loading ? (
                <Skeleton className="h-full w-full rounded-lg" />
              ) : (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200}>
                  <ComposedChart data={stats.salesByMonth} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis
                      yAxisId="left"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `R$${v >= 1000 ? (v / 1000).toFixed(0) + "k" : v}`}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `R$${v >= 1000 ? (v / 1000).toFixed(0) + "k" : v}`}
                    />
                    <Tooltip content={<DashboardTooltip />} cursor={{ fill: "hsl(var(--muted)/0.25)" }} />
                    <Legend
                      formatter={(val) => (
                        <span className="text-xs text-muted-foreground">
                          {val === "receita" ? "Receitas" : val === "despesa" ? "Despesas" : "Saldo (R$)"}
                        </span>
                      )}
                    />
                    <Bar
                      yAxisId="left"
                      dataKey="receita"
                      name="receita"
                      fill="#059669"
                      radius={[4, 4, 0, 0]}
                      barSize={18}
                      cursor="pointer"
                      onClick={(_entry, index) => {
                        const row = stats.salesByMonth[index]
                        if (row) handleMonthBarClick(row)
                      }}
                    />
                    <Bar
                      yAxisId="left"
                      dataKey="despesa"
                      name="despesa"
                      fill="#e11d48"
                      radius={[4, 4, 0, 0]}
                      barSize={18}
                      cursor="pointer"
                      onClick={(_entry, index) => {
                        const row = stats.salesByMonth[index]
                        if (row) handleMonthBarClick(row)
                      }}
                    />
                    <Line yAxisId="right" type="monotone" dataKey="saldo" name="saldo" stroke="#6366f1" strokeWidth={2} dot={false} />
                    <Brush dataKey="name" height={18} stroke="hsl(var(--primary))" tickFormatter={() => ""} travellerWidth={8} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Pedidos recentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {loading ? (
                Array(5)
                  .fill(0)
                  .map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)
              ) : stats.recentOrders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">Nenhum pedido encontrado</div>
              ) : (
                stats.recentOrders.map((order) => (
                  <Link
                    key={order.id}
                    to={`/vendas?edit=${encodeURIComponent(order.id)}`}
                    className="flex items-center justify-between py-1 border-b border-border last:border-0 hover:bg-muted/40 -mx-2 px-2 rounded-md transition-colors"
                  >
                    <div>
                      <div className="text-sm font-medium leading-none flex items-center gap-2">
                        {(order as any).clientes?.nome || "Consumidor"}
                        {order.origem_ml && (
                          <Badge variant="ml" className="text-[9px] px-1 py-0">
                            ML
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {order.data_venda ? new Date(order.data_venda).toLocaleDateString("pt-BR") : "—"}
                      </p>
                    </div>
                    <div className="text-right flex items-center gap-1">
                      <div>
                        <p className="text-sm font-bold">{fmt(order.total || 0)}</p>
                        <Badge
                          variant={
                            order.status === "Pago" || order.status === "Entregue"
                              ? "default"
                              : order.status === "Cancelado"
                                ? "destructive"
                                : "outline"
                          }
                          className="text-[9px] mt-0.5"
                        >
                          {order.status}
                        </Badge>
                      </div>
                      <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    </div>
                  </Link>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-row flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-base flex items-center gap-2">
                  <Tags className="w-4 h-4 text-amber-500 shrink-0" />
                  Vendas por categoria
                </CardTitle>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Quantidade de vendas, valor total e ticket médio das categorias no período.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                disabled={loading || stats.vendasPorCategoria.length === 0}
                onClick={() => setModalTopCategorias(true)}
              >
                Ver top 20
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              Array(5)
                .fill(0)
                .map((_, i) => <Skeleton key={i} className="h-8 w-full mb-2 rounded-md" />)
            ) : stats.vendasPorCategoria.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sem vendas por categoria no período</p>
            ) : (
              <div className="space-y-3">
                {stats.vendasPorCategoria.slice(0, 5).map((cat, i) => {
                  const maxTotal = Math.max(...stats.vendasPorCategoria.map((c) => c.total))
                  const pct = maxTotal > 0 ? (cat.total / maxTotal) * 100 : 0
                  const ticketMedio = cat.qty > 0 ? cat.total / cat.qty : 0
                  return (
                    <div key={cat.nome + i} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-5 h-5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-400 text-[10px] font-black flex items-center justify-center shrink-0">
                            {i + 1}
                          </span>
                          <span className="font-medium truncate max-w-[180px]">{cat.nome}</span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-bold text-xs">{fmt(cat.total)}</span>
                          <span className="text-muted-foreground text-[10px] ml-2 block sm:inline">
                            {cat.qty} un. · TM: {fmt(ticketMedio)}
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500/80 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={rankingClientesTab === "top" ? "default" : "outline"}
                onClick={() => setRankingClientesTab("top")}
                className="gap-1"
              >
                <Users className="w-3.5 h-3.5" />
                Top 100 compradores
              </Button>
              <Button
                type="button"
                size="sm"
                variant={rankingClientesTab === "inativos" ? "default" : "outline"}
                onClick={() => setRankingClientesTab("inativos")}
                className="gap-1"
              >
                <TrendingDown className="w-3.5 h-3.5" />
                Há mais tempo sem comprar
              </Button>
            </div>
            {rankingClientesTab === "top" ? (
              <div className="flex flex-row flex-wrap items-start justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">
                  Por valor total de vendas no período (prévia com 5; lista completa com 100).
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  disabled={loading || stats.topClientes.length === 0}
                  onClick={() => setModalTopClientes(true)}
                >
                  Ver top 100
                </Button>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Clientes com ao menos uma venda: os 100 com a última compra mais antiga (mais dias sem repetir).
              </p>
            )}
          </CardHeader>
          <CardContent>
            {rankingClientesTab === "top" ? (
              loading ? (
                Array(5)
                  .fill(0)
                  .map((_, i) => <Skeleton key={i} className="h-8 w-full mb-2 rounded-md" />)
              ) : stats.topClientes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Sem dados de clientes no período</p>
              ) : (
                <div className="space-y-3">
                  {stats.topClientes.slice(0, 5).map((cli, i) => {
                    const maxTotal = stats.topClientes[0].total
                    const pct = maxTotal > 0 ? (cli.total / maxTotal) * 100 : 0
                    return (
                      <div key={cli.nome + i} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-5 h-5 rounded-full bg-sky-500/10 text-sky-500 text-[10px] font-black flex items-center justify-center shrink-0">
                              {i + 1}
                            </span>
                            <span className="font-medium truncate max-w-[180px]">{cli.nome}</span>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-bold text-xs text-sky-500">{fmt(cli.total)}</span>
                            <span className="text-muted-foreground text-xs ml-2">{cli.qtd} pedido(s)</span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-sky-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            ) : loadingInativos && !inativosCarregados ? (
              Array(5)
                .fill(0)
                .map((_, i) => <Skeleton key={i} className="h-8 w-full mb-2 rounded-md" />)
            ) : clientesInativos.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {inativosCarregados ? "Nenhum cliente com histórico de venda encontrado." : "Carregando…"}
              </p>
            ) : (
              <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                {clientesInativos.map((cli, i) => (
                  <Link
                    key={cli.cliente_id}
                    to="/clientes"
                    className="flex items-center justify-between gap-2 py-2 border-b border-border last:border-0 text-sm hover:bg-muted/50 -mx-1 px-1 rounded-md transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-5 h-5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 text-[10px] font-black flex items-center justify-center shrink-0">
                        {i + 1}
                      </span>
                      <span className="font-medium truncate">{cli.nome}</span>
                    </div>
                    <div className="text-right shrink-0 text-xs">
                      <div className="font-bold text-amber-700 dark:text-amber-400">{cli.diasSemComprar} dias</div>
                      <div className="text-muted-foreground">
                        últ.: {cli.ultimaCompra ? new Date(cli.ultimaCompra).toLocaleDateString("pt-BR") : "—"}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Modal
        isOpen={modalTopCategorias}
        onClose={() => setModalTopCategorias(false)}
        title="Top 20 categorias"
        className="max-w-lg"
        contentClassName="max-h-[min(80vh,520px)] overflow-y-auto"
        alignTop
      >
        <p className="text-xs text-muted-foreground mb-3">
          Período: {periodRangeLabel(period, period === "custom" ? { start: customStart, end: customEnd } : undefined)}
        </p>
        <ol className="space-y-2">
          {stats.vendasPorCategoria.map((cat, i) => {
            const ticketMedio = cat.qty > 0 ? cat.total / cat.qty : 0
            return (
              <li
                key={cat.nome + String(i)}
                className="flex items-center justify-between gap-2 text-sm border-b border-border/60 pb-2 last:border-0"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="w-6 h-6 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-400 text-xs font-black flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <span className="font-medium truncate">{cat.nome}</span>
                </span>
                <span className="text-right shrink-0 text-xs">
                  <span className="font-bold">{fmt(cat.total)}</span>
                  <span className="text-muted-foreground ml-2 block sm:inline">
                    {cat.qty} un. · TM: {fmt(ticketMedio)}
                  </span>
                </span>
              </li>
            )
          })}
        </ol>
      </Modal>

      <Modal
        isOpen={modalTopClientes}
        onClose={() => setModalTopClientes(false)}
        title="Top 100 clientes por valor"
        className="max-w-lg"
        contentClassName="max-h-[min(80vh,520px)] overflow-y-auto"
        alignTop
      >
        <p className="text-xs text-muted-foreground mb-3">
          Período: {periodRangeLabel(period, period === "custom" ? { start: customStart, end: customEnd } : undefined)} · soma das vendas no período.
        </p>
        <ol className="space-y-2">
          {stats.topClientes.map((cli, i) => (
            <li
              key={cli.nome + String(i)}
              className="flex items-center justify-between gap-2 text-sm border-b border-border/60 pb-2 last:border-0"
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className="w-6 h-6 rounded-full bg-sky-500/10 text-sky-600 text-xs font-black flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <span className="font-medium truncate">{cli.nome}</span>
              </span>
              <span className="text-right shrink-0 text-xs">
                <span className="font-bold text-sky-600">{fmt(cli.total)}</span>
                <span className="text-muted-foreground ml-2">{cli.qtd} ped.</span>
              </span>
            </li>
          ))}
        </ol>
      </Modal>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-muted-foreground" />
            Formas de pagamento
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[220px] w-full rounded-lg" />
          ) : stats.paymentPie.length === 0 ? (
            <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">Sem dados</div>
          ) : (
            <div>
              <ResponsiveContainer width="100%" height={160} minWidth={0} minHeight={120}>
                <PieChart>
                  <Pie
                    data={stats.paymentPie.map((s) => ({ ...s, pctSlice: s.pct }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {stats.paymentPie.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS_SAFE[index % PIE_COLORS_SAFE.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={<DashboardTooltip />}
                    formatter={(value: number) => fmt(value)}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1 mt-1">
                {stats.paymentPie.slice(0, 6).map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS_SAFE[i % PIE_COLORS_SAFE.length] }} />
                      <span className="text-muted-foreground truncate">{item.name}</span>
                    </div>
                    <span className="font-bold shrink-0 ml-2">
                      {fmt(item.value)}{" "}
                      <span className="text-muted-foreground font-normal">({item.pct.toFixed(0)}%)</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
