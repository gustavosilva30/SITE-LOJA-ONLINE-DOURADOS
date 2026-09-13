import { useEffect, useState, useCallback, useMemo } from "react"
import { 
    manutencoesApi, 
    estoqueApi, 
    atendentesApi, 
    clientesApi,
    configuracoesApi 
} from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Modal } from "@/components/ui/modal"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { 
    Plus, Search, RefreshCw, Wrench, Settings, Trash2, Pencil, Filter, X, 
    ChevronRight, AlertTriangle, ArrowRight, User, DollarSign, Calendar, 
    FileText, CheckCircle2, ShoppingCart, Percent, Layers, Clock, ArrowLeftRight,
    MapPin, ClipboardList, Info, HelpCircle
} from "lucide-react"
import { fmt, fmtDate } from "@/lib/format"
import { toast } from "sonner"
import { useAuthStore } from "@/store/authStore"
import { cn } from "@/lib/utils"

// Define statuses and styling mapping
const STATUS_OPTIONS = [
    { id: "Pendente", name: "Pendente", color: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
    { id: "Desmontagem", name: "Desmontagem", color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
    { id: "Retífica", name: "Retífica", color: "bg-purple-500/10 text-purple-500 border-purple-500/20" },
    { id: "Aguardando Peças", name: "Aguardando Peças", color: "bg-rose-500/10 text-rose-500 border-rose-500/20" },
    { id: "Montagem", name: "Montagem", color: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20" },
    { id: "Teste", name: "Teste", color: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20" },
    { id: "Concluído", name: "Concluído", color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
    { id: "Cancelado", name: "Cancelado", color: "bg-slate-500/10 text-slate-500 border-slate-500/20" }
]

interface Retifica {
    id: string
    nome_peca: string
    fornecedor_id: string | null
    fornecedor_nome: string | null
    status: 'Enviado' | 'Em Processo' | 'Retornado' | 'Condenado'
    valor_servico: number
    data_envio: string | null
    data_retorno_previsao: string | null
    data_retorno_real: string | null
    observacoes: string | null
}

interface Insumo {
    id: string
    nome_peca: string
    sku_interno: string | null
    produto_insumo_id: string | null
    produto_insumo_nome: string | null
    fornecedor_id: string | null
    fornecedor_nome: string | null
    fornecedor_nome_avulso: string | null
    valor_compra: number
    quantidade: number
    data_compra: string | null
    numero_nfe: string | null
}

interface Manutencao {
    id: string
    produto_id: string
    produto_nome: string
    produto_sku: string
    produto_imagem_url: string | null
    produto_marca: string | null
    produto_modelo: string | null
    produto_ano: string | null
    tipo: 'Revisão Interna' | 'Garantia'
    status: string
    cliente_id: string | null
    cliente_nome: string | null
    venda_id: string | null
    venda_numero_pedido: string | null
    mecanico_id: string | null
    mecanico_nome: string | null
    custo_mao_obra: number
    custo_total_retifica: number
    custo_total_insumos: number
    custo_total: number
    observacoes: string | null
    data_inicio: string
    data_fim: string | null
    created_at: string
}

export default function Manutencoes() {
    const { atendente } = useAuthStore()
    const [manutencoes, setManutencoes] = useState<Manutencao[]>([])
    const [loading, setLoading] = useState(true)
    const [filters, setFilters] = useState({
        status: "",
        tipo: "",
        search: ""
    })

    // Dropdown / Form Options
    const [mecanicos, setMecanicos] = useState<any[]>([])
    const [fornecedores, setFornecedores] = useState<any[]>([])
    const [clientes, setClientes] = useState<any[]>([])

    // Modal Nova OM State
    const [isNewModalOpen, setIsNewModalOpen] = useState(false)
    const [newOm, setNewOm] = useState({
        produto_id: "",
        tipo: "Revisão Interna",
        status: "Pendente",
        cliente_id: "",
        venda_id: "",
        mecanico_id: "",
        custo_mao_obra: 0,
        observacoes: ""
    })
    const [productSearch, setProductSearch] = useState("")
    const [searchedProducts, setSearchedProducts] = useState<any[]>([])
    const [selectedProduct, setSelectedProduct] = useState<any | null>(null)
    const [clientSearch, setClientSearch] = useState("")
    const [searchedClients, setSearchedClients] = useState<any[]>([])
    const [selectedClient, setSelectedClient] = useState<any | null>(null)
    const [isSearchingProducts, setIsSearchingProducts] = useState(false)
    const [isSearchingClients, setIsSearchingClients] = useState(false)

    // Detailed OM Sheet State
    const [isSheetOpen, setIsSheetOpen] = useState(false)
    const [selectedOmId, setSelectedOmId] = useState<string | null>(null)
    const [omDetails, setOmDetails] = useState<any | null>(null)
    const [sheetTab, setSheetTab] = useState("geral")
    const [loadingDetails, setLoadingDetails] = useState(false)

    // Modal Insumo / Retífica Form states
    const [isRetificaModalOpen, setIsRetificaModalOpen] = useState(false)
    const [editingRetifica, setEditingRetifica] = useState<any | null>(null)
    const [retificaForm, setRetificaForm] = useState({
        nome_peca: "",
        fornecedor_id: "",
        status: "Enviado",
        valor_servico: 0,
        data_envio: new Date().toISOString().split("T")[0],
        data_retorno_previsao: "",
        data_retorno_real: "",
        observacoes: ""
    })

    const [isInsumoModalOpen, setIsInsumoModalOpen] = useState(false)
    const [editingInsumo, setEditingInsumo] = useState<any | null>(null)
    const [insumoForm, setInsumoForm] = useState({
        nome_peca: "",
        sku_interno: "",
        produto_insumo_id: "",
        fornecedor_id: "",
        fornecedor_nome_avulso: "",
        valor_compra: 0,
        quantidade: 1,
        data_compra: new Date().toISOString().split("T")[0],
        numero_nfe: ""
    })
    const [insumoProdSearch, setInsumoProdSearch] = useState("")
    const [searchedInsumoProds, setSearchedInsumoProds] = useState<any[]>([])
    const [selectedInsumoProd, setSelectedInsumoProd] = useState<any | null>(null)
    const [isSearchingInsumoProds, setIsSearchingInsumoProds] = useState(false)
    const [useInternalStock, setUseInternalStock] = useState(false)

    // Load Initial Data
    const loadManutencoes = useCallback(async () => {
        setLoading(true)
        try {
            const data = await manutencoesApi.listar({
                status: filters.status || undefined,
                tipo: filters.tipo || undefined
            })
            setManutencoes(Array.isArray(data) ? data : [])
        } catch (e: any) {
            toast.error("Erro ao carregar manutenções: " + (e.message || e))
        } finally {
            setLoading(false)
        }
    }, [filters.status, filters.tipo])

    const loadOptions = useCallback(async () => {
        try {
            const [mecs, forns] = await Promise.all([
                atendentesApi.listar({ limit: 100 }),
                configuracoesApi.listarFornecedores()
            ])
            setMecanicos(Array.isArray(mecs) ? mecs : [])
            setFornecedores(Array.isArray(forns) ? forns : [])
        } catch (e) {
            console.error("Erro ao carregar mecânicos/fornecedores", e)
        }
    }, [])

    useEffect(() => {
        loadManutencoes()
    }, [loadManutencoes])

    useEffect(() => {
        loadOptions()
    }, [loadOptions])

    // Filtered OMs (by search term in SKU or Name)
    const filteredOms = useMemo(() => {
        if (!filters.search) return manutencoes
        const term = filters.search.toLowerCase()
        return manutencoes.filter(om => 
            (om.produto_nome || "").toLowerCase().includes(term) ||
            (om.produto_sku || "").toLowerCase().includes(term) ||
            (om.mecanico_nome || "").toLowerCase().includes(term) ||
            (om.observacoes || "").toLowerCase().includes(term)
        )
    }, [manutencoes, filters.search])

    // Load OM Details
    const loadOmDetails = async (id: string) => {
        setLoadingDetails(true)
        try {
            const data = await manutencoesApi.detalhe(id)
            setOmDetails(data)
        } catch (e: any) {
            toast.error("Erro ao carregar detalhes: " + (e.message || e))
        } finally {
            setLoadingDetails(false)
        }
    }

    const handleOpenDetails = (id: string) => {
        setSelectedOmId(id)
        setSheetTab("geral")
        setIsSheetOpen(true)
        loadOmDetails(id)
    }

    // Product Autocomplete for New OM
    useEffect(() => {
        if (!productSearch || productSearch.length < 2) {
            setSearchedProducts([])
            return
        }
        const delayDebounceFn = setTimeout(async () => {
            setIsSearchingProducts(true)
            try {
                // List products, filtering by motor or cambio categories
                const res = await estoqueApi.listarProdutos({ q: productSearch, limit: 8 })
                setSearchedProducts(Array.isArray(res) ? res : [])
            } catch (e) {
                console.error(e)
            } finally {
                setIsSearchingProducts(false)
            }
        }, 400)

        return () => clearTimeout(delayDebounceFn)
    }, [productSearch])

    // Insumo internal inventory search
    useEffect(() => {
        if (!insumoProdSearch || insumoProdSearch.length < 2) {
            setSearchedInsumoProds([])
            return
        }
        const delayDebounceFn = setTimeout(async () => {
            setIsSearchingInsumoProds(true)
            try {
                const res = await estoqueApi.listarProdutos({ q: insumoProdSearch, limit: 8 })
                setSearchedInsumoProds(Array.isArray(res) ? res : [])
            } catch (e) {
                console.error(e)
            } finally {
                setIsSearchingInsumoProds(false)
            }
        }, 400)

        return () => clearTimeout(delayDebounceFn)
    }, [insumoProdSearch])

    // Client Autocomplete for Warranty OM
    useEffect(() => {
        if (!clientSearch || clientSearch.length < 2) {
            setSearchedClients([])
            return
        }
        const delayDebounceFn = setTimeout(async () => {
            setIsSearchingClients(true)
            try {
                const res = await clientesApi.listar({ q: clientSearch, limit: 8 })
                setSearchedClients(Array.isArray(res) ? res : [])
            } catch (e) {
                console.error(e)
            } finally {
                setIsSearchingClients(false)
            }
        }, 400)

        return () => clearTimeout(delayDebounceFn)
    }, [clientSearch])

    // Create New OM handler
    const handleCreateOm = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedProduct) {
            toast.error("Por favor, selecione o motor/câmbio a ser mantido.")
            return
        }

        try {
            const payload = {
                produto_id: selectedProduct.id,
                tipo: newOm.tipo,
                status: newOm.status,
                cliente_id: selectedClient ? selectedClient.id : null,
                venda_id: newOm.venda_id ? newOm.venda_id : null,
                mecanico_id: newOm.mecanico_id ? newOm.mecanico_id : null,
                custo_mao_obra: Number(newOm.custo_mao_obra) || 0.0,
                observacoes: newOm.observacoes || null
            }

            await manutencoesApi.criar(payload)
            toast.success("Ordem de Manutenção aberta com sucesso!")
            setIsNewModalOpen(false)
            // Reset
            setNewOm({
                produto_id: "",
                tipo: "Revisão Interna",
                status: "Pendente",
                cliente_id: "",
                venda_id: "",
                mecanico_id: "",
                custo_mao_obra: 0,
                observacoes: ""
            })
            setSelectedProduct(null)
            setSelectedClient(null)
            setProductSearch("")
            setClientSearch("")
            loadManutencoes()
        } catch (e: any) {
            toast.error("Erro ao criar OM: " + (e.message || e))
        }
    }

    // Update OM Status / Mechanic / Labor cost
    const handleUpdateOmStatus = async (status: string) => {
        if (!selectedOmId) return
        try {
            await manutencoesApi.atualizar(selectedOmId, { status })
            toast.success(`Ordem de Manutenção movida para "${status}"!`)
            if (status === "Concluído") {
                toast.success("Custo do produto original atualizado com sucesso no estoque!")
            }
            loadOmDetails(selectedOmId)
            loadManutencoes()
        } catch (e: any) {
            toast.error("Erro ao atualizar status: " + (e.message || e))
        }
    }

    const handleUpdateOmFields = async (fields: Record<string, any>) => {
        if (!selectedOmId) return
        try {
            await manutencoesApi.atualizar(selectedOmId, fields)
            toast.success("Ordem de Manutenção atualizada!")
            loadOmDetails(selectedOmId)
            loadManutencoes()
        } catch (e: any) {
            toast.error("Erro ao atualizar: " + (e.message || e))
        }
    }

    // ==========================================
    // RETÍFICA OPERATIONS
    // ==========================================
    const handleOpenRetificaModal = (retifica?: Retifica) => {
        if (retifica) {
            setEditingRetifica(retifica)
            setRetificaForm({
                nome_peca: retifica.nome_peca,
                fornecedor_id: retifica.fornecedor_id || "",
                status: retifica.status,
                valor_servico: retifica.valor_servico,
                data_envio: retifica.data_envio ? retifica.data_envio.split("T")[0] : new Date().toISOString().split("T")[0],
                data_retorno_previsao: retifica.data_retorno_previsao ? retifica.data_retorno_previsao.split("T")[0] : "",
                data_retorno_real: retifica.data_retorno_real ? retifica.data_retorno_real.split("T")[0] : "",
                observacoes: retifica.observacoes || ""
            })
        } else {
            setEditingRetifica(null)
            setRetificaForm({
                nome_peca: "",
                fornecedor_id: "",
                status: "Enviado",
                valor_servico: 0,
                data_envio: new Date().toISOString().split("T")[0],
                data_retorno_previsao: "",
                data_retorno_real: "",
                observacoes: ""
            })
        }
        setIsRetificaModalOpen(true)
    }

    const handleSaveRetifica = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedOmId) return
        try {
            const payload = {
                nome_peca: retificaForm.nome_peca,
                fornecedor_id: retificaForm.fornecedor_id || null,
                status: retificaForm.status,
                valor_servico: Number(retificaForm.valor_servico) || 0,
                data_envio: retificaForm.data_envio || null,
                data_retorno_previsao: retificaForm.data_retorno_previsao || null,
                data_retorno_real: retificaForm.data_retorno_real || null,
                observacoes: retificaForm.observacoes || null
            }

            if (editingRetifica) {
                await manutencoesApi.atualizarRetifica(selectedOmId, editingRetifica.id, payload)
                toast.success("Peça na retífica atualizada!")
            } else {
                await manutencoesApi.adicionarRetifica(selectedOmId, payload)
                toast.success("Peça enviada para retífica adicionada!")
            }
            setIsRetificaModalOpen(false)
            loadOmDetails(selectedOmId)
            loadManutencoes()
        } catch (e: any) {
            toast.error("Erro ao salvar: " + (e.message || e))
        }
    }

    const handleDeleteRetifica = async (retificaId: string) => {
        if (!selectedOmId || !confirm("Tem certeza que deseja excluir esta peça da retífica?")) return
        try {
            await manutencoesApi.deletarRetifica(selectedOmId, retificaId)
            toast.success("Registro de retífica excluído!")
            loadOmDetails(selectedOmId)
            loadManutencoes()
        } catch (e: any) {
            toast.error("Erro ao excluir: " + (e.message || e))
        }
    }

    // ==========================================
    // INSUMO OPERATIONS
    // ==========================================
    const handleOpenInsumoModal = (insumo?: Insumo) => {
        if (insumo) {
            setEditingInsumo(insumo)
            setUseInternalStock(!!insumo.produto_insumo_id)
            setSelectedInsumoProd(insumo.produto_insumo_id ? { id: insumo.produto_insumo_id, nome: insumo.produto_insumo_nome, sku: insumo.sku_interno } : null)
            setInsumoForm({
                nome_peca: insumo.nome_peca,
                sku_interno: insumo.sku_interno || "",
                produto_insumo_id: insumo.produto_insumo_id || "",
                fornecedor_id: insumo.fornecedor_id || "",
                fornecedor_nome_avulso: insumo.fornecedor_nome_avulso || "",
                valor_compra: insumo.valor_compra,
                quantidade: insumo.quantidade,
                data_compra: insumo.data_compra ? insumo.data_compra.split("T")[0] : new Date().toISOString().split("T")[0],
                numero_nfe: insumo.numero_nfe || ""
            })
        } else {
            setEditingInsumo(null)
            setUseInternalStock(false)
            setSelectedInsumoProd(null)
            setInsumoForm({
                nome_peca: "",
                sku_interno: "",
                produto_insumo_id: "",
                fornecedor_id: "",
                fornecedor_nome_avulso: "",
                valor_compra: 0,
                quantidade: 1,
                data_compra: new Date().toISOString().split("T")[0],
                numero_nfe: ""
            })
        }
        setInsumoProdSearch("")
        setIsInsumoModalOpen(true)
    }

    const handleSaveInsumo = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedOmId) return
        try {
            const payload = {
                nome_peca: insumoForm.nome_peca,
                sku_interno: useInternalStock && selectedInsumoProd ? selectedInsumoProd.sku : (insumoForm.sku_interno || null),
                produto_insumo_id: useInternalStock && selectedInsumoProd ? selectedInsumoProd.id : null,
                fornecedor_id: !useInternalStock && insumoForm.fornecedor_id ? insumoForm.fornecedor_id : null,
                fornecedor_nome_avulso: !useInternalStock && insumoForm.fornecedor_nome_avulso ? insumoForm.fornecedor_nome_avulso : null,
                valor_compra: Number(insumoForm.valor_compra) || 0,
                quantidade: Number(insumoForm.quantidade) || 1,
                data_compra: insumoForm.data_compra || null,
                numero_nfe: insumoForm.numero_nfe || null
            }

            if (editingInsumo) {
                await manutencoesApi.atualizarInsumo(selectedOmId, editingInsumo.id, payload)
                toast.success("Insumo/peça de manutenção atualizado!")
            } else {
                await manutencoesApi.adicionarInsumo(selectedOmId, payload)
                toast.success("Insumo/peça de manutenção adicionado!")
            }
            setIsInsumoModalOpen(false)
            loadOmDetails(selectedOmId)
            loadManutencoes()
        } catch (e: any) {
            toast.error("Erro ao salvar: " + (e.message || e))
        }
    }

    const handleDeleteInsumo = async (insumoId: string) => {
        if (!selectedOmId || !confirm("Tem certeza que deseja excluir este insumo? Isso estornará a peça ao estoque se for do estoque interno da loja!")) return
        try {
            await manutencoesApi.deletarInsumo(selectedOmId, insumoId)
            toast.success("Insumo removido e estoque estornado com sucesso!")
            loadOmDetails(selectedOmId)
            loadManutencoes()
        } catch (e: any) {
            toast.error("Erro ao excluir: " + (e.message || e))
        }
    }

    // Render columns
    const boardColumns = useMemo(() => {
        return STATUS_OPTIONS.map(opt => {
            const list = filteredOms.filter(m => m.status === opt.id)
            const sumCost = list.reduce((acc, curr) => acc + Number(curr.custo_total || 0), 0)
            return {
                ...opt,
                list,
                sumCost
            }
        })
    }, [filteredOms])

    return (
        <div className="space-y-6 flex flex-col min-h-screen">
            {/* Header com KPIs rápidos */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-3">
                        <Wrench className="w-8 h-8 text-primary animate-pulse" /> Controle de Motores & Câmbios
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Gerenciamento completo das revisões internas, recondicionamento e manutenções em garantia de motores e caixas de câmbio.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={loadManutencoes} className="rounded-xl h-11 w-11 shadow-sm">
                        <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                    </Button>
                    <Button onClick={() => setIsNewModalOpen(true)} className="gap-2 h-11 px-6 rounded-xl shadow-lg font-bold bg-primary hover:bg-primary/90 text-white">
                        <Plus className="w-5 h-5" /> Abrir Nova OM
                    </Button>
                </div>
            </div>

            {/* Filtros e Busca */}
            <Card className="border-border shadow-sm bg-card/60 backdrop-blur-md">
                <CardContent className="pt-6">
                    <div className="flex flex-col md:flex-row gap-4 items-center">
                        <div className="relative flex-1 w-full">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input 
                                placeholder="Buscar por SKU, nome do motor, mecânico ou observações..." 
                                className="pl-11 rounded-xl h-11 border-border focus-visible:ring-1"
                                value={filters.search}
                                onChange={e => setFilters({...filters, search: e.target.value})}
                            />
                        </div>
                        <div className="flex gap-2 w-full md:w-auto">
                            <select 
                                className="h-11 px-3 rounded-xl border border-border bg-background text-sm font-medium w-full md:w-44 focus:outline-none"
                                value={filters.tipo}
                                onChange={e => setFilters({...filters, tipo: e.target.value})}
                            >
                                <option value="">Todos Tipos</option>
                                <option value="Revisão Interna">Revisão Interna</option>
                                <option value="Garantia">Garantia</option>
                            </select>
                            <select 
                                className="h-11 px-3 rounded-xl border border-border bg-background text-sm font-medium w-full md:w-44 focus:outline-none"
                                value={filters.status}
                                onChange={e => setFilters({...filters, status: e.target.value})}
                            >
                                <option value="">Todos Status</option>
                                {STATUS_OPTIONS.map(opt => (
                                    <option key={opt.id} value={opt.id}>{opt.name}</option>
                                ))}
                            </select>
                            {(filters.status || filters.tipo || filters.search) && (
                                <Button 
                                    variant="ghost" 
                                    onClick={() => setFilters({ status: "", tipo: "", search: "" })}
                                    className="h-11 rounded-xl px-3 hover:bg-muted text-muted-foreground hover:text-foreground"
                                >
                                    Limpar
                                </Button>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Kanban Board Container */}
            <div className="flex-1 pb-4">
                <div className="grid grid-cols-8 gap-2 items-start w-full">
                    {boardColumns.map(col => (
                        <div 
                            key={col.id} 
                            className="min-w-0 bg-muted/30 border border-border/60 rounded-2xl flex flex-col max-h-[72vh] overflow-hidden"
                        >
                            {/* Column Header */}
                            <div className="px-2.5 py-3 border-b border-border/80 bg-background/50 flex justify-between items-center sticky top-0 z-10">
                                <div className="min-w-0">
                                    <h3 className="font-bold text-xs tracking-tight flex items-center gap-1 text-foreground truncate">
                                        {col.name}
                                        <Badge className="h-4 min-w-[16px] flex items-center justify-center p-0 text-[9px] bg-muted-foreground/10 text-foreground border-none font-bold shrink-0">
                                            {col.list.length}
                                        </Badge>
                                    </h3>
                                    <span className="text-[9px] font-semibold text-emerald-600">
                                        {fmt(col.sumCost)}
                                    </span>
                                </div>
                                <span className={cn("w-2 h-2 rounded-full shrink-0", col.color.split(" ")[1])} />
                            </div>

                            {/* Cards Area */}
                            <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar bg-muted/10 min-h-[250px]">
                                {col.list.length === 0 ? (
                                    <div className="h-20 border border-dashed border-border/60 rounded-xl flex flex-col items-center justify-center text-muted-foreground/30">
                                        <Info className="w-4 h-4 mb-0.5" />
                                        <span className="text-[9px] uppercase font-bold tracking-widest">Nenhuma OM</span>
                                    </div>
                                ) : (
                                    col.list.map(om => (
                                        <div 
                                            key={om.id}
                                            onClick={() => handleOpenDetails(om.id)}
                                            className={cn(
                                                "p-2.5 bg-card border border-border/80 rounded-xl shadow-sm cursor-pointer hover:shadow-md hover:border-primary/30 transition-all space-y-2 group relative overflow-hidden"
                                            )}
                                        >
                                            <div className="space-y-0.5">
                                                <div className="flex justify-between items-start gap-1">
                                                    <span className="text-[9px] font-bold text-slate-400 font-mono tracking-tight truncate">
                                                        {om.produto_sku}
                                                    </span>
                                                    <Badge className={cn(
                                                        "text-[8px] font-bold px-1 py-0 border-none shrink-0",
                                                        om.tipo === "Garantia" ? "bg-rose-500/10 text-rose-500" : "bg-primary/10 text-primary"
                                                    )}>
                                                        {om.tipo === "Garantia" ? "Garantia" : "Interna"}
                                                    </Badge>
                                                </div>
                                                <h4 className="font-bold text-[11px] leading-snug text-foreground group-hover:text-primary transition-colors line-clamp-2">
                                                    {om.produto_nome}
                                                </h4>
                                            </div>

                                            {/* Mechanic & Dates */}
                                            <div className="text-[10px] text-muted-foreground space-y-0.5">
                                                <div className="flex items-center gap-1">
                                                    <User className="w-3 h-3 shrink-0" />
                                                    <span className="font-semibold text-foreground/80 truncate">
                                                        {om.mecanico_nome || "Sem Mecânico"}
                                                    </span>
                                                </div>
                                                {om.tipo === "Garantia" && om.cliente_nome && (
                                                    <div className="flex items-center gap-1 text-rose-500/80">
                                                        <HelpCircle className="w-3 h-3 shrink-0" />
                                                        <span className="truncate font-medium">{om.cliente_nome}</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Cost Summary & Quick Transition */}
                                            <div className="flex items-center justify-between pt-1.5 border-t border-border/60">
                                                <div className="flex flex-col">
                                                    <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest">Valor OM</span>
                                                    <span className="font-extrabold text-[11px] text-foreground">
                                                        {fmt(om.custo_total)}
                                                    </span>
                                                </div>
                                                <Button 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    className="w-6 h-6 hover:bg-primary/10 hover:text-primary rounded-lg shrink-0"
                                                    title="Ver Detalhes"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        handleOpenDetails(om.id)
                                                    }}
                                                >
                                                    <ChevronRight className="w-3.5 h-3.5" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* MODAL: NOVA ORDEM DE MANUTENÇÃO */}
            <Modal
                isOpen={isNewModalOpen}
                onClose={() => {
                    setIsNewModalOpen(false)
                    setSelectedProduct(null)
                    setSelectedClient(null)
                    setProductSearch("")
                    setClientSearch("")
                }}
                title="Abrir Ordem de Manutenção"
                className="max-w-xl"
            >
                <form onSubmit={handleCreateOm} className="space-y-4 py-2">
                    {/* BUSCA DE PRODUTO (MOTOR/CÂMBIO) */}
                    <div className="space-y-2 relative">
                        <Label className="font-bold text-foreground">Motor ou Câmbio a ser revisado/reparado *</Label>
                        {!selectedProduct ? (
                            <>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Digite SKU ou nome do motor/câmbio..."
                                        value={productSearch}
                                        onChange={e => setProductSearch(e.target.value)}
                                        className="pl-10"
                                    />
                                    {isSearchingProducts && (
                                        <RefreshCw className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
                                    )}
                                </div>
                                {searchedProducts.length > 0 && (
                                    <div className="absolute z-50 left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-xl max-h-56 overflow-y-auto p-1.5 space-y-1">
                                        {searchedProducts.map(p => (
                                            <div
                                                key={p.id}
                                                onClick={() => {
                                                    setSelectedProduct(p)
                                                    setSearchedProducts([])
                                                }}
                                                className="flex items-center gap-3 p-2 hover:bg-muted/80 rounded-lg cursor-pointer transition-colors"
                                            >
                                                {p.imagem_url ? (
                                                    <img src={p.imagem_url} alt={p.nome} className="w-10 h-10 object-cover rounded-lg border" />
                                                ) : (
                                                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                                                        <Layers className="w-5 h-5" />
                                                    </div>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[13px] font-bold text-foreground leading-tight truncate">{p.nome}</p>
                                                    <div className="flex gap-2 text-[10px] text-muted-foreground mt-0.5">
                                                        <span className="font-semibold">SKU: {p.sku}</span>
                                                        <span>Estoque: {p.estoque_atual}</span>
                                                        <span className="text-emerald-600 font-bold">Custo: {fmt(p.custo)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="flex items-center gap-3 p-3 bg-muted/60 border border-border rounded-xl relative">
                                {selectedProduct.imagem_url ? (
                                    <img src={selectedProduct.imagem_url} alt={selectedProduct.nome} className="w-12 h-12 object-cover rounded-lg border bg-background" />
                                ) : (
                                    <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                                        <Layers className="w-6 h-6" />
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="text-[13px] font-extrabold text-foreground leading-tight">{selectedProduct.nome}</p>
                                    <div className="flex gap-3 text-[10px] text-muted-foreground mt-1">
                                        <span>SKU: <strong className="text-foreground">{selectedProduct.sku}</strong></span>
                                        <span>Custo Original: <strong className="text-emerald-600">{fmt(selectedProduct.custo)}</strong></span>
                                    </div>
                                </div>
                                <Button 
                                    type="button" 
                                    variant="ghost" 
                                    size="icon" 
                                    className="absolute top-2 right-2 text-muted-foreground hover:text-destructive w-7 h-7"
                                    onClick={() => setSelectedProduct(null)}
                                >
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Tipo de Manutenção</Label>
                            <select
                                className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-medium focus:outline-none"
                                value={newOm.tipo}
                                onChange={e => setNewOm({...newOm, tipo: e.target.value as any})}
                            >
                                <option value="Revisão Interna">Revisão Interna</option>
                                <option value="Garantia">Garantia</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label>Mecânico Responsável</Label>
                            <select
                                className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-medium focus:outline-none"
                                value={newOm.mecanico_id}
                                onChange={e => setNewOm({...newOm, mecanico_id: e.target.value})}
                            >
                                <option value="">Sem Mecânico</option>
                                {mecanicos.map(mec => (
                                    <option key={mec.id} value={mec.id}>{mec.nome}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* SE FOR GARANTIA, PERMITIR SELECIONAR CLIENTE E NÚMERO DA VENDA */}
                    {newOm.tipo === "Garantia" && (
                        <div className="grid grid-cols-2 gap-4 p-3 bg-rose-500/5 border border-rose-500/10 rounded-xl">
                            <div className="space-y-2 relative">
                                <Label className="text-rose-500 font-semibold">Cliente Vinculado</Label>
                                {!selectedClient ? (
                                    <>
                                        <div className="relative">
                                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                                            <Input
                                                placeholder="Buscar cliente..."
                                                value={clientSearch}
                                                onChange={e => setClientSearch(e.target.value)}
                                                className="pl-8 h-9 text-xs"
                                            />
                                        </div>
                                        {searchedClients.length > 0 && (
                                            <div className="absolute z-50 left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-xl max-h-44 overflow-y-auto p-1 space-y-1">
                                                {searchedClients.map(c => (
                                                    <div
                                                        key={c.id}
                                                        onClick={() => {
                                                            setSelectedClient(c)
                                                            setSearchedClients([])
                                                        }}
                                                        className="p-2 hover:bg-muted text-[11px] font-bold cursor-pointer rounded-lg truncate"
                                                    >
                                                        {c.nome} ({c.telefone || "Sem fone"})
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className="flex items-center justify-between p-2 bg-background border rounded-lg h-9">
                                        <span className="text-xs font-bold text-foreground truncate pr-6">{selectedClient.nome}</span>
                                        <Button 
                                            type="button" 
                                            variant="ghost" 
                                            size="icon" 
                                            className="w-5 h-5 text-muted-foreground hover:text-destructive shrink-0"
                                            onClick={() => setSelectedClient(null)}
                                        >
                                            <X className="w-3 h-3" />
                                        </Button>
                                    </div>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label className="text-rose-500 font-semibold">ID/Nº Venda (Opcional)</Label>
                                <Input
                                    placeholder="Ex: UUID ou Nº Pedido"
                                    value={newOm.venda_id}
                                    onChange={e => setNewOm({...newOm, venda_id: e.target.value})}
                                    className="h-9 text-xs"
                                />
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Custo Mão de Obra Inicial</Label>
                            <div className="relative">
                                <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={newOm.custo_mao_obra}
                                    onChange={e => setNewOm({...newOm, custo_mao_obra: parseFloat(e.target.value) || 0})}
                                    className="pl-8"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Status Inicial</Label>
                            <select
                                className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-medium focus:outline-none"
                                value={newOm.status}
                                onChange={e => setNewOm({...newOm, status: e.target.value})}
                            >
                                {STATUS_OPTIONS.map(opt => (
                                    <option key={opt.id} value={opt.id}>{opt.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Observações Gerais</Label>
                        <Input
                            placeholder="Anote detalhes de avarias, garantia ou peças com problema..."
                            value={newOm.observacoes}
                            onChange={e => setNewOm({...newOm, observacoes: e.target.value})}
                        />
                    </div>

                    <div className="flex gap-3 pt-4 border-t border-border">
                        <Button 
                            type="button" 
                            variant="outline" 
                            className="flex-1 rounded-xl"
                            onClick={() => {
                                setIsNewModalOpen(false)
                                setSelectedProduct(null)
                                setSelectedClient(null)
                            }}
                        >
                            Cancelar
                        </Button>
                        <Button 
                            type="submit" 
                            className="flex-1 rounded-xl text-white font-bold bg-primary hover:bg-primary/90"
                        >
                            Abrir Manutenção
                        </Button>
                    </div>
                </form>
            </Modal>

            {/* DETALHES COMPLETOS DA OM - SHEET SLIDE OVER */}
            <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
                <SheetContent className="sm:max-w-xl bg-card border-l border-border flex flex-col h-full overflow-hidden">
                    {loadingDetails || !omDetails ? (
                        <div className="flex-1 flex items-center justify-center">
                            <RefreshCw className="w-8 h-8 text-primary animate-spin" />
                        </div>
                    ) : (
                        <div className="flex flex-col h-full">
                            {/* Sheet Header */}
                            <div className="p-6 border-b border-border bg-muted/30">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex gap-2">
                                        <Badge className={cn(
                                            "text-xs font-bold border-none",
                                            omDetails.tipo === "Garantia" ? "bg-rose-500/10 text-rose-500" : "bg-primary/10 text-primary"
                                        )}>
                                            {omDetails.tipo}
                                        </Badge>
                                        <Badge className={cn(
                                            "text-xs font-bold border-none",
                                            STATUS_OPTIONS.find(s => s.id === omDetails.status)?.color
                                        )}>
                                            {omDetails.status}
                                        </Badge>
                                    </div>
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        onClick={() => setIsSheetOpen(false)}
                                        className="h-8 w-8 rounded-full border"
                                    >
                                        <X className="w-4 h-4" />
                                    </Button>
                                </div>

                                <div className="flex items-start gap-4">
                                    {omDetails.produto_imagem_url ? (
                                        <img src={omDetails.produto_imagem_url} alt={omDetails.produto_nome} className="w-16 h-16 object-cover rounded-xl border bg-background" />
                                    ) : (
                                        <div className="w-16 h-16 rounded-xl bg-muted flex items-center justify-center text-muted-foreground shrink-0 border">
                                            <Wrench className="w-8 h-8" />
                                        </div>
                                    )}
                                    <div className="min-w-0">
                                        <h2 className="text-[15px] font-black text-foreground leading-tight tracking-tight">{omDetails.produto_nome}</h2>
                                        <p className="text-xs text-muted-foreground mt-1">SKU: <strong className="text-foreground">{omDetails.produto_sku}</strong></p>
                                        <div className="flex items-center gap-1.5 mt-2 bg-emerald-500/10 text-emerald-500 text-[10px] font-bold px-2 py-0.5 rounded-md w-fit">
                                            <DollarSign className="w-3.5 h-3.5" /> Total Gasto: {fmt(omDetails.custo_total)}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Tabs Navigator */}
                            <div className="border-b border-border bg-muted/10 p-2 flex gap-1">
                                {["geral", "retificas", "insumos", "financeiro"].map(tab => (
                                    <button
                                        key={tab}
                                        onClick={() => setSheetTab(tab)}
                                        className={cn(
                                            "flex-1 py-2 text-xs font-bold rounded-lg transition-colors border",
                                            sheetTab === tab 
                                                ? "bg-background border-border text-foreground shadow-sm font-extrabold" 
                                                : "border-transparent text-muted-foreground hover:bg-muted/50"
                                        )}
                                    >
                                        {tab === "geral" && "Geral"}
                                        {tab === "retificas" && `Retífica (${omDetails.retificas?.length || 0})`}
                                        {tab === "insumos" && `Insumos (${omDetails.insumos?.length || 0})`}
                                        {tab === "financeiro" && "Resumo Custo"}
                                    </button>
                                ))}
                            </div>

                            {/* Tabs Body */}
                            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                                {/* TAB 1: GERAL */}
                                {sheetTab === "geral" && (
                                    <div className="space-y-5">
                                        <div className="bg-muted/30 border border-border/80 rounded-2xl p-4 space-y-4">
                                            <h3 className="font-extrabold text-xs text-foreground uppercase tracking-wider flex items-center gap-1.5">
                                                <Settings className="w-3.5 h-3.5 text-primary" /> Status & Responsável
                                            </h3>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-1.5">
                                                    <Label className="text-xs">Estágio de Manutenção</Label>
                                                    <select
                                                        className="w-full h-10 px-3 rounded-xl border border-border bg-background text-xs font-medium focus:outline-none"
                                                        value={omDetails.status}
                                                        onChange={e => handleUpdateOmStatus(e.target.value)}
                                                    >
                                                        {STATUS_OPTIONS.map(opt => (
                                                            <option key={opt.id} value={opt.id}>{opt.name}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label className="text-xs">Mecânico Atual</Label>
                                                    <select
                                                        className="w-full h-10 px-3 rounded-xl border border-border bg-background text-xs font-medium focus:outline-none"
                                                        value={omDetails.mecanico_id || ""}
                                                        onChange={e => handleUpdateOmFields({ mecanico_id: e.target.value || null })}
                                                    >
                                                        <option value="">Sem Mecânico</option>
                                                        {mecanicos.map(mec => (
                                                            <option key={mec.id} value={mec.id}>{mec.nome}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-1.5">
                                                    <Label className="text-xs">Tipo</Label>
                                                    <select
                                                        className="w-full h-10 px-3 rounded-xl border border-border bg-background text-xs font-medium focus:outline-none"
                                                        value={omDetails.tipo}
                                                        onChange={e => handleUpdateOmFields({ tipo: e.target.value })}
                                                    >
                                                        <option value="Revisão Interna">Revisão Interna</option>
                                                        <option value="Garantia">Garantia</option>
                                                    </select>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label className="text-xs">Mão de Obra (R$)</Label>
                                                    <div className="relative">
                                                        <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                                                        <Input
                                                            type="number"
                                                            step="0.01"
                                                            value={omDetails.custo_mao_obra}
                                                            onBlur={e => handleUpdateOmFields({ custo_mao_obra: parseFloat(e.target.value) || 0 })}
                                                            onChange={e => setOmDetails({ ...omDetails, custo_mao_obra: e.target.value })}
                                                            className="pl-7 h-10 text-xs rounded-xl"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="bg-muted/30 border border-border/80 rounded-2xl p-4 space-y-4">
                                            <h3 className="font-extrabold text-xs text-foreground uppercase tracking-wider flex items-center gap-1.5">
                                                <FileText className="w-3.5 h-3.5 text-primary" /> Observações & Detalhes
                                            </h3>
                                            <div className="space-y-2">
                                                <textarea
                                                    className="w-full p-3 rounded-xl border border-border bg-background text-xs min-h-[100px] focus:outline-none resize-none"
                                                    value={omDetails.observacoes || ""}
                                                    placeholder="Adicione anotações sobre o progresso da manutenção..."
                                                    onBlur={e => handleUpdateOmFields({ observacoes: e.target.value || null })}
                                                    onChange={e => setOmDetails({ ...omDetails, observacoes: e.target.value })}
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4 text-xs bg-muted/10 p-4 border border-border/60 rounded-2xl font-medium">
                                            <div className="space-y-1">
                                                <p className="text-muted-foreground">Início da OM</p>
                                                <p className="font-bold flex items-center gap-1">
                                                    <Calendar className="w-3.5 h-3.5 text-slate-400" /> {fmtDate(omDetails.data_inicio)}
                                                </p>
                                            </div>
                                            <div className="space-y-1">
                                                <p className="text-muted-foreground">Finalização</p>
                                                <p className="font-bold flex items-center gap-1">
                                                    <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" /> 
                                                    {omDetails.data_fim ? fmtDate(omDetails.data_fim) : "Em andamento"}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* TAB 2: RETÍFICAS */}
                                {sheetTab === "retificas" && (
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center">
                                            <h3 className="font-bold text-sm">Peças enviadas para a Retífica</h3>
                                            <Button 
                                                onClick={() => handleOpenRetificaModal()}
                                                size="sm"
                                                className="gap-1.5 h-8 text-[11px] font-bold rounded-lg bg-primary hover:bg-primary/90 text-white"
                                            >
                                                <Plus className="w-3.5 h-3.5" /> Adicionar Peça
                                            </Button>
                                        </div>

                                        <div className="space-y-3">
                                            {omDetails.retificas?.length === 0 ? (
                                                <div className="py-12 border border-dashed rounded-2xl flex flex-col items-center justify-center text-muted-foreground/30 bg-muted/5">
                                                    <ArrowLeftRight className="w-8 h-8 mb-2" />
                                                    <p className="text-xs font-semibold">Nenhuma peça em retífica cadastrada.</p>
                                                </div>
                                            ) : (
                                                omDetails.retificas.map((ret: Retifica) => (
                                                    <div 
                                                        key={ret.id} 
                                                        className="p-4 bg-muted/20 border border-border/80 rounded-2xl hover:shadow-sm transition-all space-y-3 relative group"
                                                    >
                                                        <div className="flex justify-between items-start">
                                                            <div>
                                                                <h4 className="font-extrabold text-sm text-foreground pr-10">{ret.nome_peca}</h4>
                                                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                                                    Retífica: <strong className="text-foreground">{ret.fornecedor_nome || "Não informado"}</strong>
                                                                </p>
                                                            </div>
                                                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute right-4 top-4">
                                                                <Button 
                                                                    variant="ghost" 
                                                                    size="icon" 
                                                                    className="h-7 w-7 text-muted-foreground hover:bg-muted"
                                                                    onClick={() => handleOpenRetificaModal(ret)}
                                                                >
                                                                    <Pencil className="w-3.5 h-3.5" />
                                                                </Button>
                                                                <Button 
                                                                    variant="ghost" 
                                                                    size="icon" 
                                                                    className="h-7 w-7 text-rose-500 hover:text-rose-600 hover:bg-rose-50"
                                                                    onClick={() => handleDeleteRetifica(ret.id)}
                                                                >
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </Button>
                                                            </div>
                                                        </div>

                                                        <div className="grid grid-cols-2 gap-4 text-xs">
                                                            <div className="space-y-1">
                                                                <span className="text-muted-foreground">Previsão Retorno</span>
                                                                <p className="font-bold flex items-center gap-1">
                                                                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                                                                    {ret.data_retorno_previsao ? fmtDate(ret.data_retorno_previsao) : "Não definida"}
                                                                </p>
                                                            </div>
                                                            <div className="space-y-1">
                                                                <span className="text-muted-foreground">Valor Serviço</span>
                                                                <p className="font-bold text-emerald-600 flex items-center gap-1">
                                                                    <DollarSign className="w-3.5 h-3.5" /> {fmt(ret.valor_servico)}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        <div className="flex justify-between items-center pt-2 border-t border-border/50">
                                                            <span className="text-[10px] text-muted-foreground font-medium">
                                                                Enviado em {ret.data_envio ? fmtDate(ret.data_envio) : "—"}
                                                            </span>
                                                            <Badge className={cn(
                                                                "text-[10px] font-bold border-none",
                                                                ret.status === "Retornado" ? "bg-emerald-500/10 text-emerald-600" :
                                                                ret.status === "Em Processo" ? "bg-blue-500/10 text-blue-600" :
                                                                ret.status === "Condenado" ? "bg-rose-500/10 text-rose-600" : "bg-amber-500/10 text-amber-600"
                                                            )}>
                                                                {ret.status}
                                                            </Badge>
                                                        </div>
                                                        {ret.observacoes && (
                                                            <p className="text-[10px] bg-background p-2 rounded-lg text-muted-foreground italic">
                                                                OBS: {ret.observacoes}
                                                            </p>
                                                        )}
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* TAB 3: INSUMOS & AUTOPEÇAS */}
                                {sheetTab === "insumos" && (
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center">
                                            <h3 className="font-bold text-sm">Peças & Insumos Utilizados</h3>
                                            <Button 
                                                onClick={() => handleOpenInsumoModal()}
                                                size="sm"
                                                className="gap-1.5 h-8 text-[11px] font-bold rounded-lg bg-primary hover:bg-primary/90 text-white"
                                            >
                                                <Plus className="w-3.5 h-3.5" /> Registrar Insumo
                                            </Button>
                                        </div>

                                        <div className="space-y-3">
                                            {omDetails.insumos?.length === 0 ? (
                                                <div className="py-12 border border-dashed rounded-2xl flex flex-col items-center justify-center text-muted-foreground/30 bg-muted/5">
                                                    <ShoppingCart className="w-8 h-8 mb-2" />
                                                    <p className="text-xs font-semibold">Nenhuma peça ou insumo registrado.</p>
                                                </div>
                                            ) : (
                                                omDetails.insumos.map((ins: Insumo) => (
                                                    <div 
                                                        key={ins.id} 
                                                        className="p-4 bg-muted/20 border border-border/80 rounded-2xl hover:shadow-sm transition-all space-y-3 relative group"
                                                    >
                                                        <div className="flex justify-between items-start">
                                                            <div>
                                                                <h4 className="font-extrabold text-sm text-foreground pr-10">{ins.nome_peca}</h4>
                                                                <div className="flex flex-wrap gap-2 mt-1">
                                                                    {ins.produto_insumo_id ? (
                                                                        <Badge className="bg-emerald-500/10 text-emerald-600 border-none font-bold text-[9px] px-1.5 py-0">
                                                                            Estoque Loja
                                                                        </Badge>
                                                                    ) : (
                                                                        <Badge className="bg-blue-500/10 text-blue-600 border-none font-bold text-[9px] px-1.5 py-0">
                                                                            Compra Externa
                                                                        </Badge>
                                                                    )}
                                                                    {ins.sku_interno && (
                                                                        <span className="text-[10px] text-muted-foreground font-mono">SKU: {ins.sku_interno}</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute right-4 top-4">
                                                                <Button 
                                                                    variant="ghost" 
                                                                    size="icon" 
                                                                    className="h-7 w-7 text-muted-foreground hover:bg-muted"
                                                                    onClick={() => handleOpenInsumoModal(ins)}
                                                                >
                                                                    <Pencil className="w-3.5 h-3.5" />
                                                                </Button>
                                                                <Button 
                                                                    variant="ghost" 
                                                                    size="icon" 
                                                                    className="h-7 w-7 text-rose-500 hover:text-rose-600 hover:bg-rose-50"
                                                                    onClick={() => handleDeleteInsumo(ins.id)}
                                                                >
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </Button>
                                                            </div>
                                                        </div>

                                                        <div className="grid grid-cols-3 gap-4 text-xs font-semibold">
                                                            <div className="space-y-0.5">
                                                                <span className="text-muted-foreground text-[10px]">Valor Unitário</span>
                                                                <p className="text-foreground">{fmt(ins.valor_compra)}</p>
                                                            </div>
                                                            <div className="space-y-0.5">
                                                                <span className="text-muted-foreground text-[10px]">Qtd</span>
                                                                <p className="text-foreground">{ins.quantidade}x</p>
                                                            </div>
                                                            <div className="space-y-0.5">
                                                                <span className="text-muted-foreground text-[10px]">Subtotal</span>
                                                                <p className="text-emerald-600 font-bold">{fmt(ins.valor_compra * ins.quantidade)}</p>
                                                            </div>
                                                        </div>

                                                        <div className="flex flex-col gap-1 pt-2 border-t border-border/50 text-[10px] text-muted-foreground">
                                                            {ins.fornecedor_id ? (
                                                                <p>Fornecedor: <strong className="text-foreground font-semibold">{ins.fornecedor_nome}</strong></p>
                                                            ) : ins.fornecedor_nome_avulso ? (
                                                                <p>Fornecedor Avulso: <strong className="text-foreground font-semibold">{ins.fornecedor_nome_avulso}</strong></p>
                                                            ) : null}
                                                            {ins.numero_nfe && (
                                                                <p>NF-e: <span className="font-mono text-foreground font-semibold">{ins.numero_nfe}</span></p>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* TAB 4: FINANCEIRO */}
                                {sheetTab === "financeiro" && (
                                    <div className="space-y-5">
                                        <h3 className="font-extrabold text-sm">Resumo Financeiro da Manutenção</h3>

                                        <div className="grid grid-cols-1 gap-3">
                                            {/* Subtotal Labor */}
                                            <div className="flex justify-between items-center p-3 bg-muted/40 border border-border/80 rounded-xl">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                                                        <User className="w-4 h-4" />
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-bold text-foreground">Mão de Obra</p>
                                                        <p className="text-[10px] text-muted-foreground">Serviço do Mecânico</p>
                                                    </div>
                                                </div>
                                                <span className="font-bold text-sm text-foreground">
                                                    {fmt(omDetails.custo_mao_obra)}
                                                </span>
                                            </div>

                                            {/* Subtotal Retificas */}
                                            <div className="flex justify-between items-center p-3 bg-muted/40 border border-border/80 rounded-xl">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center">
                                                        <ArrowLeftRight className="w-4 h-4" />
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-bold text-foreground">Retíficas Externas</p>
                                                        <p className="text-[10px] text-muted-foreground">Usinagem e recuperação de peças</p>
                                                    </div>
                                                </div>
                                                <span className="font-bold text-sm text-foreground">
                                                    {fmt(omDetails.custo_total_retifica)}
                                                </span>
                                            </div>

                                            {/* Subtotal Insumos */}
                                            <div className="flex justify-between items-center p-3 bg-muted/40 border border-border/80 rounded-xl">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
                                                        <ShoppingCart className="w-4 h-4" />
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-bold text-foreground">Peças & Insumos</p>
                                                        <p className="text-[10px] text-muted-foreground">Compradas ou tiradas do estoque</p>
                                                    </div>
                                                </div>
                                                <span className="font-bold text-sm text-foreground">
                                                    {fmt(omDetails.custo_total_insumos)}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Total Summary */}
                                        <div className="p-5 bg-emerald-500/10 border-2 border-emerald-500/20 rounded-2xl space-y-3">
                                            <div className="flex justify-between items-center text-emerald-600 font-extrabold text-base">
                                                <span>CUSTO TOTAL OM</span>
                                                <span>{fmt(omDetails.custo_total)}</span>
                                            </div>
                                            <div className="text-[11px] text-emerald-600/90 leading-normal flex items-start gap-2">
                                                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                                                <span>
                                                    Ao transitar o status desta Ordem de Manutenção para <strong>"Concluído"</strong>, este custo acumulado de <strong>{fmt(omDetails.custo_total)}</strong> será somado automaticamente ao custo cadastrado do motor/câmbio original no estoque, permitindo um cálculo de margem de lucro exato na venda!
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </SheetContent>
            </Sheet>

            {/* MODAL: ADICIONAR/EDITAR RETÍFICA */}
            <Modal
                isOpen={isRetificaModalOpen}
                onClose={() => setIsRetificaModalOpen(false)}
                title={editingRetifica ? "Editar Peça na Retífica" : "Adicionar Peça para Retífica"}
                className="max-w-md"
            >
                <form onSubmit={handleSaveRetifica} className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label>Nome/Descrição da Peça *</Label>
                        <Input
                            placeholder="Ex: Bloco do Motor, Cabeçote, Vira..."
                            value={retificaForm.nome_peca}
                            onChange={e => setRetificaForm({...retificaForm, nome_peca: e.target.value})}
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Oficina de Retífica (Fornecedor)</Label>
                        <select
                            className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-medium focus:outline-none"
                            value={retificaForm.fornecedor_id}
                            onChange={e => setRetificaForm({...retificaForm, fornecedor_id: e.target.value})}
                        >
                            <option value="">Selecione uma oficina...</option>
                            {fornecedores.map(f => (
                                <option key={f.id} value={f.id}>{f.nome}</option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Valor do Serviço (R$)</Label>
                            <Input
                                type="number"
                                step="0.01"
                                value={retificaForm.valor_servico}
                                onChange={e => setRetificaForm({...retificaForm, valor_servico: parseFloat(e.target.value) || 0})}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Status Retífica</Label>
                            <select
                                className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-medium focus:outline-none"
                                value={retificaForm.status}
                                onChange={e => setRetificaForm({...retificaForm, status: e.target.value as any})}
                            >
                                <option value="Enviado">Enviado</option>
                                <option value="Em Processo">Em Processo</option>
                                <option value="Retornado">Retornado</option>
                                <option value="Condenado">Condenado</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Data de Envio</Label>
                            <Input
                                type="date"
                                value={retificaForm.data_envio}
                                onChange={e => setRetificaForm({...retificaForm, data_envio: e.target.value})}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Previsão de Retorno</Label>
                            <Input
                                type="date"
                                value={retificaForm.data_retorno_previsao}
                                onChange={e => setRetificaForm({...retificaForm, data_retorno_previsao: e.target.value})}
                            />
                        </div>
                    </div>

                    {retificaForm.status === "Retornado" && (
                        <div className="space-y-2">
                            <Label>Data de Retorno Real</Label>
                            <Input
                                type="date"
                                value={retificaForm.data_retorno_real}
                                onChange={e => setRetificaForm({...retificaForm, data_retorno_real: e.target.value})}
                            />
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label>Observações adicionais</Label>
                        <Input
                            placeholder="Ex: Medida final, folgas, problemas..."
                            value={retificaForm.observacoes}
                            onChange={e => setRetificaForm({...retificaForm, observacoes: e.target.value})}
                        />
                    </div>

                    <div className="flex gap-3 pt-4 border-t border-border">
                        <Button type="button" variant="outline" className="flex-1 rounded-xl" onClick={() => setIsRetificaModalOpen(false)}>
                            Cancelar
                        </Button>
                        <Button type="submit" className="flex-1 rounded-xl text-white font-bold bg-primary hover:bg-primary/90">
                            Confirmar
                        </Button>
                    </div>
                </form>
            </Modal>

            {/* MODAL: REGISTRAR INSUMO */}
            <Modal
                isOpen={isInsumoModalOpen}
                onClose={() => setIsInsumoModalOpen(false)}
                title={editingInsumo ? "Editar Insumo/Peça" : "Adicionar Insumo/Peça na OM"}
                className="max-w-md"
            >
                <form onSubmit={handleSaveInsumo} className="space-y-4 py-2">
                    {/* TOGLE INTERNAL OR EXTERNAL STOCK */}
                    {!editingInsumo && (
                        <div className="flex gap-2 p-1.5 bg-muted rounded-xl border border-border">
                            <button
                                type="button"
                                onClick={() => {
                                    setUseInternalStock(false)
                                    setSelectedInsumoProd(null)
                                    setInsumoProdSearch("")
                                }}
                                className={cn(
                                    "flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors",
                                    !useInternalStock ? "bg-background text-foreground shadow-sm font-extrabold" : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                Compra Externa
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setUseInternalStock(true)
                                    setSelectedInsumoProd(null)
                                    setInsumoProdSearch("")
                                }}
                                className={cn(
                                    "flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors",
                                    useInternalStock ? "bg-background text-foreground shadow-sm font-extrabold" : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                Peça do Estoque Interno
                            </button>
                        </div>
                    )}

                    {/* SE FOR DO ESTOQUE INTERNO, BUSCAR PRODUTO NO ESTOQUE */}
                    {useInternalStock ? (
                        <div className="space-y-2 relative">
                            <Label className="font-bold text-foreground">Buscar Peça no Estoque da Loja *</Label>
                            {!selectedInsumoProd ? (
                                <>
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                        <Input
                                            placeholder="SKU, nome ou pn da peça..."
                                            value={insumoProdSearch}
                                            onChange={e => setInsumoProdSearch(e.target.value)}
                                            className="pl-10 h-10 rounded-xl"
                                        />
                                        {isSearchingInsumoProds && (
                                            <RefreshCw className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
                                        )}
                                    </div>
                                    {searchedInsumoProds.length > 0 && (
                                        <div className="absolute z-50 left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-xl max-h-48 overflow-y-auto p-1.5 space-y-1">
                                            {searchedInsumoProds.map(p => (
                                                <div
                                                    key={p.id}
                                                    onClick={() => {
                                                        setSelectedInsumoProd(p)
                                                        setInsumoForm({
                                                            ...insumoForm,
                                                            nome_peca: p.nome,
                                                            sku_interno: p.sku,
                                                            valor_compra: p.custo || p.preco_venda || 0
                                                        })
                                                        setSearchedInsumoProds([])
                                                    }}
                                                    className="p-2 hover:bg-muted text-[11px] font-bold cursor-pointer rounded-lg flex justify-between items-center"
                                                >
                                                    <div className="min-w-0 flex-1 pr-3">
                                                        <p className="truncate text-foreground">{p.nome}</p>
                                                        <p className="text-[9px] text-muted-foreground mt-0.5">SKU: {p.sku}</p>
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <p className="text-emerald-600 font-extrabold">{fmt(p.custo)}</p>
                                                        <p className="text-[9px] text-muted-foreground">Qtd: {p.estoque_atual}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="flex items-center justify-between p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-xl h-12">
                                    <div className="min-w-0 pr-6">
                                        <p className="text-xs font-bold text-foreground truncate">{selectedInsumoProd.nome}</p>
                                        <p className="text-[9px] text-muted-foreground mt-0.5">SKU: {selectedInsumoProd.sku} | Estoque Disponível: {selectedInsumoProd.estoque_atual}</p>
                                    </div>
                                    <Button 
                                        type="button" 
                                        variant="ghost" 
                                        size="icon" 
                                        className="w-7 h-7 text-muted-foreground hover:text-destructive shrink-0"
                                        onClick={() => {
                                            setSelectedInsumoProd(null)
                                            setInsumoForm({...insumoForm, nome_peca: "", sku_interno: "", valor_compra: 0})
                                        }}
                                    >
                                        <X className="w-4 h-4" />
                                    </Button>
                                </div>
                            )}
                        </div>
                    ) : (
                        // SE FOR COMPRA EXTERNA
                        <div className="space-y-2">
                            <Label>Nome da Peça Comprada *</Label>
                            <Input
                                placeholder="Ex: Jogo de Juntas, Bronzinas..."
                                value={insumoForm.nome_peca}
                                onChange={e => setInsumoForm({...insumoForm, nome_peca: e.target.value})}
                                required
                            />
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Preço de Compra/Custo (R$)</Label>
                            <Input
                                type="number"
                                step="0.01"
                                value={insumoForm.valor_compra}
                                onChange={e => setInsumoForm({...insumoForm, valor_compra: parseFloat(e.target.value) || 0})}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Quantidade *</Label>
                            <Input
                                type="number"
                                value={insumoForm.quantidade}
                                onChange={e => setInsumoForm({...insumoForm, quantidade: parseInt(e.target.value) || 1})}
                                min="1"
                                required
                            />
                        </div>
                    </div>

                    {!useInternalStock && (
                        <>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Fornecedor (Opção 1)</Label>
                                    <select
                                        className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-medium focus:outline-none"
                                        value={insumoForm.fornecedor_id}
                                        onChange={e => setInsumoForm({...insumoForm, fornecedor_id: e.target.value, fornecedor_nome_avulso: ""})}
                                    >
                                        <option value="">Selecione do cadastro...</option>
                                        {fornecedores.map(f => (
                                            <option key={f.id} value={f.id}>{f.nome}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Fornecedor Avulso (Opção 2)</Label>
                                    <Input
                                        placeholder="Caso não cadastrado..."
                                        value={insumoForm.fornecedor_nome_avulso}
                                        onChange={e => setInsumoForm({...insumoForm, fornecedor_nome_avulso: e.target.value, fornecedor_id: ""})}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Nº NF-e (Opcional)</Label>
                                    <Input
                                        placeholder="Ex: 000.123.456"
                                        value={insumoForm.numero_nfe}
                                        onChange={e => setInsumoForm({...insumoForm, numero_nfe: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Data de Compra</Label>
                                    <Input
                                        type="date"
                                        value={insumoForm.data_compra}
                                        onChange={e => setInsumoForm({...insumoForm, data_compra: e.target.value})}
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    {useInternalStock && (
                        <div className="space-y-2">
                            <Label>SKU Interno da Peça</Label>
                            <Input
                                value={selectedInsumoProd ? selectedInsumoProd.sku : insumoForm.sku_interno}
                                disabled
                                className="bg-muted text-muted-foreground"
                            />
                        </div>
                    )}

                    <div className="flex gap-3 pt-4 border-t border-border">
                        <Button type="button" variant="outline" className="flex-1 rounded-xl" onClick={() => setIsInsumoModalOpen(false)}>
                            Cancelar
                        </Button>
                        <Button type="submit" className="flex-1 rounded-xl text-white font-bold bg-primary hover:bg-primary/90">
                            Confirmar
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    )
}
