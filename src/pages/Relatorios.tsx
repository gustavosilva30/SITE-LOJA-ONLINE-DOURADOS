import { useEffect, useState, useCallback } from "react"
import { useSearchParams } from "react-router-dom"
import { clientesApi, relatoriosApi, atendentesApi, produtoSearchesApi } from "@/lib/api"
import { TableSkeleton } from "@/components/skeletons/PageSkeletons"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { FileText, Download, Printer, TrendingUp, ShoppingBag, Wallet, ArrowDownCircle, ArrowUpCircle, RefreshCw, Camera, RotateCcw, Search, Users } from "lucide-react"

import { fmt, fmtDate } from "@/lib/format"

type ReportType = 'vendas' | 'vendas_por_vendedor' | 'contas_pagar' | 'contas_receber' | 'fluxo_caixa' | 'cadastro_e_fotos' | 'buscas_produtos' | 'contatos_por_atendente' | 'pedidos_clientes'

type BuscaProdutoItem = {
    termo: string
    termo_normalizado: string
    total_buscas: number
    buscas_zero: number
    pct_zero: number
    ultima_busca: string | null
    atendentes_distintos: number
    atendentes: string[]
}

type AtendenteStats = {
    nome: string
    papel: string
    pecas_desmontagem: number
    pecas_sucata: number
    pecas_estoque: number
    produtos_com_foto: number
    total_fotos: number
    produtos_localizados: number
    cadastro_desmontar_sucata?: number
    cadastro_registrar_sucata?: number
    cadastro_massa?: number
    cadastro_avulso?: number
    edicao_fotos_qrcode?: number
    edicao_titulo_preco?: number
    edicao_localizacao_qrcode?: number
    edicao_localizacao_avulso?: number
    edicao_localizacao_massa?: number
    total_edicao_fotos?: number
}

type CadastroFotosBundle = {
    /** Nova lista consolidada por pessoa. */
    stats_por_atendente: AtendenteStats[]
    /** Quantidade de registos de contribuição de fotos (linhas no período). */
    fotoContribRegistrosCount: number
    /** Por pessoa: quantos produtos distintos tiveram fotos adicionadas (alvo produto). */
    resumoProdutosComFotosPorPessoa: { papel: string; nome: string; qtdProdutosUnicos: number }[]
    produtosCadastro: { label: string; qtd: number }[]
    pecasSucata: { label: string; qtd: number }[]
    sucatasNovas: { label: string; qtd: number }[]
}

