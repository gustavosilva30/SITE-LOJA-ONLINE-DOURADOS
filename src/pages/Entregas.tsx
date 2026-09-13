import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Modal } from "@/components/ui/modal"
import { Plus, Search, Truck, PackageCheck, Package, Clock, AlertTriangle, Trash2, Printer, Pencil, CalendarDays, MapPin, Users, ExternalLink, ShoppingBag, Navigation, Sparkles, ChevronRight, Play, RefreshCw } from "lucide-react"
import { entregasApi, configuracoesApi, vendasApi, logisticaGoogleApi, logisticaBoletosApi, atendentesApi, clientesApi } from "@/lib/api"
import { useAuthStore } from "@/store/authStore"
import { logAcao } from "@/lib/systemLog"
import { formatCepMascara, buscarEnderecoPorCep } from "@/lib/viacep"
import { cn } from "@/lib/utils"
import { formatNumPedido } from "@/lib/format"

const HORARIOS_ENTREGA = ['09:00', '13:00', '15:00'] as const

function hojeLocalISO(): string {
    return new Date().toLocaleDateString("en-CA")
}

/** Cadeia linear (sem voltar de Entregue → Preparando). Aceita variações sem acento no DB. */
const ENTREGA_STATUS_CHAIN = ['Preparando', 'Em Trânsito', 'Entregue'] as const

function getEffectivePaymentStatus(e: Entrega): string {
    if (!e) return 'A Receber'
    if (!e.venda_id || !e.vendas) return e.status_pagamento || 'A Receber'
    
    const v = e.vendas
    const statusVenda = v.status || ''
    const formaPagamento = (v.forma_pagamento || '').toUpperCase()
    
    // Venda pendente ainda não tem fluxo de pagamento concluído
    if (statusVenda === 'Pendente') return 'A Receber'
    
    // Se a venda está Concluída/Paga ou tem pagamento parcial
    if (statusVenda === 'Concluído' || statusVenda === 'Pago' || statusVenda === 'Pagamento Parcial') {
        const isAssinar = formaPagamento.includes('BOLETO') || formaPagamento.includes('RECEBER')
        
        // Se for boleto/receber, o fluxo é coletar assinatura
        if (isAssinar) {
            return e.status === 'Entregue' ? 'Assinado' : 'Assinar'
        }
        
        // Se já pagou tudo, está Pago
        if ((v.total_pago || 0) >= (v.total || 0)) return 'Pago'
    }
    
    // Fallback para o status manual da entrega
    return e.status_pagamento || 'A Receber'
}

function normalizeEntregaStatus(s: string | undefined | null): string {
    if (!s) return 'Preparando'
    const t = (s || '').trim()
    if (!t) return 'Preparando'
    const deacc = t.normalize('NFD').replace(/\p{M}/gu, '')
    const lower = deacc.toLowerCase()
    if (lower === 'em transito') return 'Em Trânsito'
    if (lower.includes('atrasad')) return 'Em Trânsito'
    return t
}

function getNextEntregaStatus(current: string | undefined | null): string | null {
    const cur = normalizeEntregaStatus(current)
    const i = (ENTREGA_STATUS_CHAIN as readonly string[]).indexOf(cur)
    if (i === -1) return null
    if (i >= ENTREGA_STATUS_CHAIN.length - 1) return null
    return ENTREGA_STATUS_CHAIN[i + 1]
}

interface Entrega {
    id: string
    venda_id: string | null
    cliente_nome: string | null
    cliente_contato: string | null
    recebedor_nome: string | null
    rua: string | null
    bairro: string | null
    numero: string | null
    cidade?: string | null
    estado?: string | null
    cep?: string | null
    transportadora_id: string | null
    codigo_rastreio: string | null
    status: string
    status_pagamento: 'Pago' | 'A Receber' | string
    forma_pagamento?: string | null
    horario_entrega?: string | null
    observacao_entrega?: string | null
    data_envio: string | null
    data_entrega: string | null
    created_at: string
    vendas?: {
        id: string
        numero_pedido?: number
        status?: string
        total?: number
        total_pago?: number
        forma_pagamento?: string | null
        clientes: { nome: string }
    }
}

