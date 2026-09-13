import { dashboardApi } from "./api"

export type PeriodKey = "hoje" | "7d" | "30d" | "mes" | "90d" | "ano" | "custom"

export interface MonthRow {
  mesKey: string
  name: string
  receita: number
  despesa: number
  saldo: number
}

export interface PaymentSlice {
  name: string
  value: number
  pct: number
}

export interface CategoriaVendasRow {
  nome: string;
  qty: number;
  total: number;
}

export interface DashStats {
  faturamento: number
  faturamentoPrev: number
  vendasCount: number
  vendasCountPrev: number
  ticketMedio: number
  ticketMedioPrev: number
  estoqueBaixo: number
  mlFaturamento: number
  recentOrders: any[]
  topProdutos: any[]
  topProdutosPorValor: any[]
  vendasPorCategoria: CategoriaVendasRow[]
  topClientes: any[]
  salesByMonth: MonthRow[]
  paymentPie: PaymentSlice[]
  alertas: string[]
  vendasHoje: number
  contasVencendo: number
  clientesTotal: number
  despesasMes: number
  atendenteMetricas: {
    nome: string
    papel: string
    registros: number
    fotos: number
    localizados: number
  }[]
  sparklineReceita: { day: string; total: number }[]
}

export const emptyStats: DashStats = {
  faturamento: 0,
  faturamentoPrev: 0,
  vendasCount: 0,
  vendasCountPrev: 0,
  ticketMedio: 0,
  ticketMedioPrev: 0,
  estoqueBaixo: 0,
  mlFaturamento: 0,
  recentOrders: [],
  topProdutos: [],
  topProdutosPorValor: [],
  vendasPorCategoria: [],
  topClientes: [],
  salesByMonth: [],
  paymentPie: [],
  alertas: [],
  vendasHoje: 0,
  contasVencendo: 0,
  clientesTotal: 0,
  despesasMes: 0,
  atendenteMetricas: [],
  sparklineReceita: [],
}

/** YYYY-MM-DD no fuso local */
export function localISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function getPeriodDates(period: PeriodKey, custom?: { start: string; end: string }) {
  const now = new Date()
  const today = localISODate(now)
  let start = today
  let end = today
  let prevStart = ""
  let prevEnd = ""

  if (period === "custom" && custom?.start && custom?.end) {
    let a = custom.start
    let b = custom.end
    if (a > b) [a, b] = [b, a]
    start = a
    end = b
    const sd = new Date(start + "T12:00:00")
    const ed = new Date(end + "T12:00:00")
    const days = Math.max(1, Math.ceil((ed.getTime() - sd.getTime()) / 86400000) + 1)
    const prevEndD = new Date(sd)
    prevEndD.setDate(prevEndD.getDate() - 1)
    const prevStartD = new Date(prevEndD)
    prevStartD.setDate(prevStartD.getDate() - (days - 1))
    prevStart = localISODate(prevStartD)
    prevEnd = localISODate(prevEndD)
    return { start, end, prevStart, prevEnd }
  }

  if (period === "hoje") {
    start = today
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    prevStart = localISODate(yesterday)
    prevEnd = prevStart
  } else if (period === "7d") {
    const d = new Date(now)
    d.setDate(d.getDate() - 6)
    start = localISODate(d)
    const pd = new Date(now)
    pd.setDate(pd.getDate() - 13)
    const pe = new Date(now)
    pe.setDate(pe.getDate() - 7)
    prevStart = localISODate(pd)
    prevEnd = localISODate(pe)
  } else if (period === "30d") {
    const d = new Date(now)
    d.setDate(d.getDate() - 29)
    start = localISODate(d)
    const pd = new Date(now)
    pd.setDate(pd.getDate() - 59)
    const pe = new Date(now)
    pe.setDate(pe.getDate() - 30)
    prevStart = localISODate(pd)
    prevEnd = localISODate(pe)
  } else if (period === "mes") {
    start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
    const currentDay = now.getDate()
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    prevStart = localISODate(prevMonthStart)
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth() - 1, currentDay)
    const lastDayPrev = new Date(now.getFullYear(), now.getMonth(), 0)
    if (prevMonthEnd > lastDayPrev) {
      prevEnd = localISODate(lastDayPrev)
    } else {
      prevEnd = localISODate(prevMonthEnd)
    }
  } else if (period === "90d") {
    const d = new Date(now)
    d.setDate(d.getDate() - 89)
    start = localISODate(d)
    prevStart = ""
    prevEnd = ""
  } else if (period === "ano") {
    start = `${now.getFullYear()}-01-01`
    prevStart = `${now.getFullYear() - 1}-01-01`
    prevEnd = `${now.getFullYear() - 1}-12-31`
  }

  return { start, end: today, prevStart, prevEnd }
}

