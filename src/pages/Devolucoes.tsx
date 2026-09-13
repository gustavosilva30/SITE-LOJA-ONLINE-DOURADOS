import { useEffect, useState, useCallback, useMemo, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { devolucoesApi, vendasApi, clientesApi, configuracoesApi, financeiroApi } from "@/lib/api"
import { useAuthStore } from "@/store/authStore"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Modal } from "@/components/ui/modal"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, Search, RotateCcw, Pencil, Trash2, RefreshCw, Printer, Package, CheckCircle2, ChevronDown, X, FileCode } from "lucide-react"
import { cn } from "@/lib/utils"
import { fmt, fmtDate, fmtDateTime, formatNumPedido } from "@/lib/format"
import { logAcao, logErro } from "@/lib/systemLog"
import { precoUnitarioEfetivoVendaItem } from "@/lib/vendaItemPricing"

const roundMoney2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

/** Evita o mesmo id de vendas_itens repetido no array (paridade API). */
function dedupeLinhasVendaItensPorId(rows: any[]): any[] {
    const m = new Map<string, any>()
    for (const r of rows || []) {
        const id = String(r?.id ?? '')
        if (!id) continue
        if (!m.has(id)) m.set(id, r)
    }
    return Array.from(m.values())
}

/**
 * Várias linhas em vendas_itens para o mesmo produto (legado / duplicidade no DB)
 * apareciam em dobro na devolução. Agrega quantidade na UI e reparte o reembolso nas linhas reais ao salvar.
 */
function agregarItensVendaPorProdutoParaDevolucao(rows: any[]): any[] {
    const deduped = dedupeLinhasVendaItensPorId(rows)
    const grupos = new Map<string, any[]>()
    for (const r of deduped) {
        const pid = String(r.produto_id ?? r.produtos?.id ?? '').trim()
        const key = pid || `__row_${r.id}`
        if (!grupos.has(key)) grupos.set(key, [])
        grupos.get(key)!.push(r)
    }
    const out: any[] = []
    for (const [, group] of grupos) {
        if (group.length === 1) {
            out.push(group[0])
            continue
        }
        const base = { ...group[0] }
        const qtd = group.reduce((s, x) => s + (Number(x.quantidade) || 0), 0)
        base.quantidade = qtd
        base._devolucaoLinhas = group.map((x) => ({
            id: String(x.id),
            quantidade: Number(x.quantidade) || 0,
        }))
        out.push(base)
    }
    return out
}

function alocarQtyDevolucaoNasLinhasVenda(
    qtyReturn: number,
    linhas: { id: string; quantidade: number }[]
): { venda_item_id: string; quantidade: number }[] {
    let rem = Math.max(0, qtyReturn)
    const res: { venda_item_id: string; quantidade: number }[] = []
    for (const L of linhas) {
        if (rem <= 0) break
        const cap = Math.max(0, Number(L.quantidade) || 0)
        const take = Math.min(rem, cap)
        if (take > 0) {
            res.push({ venda_item_id: L.id, quantidade: take })
            rem -= take
        }
    }
    return res
}

async function tryMarcarVendaDevolvidaSeCompleta(vendaId: string) {
    try {
        await devolucoesApi.marcarDevolvidaSeCompleta(vendaId)
    } catch (err) {
        console.error('tryMarcarVendaDevolvidaSeCompleta', err)
    }
}

const STATUS_VARIANT: Record<string, any> = {
    Aprovado: 'default',
    Concluido: 'success',
    Recusado: 'destructive',
    Pendente: 'outline',
}

