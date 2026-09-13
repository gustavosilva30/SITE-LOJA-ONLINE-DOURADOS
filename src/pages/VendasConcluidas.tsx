import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Modal } from "@/components/ui/modal"
import { Search, Filter, MoreHorizontal, ShoppingCart, TrendingUp, Trash2, Printer, Truck, Pencil, Package, DollarSign, X, Plus, FileText, RotateCcw, Info } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { toast } from "sonner"
import { vendasApi, configuracoesApi } from "@/lib/api"
import { fmt, fmtDate, fmtDateTime, formatNumPedido, parcelasCupomSuffix } from "@/lib/format"
import { useAuthStore } from "@/store/authStore"
import { hasCrmPathAccess } from "@/config/crmRoutePermissions"
import { logAcao } from "@/lib/systemLog"
import { precoUnitarioEfetivoVendaItem } from "@/lib/vendaItemPricing"
import { VendaEdicaoAvancadaModal } from "@/components/VendaEdicaoAvancadaModal"

function parseHistoricoEdicao(raw: unknown): { em: string; por?: string; detalhes: string }[] {
    if (Array.isArray(raw)) return raw as { em: string; por?: string; detalhes: string }[]
    if (typeof raw === 'string') {
        try {
            const j = JSON.parse(raw)
            return Array.isArray(j) ? j : []
        } catch {
            return []
        }
    }
    return []
}

interface Venda {
    id: string
    numero_pedido?: number
    cliente_id: string | null
    total: number
    status: 'Pendente' | 'Pago' | 'Enviado' | 'Entregue' | 'Cancelado' | 'Devolvido' | 'Pagamento Parcial' | 'Boleto a Receber' | 'A Receber' | 'Concluída'
    origem_ml: boolean
    ml_order_id: string | null
    data_venda: string
    created_at: string
    total_pago?: number
    valor_aberto?: number
    valor_devolvido?: number
    clientes?: { nome: string, documento?: string, email?: string, telefone?: string, endereco?: string, saldo_haver?: number }
    atendentes?: { nome: string }
    vendedor?: { nome: string }
    atendente?: { nome: string }
    vendas_itens?: { produtos: { id?: string, nome: string, sku?: string } }[]
    forma_pagamento?: string
    parcelas?: number | null
    pix_nome_pagador?: string | null
    atendente_id?: string
    itens?: any[]
    observacao?: string | null
    historico_edicao?: { em: string; por?: string; detalhes: string }[]
}

