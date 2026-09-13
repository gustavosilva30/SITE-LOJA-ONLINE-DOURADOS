import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Modal } from "@/components/ui/modal"
import {
    Plus,
    Search,
    Pencil,
    Trash2,
    Phone,
    User,
    Calendar as CalendarIcon,
    AlertCircle,
    CheckCircle2,
    XCircle,
} from "lucide-react"
import { api, pedidosClientesApi } from "@/lib/api"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

type Status = "aberto" | "procurando" | "encontrado" | "atendido" | "cancelado" | "expirado"
type Urgencia = "baixa" | "media" | "alta"

interface Pedido {
    id: string
    cliente_id: string | null
    chat_id: string | null
    contato_nome: string | null
    contato_telefone: string | null
    peca_descricao: string
    peca_categoria: string | null
    peca_marca: string | null
    peca_modelo: string | null
    peca_ano: string | null
    peca_lado: string | null
    peca_cor: string | null
    peca_oem: string | null
    veiculo_placa: string | null
    veiculo_chassi: string | null
    observacoes: string | null
    urgencia: Urgencia
    prazo_cliente: string | null
    data_lembrete: string
    atendente_responsavel_id: string | null
    criado_por_id: string | null
    status: Status
    created_at: string
    updated_at: string
    cliente_nome?: string | null
    cliente_telefone?: string | null
    atendente_responsavel_nome?: string | null
    criado_por_nome?: string | null
    produto_match_id?: string | null
    sucata_peca_match_id?: string | null
    data_match?: string | null
}

interface Atendente { id: string; nome: string }
interface Cliente { id: string; nome: string; telefone?: string }

const STATUS_LABEL: Record<Status, string> = {
    aberto: "Aberto",
    procurando: "Procurando",
    encontrado: "Encontrado",
    atendido: "Atendido",
    cancelado: "Cancelado",
    expirado: "Expirado",
}

const STATUS_COLOR: Record<Status, string> = {
    aberto: "bg-blue-100 text-blue-700 border-blue-200",
    procurando: "bg-amber-100 text-amber-700 border-amber-200",
    encontrado: "bg-emerald-100 text-emerald-700 border-emerald-200",
    atendido: "bg-slate-100 text-slate-600 border-slate-200",
    cancelado: "bg-rose-100 text-rose-700 border-rose-200",
    expirado: "bg-zinc-100 text-zinc-500 border-zinc-200",
}

const URGENCIA_COLOR: Record<Urgencia, string> = {
    baixa: "bg-slate-100 text-slate-600",
    media: "bg-amber-100 text-amber-700",
    alta: "bg-rose-100 text-rose-700",
}

const STATUS_FILTROS: { key: string; label: string }[] = [
    { key: "todos", label: "Todos" },
    { key: "aberto,procurando", label: "Em aberto" },
    { key: "encontrado", label: "Encontrados" },
    { key: "atendido", label: "Atendidos" },
    { key: "cancelado", label: "Cancelados" },
    { key: "expirado", label: "Expirados" },
]

function fmtDate(s?: string | null): string {
    if (!s) return "—"
    const d = new Date(s)
    if (isNaN(d.getTime())) return s
    return d.toLocaleDateString("pt-BR")
}

function diasParaLembrete(s?: string | null): number | null {
    if (!s) return null
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
    const d = new Date(s); d.setHours(0, 0, 0, 0)
    return Math.round((d.getTime() - hoje.getTime()) / 86400000)
}

const emptyForm = {
    cliente_id: "",
    chat_id: "",
    contato_nome: "",
    contato_telefone: "",
    peca_descricao: "",
    peca_categoria: "",
    peca_marca: "",
    peca_modelo: "",
    peca_ano: "",
    peca_lado: "",
    peca_cor: "",
    peca_oem: "",
    veiculo_placa: "",
    veiculo_chassi: "",
    observacoes: "",
    urgencia: "media" as Urgencia,
    prazo_cliente: "",
    data_lembrete: "",
    atendente_responsavel_id: "",
    status: "aberto" as Status,
}