export function processDashboardPack(pack: any): DashStats {
  const rpcStats = pack.rpcStats || {}
  const sparklineReceita: { day: string; total: number }[] = (pack.sparklineReceita || []).map(
    (row: { day?: string; total?: number }) => ({
      day: String(row.day ?? ""),
      total: Number(row.total) || 0,
    })
  )

  const vendas = pack.vendas || []
  const vendasPrev = pack.vendasPrev || []
  const completedStatuses = ["Pago", "Enviado", "Entregue", "Concluída"]
  const itens = (pack.itens || []).filter((item: any) => completedStatuses.includes(item.vendas?.status))
  const contas = pack.contas || []

  const faturamento = Number(rpcStats.faturamento) || 0
  const vendasCount = Number(rpcStats.vendas_count) || 0
  const estoqueBaixo = Number(rpcStats.estoque_critico) || 0
  const mlFaturamento = Number(rpcStats.ml_faturamento) || 0
  const vendasHoje = Number(rpcStats.vendas_hoje) || 0
  const clientesTotal = Number(rpcStats.clientes_total) || 0
  const despesasMes = Number(rpcStats.despesas_mes) || 0

  const vendasPrevValidas = vendasPrev.filter((v: any) => v.status !== "Cancelado")
  const faturamentoPrev = vendasPrevValidas.reduce((acc: number, v: any) => acc + (v.total || 0), 0)
  const vendasCountPrev = vendasPrevValidas.length
  const ticketMedioPrev = vendasCountPrev > 0 ? faturamentoPrev / vendasCountPrev : 0
  const ticketMedio = vendasCount > 0 ? faturamento / vendasCount : 0

  const recentOrders = [...vendas]
    .sort((a, b) => new Date(b.data_venda).getTime() - new Date(a.data_venda).getTime())
    .slice(0, 6)

  const prodMap: Record<string, { nome: string; qty: number; total: number }> = {}
  itens.forEach((item: any) => {
    const nome = item.produtos?.nome || item.produto_id
    if (!prodMap[nome]) prodMap[nome] = { nome, qty: 0, total: 0 }
    prodMap[nome].qty += item.quantidade || 0
    prodMap[nome].total += item.subtotal || 0
  })
  const topProdutos = Object.values(prodMap)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 20)
  const topProdutosPorValor = Object.values(prodMap)
    .sort((a, b) => b.total - a.total)
    .slice(0, 20)

  const nomeByCat: Record<string, string> = Object.fromEntries(
    (pack.categorias || []).map((c: { id: string; nome: string }) => [c.id, c.nome])
  )
  const catAgg: Record<string, CategoriaVendasRow> = {}
  itens.forEach((item: any) => {
    const cid = item.produtos?.categoria_id as string | undefined
    const key = cid || "__sem_categoria__"
    const nome = cid ? nomeByCat[cid] || "Categoria (indefinida)" : "Sem categoria"
    if (!catAgg[key]) catAgg[key] = { nome, qty: 0, total: 0 }
    catAgg[key].qty += item.quantidade || 0
    catAgg[key].total += item.subtotal || 0
  })
  const vendasPorCategoria = Object.values(catAgg)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 20)

  const cliMap: Record<string, { nome: string; total: number; qtd: number }> = {}
  vendas
    .filter((v: any) => v.status !== "Cancelado")
    .forEach((v: any) => {
      const nome = v.clientes?.nome || "Consumidor Final"
      if (!cliMap[nome]) cliMap[nome] = { nome, total: 0, qtd: 0 }
      cliMap[nome].total += v.total || 0
      cliMap[nome].qtd++
    })
  const topClientes = Object.values(cliMap)
    .sort((a, b) => b.total - a.total)
    .slice(0, 100)

  const monthMap: Record<string, { mesKey: string; name: string; receita: number; despesa: number }> = {}

  ;(pack.historyVendas || [])
    .filter((v: any) => v.status !== "Cancelado")
    .forEach((v: any) => {
      if (!v.data_venda) return
      const m = v.data_venda.substring(0, 7)
      if (!monthMap[m])
        monthMap[m] = {
          mesKey: m,
          name: new Date(m + "-15").toLocaleString("pt-BR", { month: "short", year: "2-digit" }),
          receita: 0,
          despesa: 0,
        }
      monthMap[m].receita += v.total || 0
    })
  ;(pack.historyFinanc || [])
    .filter((f: any) => f.tipo === "Despesa")
    .forEach((f: any) => {
      if (!f.data_vencimento) return
      const m = f.data_vencimento.substring(0, 7)
      if (!monthMap[m])
        monthMap[m] = {
          mesKey: m,
          name: new Date(m + "-15").toLocaleString("pt-BR", { month: "short", year: "2-digit" }),
          receita: 0,
          despesa: 0,
        }
      monthMap[m].despesa += f.valor || 0
    })

  const salesByMonth: MonthRow[] = Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-8)
    .map(([, v]) => ({
      ...v,
      saldo: v.receita - v.despesa,
    }))

  const payMap: Record<string, number> = {}
  vendas
    .filter((v: any) => v.status !== "Cancelado")
    .forEach((v: any) => {
      const key = v.forma_pagamento || "Não informado"
      payMap[key] = (payMap[key] || 0) + (v.total || 0)
    })
  const payEntries = Object.entries(payMap).sort(([, a], [, b]) => b - a)
  const payTotal = payEntries.reduce((s, [, v]) => s + v, 0)
  const paymentPie: PaymentSlice[] = payEntries.map(([name, value]) => ({
    name,
    value,
    pct: payTotal > 0 ? (value / payTotal) * 100 : 0,
  }))

  const alertas: string[] = []
  if (estoqueBaixo > 0)
    alertas.push(`${estoqueBaixo} produto(s) com estoque no limite ou abaixo do mínimo configurado (> 0)`)
  if (contas.length > 0) alertas.push(`${contas.length} conta(s) a vencer nos próximos 5 dias`)

  return {
    faturamento,
    faturamentoPrev,
    vendasCount,
    vendasCountPrev,
    ticketMedio,
    ticketMedioPrev,
    estoqueBaixo,
    mlFaturamento,
    recentOrders,
    topProdutos,
    topProdutosPorValor,
    vendasPorCategoria,
    topClientes,
    salesByMonth,
    paymentPie,
    alertas,
    vendasHoje,
    contasVencendo: contas.length,
    clientesTotal,
    despesasMes,
    atendenteMetricas: pack.atendenteMetricas || [],
    sparklineReceita,
  }
}

export async function fetchDashboardStatsHelper(period: PeriodKey, customStart: string, customEnd: string): Promise<DashStats> {
  const customRange = period === "custom" ? { start: customStart, end: customEnd } : undefined
  const { start, end, prevStart, prevEnd } = getPeriodDates(period, customRange)

  const pack = await dashboardApi.pack({
    start,
    end,
    ...(prevStart && prevEnd ? { prev_start: prevStart, prev_end: prevEnd } : {}),
    spark_days: 14,
  })

  return processDashboardPack(pack)
}
