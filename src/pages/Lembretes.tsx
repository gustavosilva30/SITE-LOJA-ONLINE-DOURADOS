import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Modal } from "@/components/ui/modal"
import {
    Calendar as CalendarIcon,
    Clock,
    AlertCircle,
    Plus,
    CheckCircle2,
    User,
    ArrowRight,
    TrendingUp,
    Bell,
    CheckSquare,
    Pencil,
    Trash2
} from "lucide-react"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"

interface Lembrete {
    id: string
    titulo: string
    descricao: string | null
    data_lembrete: string
    prioridade: 'Baixa' | 'Média' | 'Alta' | 'Urgente'
    status: 'Pendente' | 'Concluído' | 'Cancelado'
    categoria: string
    vincular_cliente_id: string | null
    atendente_id: string | null
    clientes?: { nome: string }
    atendentes?: { nome: string, cor_identificacao: string }
}

interface Atendente {
    id: string
    nome: string
    cargo: string
    cor_identificacao: string
}

export function Lembretes() {
    const [lembretes, setLembretes] = useState<Lembrete[]>([])
    const [loading, setLoading] = useState(true)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingLembrete, setEditingLembrete] = useState<Lembrete | null>(null)
    const [submitting, setSubmitting] = useState(false)

    // Resources
    const [clientes, setClientes] = useState<{ id: string, nome: string }[]>([])
    const [atendentes, setAtendentes] = useState<Atendente[]>([])

    // Form State
    const [formData, setFormData] = useState({
        titulo: '',
        descricao: '',
        data_lembrete: new Date().toISOString().slice(0, 16),
        prioridade: 'Média' as Lembrete['prioridade'],
        status: 'Pendente' as Lembrete['status'],
        categoria: 'Geral',
        vincular_cliente_id: '',
        atendente_id: ''
    })

    const fetchLembretes = async () => {
        try {
            const data = await api.get('/api/lembretes')
            setLembretes(Array.isArray(data) ? data : [])
        } catch (err) {
            console.error('Error fetching lembretes:', err)
        } finally {
            setLoading(false)
        }
    }

    const fetchResources = async () => {
        try {
            const accC: { id: string; nome: string }[] = []
            let offC = 0
            const lim = 1000
            for (;;) {
                const chunk = await api.get(`/api/clientes/?limit=${lim}&offset=${offC}`)
                const rows = Array.isArray(chunk) ? chunk : []
                accC.push(...rows.map((r: { id: string; nome: string }) => ({ id: r.id, nome: r.nome })))
                if (rows.length < lim) break
                offC += lim
            }
            setClientes(accC)
            const at = await api.get('/api/atendentes/?limit=500&offset=0')
            setAtendentes(Array.isArray(at) ? at : [])
        } catch (e) {
            console.error(e)
        }
    }

    useEffect(() => {
        fetchLembretes()
        fetchResources()
    }, [])

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault()
        setSubmitting(true)
        try {
            const body = {
                titulo: formData.titulo,
                descricao: formData.descricao || null,
                data_lembrete: new Date(formData.data_lembrete).toISOString(),
                prioridade: formData.prioridade,
                status: formData.status,
                categoria: formData.categoria,
                vincular_cliente_id: formData.vincular_cliente_id || null,
                atendente_id: formData.atendente_id || null,
            }
            if (editingLembrete) {
                await api.put(`/api/lembretes/${editingLembrete.id}`, body)
            } else {
                await api.post('/api/lembretes', body)
            }

            setIsModalOpen(false)
            setEditingLembrete(null)
            setFormData({
                titulo: '',
                descricao: '',
                data_lembrete: new Date().toISOString().slice(0, 16),
                prioridade: 'Média',
                status: 'Pendente',
                categoria: 'Geral',
                vincular_cliente_id: '',
                atendente_id: ''
            })
            fetchLembretes()
        } catch (err) {
            console.error(err)
            alert("Erro ao salvar lembrete")
        } finally {
            setSubmitting(false)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm("Deseja realmente excluir este lembrete?")) return
        try {
            await api.delete(`/api/lembretes/${id}`)
            fetchLembretes()
        } catch {
            alert("Erro ao excluir")
        }
    }

    const startEdit = (lembrete: Lembrete) => {
        setEditingLembrete(lembrete)
        setFormData({
            titulo: lembrete.titulo,
            descricao: lembrete.descricao || '',
            data_lembrete: new Date(lembrete.data_lembrete).toISOString().slice(0, 16),
            prioridade: lembrete.prioridade,
            status: lembrete.status,
            categoria: lembrete.categoria,
            vincular_cliente_id: lembrete.vincular_cliente_id || '',
            atendente_id: lembrete.atendente_id || ''
        })
        setIsModalOpen(true)
    }

    const toggleStatus = async (id: string, currentStatus: string) => {
        const nextStatus = currentStatus === 'Pendente' ? 'Concluído' : 'Pendente'
        try {
            await api.put(`/api/lembretes/${id}`, { status: nextStatus })
            fetchLembretes()
        } catch (e) {
            console.error(e)
        }
    }

    // Group by date for "Calendar-ish" view
    const today = new Date().toLocaleDateString('pt-BR')

    const getPriorityColor = (p: string) => {
        switch (p) {
            case 'Urgente': return 'bg-rose-500 text-white animate-pulse'
            case 'Alta': return 'bg-orange-500 text-white'
            case 'Média': return 'bg-blue-500 text-white'
            default: return 'bg-slate-500 text-white'
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-black tracking-tight uppercase flex items-center gap-3">
                        <Bell className="w-8 h-8 text-primary" /> Central de Tarefas & Lembretes
                    </h1>
                    <p className="text-foreground mt-1 font-medium italic">Gestão inteligente de follow-ups e automações para vendas e financeiro.</p>
                </div>
                <Button className="gap-2 shadow-lg shadow-primary/20" onClick={() => {
                    setEditingLembrete(null)
                    setFormData({
                        titulo: '',
                        descricao: '',
                        data_lembrete: new Date().toISOString().slice(0, 16),
                        prioridade: 'Média',
                        status: 'Pendente',
                        categoria: 'Geral',
                        vincular_cliente_id: '',
                        atendente_id: ''
                    })
                    setIsModalOpen(true)
                }}>
                    <Plus className="w-5 h-5" /> Nova Tarefa
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Left Column: Stats & Smart Filters */}
                <div className="space-y-6">
                    <Card className="border-primary/10 bg-primary/5">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-xs font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                                <TrendingUp className="w-4 h-4" /> Desempenho
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-black">{lembretes.filter(l => l.status === 'Concluído').length}</div>
                            <p className="text-[10px] text-foreground uppercase font-bold">Tarefas concluídas hoje</p>
                            <div className="mt-4 h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-primary" style={{ width: `${(lembretes.filter(l => l.status === 'Concluído').length / (lembretes.length || 1)) * 100}%` }}></div>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="space-y-2">
                        <Label className="text-[10px] uppercase font-bold ml-1">Filtros Inteligentes</Label>
                        <Button variant="outline" className="w-full justify-start gap-2 border-rose-500/20 text-rose-600 hover:bg-rose-50">
                            <AlertCircle className="w-4 h-4" /> Urgentes Amanhã
                        </Button>
                        <Button variant="outline" className="w-full justify-start gap-2 border-emerald-500/20 text-emerald-600 hover:bg-emerald-50">
                            <User className="w-4 h-4" /> Follow-up de Vendas
                        </Button>
                        <Button variant="outline" className="w-full justify-start gap-2">
                            <CheckSquare className="w-4 h-4" /> Finalizadas
                        </Button>
                    </div>
                </div>

                {/* Right Columns: The "Innovative" Feed/Calendar */}
                <div className="lg:col-span-3 space-y-4">
                    {loading ? (
                        <div className="h-64 flex items-center justify-center">Carregando sua inteligência...</div>
                    ) : (
                        <div className="space-y-8">
                            {/* Grouping by Atendente Cards */}
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                                {atendentes.map(atendente => {
                                    const lembretesAtendente = lembretes.filter(l => l.atendente_id === atendente.id && l.status === 'Pendente');

                                    return (
                                        <Card key={atendente.id} className="border-t-4 shadow-lg overflow-hidden" style={{ borderTopColor: atendente.cor_identificacao }}>
                                            <CardHeader className="bg-muted/30 py-4">
                                                <div className="flex items-center justify-between">
                                                    <CardTitle className="text-lg font-black uppercase flex items-center gap-2">
                                                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: atendente.cor_identificacao }} />
                                                        {atendente.nome}
                                                    </CardTitle>
                                                    <Badge variant="outline" className="font-bold">{lembretesAtendente.length} Ativas</Badge>
                                                </div>
                                                <CardDescription className="text-[10px] font-bold uppercase">{atendente.cargo || 'Atendente'}</CardDescription>
                                            </CardHeader>
                                            <CardContent className="p-0">
                                                <div className="divide-y divide-border">
                                                    {lembretesAtendente.length === 0 ? (
                                                        <div className="p-8 text-center text-muted-foreground italic text-sm">Sem tarefas pendentes no momento.</div>
                                                    ) : (
                                                        lembretesAtendente.map(item => (
                                                            <div key={item.id} className="p-4 hover:bg-muted/20 transition-colors group">
                                                                <div className="flex items-start gap-4">
                                                                    <button
                                                                        onClick={() => toggleStatus(item.id, item.status)}
                                                                        className="mt-1 w-5 h-5 rounded border-2 border-primary/30 flex items-center justify-center hover:border-primary group-hover:bg-primary/5 transition-all"
                                                                    >
                                                                        <CheckSquare className="w-3.5 h-3.5 opacity-0 group-hover:opacity-30" />
                                                                    </button>
                                                                    <div className="flex-1 space-y-1">
                                                                        <div className="flex items-center justify-between gap-2">
                                                                            <h4 className="font-bold text-sm tracking-tight">{item.titulo}</h4>
                                                                            <div className="flex items-center gap-1">
                                                                                <button onClick={() => startEdit(item)} className="p-1 text-muted-foreground hover:text-primary transition-colors"><Pencil className="w-3 h-3" /></button>
                                                                                <button onClick={() => handleDelete(item.id)} className="p-1 text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="w-3 h-3" /></button>
                                                                                <span className={cn(
                                                                                    "text-[9px] px-1.5 py-0.5 rounded font-black uppercase ml-2",
                                                                                    item.prioridade === 'Urgente' ? "bg-rose-500 text-white" :
                                                                                        item.prioridade === 'Alta' ? "bg-orange-500 text-white" : "bg-muted text-muted-foreground"
                                                                                )}>
                                                                                    {item.prioridade}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{item.descricao}</p>
                                                                        <div className="flex items-center gap-3 pt-2">
                                                                            <span className="text-[10px] flex items-center gap-1 font-mono bg-primary/5 px-2 py-0.5 rounded text-primary border border-primary/10">
                                                                                <Clock className="w-3 h-3" /> {new Date(item.data_lembrete).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                                                                <span className="opacity-40">|</span>
                                                                                {new Date(item.data_lembrete).toLocaleDateString('pt-BR')}
                                                                            </span>
                                                                            {item.clientes && (
                                                                                <span className="text-[10px] font-bold text-muted-foreground hover:text-primary cursor-pointer flex items-center gap-1">
                                                                                    <User className="w-3 h-3" /> {item.clientes.nome}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    )
                                })}

                                {/* Unassigned Tasks */}
                                {lembretes.filter(l => !l.atendente_id && l.status === 'Pendente').length > 0 && (
                                    <Card className="border-t-4 border-t-slate-300 shadow-lg overflow-hidden bg-slate-50/50">
                                        <CardHeader className="bg-slate-200/30 py-4">
                                            <div className="flex items-center justify-between">
                                                <CardTitle className="text-lg font-black uppercase flex items-center gap-2 text-muted-foreground">
                                                    <Bell className="w-5 h-5" /> Tarefas Gerais
                                                </CardTitle>
                                                <Badge variant="outline" className="font-bold">{lembretes.filter(l => !l.atendente_id && l.status === 'Pendente').length} Pendentes</Badge>
                                            </div>
                                            <CardDescription className="text-[10px] font-bold uppercase text-muted-foreground">Sem atendente definido</CardDescription>
                                        </CardHeader>
                                        <CardContent className="p-0">
                                            <div className="divide-y divide-border">
                                                {lembretes.filter(l => !l.atendente_id && l.status === 'Pendente').map(item => (
                                                    <div key={item.id} className="p-4 hover:bg-muted/20 transition-colors group">
                                                        <div className="flex items-start gap-4">
                                                            <button onClick={() => toggleStatus(item.id, item.status)} className="mt-1 w-5 h-5 rounded border-2 border-slate-300 flex items-center justify-center hover:border-primary">
                                                                <CheckSquare className="w-3.5 h-3.5 opacity-0 group-hover:opacity-30" />
                                                            </button>
                                                            <div className="flex-1 space-y-1">
                                                                <h4 className="font-bold text-sm">{item.titulo}</h4>
                                                                <p className="text-xs text-muted-foreground line-clamp-2">{item.descricao}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </CardContent>
                                    </Card>
                                )}
                            </div>

                            {lembretes.filter(l => l.status === 'Concluído').length > 0 && (
                                <div className="pt-8 opacity-40 grayscale hover:grayscale-0 transition-all">
                                    <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2 mb-4">
                                        <CheckCircle2 className="w-4 h-4" /> Concluídas Recentemente
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {lembretes.filter(l => l.status === 'Concluído').slice(0, 3).map((item) => (
                                            <div key={item.id} className="p-3 border border-border rounded-lg text-xs bg-muted/20 flex items-center gap-3">
                                                <CheckCircle2 className="text-emerald-500 w-4 h-4" />
                                                <span className="font-medium line-through">{item.titulo}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* NEW LEMBRETE MODAL */}
            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editingLembrete ? "Editar Lembrete" : "Criar Novo Lembrete Inteligente"}
                className="max-w-xl"
            >
                <form onSubmit={handleCreate} className="space-y-4">
                    <div className="space-y-2">
                        <Label>Título do Lembrete</Label>
                        <Input
                            required
                            placeholder="O que precisa ser feito?"
                            value={formData.titulo}
                            onChange={e => setFormData({ ...formData, titulo: e.target.value })}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Data e Hora</Label>
                            <Input
                                type="datetime-local"
                                required
                                value={formData.data_lembrete}
                                onChange={e => setFormData({ ...formData, data_lembrete: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Prioridade</Label>
                            <Select
                                value={formData.prioridade}
                                onChange={e => setFormData({ ...formData, prioridade: e.target.value as any })}
                            >
                                <option value="Baixa">🟢 Baixa</option>
                                <option value="Média">🔵 Média</option>
                                <option value="Alta">🟠 Alta</option>
                                <option value="Urgente">🔴 Urgente</option>
                            </Select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Categoria</Label>
                            <Select
                                value={formData.categoria}
                                onChange={e => setFormData({ ...formData, categoria: e.target.value })}
                            >
                                <option value="Vendas">💰 Vendas (Follow-up)</option>
                                <option value="Financeiro">💳 Financeiro (Cobrança)</option>
                                <option value="Geral">📋 Geral (Administrativo)</option>
                                <option value="Logística">🚚 Logística (Envio)</option>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Vincular Cliente (Opcional)</Label>
                            <Select
                                value={formData.vincular_cliente_id}
                                onChange={e => setFormData({ ...formData, vincular_cliente_id: e.target.value })}
                            >
                                <option value="">Nenhum vínculo</option>
                                {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Atendente Responsável</Label>
                        <Select
                            required
                            value={formData.atendente_id}
                            onChange={e => setFormData({ ...formData, atendente_id: e.target.value })}
                        >
                            <option value="">Selecione quem fará a tarefa...</option>
                            {atendentes.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>Instruções / Descrição</Label>
                        <textarea
                            className="w-full min-h-[100px] bg-background border border-input rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none"
                            placeholder="Descreva detalhes importantes aqui..."
                            value={formData.descricao}
                            onChange={e => setFormData({ ...formData, descricao: e.target.value })}
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-border">
                        <Button variant="outline" type="button" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                        <Button type="submit" disabled={submitting}>
                            {submitting ? "Processando..." : (editingLembrete ? "Salvar Alterações" : "Agendar Lembrete")}
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    )
}
