import { useEffect, useState, useCallback, useMemo } from "react"
import { indicacoesApi, clientesApi, configuracoesApi } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Modal } from "@/components/ui/modal"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
    Users2, Trophy, Settings2, Search, RefreshCw, CheckCircle2,
    XCircle, Clock, Gift, TrendingUp, Star, DollarSign
} from "lucide-react"
import { fmt, fmtDate } from "@/lib/format"
import { useAuthStore } from "@/store/authStore"
import { getCachedPage, invalidateCachedPage } from "@/store/pagePrefetchCache"

const STATUS_VARIANT: Record<string, any> = {
    Pendente: 'outline',
    Confirmada: 'default',
    Cancelada: 'destructive',
}
const STATUS_ICON: Record<string, any> = {
    Pendente: <Clock className="w-3 h-3" />,
    Confirmada: <CheckCircle2 className="w-3 h-3" />,
    Cancelada: <XCircle className="w-3 h-3" />,
}

export function Indicacoes() {
    const { atendente } = useAuthStore()
    const [activeTab, setActiveTab] = useState<'historico' | 'ranking' | 'configuracoes'>('historico')
    const [indicacoes, setIndicacoes] = useState<any[]>([])
    const [config, setConfig] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [filterStatus, setFilterStatus] = useState('todos')
    const [savingConfig, setSavingConfig] = useState(false)
    const [configForm, setConfigForm] = useState({
        indicacao_ativa: true,
        indicacao_tipo_beneficio: 'credito',
        indicacao_valor_fixo: 20,
        indicacao_percentual: 0,
        indicacao_valor_minimo_venda: 0,
    })

    const fetchData = useCallback(async () => {
        const warm = getCachedPage('indicacoes')
        if (!warm) setLoading(true)
        try {
            const [inds, cfg] = await Promise.all([
                indicacoesApi.listar({ limit: 500 }),
                configuracoesApi.obter().catch(() => null),
            ])
            setIndicacoes(inds || [])
            if (cfg) {
                setConfig(cfg)
                setConfigForm({
                    indicacao_ativa: cfg.indicacao_ativa ?? true,
                    indicacao_tipo_beneficio: cfg.indicacao_tipo_beneficio || 'credito',
                    indicacao_valor_fixo: cfg.indicacao_valor_fixo || 20,
                    indicacao_percentual: cfg.indicacao_percentual || 0,
                    indicacao_valor_minimo_venda: cfg.indicacao_valor_minimo_venda || 0,
                })
            }
        } catch (err) {
            console.error('fetchData indicacoes', err)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        const cached = getCachedPage('indicacoes')
        if (cached) {
            setIndicacoes(Array.isArray(cached) ? cached : [])
            setLoading(false)
        }
        void fetchData()
    }, [fetchData])

    // Liberar recompensa para o indicador
    const handleLiberarRecompensa = async (ind: any) => {
        if (ind.recompensa_liberada) return
        const valor = ind.recompensa_valor || 0
        if (!confirm(`Liberar ${fmt(valor)} de crédito para ${ind.indicador?.nome}?`)) return

        try {
            // Adiciona haver ao indicador (haverMovimento atualiza saldo + histórico)
            await clientesApi.haverMovimento(ind.indicador_id, {
                valor,
                tipo: 'Entrada',
                observacao: `Recompensa por indicação — indicado: ${ind.indicado?.nome?.trim() || 'N/D'}`,
            })

            // Marca como liberada e confirmada
            await indicacoesApi.atualizar(ind.id, {
                recompensa_liberada: true,
                status: 'Confirmada',
            })

            invalidateCachedPage('indicacoes')
            fetchData()
        } catch (err) {
            console.error(err)
        }
    }

    const handleCancelarIndicacao = async (id: string) => {
        if (!confirm('Cancelar esta indicação?')) return
        try {
            await indicacoesApi.atualizar(id, { status: 'Cancelada' })
            invalidateCachedPage('indicacoes')
            fetchData()
        } catch (err) {
            console.error(err)
        }
    }

    const handleSaveConfig = async (e: React.FormEvent) => {
        e.preventDefault()
        setSavingConfig(true)
        try {
            await configuracoesApi.atualizar(configForm)
            invalidateCachedPage('indicacoes')
            fetchData()
        } catch (err: any) {
            alert('Erro ao salvar: ' + (err.message || ''))
        } finally {
            setSavingConfig(false)
        }
    }

    // Filtros
    const filtered = useMemo(() => indicacoes.filter(i => {
        const matchSearch = !search ||
            i.indicador?.nome?.toLowerCase().includes(search.toLowerCase()) ||
            i.indicado?.nome?.toLowerCase().includes(search.toLowerCase())
        const matchStatus = filterStatus === 'todos' || i.status === filterStatus
        return matchSearch && matchStatus
    }), [indicacoes, search, filterStatus])

    // Ranking
    const ranking = useMemo(() => {
        const map: Record<string, { nome: string; telefone: string; count: number; total_gerado: number; creditos: number }> = {}
        indicacoes.filter(i => i.status !== 'Cancelada').forEach(i => {
            const id = i.indicador_id
            if (!map[id]) map[id] = { nome: i.indicador?.nome || '?', telefone: i.indicador?.telefone || '', count: 0, total_gerado: 0, creditos: 0 }
            map[id].count++
            map[id].total_gerado += i.valor_venda || 0
            if (i.recompensa_liberada) map[id].creditos += i.recompensa_valor || 0
        })
        return Object.values(map).sort((a, b) => b.count - a.count)
    }, [indicacoes])

    // KPIs
    const totalIndicacoes = indicacoes.length
    const confirmadas = indicacoes.filter(i => i.status === 'Confirmada').length
    const pendentes = indicacoes.filter(i => i.status === 'Pendente').length
    const totalCreditosLiberados = indicacoes.filter(i => i.recompensa_liberada).reduce((a, i) => a + (i.recompensa_valor || 0), 0)

    const tabs = [
        { key: 'historico', label: 'Histórico', icon: <Users2 className="w-4 h-4" /> },
        { key: 'ranking', label: 'Ranking', icon: <Trophy className="w-4 h-4" /> },
        { key: 'configuracoes', label: 'Configurações', icon: <Settings2 className="w-4 h-4" /> },
    ] as const

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        <Users2 className="w-8 h-8 text-primary" /> Indicações
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Gerencie o programa de indicações e recompensas para seus clientes.
                    </p>
                </div>
                <Button variant="outline" size="icon" onClick={fetchData}>
                    <RefreshCw className="w-4 h-4" />
                </Button>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">Total</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold">{totalIndicacoes}</div></CardContent>
                </Card>
                <Card className="border-emerald-500/20 bg-emerald-500/5">
                    <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">Confirmadas</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold text-emerald-500">{confirmadas}</div></CardContent>
                </Card>
                <Card className="border-amber-500/20 bg-amber-500/5">
                    <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">Pendentes</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold text-amber-500">{pendentes}</div></CardContent>
                </Card>
                <Card className="border-violet-500/20 bg-violet-500/5">
                    <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">Créditos Liberados</CardTitle></CardHeader>
                    <CardContent><div className="text-xl font-bold text-violet-500">{fmt(totalCreditosLiberados)}</div></CardContent>
                </Card>
            </div>

            {/* Tabs */}
            <div className="flex items-center border-b border-border gap-1">
                {tabs.map(t => (
                    <button
                        key={t.key}
                        onClick={() => setActiveTab(t.key)}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px
                            ${activeTab === t.key
                                ? 'border-primary text-primary'
                                : 'border-transparent text-muted-foreground hover:text-foreground'}
                        `}
                    >
                        {t.icon} {t.label}
                    </button>
                ))}
            </div>

            {/* HISTÓRICO */}
            {activeTab === 'historico' && (
                <div className="space-y-4">
                    <div className="flex flex-wrap gap-3 items-center">
                        <div className="relative flex-1 min-w-[220px]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input className="pl-9" placeholder="Buscar por indicador ou indicado..." value={search} onChange={e => setSearch(e.target.value)} />
                        </div>
                        <Select className="w-40" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                            <option value="todos">Todos</option>
                            <option value="Pendente">Pendente</option>
                            <option value="Confirmada">Confirmada</option>
                            <option value="Cancelada">Cancelada</option>
                        </Select>
                    </div>

                    <Card>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Data</TableHead>
                                        <TableHead>Quem Indicou</TableHead>
                                        <TableHead>Cliente Indicado</TableHead>
                                        <TableHead>Pedido</TableHead>
                                        <TableHead className="text-right">Valor Venda</TableHead>
                                        <TableHead className="text-right">Recompensa</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? (
                                        <TableRow><TableCell colSpan={8} className="text-center py-8 animate-pulse text-muted-foreground">Carregando...</TableCell></TableRow>
                                    ) : filtered.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                                                <Users2 className="w-10 h-10 mx-auto mb-3 opacity-20" />
                                                <p>Nenhuma indicação registrada.</p>
                                                <p className="text-xs mt-1">As indicações aparecem automaticamente ao criar uma venda com indicador.</p>
                                            </TableCell>
                                        </TableRow>
                                    ) : filtered.map(ind => (
                                        <TableRow key={ind.id}>
                                            <TableCell className="text-xs">{fmtDate(ind.created_at)}</TableCell>
                                            <TableCell>
                                                <div className="font-semibold text-sm">{ind.indicador?.nome || '—'}</div>
                                                {ind.indicador?.telefone && <div className="text-xs text-muted-foreground">{ind.indicador.telefone}</div>}
                                            </TableCell>
                                            <TableCell className="text-sm">{ind.indicado?.nome || '—'}</TableCell>
                                            <TableCell className="font-mono text-primary text-xs font-bold">
                                                {ind.vendas?.numero_pedido ? `#${String(ind.vendas.numero_pedido).padStart(6, '0')}` : '—'}
                                            </TableCell>
                                            <TableCell className="text-right text-sm">{ind.valor_venda > 0 ? fmt(ind.valor_venda) : '—'}</TableCell>
                                            <TableCell className="text-right">
                                                <div className={`text-sm font-bold ${ind.recompensa_liberada ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                                                    {fmt(ind.recompensa_valor || 0)}
                                                    {ind.recompensa_liberada && <span className="text-[9px] ml-1 text-emerald-500 font-normal">✓ liberado</span>}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={STATUS_VARIANT[ind.status] || 'outline'} className="text-[10px] gap-1">
                                                    {STATUS_ICON[ind.status]} {ind.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    {ind.status === 'Pendente' && !ind.recompensa_liberada && (
                                                        <Button
                                                            variant="ghost" size="sm"
                                                            className="h-7 text-xs gap-1 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10"
                                                            onClick={() => handleLiberarRecompensa(ind)}
                                                            title="Liberar recompensa"
                                                        >
                                                            <Gift className="w-3 h-3" /> Liberar
                                                        </Button>
                                                    )}
                                                    {ind.status === 'Pendente' && (
                                                        <Button
                                                            variant="ghost" size="sm"
                                                            className="h-7 text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                            onClick={() => handleCancelarIndicacao(ind.id)}
                                                        >
                                                            <XCircle className="w-3 h-3" /> Cancelar
                                                        </Button>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* RANKING */}
            {activeTab === 'ranking' && (
                <div className="space-y-4">
                    {ranking.length === 0 ? (
                        <Card>
                            <CardContent className="py-12 text-center text-muted-foreground">
                                <Trophy className="w-10 h-10 mx-auto mb-3 opacity-20" />
                                <p>Nenhum indicador registrado ainda.</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="space-y-3">
                            {ranking.map((r, i) => (
                                <Card key={r.nome} className={`transition-all ${i === 0 ? 'border-amber-500/40 bg-amber-500/5' : ''}`}>
                                    <CardContent className="p-4">
                                        <div className="flex items-center gap-4">
                                            {/* Posição */}
                                            <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-black text-lg
                                                ${i === 0 ? 'bg-amber-500 text-white' : i === 1 ? 'bg-zinc-400 text-white' : i === 2 ? 'bg-amber-700 text-white' : 'bg-muted text-muted-foreground'}`}>
                                                {i === 0 ? <Star className="w-5 h-5" /> : `${i + 1}º`}
                                            </div>

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold text-sm">{r.nome}</p>
                                                {r.telefone && <p className="text-xs text-muted-foreground">{r.telefone}</p>}
                                            </div>

                                            {/* Métricas */}
                                            <div className="flex items-center gap-6 shrink-0">
                                                <div className="text-center">
                                                    <p className="text-2xl font-black text-primary">{r.count}</p>
                                                    <p className="text-[10px] text-muted-foreground uppercase font-medium">Indicações</p>
                                                </div>
                                                <div className="text-center">
                                                    <p className="text-sm font-bold text-emerald-500">{fmt(r.total_gerado)}</p>
                                                    <p className="text-[10px] text-muted-foreground uppercase font-medium">Gerado</p>
                                                </div>
                                                <div className="text-center">
                                                    <p className="text-sm font-bold text-violet-500">{fmt(r.creditos)}</p>
                                                    <p className="text-[10px] text-muted-foreground uppercase font-medium">Créditos</p>
                                                </div>
                                            </div>
                                        </div>
                                        {/* Barra de progresso relativa ao campeão */}
                                        {ranking[0] && (
                                            <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all ${i === 0 ? 'bg-amber-500' : 'bg-primary/60'}`}
                                                    style={{ width: `${(r.count / ranking[0].count) * 100}%` }}
                                                />
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* CONFIGURAÇÕES */}
            {activeTab === 'configuracoes' && (
                <Card className="max-w-lg">
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <Settings2 className="w-4 h-4" /> Regras do Programa de Indicações
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSaveConfig} className="space-y-5">
                            {/* Ativo */}
                            <div className="flex items-center justify-between p-3 border rounded-lg">
                                <div>
                                    <p className="font-medium text-sm">Programa Ativo</p>
                                    <p className="text-xs text-muted-foreground">Exibe o campo de indicação nas vendas</p>
                                </div>
                                <input type="checkbox" className="h-5 w-5 rounded cursor-pointer"
                                    checked={configForm.indicacao_ativa}
                                    onChange={e => setConfigForm({ ...configForm, indicacao_ativa: e.target.checked })} />
                            </div>

                            {/* Tipo benefício */}
                            <div className="space-y-2">
                                <Label>Tipo de Benefício</Label>
                                <Select value={configForm.indicacao_tipo_beneficio}
                                    onChange={e => setConfigForm({ ...configForm, indicacao_tipo_beneficio: e.target.value })}>
                                    <option value="credito">Crédito Fixo em R$ (adiciona ao saldo do cliente)</option>
                                    <option value="percentual">Percentual do Valor da Venda (%)</option>
                                </Select>
                            </div>

                            {configForm.indicacao_tipo_beneficio === 'credito' ? (
                                <div className="space-y-2">
                                    <Label>Valor do Crédito por Indicação (R$)</Label>
                                    <Input type="number" step="0.01" min="0" placeholder="20,00"
                                        value={configForm.indicacao_valor_fixo}
                                        onChange={e => setConfigForm({ ...configForm, indicacao_valor_fixo: parseFloat(e.target.value) || 0 })} />
                                    <p className="text-xs text-muted-foreground">O indicador recebe este valor a cada indicação confirmada.</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <Label>Percentual sobre o Valor da Venda (%)</Label>
                                    <Input type="number" step="0.1" min="0" max="50" placeholder="5"
                                        value={configForm.indicacao_percentual}
                                        onChange={e => setConfigForm({ ...configForm, indicacao_percentual: parseFloat(e.target.value) || 0 })} />
                                    <p className="text-xs text-muted-foreground">Ex: 5% de uma venda de R$ 400 = R$ 20 de crédito.</p>
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label>Valor Mínimo da Venda para Contar (R$)</Label>
                                <Input type="number" step="0.01" min="0" placeholder="0"
                                    value={configForm.indicacao_valor_minimo_venda}
                                    onChange={e => setConfigForm({ ...configForm, indicacao_valor_minimo_venda: parseFloat(e.target.value) || 0 })} />
                                <p className="text-xs text-muted-foreground">Deixe em 0 para não ter valor mínimo.</p>
                            </div>

                            {/* Preview */}
                            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                                <p className="text-xs font-bold text-primary mb-1 uppercase tracking-wide">Prévia da recompensa</p>
                                <p className="text-sm text-muted-foreground">
                                    {configForm.indicacao_tipo_beneficio === 'credito'
                                        ? `→ Indicador recebe ${fmt(configForm.indicacao_valor_fixo)} de crédito por indicação confirmada`
                                        : `→ Indicador recebe ${configForm.indicacao_percentual}% do valor da venda (ex: R$ 400 = ${fmt(400 * configForm.indicacao_percentual / 100)})`
                                    }
                                </p>
                                {configForm.indicacao_valor_minimo_venda > 0 && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                        → Só conta se venda ≥ {fmt(configForm.indicacao_valor_minimo_venda)}
                                    </p>
                                )}
                            </div>

                            <Button type="submit" className="w-full" disabled={savingConfig}>
                                {savingConfig ? 'Salvando...' : 'Salvar Configurações'}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