export function Entregas() {
    const { atendente } = useAuthStore()
    const [searchTerm, setSearchTerm] = useState("")
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [isOptimizing, setIsOptimizing] = useState(false)
    const [entregas, setEntregas] = useState<Entrega[]>([])
    const [loading, setLoading] = useState(true)
    /** Dia civil (YYYY-MM-DD); o backend filtra em America/Sao_Paulo (criação, data da venda ou última atualização da venda). */
    const [dataFiltro, setDataFiltro] = useState(() => hojeLocalISO())
    /** Por defeito mostra todas: o filtro “só hoje” escondia entregas ligadas a vendas atualizadas hoje com created_at antigo na entrega. */
    const [mostrarTodasDatas, setMostrarTodasDatas] = useState(false)
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false)
    const [deliveryHistory, setDeliveryHistory] = useState<any[]>([])
    const [selectedDeliveryIdForHistory, setSelectedDeliveryIdForHistory] = useState<string | null>(null)
    const [loadingHistory, setLoadingHistory] = useState(false)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingEntregaId, setEditingEntregaId] = useState<string | null>(null)
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false)
    const [selectedDeliveryForPrint, setSelectedDeliveryForPrint] = useState<Entrega | null>(null)
    const [company, setCompany] = useState<any>(null)
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
    const [viewingEntrega, setViewingEntrega] = useState<Entrega | null>(null)
    const [viewingProducts, setViewingProducts] = useState<any[]>([])
    const [loadingProducts, setLoadingProducts] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [buscandoCep, setBuscandoCep] = useState(false)
    const emptyForm = () => ({
        cliente_nome: '',
        cliente_contato: '',
        recebedor_nome: '',
        rua: '',
        bairro: '',
        numero: '',
        cidade: 'Dourados',
        estado: 'MS',
        cep: '',
        codigo_rastreio: '',
        horario_entrega: '09:00',
        observacao_entrega: '',
        status_pagamento: 'A Receber' as 'A Receber' | 'Pago',
        status: 'Preparando' as string,
        data_envio: '' as string,
        data_entrega: '' as string,
        forma_pagamento: '' as string,
    })
    const [isDriverModalOpen, setIsDriverModalOpen] = useState(false)
    const [atendentes, setAtendentes] = useState<any[]>([])
    const [selectedDriverId, setSelectedDriverId] = useState('')
    const [isCreatingRoute, setIsCreatingRoute] = useState(false)
    const [formData, setFormData] = useState(emptyForm)

    // Busca de cliente cadastrado no formulário avulso
    const [clienteSearch, setClienteSearch] = useState('')
    const [clienteResults, setClienteResults] = useState<any[]>([])
    const [clienteSearchLoading, setClienteSearchLoading] = useState(false)
    const [clienteSearchOpen, setClienteSearchOpen] = useState(false)

    const navigate = useNavigate()

    const fetchEntregas = async () => {
        setLoading(true)
        try {
            const params: Record<string, string> = {}
            if (!mostrarTodasDatas) {
                params.data_civil = dataFiltro
            }
            const rows = await entregasApi.listar(params)
            setEntregas(rows || [])
        } catch (err: any) {
            console.error('Error fetching entregas:', err)
            alert('Erro ao carregar entregas: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        configuracoesApi.obter().then((data) => setCompany(data)).catch(() => {})
    }, [])

    useEffect(() => {
        void fetchEntregas()
        // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchEntregas usa estados do filtro
    }, [dataFiltro, mostrarTodasDatas])

    const fetchHistory = async (id: string) => {
        setLoadingHistory(true)
        setSelectedDeliveryIdForHistory(id)
        setIsHistoryModalOpen(true)
        try {
            const data = await entregasApi.listarHistorico(id)
            setDeliveryHistory(data)
        } catch (err: any) {
            console.error("Erro ao buscar histórico:", err)
        } finally {
            setLoadingHistory(false)
        }
    }

    const updateStatus = async (id: string, currentStatus: string) => {
        const next = getNextEntregaStatus(currentStatus)
        if (!next) {
            alert('Esta entrega já está no último status (Entregue).')
            return
        }

        try {
            const payload: any = { status: next }
            if (next === 'Em Trânsito') {
                payload.data_envio = new Date().toISOString()
                
                // Abrir mapa automaticamente ao iniciar entrega
                const e = entregas.find(ent => ent.id === id)
                if (e) {
                    const addr = [e.rua, e.numero, e.bairro, e.cidade, e.estado].filter(Boolean).join(", ")
                    if (addr) {
                        window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`, '_blank')
                    }
                }
            }
            if (next === 'Entregue') {
                payload.data_entrega = new Date().toISOString()
            }

            await entregasApi.atualizar(id, payload)
            logAcao('entrega.status', `Entrega ${id.slice(0, 8)}… → ${next}`, atendente?.id)
            await fetchEntregas()
        } catch (err: any) {
            console.error('updateStatus', err)
            const msg = err?.response?.data?.detail || err?.message || String(err)
            alert('Não foi possível atualizar o status: ' + msg)
        }
    }

    const togglePaymentStatus = async (id: string, currentStatus: string) => {
        const nextStatus = currentStatus === 'Pago' ? 'A Receber' : 'Pago'
        try {
            await entregasApi.atualizar(id, { status_pagamento: nextStatus })
            logAcao('entrega.pagamento', `Entrega ${id.slice(0, 8)}… pagamento → ${nextStatus}`, atendente?.id)
            fetchEntregas()
        } catch (err: any) {
            console.error('togglePaymentStatus', err)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm("Excluir registro de entrega?")) return
        try {
            await entregasApi.deletar(id)
            logAcao('entrega.excluir', `Entrega removida (id ${id.slice(0, 8)}…)`, atendente?.id)
            fetchEntregas()
        } catch (err: any) {
            alert("Erro ao excluir: " + (err.message || ''))
        }
    }

    const handlePrintDelivery = (entrega: Entrega) => {
        setSelectedDeliveryForPrint(entrega)
        setIsPrintModalOpen(true)
    }

    const closeEntregaModal = () => {
        setIsModalOpen(false)
        setEditingEntregaId(null)
        setFormData(emptyForm())
        setClienteSearch('')
        setClienteResults([])
        setClienteSearchOpen(false)
    }

    const openDetalhesEntrega = (e: Entrega) => {
        setViewingEntrega(e)
        setViewingProducts([])
        setIsDetailModalOpen(true)
        if (e.venda_id) {
            void fetchVendaItens(e.venda_id)
        }
    }

    const fetchVendaItens = async (vendaId: string) => {
        setLoadingProducts(true)
        try {
            const items = await vendasApi.itensPorVendas([vendaId])
            setViewingProducts(items)
        } catch (err: any) {
            console.error("Erro ao buscar itens da venda:", err)
        } finally {
            setLoadingProducts(false)
        }
    }

    const handleGpsClick = (e: Entrega) => {
        const addr = [e.rua, e.numero, e.bairro, e.cidade, e.estado].filter(Boolean).join(", ")
        if (!addr) {
            alert("Endereço não preenchido.")
            return
        }

        if (e.status === 'Preparando') {
            if (confirm("Deseja iniciar esta entrega e abrir o GPS?")) {
                void updateStatus(e.id, e.status)
                setIsDetailModalOpen(false)
                window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`, '_blank')
            }
        } else {
            window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`, '_blank')
        }
    }

    const openNovaEntrega = () => {
        setEditingEntregaId(null)
        setFormData(emptyForm())
        setIsModalOpen(true)
    }

    const buscarCepEntrega = async () => {
        setBuscandoCep(true)
        try {
            const data = await buscarEnderecoPorCep(formData.cep || '')
            setFormData(prev => ({
                ...prev,
                cep: data.cep,
                rua: data.logradouro || prev.rua,
                bairro: data.bairro || prev.bairro,
                cidade: data.localidade || prev.cidade,
                estado: data.uf || prev.estado,
            }))
        } catch (err: any) {
            alert(err?.message || 'Não foi possível buscar o CEP.')
        } finally {
            setBuscandoCep(false)
        }
    }

    const handleClienteSearch = async (q: string) => {
        setClienteSearch(q)
        if (q.trim().length < 2) {
            setClienteResults([])
            setClienteSearchOpen(false)
            return
        }
        setClienteSearchLoading(true)
        setClienteSearchOpen(true)
        try {
            const res = await clientesApi.listar({ q: q.trim(), limit: 8 })
            const items = Array.isArray(res) ? res : (Array.isArray(res?.items) ? res.items : [])
            setClienteResults(items)
        } catch {
            setClienteResults([])
        } finally {
            setClienteSearchLoading(false)
        }
    }

    const handleClienteSelect = (cliente: any) => {
        let rua = (cliente.endereco_logradouro || cliente.endereco || '').trim();
        let numero = (cliente.endereco_numero || '').trim();
        let bairro = (cliente.endereco_bairro || '').trim();

        // Se a rua parece conter o endereço completo e o número/bairro estão vazios, tenta extrair
        if (rua && !numero && !bairro) {
            // Caso 1: "Rua Alguma Coisa, 123 - Bairro"
            const parts = rua.split(/[,–-]/).map(s => s.trim()).filter(Boolean);
            if (parts.length >= 2) {
                rua = parts[0];
                numero = parts[1];
                if (parts.length >= 3) {
                    bairro = parts.slice(2).join(' - ');
                }
            } else {
                // Caso 2: "Rua Alguma Coisa 123 Bairro"
                // Procura por um padrão de número (pode ter letras como 123A ou s/n)
                const match = rua.match(/^(.+?)\s+(\d+[a-zA-Z]?|s\/n|S\/N)\s+(.*)$/i);
                if (match) {
                    rua = match[1].trim();
                    numero = match[2].trim();
                    bairro = match[3].trim();
                }
            }
        }

        setFormData(prev => ({
            ...prev,
            cliente_nome: cliente.nome || prev.cliente_nome,
            cliente_contato: cliente.telefone || cliente.whatsapp || cliente.celular || prev.cliente_contato,
            rua: rua || prev.rua,
            numero: numero || prev.numero,
            bairro: bairro || prev.bairro,
            cidade: cliente.endereco_cidade || prev.cidade,
            estado: cliente.endereco_uf || prev.estado,
            cep: String(cliente.cep || '').replace(/\D/g, '').slice(0, 8) || prev.cep,
        }))
        setClienteSearch('')
        setClienteResults([])
        setClienteSearchOpen(false)
    }

    const openEditarEntrega = (e: Entrega) => {
        setEditingEntregaId(e.id)
        setFormData({
            cliente_nome: e.cliente_nome || '',
            cliente_contato: e.cliente_contato || '',
            recebedor_nome: e.recebedor_nome || '',
            rua: e.rua || '',
            bairro: e.bairro || '',
            numero: e.numero || '',
            cidade: e.cidade || 'Dourados',
            estado: e.estado || 'MS',
            cep: String(e.cep || '').replace(/\D/g, '').slice(0, 8),
            codigo_rastreio: e.codigo_rastreio || '',
            horario_entrega: e.horario_entrega || '09:00',
            observacao_entrega: e.observacao_entrega || '',
            status_pagamento: e.status_pagamento === 'Pago' ? 'Pago' : 'A Receber',
            status: e.status || 'Preparando',
            data_envio: e.data_envio ? new Date(e.data_envio).toISOString().slice(0, 16) : '',
            data_entrega: e.data_entrega ? new Date(e.data_entrega).toISOString().slice(0, 16) : '',
            forma_pagamento: e.forma_pagamento || '',
        })
        setIsModalOpen(true)
    }

    const handleSubmitEntrega = async (e: React.FormEvent) => {
        e.preventDefault()
        setSubmitting(true)
        try {
            const cepDigits = String(formData.cep || '').replace(/\D/g, '').slice(0, 8)
            const payload = {
                cliente_nome: formData.cliente_nome || null,
                cliente_contato: formData.cliente_contato || null,
                recebedor_nome: formData.recebedor_nome || null,
                rua: formData.rua || null,
                bairro: formData.bairro || null,
                numero: formData.numero || null,
                cidade: formData.cidade || null,
                estado: formData.estado || null,
                cep: cepDigits.length === 8 ? cepDigits : null,
                codigo_rastreio: formData.codigo_rastreio || null,
                horario_entrega: formData.horario_entrega,
                observacao_entrega: formData.observacao_entrega || null,
                status_pagamento: formData.status_pagamento,
                status: formData.status,
                data_envio: formData.data_envio ? new Date(formData.data_envio).toISOString() : null,
                data_entrega: formData.data_entrega ? new Date(formData.data_entrega).toISOString() : null,
                forma_pagamento: formData.forma_pagamento || null,
            }

            if (editingEntregaId) {
                await entregasApi.atualizar(editingEntregaId, payload)
                logAcao(
                    'entrega.editar',
                    `Entrega atualizada — ${(formData.cliente_nome || 'Cliente').slice(0, 80)} (${formData.status})`,
                    atendente?.id
                )
                closeEntregaModal()
                await fetchEntregas()
            } else {
                await entregasApi.criar(payload)
                logAcao(
                    'entrega.criar',
                    `Nova entrega — ${(formData.cliente_nome || 'Cliente').slice(0, 80)} (${formData.status})`,
                    atendente?.id
                )
                closeEntregaModal()
                await fetchEntregas()
            }
        } catch (err: any) {
            alert(editingEntregaId ? 'Erro ao salvar entrega: ' + err.message : 'Erro ao cadastrar entrega: ' + err.message)
        } finally {
            setSubmitting(false)
        }
    }

    const handleOptimizeRoute = async () => {
        if (selectedIds.length < 2) {
            alert("Selecione ao menos 2 entregas para otimizar a rota.")
            return
        }

        setIsOptimizing(true)
        try {
            const selectedEntregas = filteredEntregas.filter(e => selectedIds.includes(e.id))
            const destinos = selectedEntregas.map(e =>
                [e.rua, e.numero, e.bairro, e.cidade, e.estado].filter(Boolean).join(", ")
            ).filter(d => d.trim().length > 5)

            if (destinos.length < 2) {
                alert("As entregas selecionadas não possuem endereços válidos o suficiente para otimização.")
                return
            }

            const res = await logisticaGoogleApi.otimizar(destinos)
            
            if (res.waypoint_order) {
                // Aqui o Google retornou a ordem ideal.
                // Como Entregas.tsx é uma listagem plana, 
                // podemos mostrar um alerta com a ordem sugerida ou redirecionar.
                // Para simplificar, vamos abrir o Google Maps com a rota completa otimizada.
                
                const waypoints = res.waypoint_order.map((idx: number) => {
                    const e = selectedEntregas[idx]
                    return `${e.rua}, ${e.numero}, ${e.bairro}, ${e.cidade}, ${e.estado}`
                }).join("/")

                const mapsUrl = `https://www.google.com/maps/dir/Dourados,MS/${waypoints}/Dourados,MS`
                window.open(mapsUrl, '_blank')
            }
        } catch (err: any) {
            alert("Erro ao otimizar: " + err.message)
        } finally {
            setIsOptimizing(false)
        }
    }

    const openGerarRota = async () => {
        setIsDriverModalOpen(true)
        try {
            const res = await atendentesApi.listar()
            setAtendentes(res || [])
        } catch (e) {
            console.warn('Erro ao carregar atendentes:', e)
        }
    }

    const handleConfirmCreateRoute = async () => {
        if (!selectedDriverId) {
            alert("Selecione um motorista/entregador.")
            return
        }

        // Se o usuário selecionou alguns IDs, usa eles. Se não, pega todos os 'Preparando' da lista filtrada.
        let targetEntregas = []
        if (selectedIds.length > 0) {
            targetEntregas = filteredEntregas.filter(e => selectedIds.includes(e.id))
        } else {
            targetEntregas = filteredEntregas.filter(e => e.status === 'Preparando')
        }

        if (targetEntregas.length === 0) {
            alert("Nenhuma entrega pendente para gerar rota.")
            return
        }

        setIsCreatingRoute(true)
        try {
            // Otimizar primeiro via Google
            const destinos = targetEntregas.map(e => 
                [e.rua, e.numero, e.bairro, e.cidade, e.state || e.estado].filter(Boolean).join(", ")
            ).filter(d => d.trim().length > 5)

            let resOpt: any = { waypoint_order: null }
            if (destinos.length >= 1) {
                try {
                    resOpt = await logisticaGoogleApi.otimizar(destinos)
                } catch (optErr) {
                    console.warn("Erro ao otimizar rota (Google), seguindo com ordem original:", optErr)
                }
            }
            
            let paradasOrdenadas = []
            if (resOpt.waypoint_order) {
                paradasOrdenadas = resOpt.waypoint_order.map((idx: number, order: number) => {
                    const e = targetEntregas[idx]
                    return {
                        entrega_id: e.id,
                        cliente_id: (e.vendas as any)?.cliente_id || null,
                        ordem: order,
                        observacao: e.observacao_entrega
                    }
                })
            } else {
                paradasOrdenadas = targetEntregas.map((e, i) => ({
                    entrega_id: e.id,
                    cliente_id: (e.vendas as any)?.cliente_id || null,
                    ordem: i,
                    observacao: e.observacao_entrega
                }))
            }

            await logisticaBoletosApi.criarRota({
                entregador_id: selectedDriverId,
                data_rota: dataFiltro,
                paradas: paradasOrdenadas
            })

            // Atualizar status das entregas para 'Em Trânsito'
            for (const ent of targetEntregas) {
                await entregasApi.atualizar(ent.id, { 
                    status: 'Em Trânsito',
                    data_envio: new Date().toISOString()
                })
            }

            alert("Rota gerada com sucesso! O entregador já pode ver a rota no celular.")
            setIsDriverModalOpen(false)
            setSelectedIds([])
            fetchEntregas()
            navigate('/logistica-boletos')
        } catch (err: any) {
            alert("Erro ao criar rota: " + err.message)
        } finally {
            setIsCreatingRoute(false)
        }
    }

    const filteredEntregas = entregas.filter(e => {
        if (!searchTerm.trim()) return true
        const term = searchTerm.toLowerCase()
        return (
            (e.vendas?.clientes?.nome || e.cliente_nome || '').toLowerCase().includes(term) ||
            (e.codigo_rastreio || '').toLowerCase().includes(term) ||
            (e.venda_id || '').toLowerCase().includes(term)
        )
    })

    const entregasAtivas = entregas.filter(e => e.status !== 'Entregue' && e.status !== 'Cancelado').length
    const entregasAtrasadas = entregas.filter(e => e.status === 'Atrasado').length

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Entregas</h1>
                    <p className="text-muted-foreground mt-1">Gerencie a logística, rastreio e prazos de entrega.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" className="gap-2" onClick={() => navigate('/logistica-boletos')}>
                        <Navigation className="w-4 h-4 text-primary" />
                        Logística de Boletos
                    </Button>
                    <Button variant="outline" className="gap-2" onClick={() => navigate('/configuracoes')}>
                        <Truck className="w-4 h-4" />
                        Configurar Logística
                    </Button>
                    <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={openGerarRota}>
                        <Navigation className="w-4 h-4" />
                        Gerar Rota
                    </Button>
                    <Button className="gap-2" onClick={openNovaEntrega}>
                        <Plus className="w-4 h-4" />
                        Nova Entrega
                    </Button>
                    {selectedIds.length > 0 && (
                        <Button 
                            className="gap-2 bg-purple-600 hover:bg-purple-700 animate-in zoom-in-50 duration-300" 
                            onClick={handleOptimizeRoute}
                            disabled={isOptimizing}
                        >
                            {isOptimizing ? <Clock className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            Otimizar Rota ({selectedIds.length})
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Entregas em Trânsito</CardTitle>
                        <Truck className="w-4 h-4 text-emerald-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-emerald-500">{entregasAtivas}</div>
                        <p className="text-xs text-muted-foreground mt-1">Pedidos saindo ou na rua</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Aguardando Coleta</CardTitle>
                        <Package className="w-4 h-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-primary">
                            {entregas.filter((e) => e.status === 'Preparando').length}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Status: Preparando</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Entregas Críticas</CardTitle>
                        <AlertTriangle className="w-4 h-4 text-rose-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-rose-500">{entregasAtrasadas}</div>
                        <p className="text-xs text-muted-foreground mt-1">Potencial atraso ou problema</p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="pb-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div className="relative w-full md:max-w-sm">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Buscar por cliente, rastreio..."
                                className="w-full bg-background border border-input rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="flex flex-wrap items-end gap-3 w-full md:w-auto">
                            <div className="space-y-1">
                                <Label className="text-xs flex items-center gap-1">
                                    <CalendarDays className="w-3.5 h-3.5" /> Data (Brasil)
                                </Label>
                                <Input
                                    type="date"
                                    className="w-[160px] h-9"
                                    value={dataFiltro}
                                    disabled={mostrarTodasDatas}
                                    onChange={(e) => setDataFiltro(e.target.value)}
                                />
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-9"
                                disabled={mostrarTodasDatas}
                                onClick={() => setDataFiltro(hojeLocalISO())}
                            >
                                Hoje
                            </Button>
                            <label className="flex items-center gap-2 text-sm cursor-pointer select-none pb-1.5">
                                <input
                                    type="checkbox"
                                    className="rounded border-input"
                                    checked={mostrarTodasDatas}
                                    onChange={(e) => setMostrarTodasDatas(e.target.checked)}
                                />
                                Ver todas as datas
                            </label>
                        </div>
                    </div>
                    {!mostrarTodasDatas && (
                        <p className="text-xs text-muted-foreground mt-2">
                            Mostrando entregas do dia{" "}
                            <strong>{new Date(dataFiltro + "T12:00:00").toLocaleDateString("pt-BR")}</strong>{" "}
                            (Brasília: criação da entrega, data da venda ou dia em que o pedido foi atualizado).
                        </p>
                    )}
                </CardHeader>
                <CardContent className="px-2 sm:px-6">
                    {loading ? (
                        <div className="flex items-center justify-center p-8 text-muted-foreground">
                            Carregando logística...
                        </div>
                    ) : (
                        <>
                            {/* VIEW DESKTOP */}
                            <div className="hidden md:block w-full overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-10">
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedIds.length === filteredEntregas.length && filteredEntregas.length > 0}
                                                    onChange={(e) => {
                                                        if (e.target.checked) setSelectedIds(filteredEntregas.map(ent => ent.id))
                                                        else setSelectedIds([])
                                                    }}
                                                />
                                            </TableHead>
                                            <TableHead>Pedido</TableHead>
                                            <TableHead>Cliente</TableHead>
                                            <TableHead>Rastreio</TableHead>
                                            <TableHead>Pagamento</TableHead>
                                            <TableHead>Criado em</TableHead>
                                            <TableHead>Previsto</TableHead>
                                            <TableHead>Saída (Real)</TableHead>
                                            <TableHead>Entrega (Real)</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead className="text-right">Ações</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredEntregas.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                                                    {mostrarTodasDatas
                                                        ? "Nenhuma entrega encontrada."
                                                        : `Nenhuma entrega criada nesta data. Altere a data ou marque "Ver todas as datas".`}
                                                </TableCell>
                                            </TableRow>
                                        ) : filteredEntregas.map((entrega) => (
                                            <TableRow key={entrega.id} className={selectedIds.includes(entrega.id) ? "bg-primary/5" : ""}>
                                                <TableCell>
                                                    <input 
                                                        type="checkbox" 
                                                        checked={selectedIds.includes(entrega.id)}
                                                        onChange={() => {
                                                            if (selectedIds.includes(entrega.id)) {
                                                                setSelectedIds(selectedIds.filter(id => id !== entrega.id))
                                                            } else {
                                                                setSelectedIds([...selectedIds, entrega.id])
                                                            }
                                                        }}
                                                    />
                                                </TableCell>
                                                <TableCell className="font-mono text-xs italic shrink-0">
                                                    {entrega.venda_id
                                                        ? entrega.vendas?.numero_pedido != null
                                                            ? `#${formatNumPedido(entrega.vendas.numero_pedido)}`
                                                            : `#${entrega.venda_id.slice(0, 8)}`
                                                        : "MANUAL"}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex-1">
                                                            <div className="font-medium text-sm">{entrega.recebedor_nome || entrega.vendas?.clientes?.nome || entrega.cliente_nome || "Cliente Eventual"}</div>
                                                            {entrega.recebedor_nome && (entrega.vendas?.clientes?.nome || entrega.cliente_nome) && (
                                                                <div className="text-[10px] text-muted-foreground mr-1">Comprador: {entrega.vendas?.clientes?.nome || entrega.cliente_nome}</div>
                                                            )}
                                                            {entrega.cliente_contato && <div className="text-[10px] text-muted-foreground">{entrega.cliente_contato}</div>}
                                                            <div className="text-[10px] text-primary font-bold uppercase mt-0.5 line-clamp-1">
                                                                {[entrega.rua, entrega.numero, entrega.bairro].filter(Boolean).join(", ") || <span className="italic font-normal text-muted-foreground normal-case">Sem endereço</span>}
                                                            </div>
                                                        </div>
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon" 
                                                            className="h-8 w-8 text-primary shrink-0" 
                                                            title="Ver no Mapa"
                                                            onClick={() => {
                                                                const addr = [entrega.rua, entrega.numero, entrega.bairro, entrega.cidade, entrega.estado].filter(Boolean).join(", ")
                                                                window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`, '_blank')
                                                            }}
                                                        >
                                                            <MapPin className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono tracking-tighter">
                                                        {entrega.codigo_rastreio || "-"}
                                                        {entrega.codigo_rastreio && <Button variant="ghost" size="icon" className="h-6 w-6"><PackageCheck className="w-3 h-3" /></Button>}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    {(() => {
                                                        const effectiveStatus = getEffectivePaymentStatus(entrega)
                                                        let badgeClass = "bg-amber-500 hover:bg-amber-600" // A Receber / Assinar
                                                        if (effectiveStatus === 'Pago' || effectiveStatus === 'Assinado') badgeClass = "bg-emerald-500 hover:bg-emerald-600"
                                                        
                                                        return (
                                                            <Badge
                                                                variant={effectiveStatus === 'Pago' || effectiveStatus === 'Assinado' ? 'default' : 'outline'}
                                                                className={`text-[10px] cursor-pointer hover:opacity-80 transition-opacity ${badgeClass}`}
                                                                onClick={() => togglePaymentStatus(entrega.id, entrega.status_pagamento)}
                                                            >
                                                                {effectiveStatus}
                                                            </Badge>
                                                        )
                                                    })()}
                                                </TableCell>
                                                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                                    <div className="font-medium">{new Date(entrega.created_at).toLocaleDateString("pt-BR")}</div>
                                                    <div className="text-[10px]">{new Date(entrega.created_at).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' })}</div>
                                                </TableCell>
                                                <TableCell className="text-xs">
                                                    <div className="font-bold text-primary">{entrega.horario_entrega || "-"}</div>
                                                </TableCell>
                                                <TableCell className="text-xs">
                                                    {entrega.data_envio ? (
                                                        <div className="flex flex-col">
                                                            <span className="font-medium">{new Date(entrega.data_envio).toLocaleDateString("pt-BR")}</span>
                                                            <span className="text-[10px] text-emerald-600 font-bold">{new Date(entrega.data_envio).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' })}</span>
                                                        </div>
                                                    ) : "-"}
                                                </TableCell>
                                                <TableCell className="text-xs">
                                                    {entrega.data_entrega ? (
                                                        <div className="flex flex-col">
                                                            <span className="font-medium">{new Date(entrega.data_entrega).toLocaleDateString("pt-BR")}</span>
                                                            <span className="text-[10px] text-blue-600 font-bold">{new Date(entrega.data_entrega).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' })}</span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-muted-foreground italic">Pendente</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge
                                                        variant={
                                                            entrega.status === 'Entregue' ? 'default' :
                                                                entrega.status === 'Em Trânsito' ? 'secondary' : 'outline'
                                                        }
                                                        className="text-[10px] uppercase font-bold tracking-tight"
                                                    >
                                                        {entrega.status}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex justify-end gap-1">
                                                        <Button variant="ghost" size="icon" onClick={() => fetchHistory(entrega.id)} title="Ver histórico de atualizações">
                                                            <Clock className="w-4 h-4 text-slate-500" />
                                                        </Button>
                                                        <Button variant="ghost" size="icon" onClick={() => openEditarEntrega(entrega)} title="Editar entrega">
                                                            <Pencil className="w-4 h-4 text-primary" />
                                                        </Button>
                                                        <Button variant="ghost" size="icon" onClick={() => handlePrintDelivery(entrega)} title="Imprimir Etiquetas/Entrega">
                                                            <Printer className="w-4 h-4 text-orange-500" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            disabled={getNextEntregaStatus(entrega.status) == null}
                                                            onClick={() => updateStatus(entrega.id, entrega.status)}
                                                            title={
                                                                getNextEntregaStatus(entrega.status) == null
                                                                    ? 'Já entregue'
                                                                    : `Avançar para: ${getNextEntregaStatus(entrega.status)}`
                                                            }
                                                        >
                                                            <PackageCheck className="w-4 h-4 text-emerald-500" />
                                                        </Button>
                                                        <Button variant="ghost" size="icon" onClick={() => handleDelete(entrega.id)} className="text-destructive">
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>

                            {/* VIEW MOBILE */}
                            <div className="block md:hidden space-y-4">
                                {filteredEntregas.length === 0 ? (
                                    <div className="text-center py-10 text-muted-foreground text-sm">
                                        Nenhuma entrega encontrada.
                                    </div>
                                ) : filteredEntregas.map((entrega) => (
                                    <div 
                                        key={entrega.id} 
                                        className={cn(
                                            "bg-card border rounded-2xl p-5 shadow-lg active:scale-[0.98] transition-all relative overflow-hidden",
                                            selectedIds.includes(entrega.id) ? "border-primary ring-2 ring-primary/20 bg-primary/5" : ""
                                        )}
                                    >
                                        <div className="absolute top-4 right-4 z-10" onClick={(e) => { e.stopPropagation(); }}>
                                            <input 
                                                type="checkbox" 
                                                className="w-6 h-6 accent-primary"
                                                checked={selectedIds.includes(entrega.id)}
                                                onChange={() => {
                                                    if (selectedIds.includes(entrega.id)) {
                                                        setSelectedIds(selectedIds.filter(id => id !== entrega.id))
                                                    } else {
                                                        setSelectedIds([...selectedIds, entrega.id])
                                                    }
                                                }}
                                            />
                                        </div>
                                        
                                        <div onClick={() => openDetalhesEntrega(entrega)}>
                                            <div className="flex justify-between items-start mb-3 pr-10">
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest font-bold">
                                                        {entrega.venda_id
                                                            ? entrega.vendas?.numero_pedido != null
                                                                ? `Pedido #${formatNumPedido(entrega.vendas.numero_pedido)}`
                                                                : `Pedido #${entrega.venda_id.slice(0, 8)}`
                                                            : "Manual"}
                                                    </span>
                                                    <h3 className="font-black text-xl leading-tight mt-1 text-slate-800">
                                                        {entrega.recebedor_nome || entrega.vendas?.clientes?.nome || entrega.cliente_nome || "Cliente Eventual"}
                                                    </h3>
                                                </div>
                                                <Badge
                                                    variant={
                                                        entrega.status === 'Entregue' ? 'default' :
                                                            entrega.status === 'Em Trânsito' ? 'secondary' : 'outline'
                                                    }
                                                    className="text-[10px] uppercase font-black px-3 py-1"
                                                >
                                                    {entrega.status}
                                                </Badge>
                                            </div>

                                            <div className="bg-primary/5 p-4 rounded-xl border border-primary/10 mb-4">
                                                <div className="flex items-start gap-3 text-primary">
                                                    <MapPin className="w-5 h-5 shrink-0 mt-0.5" />
                                                    <span className="text-lg font-bold leading-snug">
                                                        {entrega.rua}, {entrega.numero} <br/>
                                                        <span className="text-sm font-medium text-slate-600">{entrega.bairro} - {entrega.cidade}</span>
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="flex justify-between items-center mb-4 px-1">
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] text-muted-foreground uppercase font-black tracking-tighter">Financeiro</span>
                                                    <span className={`text-sm font-black ${
                                                        getEffectivePaymentStatus(entrega) === 'Pago' || getEffectivePaymentStatus(entrega) === 'Assinado'
                                                            ? 'text-emerald-600'
                                                            : 'text-amber-600'
                                                    }`}>
                                                        {getEffectivePaymentStatus(entrega)}
                                                    </span>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-[10px] text-muted-foreground uppercase font-black tracking-tighter">Previsão</span>
                                                    <div className="text-sm font-bold text-slate-700">{entrega.horario_entrega || "Não def."}</div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3 pt-2">
                                            <Button 
                                                variant="outline" 
                                                className="h-14 text-sm font-black gap-2 rounded-xl border-2"
                                                onClick={() => {
                                                    const addr = [entrega.rua, entrega.numero, entrega.bairro, entrega.cidade, entrega.estado].filter(Boolean).join(", ")
                                                    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`, '_blank')
                                                }}
                                            >
                                                <Navigation className="w-5 h-5" /> GPS
                                            </Button>
                                            <Button 
                                                variant="default" 
                                                className="h-14 text-sm font-black gap-2 rounded-xl bg-slate-900 shadow-lg"
                                                onClick={() => openDetalhesEntrega(entrega)}
                                            >
                                                Ações <ChevronRight className="w-5 h-5" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                                
                                {selectedIds.length > 0 && <div className="h-24" />}
                            </div>

                            {/* Botão de Otimização Fixo no Mobile */}
                            {selectedIds.length > 0 && (
                                <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-lg border-t z-50 md:hidden animate-in slide-in-from-bottom-10">
                                    <Button 
                                        className="w-full h-16 text-lg font-black gap-3 bg-purple-600 hover:bg-purple-700 shadow-2xl shadow-purple-500/20 rounded-2xl" 
                                        onClick={handleOptimizeRoute}
                                        disabled={isOptimizing}
                                    >
                                        {isOptimizing ? <Clock className="w-6 h-6 animate-spin" /> : <Sparkles className="w-6 h-6" />}
                                        OTIMIZAR ROTA ({selectedIds.length})
                                    </Button>
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>

            <Modal
                isOpen={isModalOpen}
                onClose={closeEntregaModal}
                title={editingEntregaId ? "Editar entrega" : "Novo cadastro de entrega"}
                className="max-w-md"
            >
                <form onSubmit={handleSubmitEntrega} className="space-y-4">
                    {/* Busca de cliente cadastrado — só para entrega avulsa (sem venda vinculada) */}
                    {!editingEntregaId && (
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                                <Users className="w-4 h-4" /> Buscar cliente cadastrado
                            </Label>
                            <div className="relative">
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                        <Input
                                            className="pl-9"
                                            placeholder="Nome, CPF ou telefone..."
                                            value={clienteSearch}
                                            onChange={e => handleClienteSearch(e.target.value)}
                                            onFocus={() => clienteResults.length > 0 && setClienteSearchOpen(true)}
                                            autoComplete="off"
                                        />
                                    </div>
                                    {clienteSearch && (
                                        <Button type="button" variant="ghost" size="icon" onClick={() => {
                                            setClienteSearch('')
                                            setClienteResults([])
                                            setClienteSearchOpen(false)
                                        }}>
                                            <span className="text-muted-foreground text-lg leading-none">×</span>
                                        </Button>
                                    )}
                                </div>
                                {clienteSearchOpen && (
                                    <div className="absolute z-50 w-full mt-1 rounded-lg border border-border bg-popover shadow-lg overflow-hidden">
                                        {clienteSearchLoading ? (
                                            <div className="px-4 py-3 text-sm text-muted-foreground">Buscando...</div>
                                        ) : clienteResults.length === 0 ? (
                                            <div className="px-4 py-3 text-sm text-muted-foreground">Nenhum cliente encontrado.</div>
                                        ) : clienteResults.map((c: any) => (
                                            <button
                                                key={c.id}
                                                type="button"
                                                className="w-full text-left px-4 py-2.5 hover:bg-accent text-sm border-b border-border last:border-0"
                                                onClick={() => handleClienteSelect(c)}
                                            >
                                                <div className="font-medium">{c.nome}</div>
                                                <div className="text-xs text-muted-foreground">
                                                    {[c.telefone || c.whatsapp || c.celular, c.endereco_logradouro && `${c.endereco_logradouro}${c.endereco_numero ? ', ' + c.endereco_numero : ''} — ${c.endereco_cidade || ''}`].filter(Boolean).join(' · ')}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <p className="text-[10px] text-muted-foreground">Selecione um cliente para preencher automaticamente nome, contato e endereço.</p>
                        </div>
                    )}
                    <div className="space-y-2">
                        <Label>Nome do Cliente</Label>
                        <Input required value={formData.cliente_nome} onChange={e => setFormData({ ...formData, cliente_nome: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                        <Label>Contato (Telefone/WhatsApp)</Label>
                        <Input value={formData.cliente_contato} onChange={e => setFormData({ ...formData, cliente_contato: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                        <Label>Nome de Quem Recebe</Label>
                        <Input placeholder="Opcional" value={formData.recebedor_nome} onChange={e => setFormData({ ...formData, recebedor_nome: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                        <Label>CEP</Label>
                        <div className="flex gap-2">
                            <Input
                                className="flex-1"
                                placeholder="00000-000"
                                inputMode="numeric"
                                autoComplete="postal-code"
                                maxLength={9}
                                value={formatCepMascara(formData.cep)}
                                onChange={e => {
                                    const v = e.target.value.replace(/\D/g, '').slice(0, 8)
                                    setFormData({ ...formData, cep: v })
                                }}
                            />
                            <Button
                                type="button"
                                variant="outline"
                                className="shrink-0"
                                disabled={buscandoCep}
                                onClick={buscarCepEntrega}
                                title="Preencher endereço pelo CEP (ViaCEP)"
                            >
                                <Search className={`w-4 h-4 ${buscandoCep ? 'animate-spin' : ''}`} />
                            </Button>
                        </div>
                        <p className="text-[10px] text-muted-foreground">Digite o CEP e clique na lupa para preencher rua, bairro, cidade e UF.</p>
                    </div>
                    <div className="space-y-2">
                        <Label>Rua / logradouro</Label>
                        <Input required value={formData.rua} onChange={e => setFormData({ ...formData, rua: e.target.value })} placeholder="Rua, avenida..." />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Número</Label>
                            <Input value={formData.numero} onChange={e => setFormData({ ...formData, numero: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                            <Label>Bairro</Label>
                            <Input value={formData.bairro} onChange={e => setFormData({ ...formData, bairro: e.target.value })} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Cidade</Label>
                            <Input value={formData.cidade} onChange={e => setFormData({ ...formData, cidade: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                            <Label>UF</Label>
                            <Input
                                maxLength={2}
                                className="uppercase"
                                value={formData.estado}
                                onChange={e => setFormData({ ...formData, estado: e.target.value.toUpperCase().replace(/[^A-Za-z]/g, '').slice(0, 2) })}
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Código de rastreio</Label>
                        <Input value={formData.codigo_rastreio} onChange={e => setFormData({ ...formData, codigo_rastreio: e.target.value })} placeholder="Opcional" />
                    </div>
                    <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                            <Clock className="w-4 h-4" /> Horário da Entrega
                        </Label>
                        <Select
                            value={formData.horario_entrega}
                            onChange={e => setFormData({ ...formData, horario_entrega: e.target.value })}
                        >
                            {HORARIOS_ENTREGA.map(h => (
                                <option key={h} value={h}>{h}</option>
                            ))}
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Observação da Entrega</Label>
                        <Input placeholder="Ex: Portão azul, deixar com vizinho..." value={formData.observacao_entrega} onChange={e => setFormData({ ...formData, observacao_entrega: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Pagamento</Label>
                            <Select
                                value={formData.status_pagamento}
                                onChange={e => setFormData({ ...formData, status_pagamento: e.target.value as any })}
                            >
                                <option value="A Receber">A Receber</option>
                                <option value="Pago">Pago</option>
                                <option value="Assinar">Assinar</option>
                                <option value="Assinado">Assinado</option>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Forma de Recebimento</Label>
                            <Select
                                value={formData.forma_pagamento}
                                onChange={e => setFormData({ ...formData, forma_pagamento: e.target.value })}
                            >
                                <option value="">--- Selecione ---</option>
                                <option value="DINHEIRO">Dinheiro</option>
                                <option value="PIX">Pix</option>
                                <option value="CARTAO">Cartão</option>
                                <option value="BOLETO">Boleto</option>
                            </Select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Status Inicial</Label>
                            <Select
                                value={formData.status}
                                onChange={e => setFormData({ ...formData, status: e.target.value })}
                            >
                                <option value="Preparando">Preparando</option>
                                <option value="Em Trânsito">Em Trânsito</option>
                                <option value="Entregue">Entregue</option>
                            </Select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Horário Saída (Real)</Label>
                            <Input 
                                type="datetime-local" 
                                value={formData.data_envio} 
                                onChange={e => setFormData({ ...formData, data_envio: e.target.value })} 
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Horário Entrega (Real)</Label>
                            <Input 
                                type="datetime-local" 
                                value={formData.data_entrega} 
                                onChange={e => setFormData({ ...formData, data_entrega: e.target.value })} 
                            />
                        </div>
                    </div>
                    <div className="pt-4 border-t flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={closeEntregaModal}>Cancelar</Button>
                        <Button type="submit" disabled={submitting}>
                            {editingEntregaId ? "Salvar alterações" : "Cadastrar entrega"}
                        </Button>
                    </div>
                </form>
            </Modal>

            <Modal
                isOpen={isPrintModalOpen}
                onClose={() => setIsPrintModalOpen(false)}
                title="Impressão de Entrega"
                className="max-w-md"
            >
                <div className="space-y-6">
                    {selectedDeliveryForPrint && (
                        <>
                            <div className="flex justify-center p-4 bg-muted/20 rounded-lg print-wrapper">
                                <div
                                    id="print-delivery-receipt"
                                    className="bg-white p-4 w-[300px] shadow-sm text-black font-sans leading-tight overflow-visible print:overflow-visible"
                                >
                                    <style>{`
                                        @media print {
                                            @page { size: 80mm auto; margin: 0; }
                                            body { margin: 0 !important; padding: 0 !important; background: white !important; }
                                            .no-print { display: none !important; }

                                            #root, .modal-backdrop, [role="dialog"] > div:first-child { 
                                                display: none !important; 
                                            }

                                            .fixed.inset-0 { 
                                                position: static !important; 
                                                display: block !important; 
                                                padding: 0 !important; 
                                            }

                                            .modal-container { 
                                                position: static !important;
                                                width: 100% !important;
                                                height: auto !important;
                                                margin: 0 !important;
                                                padding: 0 !important;
                                                border: none !important;
                                                box-shadow: none !important;
                                                background: white !important;
                                                max-width: none !important;
                                            }

                                            .print-wrapper {
                                                background: transparent !important;
                                                padding: 0 !important;
                                                margin: 0 !important;
                                                border: none !important;
                                                max-height: none !important;
                                                overflow: visible !important;
                                            }

                                            .modal-body {
                                                padding: 0 !important;
                                                margin: 0 !important;
                                                max-height: none !important;
                                                overflow: visible !important;
                                            }

                                            #print-delivery-receipt { 
                                                width: 80mm !important; 
                                                max-width: 80mm !important;
                                                box-shadow: none !important; 
                                                padding: 5mm !important; 
                                                margin: 0 !important;
                                                overflow: visible !important;
                                                -webkit-print-color-adjust: exact;
                                                print-color-adjust: exact;
                                            }
                                        }
                                    `}</style>

                                    <div className="text-center space-y-1 mb-4">
                                        <div className="text-lg font-black uppercase">{company?.nome_fantasia || 'Dourados Auto Peças'}</div>
                                        <div className="text-[10px] font-bold">INFO DE ENTREGA E LOGÍSTICA</div>
                                        <div className="h-px bg-black/20 w-full my-2"></div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="space-y-1">
                                            <div className="text-[10px] uppercase font-bold opacity-70">Pedido / Ref:</div>
                                            <div className="text-base font-black italic">
                                                {selectedDeliveryForPrint?.venda_id
                                                    ? selectedDeliveryForPrint.vendas?.numero_pedido != null
                                                        ? `PEDIDO #${formatNumPedido(selectedDeliveryForPrint.vendas.numero_pedido)}`
                                                        : `VENDA (UUID) ${selectedDeliveryForPrint.venda_id.slice(0, 8)}…`
                                                    : 'ENTREGA AVULSA (sem pedido)'}
                                            </div>
                                        </div>

                                        <div
                                            className={`rounded-md border-2 px-2 py-2 text-center ${
                                                selectedDeliveryForPrint?.status_pagamento === 'Pago'
                                                    ? 'border-emerald-600 bg-emerald-50'
                                                    : 'border-amber-600 bg-amber-50'
                                            }`}
                                        >
                                            <div className="text-[9px] font-black uppercase tracking-wide opacity-80">Pagamento na rota</div>
                                            <div className="text-sm font-black leading-tight">
                                                {(() => {
                                                    const eff = getEffectivePaymentStatus(selectedDeliveryForPrint!)
                                                    if (eff === 'Pago' || eff === 'Assinado') return 'SÓ ENTREGAR — OK'
                                                    if (eff === 'Assinar') return 'COLETAR ASSINATURA (BOLETO/PROMISSÓRIA)'
                                                    return `RECEBER EM ${selectedDeliveryForPrint?.forma_pagamento || selectedDeliveryForPrint?.vendas?.forma_pagamento || 'VALOR NA ENTREGA'}`
                                                })()}
                                            </div>
                                            <div className="text-[9px] font-bold mt-1 opacity-90">
                                                {selectedDeliveryForPrint?.status_pagamento === 'Pago'
                                                    ? 'Não cobrar do cliente.'
                                                    : 'Conferir pagamento no ato da entrega.'}
                                            </div>
                                        </div>

                                        <div className="space-y-1">
                                            <div className="text-[10px] uppercase font-bold opacity-70">Destinatário:</div>
                                            <div className="text-lg font-black leading-tight">
                                                {selectedDeliveryForPrint?.recebedor_nome || selectedDeliveryForPrint?.cliente_nome}
                                            </div>
                                            <div className="text-xs font-bold">Contato: {selectedDeliveryForPrint?.cliente_contato || '---'}</div>
                                        </div>

                                        <div className="space-y-1 border-t border-black/10 pt-2">
                                            <div className="text-[10px] uppercase font-bold opacity-70">Endereço de Entrega:</div>
                                            <div className="text-base font-black leading-tight">
                                                {selectedDeliveryForPrint?.rua}, {selectedDeliveryForPrint?.numero}
                                            </div>
                                            <div className="text-sm font-bold uppercase">{selectedDeliveryForPrint?.bairro}</div>
                                            <div className="text-xs font-black italic">{selectedDeliveryForPrint?.cidade || 'Dourados'} - {selectedDeliveryForPrint?.estado || 'MS'}</div>
                                            {selectedDeliveryForPrint?.horario_entrega && (
                                                <div className="text-xs font-bold mt-1 flex items-center gap-1">
                                                    <Clock className="w-3 h-3 shrink-0 print:hidden" aria-hidden />
                                                    <span>Horário: {selectedDeliveryForPrint.horario_entrega}</span>
                                                </div>
                                            )}
                                            {String(selectedDeliveryForPrint?.observacao_entrega || '').trim() !== '' && (
                                                <div className="mt-2 pt-2 border-t border-dashed border-black/25 print:border-black space-y-1 break-inside-avoid">
                                                    <div className="text-[10px] uppercase font-black tracking-wide text-black/70 print:text-black">
                                                        Observação
                                                    </div>
                                                    <div className="text-sm font-black text-black leading-snug whitespace-pre-wrap">
                                                        {String(selectedDeliveryForPrint!.observacao_entrega).trim()}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="border-t-2 border-dashed border-black mt-4 pt-4 text-center">
                                            <div className="text-[10px] font-black italic uppercase">*** CONFERIR MERCADORIA NO ATO ***</div>
                                            <div className="text-[9px] opacity-60 mt-1">Impresso em: {new Date().toLocaleString('pt-BR')}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <Button variant="outline" className="flex-1" onClick={() => setIsPrintModalOpen(false)}>Fechar</Button>
                                <Button className="flex-1 bg-black hover:bg-zinc-800" onClick={() => window.print()}>
                                    <Printer className="w-4 h-4 mr-2" /> Imprimir 80mm
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            </Modal>

            <Modal
                isOpen={isHistoryModalOpen}
                onClose={() => setIsHistoryModalOpen(false)}
                title="Histórico de Atualizações"
                className="max-w-lg"
            >
                <div className="space-y-4">
                    {loadingHistory ? (
                        <div className="py-8 text-center text-muted-foreground italic">Carregando histórico...</div>
                    ) : deliveryHistory.length === 0 ? (
                        <div className="py-8 text-center text-muted-foreground italic">Nenhuma atualização registrada ainda.</div>
                    ) : (
                        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                            {deliveryHistory.map((h) => (
                                <div key={h.id} className="relative pl-6 border-l-2 border-primary/20 py-1">
                                    <div className="absolute left-[-9px] top-2 w-4 h-4 rounded-full bg-background border-2 border-primary" />
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-xs font-black uppercase text-primary">{h.status_novo}</span>
                                        <span className="text-[10px] text-muted-foreground">
                                            {new Date(h.created_at).toLocaleString('pt-BR')}
                                        </span>
                                    </div>
                                    <div className="text-sm font-medium mt-1">{h.mensagem}</div>
                                    <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                                        <Users className="w-3 h-3" />
                                        Atualizado por: <span className="font-bold">{h.atendente_nome || 'Sistema'}</span>
                                    </div>
                                    {h.status_anterior && (
                                        <div className="text-[10px] opacity-50 mt-0.5">Status anterior: {h.status_anterior}</div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="pt-4 border-t flex justify-end">
                        <Button variant="outline" onClick={() => setIsHistoryModalOpen(false)}>Fechar</Button>
                    </div>
                </div>
            </Modal>

            <Modal
                isOpen={isDetailModalOpen}
                onClose={() => setIsDetailModalOpen(false)}
                title="Detalhes da Entrega"
                className="max-w-2xl p-0 overflow-hidden"
            >
                {viewingEntrega && (
                    <div className="space-y-0">
                        <div className="p-6 space-y-6">
                            <div className="flex justify-between items-start">
                                <div>
                                    <Badge variant="outline" className="mb-2 font-mono">
                                        {viewingEntrega.venda_id
                                            ? viewingEntrega.vendas?.numero_pedido != null
                                                ? `#${formatNumPedido(viewingEntrega.vendas.numero_pedido)}`
                                                : `#${viewingEntrega.venda_id.slice(0, 8)}`
                                            : "MANUAL"}
                                    </Badge>
                                    <h2 className="text-xl font-black leading-tight">
                                        {viewingEntrega.recebedor_nome || viewingEntrega.cliente_nome || "Cliente Eventual"}
                                    </h2>
                                    {viewingEntrega.cliente_contato && (
                                        <p className="text-sm font-bold text-muted-foreground mt-1">
                                            Contato: {viewingEntrega.cliente_contato}
                                        </p>
                                    )}
                                </div>
                                {(() => {
                                    const eff = getEffectivePaymentStatus(viewingEntrega)
                                    const isAssinar = eff === 'Assinar'
                                    return (
                                        <Badge
                                            className={`uppercase font-black text-[10px] px-2 py-1 ${
                                                isAssinar ? 'bg-orange-600 animate-pulse' :
                                                viewingEntrega.status === 'Entregue' ? 'bg-emerald-500' : 
                                                viewingEntrega.status === 'Em Trânsito' ? 'bg-blue-500' : 'bg-slate-500'
                                            }`}
                                        >
                                            {eff}
                                        </Badge>
                                    )
                                })()}
                            </div>

                            <div 
                                className="bg-primary/5 border border-primary/20 rounded-xl p-4 cursor-pointer active:bg-primary/10 transition-colors"
                                onClick={() => {
                                    const addr = [viewingEntrega.rua, viewingEntrega.numero, viewingEntrega.bairro, viewingEntrega.cidade, viewingEntrega.estado].filter(Boolean).join(", ")
                                    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`, '_blank')
                                }}
                            >
                                <div className="flex items-start gap-3">
                                    <div className="bg-primary text-white p-2 rounded-lg shrink-0">
                                        <MapPin className="w-5 h-5" />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-xs font-black uppercase text-primary tracking-wider">Endereço de Entrega</p>
                                        <p className="font-bold text-base leading-snug">
                                            {viewingEntrega.rua}, {viewingEntrega.numero}
                                        </p>
                                        <p className="text-sm text-muted-foreground font-medium uppercase">
                                            {viewingEntrega.bairro} — {viewingEntrega.cidade || 'Dourados'}
                                        </p>
                                        <div className="flex items-center gap-1.5 text-primary text-xs font-bold pt-1">
                                            Clique para abrir no GPS <ExternalLink className="w-3 h-3" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Status Pagamento</p>
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${
                                            getEffectivePaymentStatus(viewingEntrega) === 'Pago' || getEffectivePaymentStatus(viewingEntrega) === 'Assinado'
                                                ? 'bg-emerald-500' : 'bg-amber-500'
                                        }`} />
                                        <span className="font-black text-sm uppercase">{getEffectivePaymentStatus(viewingEntrega)}</span>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Forma Recebimento</p>
                                    <div className="flex items-center gap-2 text-sm font-bold uppercase">
                                        <ShoppingBag className="w-3.5 h-3.5 text-primary" />
                                        {viewingEntrega.forma_pagamento || viewingEntrega.vendas?.forma_pagamento || 'N/D'}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Itens da Venda</p>
                                    {viewingEntrega.venda_id && (
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            className="h-6 text-[10px] font-black uppercase text-primary gap-1 px-2"
                                            onClick={() => fetchVendaItens(viewingEntrega.venda_id!)}
                                        >
                                            {loadingProducts ? 'Carregando...' : 'Atualizar'}
                                        </Button>
                                    )}
                                </div>
                                
                                {loadingProducts ? (
                                    <div className="text-xs text-muted-foreground italic animate-pulse">Buscando produtos...</div>
                                ) : viewingProducts.length === 0 ? (
                                    <div className="text-xs text-muted-foreground italic">Nenhum item carregado.</div>
                                ) : (
                                    <div className="space-y-2 max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
                                        {viewingProducts.map((item, idx) => (
                                            <div key={idx} className="flex justify-between items-start text-xs bg-muted/20 p-2 rounded-lg">
                                                <div className="flex-1">
                                                    <p className="font-bold leading-tight">{item.produtos?.nome || item.descricao || 'Produto'}</p>
                                                    <p className="text-[9px] text-muted-foreground font-mono">SKU: {item.produtos?.sku || '-'}</p>
                                                </div>
                                                <div className="text-right ml-3 bg-primary/10 px-2 py-1 rounded font-black text-primary">
                                                    x{item.quantidade}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Horário de Saída</p>
                                    <div className="flex items-center gap-2 text-xs font-bold text-blue-600">
                                        <Truck className="w-3.5 h-3.5" />
                                        {viewingEntrega.data_envio 
                                            ? new Date(viewingEntrega.data_envio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + ' (' + new Date(viewingEntrega.data_envio).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ')'
                                            : 'Não iniciada'}
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Horário de Entrega</p>
                                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-600">
                                        <PackageCheck className="w-3.5 h-3.5" />
                                        {viewingEntrega.data_entrega 
                                            ? new Date(viewingEntrega.data_entrega).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + ' (' + new Date(viewingEntrega.data_entrega).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ')'
                                            : 'Pendente'}
                                    </div>
                                </div>
                            </div>

                            {viewingEntrega.observacao_entrega && (
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                                    <p className="text-[10px] font-black uppercase text-amber-800 mb-1">Observações da Entrega</p>
                                    <p className="text-sm font-medium text-amber-900 leading-relaxed">
                                        {viewingEntrega.observacao_entrega}
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="p-4 bg-muted/30 border-t space-y-3">
                            {viewingEntrega.status === 'Preparando' && (
                                <Button 
                                    className="w-full h-14 text-lg font-black uppercase tracking-widest gap-3 shadow-lg shadow-emerald-200"
                                    onClick={async () => {
                                        await updateStatus(viewingEntrega.id, viewingEntrega.status)
                                        setIsDetailModalOpen(false)
                                    }}
                                >
                                    <Truck className="w-6 h-6" />
                                    Iniciar Entrega
                                </Button>
                            )}

                            {viewingEntrega.status === 'Em Trânsito' && (
                                <Button 
                                    className="w-full h-14 text-lg font-black uppercase tracking-widest gap-3 bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-200"
                                    onClick={async () => {
                                        await updateStatus(viewingEntrega.id, viewingEntrega.status)
                                        setIsDetailModalOpen(false)
                                    }}
                                >
                                    <PackageCheck className="w-6 h-6" />
                                    Finalizar Entrega
                                </Button>
                            )}

                            <div className="flex gap-2">
                                <Button 
                                    variant="outline" 
                                    className="flex-1 font-bold h-11 border-primary text-primary" 
                                    onClick={() => handleGpsClick(viewingEntrega)}
                                >
                                    <MapPin className="w-4 h-4 mr-2" /> GPS / Iniciar
                                </Button>
                                <Button 
                                    variant="secondary" 
                                    className="flex-1 font-bold h-11" 
                                    onClick={() => setIsDetailModalOpen(false)}
                                >
                                    Voltar
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Modal de Seleção de Motorista para Rota */}
            <Modal
                isOpen={isDriverModalOpen}
                onClose={() => setIsDriverModalOpen(false)}
                title="Gerar Rota de Entrega"
                className="max-w-md"
            >
                <div className="space-y-4 py-4">
                    <div className="p-4 bg-primary/5 border border-primary/10 rounded-xl mb-4">
                        <p className="text-sm text-primary font-medium flex items-center gap-2">
                            <Truck className="w-4 h-4" />
                            {selectedIds.length > 0 
                                ? `Gerando rota para as ${selectedIds.length} entregas selecionadas.`
                                : `Gerando rota para todas as entregas pendentes de ${new Date(dataFiltro + "T12:00:00").toLocaleDateString("pt-BR")}.`
                            }
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label>Selecione o Entregador / Motorista</Label>
                        <select
                            className="w-full h-11 rounded-md border border-input bg-background px-3 text-sm focus:ring-2 focus:ring-primary outline-none"
                            value={selectedDriverId}
                            onChange={(e) => setSelectedDriverId(e.target.value)}
                        >
                            <option value="">--- Selecione um motorista ---</option>
                            {atendentes.map((a) => (
                                <option key={a.id} value={a.id}>{a.nome}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex justify-end gap-3 pt-6 border-t mt-4">
                        <Button variant="outline" onClick={() => setIsDriverModalOpen(false)}>Cancelar</Button>
                        <Button 
                            className="bg-emerald-600 hover:bg-emerald-700 gap-2 min-w-[120px]"
                            onClick={handleConfirmCreateRoute}
                            disabled={isCreatingRoute || !selectedDriverId}
                        >
                            {isCreatingRoute ? (
                                <>
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                    Criando...
                                </>
                            ) : (
                                <>
                                    <Play className="w-4 h-4" />
                                    Iniciar Rota
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    )
}