export function VendasConcluidas() {
    const { atendente, initialized } = useAuthStore()
    const podeEditarVendas = hasCrmPathAccess('/vendas/editar', atendente)
    const podeEdicaoAvancada = hasCrmPathAccess('/admin', atendente) || (atendente as any)?.perm_edicao_venda_finalizada
    const [searchTerm, setSearchTerm] = useState("")
    const [vendas, setVendas] = useState<Venda[]>([])
    const [loading, setLoading] = useState(true)
    const navigate = useNavigate()

    const [filterStatus, setFilterStatus] = useState<string>("todos")
    const [filterOrigem, setFilterOrigem] = useState<string>("todos")
    /** Padrão: vendas do dia (local). Limpar filtros volta a este intervalo. */
    const [filterDataInicio, setFilterDataInicio] = useState<string>(() => new Date().toLocaleDateString("en-CA"))
    const [filterDataFim, setFilterDataFim] = useState<string>(() => new Date().toLocaleDateString("en-CA"))
    const [isFilterOpen, setIsFilterOpen] = useState(false)

    const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false)
    const [selectedVendaForReceipt, setSelectedVendaForReceipt] = useState<any>(null)
    const [submitting, setSubmitting] = useState(false)

    const [transportadoras, setTransportadoras] = useState<any[]>([])
    const [company, setCompany] = useState<any>(null)
    const [printFormat, setPrintFormat] = useState<'a4' | 'a5' | 'cupom' | 'cupom58'>('a4')
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [isQuitarModalOpen, setIsQuitarModalOpen] = useState(false)
    const [vendaParaQuitar, setVendaParaQuitar] = useState<Venda | null>(null)
    const [quitarGerarFatura, setQuitarGerarFatura] = useState(true)
    const [quitarParcelas, setQuitarParcelas] = useState<any[]>([])
    const [quitarPixNomePagador, setQuitarPixNomePagador] = useState('')
    const [isObservacaoModalOpen, setIsObservacaoModalOpen] = useState(false)
    const [vendaParaObservacao, setVendaParaObservacao] = useState<Venda | null>(null)
    const [observacaoText, setObservacaoText] = useState("")
    const [isDetalhesModalOpen, setIsDetalhesModalOpen] = useState(false)
    const [detalhesVenda, setDetalhesVenda] = useState<{ venda: any; itensFicaram: any[]; itensDevolvidos: any[] } | null>(null)
    const [loadingDetalhes, setLoadingDetalhes] = useState(false)
    const [isEdicaoAvancadaModalOpen, setIsEdicaoAvancadaModalOpen] = useState(false)
    const [vendaEdicaoAvancada, setVendaEdicaoAvancada] = useState<Venda | null>(null)

    const [currentPage, setCurrentPage] = useState(0)
    const [hasMore, setHasMore] = useState(false)

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
    }
    const toggleSelectAll = () => {
        if (selectedIds.length === filteredVendas.length && filteredVendas.length > 0) {
            setSelectedIds([])
        } else {
            setSelectedIds(filteredVendas.map(v => v.id))
        }
    }

    const handleBulkCancel = async () => {
        if (!confirm(`Tem certeza que deseja cancelar ${selectedIds.length} pedidos concluídos?`)) return
        setSubmitting(true)
        try {
            // Processa cancelamentos em paralelo
            await Promise.all(selectedIds.map(id => vendasApi.cancelar(id)))
            
            // Atualização Instantânea na UI
            setVendas(prev => prev.filter(v => !selectedIds.includes(v.id)))
            
            logAcao('vendas_concluidas.cancelar_lote', `${selectedIds.length} pedido(s) cancelado(s)`, atendente?.id)
            toast.success('Pedidos cancelados com sucesso.')
            setSelectedIds([])
            
            // Refetch em background
            void fetchVendas()
        } catch (err: any) {
            toast.error('Erro ao cancelar pedidos (alguns podem ter falhado): ' + err.message)
            void fetchVendas()
        } finally {
            setSubmitting(false)
        }
    }

    const fetchVendas = useCallback(async () => {
        setLoading(true)
        try {
            const statusConcluidos = 'Pago,Enviado,Entregue,Cancelado,Pagamento Parcial,Boleto a Receber,A Receber,Concluída,Devolvido'
            const limit = 30
            const rows = await vendasApi.listar({
                status_in: statusConcluidos,
                status: filterStatus === "todos" ? undefined : filterStatus,
                origem_ml: filterOrigem === "todos" ? undefined : filterOrigem === "ml",
                data_inicio: filterDataInicio || undefined,
                data_fim: filterDataFim || undefined,
                q: searchTerm || undefined,
                limit,
                offset: currentPage * limit,
            })

            setVendas((rows || []).map((v: any) => ({
                ...v,
                valor_aberto: Math.max(0, Number(v.total || 0) - Number(v.valor_devolvido || 0) - Number(v.total_pago || 0)),
                historico_edicao: parseHistoricoEdicao(v.historico_edicao),
            })))
            setHasMore((rows || []).length === limit)
        } catch (err: any) {
            console.error('Error fetching vendas:', err)
            setVendas([])
            setHasMore(false)
        } finally {
            setLoading(false)
        }
    }, [filterDataInicio, filterDataFim, filterStatus, filterOrigem, searchTerm, currentPage])

    const fetchResources = useCallback(async () => {
        const [carriers, comp] = await Promise.allSettled([
            configuracoesApi.listarTransportadoras(),
            configuracoesApi.obter(),
        ])
        if (carriers.status === 'fulfilled' && carriers.value) setTransportadoras(carriers.value)
        if (comp.status === 'fulfilled' && comp.value) setCompany(comp.value)
    }, [])

    useEffect(() => {
        setCurrentPage(0)
    }, [filterDataInicio, filterDataFim, filterStatus, filterOrigem, searchTerm])

    useEffect(() => {
        if (!initialized) return
        void Promise.all([fetchVendas(), fetchResources()])
    }, [initialized, fetchVendas, fetchResources])

    const handleCancelVenda = async (id: string) => {
        const venda = vendas.find(v => v.id === id);
        if (!venda) return;

        if (!confirm('Deseja realmente CANCELAR esta venda? Isso devolverá os produtos ao estoque e ESTORNARÁ pagamentos (Saldo Caixa ou Haver Cliente).')) return;

        setSubmitting(true);
        try {
            await vendasApi.cancelar(id);
            
            // Atualização Instantânea na UI
            setVendas(prev => prev.filter(v => v.id !== id));
            
            // Log e Refetch em background
            void (async () => {
                logAcao('venda.cancelar', `Venda #${formatNumPedido(venda.numero_pedido)} cancelada (estorno)`, atendente?.id)
                await fetchVendas();
            })();

            toast.success('Venda cancelada e valores estornados com sucesso.');
        } catch (e: any) {
            console.error('Erro ao cancelar:', e);
            toast.error('Erro ao cancelar: ' + e.message);
            void fetchVendas(); // Garante consistência em caso de erro
        } finally {
            setSubmitting(false);
        }
    }

    const handleQuitarVenda = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!vendaParaQuitar) return
        setSubmitting(true)
        let vendaIdQuitada: string | null = null
        try {
            const pixNome = quitarPixNomePagador.trim()
            const podeRegistrarPagadorPix =
                (vendaParaQuitar.forma_pagamento || '').toLowerCase().includes('pix') ||
                vendaParaQuitar.status === 'A Receber' ||
                vendaParaQuitar.status === 'Boleto a Receber'

            const incluirPagadorNaParcela =
                pixNome && (vendaParaQuitar.forma_pagamento || '').toLowerCase().includes('pix')

            const parcelas = quitarGerarFatura
                ? quitarParcelas.map((p, idx) => ({
                    tipo: 'Receita',
                    valor: p.valor,
                    data_vencimento: p.vencimento,
                    status: 'Pendente',
                    forma_pagamento: vendaParaQuitar.forma_pagamento,
                    descricao: `Parcela ${idx + 1}/${quitarParcelas.length} - Venda #${formatNumPedido(vendaParaQuitar.numero_pedido)}${incluirPagadorNaParcela ? ` — Pagador PIX: ${pixNome}` : ''}`
                }))
                : []

            await vendasApi.quitar(vendaParaQuitar.id, {
                status: 'Pago',
                historico_entry: {
                    em: new Date().toISOString(),
                    por: atendente?.nome,
                    detalhes: 'Venda quitada (pagamento registrado; status → Pago)',
                },
                pix_nome_pagador: podeRegistrarPagadorPix ? (pixNome || null) : undefined,
                gerar_fatura: quitarGerarFatura,
                parcelas,
            })

            logAcao('venda.quitar', `Venda #${formatNumPedido(vendaParaQuitar.numero_pedido)} quitada`, atendente?.id)
            vendaIdQuitada = vendaParaQuitar.id
            setIsQuitarModalOpen(false)
            fetchVendas()
        } catch (err: any) {
            alert('Erro ao quitar: ' + err.message)
        } finally {
            setSubmitting(false)
        }
        if (vendaIdQuitada) {
            await new Promise(resolve => setTimeout(resolve, 500))
            await handleOpenReceipt(vendaIdQuitada, { autoPrint: true })
        }
    }

    const startQuitar = (v: Venda) => {
        setVendaParaQuitar(v)
        setQuitarParcelas([{ id: Math.random(), valor: v.total, vencimento: new Date().toISOString().split('T')[0] }])
        setQuitarPixNomePagador(v.pix_nome_pagador || '')
        setIsQuitarModalOpen(true)
    }

    const openObservacaoModal = (venda: Venda) => {
        setVendaParaObservacao(venda)
        setObservacaoText(venda.observacao || "")
        setIsObservacaoModalOpen(true)
    }

    const handleSaveObservacao = async () => {
        if (!vendaParaObservacao) return
        setSubmitting(true)
        try {
            await vendasApi.atualizarObservacao(vendaParaObservacao.id, observacaoText.trim() || null)
            setVendas(prev => prev.map(v => v.id === vendaParaObservacao.id ? { ...v, observacao: observacaoText.trim() || null } : v))
            logAcao('venda.observacao', `Obs. venda #${formatNumPedido(vendaParaObservacao.numero_pedido)}`, atendente?.id)
            setIsObservacaoModalOpen(false)
            setVendaParaObservacao(null)
        } catch (err: any) {
            alert('Erro ao salvar observação: ' + err.message)
        } finally {
            setSubmitting(false)
        }
    }

    const openDetalhesVenda = async (venda: Venda) => {
        setLoadingDetalhes(true)
        setIsDetalhesModalOpen(true)
        setDetalhesVenda(null)
        try {
            const [vf, itensDevolvidos] = await Promise.all([
                vendasApi.detalheCompleto(venda.id),
                vendasApi.devolucoesItens(venda.id),
            ])

            const itens = vf?.itens || []
            const devolvidoPorItem = new Map<string, number>()
            for (const d of itensDevolvidos) {
                const key = d.venda_item_id || ''
                if (key) devolvidoPorItem.set(key, (devolvidoPorItem.get(key) || 0) + (d.quantidade || 0))
            }
            const itensFicaram = (itens || []).map((vi: any) => {
                const devQty = devolvidoPorItem.get(vi.id) || 0
                const qtyFicou = Math.max(0, (vi.quantidade || 0) - devQty)
                const unitEfetivo = precoUnitarioEfetivoVendaItem(vi)
                const subtotalFicou = Math.round((qtyFicou * unitEfetivo + Number.EPSILON) * 100) / 100
                return { ...vi, quantidade_original: vi.quantidade, devolvido: devQty, quantidade: qtyFicou, subtotal: subtotalFicou }
            }).filter((vi: any) => vi.quantidade > 0)
            const itensDevolvidosAgrupados = itensDevolvidos.reduce((acc: any[], d: any) => {
                const prod = (d as any).produtos?.nome || 'Produto'
                const sku = (d as any).produtos?.sku
                const existing = acc.find(x => x.produto_id === d.produto_id)
                if (existing) {
                    existing.quantidade += d.quantidade || 0
                    existing.subtotal += d.subtotal || 0
                } else {
                    acc.push({
                        produto_id: d.produto_id,
                        quantidade: d.quantidade || 0,
                        subtotal: d.subtotal || 0,
                        preco_unitario: d.preco_unitario,
                        produtos: { nome: prod, sku }
                    })
                }
                return acc
            }, [])
            setDetalhesVenda({
                venda: {
                    ...venda,
                    valor_devolvido: vf?.valor_devolvido ?? venda.valor_devolvido ?? 0,
                    status: (vf?.status as Venda['status']) ?? venda.status,
                    historico_edicao: parseHistoricoEdicao(vf?.historico_edicao ?? venda.historico_edicao),
                    ...(vf ? { historico_edicao: parseHistoricoEdicao(vf.historico_edicao) } : {}),
                },
                itensFicaram,
                itensDevolvidos: itensDevolvidosAgrupados
            })
        } catch (e: any) {
            console.error(e)
            alert('Erro ao carregar detalhes: ' + (e.message || e))
        } finally {
            setLoadingDetalhes(false)
        }
    }

    const handleOpenReceipt = async (vendaId: string, opts?: { autoPrint?: boolean }) => {
        if (!vendaId) return
        setLoading(true)
        try {
            const [venda, itensDevolvidos] = await Promise.all([
                vendasApi.detalheCompleto(vendaId),
                vendasApi.devolucoesItens(vendaId),
            ])

            const devolvidoPorItem = new Map<string, number>()
            for (const d of itensDevolvidos) {
                const key = d.venda_item_id || ''
                if (key) {
                    devolvidoPorItem.set(key, (devolvidoPorItem.get(key) || 0) + (d.quantidade || 0))
                }
            }

            setSelectedVendaForReceipt({
                ...venda,
                valor_aberto: Math.max(0, Number(venda.total || 0) - Number(venda.valor_devolvido || 0) - Number(venda.total_pago || 0)),
                itens: (venda.itens || []).map((i: any) => {
                    const devQty = devolvidoPorItem.get(i.id) || 0
                    return {
                        ...i,
                        produtos: i.produtos || {},
                        quantidade_devolvida: devQty,
                        foi_devolvido: devQty >= i.quantidade,
                    }
                }),
                entrega: venda.entrega || null,
            })
            setIsReceiptModalOpen(true)
            if (opts?.autoPrint) {
                window.setTimeout(() => { window.print() }, 700)
            }
        } catch (err: any) {
            console.error('Error loading receipt:', err)
            alert('Não foi possível carregar o pedido.')
        } finally {
            setLoading(false)
        }
    }



    const filteredVendas = vendas

    const faturamentoTotal = vendas.filter(v => v.status !== 'Cancelado' && v.status !== 'Devolvido').reduce((acc, v) => acc + ((v.total || 0) - (v.valor_devolvido || 0)), 0)

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Histórico de Vendas</h1>
                    <p className="text-muted-foreground mt-1">Vendas finalizadas, enviadas ou canceladas.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="border-primary/20 bg-primary/5">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Faturamento Bruto</CardTitle>
                        <TrendingUp className="w-4 h-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-primary">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(faturamentoTotal)}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Total Concluídos</CardTitle>
                        <ShoppingCart className="w-4 h-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{filteredVendas.length} pedidos</div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between gap-4">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Buscar venda..." className="pl-9" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                        </div>
                        <div className="flex items-center gap-2">
                            {selectedIds.length > 0 && (
                                <div className="flex items-center gap-2 mr-4 bg-muted p-1 px-2 rounded-md border text-sm font-medium animate-in fade-in slide-in-from-left-2">
                                    <span className="text-xs text-muted-foreground">{selectedIds.length} selecionados</span>
                                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10" onClick={handleBulkCancel}>
                                        <Trash2 className="w-3 h-3 mr-1" /> Cancelar
                                    </Button>
                                </div>
                            )}
                            <Button variant="outline" className="gap-2" onClick={() => setIsFilterOpen(!isFilterOpen)}>
                                <Filter className="w-4 h-4" /> Filtros
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {isFilterOpen && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-4 mb-6 p-4 border rounded-lg bg-muted/20">
                            <select
                                value={filterStatus}
                                onChange={e => setFilterStatus(e.target.value)}
                                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            >
                                <option value="todos">Todos os status</option>
                                <option value="Pago">Pago</option>
                                <option value="Concluída">Concluída</option>
                                <option value="Enviado">Enviado</option>
                                <option value="Entregue">Entregue</option>
                                <option value="Boleto a Receber">Boleto a Receber</option>
                                <option value="A Receber">A Receber</option>
                                <option value="Devolvido">Devolvido</option>
                                <option value="Cancelado">Cancelado</option>
                            </select>
                            <select
                                value={filterOrigem}
                                onChange={e => setFilterOrigem(e.target.value)}
                                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            >
                                <option value="todos">Todas as origens</option>
                                <option value="ml">Mercado Livre</option>
                                <option value="loja">Loja</option>
                            </select>
                            <Input type="date" value={filterDataInicio || ""} onChange={e => setFilterDataInicio(e.target.value)} />
                            <Input type="date" value={filterDataFim || ""} onChange={e => setFilterDataFim(e.target.value)} />
                            <Button
                                variant="ghost"
                                onClick={() => {
                                    setFilterStatus("todos")
                                    setFilterOrigem("todos")
                                    setFilterDataInicio("")
                                    setFilterDataFim("")
                                    setSearchTerm("")
                                }}
                            >
                                Limpar
                            </Button>
                        </div>
                    )}

                    <div className="overflow-x-auto w-full">
                        <Table className="w-full min-w-[640px]">
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-10 shrink-0">
                                        <input
                                            type="checkbox"
                                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                                            checked={filteredVendas.length > 0 && selectedIds.length === filteredVendas.length}
                                            onChange={toggleSelectAll}
                                            aria-label="Selecionar todos os pedidos"
                                        />
                                    </TableHead>
                                    <TableHead className="w-20 shrink-0">Pedido</TableHead>
                                    <TableHead className="min-w-0 max-w-[120px]">Cliente</TableHead>
                                    <TableHead className="w-20 shrink-0 hidden sm:table-cell">Vendedor</TableHead>
                                    <TableHead className="min-w-0 max-w-[140px] hidden md:table-cell">Produtos</TableHead>
                                    <TableHead className="w-24 shrink-0">Total</TableHead>
                                    <TableHead className="w-20 shrink-0 hidden lg:table-cell">Status</TableHead>
                                    <TableHead className="w-20 shrink-0 hidden lg:table-cell">Pago/Aberto</TableHead>
                                    <TableHead className="w-14 shrink-0 sticky right-0 bg-muted/80 backdrop-blur-sm z-10 border-l">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow><TableCell colSpan={9} className="text-center">Carregando...</TableCell></TableRow>
                                ) : filteredVendas.length === 0 ? (
                                    <TableRow><TableCell colSpan={9} className="text-center">Nenhuma venda encontrada.</TableCell></TableRow>
                                ) : filteredVendas.map((venda) => (
                                    <TableRow key={venda.id} className={selectedIds.includes(venda.id) ? 'bg-muted/50' : ''}>
                                        <TableCell className="shrink-0">
                                            <input
                                                type="checkbox"
                                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                                                checked={selectedIds.includes(venda.id)}
                                                onChange={() => toggleSelect(venda.id)}
                                                aria-label={`Selecionar pedido ${formatNumPedido(venda.numero_pedido)}`}
                                            />
                                        </TableCell>
                                        <TableCell className="font-mono text-xs shrink-0 max-w-[100px]">
                                            <div>#{formatNumPedido(venda.numero_pedido)}</div>
                                            <div className="text-[10px] text-muted-foreground font-sans font-normal normal-case" title="Data da venda (permanece no dia em que foi criada/concluída)">{fmtDate(venda.data_venda)}</div>
                                            {Array.isArray(venda.historico_edicao) && venda.historico_edicao.length > 0 && (
                                                <div
                                                    className="text-[10px] text-amber-800 font-sans font-normal normal-case truncate max-w-[100px]"
                                                    title={venda.historico_edicao.slice(-5).map((h) => `${fmtDateTime(h.em)}${h.por ? ` · ${h.por}` : ''}: ${h.detalhes}`).join('\n')}
                                                >
                                                    {venda.historico_edicao.length} registo(s)
                                                    {(venda.valor_devolvido || 0) > 0 && (
                                                        <span className="block text-rose-700 truncate" title="Inclui devolução processada">· devolução</span>
                                                    )}
                                                </div>
                                            )}
                                        </TableCell>
                                        <TableCell className="truncate max-w-[120px] text-sm" title={venda.clientes?.nome || 'Consumidor Final'}>{venda.clientes?.nome || 'Consumidor Final'}</TableCell>
                                        <TableCell className="text-xs shrink-0 hidden sm:table-cell" title={venda.vendedor?.nome || venda.atendentes?.nome || ''}>
                                            {venda.vendedor?.nome || venda.atendentes?.nome || venda.atendente?.nome || '-'}
                                        </TableCell>
                                        <TableCell className="truncate max-w-[140px] text-xs hidden md:table-cell" title={venda.vendas_itens?.map((i: any) => i.produtos?.nome).join(', ')}>
                                            {venda.vendas_itens?.map((i: any) => i.produtos?.nome).join(', ') || '-'}
                                        </TableCell>
                                        <TableCell className="shrink-0">
                                            <div className="text-xs font-bold">
                                                {(venda.valor_devolvido || 0) > 0 ? (
                                                    <span title={`Devolução: ${fmt(venda.valor_devolvido!)}`}>{fmt(venda.total - (venda.valor_devolvido || 0))}</span>
                                                ) : fmt(venda.total)}
                                            </div>
                                            {(venda.valor_devolvido || 0) > 0 && (
                                                <div className="text-[10px] text-rose-600">-{fmt(venda.valor_devolvido!)}</div>
                                            )}
                                        </TableCell>
                                        <TableCell className="shrink-0 hidden lg:table-cell">
                                            <Badge
                                                variant={(venda.status === 'Cancelado' || venda.status === 'Devolvido') ? 'destructive' : venda.status === 'Pagamento Parcial' ? 'outline' : 'default'}
                                                className={`text-[10px] ${
                                                    venda.status === 'Pagamento Parcial' ? "border-orange-500 text-orange-600 bg-orange-50" :
                                                        (venda.status === 'Pago' || venda.status === 'Entregue' || venda.status === 'Concluída') ? "bg-emerald-500 hover:bg-emerald-600" :
                                                            (venda.status === 'Boleto a Receber' || venda.status === 'A Receber') ? "bg-blue-500 hover:bg-blue-600 text-white border-none" :
                                                                venda.status === 'Devolvido' ? "bg-orange-500 hover:bg-orange-600" : ""
                                                }`}
                                            >
                                                {venda.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-[11px] shrink-0 hidden lg:table-cell">
                                            <span className="text-emerald-600">{fmt(venda.total_pago || 0)}</span>
                                            {(venda.valor_aberto || 0) > 0 && <span className="text-rose-600 block">Abr: {fmt(venda.valor_aberto!)}</span>}
                                        </TableCell>
                                        <TableCell className={`sticky right-0 shrink-0 w-14 border-l pl-1 z-10 ${selectedIds.includes(venda.id) ? 'bg-muted/50' : 'bg-card'}`}>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Ações"><MoreHorizontal className="w-4 h-4" /></Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="min-w-[180px]">
                                                    <DropdownMenuItem onClick={() => openDetalhesVenda(venda)}><Info className="w-4 h-4 mr-2" /> Detalhes</DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => openObservacaoModal(venda)}><FileText className="w-4 h-4 mr-2" /> {venda.observacao ? 'Editar observação' : 'Adicionar observação'}</DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleOpenReceipt(venda.id)}><Printer className="w-4 h-4 mr-2" /> Imprimir</DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => navigate(`/fiscal?venda_id=${encodeURIComponent(venda.id)}`)}><FileText className="w-4 h-4 mr-2" /> Emitir nota fiscal</DropdownMenuItem>
                                                    {podeEdicaoAvancada && (
                                                        <DropdownMenuItem onClick={() => { setVendaEdicaoAvancada(venda); setIsEdicaoAvancadaModalOpen(true); }}><Pencil className="w-4 h-4 mr-2 text-amber-500" /> Edição Avançada</DropdownMenuItem>
                                                    )}
                                                    {(venda.status === 'Boleto a Receber' || venda.status === 'A Receber') && (
                                                        <DropdownMenuItem onClick={() => startQuitar(venda)}><DollarSign className="w-4 h-4 mr-2" /> Quitar Venda</DropdownMenuItem>
                                                    )}
                                                    {podeEditarVendas && <DropdownMenuItem onClick={() => navigate(`/vendas?edit=${venda.id}`)}><Pencil className="w-4 h-4 mr-2" /> Editar</DropdownMenuItem>}
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        <div className="flex flex-wrap items-center justify-between gap-3 px-2 py-3 border-t">
                            <span className="text-xs text-muted-foreground">
                                {!loading && vendas.length > 0
                                    ? `Página ${currentPage + 1} · ${filteredVendas.length} linha(s) visíveis neste lote`
                                    : null}
                            </span>
                            <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm" disabled={currentPage === 0 || loading} onClick={() => setCurrentPage((p) => p - 1)}>
                                    Anterior
                                </Button>
                                <span className="text-sm text-muted-foreground">Página {currentPage + 1}</span>
                                <Button variant="outline" size="sm" disabled={!hasMore || loading} onClick={() => setCurrentPage((p) => p + 1)}>
                                    Próxima
                                </Button>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Modal isOpen={isReceiptModalOpen} onClose={() => setIsReceiptModalOpen(false)} title="Impressão de Venda" className="max-w-4xl">
                {selectedVendaForReceipt && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center bg-muted/50 p-2 rounded-lg no-print">
                            <div className="flex gap-2">
                                <Button
                                    variant={printFormat === 'a4' ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => setPrintFormat('a4')}
                                    className="h-8"
                                >
                                    Papel A4
                                </Button>
                                <Button
                                    variant={printFormat === 'a5' ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => setPrintFormat('a5')}
                                    className="h-8"
                                >
                                    Papel A5
                                </Button>
                                <Button
                                    variant={printFormat === 'cupom' ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => setPrintFormat('cupom')}
                                    className="h-8"
                                >
                                    Cupom (80mm)
                                </Button>
                                <Button
                                    variant={printFormat === 'cupom58' ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => setPrintFormat('cupom58')}
                                    className="h-8"
                                >
                                    Cupom (58mm)
                                </Button>
                            </div>
                            <Button onClick={() => window.print()} className="bg-primary hover:bg-primary/90">
                                <Printer className="w-4 h-4 mr-2" /> Imprimir Agora
                            </Button>
                        </div>

                        <div className="bg-slate-100 p-8 overflow-auto max-h-[70vh] rounded-lg border border-slate-200 print-wrapper">
                            <style>{`
                                 @import url('https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&display=swap');
 
                                 .print-preview-container { 
                                     background-color: #ffffff !important; 
                                     color: #000000 !important;
                                     margin-left: auto;
                                     margin-right: auto;
                                     box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                                     overflow: visible;
                                     min-height: 100px;
                                 }
 
                                 /* Reset Geral para Impressão */
                                 @media print {
                                     @page { margin: 5mm; size: auto; }
                                     body { background: white !important; margin: 0 !important; color: black !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                                     .no-print { display: none !important; }
                                     
                                     /* Esconder tudo exceto o conteúdo visível */
                                     #root, .modal-backdrop, [role="dialog"] > div:first-child { 
                                         display: none !important; 
                                     }

                                     .fixed.inset-0 { 
                                         position: static !important; 
                                         display: block !important; 
                                         padding: 0 !important; 
                                     }

                                     .print-wrapper {
                                         background: transparent !important;
                                         padding: 0 !important;
                                         margin: 0 !important;
                                         border: none !important;
                                         max-height: none !important;
                                         overflow: visible !important;
                                     }

                                      .modal-container { 
                                          position: static !important;
                                          width: 100% !important;
                                          height: auto !important;
                                          margin: 0 !important;
                                          padding: 0 !important;
                                          box-shadow: none !important;
                                          border: none !important;
                                          background: white !important;
                                          max-width: none !important;
                                      }

                                     .modal-body {
                                         padding: 0 !important;
                                         margin: 0 !important;
                                         max-height: none !important;
                                         overflow: visible !important;
                                     }

                                     .print-preview-container { 
                                         width: 100% !important;
                                         max-width: 100% !important;
                                         margin: 0 !important;
                                         padding: 0 !important;
                                         box-shadow: none !important;
                                         border: none !important;
                                     }
                                     
                                     .a4, .a5, .cupom, .cupom58 { 
                                         width: 100% !important; 
                                         min-height: 0 !important; 
                                         padding: 0 !important; 
                                         margin: 0 !important;
                                         border: none !important;
                                     }

                                     .max-h-[70vh], .overflow-auto { 
                                         max-height: none !important; 
                                         overflow: visible !important; 
                                         padding: 0 !important;
                                         margin: 0 !important;
                                     }
                                 }

                                 /* Contêineres de Formato com Escalonamento Fluido */
                                 .a4 { 
                                     width: 100%; 
                                     max-width: 210mm;
                                     min-height: 297mm; 
                                     padding: 10mm; 
                                     font-size: 11pt;
                                     --base-font: 11pt;
                                 }
                                 .a5 { 
                                     width: 148mm; 
                                     min-height: 210mm; 
                                     padding: 8mm; 
                                     font-size: 9pt;
                                     --base-font: 9pt;
                                 }
                                 .cupom { 
                                     width: 80mm; 
                                     padding: 4mm; 
                                     font-size: 10pt;
                                     --base-font: 10pt;
                                     font-family: 'Courier Prime', monospace;
                                 }
                                 .cupom58 { 
                                     width: 58mm; 
                                     padding: 2mm; 
                                     font-size: 8pt;
                                     --base-font: 8pt;
                                     font-family: 'Courier Prime', monospace;
                                 }

                                 .a4, .a5, .cupom, .cupom58 {
                                     font-family: 'Inter', sans-serif;
                                     background: white;
                                     margin: 0 auto;
                                     color: #000;
                                     box-sizing: border-box;
                                 }

                                 /* Estilos Responsivos Compartilhados */
                                 .formal-header { 
                                     border-bottom: 2px solid #000; 
                                     padding: 10px 0; 
                                     display: flex; 
                                     align-items: center; 
                                     justify-content: space-between; 
                                     margin-bottom: 15px; 
                                 }

                                 /* A5 Specific Compaction */
                                 .a5 .formal-header { margin-bottom: 8px; padding: 5px 0; }
                                 .a5 .delivery-box { padding: 4px !important; margin-bottom: 8px !important; margin-top: 8px !important; border: 1px solid #000 !important; }
                                 .a5 .delivery-box .text-lg { font-size: 11px !important; }
                                 .a5 .delivery-box .text-base { font-size: 10px !important; }
                                 .a5 .delivery-box .text-sm { font-size: 9px !important; }
                                 .a5 .mt-10 { margin-top: 10px !important; }
                                 .a5 .mt-8 { margin-top: 8px !important; }
                                 .formal-table { width: 100%; border-collapse: collapse; margin-top: 10px; table-layout: fixed; }
                                 .formal-table th { 
                                     text-align: left; 
                                     font-size: calc(var(--base-font) * 0.85); 
                                     border-bottom: 2px solid #000; 
                                     padding: 5px 2px;
                                     text-transform: uppercase; 
                                 }
                                 .formal-table td { 
                                     padding: 6px 2px; 
                                     font-size: var(--base-font); 
                                     border-bottom: 1px dotted #ccc; 
                                 }
                                 .formal-section { border-top: 2px solid #000; margin-top: 15px; padding-top: 5px; }
                                 .formal-label { font-size: calc(var(--base-font) * 0.75); font-weight: bold; text-transform: uppercase; }
                                 
                                 /* Estilos específicos para Cupom */
                                 .ticket-line { border-top: 1px dashed #000; margin: 4px 0; }
                                 .ticket-double-line { border-top: 3px double #000; margin: 6px 0; }
                                 .ticket-header { text-align: center; margin-bottom: 10px; }
                                 .ticket-title { font-weight: 800; text-align: center; text-transform: uppercase; margin: 8px 0; font-size: 1.2em; }
                                 .ticket-content { width: 100%; }
                             `}</style>

                            <div className={`print-preview-container ${printFormat}`}>
                                {printFormat.includes('cupom') ? (
                                    /* LAYOUT TICKET TÉRMICO */
                                    <div className="ticket-content">
                                        <div className="ticket-header">
                                            <p className="font-bold text-lg">{company?.nome_fantasia || 'Dourados Auto Peças'}</p>
                                            <p>CNPJ: 21.894.110/0001-14</p>
                                            <p>Av. Marcelino Pires, 5235</p>
                                            <p>Dourados - MS</p>
                                            <p>TEL: {company?.telefone || '(67) 3424-3068 / (67) 9 9910-0220'}</p>
                                            <p>Vendedor: {selectedVendaForReceipt.vendedor?.nome || selectedVendaForReceipt.atendente?.nome || selectedVendaForReceipt.atendentes?.nome || 'N/A'}</p>
                                        </div>

                                        <div className="ticket-double-line" />
                                        <div className="ticket-title">VENDA Nº {formatNumPedido(selectedVendaForReceipt.numero_pedido)}</div>
                                        <div className="ticket-double-line" />

                                        <div className="grid grid-cols-2 text-[11px] mb-2">
                                            <div>Data: {new Date(selectedVendaForReceipt.data_venda).toLocaleDateString()}</div>
                                            {selectedVendaForReceipt.entrega && <div className="text-right">Entrega: ATIVA</div>}
                                        </div>

                                        <div className="space-y-0.5 mb-2 text-black">
                                            <p><span className="font-bold">Cliente:</span> {selectedVendaForReceipt.clientes?.nome || 'CONSUMIDOR'}</p>
                                            <p><span className="font-bold">Telefone:</span> {selectedVendaForReceipt.clientes?.telefone || '---'}</p>
                                            <p><span className="font-bold">Vendedor:</span> {selectedVendaForReceipt.vendedor?.nome || selectedVendaForReceipt.atendentes?.nome || 'N/A'}</p>

                                            {selectedVendaForReceipt.entrega && (
                                                <div className="mt-2 pt-1 border-t border-black text-black">
                                                    <p className="font-bold text-center uppercase tracking-wider">🚚 PEDIDO PARA ENTREGA</p>
                                                    {selectedVendaForReceipt.status === 'Boleto a Receber' ? (
                                                        <div className="mt-1 p-1 border border-black rounded text-center">
                                                            <p className="font-bold text-[10px] uppercase">🔵 BOLETO A RECEBER</p>
                                                        </div>
                                                    ) : selectedVendaForReceipt.status === 'A Receber' ? (
                                                        <div className="mt-1 p-1 border border-black rounded text-center">
                                                            <p className="font-bold text-[10px] uppercase">🔵 A RECEBER</p>
                                                        </div>
                                                    ) : (['Boleto', 'A Receber'].includes(selectedVendaForReceipt.forma_pagamento) || selectedVendaForReceipt.forma_pagamento?.toLowerCase().includes('boleto') || selectedVendaForReceipt.forma_pagamento?.toLowerCase().includes('receber')) && Number(selectedVendaForReceipt.valor_aberto || 0) > 0 ? (
                                                        <div className="mt-1 p-1 border border-black rounded text-center">
                                                            <p className="font-bold text-[10px] uppercase text-amber-600">⏳ PENDENTE</p>
                                                            <p className="font-bold text-[11px] mt-0.5">
                                                                Saldo Devedor: R$ {Number(selectedVendaForReceipt.valor_aberto || 0).toFixed(2)}
                                                            </p>
                                                        </div>
                                                    ) : !(selectedVendaForReceipt.status === 'Pago' || selectedVendaForReceipt.status === 'Entregue' || selectedVendaForReceipt.status === 'Concluída') ? (
                                                        <div className="mt-1 p-1 border border-black rounded text-center">
                                                            <p className="font-bold text-[10px] uppercase">💰 RECEBER NA ENTREGA</p>
                                                            <p className="font-bold text-[11px] mt-0.5">
                                                                Valor: R$ {Number(selectedVendaForReceipt.valor_aberto || selectedVendaForReceipt.total || 0).toFixed(2)}
                                                            </p>
                                                            <p className="text-[9px]">
                                                                Forma: {selectedVendaForReceipt.forma_pagamento || 'A combinar'}
                                                            </p>
                                                        </div>
                                                    ) : (
                                                        <div className="mt-1 p-1 border border-black rounded text-center">
                                                            <p className="font-bold text-[10px] uppercase">✅ PEDIDO PAGO / CONFERIDO</p>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <div className="ticket-line" />
                                        <div className="text-center font-bold">PRODUTOS</div>
                                        <div className="ticket-line" />

                                        <table className="w-full text-[11px]">
                                            <thead>
                                                <tr className="text-left border-b border-black">
                                                    <th>Nome</th>
                                                    <th className="text-right">Qtd</th>
                                                    <th className="text-right">Unit</th>
                                                    <th className="text-right">Sub</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {selectedVendaForReceipt.itens?.map((i: any, idx: number) => {
                                                    const isDevolvido = i.foi_devolvido;
                                                    const isParcial = i.quantidade_devolvida > 0 && i.quantidade_devolvida < i.quantidade;
                                                    return (
                                                        <tr key={idx} className={isDevolvido ? 'text-gray-400 line-through' : ''}>
                                                            <td className="py-1">
                                                                {(i.produtos || i.produto)?.nome || `Produto #${idx + 1}`}
                                                                {isDevolvido && <span className="text-[9px] font-bold block text-rose-600">(DEVOLVIDO)</span>}
                                                                {isParcial && <span className="text-[9px] font-bold block text-orange-600">({i.quantidade_devolvida} de {i.quantidade} DEV)</span>}
                                                            </td>
                                                            <td className="text-right">{i.quantidade}</td>
                                                            <td className="text-right">{Number(i.preco_unitario || (i.subtotal / (i.quantidade || 1)) || 0).toFixed(2)}</td>
                                                            <td className="text-right font-bold">{Number(i.subtotal || 0).toFixed(2)}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>

                                        <div className="ticket-double-line" />
                                        <div className="text-center font-bold">PAGAMENTO</div>
                                        <div className="ticket-double-line" />

                                        {Number(selectedVendaForReceipt.valor_devolvido || 0) > 0 ? (
                                            <div className="space-y-0.5 py-1 text-[11px]">
                                                <div className="flex justify-between">
                                                    <span>Total Original:</span>
                                                    <span>R$ {Number(selectedVendaForReceipt.total || 0).toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between text-rose-600 font-bold">
                                                    <span>Valor Devolvido:</span>
                                                    <span>-R$ {Number(selectedVendaForReceipt.valor_devolvido || 0).toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between font-bold text-base border-t border-dashed border-black pt-1">
                                                    <span>Total Líquido:</span>
                                                    <span>R$ {Number((selectedVendaForReceipt.total || 0) - (selectedVendaForReceipt.valor_devolvido || 0)).toFixed(2)}</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex justify-between font-bold text-lg py-1">
                                                <span>Total da Venda:</span>
                                                <span>R$ {Number(selectedVendaForReceipt.total || 0).toFixed(2)}</span>
                                            </div>
                                        )}

                                        <div className="ticket-line" />
                                        <div className="grid grid-cols-2 text-[10px]">
                                            <div><span className="font-bold">Data</span><br />{fmtDate(selectedVendaForReceipt.data_venda)}</div>
                                            <div><span className="font-bold">Forma</span><br />{selectedVendaForReceipt.forma_pagamento}{parcelasCupomSuffix(selectedVendaForReceipt.forma_pagamento, selectedVendaForReceipt.parcelas)}</div>
                                        </div>

                                        {selectedVendaForReceipt.observacao && (
                                            <div className="mt-4 pt-2 border-t border-dashed border-black/30 text-left">
                                                <p className="text-[9px] font-bold uppercase">Observação:</p>
                                                <p className="text-[10px] whitespace-pre-wrap break-words">{selectedVendaForReceipt.observacao}</p>
                                            </div>
                                        )}

                                        <div className="mt-8 text-center text-[10px]">
                                            <p>*** Este ticket não é documento fiscal ***</p>
                                            <div className="mt-10 border-t border-black w-3/4 mx-auto pt-1">Assinatura do cliente</div>
                                            <p className="mt-6 italic opacity-50 text-[8px]">{company?.nome_fantasia} - CRM</p>
                                        </div>
                                    </div>
                                ) : (
                                    /* LAYOUT FORMAL A4/A5 */
                                    <div className="formal-content">
                                        <div className="formal-header">
                                            <div className="flex items-center gap-3">
                                                <div className="w-28 h-14 flex items-center justify-center">
                                                    <img src="/assets/logo-dourados.png" alt="Logo" className="max-w-full max-h-full object-contain" />
                                                </div>
                                                <div>
                                                    <p className="font-black text-xl leading-none text-black">{company?.nome_fantasia || 'Dourados Auto Peças'}</p>
                                                    <p className="text-[10px] text-black italic">Comprovante de Venda</p>
                                                    <p className="text-[9px] text-black/70">CNPJ: 21.894.110/0001-14</p>
                                                    <p className="text-[9px] text-black/70">Av. Marcelino Pires, 5235, Dourados - MS</p>
                                                </div>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-lg font-black uppercase text-black">RECIBO DE VENDA {formatNumPedido(selectedVendaForReceipt.numero_pedido)}</p>
                                            </div>
                                            <div className="text-right text-[10px] space-y-0.5 text-black">
                                                <p>Página 1 de 1</p>
                                                <p>{fmtDateTime(selectedVendaForReceipt.data_venda)}</p>
                                            </div>

                                        </div>

                                        <div className="text-right text-[11px] font-bold mb-2">
                                            Emissão {fmtDate(selectedVendaForReceipt.data_venda)}
                                        </div>

                                        <div className="border-b border-black py-3 space-y-1 text-black">
                                            <p className="text-sm">
                                                <span className="font-bold">Cliente:</span> {selectedVendaForReceipt.clientes?.documento || '---'} - {selectedVendaForReceipt.clientes?.nome || 'CONSUMIDOR FINAL'}
                                            </p>
                                            <p className="text-[11px]">
                                                <span className="font-bold underline">Endereço:</span> {selectedVendaForReceipt.clientes?.endereco || 'Não informado'}
                                            </p>
                                            <div className="flex gap-10 text-[11px]">
                                                <p><span className="font-bold">Telefone:</span> {selectedVendaForReceipt.clientes?.telefone || '---'}</p>
                                                <p><span className="font-bold">E-mail:</span> {selectedVendaForReceipt.clientes?.email || '---'}</p>
                                                <p><span className="font-bold">Vendedor:</span> {selectedVendaForReceipt.vendedor?.nome || selectedVendaForReceipt.atendente?.nome || selectedVendaForReceipt.atendentes?.nome || 'N/A'}</p>
                                            </div>

                                            {selectedVendaForReceipt.entrega && (
                                                <div className="mt-2 border-t-2 border-b-2 border-black py-2 bg-gray-50 text-black">
                                                    <div className="flex justify-between items-center">
                                                        <p className="font-bold text-xs uppercase tracking-wider">🚚 PEDIDO PARA ENTREGA</p>
                                                        {selectedVendaForReceipt.status === 'Boleto a Receber' ? (
                                                            <span className="bg-blue-100 text-blue-850 border border-blue-350 px-2 py-0.5 font-bold uppercase text-[11px]">🔵 BOLETO A RECEBER</span>
                                                        ) : selectedVendaForReceipt.status === 'A Receber' ? (
                                                            <span className="bg-blue-100 text-blue-850 border border-blue-350 px-2 py-0.5 font-bold uppercase text-[11px]">🔵 A RECEBER</span>
                                                        ) : (['Boleto', 'A Receber'].includes(selectedVendaForReceipt.forma_pagamento) || selectedVendaForReceipt.forma_pagamento?.toLowerCase().includes('boleto') || selectedVendaForReceipt.forma_pagamento?.toLowerCase().includes('receber')) && Number(selectedVendaForReceipt.valor_aberto || 0) > 0 ? (
                                                            <span className="bg-amber-100 text-amber-850 border border-amber-350 px-2 py-0.5 font-bold uppercase text-[11px]">⏳ PENDENTE</span>
                                                        ) : !(selectedVendaForReceipt.status === 'Pago' || selectedVendaForReceipt.status === 'Entregue' || selectedVendaForReceipt.status === 'Concluída') ? (
                                                            <div className="text-right text-[11px] font-bold">
                                                                <span className="bg-black text-white px-2 py-0.5 uppercase">💰 RECEBER NA ENTREGA: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(selectedVendaForReceipt.valor_aberto || selectedVendaForReceipt.total || 0)} ({selectedVendaForReceipt.forma_pagamento || 'A combinar'})</span>
                                                            </div>
                                                        ) : (
                                                            <span className="bg-white text-black border border-black px-2 py-0.5 font-bold uppercase text-[11px]">✅ PEDIDO PAGO / CONFERIDO</span>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                            <div className="grid grid-cols-2 text-[11px] pt-2 border-t mt-2">
                                                <p><span className="font-bold">Natureza da operação:</span> Venda de mercadoria</p>
                                                <p className="text-right"><span className="font-bold">Vendedor:</span> {selectedVendaForReceipt.vendedor?.nome || selectedVendaForReceipt.atendente?.nome || selectedVendaForReceipt.atendentes?.nome || 'N/A'}</p>
                                            </div>
                                        </div>

                                        <table className="formal-table">
                                            <colgroup>
                                                <col style={{ width: '5%' }} />
                                                <col style={{ width: '45%' }} />
                                                <col style={{ width: '15%' }} />
                                                <col style={{ width: '10%' }} />
                                                <col style={{ width: '10%' }} />
                                                <col style={{ width: '15%' }} />
                                            </colgroup>
                                            <thead>
                                                <tr>
                                                    <th>#</th>
                                                    <th>Item / Descrição</th>
                                                    <th>SKU</th>
                                                    <th className="text-center">Qtd</th>
                                                    <th className="text-right">Vl un</th>
                                                    <th className="text-right">Subtotal</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {selectedVendaForReceipt.itens?.map((i: any, idx: number) => {
                                                     const isDevolvido = i.foi_devolvido;
                                                     const isParcial = i.quantidade_devolvida > 0 && i.quantidade_devolvida < i.quantidade;
                                                     return (
                                                         <tr key={idx} className={isDevolvido ? 'text-slate-400 bg-slate-50 line-through' : ''}>
                                                             <td className="text-center">{idx + 1}</td>
                                                             <td>
                                                                 {(i.produtos || i.produto)?.nome || `Produto #${idx + 1}`}
                                                                 {isDevolvido && <span className="ml-2 text-[10px] font-bold text-rose-600 normal-case">(DEVOLVIDO)</span>}
                                                                 {isParcial && <span className="ml-2 text-[10px] font-bold text-orange-600 normal-case">({i.quantidade_devolvida} de {i.quantidade} DEVOLVIDO)</span>}
                                                             </td>
                                                             <td className="font-mono text-[9px]">{(i.produtos || i.produto)?.sku || '---'}</td>
                                                             <td className="text-center">{i.quantidade}</td>
                                                             <td className="text-right">{new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(i.preco_unitario || (i.subtotal / i.quantidade))}</td>
                                                             <td className="text-right font-bold">{new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(i.subtotal)}</td>
                                                         </tr>
                                                     );
                                                 })}
                                            </tbody>
                                        </table>

                                        <div className="grid grid-cols-2 gap-10 mt-6">
                                            <div className="space-y-4">
                                                <div className="formal-section">
                                                    <p className="formal-label">Cobrança</p>
                                                    <p className="text-sm font-bold">Forma de pagamento: {selectedVendaForReceipt.forma_pagamento}{parcelasCupomSuffix(selectedVendaForReceipt.forma_pagamento, selectedVendaForReceipt.parcelas)}</p>
                                                    <p className="text-[10px]">Status: {selectedVendaForReceipt.status}</p>
                                                </div>
                                                {selectedVendaForReceipt.status === 'Devolvido' ? (
                                                    <div className="formal-section">
                                                        <p className="formal-label">Status Financeiro</p>
                                                        <p className="text-xl font-black mt-1 text-center bg-white uppercase tracking-tighter italic text-rose-600 border border-rose-600 p-1">
                                                            ↩️ PEDIDO DEVOLVIDO
                                                        </p>
                                                    </div>
                                                ) : (['Boleto', 'A Receber'].includes(selectedVendaForReceipt.forma_pagamento) || selectedVendaForReceipt.forma_pagamento?.toLowerCase().includes('boleto') || selectedVendaForReceipt.forma_pagamento?.toLowerCase().includes('receber')) && Number(selectedVendaForReceipt.valor_aberto || 0) > 0 ? (
                                                    <div className="formal-section">
                                                        <p className="formal-label">Status Financeiro</p>
                                                        <p className="text-xl font-black mt-1 text-center bg-white uppercase tracking-tighter italic text-amber-600 border border-amber-600 p-1">
                                                            ⏳ PENDENTE
                                                        </p>
                                                    </div>
                                                ) : (selectedVendaForReceipt.status === 'Pago' || selectedVendaForReceipt.status === 'Entregue' || selectedVendaForReceipt.status === 'Concluída') && (
                                                    <div className="formal-section">
                                                        <p className="formal-label">Status Financeiro</p>
                                                        <p className="text-xl font-black mt-1 text-center bg-white uppercase tracking-tighter italic">
                                                            ✅ PEDIDO PAGO
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="space-y-1">
                                                <div className="formal-section text-right">
                                                    <p className="formal-label">Totais</p>
                                                    <div className="flex justify-between text-sm py-1 font-bold text-black border-t border-black/10">
                                                        <span>VALOR TOTAL</span>
                                                        <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(selectedVendaForReceipt.total || 0))}</span>
                                                    </div>
                                                    {Number(selectedVendaForReceipt.valor_devolvido || 0) > 0 && (
                                                        <div className="flex justify-between text-sm py-1 text-rose-600 font-bold border-t border-black/10">
                                                            <span>VALOR DEVOLVIDO</span>
                                                            <span>-{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(selectedVendaForReceipt.valor_devolvido || 0))}</span>
                                                        </div>
                                                    )}
                                                    <div className="flex justify-between text-sm py-1 text-emerald-700 font-bold italic">
                                                        <span>VALOR PAGO</span>
                                                        <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(selectedVendaForReceipt.total_pago || 0))}</span>
                                                    </div>
                                                    {selectedVendaForReceipt.status === 'Devolvido' ? (
                                                        <div className="flex justify-between text-lg font-black border-t-2 border-black pt-2 mt-2 text-rose-600">
                                                            <span>VENDA DEVOLVIDA</span>
                                                            <span className="text-sm">TOTALMENTE DEVOLVIDO</span>
                                                        </div>
                                                    ) : Number(selectedVendaForReceipt.valor_aberto || 0) > 0 ? (
                                                        <div className="flex justify-between text-lg font-black border-t-2 border-black pt-2 mt-2 text-rose-600 px-1">
                                                            <span>SALDO DEVEDOR</span>
                                                            <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(selectedVendaForReceipt.valor_aberto || 0))}</span>
                                                        </div>
                                                    ) : (
                                                        <div className="flex justify-between text-lg font-black border-t-2 border-black pt-2 mt-2 text-emerald-600">
                                                            <span>VENDA QUITADA</span>
                                                            <span className="text-sm">COBRANÇA FINALIZADA</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {selectedVendaForReceipt.observacao && (
                                            <div className="mt-8 pt-4 border-t border-dashed">
                                                <p className="text-[10px] font-bold uppercase text-black/80 mb-1">Observação:</p>
                                                <p className="text-sm whitespace-pre-wrap break-words text-black">{selectedVendaForReceipt.observacao}</p>
                                            </div>
                                        )}

                                        <div className="mt-12 pt-4 border-t border-dashed text-center">
                                            <p className="text-[10px] opacity-70 italic uppercase tracking-widest">{company?.mensagem_rodape || 'OBRIGADO PELA PREFERÊNCIA!'}</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </Modal>

            <Modal isOpen={isDetalhesModalOpen} onClose={() => { setIsDetalhesModalOpen(false); setDetalhesVenda(null) }} title={`Detalhes — Pedido #${detalhesVenda?.venda?.numero_pedido ? formatNumPedido(detalhesVenda.venda.numero_pedido) : '---'}`} className="max-w-2xl">
                {loadingDetalhes ? (
                    <div className="py-12 text-center text-muted-foreground">Carregando...</div>
                ) : detalhesVenda ? (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-lg bg-muted/30 border">
                            <div className="col-span-2 sm:col-span-4">
                                <p className="text-xs text-muted-foreground font-bold uppercase">Data da venda</p>
                                <p className="text-sm font-medium">{fmtDateTime(detalhesVenda.venda.data_venda)}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">A data não é alterada ao editar o pedido; alterações ficam no registo abaixo.</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground font-bold uppercase">Valor Total</p>
                                <p className="font-bold text-lg">{fmt(detalhesVenda.venda.total)}</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground font-bold uppercase">Valor Devolvido</p>
                                <p className="font-bold text-lg text-rose-600">{(detalhesVenda.venda.valor_devolvido || 0) > 0 ? fmt(detalhesVenda.venda.valor_devolvido) : '—'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground font-bold uppercase">Total Final</p>
                                <p className="font-bold text-lg text-emerald-600">{fmt(detalhesVenda.venda.total - (detalhesVenda.venda.valor_devolvido || 0))}</p>
                            </div>
                        </div>
                        <div>
                            <p className="text-xs font-bold uppercase text-muted-foreground mb-2 flex items-center gap-1"><Package className="w-3 h-3" /> Itens que ficaram</p>
                            {detalhesVenda.itensFicaram.length === 0 ? (
                                <p className="text-sm text-muted-foreground italic py-4">Nenhum item (todos devolvidos)</p>
                            ) : (
                                <div className="rounded-lg border overflow-hidden">
                                    <Table>
                                        <TableHeader><TableRow><TableHead>Produto</TableHead><TableHead>Qtd</TableHead><TableHead className="text-right">Subtotal</TableHead></TableRow></TableHeader>
                                        <TableBody>
                                            {detalhesVenda.itensFicaram.map((i: any) => (
                                                <TableRow key={i.id}><TableCell className="font-medium">{(i.produtos as any)?.nome || '—'} {(i.produtos as any)?.sku && <span className="text-muted-foreground font-mono text-xs">({(i.produtos as any).sku})</span>}</TableCell><TableCell>{i.quantidade}</TableCell><TableCell className="text-right font-mono">{fmt(i.subtotal)}</TableCell></TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </div>
                        {Array.isArray(detalhesVenda.venda.historico_edicao) && detalhesVenda.venda.historico_edicao.length > 0 && (
                            <div className="rounded-lg border border-amber-200/60 bg-amber-50/40 p-3">
                                <p className="text-xs font-bold uppercase text-amber-900 mb-2 flex items-center gap-1"><FileText className="w-3 h-3" /> Registo de alterações e devoluções</p>
                                <p className="text-[10px] text-amber-800/80 mb-2">Data e hora do registo, atendente responsável e o que foi alterado ou devolvido.</p>
                                <ul className="space-y-2 text-sm max-h-64 overflow-y-auto">
                                    {[...detalhesVenda.venda.historico_edicao].reverse().map((h, idx) => {
                                        const isDev = typeof h.detalhes === 'string' && h.detalhes.toLowerCase().includes('devolução')
                                        return (
                                        <li key={`${h.em}-${idx}`} className={`border-b border-amber-200/40 pb-2 last:border-0 last:pb-0 rounded-md px-2 py-1 -mx-2 ${isDev ? 'bg-rose-50/80 border-l-2 border-l-rose-400' : ''}`}>
                                            <p className="text-[10px] text-muted-foreground font-medium">
                                                {fmtDateTime(h.em)}
                                                {h.por ? <span className="text-foreground"> · Atendente: {h.por}</span> : ''}
                                            </p>
                                            <p className="text-xs text-foreground whitespace-pre-wrap break-words mt-0.5">{h.detalhes}</p>
                                        </li>
                                        )
                                    })}
                                </ul>
                            </div>
                        )}
                        {(detalhesVenda.venda.valor_devolvido || 0) > 0 && (
                            <div>
                                <p className="text-xs font-bold uppercase text-muted-foreground mb-2 flex items-center gap-1"><RotateCcw className="w-3 h-3" /> Itens devolvidos</p>
                                <div className="rounded-lg border border-rose-200/50 overflow-hidden">
                                    <Table>
                                        <TableHeader><TableRow><TableHead>Produto</TableHead><TableHead>Qtd</TableHead><TableHead className="text-right">Subtotal</TableHead></TableRow></TableHeader>
                                        <TableBody>
                                            {detalhesVenda.itensDevolvidos.map((i: any, idx: number) => (
                                                <TableRow key={idx}><TableCell className="font-medium">{(i.produtos as any)?.nome || '—'} {(i.produtos as any)?.sku && <span className="text-muted-foreground font-mono text-xs">({(i.produtos as any).sku})</span>}</TableCell><TableCell>{i.quantidade}</TableCell><TableCell className="text-right font-mono text-rose-600">{fmt(i.subtotal)}</TableCell></TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                        )}
                    </div>
                ) : null}
            </Modal>

            <Modal isOpen={isObservacaoModalOpen} onClose={() => { setIsObservacaoModalOpen(false); setVendaParaObservacao(null) }} title={`Observação — Pedido #${vendaParaObservacao ? formatNumPedido(vendaParaObservacao.numero_pedido) : '---'}`} className="max-w-lg">
                <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">Adicione ou edite uma observação interna sobre esta venda. Apenas para uso da equipe.</p>
                    <div className="space-y-2">
                        <Label>Observação</Label>
                        <textarea
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none min-h-[120px]"
                            value={observacaoText}
                            onChange={e => setObservacaoText(e.target.value)}
                            placeholder="Ex: Cliente solicitou NF-e, entrega agendada para..."
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => { setIsObservacaoModalOpen(false); setVendaParaObservacao(null) }}>Cancelar</Button>
                        <Button onClick={handleSaveObservacao} disabled={submitting}>{submitting ? 'Salvando...' : 'Salvar'}</Button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={isQuitarModalOpen} onClose={() => setIsQuitarModalOpen(false)} title="Quitar Venda / Gerar Fatura" className="max-w-md">
                <form onSubmit={handleQuitarVenda} className="space-y-6">
                    <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl text-center">
                        <Label className="text-[10px] font-black uppercase text-emerald-600 tracking-widest">Valor pendente</Label>
                        <div className="text-3xl font-black text-emerald-700">{fmt(vendaParaQuitar?.total || 0)}</div>
                    </div>

                    {(
                        (vendaParaQuitar?.forma_pagamento || '').toLowerCase().includes('pix') ||
                        (vendaParaQuitar?.forma_pagamento || '').toLowerCase().includes('transferência') ||
                        vendaParaQuitar?.status === 'A Receber' ||
                        vendaParaQuitar?.status === 'Boleto a Receber'
                    ) && (
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-emerald-700">Nome do pagador (opcional)</Label>
                            <Input
                                placeholder="Ex: João Silva — quem fez a transferência"
                                value={quitarPixNomePagador}
                                onChange={e => setQuitarPixNomePagador(e.target.value)}
                                className="border-emerald-200 bg-emerald-50/50"
                            />
                            <p className="text-[10px] text-muted-foreground">Só para relatório e financeiro; não altera o cadastro do cliente.</p>
                        </div>
                    )}

                    <label className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-xl cursor-pointer">
                        <input type="checkbox" checked={quitarGerarFatura} onChange={e => setQuitarGerarFatura(e.target.checked)} />
                        <div>
                            <p className="font-black text-xs text-blue-900 uppercase">Gerar Fatura?</p>
                            <p className="text-[10px] text-blue-700">Crie parcelas e datas de vencimento no financeiro.</p>
                        </div>
                    </label>

                    {quitarGerarFatura && (
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <Label className="text-[10px] font-black uppercase text-slate-400">Parcelas</Label>
                                <Button type="button" variant="outline" size="sm" className="h-7 text-[10px] font-black" onClick={() => setQuitarParcelas([...quitarParcelas, { id: Math.random(), valor: 0, vencimento: new Date().toISOString().split('T')[0] }])}>+ Adicionar</Button>
                            </div>
                            <div className="space-y-2 max-h-[150px] overflow-auto pr-1">
                                {quitarParcelas.map((p, idx) => (
                                    <div key={p.id} className="flex gap-2 items-center bg-slate-50 p-2 rounded-lg border">
                                        <Input type="date" className="h-8 text-xs flex-1" value={p.vencimento} onChange={e => { const n = [...quitarParcelas]; n[idx].vencimento = e.target.value; setQuitarParcelas(n); }} />
                                        <Input type="number" step="0.01" className="h-8 text-xs w-24 text-right font-bold" value={p.valor} onChange={e => { const n = [...quitarParcelas]; n[idx].valor = parseFloat(e.target.value) || 0; setQuitarParcelas(n); }} />
                                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-rose-300" onClick={() => setQuitarParcelas(quitarParcelas.filter(x => x.id !== p.id))}><X className="w-3 h-3" /></Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end gap-2 pt-4 border-t">
                        <Button type="button" variant="ghost" onClick={() => setIsQuitarModalOpen(false)}>Cancelar</Button>
                        <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-6" disabled={submitting}>CONFIRMAR QUITAÇÃO</Button>
                    </div>
                </form>
            </Modal>
            <VendaEdicaoAvancadaModal
                isOpen={isEdicaoAvancadaModalOpen}
                onClose={() => { setIsEdicaoAvancadaModalOpen(false); setVendaEdicaoAvancada(null); }}
                vendaOriginal={vendaEdicaoAvancada}
                onSuccess={() => fetchVendas()}
            />
        </div>
    )
}