export function Relatorios() {
    const [searchParams, setSearchParams] = useSearchParams()
    const [reportType, setReportType] = useState<ReportType>('vendas')
    const [loading, setLoading] = useState(false)
    const [data, setData] = useState<any[]>([])
    /** Devoluções carregadas junto ao relatório de vendas (mesmo período/filtro cliente). */
    const [devolucoesVendas, setDevolucoesVendas] = useState<any[]>([])
    const [clientes, setClientes] = useState<any[]>([])

    // Filtros
    const [filterDataInicio, setFilterDataInicio] = useState('')
    const [filterDataFim, setFilterDataFim] = useState('')
    const [filterCliente, setFilterCliente] = useState('')
    const [filterStatus, setFilterStatus] = useState('todos')

    // Totalizadores
    const [totals, setTotals] = useState<Record<string, number>>({})
    const [cadastroFotosBundle, setCadastroFotosBundle] = useState<CadastroFotosBundle | null>(null)

    // Filtros e dados — Buscas de produtos
    const [atendentesList, setAtendentesList] = useState<{ id: string; nome: string }[]>([])
    const [filterAtendenteIds, setFilterAtendenteIds] = useState<string[]>([])
    const [filterSomenteZero, setFilterSomenteZero] = useState(false)
    const [filterMinBuscas, setFilterMinBuscas] = useState(1)
    const [buscasItems, setBuscasItems] = useState<BuscaProdutoItem[]>([])
    const BUSCAS_PAGE_SIZE = 20
    const [buscasPage, setBuscasPage] = useState(1)

    // Paginação genérica
    const [page, setPage] = useState(1)
    const [pageDevolucoes, setPageDevolucoes] = useState(1)
    const PAGE_SIZE = 20

    const [clientSearchTerm, setClientSearchTerm] = useState('')
    const [clientDropdownOpen, setClientDropdownOpen] = useState(false)

    useEffect(() => {
        const t = searchParams.get('relatorio')
        if (t === 'cadastro_e_fotos' || t === 'pecas_por_usuario') setReportType('cadastro_e_fotos')
    }, [searchParams])

    useEffect(() => {
        const mes = searchParams.get('mes')
        if (!mes || !/^\d{4}-\d{2}$/.test(mes)) return
        const [y, m] = mes.split('-').map(Number)
        if (!y || !m || m < 1 || m > 12) return
        const inicio = `${mes}-01`
        const lastDay = new Date(y, m, 0).getDate()
        const fim = `${mes}-${String(lastDay).padStart(2, '0')}`
        setFilterDataInicio(inicio)
        setFilterDataFim(fim)
        setReportType('vendas')
        setSearchParams(
            (prev) => {
                const next = new URLSearchParams(prev)
                next.delete('mes')
                return next
            },
            { replace: true }
        )
    }, [searchParams, setSearchParams])

    /** Evita misturar linhas de um relatório com a tabela de outro (ex.: fluxo_caixa faz m.mes.split). */
    useEffect(() => {
        setData([])
        setDevolucoesVendas([])
        setTotals({})
        if (reportType !== 'cadastro_e_fotos') setCadastroFotosBundle(null)
    }, [reportType])

    useEffect(() => {
        clientesApi.listar({ limit: 500 }).then((data) => {
            if (Array.isArray(data)) setClientes(data.map((c: any) => ({ id: c.id, nome: c.nome })))
        }).catch(() => setClientes([]))
        atendentesApi.listar({ limit: 500 }).then((data: any) => {
            const arr = Array.isArray(data) ? data : (data?.items ?? [])
            setAtendentesList(arr.map((a: any) => ({ id: a.id, nome: a.nome || a.username || a.email || a.id })))
        }).catch(() => setAtendentesList([]))
    }, [])

    const fetchReport = useCallback(async () => {
        setLoading(true)
        setData([])
        setDevolucoesVendas([])
        setTotals({})
        if (reportType === 'cadastro_e_fotos') setCadastroFotosBundle(null)
        if (reportType === 'buscas_produtos') setBuscasItems([])
        setPage(1)
        setPageDevolucoes(1)

        try {
            if (reportType === 'buscas_produtos') {
                const res = await produtoSearchesApi.top({
                    data_inicio: filterDataInicio || undefined,
                    data_fim: filterDataFim || undefined,
                    atendente_ids: filterAtendenteIds.length ? filterAtendenteIds : undefined,
                    somente_zero_resultados: filterSomenteZero,
                    min_buscas: filterMinBuscas,
                    limit: 200,
                })
                const items: BuscaProdutoItem[] = res?.items ?? []
                setBuscasItems(items)
                setBuscasPage(1) // sempre volta pra primeira página em nova consulta
                setTotals({
                    total_termos: items.length,
                    total_buscas: items.reduce((a, i) => a + i.total_buscas, 0),
                    buscas_zero: items.reduce((a, i) => a + i.buscas_zero, 0),
                })
                return
            }
            const res = await relatoriosApi.executar({
                tipo: reportType,
                data_inicio: filterDataInicio || undefined,
                data_fim: filterDataFim || undefined,
                cliente_id: filterCliente || undefined,
                status: filterStatus,
            })
            const vendasRows = res?.data ?? []
            const devRows = res?.devolucoes_vendas ?? []

            if (reportType === 'vendas') {
                const mergeDevolucoesTotals = (vr: any[], dr: any[]) => {
                    const shouldSumAll = filterStatus !== 'todos'
                    const filtered = shouldSumAll
                        ? (vr || []).filter((v: any) => v.status === filterStatus)
                        : (vr || []).filter((v: any) => v.status !== 'Cancelado' && v.status !== 'Devolvido')
                    const tot = filtered.reduce((a: number, v: any) => a + (v.total || 0), 0)
                    const pago = filtered.reduce((a: number, v: any) => a + (v.total_pago || 0), 0)
                    const pendente = filtered.reduce((a: number, v: any) => a + (v.valor_aberto || 0), 0)
                    const devolucoes = (dr || []).reduce((a: number, v: any) => a + (v.valor_reembolso || 0), 0)
                    const liquido = tot - devolucoes
                    return { tot, pago, pendente, devolucoes, liquido }
                }
                setData(vendasRows)
                setDevolucoesVendas(devRows)
                setTotals(mergeDevolucoesTotals(vendasRows, devRows))
            } else {
                setData(vendasRows)
                setDevolucoesVendas(devRows)
                setTotals(res?.totals ?? {})
                if (reportType === 'cadastro_e_fotos' && res?.cadastro_fotos_bundle) {
                    setCadastroFotosBundle(res.cadastro_fotos_bundle)
                }
            }
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }, [reportType, filterDataInicio, filterDataFim, filterCliente, filterStatus, filterAtendenteIds, filterSomenteZero, filterMinBuscas])

    useEffect(() => {
        fetchReport()
    }, [fetchReport])

    const handlePrint = () => {
        const printContent = document.getElementById('report-printable')
        if (!printContent) return
        const w = window.open('', '_blank', 'width=1100,height=700')
        if (!w) return
        w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Relatório</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 10px; color: #000; padding: 16mm; }
  h1 { font-size: 16px; margin-bottom: 4px; }
  h2 { font-size: 12px; color: #555; margin-bottom: 12px; }
  h3 { font-size: 14px; border-bottom: 2px solid #eee; padding-bottom: 4px; margin-top: 20px; margin-bottom: 8px; font-weight: bold; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { background: #f0f0f0; font-weight: bold; border: 1px solid #ccc; padding: 5px 8px; text-align: left; }
  td { border: 1px solid #ccc; padding: 4px 8px; }
  .totals { margin-top: 12px; font-weight: bold; font-size: 11px; }
  @media print { body { padding: 8mm; } }
</style></head><body>
${printContent.innerHTML}
<script>window.onload = () => { window.print(); setTimeout(() => window.close(), 500); }</script>
</body></html>`)
        w.document.close()
    }

    const handleExportCSV = () => {
        if (reportType === 'buscas_produtos' && buscasItems.length > 0) {
            const lines: string[] = []
            lines.push(['Termo', 'Total buscas', 'Buscas sem resultado', '% sem resultado', 'Atendentes distintos', 'Última busca', 'Atendentes'].join(';'))
            for (const it of buscasItems) {
                lines.push([
                    it.termo,
                    String(it.total_buscas),
                    String(it.buscas_zero),
                    `${it.pct_zero}%`,
                    String(it.atendentes_distintos),
                    it.ultima_busca ?? '',
                    (it.atendentes || []).join(' | '),
                ].map(x => String(x).replace(/[\n\r;]/g, ' ')).join(';'))
            }
            const csv = '﻿' + lines.join('\n')
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `relatorio_buscas_produtos_${new Date().toISOString().split('T')[0]}.csv`
            a.click()
            URL.revokeObjectURL(url)
            return
        }
        if (reportType === 'vendas' && (data.length > 0 || devolucoesVendas.length > 0)) {
            const lines: string[] = []
            lines.push('Resumo')
            lines.push(['Indicador', 'Valor (R$)'].join(';'))
            lines.push(['Total vendas (pedidos não cancelados)', String(totals.total ?? 0)].join(';'))
            lines.push(['Total recebido', String(totals.pago ?? 0)].join(';'))
            lines.push(['Total pendente', String(totals.pendente ?? 0)].join(';'))
            lines.push(['Total devoluções — reembolsos Aprovado/Concluído', String(totals.devolucoes ?? 0)].join(';'))
            lines.push(['Vendas líquidas (vendas − devoluções)', String(totals.liquido ?? 0)].join(';'))
            lines.push('')
            lines.push('Vendas')
            if (data.length > 0) {
                const flat = data.map((v: any) => ({
                    pedido: v.numero_pedido,
                    data: v.data_venda,
                    cliente: v.clientes?.nome ?? '',
                    vendedor: v.atendentes?.nome ?? '',
                    pagamento: v.forma_pagamento ?? '',
                    status: v.status ?? '',
                    pago: v.total_pago ?? 0,
                    pendente: v.valor_aberto ?? 0,
                    total: v.total ?? 0,
                }))
                lines.push(Object.keys(flat[0]).join(';'))
                for (const row of flat) lines.push(Object.values(row).map((x) => String(x ?? '')).join(';'))
            }
            lines.push('')
            lines.push('Devoluções no período')
            if (devolucoesVendas.length > 0) {
                const dflat = devolucoesVendas.map((d: any) => ({
                    id: d.id,
                    data: d.created_at,
                    pedido: d.vendas?.numero_pedido ?? '',
                    cliente: d.clientes?.nome ?? '',
                    status: d.status ?? '',
                    valor_reembolso: d.valor_reembolso ?? 0,
                    atendente: d.atendentes?.nome ?? '',
                    motivo: (d.motivo || '').replace(/[\n\r;]/g, ' '),
                }))
                lines.push(Object.keys(dflat[0]).join(';'))
                for (const row of dflat) lines.push(Object.values(row).map((x) => String(x ?? '')).join(';'))
            }
            const csv = '\uFEFF' + lines.join('\n')
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `relatorio_${reportType}_${new Date().toISOString().split('T')[0]}.csv`
            a.click()
            URL.revokeObjectURL(url)
            return
        }
        if (reportType === 'cadastro_e_fotos' && cadastroFotosBundle) {
            const b = cadastroFotosBundle
            const lines: string[] = []
            
            if (b.stats_por_atendente?.length > 0) {
                lines.push('Produtividade por Atendente / Desmontador')
                lines.push([
                    'Nome', 'Papel', 'Peças Desmontagem', 'Registro Sucata', 'Cadastro Estoque', 'Produtos com Foto', 'Total Fotos', 'Endereçados',
                    'Desmontar Sucata', 'Registrar Sucata', 'Cadastro Massa', 'Cadastro Avulso', 'Fotos QR Code', 'Edição Título/Preço', 'Localização QR Code', 'Localização Avulso', 'Localização Massa'
                ].join(';'))
                for (const s of b.stats_por_atendente) {
                    lines.push([
                        s.nome, s.papel, 
                        String(s.pecas_desmontagem), String(s.pecas_sucata), String(s.pecas_estoque), 
                        String(s.produtos_com_foto), String(s.total_fotos), String(s.produtos_localizados),
                        String(s.cadastro_desmontar_sucata || 0),
                        String(s.cadastro_registrar_sucata || 0),
                        String(s.cadastro_massa || 0),
                        String(s.cadastro_avulso || 0),
                        String(s.edicao_fotos_qrcode || 0),
                        String(s.edicao_titulo_preco || 0),
                        String(s.edicao_localizacao_qrcode || 0),
                        String(s.edicao_localizacao_avulso || 0),
                        String(s.edicao_localizacao_massa || 0)
                    ].join(';'))
                }
                lines.push('')
            }

            lines.push('Resumo — produtos distintos com fotos por pessoa (crédito)')
            lines.push(['Papel', 'Nome', 'Qtd produtos únicos'].join(';'))
            for (const r of b.resumoProdutosComFotosPorPessoa) {
                lines.push([r.papel, r.nome, String(r.qtdProdutosUnicos)].join(';'))
            }
            lines.push('')
            lines.push('Produtos cadastrados no período (origem: estoque vs sucata)')
            lines.push(['Origem do cadastro', 'Quantidade'].join(';'))
            for (const r of b.produtosCadastro) lines.push([r.label, String(r.qtd)].join(';'))
            lines.push('')
            lines.push('Peças registradas na sucata no período')
            lines.push(['Agrupamento', 'Quantidade'].join(';'))
            for (const r of b.pecasSucata) lines.push([r.label, String(r.qtd)].join(';'))
            lines.push('')
            lines.push('Sucatas (veículos) criadas no período')
            lines.push(['Agrupamento', 'Quantidade'].join(';'))
            for (const r of b.sucatasNovas) lines.push([r.label, String(r.qtd)].join(';'))
            const csv = '\uFEFF' + lines.join('\n')
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `relatorio_${reportType}_${new Date().toISOString().split('T')[0]}.csv`
            a.click()
            URL.revokeObjectURL(url)
            return
        }
        if (!data.length) return
        const headers = Object.keys(data[0]).join(';')
        const rows = data.map((row: any) =>
            Object.values(row).map((v: any) =>
                typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')
            ).join(';')
        ).join('\n')
        const csv = '\uFEFF' + headers + '\n' + rows
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `relatorio_${reportType}_${new Date().toISOString().split('T')[0]}.csv`
        a.click()
        URL.revokeObjectURL(url)
    }

    const reportLabels: Record<ReportType, string> = {
        vendas: 'Relatório de Vendas',
        vendas_por_vendedor: 'Vendas por Vendedor',
        contas_pagar: 'Contas a Pagar',
        contas_receber: 'Contas a Receber',
        fluxo_caixa: 'Fluxo de Caixa',
        cadastro_e_fotos: 'Cadastro e fotos',
        buscas_produtos: 'Buscas no estoque',
        contatos_por_atendente: 'Contatos por Atendente',
        pedidos_clientes: 'Pedidos de Clientes',
    }

    const reportIcons: Record<ReportType, React.ReactNode> = {
        vendas: <ShoppingBag className="w-4 h-4" />,
        vendas_por_vendedor: <TrendingUp className="w-4 h-4" />,
        contas_pagar: <ArrowUpCircle className="w-4 h-4 text-red-500" />,
        contas_receber: <ArrowDownCircle className="w-4 h-4 text-emerald-500" />,
        fluxo_caixa: <Wallet className="w-4 h-4" />,
        cadastro_e_fotos: <Camera className="w-4 h-4" />,
        buscas_produtos: <Search className="w-4 h-4" />,
        contatos_por_atendente: <Users className="w-4 h-4" />,
        pedidos_clientes: <ShoppingBag className="w-4 h-4" />,
    }

    const cadastroFotosTemConteudo =
        reportType === 'cadastro_e_fotos' &&
        cadastroFotosBundle &&
        (cadastroFotosBundle.fotoContribRegistrosCount > 0 ||
            cadastroFotosBundle.resumoProdutosComFotosPorPessoa.length > 0 ||
            cadastroFotosBundle.produtosCadastro.length > 0 ||
            cadastroFotosBundle.pecasSucata.length > 0 ||
            cadastroFotosBundle.sucatasNovas.length > 0)

    const mostrarBotoesExport =
        !loading &&
        (reportType === 'cadastro_e_fotos'
            ? !!cadastroFotosTemConteudo
            : reportType === 'vendas'
                ? data.length > 0 || devolucoesVendas.length > 0
                : reportType === 'buscas_produtos' || reportType === 'contatos_por_atendente'
                    ? data.length > 0
                    : data.length > 0)

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Relatórios</h1>
                <p className="text-muted-foreground mt-1">Gere, filtre, imprima e exporte relatórios do sistema.</p>
            </div>

            {/* Report Type Selector */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {(Object.keys(reportLabels) as ReportType[]).map(type => (
                    <button
                        key={type}
                        onClick={() => setReportType(type)}
                        className={`p-3 rounded-xl border-2 text-left transition-all group ${reportType === type
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border hover:border-primary/40 text-muted-foreground hover:text-foreground'
                            }`}
                    >
                        <div className="mb-1.5">{reportIcons[type]}</div>
                        <p className="text-xs font-bold leading-tight">{reportLabels[type]}</p>
                    </button>
                ))}
            </div>

            {/* Filters */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base font-bold">{reportLabels[reportType]}</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-3 items-end mb-4">
                        <div className="space-y-1">
                            <Label className="text-xs">Data Início</Label>
                            <Input
                                type="date"
                                className="h-8 text-xs w-36"
                                value={filterDataInicio}
                                onChange={e => setFilterDataInicio(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Data Fim</Label>
                            <Input
                                type="date"
                                className="h-8 text-xs w-36"
                                value={filterDataFim}
                                onChange={e => setFilterDataFim(e.target.value)}
                            />
                        </div>
                        {(reportType === 'vendas' || reportType === 'contas_pagar' || reportType === 'contas_receber') && (
                            <div className="space-y-1 relative">
                                <Label className="text-xs">Cliente</Label>
                                <Input
                                    placeholder="Todos os clientes..."
                                    className="h-8 text-xs w-56"
                                    value={clientSearchTerm}
                                    onChange={e => {
                                        setClientSearchTerm(e.target.value)
                                        if (e.target.value === '') setFilterCliente('')
                                    }}
                                    onFocus={() => setClientDropdownOpen(true)}
                                    onBlur={() => setTimeout(() => setClientDropdownOpen(false), 200)}
                                />
                                {clientDropdownOpen && (
                                    <div className="absolute z-50 mt-1 w-72 bg-popover border border-border rounded-md shadow-md max-h-60 overflow-y-auto">
                                        <div
                                            className="px-2 py-1.5 text-xs cursor-pointer hover:bg-muted"
                                            onClick={() => {
                                                setFilterCliente('')
                                                setClientSearchTerm('')
                                                setClientDropdownOpen(false)
                                            }}
                                        >
                                            Todos os clientes
                                        </div>
                                        {clientes.filter(c => c.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(clientSearchTerm.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''))).map(c => (
                                            <div
                                                key={c.id}
                                                className="px-2 py-1.5 text-xs cursor-pointer hover:bg-muted"
                                                onClick={() => {
                                                    setFilterCliente(c.id)
                                                    setClientSearchTerm(c.nome)
                                                    setClientDropdownOpen(false)
                                                }}
                                            >
                                                {c.nome}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                        {(reportType === 'vendas') && (
                            <div className="space-y-1">
                                <Label className="text-xs">Status</Label>
                                <Select
                                    className="h-8 text-xs w-36"
                                    value={filterStatus}
                                    onChange={e => setFilterStatus(e.target.value)}
                                >
                                    <option value="todos">Todos</option>
                                    <option value="Pendente">Pendente</option>
                                    <option value="Pago">Pago</option>
                                    <option value="Enviado">Enviado</option>
                                    <option value="Entregue">Entregue</option>
                                    <option value="Cancelado">Cancelado</option>
                                </Select>
                            </div>
                        )}
                        {(reportType === 'contas_pagar' || reportType === 'contas_receber') && (
                            <div className="space-y-1">
                                <Label className="text-xs">Status</Label>
                                <Select
                                    className="h-8 text-xs w-36"
                                    value={filterStatus}
                                    onChange={e => setFilterStatus(e.target.value)}
                                >
                                    <option value="todos">Todos</option>
                                    <option value="Pendente">Pendente</option>
                                    <option value="Pago">Pago</option>
                                    <option value="Vencido">Vencido</option>
                                    <option value="Cancelado">Cancelado</option>
                                </Select>
                            </div>
                        )}
                        {reportType === 'buscas_produtos' && (
                            <>
                                <div className="space-y-1">
                                    <Label className="text-xs">Mín. de buscas</Label>
                                    <Input
                                        type="number"
                                        min={1}
                                        className="h-8 text-xs w-24"
                                        value={filterMinBuscas}
                                        onChange={e => setFilterMinBuscas(Math.max(1, Number(e.target.value) || 1))}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={filterSomenteZero}
                                            onChange={e => setFilterSomenteZero(e.target.checked)}
                                        />
                                        Só sem resultado
                                    </Label>
                                </div>
                                <div className="space-y-1 max-w-sm">
                                    <Label className="text-xs">Atendentes ({filterAtendenteIds.length || 'todos'})</Label>
                                    <div className="border rounded p-2 max-h-32 overflow-y-auto bg-background w-72">
                                        {atendentesList.length === 0 && (
                                            <p className="text-xs text-muted-foreground">Carregando...</p>
                                        )}
                                        {atendentesList.map(a => {
                                            const checked = filterAtendenteIds.includes(a.id)
                                            return (
                                                <label key={a.id} className="flex items-center gap-2 text-xs py-0.5 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={() => {
                                                            setFilterAtendenteIds(prev =>
                                                                prev.includes(a.id)
                                                                    ? prev.filter(x => x !== a.id)
                                                                    : [...prev, a.id]
                                                            )
                                                        }}
                                                    />
                                                    {a.nome}
                                                </label>
                                            )
                                        })}
                                    </div>
                                </div>
                            </>
                        )}
                        <Button size="sm" className="h-8 gap-2" onClick={fetchReport} disabled={loading}>
                            {loading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
                            Gerar Relatório
                        </Button>
                        {mostrarBotoesExport && (
                            <>
                                <Button size="sm" variant="outline" className="h-8 gap-2" onClick={handlePrint}>
                                    <Printer className="w-3 h-3" /> Imprimir / PDF
                                </Button>
                                <Button size="sm" variant="outline" className="h-8 gap-2" onClick={handleExportCSV}>
                                    <Download className="w-3 h-3" /> Exportar Excel
                                </Button>
                            </>
                        )}
                    </div>

                    {/* Totals Bar */}
                    {Object.keys(totals).length > 0 && (
                        <div className="flex gap-4 mb-4 flex-wrap">
                            {totals.total !== undefined && reportType === 'vendas' && (
                                <>
                                    <div className="bg-primary/10 border border-primary/20 rounded-lg px-4 py-2 text-sm shadow-sm">
                                        <span className="text-muted-foreground text-[10px] font-bold uppercase">Total Vendas</span>
                                        <p className="font-black text-primary text-lg">{fmt(totals.total)}</p>
                                    </div>
                                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-2 text-sm shadow-sm">
                                        <span className="text-muted-foreground text-[10px] font-bold uppercase text-emerald-600">Total Recebido</span>
                                        <p className="font-black text-emerald-600 text-lg">{fmt(totals.pago || 0)}</p>
                                    </div>
                                    <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg px-4 py-2 text-sm shadow-sm">
                                        <span className="text-muted-foreground text-[10px] font-bold uppercase text-rose-600">Total Pendente</span>
                                        <p className="font-black text-rose-600 text-lg">{fmt(totals.pendente || 0)}</p>
                                    </div>
                                    <div className="bg-orange-500/10 border border-orange-500/25 rounded-lg px-4 py-2 text-sm shadow-sm">
                                        <span className="text-muted-foreground text-[10px] font-bold uppercase flex items-center gap-1">
                                            <RotateCcw className="w-3 h-3" />
                                            Devoluções (reembolso)
                                        </span>
                                        <p className="font-black text-orange-600 text-lg">{fmt(totals.devolucoes ?? 0)}</p>
                                        <span className="text-[9px] text-muted-foreground">Soma Aprovado + Concluído</span>
                                    </div>
                                    <div className={`border rounded-lg px-4 py-2 text-sm shadow-sm ${(totals.liquido ?? 0) >= 0 ? 'bg-sky-500/10 border-sky-500/25' : 'bg-amber-500/10 border-amber-500/30'}`}>
                                        <span className="text-muted-foreground text-[10px] font-bold uppercase">Vendas líquidas</span>
                                        <p className={`font-black text-lg ${(totals.liquido ?? 0) >= 0 ? 'text-sky-700 dark:text-sky-400' : 'text-amber-800 dark:text-amber-300'}`}>
                                            {fmt(totals.liquido ?? 0)}
                                        </p>
                                        <span className="text-[9px] text-muted-foreground">Total vendas − devoluções (reembolso)</span>
                                    </div>
                                </>
                            )}
                            {totals.total !== undefined && reportType === 'vendas_por_vendedor' && (
                                <>
                                    <div className="bg-primary/10 border border-primary/20 rounded-lg px-4 py-2 text-sm shadow-sm">
                                        <span className="text-muted-foreground text-[10px] font-bold uppercase">Total Vendas</span>
                                        <p className="font-black text-primary text-lg">{fmt(totals.total)}</p>
                                    </div>
                                    <div className="bg-orange-500/10 border border-orange-500/25 rounded-lg px-4 py-2 text-sm shadow-sm">
                                        <span className="text-muted-foreground text-[10px] font-bold uppercase flex items-center gap-1">
                                            <RotateCcw className="w-3 h-3" />
                                            Devoluções
                                        </span>
                                        <p className="font-black text-orange-600 text-lg">{fmt(totals.devolucoes ?? 0)}</p>
                                    </div>
                                    <div className={`border rounded-lg px-4 py-2 text-sm shadow-sm ${(totals.liquido ?? 0) >= 0 ? 'bg-sky-500/10 border-sky-500/25' : 'bg-amber-500/10 border-amber-500/30'}`}>
                                        <span className="text-muted-foreground text-[10px] font-bold uppercase">Líquido</span>
                                        <p className={`font-black text-lg ${(totals.liquido ?? 0) >= 0 ? 'text-sky-700 dark:text-sky-400' : 'text-amber-800 dark:text-amber-300'}`}>
                                            {fmt(totals.liquido ?? 0)}
                                        </p>
                                        <span className="text-[9px] text-muted-foreground">Vendas − devoluções</span>
                                    </div>
                                </>
                            )}
                            {totals.receber !== undefined && (
                                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-2 text-sm">
                                    <span className="text-xs text-muted-foreground flex gap-1 items-center"><ArrowDownCircle className="w-3 h-3 text-emerald-500" />A Receber / Entradas:</span>
                                    <p className="font-black text-emerald-500">{fmt(totals.receber)}</p>
                                </div>
                            )}
                            {totals.pagar !== undefined && (
                                <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2 text-sm">
                                    <span className="text-xs text-muted-foreground flex gap-1 items-center"><ArrowUpCircle className="w-3 h-3 text-red-500" />A Pagar / Saídas:</span>
                                    <p className="font-black text-red-500">{fmt(totals.pagar)}</p>
                                </div>
                            )}
                            {totals.saldo !== undefined && (
                                <div className={`border rounded-lg px-4 py-2 text-sm ${totals.saldo >= 0 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                                    <span className="text-xs text-muted-foreground">Saldo:</span>
                                    <p className={`font-black ${totals.saldo >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{fmt(totals.saldo)}</p>
                                </div>
                            )}
                            {totals.entradas !== undefined && (
                                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-2 text-sm">
                                    <span className="text-xs text-muted-foreground flex gap-1 items-center"><ArrowDownCircle className="w-3 h-3 text-emerald-500" />Entradas:</span>
                                    <p className="font-black text-emerald-500">{fmt(totals.entradas)}</p>
                                </div>
                            )}
                            {totals.saidas !== undefined && (
                                <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2 text-sm">
                                    <span className="text-xs text-muted-foreground flex gap-1 items-center"><ArrowUpCircle className="w-3 h-3 text-red-500" />Saídas:</span>
                                    <p className="font-black text-red-500">{fmt(totals.saidas)}</p>
                                </div>
                            )}
                            {reportType === 'cadastro_e_fotos' && totals.totalProdutosUnicosComFoto !== undefined && (
                                <>
                                    <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg px-4 py-2 text-sm">
                                        <span className="text-muted-foreground text-xs">Produtos com fotos (únicos)</span>
                                        <p className="font-black text-cyan-700">{totals.totalProdutosUnicosComFoto}</p>
                                        <span className="text-[10px] text-muted-foreground">No período, alvo estoque</span>
                                    </div>
                                    <div className="bg-primary/10 border border-primary/20 rounded-lg px-4 py-2 text-sm">
                                        <span className="text-muted-foreground text-xs">Produtos cadastrados</span>
                                        <p className="font-black text-primary">{totals.totalProdutosCad ?? 0}</p>
                                    </div>
                                    <div className="bg-violet-500/10 border border-violet-500/20 rounded-lg px-4 py-2 text-sm">
                                        <span className="text-muted-foreground text-xs">Peças na sucata</span>
                                        <p className="font-black text-violet-700">{totals.totalPecasSuc ?? 0}</p>
                                    </div>
                                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-2 text-sm">
                                        <span className="text-muted-foreground text-xs">Sucatas novas</span>
                                        <p className="font-black text-amber-800">{totals.totalSucatasNovas ?? 0}</p>
                                    </div>
                                </>
                            )}
                            {reportType === 'contatos_por_atendente' && totals.total_contatos !== undefined && (
                                <div className="bg-primary/10 border border-primary/20 rounded-lg px-4 py-2 text-sm shadow-sm">
                                    <span className="text-muted-foreground text-[10px] font-bold uppercase">Total de Contatos</span>
                                    <p className="font-black text-primary text-lg">{totals.total_contatos}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Printable Report Area */}
                    <div id="report-printable">
                        <div style={{ display: 'none' }} id="report-print-header">
                            <h1>{reportLabels[reportType]}</h1>
                            <h2>
                                Período: {filterDataInicio ? fmtDate(filterDataInicio) : '---'} até {filterDataFim ? fmtDate(filterDataFim) : '---'}
                                {' | '}Gerado em: {new Date().toLocaleString('pt-BR')}
                            </h2>
                        </div>

                        {loading ? (
                            <TableSkeleton rows={10} columns={6} />
                        ) : reportType === 'buscas_produtos' ? (
                            buscasItems.length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground">
                                    <Search className="w-10 h-10 mx-auto mb-3 opacity-20" />
                                    <p>Sem buscas registradas para os filtros selecionados.</p>
                                    <p className="text-sm mt-2 max-w-lg mx-auto">
                                        As buscas são registradas automaticamente quando os atendentes pesquisam
                                        produtos na tela <strong>Estoque</strong>.
                                    </p>
                                </div>
                            ) : (
                                <>
                                    <div className="flex flex-wrap gap-3 mb-4">
                                        <div className="bg-primary/10 border border-primary/20 rounded-lg px-4 py-2 text-sm">
                                            <span className="text-xs text-muted-foreground">Termos distintos</span>
                                            <p className="font-black text-primary">{totals.total_termos ?? 0}</p>
                                        </div>
                                        <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg px-4 py-2 text-sm">
                                            <span className="text-xs text-muted-foreground">Total de buscas</span>
                                            <p className="font-black text-cyan-700">{totals.total_buscas ?? 0}</p>
                                        </div>
                                        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2 text-sm">
                                            <span className="text-xs text-muted-foreground">Buscas sem resultado</span>
                                            <p className="font-black text-red-600">{totals.buscas_zero ?? 0}</p>
                                            <span className="text-[10px] text-muted-foreground">peças que faltam no estoque</span>
                                        </div>
                                    </div>
                                    {(() => {
                                        const totalPages = Math.max(1, Math.ceil(buscasItems.length / BUSCAS_PAGE_SIZE))
                                        const safePage = Math.min(buscasPage, totalPages)
                                        const start = (safePage - 1) * BUSCAS_PAGE_SIZE
                                        const end = start + BUSCAS_PAGE_SIZE
                                        const pageItems = buscasItems.slice(start, end)
                                        return (
                                            <>
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>Termo pesquisado</TableHead>
                                                            <TableHead className="text-right">Buscas</TableHead>
                                                            <TableHead className="text-right">Sem resultado</TableHead>
                                                            <TableHead className="text-right">% Sem result.</TableHead>
                                                            <TableHead>Atendentes</TableHead>
                                                            <TableHead>Última busca</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {pageItems.map((it) => (
                                                            <TableRow key={it.termo_normalizado}>
                                                                <TableCell className="font-medium">{it.termo}</TableCell>
                                                                <TableCell className="text-right font-bold">{it.total_buscas}</TableCell>
                                                                <TableCell className={`text-right ${it.buscas_zero > 0 ? 'text-red-600 font-bold' : ''}`}>
                                                                    {it.buscas_zero}
                                                                </TableCell>
                                                                <TableCell className="text-right">
                                                                    {it.pct_zero > 0 ? (
                                                                        <Badge variant={it.pct_zero >= 80 ? 'destructive' : 'secondary'}>
                                                                            {it.pct_zero}%
                                                                        </Badge>
                                                                    ) : (
                                                                        <span className="text-muted-foreground">—</span>
                                                                    )}
                                                                </TableCell>
                                                                <TableCell className="text-xs text-muted-foreground">
                                                                    {(it.atendentes || []).slice(0, 3).join(', ')}
                                                                    {it.atendentes && it.atendentes.length > 3 ? ` +${it.atendentes.length - 3}` : ''}
                                                                </TableCell>
                                                                <TableCell className="text-xs text-muted-foreground">
                                                                    {it.ultima_busca ? new Date(it.ultima_busca).toLocaleString('pt-BR') : '—'}
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>

                                                {/* Controles de paginação */}
                                                <div className="flex flex-wrap items-center justify-between gap-2 mt-3 px-1">
                                                    <span className="text-xs text-muted-foreground">
                                                        Mostrando <strong>{start + 1}</strong>–<strong>{Math.min(end, buscasItems.length)}</strong> de <strong>{buscasItems.length}</strong> termos
                                                    </span>
                                                    <div className="flex items-center gap-1">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-8 px-2"
                                                            disabled={safePage <= 1}
                                                            onClick={() => setBuscasPage(1)}
                                                            title="Primeira página"
                                                        >«</Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-8 px-2"
                                                            disabled={safePage <= 1}
                                                            onClick={() => setBuscasPage(p => Math.max(1, p - 1))}
                                                        >‹ Anterior</Button>
                                                        <span className="text-xs font-medium px-2">
                                                            Página <strong>{safePage}</strong> de <strong>{totalPages}</strong>
                                                        </span>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-8 px-2"
                                                            disabled={safePage >= totalPages}
                                                            onClick={() => setBuscasPage(p => Math.min(totalPages, p + 1))}
                                                        >Próxima ›</Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-8 px-2"
                                                            disabled={safePage >= totalPages}
                                                            onClick={() => setBuscasPage(totalPages)}
                                                            title="Última página"
                                                        >»</Button>
                                                    </div>
                                                </div>
                                            </>
                                        )
                                    })()}
                                </>
                            )
                        ) : reportType === 'cadastro_e_fotos' ? (
                            cadastroFotosBundle === null ? (
                                <div className="text-center py-12 text-muted-foreground">
                                    <FileText className="w-10 h-10 mx-auto mb-3 opacity-20" />
                                    <p>Defina o período (opcional) e clique em <strong>Gerar Relatório</strong>.</p>
                                    <p className="text-sm mt-2 max-w-lg mx-auto">
                                        Resumo de <strong>produtos distintos</strong> com fotos por atendente (sem listar SKU).
                                        Inclui também produtos cadastrados, peças na sucata e novas sucatas no período.
                                    </p>
                                </div>
                            ) : !cadastroFotosTemConteudo ? (
                                <div className="text-center py-12 text-muted-foreground">
                                    <FileText className="w-10 h-10 mx-auto mb-3 opacity-20" />
                                    <p>Nenhum registo encontrado para o período selecionado.</p>
                                </div>
                            ) : (
                                <div className="space-y-10">
                                    {cadastroFotosBundle && (cadastroFotosBundle.stats_por_atendente || []).length > 0 && (
                                        <div>
                                            <h3 className="text-sm font-bold mb-2">Produtividade por Colaborador</h3>
                                            <p className="text-xs text-muted-foreground mb-3 max-w-xl">
                                                Resumo consolidado de cadastros de produtos (desmontagem da sucata, criação em massa e avulso), fotos tiradas e produtos localizados no estoque.
                                            </p>
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Colaborador</TableHead>
                                                        <TableHead className="text-center">Cadastros Totais</TableHead>
                                                        <TableHead className="text-center">Fotos Tiradas</TableHead>
                                                        <TableHead className="text-center">Produtos c/ Foto</TableHead>
                                                        <TableHead className="text-center">Localizados</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {cadastroFotosBundle.stats_por_atendente.map((s: any, i: number) => {
                                                        const cadastrosTotais = (s.pecas_desmontagem || 0) + (s.pecas_estoque || 0);
                                                        return (
                                                            <TableRow key={i}>
                                                                <TableCell>
                                                                    <div className="font-bold">{s.nome}</div>
                                                                    <div className="text-[10px] text-muted-foreground uppercase">{s.papel}</div>
                                                                </TableCell>
                                                                <TableCell className="text-center font-mono font-bold text-primary">{cadastrosTotais}</TableCell>
                                                                <TableCell className="text-center font-mono text-cyan-600 font-bold">{s.total_fotos || 0}</TableCell>
                                                                <TableCell className="text-center font-mono text-cyan-600">{s.produtos_com_foto || 0}</TableCell>
                                                                <TableCell className="text-center font-mono text-emerald-600 font-bold">{s.produtos_localizados || 0}</TableCell>
                                                            </TableRow>
                                                        );
                                                    })}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    )}
                                </div>
                            )
                        ) : data.length === 0 && (reportType !== 'vendas' || devolucoesVendas.length === 0) ? (
                            <div className="text-center py-12 text-muted-foreground">
                                <FileText className="w-10 h-10 mx-auto mb-3 opacity-20" />
                                <p>Defina os filtros e clique em <strong>Gerar Relatório</strong> para visualizar os dados.</p>
                            </div>
                        ) : (
                            /* ===== RELATÓRIO: VENDAS ===== */
                            reportType === 'vendas' ? (
                                <div className="space-y-10">
                                    <div>
                                        <h3 className="text-sm font-bold mb-2">Vendas</h3>
                                        {data.length > 0 ? (
                                            <>
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Pedido</TableHead>
                                                        <TableHead>Data</TableHead>
                                                        <TableHead>Cliente</TableHead>
                                                        <TableHead>Vendedor</TableHead>
                                                        <TableHead>Pagamento</TableHead>
                                                        <TableHead>Status</TableHead>
                                                        <TableHead className="text-right">Pago</TableHead>
                                                        <TableHead className="text-right">Pendente</TableHead>
                                                        <TableHead className="text-right">Total</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((v: any, i: number) => (
                                                        <TableRow key={i}>
                                                            <TableCell className="font-mono font-bold text-primary">
                                                                #{v.numero_pedido ? String(v.numero_pedido).padStart(6, '0') : '------'}
                                                            </TableCell>
                                                            <TableCell className="text-xs">{fmtDate(v.data_venda)}</TableCell>
                                                            <TableCell>{v.clientes?.nome || 'Consumidor Final'}</TableCell>
                                                            <TableCell>{v.atendentes?.nome || '---'}</TableCell>
                                                            <TableCell className="text-xs">{v.forma_pagamento || '---'}</TableCell>
                                                            <TableCell>
                                                                <Badge variant={v.status === 'Cancelado' ? 'destructive' : v.status === 'Pago' || v.status === 'Entregue' ? 'default' : 'outline'} className="text-[10px]">
                                                                    {v.status}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell className="text-right text-emerald-600 font-medium">{fmt(v.total_pago || 0)}</TableCell>
                                                            <TableCell className="text-right text-rose-600 font-medium">{fmt(v.valor_aberto || 0)}</TableCell>
                                                            <TableCell className="text-right font-bold">{fmt(v.total)}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                    <TableRow className="bg-primary/5 font-black">
                                                        <TableCell colSpan={6} className="text-right text-sm">TOTAL GERAL</TableCell>
                                                        <TableCell className="text-right text-sm text-emerald-600">{fmt(totals.pago || 0)}</TableCell>
                                                        <TableCell className="text-right text-sm text-rose-600">{fmt(totals.pendente || 0)}</TableCell>
                                                        <TableCell className="text-right text-sm text-primary">{fmt(totals.total || 0)}</TableCell>
                                                    </TableRow>
                                                </TableBody>
                                            </Table>
                                            
                                            {/* Paginação Vendas */}
                                            {(() => {
                                                const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE))
                                                const safePage = Math.min(page, totalPages)
                                                const start = (safePage - 1) * PAGE_SIZE
                                                const end = Math.min(start + PAGE_SIZE, data.length)
                                                return (
                                                    <div className="flex flex-wrap items-center justify-between gap-2 mt-3 px-1">
                                                        <span className="text-xs text-muted-foreground">
                                                            Mostrando <strong>{start + 1}</strong>–<strong>{end}</strong> de <strong>{data.length}</strong> vendas
                                                        </span>
                                                        <div className="flex items-center gap-1">
                                                            <Button size="sm" variant="outline" className="h-8 px-2" disabled={safePage <= 1} onClick={() => setPage(1)}>«</Button>
                                                            <Button size="sm" variant="outline" className="h-8 px-2" disabled={safePage <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>‹ Anterior</Button>
                                                            <span className="text-xs font-medium px-2">Página <strong>{safePage}</strong> de <strong>{totalPages}</strong></span>
                                                            <Button size="sm" variant="outline" className="h-8 px-2" disabled={safePage >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Próxima ›</Button>
                                                            <Button size="sm" variant="outline" className="h-8 px-2" disabled={safePage >= totalPages} onClick={() => setPage(totalPages)}>»</Button>
                                                        </div>
                                                    </div>
                                                )
                                            })()}
                                            </>
                                        ) : (
                                            <p className="text-sm text-muted-foreground">Nenhuma venda no período com os filtros atuais.</p>
                                        )}
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold mb-2 flex items-center gap-2">
                                            <RotateCcw className="w-4 h-4 text-orange-600" />
                                            Devoluções no período
                                        </h3>
                                        <p className="text-xs text-muted-foreground mb-3 max-w-xl">
                                            Os totais <strong>Devoluções</strong> e <strong>Vendas líquidas</strong> usam apenas reembolsos com status{' '}
                                            <strong>Aprovado</strong> ou <strong>Concluído</strong> (mesma regra do módulo Devoluções).
                                        </p>
                                        {devolucoesVendas.length > 0 ? (
                                            <>
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Data</TableHead>
                                                        <TableHead>Pedido</TableHead>
                                                        <TableHead>Cliente</TableHead>
                                                        <TableHead>Status</TableHead>
                                                        <TableHead className="text-right">Valor reembolso</TableHead>
                                                        <TableHead>Registado por</TableHead>
                                                        <TableHead>Motivo</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {devolucoesVendas.slice((pageDevolucoes - 1) * PAGE_SIZE, pageDevolucoes * PAGE_SIZE).map((d: any, i: number) => (
                                                        <TableRow key={d.id || i}>
                                                            <TableCell className="text-xs whitespace-nowrap">{fmtDate(d.created_at)}</TableCell>
                                                            <TableCell className="font-mono text-xs">
                                                                {d.vendas?.numero_pedido != null
                                                                    ? `#${String(d.vendas.numero_pedido).padStart(6, '0')}`
                                                                    : '—'}
                                                            </TableCell>
                                                            <TableCell className="text-sm">{d.clientes?.nome || '—'}</TableCell>
                                                            <TableCell>
                                                                <Badge
                                                                    variant={
                                                                        d.status === 'Recusado'
                                                                            ? 'destructive'
                                                                            : d.status === 'Concluido'
                                                                              ? 'default'
                                                                              : 'outline'
                                                                    }
                                                                    className="text-[10px]"
                                                                >
                                                                    {d.status}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell className="text-right font-bold text-orange-600">{fmt(d.valor_reembolso || 0)}</TableCell>
                                                            <TableCell className="text-xs">{d.atendentes?.nome || '—'}</TableCell>
                                                            <TableCell className="text-xs max-w-[200px] truncate" title={d.motivo || ''}>
                                                                {d.motivo || '—'}
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>

                                            {/* Paginação Devoluções */}
                                            {(() => {
                                                const totalPages = Math.max(1, Math.ceil(devolucoesVendas.length / PAGE_SIZE))
                                                const safePage = Math.min(pageDevolucoes, totalPages)
                                                const start = (safePage - 1) * PAGE_SIZE
                                                const end = Math.min(start + PAGE_SIZE, devolucoesVendas.length)
                                                return (
                                                    <div className="flex flex-wrap items-center justify-between gap-2 mt-3 px-1">
                                                        <span className="text-xs text-muted-foreground">
                                                            Mostrando <strong>{start + 1}</strong>–<strong>{end}</strong> de <strong>{devolucoesVendas.length}</strong> devoluções
                                                        </span>
                                                        <div className="flex items-center gap-1">
                                                            <Button size="sm" variant="outline" className="h-8 px-2" disabled={safePage <= 1} onClick={() => setPageDevolucoes(1)}>«</Button>
                                                            <Button size="sm" variant="outline" className="h-8 px-2" disabled={safePage <= 1} onClick={() => setPageDevolucoes(p => Math.max(1, p - 1))}>‹ Anterior</Button>
                                                            <span className="text-xs font-medium px-2">Página <strong>{safePage}</strong> de <strong>{totalPages}</strong></span>
                                                            <Button size="sm" variant="outline" className="h-8 px-2" disabled={safePage >= totalPages} onClick={() => setPageDevolucoes(p => Math.min(totalPages, p + 1))}>Próxima ›</Button>
                                                            <Button size="sm" variant="outline" className="h-8 px-2" disabled={safePage >= totalPages} onClick={() => setPageDevolucoes(totalPages)}>»</Button>
                                                        </div>
                                                    </div>
                                                )
                                            })()}
                                            </>
                                        ) : (
                                            <p className="text-sm text-muted-foreground">Nenhuma devolução no período com os filtros atuais.</p>
                                        )}
                                    </div>
                                </div>
                            ) : reportType === 'vendas_por_vendedor' ? (
                                /* ===== RELATÓRIO: VENDAS POR VENDEDOR ===== */
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Vendedor</TableHead>
                                            <TableHead className="text-center">Qtd. Vendas</TableHead>
                                            <TableHead className="text-right">Total Vendas</TableHead>
                                            <TableHead className="text-right">Devoluções</TableHead>
                                            <TableHead className="text-right">Líquido</TableHead>
                                            <TableHead className="text-right">% do Líquido</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {data.map((v: any, i: number) => (
                                            <TableRow key={i}>
                                                <TableCell className="font-bold">{v.nome}</TableCell>
                                                <TableCell className="text-center">{v.qtd}</TableCell>
                                                <TableCell className="text-right font-bold">{fmt(v.total)}</TableCell>
                                                <TableCell className="text-right text-orange-600">{fmt(v.devolucoes)}</TableCell>
                                                <TableCell className="text-right font-bold text-emerald-600">{fmt(v.liquido)}</TableCell>
                                                <TableCell className="text-right text-muted-foreground">
                                                    {((v.liquido / (totals.liquido || 1)) * 100).toFixed(1)}%
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        <TableRow className="bg-primary/5 font-black">
                                            <TableCell colSpan={3} className="text-right text-sm">TOTAL</TableCell>
                                            <TableCell className="text-right text-sm text-orange-600">{fmt(totals.devolucoes || 0)}</TableCell>
                                            <TableCell className="text-right text-sm text-emerald-600">{fmt(totals.liquido || 0)}</TableCell>
                                            <TableCell className="text-right text-sm">100%</TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            ) : (reportType === 'contas_pagar' || reportType === 'contas_receber') ? (
                                /* ===== RELATÓRIO: CONTAS ===== */
                                <>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Descrição</TableHead>
                                            <TableHead>Cliente</TableHead>
                                            <TableHead>Vencimento</TableHead>
                                            <TableHead>Pagamento</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead className="text-right">Valor</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((v: any, i: number) => (
                                            <TableRow key={i}>
                                                <TableCell className="text-sm">{v.descricao || '---'}</TableCell>
                                                <TableCell className="text-sm">{v.clientes?.nome || '---'}</TableCell>
                                                <TableCell className="text-xs">{fmtDate(v.data_vencimento)}</TableCell>
                                                <TableCell className="text-xs">{fmtDate(v.data_pagamento)}</TableCell>
                                                <TableCell>
                                                    <Badge variant={v.status === 'Pago' ? 'default' : v.status === 'Vencido' ? 'destructive' : 'outline'} className="text-[10px]">
                                                        {v.status}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className={`text-right font-bold ${reportType === 'contas_receber' ? 'text-emerald-500' : 'text-red-500'}`}>
                                                    {fmt(v.valor)}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        <TableRow className="bg-primary/5 font-black">
                                            <TableCell colSpan={5} className="text-right text-sm">TOTAL</TableCell>
                                            <TableCell className={`text-right text-sm ${reportType === 'contas_receber' ? 'text-emerald-500' : 'text-red-500'}`}>
                                                {fmt(reportType === 'contas_pagar' ? totals.pagar : totals.receber)}
                                            </TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                                
                                {/* Paginação Contas */}
                                {(() => {
                                    const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE))
                                    const safePage = Math.min(page, totalPages)
                                    const start = (safePage - 1) * PAGE_SIZE
                                    const end = Math.min(start + PAGE_SIZE, data.length)
                                    if (data.length === 0) return null
                                    return (
                                        <div className="flex flex-wrap items-center justify-between gap-2 mt-3 px-1">
                                            <span className="text-xs text-muted-foreground">
                                                Mostrando <strong>{start + 1}</strong>–<strong>{end}</strong> de <strong>{data.length}</strong> contas
                                            </span>
                                            <div className="flex items-center gap-1">
                                                <Button size="sm" variant="outline" className="h-8 px-2" disabled={safePage <= 1} onClick={() => setPage(1)}>«</Button>
                                                <Button size="sm" variant="outline" className="h-8 px-2" disabled={safePage <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>‹ Anterior</Button>
                                                <span className="text-xs font-medium px-2">Página <strong>{safePage}</strong> de <strong>{totalPages}</strong></span>
                                                <Button size="sm" variant="outline" className="h-8 px-2" disabled={safePage >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Próxima ›</Button>
                                                <Button size="sm" variant="outline" className="h-8 px-2" disabled={safePage >= totalPages} onClick={() => setPage(totalPages)}>»</Button>
                                            </div>
                                        </div>
                                    )
                                })()}
                                </>
                            ) : reportType === 'fluxo_caixa' ? (
                                /* ===== RELATÓRIO: FLUXO DE CAIXA ===== */
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Mês</TableHead>
                                            <TableHead className="text-right text-emerald-500">Entradas</TableHead>
                                            <TableHead className="text-right text-red-500">Saídas</TableHead>
                                            <TableHead className="text-right">Saldo do Mês</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {data.map((m: any, i: number) => {
                                            const saldoMes = m.entradas - m.saidas
                                            return (
                                                <TableRow key={i}>
                                                    <TableCell className="font-bold">
                                                        {(() => {
                                                            const mesKey = typeof m.mes === 'string' && /^\d{4}-\d{2}/.test(m.mes) ? m.mes.slice(0, 7) : null
                                                            if (!mesKey) return '—'
                                                            const [year, month] = mesKey.split('-').map(Number)
                                                            if (!year || !month) return mesKey
                                                            return new Date(year, month - 1, 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' })
                                                        })()}
                                                    </TableCell>
                                                    <TableCell className="text-right text-emerald-500 font-bold">{fmt(m.entradas)}</TableCell>
                                                    <TableCell className="text-right text-red-500 font-bold">{fmt(m.saidas)}</TableCell>
                                                    <TableCell className={`text-right font-black ${saldoMes >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                                        {fmt(saldoMes)}
                                                    </TableCell>
                                                </TableRow>
                                            )
                                        })}
                                        <TableRow className="bg-primary/5 font-black text-sm">
                                            <TableCell>TOTAL PERÍODO</TableCell>
                                            <TableCell className="text-right text-emerald-500">{fmt(totals.entradas || 0)}</TableCell>
                                            <TableCell className="text-right text-red-500">{fmt(totals.saidas || 0)}</TableCell>
                                            <TableCell className={`text-right ${(totals.saldo || 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{fmt(totals.saldo || 0)}</TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            ) : reportType === 'contatos_por_atendente' ? (
                                <div className="space-y-8">
                                    {(() => {
                                        const pageData = data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
                                        const grouped = pageData.reduce((acc: any, curr: any) => {
                                            const key = curr.atendente_nome || 'Sem Atendente'
                                            if (!acc[key]) acc[key] = []
                                            acc[key].push(curr)
                                            return acc
                                        }, {})

                                        return Object.entries(grouped).map(([atendente, contacts]: [string, any]) => (
                                            <div key={atendente} className="space-y-3">
                                                <div className="flex items-center gap-2 border-b-2 border-primary/20 pb-2">
                                                    <Users className="w-5 h-5 text-primary" />
                                                    <h3 className="text-lg font-black text-slate-800">{atendente}</h3>
                                                    <Badge variant="secondary" className="ml-2 font-bold">{contacts.length} contatos</Badge>
                                                </div>
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow className="bg-slate-50/50">
                                                            <TableHead className="w-[60%]">Nome do Contato</TableHead>
                                                            <TableHead className="w-[40%]">Número / Telefone</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {contacts.map((c: any, idx: number) => (
                                                            <TableRow key={idx}>
                                                                <TableCell className="font-medium py-2">{c.nome}</TableCell>
                                                                <TableCell className="font-mono text-xs py-2">{c.telefone}</TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                        ))
                                    })()}
                                    
                                    {/* Paginação Contatos */}
                                    {(() => {
                                        const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE))
                                        const safePage = Math.min(page, totalPages)
                                        const start = (safePage - 1) * PAGE_SIZE
                                        const end = Math.min(start + PAGE_SIZE, data.length)
                                        if (data.length === 0) return null
                                        return (
                                            <div className="flex flex-wrap items-center justify-between gap-2 mt-3 px-1">
                                                <span className="text-xs text-muted-foreground">
                                                    Mostrando <strong>{start + 1}</strong>–<strong>{end}</strong> de <strong>{data.length}</strong> contatos
                                                </span>
                                                <div className="flex items-center gap-1">
                                                    <Button size="sm" variant="outline" className="h-8 px-2" disabled={safePage <= 1} onClick={() => setPage(1)}>«</Button>
                                                    <Button size="sm" variant="outline" className="h-8 px-2" disabled={safePage <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>‹ Anterior</Button>
                                                    <span className="text-xs font-medium px-2">Página <strong>{safePage}</strong> de <strong>{totalPages}</strong></span>
                                                    <Button size="sm" variant="outline" className="h-8 px-2" disabled={safePage >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Próxima ›</Button>
                                                    <Button size="sm" variant="outline" className="h-8 px-2" disabled={safePage >= totalPages} onClick={() => setPage(totalPages)}>»</Button>
                                                </div>
                                            </div>
                                        )
                                    })()}
                                </div>
                            ) : null
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