export function PedidosClientes() {
    const [pedidos, setPedidos] = useState<Pedido[]>([])
    const [loading, setLoading] = useState(true)
    const [filtroStatus, setFiltroStatus] = useState<string>("aberto,procurando")
    const [busca, setBusca] = useState("")
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editing, setEditing] = useState<Pedido | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const [form, setForm] = useState({ ...emptyForm })
    const [atendentes, setAtendentes] = useState<Atendente[]>([])
    const [clientes, setClientes] = useState<Cliente[]>([])

    const fetchPedidos = async () => {
        setLoading(true)
        try {
            const params: Record<string, string> = {}
            if (filtroStatus !== "todos") {
                if (filtroStatus.includes(",")) params.status_in = filtroStatus
                else params.status = filtroStatus
            }
            if (busca.trim()) params.q = busca.trim()
            const data = await pedidosClientesApi.listar(params)
            setPedidos(Array.isArray(data) ? data : [])
        } catch (e) {
            console.error(e)
            toast.error("Erro ao carregar pedidos")
        } finally {
            setLoading(false)
        }
    }

    const fetchResources = async () => {
        try {
            const at = await api.get("/api/atendentes/?limit=500&offset=0")
            setAtendentes(Array.isArray(at) ? at : [])
            const cli = await api.get("/api/clientes/?limit=1000&offset=0")
            setClientes(Array.isArray(cli) ? cli.map((c: any) => ({ id: c.id, nome: c.nome, telefone: c.telefone })) : [])
        } catch (e) {
            console.error(e)
        }
    }

    useEffect(() => { fetchResources() }, [])
    useEffect(() => { fetchPedidos() }, [filtroStatus])

    const onAplicarBusca = () => { fetchPedidos() }

    const openCreate = () => {
        setEditing(null)
        const hoje = new Date()
        const lembrete = new Date(hoje); lembrete.setDate(hoje.getDate() + 7)
        setForm({ ...emptyForm, data_lembrete: lembrete.toISOString().slice(0, 10) })
        setIsModalOpen(true)
    }

    const openEdit = (p: Pedido) => {
        setEditing(p)
        setForm({
            cliente_id: p.cliente_id || "",
            chat_id: p.chat_id || "",
            contato_nome: p.contato_nome || "",
            contato_telefone: p.contato_telefone || "",
            peca_descricao: p.peca_descricao || "",
            peca_categoria: p.peca_categoria || "",
            peca_marca: p.peca_marca || "",
            peca_modelo: p.peca_modelo || "",
            peca_ano: p.peca_ano || "",
            peca_lado: p.peca_lado || "",
            peca_cor: p.peca_cor || "",
            peca_oem: p.peca_oem || "",
            veiculo_placa: p.veiculo_placa || "",
            veiculo_chassi: p.veiculo_chassi || "",
            observacoes: p.observacoes || "",
            urgencia: p.urgencia,
            prazo_cliente: p.prazo_cliente || "",
            data_lembrete: p.data_lembrete || "",
            atendente_responsavel_id: p.atendente_responsavel_id || "",
            status: p.status,
        })
        setIsModalOpen(true)
    }

    const submit = async () => {
        if (!form.peca_descricao.trim()) { toast.error("Descrição da peça é obrigatória"); return }
        setSubmitting(true)
        try {
            const payload: Record<string, unknown> = {
                ...form,
                cliente_id: form.cliente_id || null,
                atendente_responsavel_id: form.atendente_responsavel_id || null,
                prazo_cliente: form.prazo_cliente || null,
                data_lembrete: form.data_lembrete || null,
                chat_id: form.chat_id || null,
                contato_nome: form.contato_nome || null,
                contato_telefone: form.contato_telefone || null,
            }
            if (editing) {
                await pedidosClientesApi.atualizar(editing.id, payload)
                toast.success("Pedido atualizado")
            } else {
                await pedidosClientesApi.criar(payload)
                toast.success("Pedido criado")
            }
            setIsModalOpen(false)
            fetchPedidos()
        } catch (e: any) {
            toast.error(e?.message || "Erro ao salvar")
        } finally {
            setSubmitting(false)
        }
    }

    const alterarStatus = async (p: Pedido, status: Status) => {
        try {
            await pedidosClientesApi.alterarStatus(p.id, status)
            toast.success(`Pedido marcado como ${STATUS_LABEL[status].toLowerCase()}`)
            fetchPedidos()
        } catch (e: any) { toast.error(e?.message || "Erro ao alterar status") }
    }

    const deletar = async (p: Pedido) => {
        if (!confirm(`Excluir o pedido "${p.peca_descricao}"?`)) return
        try {
            await pedidosClientesApi.deletar(p.id)
            toast.success("Pedido excluído")
            fetchPedidos()
        } catch (e: any) { toast.error(e?.message || "Erro ao excluir") }
    }

    const contadores = useMemo(() => {
        const abertos = pedidos.filter(p => p.status === "aberto" || p.status === "procurando").length
        const vencendo = pedidos.filter(p => {
            if (p.status !== "aberto" && p.status !== "procurando") return false
            const d = diasParaLembrete(p.data_lembrete)
            return d !== null && d <= 0
        }).length
        return { abertos, vencendo }
    }, [pedidos])

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-black tracking-tight">Pedidos de Clientes</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Peças que clientes pediram e ainda não temos em estoque.
                    </p>
                </div>
                <Button onClick={openCreate} className="bg-amber-500 hover:bg-amber-600 text-white">
                    <Plus className="w-4 h-4 mr-2" /> Novo Pedido
                </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card><CardContent className="p-4">
                    <div className="text-xs uppercase text-slate-400 font-bold">Em aberto</div>
                    <div className="text-2xl font-black mt-1">{contadores.abertos}</div>
                </CardContent></Card>
                <Card><CardContent className="p-4">
                    <div className="text-xs uppercase text-slate-400 font-bold">Vencendo / vencidos</div>
                    <div className={cn("text-2xl font-black mt-1", contadores.vencendo > 0 && "text-rose-600")}>
                        {contadores.vencendo}
                    </div>
                </CardContent></Card>
                <Card><CardContent className="p-4">
                    <div className="text-xs uppercase text-slate-400 font-bold">Total exibido</div>
                    <div className="text-2xl font-black mt-1">{pedidos.length}</div>
                </CardContent></Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Lista de pedidos</CardTitle>
                    <CardDescription>Filtros aplicados ao servidor.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-2 flex-wrap mb-4">
                        {STATUS_FILTROS.map(f => (
                            <button
                                key={f.key}
                                onClick={() => setFiltroStatus(f.key)}
                                className={cn(
                                    "px-3 py-1.5 rounded-full text-xs font-bold border transition",
                                    filtroStatus === f.key
                                        ? "bg-amber-500 text-white border-amber-500"
                                        : "bg-white text-slate-600 border-slate-200 hover:border-amber-400"
                                )}
                            >{f.label}</button>
                        ))}
                        <div className="flex-1 min-w-[200px] flex gap-2">
                            <Input
                                placeholder="Buscar por peça, marca, modelo, OEM, contato..."
                                value={busca}
                                onChange={e => setBusca(e.target.value)}
                                onKeyDown={e => e.key === "Enter" && onAplicarBusca()}
                            />
                            <Button variant="outline" onClick={onAplicarBusca}>
                                <Search className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>

                    {loading ? (
                        <div className="py-10 text-center text-slate-400">Carregando...</div>
                    ) : pedidos.length === 0 ? (
                        <div className="py-10 text-center text-slate-400">
                            Nenhum pedido encontrado para o filtro atual.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {pedidos.map(p => {
                                const dias = diasParaLembrete(p.data_lembrete)
                                const ativo = p.status === "aberto" || p.status === "procurando"
                                const vencido = ativo && dias !== null && dias < 0
                                const venceHoje = ativo && dias === 0
                                return (
                                    <div key={p.id} className="border rounded-xl p-4 hover:border-amber-300 transition">
                                        <div className="flex items-start justify-between gap-3 flex-wrap">
                                            <div className="flex-1 min-w-[260px]">
                                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                                    <Badge className={cn("border", STATUS_COLOR[p.status])}>
                                                        {STATUS_LABEL[p.status]}
                                                    </Badge>
                                                    <Badge className={URGENCIA_COLOR[p.urgencia]}>
                                                        Urgência: {p.urgencia}
                                                    </Badge>
                                                    {vencido && (
                                                        <Badge className="bg-rose-100 text-rose-700">
                                                            <AlertCircle className="w-3 h-3 mr-1" /> Vencido há {Math.abs(dias!)}d
                                                        </Badge>
                                                    )}
                                                    {venceHoje && (
                                                        <Badge className="bg-amber-100 text-amber-700">
                                                            <AlertCircle className="w-3 h-3 mr-1" /> Vence hoje
                                                        </Badge>
                                                    )}
                                                </div>
                                                <div className="font-bold text-base">{p.peca_descricao}</div>
                                                <div className="text-xs text-slate-500 mt-1 space-x-3">
                                                    {p.peca_marca && <span>{p.peca_marca}</span>}
                                                    {p.peca_modelo && <span>{p.peca_modelo}</span>}
                                                    {p.peca_ano && <span>Ano {p.peca_ano}</span>}
                                                    {p.peca_lado && <span>{p.peca_lado}</span>}
                                                    {p.peca_oem && <span>OEM {p.peca_oem}</span>}
                                                </div>
                                                <div className="text-xs text-slate-600 mt-2 flex gap-4 flex-wrap">
                                                    <span className="flex items-center gap-1">
                                                        <User className="w-3 h-3" />
                                                        {p.cliente_nome || p.contato_nome || "Sem cliente"}
                                                    </span>
                                                    {(p.cliente_telefone || p.contato_telefone) && (
                                                        <span className="flex items-center gap-1">
                                                            <Phone className="w-3 h-3" />
                                                            {p.cliente_telefone || p.contato_telefone}
                                                        </span>
                                                    )}
                                                    <span className="flex items-center gap-1">
                                                        <CalendarIcon className="w-3 h-3" />
                                                        Lembrete: {fmtDate(p.data_lembrete)}
                                                    </span>
                                                    {p.atendente_responsavel_nome && (
                                                        <span>Resp: {p.atendente_responsavel_nome}</span>
                                                    )}
                                                </div>
                                                {p.observacoes && (
                                                    <div className="text-xs text-slate-500 mt-2 italic">
                                                        "{p.observacoes}"
                                                    </div>
                                                )}
                                                {(p.produto_match_id || p.sucata_peca_match_id) && (
                                                    <div className="text-xs mt-2 px-2 py-1 rounded bg-emerald-50 text-emerald-700 inline-block">
                                                        ✓ Match automático em {fmtDate(p.data_match)}
                                                        {p.produto_match_id && (
                                                            <a className="ml-2 underline"
                                                               href={`/produtos?focus=${p.produto_match_id}`}>
                                                                ver produto
                                                            </a>
                                                        )}
                                                        {p.sucata_peca_match_id && !p.produto_match_id && (
                                                            <span className="ml-2">peça de sucata</span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex gap-1 flex-wrap">
                                                {ativo && (
                                                    <>
                                                        <Button size="sm" variant="outline"
                                                            onClick={() => alterarStatus(p, "encontrado")}
                                                            title="Marcar como encontrado">
                                                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                                        </Button>
                                                        <Button size="sm" variant="outline"
                                                            onClick={() => alterarStatus(p, "atendido")}
                                                            title="Marcar como atendido">
                                                            <CheckCircle2 className="w-4 h-4 text-blue-600" />
                                                        </Button>
                                                        <Button size="sm" variant="outline"
                                                            onClick={() => alterarStatus(p, "cancelado")}
                                                            title="Cancelar pedido">
                                                            <XCircle className="w-4 h-4 text-rose-600" />
                                                        </Button>
                                                    </>
                                                )}
                                                <Button size="sm" variant="outline" onClick={() => openEdit(p)} title="Editar">
                                                    <Pencil className="w-4 h-4" />
                                                </Button>
                                                <Button size="sm" variant="outline" onClick={() => deletar(p)} title="Excluir">
                                                    <Trash2 className="w-4 h-4 text-rose-600" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}
                   title={editing ? "Editar Pedido" : "Novo Pedido de Cliente"}>
                <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-1">
                    <div>
                        <Label>Descrição da peça *</Label>
                        <Input value={form.peca_descricao}
                               onChange={e => setForm({ ...form, peca_descricao: e.target.value })}
                               placeholder="Ex: Farol dianteiro esquerdo Fiesta 2014" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label>Marca</Label>
                            <Input value={form.peca_marca} onChange={e => setForm({ ...form, peca_marca: e.target.value })} />
                        </div>
                        <div>
                            <Label>Modelo</Label>
                            <Input value={form.peca_modelo} onChange={e => setForm({ ...form, peca_modelo: e.target.value })} />
                        </div>
                        <div>
                            <Label>Ano</Label>
                            <Input value={form.peca_ano} onChange={e => setForm({ ...form, peca_ano: e.target.value })} />
                        </div>
                        <div>
                            <Label>Lado</Label>
                            <Input value={form.peca_lado} onChange={e => setForm({ ...form, peca_lado: e.target.value })} placeholder="Esquerdo / Direito" />
                        </div>
                        <div>
                            <Label>Cor</Label>
                            <Input value={form.peca_cor} onChange={e => setForm({ ...form, peca_cor: e.target.value })} />
                        </div>
                        <div>
                            <Label>Código OEM</Label>
                            <Input value={form.peca_oem} onChange={e => setForm({ ...form, peca_oem: e.target.value })} />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label>Placa do veículo</Label>
                            <Input value={form.veiculo_placa} onChange={e => setForm({ ...form, veiculo_placa: e.target.value })} />
                        </div>
                        <div>
                            <Label>Chassi</Label>
                            <Input value={form.veiculo_chassi} onChange={e => setForm({ ...form, veiculo_chassi: e.target.value })} />
                        </div>
                    </div>

                    <div className="border-t pt-3">
                        <Label>Cliente cadastrado</Label>
                        <Select value={form.cliente_id}
                                onChange={e => {
                                    const id = e.target.value
                                    const c = clientes.find(x => x.id === id)
                                    setForm({
                                        ...form,
                                        cliente_id: id,
                                        contato_nome: c?.nome || form.contato_nome,
                                        contato_telefone: c?.telefone || form.contato_telefone,
                                    })
                                }}>
                            <option value="">— Sem cliente cadastrado —</option>
                            {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                        </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label>Nome do contato</Label>
                            <Input value={form.contato_nome} onChange={e => setForm({ ...form, contato_nome: e.target.value })} />
                        </div>
                        <div>
                            <Label>Telefone</Label>
                            <Input value={form.contato_telefone} onChange={e => setForm({ ...form, contato_telefone: e.target.value })} />
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <Label>Urgência</Label>
                            <Select value={form.urgencia}
                                    onChange={e => setForm({ ...form, urgencia: e.target.value as Urgencia })}>
                                <option value="baixa">Baixa</option>
                                <option value="media">Média</option>
                                <option value="alta">Alta</option>
                            </Select>
                        </div>
                        <div>
                            <Label>Prazo do cliente</Label>
                            <Input type="date" value={form.prazo_cliente}
                                   onChange={e => setForm({ ...form, prazo_cliente: e.target.value })} />
                        </div>
                        <div>
                            <Label>Data do lembrete</Label>
                            <Input type="date" value={form.data_lembrete}
                                   onChange={e => setForm({ ...form, data_lembrete: e.target.value })} />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label>Atendente responsável</Label>
                            <Select value={form.atendente_responsavel_id}
                                    onChange={e => setForm({ ...form, atendente_responsavel_id: e.target.value })}>
                                <option value="">— Sem responsável —</option>
                                {atendentes.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
                            </Select>
                        </div>
                        {editing && (
                            <div>
                                <Label>Status</Label>
                                <Select value={form.status}
                                        onChange={e => setForm({ ...form, status: e.target.value as Status })}>
                                    {(Object.keys(STATUS_LABEL) as Status[]).map(s =>
                                        <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                                </Select>
                            </div>
                        )}
                    </div>

                    <div>
                        <Label>Observações</Label>
                        <textarea
                            className="w-full border rounded-lg p-2 text-sm min-h-[80px]"
                            value={form.observacoes}
                            onChange={e => setForm({ ...form, observacoes: e.target.value })}
                            placeholder="Detalhes do pedido, faixa de preço aceita, prazo, etc."
                        />
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t">
                        <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                        <Button onClick={submit} disabled={submitting}
                                className="bg-amber-500 hover:bg-amber-600 text-white">
                            {submitting ? "Salvando..." : (editing ? "Salvar alterações" : "Criar pedido")}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    )
}
