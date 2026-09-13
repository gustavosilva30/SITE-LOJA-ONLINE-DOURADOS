import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Modal } from "@/components/ui/modal"
import {
    MessageSquare,
    Send,
    User,
    Clock,
    CheckCircle2,
    Search,
    Filter,
    ArrowRightLeft,
    Inbox,
    SendHorizonal,
    AlertCircle,
    Trash2
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { atendentesApi, recadosApi } from "@/lib/api"
import { useAuthStore } from "@/store/authStore"
import { cn } from "@/lib/utils"

interface Recado {
    id: string
    mensagem: string
    remetente_id: string
    destinatario_id: string
    lido: boolean
    urgente: boolean
    created_at: string
    remetente?: { nome: string }
    destinatario?: { nome: string }
}

interface Atendente {
    id: string
    nome: string
    cargo: string
}

export function RecadosInternos() {
    const { atendente, initialized } = useAuthStore()
    const [recadosRecebidos, setRecadosRecebidos] = useState<Recado[]>([])
    const [recadosEnviados, setRecadosEnviados] = useState<Recado[]>([])
    const [loading, setLoading] = useState(true)
    const [view, setView] = useState<'received' | 'sent'>('received')
    const [searchTerm, setSearchTerm] = useState("")

    // Form State
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [atendentes, setAtendentes] = useState<Atendente[]>([])
    const [newMessage, setNewMessage] = useState({
        destinatario_id: '',
        mensagem: '',
        urgente: false
    })
    const [submitting, setSubmitting] = useState(false)

    const fetchRecados = async () => {
        if (!atendente?.id) return
        setLoading(true)
        try {
            const [rec, env] = await Promise.all([
                recadosApi.recebidos(),
                recadosApi.enviados(),
            ])
            setRecadosRecebidos(Array.isArray(rec) ? rec : [])
            setRecadosEnviados(Array.isArray(env) ? env : [])
        } catch (err) {
            console.error('Error fetching recados:', err)
        } finally {
            setLoading(false)
        }
    }

    const fetchResources = async () => {
        try {
            const a = await atendentesApi.listar()
            if (Array.isArray(a)) {
                const sorted = [...a].sort((x, y) => String(x.nome || '').localeCompare(String(y.nome || ''), 'pt-BR'))
                setAtendentes(sorted.filter(item => item.id !== atendente?.id))
            }
        } catch (e) {
            console.error('Erro ao carregar atendentes:', e)
        }
    }

    useEffect(() => {
        if (initialized && atendente) {
            fetchRecados()
            fetchResources()
        }
    }, [initialized, atendente])

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!atendente?.id) return
        if (!newMessage.destinatario_id || !newMessage.mensagem.trim()) return

        setSubmitting(true)
        try {
            await recadosApi.enviar({
                destinatario_id: newMessage.destinatario_id,
                mensagem: newMessage.mensagem.trim(),
                urgente: newMessage.urgente,
            })
            setIsModalOpen(false)
            setNewMessage({ destinatario_id: '', mensagem: '', urgente: false })
            fetchRecados()
        } catch (err) {
            console.error(err)
            alert("Erro ao enviar recado")
        } finally {
            setSubmitting(false)
        }
    }

    const markAsRead = async (id: string) => {
        try {
            await recadosApi.marcarLido(id)
            fetchRecados()
        } catch (e) {
            console.error(e)
        }
    }

    const deleteRecado = async (id: string) => {
        if (!confirm("Excluir este recado?")) return
        try {
            await recadosApi.deletar(id)
            fetchRecados()
        } catch (e) {
            console.error(e)
            alert('Não foi possível excluir o recado.')
        }
    }

    const filteredList = (view === 'received' ? recadosRecebidos : recadosEnviados).filter(r =>
        r.mensagem.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.remetente?.nome || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.destinatario?.nome || "").toLowerCase().includes(searchTerm.toLowerCase())
    )

    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black tracking-tight uppercase flex items-center gap-3">
                        <MessageSquare className="w-8 h-8 text-primary" /> Recados Internos
                    </h1>
                    <p className="text-muted-foreground mt-1 font-medium italic">Comunicação ágil e profissional entre a equipe.</p>
                </div>
                <Button className="gap-2 shadow-lg shadow-primary/20 h-11 px-6 rounded-xl" onClick={() => setIsModalOpen(true)}>
                    <Send className="w-5 h-5" /> Enviar Recado
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Lateral: Filtros e Navegação */}
                <div className="lg:col-span-3 space-y-4">
                    <Card className="border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden">
                        <div className="p-2 flex flex-col gap-1">
                            <button
                                onClick={() => setView('received')}
                                className={cn(
                                    "flex items-center justify-between p-3 rounded-xl transition-all text-sm font-bold uppercase tracking-tight",
                                    view === 'received' ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30" : "hover:bg-muted"
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    <Inbox className="w-4 h-4" /> Recebidos
                                </div>
                                {recadosRecebidos.filter(r => !r.lido).length > 0 && (
                                    <span className={cn(
                                        "px-2 py-0.5 rounded-full text-[10px] font-black",
                                        view === 'received' ? "bg-white text-primary" : "bg-primary text-white"
                                    )}>
                                        {recadosRecebidos.filter(r => !r.lido).length}
                                    </span>
                                )}
                            </button>
                            <button
                                onClick={() => setView('sent')}
                                className={cn(
                                    "flex items-center gap-3 p-3 rounded-xl transition-all text-sm font-bold uppercase tracking-tight",
                                    view === 'sent' ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30" : "hover:bg-muted"
                                )}
                            >
                                <SendHorizonal className="w-4 h-4" /> Enviados
                            </button>
                        </div>
                    </Card>

                    <div className="relative group">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                        <Input
                            placeholder="Buscar recado..."
                            className="pl-10 h-10 rounded-xl bg-card/50"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                {/* Principal: Lista de Recados */}
                <div className="lg:col-span-9">
                    {loading ? (
                        <div className="bg-card/30 border border-dashed rounded-3xl h-64 flex items-center justify-center animate-pulse">
                            <span className="text-muted-foreground font-black uppercase tracking-widest italic opacity-50">Carregando mensagens...</span>
                        </div>
                    ) : filteredList.length === 0 ? (
                        <div className="bg-card/30 border border-dashed rounded-3xl p-20 flex flex-col items-center justify-center text-center">
                            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                                <Inbox className="w-8 h-8 text-muted-foreground opacity-20" />
                            </div>
                            <h3 className="text-lg font-bold text-foreground">Nenhuma mensagem aqui</h3>
                            <p className="text-sm text-muted-foreground max-w-xs mt-1">Sua caixa de {view === 'received' ? 'entrada' : 'saída'} está vazia no momento.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filteredList.map((recado) => (
                                <motion.div
                                    layout
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    key={recado.id}
                                    className={cn(
                                        "group relative bg-card border shadow-sm rounded-2xl p-5 transition-all duration-300 hover:shadow-xl",
                                        !recado.lido && view === 'received' ? "border-primary/50 ring-1 ring-primary/10 bg-primary/5" : "hover:border-primary/30",
                                        recado.urgente && "border-rose-500/30"
                                    )}
                                >
                                    {recado.urgente && (
                                        <div className="absolute top-4 right-4 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-rose-500 text-white text-[9px] font-black uppercase tracking-widest animate-pulse">
                                            <AlertCircle className="w-3 h-3" /> Urgente
                                        </div>
                                    )}

                                    <div className="flex items-start gap-4">
                                        <div className={cn(
                                            "shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110",
                                            !recado.lido && view === 'received' ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                                        )}>
                                            <User className="w-6 h-6" />
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h4 className="font-black text-sm uppercase tracking-tight text-foreground">
                                                    {view === 'received' ? recado.remetente?.nome : `Para: ${recado.destinatario?.nome}`}
                                                </h4>
                                                <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-1 bg-muted/50 px-2 py-0.5 rounded-full">
                                                    <Clock className="w-3 h-3" /> {new Date(recado.created_at).toLocaleString('pt-BR')}
                                                </span>
                                            </div>

                                            <p className={cn(
                                                "text-sm leading-relaxed",
                                                !recado.lido && view === 'received' ? "text-foreground font-semibold" : "text-muted-foreground font-medium"
                                            )}>
                                                {recado.mensagem}
                                            </p>

                                            <div className="flex items-center gap-2 mt-4">
                                                {!recado.lido && view === 'received' && (
                                                    <Button variant="default" size="sm" className="h-7 text-[10px] font-black uppercase rounded-lg" onClick={() => markAsRead(recado.id)}>
                                                        <CheckCircle2 className="w-3 h-3 mr-1.5" /> Marcar como lido
                                                    </Button>
                                                )}
                                                <Button variant="ghost" size="sm" className="h-7 text-[10px] font-black uppercase rounded-lg text-muted-foreground hover:text-destructive" onClick={() => deleteRecado(recado.id)}>
                                                    <Trash2 className="w-3 h-3 mr-1.5" /> Excluir
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* SEND MODAL */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Novo Recado Profissional" className="max-w-xl">
                <form onSubmit={handleSend} className="space-y-6 pt-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] uppercase font-black tracking-widest text-muted-foreground ml-1">Destinatário</Label>
                            <select
                                required
                                value={newMessage.destinatario_id}
                                onChange={e => setNewMessage({ ...newMessage, destinatario_id: e.target.value })}
                                className="h-11 w-full rounded-xl border border-input bg-background px-3 py-1 text-sm shadow-sm transition-all focus:ring-2 focus:ring-primary outline-none"
                            >
                                <option value="">Escolha quem receberá...</option>
                                {atendentes.map(a => <option key={a.id} value={a.id}>{a.nome} - {a.cargo || 'Atendente'}</option>)}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] uppercase font-black tracking-widest text-muted-foreground ml-1">Prioridade</Label>
                            <div className="flex items-center gap-4 h-11 px-4 bg-muted/30 rounded-xl">
                                <label className="flex items-center gap-2 cursor-pointer group">
                                    <input
                                        type="checkbox"
                                        className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                                        checked={newMessage.urgente}
                                        onChange={e => setNewMessage({ ...newMessage, urgente: e.target.checked })}
                                    />
                                    <span className="text-sm font-bold uppercase tracking-tighter group-hover:text-primary transition-colors">Urgente</span>
                                </label>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-[10px] uppercase font-black tracking-widest text-muted-foreground ml-1">Sua Mensagem</Label>
                        <textarea
                            required
                            className="w-full min-h-[120px] bg-background border border-input rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary outline-none transition-all hover:bg-muted/10 resize-none font-medium leading-relaxed"
                            placeholder="Escreva de forma clara e profissional seu recado..."
                            value={newMessage.mensagem}
                            onChange={e => setNewMessage({ ...newMessage, mensagem: e.target.value })}
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-6 border-t border-border">
                        <Button variant="ghost" type="button" onClick={() => setIsModalOpen(false)} className="rounded-xl px-6 font-bold uppercase">Cancelar</Button>
                        <Button type="submit" disabled={submitting} className="rounded-xl px-8 shadow-lg shadow-primary/20 font-bold uppercase transition-all active:scale-95">
                            {submitting ? "Enviando..." : <><Send className="w-4 h-4 mr-2" /> Enviar Agora</>}
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    )
}
