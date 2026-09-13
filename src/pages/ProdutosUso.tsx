import { useEffect, useState, useCallback, useMemo } from "react"
import { produtosUsoApi } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Modal } from "@/components/ui/modal"
import { 
    Plus, Search, RefreshCw, Package, AlertTriangle, 
    Calendar, DollarSign, Trash2, Pencil, Warehouse, 
    Filter, X, ShoppingCart, ListChecks, ArrowDownCircle,
    ClipboardList
} from "lucide-react"
import { fmt, fmtDate } from "@/lib/format"
import { toast } from "sonner"
import { useAuthStore } from "@/store/authStore"
import { cn } from "@/lib/utils"

interface ProdutoUso {
    id: string
    nome: string
    descricao: string | null
    categoria: string | null
    unidade?: string | null
    ativo?: boolean | null
    estoque_atual: number
    estoque_minimo: number
    ultima_compra_data: string | null
    ultima_compra_valor: number | null
    created_at: string
}

export function ProdutosUso() {
    const { atendente } = useAuthStore()
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [produtos, setProdutos] = useState<ProdutoUso[]>([])
    const [searchTerm, setSearchTerm] = useState("")
    const [filterCategoria, setFilterCategoria] = useState<string>("todos")
    const [showOnlyLowStock, setShowOnlyLowStock] = useState(false)
    
    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingProduct, setEditingProduct] = useState<ProdutoUso | null>(null)
    const [form, setForm] = useState({
        nome: "",
        descricao: "",
        categoria: "Limpeza",
        estoque_atual: 0,
        estoque_minimo: 0,
        ultima_compra_data: "",
        ultima_compra_valor: 0
    })

    const fetchProdutos = useCallback(async () => {
        setLoading(true)
        try {
            const data = await produtosUsoApi.listar()
            setProdutos(Array.isArray(data) ? data : [])
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "Erro desconhecido"
            toast.error("Erro ao carregar produtos: " + msg)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchProdutos()
    }, [fetchProdutos])

    const filtered = useMemo(() => {
        return produtos.filter(p => {
            const matchesSearch = p.nome.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                (p.descricao || "").toLowerCase().includes(searchTerm.toLowerCase())
            const matchesCategory = filterCategoria === "todos" || p.categoria === filterCategoria
            const matchesLowStock = !showOnlyLowStock || p.estoque_atual <= p.estoque_minimo
            
            return matchesSearch && matchesCategory && matchesLowStock
        })
    }, [produtos, searchTerm, filterCategoria, showOnlyLowStock])

    const categorias = useMemo(() => {
        const set = new Set(produtos.map(p => p.categoria).filter(Boolean))
        return ["todos", ...Array.from(set).sort()]
    }, [produtos])

    const openAddModal = () => {
        setEditingProduct(null)
        setForm({
            nome: "",
            descricao: "",
            categoria: "Limpeza",
            estoque_atual: 0,
            estoque_minimo: 1,
            ultima_compra_data: new Date().toISOString().split("T")[0],
            ultima_compra_valor: 0
        })
        setIsModalOpen(true)
    }

    const openEditModal = (p: ProdutoUso) => {
        setEditingProduct(p)
        setForm({
            nome: p.nome,
            descricao: p.descricao || "",
            categoria: p.categoria || "Limpeza",
            estoque_atual: p.estoque_atual,
            estoque_minimo: p.estoque_minimo,
            ultima_compra_data: p.ultima_compra_data || "",
            ultima_compra_valor: p.ultima_compra_valor || 0
        })
        setIsModalOpen(true)
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        setSubmitting(true)
        try {
            const payload = {
                ...form,
                ultima_compra_data: form.ultima_compra_data || null,
                ultima_compra_valor: parseFloat(form.ultima_compra_valor as any) || 0,
                estoque_atual: parseInt(form.estoque_atual as any) || 0,
                estoque_minimo: parseInt(form.estoque_minimo as any) || 0
            }

            if (editingProduct) {
                await produtosUsoApi.atualizar(editingProduct.id, payload)
                toast.success("Produto atualizado!")
            } else {
                await produtosUsoApi.criar(payload)
                toast.success("Produto cadastrado!")
            }
            setIsModalOpen(false)
            fetchProdutos()
        } catch (e: unknown) {
            toast.error("Erro ao salvar: " + (e instanceof Error ? e.message : "Erro desconhecido"))
        } finally {
            setSubmitting(false)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm("Tem certeza que deseja excluir este item?")) return
        try {
            await produtosUsoApi.deletar(id)
            toast.success("Item removido!")
            fetchProdutos()
        } catch (e: unknown) {
            toast.error("Erro ao excluir: " + (e instanceof Error ? e.message : "Erro desconhecido"))
        }
    }

    const handleQuickStock = async (p: ProdutoUso, delta: number) => {
        const newVal = Math.max(0, p.estoque_atual + delta)
        try {
            await produtosUsoApi.atualizar(p.id, { estoque_atual: newVal })
            setProdutos(prev => prev.map(item => item.id === p.id ? { ...item, estoque_atual: newVal } : item))
        } catch (e: unknown) {
            toast.error("Erro ao atualizar estoque: " + (e instanceof Error ? e.message : "Erro desconhecido"))
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-3">
                        <ClipboardList className="w-8 h-8 text-primary" /> Uso Interno & Faltas
                    </h1>
                    <p className="text-muted-foreground mt-1 text-sm md:text-base">Gestão de suprimentos, materiais de consumo e peças em falta.</p>
                </div>
                <Button onClick={openAddModal} className="gap-2 h-11 px-6 rounded-xl shadow-lg w-full md:w-auto">
                    <Plus className="w-4 h-4" /> Novo Item
                </Button>
            </div>

            <Card className="border-border shadow-sm">
                <CardContent className="pt-6">
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input 
                                placeholder="Buscar por nome ou descrição..." 
                                className="pl-10 rounded-xl"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <select 
                                className="h-10 px-3 rounded-xl border border-input bg-background text-sm flex-1 md:flex-none"
                                value={filterCategoria}
                                onChange={e => setFilterCategoria(e.target.value)}
                            >
                                {categorias.map(cat => (
                                    <option key={cat} value={cat}>{cat === 'todos' ? 'Todas Categorias' : cat}</option>
                                ))}
                            </select>
                            <Button 
                                variant={showOnlyLowStock ? "destructive" : "outline"} 
                                className="gap-2 rounded-xl flex-1 md:flex-none"
                                onClick={() => setShowOnlyLowStock(!showOnlyLowStock)}
                            >
                                <AlertTriangle className="w-4 h-4" />
                                <span className="truncate">{showOnlyLowStock ? "Ver Todos" : "Abaixo do Mínimo"}</span>
                            </Button>
                            <Button variant="outline" size="icon" onClick={fetchProdutos} className="rounded-xl shrink-0">
                                <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {loading ? (
                    Array(8).fill(0).map((_, i) => (
                        <Card key={i} className="animate-pulse bg-muted/40 h-48 rounded-2xl border-none" />
                    ))
                ) : filtered.length === 0 ? (
                    <div className="col-span-full py-20 text-center space-y-3">
                        <Package className="w-12 h-12 mx-auto text-muted-foreground/30" />
                        <p className="text-muted-foreground">Nenhum item encontrado.</p>
                    </div>
                ) : (
                    filtered.map(p => {
                        const isLow = p.estoque_atual <= p.estoque_minimo
                        return (
                            <Card key={p.id} className={cn(
                                "group border shadow-sm hover:shadow-md transition-all rounded-2xl overflow-hidden",
                                isLow && "border-rose-200 bg-rose-50/20"
                            )}>
                                <CardHeader className="pb-2">
                                    <div className="flex justify-between items-start">
                                        <Badge variant="outline" className="text-[10px] uppercase font-bold px-1.5 py-0">
                                            {p.categoria}
                                        </Badge>
                                        <div className="flex gap-1 md:opacity-0 md:group-hover:opacity-100 opacity-100 transition-opacity">
                                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditModal(p)}>
                                                <Pencil className="w-3.5 h-3.5" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-500 hover:text-rose-600" onClick={() => handleDelete(p.id)}>
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                    <CardTitle className="text-base font-bold leading-tight mt-1 line-clamp-1">{p.nome}</CardTitle>
                                    <p className="text-xs text-muted-foreground line-clamp-2 min-h-[32px]">{p.descricao || "Sem descrição"}</p>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex items-center justify-between p-3 rounded-xl bg-background border">
                                        <div className="text-center flex-1 border-r">
                                            <p className="text-[9px] uppercase font-bold text-muted-foreground mb-0.5">Estoque</p>
                                            <p className={cn("text-xl font-black", isLow ? "text-rose-600" : "text-primary")}>
                                                {p.estoque_atual}
                                            </p>
                                        </div>
                                        <div className="text-center flex-1">
                                            <p className="text-[9px] uppercase font-bold text-muted-foreground mb-0.5">Mínimo</p>
                                            <p className="text-xl font-black text-slate-400">
                                                {p.estoque_minimo}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 text-[10px] bg-muted/30 p-2 rounded-lg">
                                        <div className="space-y-0.5">
                                            <p className="uppercase font-bold text-muted-foreground">Última Compra</p>
                                            <p className="font-bold">{p.ultima_compra_data ? fmtDate(p.ultima_compra_data) : "—"}</p>
                                        </div>
                                        <div className="space-y-0.5 text-right">
                                            <p className="uppercase font-bold text-muted-foreground">Valor pago</p>
                                            <p className="font-bold text-emerald-600">{p.ultima_compra_valor ? fmt(p.ultima_compra_valor) : "—"}</p>
                                        </div>
                                    </div>

                                    <div className="flex gap-1 pt-1">
                                        <Button variant="outline" size="sm" className="flex-1 h-8 text-xs font-bold rounded-lg" onClick={() => handleQuickStock(p, -1)}>
                                            -1
                                        </Button>
                                        <Button variant="default" size="sm" className="flex-1 h-8 text-xs font-black rounded-lg" onClick={() => handleQuickStock(p, 1)}>
                                            +1
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        )
                    })
                )}
            </div>

            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editingProduct ? "Editar Item" : "Novo Item de Consumo/Falta"}
                className="max-w-md"
            >
                <form onSubmit={handleSave} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Nome do Item *</Label>
                        <Input 
                            value={form.nome} 
                            onChange={e => setForm({...form, nome: e.target.value})} 
                            placeholder="Ex: Bobinas Térmicas, Detergente, etc." 
                            required 
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Descrição / Observações</Label>
                        <Input 
                            value={form.descricao} 
                            onChange={e => setForm({...form, descricao: e.target.value})} 
                            placeholder="Marca, tipo, tamanho..." 
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Categoria</Label>
                            <select 
                                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                                value={form.categoria}
                                onChange={e => setForm({...form, categoria: e.target.value})}
                            >
                                <option value="Limpeza">Limpeza</option>
                                <option value="Escritório">Escritório</option>
                                <option value="Embalagem">Embalagem</option>
                                <option value="Peça em Falta">Peça em Falta</option>
                                <option value="Ferramentas">Ferramentas</option>
                                <option value="Outros">Outros</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label>Estoque Atual</Label>
                            <Input 
                                type="number" 
                                value={form.estoque_atual} 
                                onChange={e => setForm({...form, estoque_atual: parseInt(e.target.value) || 0})} 
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Estoque Mínimo</Label>
                            <Input 
                                type="number" 
                                value={form.estoque_minimo} 
                                onChange={e => setForm({...form, estoque_minimo: parseInt(e.target.value) || 0})} 
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Valor Última Compra</Label>
                            <div className="relative">
                                <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input 
                                    type="number" 
                                    step="0.01" 
                                    className="pl-8"
                                    value={form.ultima_compra_valor} 
                                    onChange={e => setForm({...form, ultima_compra_valor: parseFloat(e.target.value) || 0})} 
                                />
                            </div>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Data Última Compra</Label>
                        <Input 
                            type="date" 
                            value={form.ultima_compra_data} 
                            onChange={e => setForm({...form, ultima_compra_data: e.target.value})} 
                        />
                    </div>

                    <div className="flex gap-3 pt-4 border-t">
                        <Button type="button" variant="outline" className="flex-1" onClick={() => setIsModalOpen(false)}>
                            Cancelar
                        </Button>
                        <Button type="submit" className="flex-1" disabled={submitting}>
                            {submitting ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                            {editingProduct ? "Salvar" : "Cadastrar"}
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    )
}