export function Devolucoes() {
    const navigate = useNavigate()
    const { atendente } = useAuthStore()
    const [clientes, setClientes] = useState<any[]>([])
    const [search, setSearch] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')
    
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 500)
        return () => clearTimeout(timer)
    }, [search])
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingItem, setEditingItem] = useState<any>(null)
    const [submitting, setSubmitting] = useState(false)
    const [filterStatus, setFilterStatus] = useState('todos') // legado: Recusado / Concluido; novas entram como Aprovado

    const [currentPage, setCurrentPage] = useState(1)
    const itemsPerPage = 20

    const [pedidoBusca, setPedidoBusca] = useState('')
    const [vendaSelecionada, setVendaSelecionada] = useState<any>(null)
    const [itensVenda, setItensVenda] = useState<any[]>([])
    const [itensDevolver, setItensDevolver] = useState<Record<string, { checked: boolean, qty: number }>>({})
    const [faturasPendentes, setFaturasPendentes] = useState<any[]>([])

    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false)
    const [selectedDevolucaoForPrint, setSelectedDevolucaoForPrint] = useState<any>(null)
    const [company, setCompany] = useState<any>(null)
    const [printFormat, setPrintFormat] = useState<'a4' | 'a5' | 'cupom'>('a5')
    /** Busca de cliente (combobox), como em Vendas — evita <select> sem digitação e limite de 500 na lista. */
    const [searchTermCliente, setSearchTermCliente] = useState('')
    const [showClienteDropdown, setShowClienteDropdown] = useState(false)
    const clientesRef = useRef<any[]>([])
    useEffect(() => {
        clientesRef.current = clientes
    }, [clientes])

    const [form, setForm] = useState({
        cliente_id: '',
        motivo: '',
        tipo: 'DEVOLUCAO',
        valor_reembolso: '',
        forma_reembolso: 'Dinheiro',
        observacoes: '',
        rateio_modo: 'padrao',
        rateio_fatura_id: ''
    })

    const selectedItems = useMemo(() => {
        return itensVenda
            .map((item: any) => {
                const st = itensDevolver[item.id]
                if (!st?.checked || !Number(st.qty) || Number(st.qty) <= 0) return null
                return { item, st }
            })
            .filter((x): x is { item: any; st: { checked: boolean; qty: number } } => x != null)
    }, [itensVenda, itensDevolver])

    // React Query substituindo fetchData manual
    const { data: devData, isLoading: loading, isError, error: devError, refetch } = useQuery({
        queryKey: ['devolucoes', currentPage, itemsPerPage, debouncedSearch, filterStatus],
        queryFn: async () => {
            const statusToPass = filterStatus === 'todos' ? undefined : filterStatus
            return devolucoesApi.listar({
                limit: itemsPerPage,
                offset: (currentPage - 1) * itemsPerPage,
                q: debouncedSearch,
                status: statusToPass,
                with_total: true
            })
        },
        placeholderData: keepPreviousData,
    })

    const loadError = isError ? (devError as any)?.message || 'Não foi possível carregar as devoluções.' : null
    const devolucoes = devData?.items || []
    const totalRegistros = devData?.total || 0
    const totalReembolso = devolucoes.filter((d: any) => d.processada_at).reduce((a: number, d: any) => a + (d.valor_reembolso || 0), 0)

    const fetchData = useCallback(() => {
        refetch()
    }, [refetch])

    /** Garante que o UUID escolhido exista em `clientes` (nome visível + opção válida). */
    const ensureClienteInList = useCallback(async (id: string | null | undefined) => {
        const sid = String(id || "").trim()
        if (!sid) return
        if (clientesRef.current.some((c) => c.id === sid)) return
        const det = await clientesApi.detalhe(sid).catch(() => null)
        if (!det) return
        setClientes((prev) => (prev.some((c) => c.id === det.id) ? prev : [det, ...prev]))
    }, [])

    useEffect(() => {
        if (!searchTermCliente || searchTermCliente.length < 2) return
        const timer = setTimeout(async () => {
            const cleanTerm = searchTermCliente.trim()
            if (cleanTerm.length < 2) return
            const data = await clientesApi.listar({ q: cleanTerm, limit: 200 })
            if (data && Array.isArray(data)) {
                setClientes((prev) => {
                    const ids = new Set(prev.map((c) => c.id))
                    const novos = data.filter((c: any) => c?.id && !ids.has(c.id))
                    return novos.length ? [...novos, ...prev] : prev
                })
            }
        }, 450)
        return () => clearTimeout(timer)
    }, [searchTermCliente])

    useEffect(() => { fetchData() }, [fetchData])

    useEffect(() => {
        configuracoesApi.obter().then((data) => setCompany(data)).catch(() => {})
    }, [])

    const handleOpenPrintReceipt = async (devolucao: any) => {
        setSelectedDevolucaoForPrint(null)
        setIsPrintModalOpen(true)
        try {
            const [vendaCompleto, devDetalhe] = await Promise.all([
                devolucao.venda_id ? vendasApi.detalheCompleto(devolucao.venda_id).catch(() => null) : Promise.resolve(null),
                devolucoesApi.detalhe(devolucao.id).catch(() => null),
            ])
            const venda = vendaCompleto || null
            const entrega = venda?.entrega || null
            const itens = devDetalhe?.itens || []
            let clienteFull = devolucao.clientes
            if (!venda && devolucao.cliente_id) {
                clienteFull = await clientesApi.detalhe(devolucao.cliente_id).catch(() => devolucao.clientes)
            }
            setSelectedDevolucaoForPrint({
                ...devolucao,
                clientes: clienteFull || devolucao.clientes,
                venda: venda ? { ...venda, entrega } : null,
                itens: itens.map((i: any) => ({ ...i, produtos: i.produtos || i.produto || {} })),
            })
        } catch (err: any) {
            console.error(err)
            setSelectedDevolucaoForPrint({ ...devolucao, venda: null, itens: [] })
        }
    }

    const resetVendaContext = () => {
        setPedidoBusca('')
        setVendaSelecionada(null)
        setItensVenda([])
        setItensDevolver({})
        setFaturasPendentes([])
    }

    /** Carrega itens da venda e, em edição, marca quantidades já devolvidas nesta devolução. */
    const carregarPedidoParaDevolucao = async (vendaId: string, opts?: { devolucaoId?: string }) => {
        const v = await vendasApi.detalheCompleto(vendaId)
        if (v) {
            setVendaSelecionada(v)
            setPedidoBusca(String(v.numero_pedido ?? ''))
            const cidRaw = (v as any).cliente_id ?? (v as any).clientes?.id ?? null
            const cid = cidRaw ? String(cidRaw) : ''
            setForm((prev) => ({
                ...prev,
                cliente_id: cid || prev.cliente_id || '',
            }))
            setSearchTermCliente('')
            if (cid) void ensureClienteInList(cid)
        }

        const rawItens: any[] = v?.itens || []
        const rows = agregarItensVendaPorProdutoParaDevolucao(rawItens)
        setItensVenda(rows)

        let dItens: { venda_item_id: string; quantidade: unknown }[] = []
        if (opts?.devolucaoId) {
            const devDetail = await devolucoesApi.detalhe(opts.devolucaoId).catch(() => null)
            dItens = devDetail?.itens || []
        }

        const initial: Record<string, { checked: boolean; qty: number }> = {}
        rows.forEach((i: any) => {
            const linhas = i._devolucaoLinhas || [{ id: String(i.id), quantidade: Number(i.quantidade) || 0 }]
            let qtyDev = 0
            for (const L of linhas) {
                const di = dItens.find((d: any) => String(d.venda_item_id) === L.id)
                if (di) qtyDev += Math.max(0, Number(di.quantidade) || 0)
            }
            initial[i.id] =
                qtyDev > 0 ? { checked: true, qty: qtyDev } : { checked: false, qty: 0 }
        })
        setItensDevolver(initial)

        try {
            const res = await financeiroApi.listar({ venda_id: vendaId, limit: 100 })
            const arr = Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : []
            setFaturasPendentes(arr.filter((f: any) => f.tipo === 'Receita' && f.status !== 'Pago' && f.status !== 'Cancelado'))
        } catch (err) {
            setFaturasPendentes([])
        }
    }

    const buscarPedido = async () => {
        const n = parseInt((pedidoBusca || '').replace(/\D/g, ''), 10)
        if (!n) return alert('Digite um número de pedido válido.')

        setSubmitting(true)
        try {
            const results = await vendasApi.listar({ numero_pedido: n, limit: 1 })
            const venda = Array.isArray(results) ? results[0] : null
            if (!venda) return alert('Pedido não encontrado.')

            setForm((prev) => ({ ...prev, valor_reembolso: '' }))
            await carregarPedidoParaDevolucao(venda.id)
        } catch (err: any) {
            console.error('Erro ao buscar pedido:', err)
            alert('Erro ao buscar pedido: ' + (err.message || ''))
        } finally {
            setSubmitting(false)
        }
    }

    const calcTotalDevolver = () => {
        const map = itensDevolver || {}
        return itensVenda.reduce((acc: number, item: any) => {
            const st = map[item.id]
            if (!st?.checked || !st.qty) return acc
            const unitEfetivo = precoUnitarioEfetivoVendaItem(item)
            return acc + roundMoney2(Number(st.qty) * unitEfetivo)
        }, 0)
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        setSubmitting(true)
        try {
            // Se houver itens selecionados, o valor vem da soma; caso contrário, usa o campo manual.
            const computedFromItems = selectedItems.length > 0 ? roundMoney2(calcTotalDevolver()) : 0
            const manual = roundMoney2(parseFloat(form.valor_reembolso) || 0)
            const refundValue = selectedItems.length > 0 ? computedFromItems : manual
            if (refundValue <= 0) {
                alert(selectedItems.length > 0 ? 'Selecione itens e quantidades para devolução.' : 'Informe um valor de reembolso.')
                setSubmitting(false)
                return
            }

            const vendaIdPayload = (vendaSelecionada?.id ?? editingItem?.venda_id ?? null) as string | null

            const itensPayload: any[] = []
            for (const { item, st } of selectedItems) {
                const unitEfetivo = roundMoney2(precoUnitarioEfetivoVendaItem(item))
                const qty = Number(st.qty)
                const linhas = item._devolucaoLinhas || [{ id: String(item.id), quantidade: Number(item.quantidade) || 0 }]
                const partes = alocarQtyDevolucaoNasLinhasVenda(qty, linhas)
                for (const p of partes) {
                    const q = p.quantidade
                    const pid =
                        item.produto_id ??
                        item.produtos?.id ??
                        item.produto?.id ??
                        null
                    itensPayload.push({
                        venda_item_id: p.venda_item_id,
                        produto_id: pid,
                        quantidade: q,
                        preco_unitario: unitEfetivo,
                        subtotal: roundMoney2(q * unitEfetivo),
                    })
                }
            }

            const basePayload: Record<string, unknown> = {
                ...form,
                venda_id: vendaIdPayload,
                cliente_id: form.cliente_id || null,
                valor_reembolso: refundValue,
                forma_reembolso: form.forma_reembolso || 'Dinheiro',
                atendente_id: atendente?.id || null,
                status: 'Aprovado',
                rateio_modo: form.rateio_modo || 'padrao',
                rateio_fatura_id: form.rateio_fatura_id || null,
            }

            let saved: any = null

            if (editingItem) {
                const hasVendaCtx = !!vendaSelecionada
                const payload: Record<string, unknown> = { ...basePayload }
                if (hasVendaCtx) {
                    // Replace itens (selectedItems can be empty → clears them)
                    payload.itens = itensPayload
                } else {
                    // Editing without venda context — don't touch itens
                    payload.itens = null
                }
                saved = await devolucoesApi.atualizarCompleto(editingItem.id, payload)
            } else {
                const payload: Record<string, unknown> = {
                    ...basePayload,
                    itens: itensPayload.length > 0 ? itensPayload : undefined,
                }
                saved = await devolucoesApi.criarCompleto(payload)
            }

            const vendaIdSync = (vendaSelecionada?.id ?? saved?.venda_id ?? editingItem?.venda_id) as string | undefined
            if (vendaIdSync) {
                await tryMarcarVendaDevolvidaSeCompleta(vendaIdSync)
            }

            alert(editingItem ? "Devolução atualizada!" : "Devolução registrada com sucesso!")
            const np = vendaSelecionada?.numero_pedido
            logAcao(
                editingItem ? 'devolucao.editar' : 'devolucao.criar',
                editingItem
                    ? `Devolução atualizada${np != null ? ` — pedido #${formatNumPedido(np)}` : ''}`
                    : `Nova devolução registrada${np != null ? ` — pedido #${formatNumPedido(np)}` : ''}`,
                atendente?.id
            )
            setIsModalOpen(false)
            setEditingItem(null)
            resetForm()
            resetVendaContext()
            fetchData()

            // Abre comprovante se for reembolso de Haver Cliente
            if (saved && saved.forma_reembolso === 'Haver Cliente') {
                void handleOpenPrintReceipt(saved)
            }
        } catch (err: any) {
            logErro('Falha ao salvar devolução', err, atendente?.id, 'devolucao.salvar')
            alert("Erro inesperado: " + err.message)
        } finally {
            setSubmitting(false)
        }
    }

    const handleEdit = async (item: any) => {
        setEditingItem(item)
        setForm({
            cliente_id: item.cliente_id || '',
            motivo: item.motivo || '',
            tipo: item.tipo,
            valor_reembolso: String(item.valor_reembolso || ''),
            forma_reembolso: item.forma_reembolso || 'Dinheiro',
            observacoes: item.observacoes || '',
            rateio_modo: item.rateio_modo || 'padrao',
            rateio_fatura_id: item.rateio_fatura_id || ''
        })
        setPedidoBusca('')
        setVendaSelecionada(null)
        setItensVenda([])
        setItensDevolver({})
        setIsModalOpen(true)
        if (item.cliente_id) void ensureClienteInList(item.cliente_id)
        if (item.venda_id) {
            setSubmitting(true)
            try {
                await carregarPedidoParaDevolucao(item.venda_id, { devolucaoId: item.id })
            } catch (err: any) {
                console.error(err)
                alert('Erro ao carregar pedido da devolução: ' + (err.message || ''))
            } finally {
                setSubmitting(false)
            }
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Excluir esta devolução?')) return
        try {
            await devolucoesApi.deletar(id)
            fetchData()
        } catch (err: any) {
            alert("Erro ao excluir: " + (err.message || ''))
        }
    }

    const resetForm = () => {
        setForm({ cliente_id: '', motivo: '', tipo: 'DEVOLUCAO', valor_reembolso: '', forma_reembolso: 'Dinheiro', observacoes: '', rateio_modo: 'Nenhum', rateio_fatura_id: '' })
        setSearchTermCliente('')
        setShowClienteDropdown(false)
    }

    const paginatedDevolucoes = devolucoes
    const totalPages = Math.ceil(totalRegistros / itemsPerPage)
    const indexOfFirstItem = (currentPage - 1) * itemsPerPage
    const indexOfLastItem = Math.min(indexOfFirstItem + itemsPerPage, totalRegistros)

    // Resetar para página 1 quando filtros mudarem
    useEffect(() => {
        setCurrentPage(1)
    }, [debouncedSearch, filterStatus])

    const handlePageChange = (page: number) => {
        if (page < 1 || page > totalPages) return
        setCurrentPage(page)
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Devoluções & Trocas</h1>
                    <p className="text-muted-foreground mt-1">Gerencie solicitações de devolução e troca de produtos.</p>
                </div>
                <Button className="gap-2" onClick={() => { resetForm(); setEditingItem(null); resetVendaContext(); setIsModalOpen(true) }}>
                    <Plus className="w-4 h-4" /> Nova Devolução
                </Button>
            </div>

            {loadError ? (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    <strong>Falha ao carregar devoluções.</strong> {loadError} Atualize o backend na VPS e aplique as migrações SQL 015/016 de devoluções se o erro continuar.
                </div>
            ) : null}

            {/* KPIs */}
            <div className="grid gap-4 sm:grid-cols-2">
                <Card className="border-blue-500/20 bg-blue-500/5">
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Devoluções registradas</CardTitle></CardHeader>
                    <CardContent><div className="text-3xl font-bold text-blue-500">{totalRegistros}</div></CardContent>
                </Card>
                <Card className="border-rose-500/20 bg-rose-500/5">
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total reembolsado (processado)</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold text-rose-500">{fmt(totalReembolso)}</div></CardContent>
                </Card>
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap gap-3 items-center">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input className="pl-9" placeholder="Buscar por cliente, motivo, pedido..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <Select className="w-44" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                    <option value="todos">Todas</option>
                    <option value="Aprovado">Aprovado</option>
                    <option value="Concluido">Concluído</option>
                    <option value="Recusado">Recusado</option>
                    <option value="Pendente">Pendente (legado)</option>
                </Select>
                <Button variant="outline" size="icon" onClick={fetchData}>
                    <RefreshCw className="w-4 h-4" />
                </Button>
            </div>

            {/* Tabela */}
            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Pedido</TableHead>
                                <TableHead>Cliente</TableHead>
                                <TableHead>Data</TableHead>
                                <TableHead>Tipo</TableHead>
                                <TableHead>Motivo</TableHead>
                                <TableHead className="text-right">Reembolso</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground animate-pulse">Carregando...</TableCell></TableRow>
                            ) : totalRegistros === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                                        <RotateCcw className="w-10 h-10 mx-auto mb-3 opacity-20" />
                                        <p>Nenhuma devolução encontrada.</p>
                                    </TableCell>
                                </TableRow>
                            ) : paginatedDevolucoes.map(d => (
                                <TableRow key={d.id}>
                                    <TableCell className="font-mono font-bold text-primary text-sm">
                                        {d.vendas?.numero_pedido ? `#${String(d.vendas.numero_pedido).padStart(6, '0')}` : '—'}
                                    </TableCell>
                                    <TableCell className="font-medium">{d.clientes?.nome || '—'}</TableCell>
                                    <TableCell className="text-xs">{fmtDate(d.created_at)}</TableCell>
                                    <TableCell>
                                        <Badge variant={d.tipo === 'DEVOLUCAO' ? 'destructive' : 'default'} className="text-[10px]">
                                            {d.tipo === 'DEVOLUCAO' ? 'Devolução' : 'Troca'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-sm max-w-[200px] truncate">{d.motivo}</TableCell>
                                    <TableCell className="text-right font-bold text-rose-500">{fmt(d.valor_reembolso || 0)}</TableCell>
                                    <TableCell>
                                        <Badge variant={STATUS_VARIANT[d.status] || 'secondary'} className="text-[10px]">
                                            {d.status || 'Aprovado'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {(d.status === 'Aprovado' || d.status === 'Concluido') && (
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className="h-8 w-8 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                                                onClick={() => navigate(`/fiscal?devolucao_id=${d.id}`)} 
                                                title="Emitir NF-e de Devolução"
                                            >
                                                <FileCode className="w-4 h-4" />
                                            </Button>
                                        )}
                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenPrintReceipt(d)} title="Imprimir nota de devolução"><Printer className="w-4 h-4 text-emerald-600" /></Button>
                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(d)}><Pencil className="w-4 h-4 text-blue-500" /></Button>
                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(d.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
                
                {/* Paginação */}
                {totalRegistros > 0 && (
                    <div className="px-6 py-4 border-t flex items-center justify-between bg-gray-50/50 rounded-b-lg">
                        <div className="text-sm text-muted-foreground">
                            Mostrando {indexOfFirstItem + 1}-{indexOfLastItem} de {totalRegistros} devoluções
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handlePageChange(currentPage - 1)}
                                disabled={currentPage === 1}
                                className="h-8 w-8 p-0"
                            >
                                &lt;
                            </Button>
                            <div className="flex items-center gap-1">
                                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                    let pageNum
                                    if (totalPages <= 5) {
                                        pageNum = i + 1
                                    } else if (currentPage <= 3) {
                                        pageNum = i + 1
                                    } else if (currentPage >= totalPages - 2) {
                                        pageNum = totalPages - 4 + i
                                    } else {
                                        pageNum = currentPage - 2 + i
                                    }
                                    return (
                                        <Button
                                            key={pageNum}
                                            variant={currentPage === pageNum ? "default" : "outline"}
                                            size="sm"
                                            onClick={() => handlePageChange(pageNum)}
                                            className="h-8 w-8 p-0 text-xs"
                                        >
                                            {pageNum}
                                        </Button>
                                    )
                                })}
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handlePageChange(currentPage + 1)}
                                disabled={currentPage === totalPages}
                                className="h-8 w-8 p-0"
                            >
                                &gt;
                            </Button>
                        </div>
                    </div>
                )}
            </Card>

            <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingItem(null); resetForm(); resetVendaContext() }} title={editingItem ? "Editar Devolução" : "Registrar Devolução / Troca"}>
                <form onSubmit={handleSave} className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 max-w-xs">
                        <div className="space-y-2">
                            <Label>Tipo</Label>
                            <Select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
                                <option value="DEVOLUCAO">Devolução</option>
                                <option value="TROCA">Troca</option>
                            </Select>
                            <p className="text-[11px] text-muted-foreground leading-snug">
                                Ao salvar, a devolução é registrada como aprovada e o sistema atualiza estoque, financeiro e totais da venda.
                            </p>
                        </div>
                    </div>

                    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                        <div className="space-y-2">
                            <Label>Pedido (número da venda)</Label>
                            <div className="flex flex-wrap gap-2">
                                <Input
                                    className="max-w-[220px]"
                                    placeholder="Ex.: 123456"
                                    value={pedidoBusca}
                                    onChange={(e) => setPedidoBusca(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault()
                                            buscarPedido()
                                        }
                                    }}
                                />
                                <Button type="button" variant="secondary" className="gap-1" onClick={buscarPedido} disabled={submitting}>
                                    <Search className="w-4 h-4" /> Buscar
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Busque pelo número do pedido e marque os itens e quantidades desta devolução.
                            </p>
                        </div>

                        {vendaSelecionada && (
                            <div className="rounded-md border bg-background px-3 py-2 text-sm space-y-1">
                                <p>
                                    <span className="font-semibold">Pedido</span>{' '}
                                    <span className="font-mono font-bold text-primary">
                                        #{formatNumPedido(vendaSelecionada.numero_pedido)}
                                    </span>
                                    {' — '}
                                    <span className="text-muted-foreground">Total da venda:</span> {fmt(vendaSelecionada.total ?? 0)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Cliente na venda: {vendaSelecionada.clientes?.nome || '—'} · Status: {vendaSelecionada.status || '—'}
                                </p>
                            </div>
                        )}

                        {itensVenda.length > 0 && (
                            <div className="space-y-2">
                                <Label>Itens desta devolução</Label>
                                <div className="rounded-md border max-h-56 overflow-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-10" />
                                                <TableHead>Produto</TableHead>
                                                <TableHead className="text-right w-20">Venda</TableHead>
                                                <TableHead className="text-right w-28">Qtd. devolver</TableHead>
                                                <TableHead className="text-right w-24">Subtotal</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {itensVenda.map((item: any) => {
                                                const st = itensDevolver[item.id] || { checked: false, qty: 0 }
                                                const maxQ = Math.max(0, Number(item.quantidade) || 0)
                                                const unitEfetivo = precoUnitarioEfetivoVendaItem(item)
                                                const line = st.checked && st.qty > 0 ? roundMoney2(Number(st.qty) * unitEfetivo) : 0
                                                const nome = item.produtos?.nome || item.produto?.nome || 'Produto'
                                                const sku = item.produtos?.sku || item.produto?.sku
                                                return (
                                                    <TableRow key={item.id}>
                                                        <TableCell className="align-middle">
                                                            <input
                                                                type="checkbox"
                                                                className="h-4 w-4 rounded border-input"
                                                                checked={st.checked}
                                                                onChange={(e) => {
                                                                    const checked = e.target.checked
                                                                    setItensDevolver((prev) => ({
                                                                        ...prev,
                                                                        [item.id]: {
                                                                            checked,
                                                                            qty: checked ? Math.min(maxQ || 1, Math.max(1, prev[item.id]?.qty || 1)) : 0,
                                                                        },
                                                                    }))
                                                                }}
                                                            />
                                                        </TableCell>
                                                        <TableCell className="text-xs max-w-[200px]">
                                                            <span className="font-medium line-clamp-2">{nome}</span>
                                                            {sku ? <span className="block text-muted-foreground font-mono text-[10px]">{sku}</span> : null}
                                                        </TableCell>
                                                        <TableCell className="text-right text-xs">{maxQ}</TableCell>
                                                        <TableCell className="text-right">
                                                            <Input
                                                                className="h-8 text-right text-xs max-w-[88px] ml-auto"
                                                                type="number"
                                                                min={0}
                                                                max={maxQ}
                                                                step={1}
                                                                disabled={!st.checked}
                                                                value={st.checked ? st.qty : 0}
                                                                onChange={(e) => {
                                                                    const raw = parseInt(e.target.value, 10)
                                                                    const qty = Number.isFinite(raw) ? Math.min(maxQ, Math.max(0, raw)) : 0
                                                                    setItensDevolver((prev) => ({
                                                                        ...prev,
                                                                        [item.id]: { checked: qty > 0, qty },
                                                                    }))
                                                                }}
                                                            />
                                                        </TableCell>
                                                        <TableCell className="text-right text-xs font-medium">{fmt(line)}</TableCell>
                                                    </TableRow>
                                                )
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-sm">
                                        Total dos itens selecionados:{' '}
                                        <strong className="text-foreground">{fmt(calcTotalDevolver())}</strong>
                                    </p>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                            setForm((f) => ({
                                                ...f,
                                                valor_reembolso: String(roundMoney2(calcTotalDevolver())),
                                            }))
                                        }
                                    >
                                        Aplicar ao reembolso
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label>Cliente (opcional)</Label>
                        <p className="text-[11px] text-muted-foreground">
                            Digite para buscar por nome, CPF ou telefone. Ao carregar um pedido com cliente, o cadastro é preenchido automaticamente.
                        </p>
                        <div className="relative">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                <Search className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <Input
                                className="pl-9 pr-9"
                                placeholder="Pesquisar cliente ou deixe em branco…"
                                value={
                                    searchTermCliente ||
                                    (form.cliente_id
                                        ? clientes.find((c) => c.id === form.cliente_id)?.nome || ''
                                        : '')
                                }
                                onChange={(e) => {
                                    setSearchTermCliente(e.target.value)
                                    setShowClienteDropdown(true)
                                    if (!e.target.value) setForm({ ...form, cliente_id: '' })
                                }}
                                onFocus={() => setShowClienteDropdown(true)}
                            />
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                                {showClienteDropdown ? (
                                    <button
                                        type="button"
                                        className="p-1 rounded hover:bg-muted text-muted-foreground"
                                        aria-label="Fechar lista"
                                        onClick={() => {
                                            setShowClienteDropdown(false)
                                            setSearchTermCliente('')
                                        }}
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                ) : (
                                    <ChevronDown className="w-4 h-4 text-muted-foreground opacity-50" />
                                )}
                            </div>
                            {showClienteDropdown && (
                                <div className="absolute z-[80] w-full mt-1 bg-popover border rounded-md shadow-lg max-h-[280px] overflow-auto">
                                    <div className="p-1 space-y-0.5">
                                        <button
                                            type="button"
                                            className={cn(
                                                'w-full text-left flex items-center gap-2 px-3 py-2 rounded-sm text-sm hover:bg-muted',
                                                !form.cliente_id && 'bg-muted/60'
                                            )}
                                            onClick={() => {
                                                setForm({ ...form, cliente_id: '' })
                                                setSearchTermCliente('')
                                                setShowClienteDropdown(false)
                                            }}
                                        >
                                            Sem cliente vinculado
                                        </button>
                                        {clientes
                                            .filter((c) => {
                                                const q = searchTermCliente.trim().toLowerCase()
                                                if (!q) return true
                                                return (
                                                    (c.nome && String(c.nome).toLowerCase().includes(q)) ||
                                                    (c.telefone && String(c.telefone).includes(searchTermCliente)) ||
                                                    (c.documento && String(c.documento).includes(searchTermCliente))
                                                )
                                            })
                                            .slice(0, 400)
                                            .map((c) => (
                                                <button
                                                    key={c.id}
                                                    type="button"
                                                    className={cn(
                                                        'w-full text-left flex items-center justify-between gap-2 px-3 py-2 rounded-sm text-sm hover:bg-muted',
                                                        form.cliente_id === c.id && 'bg-primary/10'
                                                    )}
                                                    onClick={() => {
                                                        setForm({ ...form, cliente_id: c.id })
                                                        setSearchTermCliente('')
                                                        setShowClienteDropdown(false)
                                                    }}
                                                >
                                                    <span className="truncate font-medium">{c.nome}</span>
                                                    {form.cliente_id === c.id ? (
                                                        <CheckCircle2 className="w-4 h-4 shrink-0 text-primary" />
                                                    ) : null}
                                                </button>
                                            ))}
                                        {clientes.filter((c) => {
                                            const q = searchTermCliente.trim().toLowerCase()
                                            if (!q) return true
                                            return (
                                                (c.nome && String(c.nome).toLowerCase().includes(q)) ||
                                                (c.telefone && String(c.telefone).includes(searchTermCliente)) ||
                                                (c.documento && String(c.documento).includes(searchTermCliente))
                                            )
                                        }).length === 0 && (
                                            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                                                Nenhum cliente neste filtro. Digite ao menos 2 letras para buscar no servidor.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Motivo *</Label>
                        <Input required placeholder="Produto com defeito, peça errada..." value={form.motivo} onChange={e => setForm({ ...form, motivo: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                        <Label>Forma de Reembolso</Label>
                        <Select value={form.forma_reembolso} onChange={e => setForm({ ...form, forma_reembolso: e.target.value })}>
                            <option value="Dinheiro">Dinheiro (sai do caixa)</option>
                            <option value="Pix">Pix</option>
                            <option value="Cartão Crédito">Cartão Crédito</option>
                            <option value="Cartão Débito">Cartão Débito</option>
                            <option value="Boleto">Boleto</option>
                            <option value="Transferência">Transferência</option>
                            <option value="Cheque">Cheque</option>
                            <option value="A Receber">A Receber</option>
                            <option value="Haver Cliente">Haver Cliente (crédito)</option>
                            <option value="Vale Funcionário">Vale Funcionário</option>
                            <option value="Venda Online">Venda Online</option>
                            <option value="Outro">Outro</option>
                        </Select>
                    </div>

                    {faturasPendentes.length > 0 && form.tipo === 'DEVOLUCAO' && (
                        <div className="space-y-2 border p-3 rounded-md bg-muted/20">
                            <Label className="text-primary font-semibold">Abatimento de Faturas</Label>
                            <p className="text-[11px] text-muted-foreground mb-2">
                                Esta venda possui faturas pendentes. Como o valor devolvido deve ser abatido nelas?
                            </p>
                            <Select value={form.rateio_modo} onChange={e => setForm({ ...form, rateio_modo: e.target.value })}>
                                <option value="padrao">Padrão (Deduzir das últimas parcelas)</option>
                                <option value="especifica">Abater de uma fatura específica</option>
                                <option value="igual">Proporcional (Dividir o abatimento igualmente)</option>
                            </Select>

                            {form.rateio_modo === 'especifica' && (
                                <div className="mt-2">
                                    <Label className="text-xs">Fatura específica</Label>
                                    <Select 
                                        value={form.rateio_fatura_id} 
                                        onChange={e => setForm({ ...form, rateio_fatura_id: e.target.value })}
                                        required={form.rateio_modo === 'especifica'}
                                    >
                                        <option value="">-- Selecione uma fatura --</option>
                                        {faturasPendentes.map(f => (
                                            <option key={f.id} value={f.id}>
                                                Venc. {fmtDate(f.data_vencimento)} - {fmt(f.valor)}
                                            </option>
                                        ))}
                                    </Select>
                                </div>
                            )}
                        </div>
                    )}
                    <div className="space-y-2">
                        <Label>Valor do Reembolso (R$)</Label>
                        <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0,00"
                            value={form.valor_reembolso}
                            onChange={e => setForm({ ...form, valor_reembolso: e.target.value })}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Observações</Label>
                        <textarea
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none h-20"
                            value={form.observacoes}
                            onChange={e => setForm({ ...form, observacoes: e.target.value })}
                            placeholder="Detalhes adicionais..."
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <Button
                            variant="outline"
                            type="button"
                            onClick={() => {
                                setIsModalOpen(false)
                                setEditingItem(null)
                                resetForm()
                                resetVendaContext()
                            }}
                        >
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={submitting}>{submitting ? 'Salvando...' : editingItem ? 'Salvar' : 'Registrar'}</Button>
                    </div>
                </form>
            </Modal>

            {/* Modal de impressão - Nota de Devolução */}
            <Modal isOpen={isPrintModalOpen} onClose={() => { setIsPrintModalOpen(false); setSelectedDevolucaoForPrint(null) }} title="Nota de Devolução" className="max-w-4xl">
                <div className="space-y-4">
                    <div className="flex items-center gap-3 no-print">
                        <Label className="text-sm font-bold">Formato:</Label>
                        <div className="flex gap-2">
                            {(['a4', 'a5', 'cupom'] as const).map((fmt) => (
                                <Button key={fmt} type="button" variant={printFormat === fmt ? 'default' : 'outline'} size="sm" onClick={() => setPrintFormat(fmt)}>
                                    {fmt.toUpperCase()}
                                </Button>
                            ))}
                        </div>
                        <Button className="ml-auto" onClick={() => window.print()}>
                            <Printer className="w-4 h-4 mr-2" /> Imprimir
                        </Button>
                    </div>

                    {selectedDevolucaoForPrint && (
                        <div
                            className={`bg-white text-black p-6 ${printFormat === 'cupom' ? 'max-w-[80mm]' : printFormat === 'a5' ? 'max-w-[148mm]' : 'max-w-[210mm]'}`}
                            data-print-format={printFormat}
                        >
                            <style>{`
                                @media print {
                                    @page { margin: ${printFormat === 'cupom' ? '2mm' : printFormat === 'a5' ? '12mm' : '15mm'}; size: ${printFormat === 'cupom' ? '80mm auto' : printFormat === 'a5' ? 'A5' : 'A4'}; }
                                    html, body { background: white !important; margin: 0 !important; padding: 0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                                    #root, .modal-backdrop, .no-print { display: none !important; }
                                    [role="dialog"] { position: static !important; display: block !important; overflow: visible !important; max-height: none !important; padding: 0 !important; }
                                    .modal-container { position: static !important; display: block !important; overflow: visible !important; max-height: none !important; max-width: none !important; width: 100% !important; box-shadow: none !important; border: none !important; background: white !important; }
                                    .modal-body { overflow: visible !important; max-height: none !important; padding: 0 !important; }
                                    [data-print-format] { width: 100% !important; max-width: 100% !important; padding: 0 !important; margin: 0 !important; }
                                }
                            `}</style>

                            <div className={`space-y-4 ${printFormat}`}>
                                {/* Cabeçalho empresa */}
                                <div className="border-b-2 border-black pb-3">
                                    <div className="flex items-center gap-3">
                                        <Package className="w-10 h-10 text-black" />
                                        <div>
                                            <p className="font-black text-xl">{company?.nome_fantasia || 'LOJA'}</p>
                                            <p className="text-[10px] italic">Nota de Devolução</p>
                                        </div>
                                    </div>
                                    <div className="mt-2 text-[10px]">
                                        <p>{company?.logradouro}, {company?.numero} - {company?.bairro}</p>
                                        <p>{company?.cidade}/{company?.estado} - CNPJ: {company?.cnpj || '---'}</p>
                                        <p>Tel: {company?.telefone || '---'}</p>
                                    </div>
                                </div>

                                <div className="text-center">
                                    <p className="text-lg font-black uppercase">NOTA DE DEVOLUÇÃO</p>
                                    <p className="text-sm font-bold">Data: {fmtDate(selectedDevolucaoForPrint.created_at)}</p>
                                    <p className="text-[10px]">Emitido em: {fmtDateTime(new Date())}</p>
                                </div>

                                {/* Dados da venda original */}
                                {selectedDevolucaoForPrint.venda && (
                                    <div className="border border-black p-3 bg-gray-50">
                                        <p className="font-bold text-xs uppercase mb-2">Referência à venda original</p>
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                                            <p><span className="font-bold">Pedido:</span> #{formatNumPedido(selectedDevolucaoForPrint.venda.numero_pedido)}</p>
                                            <p><span className="font-bold">Data da venda:</span> {fmtDate(selectedDevolucaoForPrint.venda.data_venda)}</p>
                                            <p><span className="font-bold">Vendedor:</span> {selectedDevolucaoForPrint.venda.vendedor?.nome || selectedDevolucaoForPrint.venda.atendente?.nome || 'N/A'}</p>
                                            <p><span className="font-bold">Total da venda:</span> {fmt(selectedDevolucaoForPrint.venda.total || 0)}</p>
                                            <p><span className="font-bold">Forma pagamento:</span> {selectedDevolucaoForPrint.venda.forma_pagamento || '---'}</p>
                                        </div>
                                        {selectedDevolucaoForPrint.venda.entrega && (
                                            <div className="mt-2 pt-2 border-t border-black/30 text-[10px]">
                                                <p className="font-bold">Entrega:</p>
                                                <p>{selectedDevolucaoForPrint.venda.entrega.rua}, {selectedDevolucaoForPrint.venda.entrega.numero} - {selectedDevolucaoForPrint.venda.entrega.bairro}</p>
                                                <p>{selectedDevolucaoForPrint.venda.entrega.cidade}/{selectedDevolucaoForPrint.venda.entrega.estado}</p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Informações do Cliente */}
                                {(selectedDevolucaoForPrint.clientes || selectedDevolucaoForPrint.venda?.clientes) && (
                                    <div className="border border-black p-3">
                                        <p className="font-bold text-xs uppercase mb-2">Informações do Cliente</p>
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                                            <p><span className="font-bold">Cliente:</span> {selectedDevolucaoForPrint.clientes?.nome || selectedDevolucaoForPrint.venda?.clientes?.nome || '---'}</p>
                                            <p><span className="font-bold">CPF/CNPJ:</span> {selectedDevolucaoForPrint.cliente_documento || selectedDevolucaoForPrint.clientes?.documento || selectedDevolucaoForPrint.venda?.clientes?.documento || '---'}</p>
                                            <p><span className="font-bold">Telefone:</span> {selectedDevolucaoForPrint.cliente_telefone || selectedDevolucaoForPrint.clientes?.telefone || selectedDevolucaoForPrint.venda?.clientes?.telefone || '---'}</p>
                                            <p><span className="font-bold">E-mail:</span> {selectedDevolucaoForPrint.cliente_email || selectedDevolucaoForPrint.clientes?.email || selectedDevolucaoForPrint.venda?.clientes?.email || '---'}</p>
                                        </div>
                                    </div>
                                )}

                                {/* Itens devolvidos */}
                                <div className="border-t-2 border-black pt-3">
                                    <p className="font-bold text-xs uppercase mb-2">Itens devolvidos</p>
                                    <table className="w-full text-[11px] border-collapse">
                                        <thead>
                                            <tr className="border-b-2 border-black">
                                                <th className="text-left py-1">#</th>
                                                <th className="text-left">Produto</th>
                                                <th className="text-right">SKU</th>
                                                <th className="text-center">Qtd</th>
                                                <th className="text-right">Unit. (pago)</th>
                                                <th className="text-right">Subtotal</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(selectedDevolucaoForPrint.itens || []).length > 0 ? (
                                                selectedDevolucaoForPrint.itens.map((i: any, idx: number) => (
                                                    <tr key={idx} className="border-b border-dotted border-black/40">
                                                        <td className="py-1">{idx + 1}</td>
                                                        <td>{(i.produtos || i.produto)?.nome || 'Produto'}</td>
                                                        <td className="font-mono text-right">{(i.produtos || i.produto)?.sku || '---'}</td>
                                                        <td className="text-center">{i.quantidade}</td>
                                                        <td className="text-right">{Number(i.preco_unitario || 0).toFixed(2)}</td>
                                                        <td className="text-right font-bold">{fmt(i.subtotal || 0)}</td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr>
                                                    <td colSpan={6} className="py-4 text-center text-gray-500">Devolução sem itens detalhados</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Totais e reembolso */}
                                <div className="border-t-2 border-black pt-3 space-y-1">
                                    <div className="flex justify-between font-bold text-lg">
                                        <span>Valor do reembolso:</span>
                                        <span className="text-rose-600">{fmt(selectedDevolucaoForPrint.valor_reembolso || 0)}</span>
                                    </div>
                                    <div className="flex justify-between text-[11px]">
                                        <span><span className="font-bold">Forma de reembolso:</span> {selectedDevolucaoForPrint.forma_reembolso || 'Dinheiro'}</span>
                                        <span><span className="font-bold">Status:</span> {selectedDevolucaoForPrint.status}</span>
                                    </div>
                                </div>

                                {/* Motivo e observações */}
                                <div className="border-t border-dashed pt-3 space-y-1 text-[11px]">
                                    {selectedDevolucaoForPrint.motivo && (
                                        <p><span className="font-bold">Motivo:</span> {selectedDevolucaoForPrint.motivo}</p>
                                    )}
                                    {selectedDevolucaoForPrint.observacoes && (
                                        <p><span className="font-bold">Observações:</span> {selectedDevolucaoForPrint.observacoes}</p>
                                    )}
                                </div>

                                <div className="mt-8 pt-4 border-t-2 border-black text-center text-[10px]">
                                    <p>*** Este documento não substitui a Nota Fiscal ***</p>
                                    <p className="mt-4">_________________________________________</p>
                                    <p>Assinatura do responsável</p>
                                    <p className="mt-4 italic opacity-70">{company?.nome_fantasia || 'CRM'} - Nota de Devolução</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {!selectedDevolucaoForPrint && (
                        <div className="py-12 text-center text-muted-foreground animate-pulse">Carregando...</div>
                    )}
                </div>
            </Modal>
        </div>
    )
}
