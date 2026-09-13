import { useEffect, useState, useCallback } from "react"
import { api } from "@/lib/api"
import { useAuthStore } from "@/store/authStore"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Modal } from "@/components/ui/modal"
import { Badge } from "@/components/ui/badge"
import { Plus, Calendar, ChevronLeft, ChevronRight, Clock, User, Pencil, Trash2 } from "lucide-react"
import { fmtDateTimeShort } from "@/lib/format"

const TIPO_COLORS: Record<string, string> = {
    Visita: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    Reuniao: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
    Entrega: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    Suporte: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    Outros: 'bg-muted text-muted-foreground border-border',
}

const STATUS_COLORS: Record<string, string> = {
    Agendado: 'outline',
    Confirmado: 'default',
    Realizado: 'success',
    Cancelado: 'destructive',
}

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

function getDaysInMonth(year: number, month: number) {
    return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number) {
    return new Date(year, month, 1).getDay()
}

export function Agenda() {
    const { atendente } = useAuthStore()
    const [agendamentos, setAgendamentos] = useState<any[]>([])
    const [clientes, setClientes] = useState<any[]>([])
    const [atendentes, setAtendentes] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingItem, setEditingItem] = useState<any>(null)
    const [submitting, setSubmitting] = useState(false)
    const [currentDate, setCurrentDate] = useState(new Date())
    const [selectedDay, setSelectedDay] = useState<number | null>(null)
    const [viewMode, setViewMode] = useState<'mes' | 'lista'>('mes')

    const [form, setForm] = useState({
        titulo: '',
        descricao: '',
        cliente_id: '',
        atendente_id: atendente?.id || '',
        data_inicio: new Date().toISOString().slice(0, 16),
        data_fim: '',
        tipo: 'Visita',
        status: 'Agendado',
        notificar_whatsapp: false
    })

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const y = currentDate.getFullYear()
            const m = currentDate.getMonth()
            const inicioGte = new Date(y, m, 1)
            const inicioLte = new Date(y, m + 1, 0, 23, 59, 59)
            const qs = new URLSearchParams({
                inicio_gte: inicioGte.toISOString(),
                inicio_lte: inicioLte.toISOString(),
            })
            const accCli: any[] = []
            let offC = 0
            const limC = 1000
            for (;;) {
                const chunk = await api.get(`/api/clientes/?limit=${limC}&offset=${offC}`)
                const rows = Array.isArray(chunk) ? chunk : []
                accCli.push(...rows)
                if (rows.length < limC) break
                offC += limC
            }
            const [agData, ateData] = await Promise.all([
                api.get(`/api/agendamentos?${qs.toString()}`),
                api.get('/api/atendentes/?limit=500&offset=0'),
            ])
            setAgendamentos(Array.isArray(agData) ? agData : [])
            setClientes(accCli)
            setAtendentes(Array.isArray(ateData) ? ateData : [])
        } catch (e) {
            console.error(e)
            setAgendamentos([])
        } finally {
            setLoading(false)
        }
    }, [currentDate])

    useEffect(() => { fetchData() }, [fetchData])

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        setSubmitting(true)
        try {
            const payload: Record<string, unknown> = {
                titulo: form.titulo,
                descricao: form.descricao || null,
                cliente_id: form.cliente_id || null,
                atendente_id: form.atendente_id || atendente?.id || null,
                data_inicio: new Date(form.data_inicio).toISOString(),
                tipo: form.tipo,
                status: form.status,
                notificar_whatsapp: form.notificar_whatsapp,
            }
            if (form.data_fim?.trim()) {
                payload.data_fim = new Date(form.data_fim).toISOString()
            } else {
                payload.data_fim = null
            }
            if (editingItem) {
                await api.put(`/api/agendamentos/${editingItem.id}`, payload)
            } else {
                await api.post('/api/agendamentos', payload)
            }
            setIsModalOpen(false)
            setEditingItem(null)
            resetForm()
            fetchData()
        } catch (err) {
            console.error(err)
        } finally {
            setSubmitting(false)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Excluir este agendamento?')) return
        try {
            await api.delete(`/api/agendamentos/${id}`)
            fetchData()
        } catch (e) {
            console.error(e)
        }
    }

    const handleEdit = (item: any) => {
        setEditingItem(item)
        setForm({
            titulo: item.titulo,
            descricao: item.descricao || '',
            cliente_id: item.cliente_id || '',
            atendente_id: item.atendente_id || '',
            data_inicio: item.data_inicio?.slice(0, 16) || '',
            data_fim: item.data_fim?.slice(0, 16) || '',
            tipo: item.tipo,
            status: item.status,
            notificar_whatsapp: item.notificar_whatsapp || false
        })
        setIsModalOpen(true)
    }

    const resetForm = () => setForm({
        titulo: '', descricao: '', cliente_id: '', atendente_id: atendente?.id || '',
        data_inicio: new Date().toISOString().slice(0, 16), data_fim: '',
        tipo: 'Visita', status: 'Agendado', notificar_whatsapp: false
    })

    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const daysInMonth = getDaysInMonth(year, month)
    const firstDay = getFirstDayOfMonth(year, month)

    const getAgendamentosForDay = (day: number) => {
        return agendamentos.filter(a => {
            const d = new Date(a.data_inicio)
            return d.getDate() === day && d.getMonth() === month && d.getFullYear() === year
        })
    }

    const selectedDayAgendamentos = selectedDay ? getAgendamentosForDay(selectedDay) : agendamentos

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Agenda</h1>
                    <p className="text-muted-foreground mt-1">
                        {atendente?.perm_admin ? 'Gerencie todos os compromissos da equipe.' : 'Gerencie seus compromissos e visitas.'}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center border rounded-lg p-1 bg-muted/50">
                        <Button variant={viewMode === 'mes' ? 'secondary' : 'ghost'} size="sm" className="h-7" onClick={() => setViewMode('mes')}>Mês</Button>
                        <Button variant={viewMode === 'lista' ? 'secondary' : 'ghost'} size="sm" className="h-7" onClick={() => setViewMode('lista')}>Lista</Button>
                    </div>
                    <Button className="gap-2" onClick={() => { resetForm(); setEditingItem(null); setIsModalOpen(true) }}>
                        <Plus className="w-4 h-4" /> Agendar
                    </Button>
                </div>
            </div>

            {/* Calendar Navigation */}
            <div className="flex items-center justify-between">
                <Button variant="outline" size="icon" onClick={() => { const d = new Date(currentDate); d.setMonth(d.getMonth() - 1); setCurrentDate(d) }}>
                    <ChevronLeft className="w-4 h-4" />
                </Button>
                <h2 className="text-xl font-bold">{MESES[month]} {year}</h2>
                <Button variant="outline" size="icon" onClick={() => { const d = new Date(currentDate); d.setMonth(d.getMonth() + 1); setCurrentDate(d) }}>
                    <ChevronRight className="w-4 h-4" />
                </Button>
            </div>

            {viewMode === 'mes' ? (
                <div className="space-y-4">
                    <Card>
                        <CardContent className="p-3">
                            <div className="grid grid-cols-7 mb-2">
                                {DIAS_SEMANA.map(d => (
                                    <div key={d} className="text-center text-xs font-bold text-muted-foreground py-2">{d}</div>
                                ))}
                            </div>
                            <div className="grid grid-cols-7 gap-1">
                                {Array(firstDay).fill(null).map((_, i) => <div key={`empty-${i}`} />)}
                                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                                    const dayAgendamentos = getAgendamentosForDay(day)
                                    const isToday = new Date().getDate() === day && new Date().getMonth() === month && new Date().getFullYear() === year
                                    const isSelected = selectedDay === day
                                    return (
                                        <button
                                            key={day}
                                            onClick={() => setSelectedDay(isSelected ? null : day)}
                                            className={`min-h-[70px] rounded-lg p-1.5 text-left transition-all border
                                                ${isSelected ? 'border-primary bg-primary/10' : 'border-transparent hover:border-border hover:bg-muted/30'}
                                                ${isToday ? 'border-primary/40' : ''}`}
                                        >
                                            <span className={`text-xs font-bold block mb-1 w-6 h-6 flex items-center justify-center rounded-full
                                                ${isToday ? 'bg-primary text-primary-foreground' : ''}`}>
                                                {day}
                                            </span>
                                            <div className="space-y-0.5">
                                                {dayAgendamentos.slice(0, 2).map(a => (
                                                    <div key={a.id} className={`text-[9px] px-1 py-0.5 rounded truncate border font-medium ${TIPO_COLORS[a.tipo] || TIPO_COLORS.Outros}`}>
                                                        {a.titulo}
                                                    </div>
                                                ))}
                                                {dayAgendamentos.length > 2 && (
                                                    <div className="text-[9px] text-muted-foreground pl-1">+{dayAgendamentos.length - 2}</div>
                                                )}
                                            </div>
                                        </button>
                                    )
                                })}
                            </div>
                        </CardContent>
                    </Card>

                    {selectedDay && (
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base">
                                    Agendamentos — {selectedDay} de {MESES[month]}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                {selectedDayAgendamentos.length === 0 ? (
                                    <p className="text-sm text-muted-foreground text-center py-4">Nenhum agendamento neste dia.</p>
                                ) : (
                                    <div className="space-y-3">
                                        {selectedDayAgendamentos.map(a => (
                                            <AgendaCard key={a.id} item={a} onEdit={handleEdit} onDelete={handleDelete} />
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}
                </div>
            ) : (
                <Card>
                    <CardContent className="p-4">
                        {loading ? (
                            <div className="space-y-2">{Array(5).fill(0).map((_, i) => <div key={i} className="h-16 bg-muted/30 rounded animate-pulse" />)}</div>
                        ) : agendamentos.length === 0 ? (
                            <p className="text-center text-muted-foreground py-8">Nenhum agendamento neste mês.</p>
                        ) : (
                            <div className="space-y-3">
                                {agendamentos.map(a => (
                                    <AgendaCard key={a.id} item={a} onEdit={handleEdit} onDelete={handleDelete} />
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingItem(null); resetForm() }}
                title={editingItem ? "Editar Agendamento" : "Novo Agendamento"}>
                <form onSubmit={handleSave} className="space-y-4">
                    <div className="space-y-2">
                        <Label>Título *</Label>
                        <Input required placeholder="Visita ao cliente, Reunião..." value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Tipo</Label>
                            <Select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
                                <option value="Visita">Visita</option>
                                <option value="Reuniao">Reunião</option>
                                <option value="Entrega">Entrega</option>
                                <option value="Suporte">Suporte</option>
                                <option value="Outros">Outros</option>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Status</Label>
                            <Select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                                <option value="Agendado">Agendado</option>
                                <option value="Confirmado">Confirmado</option>
                                <option value="Realizado">Realizado</option>
                                <option value="Cancelado">Cancelado</option>
                            </Select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Data/Hora Início *</Label>
                            <Input required type="datetime-local" value={form.data_inicio} onChange={e => setForm({ ...form, data_inicio: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                            <Label>Data/Hora Fim (opcional)</Label>
                            <Input type="datetime-local" value={form.data_fim} onChange={e => setForm({ ...form, data_fim: e.target.value })} />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Cliente (opcional)</Label>
                        <Select value={form.cliente_id} onChange={e => setForm({ ...form, cliente_id: e.target.value })}>
                            <option value="">Sem cliente vinculado</option>
                            {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Atendente Responsável</Label>
                        <Select 
                            value={form.atendente_id} 
                            onChange={e => setForm({ ...form, atendente_id: e.target.value })}
                            disabled={!atendente?.perm_admin}
                        >
                            {atendentes.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Observações</Label>
                        <textarea
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none h-20"
                            placeholder="Detalhes do agendamento..."
                            value={form.descricao}
                            onChange={e => setForm({ ...form, descricao: e.target.value })}
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <input type="checkbox" id="notif" checked={form.notificar_whatsapp} onChange={e => setForm({ ...form, notificar_whatsapp: e.target.checked })} className="rounded" />
                        <label htmlFor="notif" className="text-sm cursor-pointer">Notificar cliente via WhatsApp</label>
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <Button variant="outline" type="button" onClick={() => { setIsModalOpen(false); setEditingItem(null); resetForm() }}>Cancelar</Button>
                        <Button type="submit" disabled={submitting}>{submitting ? 'Salvando...' : editingItem ? 'Salvar' : 'Agendar'}</Button>
                    </div>
                </form>
            </Modal>
        </div>
    )
}

function AgendaCard({ item, onEdit, onDelete }: { item: any; onEdit: (item: any) => void; onDelete: (id: string) => void }) {
    return (
        <div className="flex items-start gap-3 p-3 border border-border rounded-lg bg-card hover:bg-muted/20 transition-colors">
            <div className={`shrink-0 px-2 py-1 rounded text-xs font-bold border ${TIPO_COLORS[item.tipo] || TIPO_COLORS.Outros}`}>
                {item.tipo}
            </div>
            <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{item.titulo}</p>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{fmtDateTimeShort(item.data_inicio)}</span>
                    {item.clientes?.nome && <span className="flex items-center gap-1"><User className="w-3 h-3" />{item.clientes.nome}</span>}
                    {item.atendentes?.nome && <span>{item.atendentes.nome}</span>}
                </div>
                {item.descricao && <p className="text-xs text-muted-foreground mt-1 truncate">{item.descricao}</p>}
            </div>
            <div className="flex items-center gap-1 shrink-0">
                <Badge variant={(STATUS_COLORS[item.status] as any) || 'outline'} className="text-[10px]">{item.status}</Badge>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-500" onClick={() => onEdit(item)}><Pencil className="w-3 h-3" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(item.id)}><Trash2 className="w-3 h-3" /></Button>
            </div>
        </div>
    )
}
