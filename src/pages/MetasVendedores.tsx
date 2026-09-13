import { useEffect, useState, useCallback } from "react"
import { api, metasApi } from "@/lib/api"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Modal } from "@/components/ui/modal"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Plus, Pencil, ChevronLeft, ChevronRight, AlertCircle, Award, Target, TrendingUp, DollarSign } from "lucide-react"
import { useAuthStore as useAuth } from "@/store/authStore"
import { fmt } from "@/lib/format"

const pct = (a: number, b: number) => b > 0 ? Math.min(100, (a / b) * 100).toFixed(1) : '0.0'

function getMesAno(base?: string, offset = 0) {
    const d = base ? new Date(`${base}-01T12:00:00Z`) : new Date()
    d.setMonth(d.getMonth() + offset)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function labelMesAno(mesAno: string) {
    const [y, m] = mesAno.split('-')
    return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' })
}

function calculateWorkingDays(startDateStr: string, endDateStr: string) {
    if (!startDateStr || !endDateStr) return { dias_uteis: 0, sabados: 0 };
    const start = new Date(`${startDateStr}T12:00:00Z`);
    const end = new Date(`${endDateStr}T12:00:00Z`);
    if (start > end) return { dias_uteis: 0, sabados: 0 };
    
    let uteis = 0;
    let sabados = 0;
    const current = new Date(start);
    while (current <= end) {
        const day = current.getUTCDay();
        if (day >= 1 && day <= 5) uteis++;
        else if (day === 6) sabados++;
        current.setUTCDate(current.getUTCDate() + 1);
    }
    return { dias_uteis: uteis, sabados: sabados };
}

const emptyForm = {
    atendente_id: '',
    meta_valor: '',
    comissao_percentual: '',
    meta_loja_valor: '',
    premio_loja_fixo: '',
    comissao_loja_percentual: '',
    meta_diaria_cadastros_sucata: '',
    meta_diaria_cadastros_avulso: '',
    dias_uteis: '',
    sabados: '',
    meta_carros_desmontados: '',
    data_inicio: '',
    data_fim: ''
}

export function MetasVendedores() {
    const { user } = useAuth()
    const cargoLower = (user?.cargo || '').toLowerCase()
    const emailLower = (user?.email || '').toLowerCase()
    const isManager = !!user?.perm_admin || 
        !!user?.perm_config || 
        user?.perfil === 'admin' || 
        cargoLower.includes('gerente') || 
        cargoLower.includes('proprietar') || 
        cargoLower.includes('administrador') ||
        emailLower === 'pecasdourados@hotmail.com' ||
        emailLower === 'pecasdourados2@gmail.com'

    const [painel, setPainel] = useState<any[]>([])
    const [allAtendentesList, setAllAtendentesList] = useState<{ id: string; nome: string; cargo?: string }[]>([])
    const [metaGeral, setMetaGeral] = useState({ meta_vendas: 0, premio_fixo: 0 })
    const [isMetaGeralModalOpen, setIsMetaGeralModalOpen] = useState(false)
    const [metaGeralForm, setMetaGeralForm] = useState({ meta_vendas: '', premio_fixo: '' })
    const [mesAno, setMesAno] = useState(getMesAno(0))
    const [loading, setLoading] = useState(true)
    
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingMeta, setEditingMeta] = useState<any>(null)
    const [form, setForm] = useState(emptyForm)

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const promises: Promise<any>[] = [
                api.get(`/api/metas-vendedores/painel?mes_ano=${mesAno}`),
                api.get(`/api/metas-gerais?mes_ano=${mesAno}`).catch(() => ({ meta_vendas: 0, premio_fixo: 0 }))
            ]
            if (isManager) {
                promises.push(api.get('/api/atendentes/').catch(() => []))
            }
            const results = await Promise.all(promises)
            const data = results[0]
            const metaGeralData = results[1]
            if (isManager && results[2]) {
                const atList = Array.isArray(results[2]) ? results[2] : (results[2].items || results[2].data || [])
                setAllAtendentesList(atList)
            }
            setPainel(Array.isArray(data) ? data : [])
            setMetaGeral({ meta_vendas: metaGeralData.meta_vendas || 0, premio_fixo: metaGeralData.premio_fixo || 0 })
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Erro ao carregar dados do painel'
            toast.error(msg)
            setPainel([])
        } finally {
            setLoading(false)
        }
    }, [mesAno, isManager])

    useEffect(() => { fetchData() }, [fetchData])

    const handleSaveMetaGeral = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            await api.post('/api/metas-gerais', {
                mes_ano: mesAno,
                meta_vendas: parseFloat(metaGeralForm.meta_vendas) || 0,
                premio_fixo: parseFloat(metaGeralForm.premio_fixo) || 0
            })
            setIsMetaGeralModalOpen(false)
            fetchData()
            toast.success("Meta geral da loja salva com sucesso!")
        } catch (err: any) {
            toast.error("Erro ao salvar meta geral da loja")
        }
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!isManager) {
            toast.error("Sem permissão para configurar metas.")
            return
        }
        try {
            const payload = {
                atendente_id: form.atendente_id,
                mes_ano: mesAno,
                meta_valor: parseFloat(form.meta_valor) || 0,
                comissao_percentual: parseFloat(form.comissao_percentual) || 0,
                meta_loja_valor: parseFloat(form.meta_loja_valor) || 0,
                premio_loja_fixo: parseFloat(form.premio_loja_fixo) || 0,
                comissao_loja_percentual: parseFloat(form.comissao_loja_percentual) || 0,
                meta_diaria_cadastros_sucata: parseInt(form.meta_diaria_cadastros_sucata) || 0,
                meta_diaria_cadastros_avulso: parseInt(form.meta_diaria_cadastros_avulso) || 0,
                dias_uteis: parseInt(form.dias_uteis) || 0,
                sabados: parseInt(form.sabados) || 0,
                meta_carros_desmontados: parseInt(form.meta_carros_desmontados) || 0,
                data_inicio: form.data_inicio || null,
                data_fim: form.data_fim || null,
            }

            if (editingMeta?.meta_id) {
                await metasApi.atualizar(editingMeta.meta_id, payload)
            } else {
                await metasApi.salvar(payload)
            }
            setIsModalOpen(false)
            setEditingMeta(null)
            setForm(emptyForm)
            fetchData()
            toast.success("Meta salva com sucesso!")
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Erro ao salvar meta')
        }
    }

    const handleEdit = (atendente: any) => {
        setEditingMeta(atendente)
        setForm({
            atendente_id: atendente.atendente_id,
            meta_valor: String(atendente.meta_valor || ''),
            comissao_percentual: String(atendente.comissao_percentual || ''),
            meta_loja_valor: String(atendente.meta_loja_valor || ''),
            premio_loja_fixo: String(atendente.premio_loja_fixo || ''),
            comissao_loja_percentual: String(atendente.comissao_loja_percentual || ''),
            meta_diaria_cadastros_sucata: String(atendente.meta_diaria_cadastros_sucata || ''),
            meta_diaria_cadastros_avulso: String(atendente.meta_diaria_cadastros_avulso || ''),
            dias_uteis: String(atendente.dias_uteis || ''),
            sabados: String(atendente.sabados || ''),
            meta_carros_desmontados: String(atendente.meta_carros_desmontados_cfg || ''),
            data_inicio: atendente.data_inicio || '',
            data_fim: atendente.data_fim || '',
        })
        setIsModalOpen(true)
    }

    const handlePrevMonth = () => setMesAno(prev => getMesAno(prev, -1))
    const handleNextMonth = () => setMesAno(prev => getMesAno(prev, 1))

    // Computeds gerais
    const totalVendasLiqGeral = painel.length > 0 ? (painel[0].total_vendas_loja_geral || 0) : 0
    const totalMetaLojaGlobal = metaGeral.meta_vendas || 0
    const pctMetaLojaGlobal = totalMetaLojaGlobal > 0 ? Math.min(100, (totalVendasLiqGeral / totalMetaLojaGlobal) * 100) : 0
    
    // Total a pagar para a equipe (gestão)
    const totalGeralAPagarEquipe = painel.reduce((acc, ate) => acc + (ate.total_estimado_receber || 0), 0)

    // Registro do próprio colaborador (quando não-gestor, o painel só tem 1 item)
    const myRecord = painel[0]

    const ProgressBar = ({ percent }: { percent: number }) => (
        <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all ${percent >= 100 ? 'bg-emerald-500' : percent >= 70 ? 'bg-amber-500' : 'bg-rose-500'}`}
                    style={{ width: `${Math.min(percent, 100)}%` }}
                />
            </div>
            <span className={`text-xs font-bold w-12 text-right ${percent >= 100 ? 'text-emerald-500' : percent >= 70 ? 'text-amber-500' : 'text-rose-500'}`}>
                {percent.toFixed(1)}%
            </span>
        </div>
    )

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        {isManager ? "Metas da Equipe & Loja" : "Minhas Metas"}
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        {isManager 
                            ? "Acompanhe o desempenho de Vendedores, Cadastradores e Desmontadores." 
                            : "Acompanhe seu desempenho individual e sua participação nas metas da loja."}
                    </p>
                </div>
                {isManager && (
                    <div className="flex gap-2">
                        <Button variant="outline" className="gap-2" onClick={() => {
                            setMetaGeralForm({ meta_vendas: String(metaGeral.meta_vendas), premio_fixo: String(metaGeral.premio_fixo) })
                            setIsMetaGeralModalOpen(true)
                        }}>
                            <Target className="w-4 h-4" /> Configurar Meta da Loja
                        </Button>
                        <Button className="gap-2" onClick={() => { setEditingMeta(null); setForm(emptyForm); setIsModalOpen(true) }}>
                            <Plus className="w-4 h-4" /> Configurar Metas Vendedor
                        </Button>
                    </div>
                )}
            </div>

            {/* Navegação de mês */}
            <div className="flex items-center gap-4 bg-card border rounded-lg p-2 w-fit">
                <Button variant="ghost" size="icon" onClick={handlePrevMonth}><ChevronLeft className="w-4 h-4" /></Button>
                <h2 className="text-base font-semibold capitalize min-w-[150px] text-center">{labelMesAno(mesAno)}</h2>
                <Button variant="ghost" size="icon" onClick={handleNextMonth}><ChevronRight className="w-4 h-4" /></Button>
            </div>

            {/* KPIs — Visão do Gestor vs Visão Individual */}
            {isManager ? (
                <div className="grid gap-4 sm:grid-cols-3">
                    <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Vendas Líquidas (Geral da Loja)</CardTitle></CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-emerald-500">{fmt(totalVendasLiqGeral)}</div>
                            <p className="text-xs text-muted-foreground mt-1">Total faturado no mês (após devoluções)</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Meta Geral da Loja</CardTitle></CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{fmt(totalMetaLojaGlobal)}</div>
                            <div className="mt-2">
                                <ProgressBar percent={pctMetaLojaGlobal} />
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Comissões & Prêmios da Equipe</CardTitle></CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-amber-500">{fmt(totalGeralAPagarEquipe)}</div>
                            <p className="text-xs text-muted-foreground mt-1">Total estimado a pagar a todos colaboradores</p>
                        </CardContent>
                    </Card>
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><DollarSign className="w-4 h-4 text-emerald-500" /> Minhas Vendas Líquidas</CardTitle></CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-emerald-500">{fmt(myRecord?.vendas_liquido || 0)}</div>
                            <p className="text-xs text-muted-foreground mt-1">Bruto: {fmt(myRecord?.total_vendas || 0)} | Devoluções: {fmt(myRecord?.total_devolucoes || 0)}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Target className="w-4 h-4 text-blue-500" /> Minha Meta Individual</CardTitle></CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{myRecord?.meta_valor ? fmt(myRecord.meta_valor) : '—'}</div>
                            <div className="mt-2">
                                <ProgressBar percent={parseFloat(pct(myRecord?.vendas_liquido || 0, myRecord?.meta_valor || 0))} />
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><TrendingUp className="w-4 h-4 text-purple-500" /> Vendas Gerais da Loja</CardTitle></CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{fmt(totalVendasLiqGeral)}</div>
                            <div className="mt-2">
                                <ProgressBar percent={myRecord?.atingimento_loja_pct || pctMetaLojaGlobal} />
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">Meta Loja: {fmt(myRecord?.meta_loja_ref || totalMetaLojaGlobal)}</p>
                        </CardContent>
                    </Card>
                    <Card className="border-emerald-500/30 bg-emerald-500/5">
                        <CardHeader className="pb-2"><CardTitle className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-2"><Award className="w-4 h-4" /> Total a Receber (Est.)</CardTitle></CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-emerald-500">{fmt(myRecord?.total_estimado_receber || 0)}</div>
                            <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                                <div>Comissão própria: {fmt(myRecord?.comissao_propria_ganho || 0)}</div>
                                <div>Prêmio/Comissão loja: {fmt((myRecord?.premio_loja_ganho || 0) + (myRecord?.comissao_loja_ganho || 0))}</div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            <Tabs defaultValue="vendedores" className="w-full">
                <TabsList className="w-full sm:w-auto grid grid-cols-3 sm:inline-flex">
                    <TabsTrigger value="vendedores">Vendas</TabsTrigger>
                    <TabsTrigger value="cadastros">Cadastro & Estoque</TabsTrigger>
                    <TabsTrigger value="desmontes">Desmontagem</TabsTrigger>
                </TabsList>

                {/* TAB 1: VENDAS */}
                <TabsContent value="vendedores" className="mt-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base flex items-center justify-between">
                                <span>{isManager ? "Desempenho de Vendas da Equipe" : "Meu Desempenho de Vendas"}</span>
                                <span className="text-xs font-normal text-muted-foreground">
                                    Vendas Gerais da Loja: <strong className="text-emerald-500">{fmt(totalVendasLiqGeral)}</strong> / Meta: <strong>{fmt(totalMetaLojaGlobal)}</strong>
                                </span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {painel.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    Nenhuma meta encontrada para este período.
                                </div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Colaborador</TableHead>
                                            <TableHead className="text-right">Vendido Líq.</TableHead>
                                            <TableHead className="text-right">Meta Própria</TableHead>
                                            <TableHead className="w-[120px]">Ating. Próprio</TableHead>
                                            <TableHead className="text-right">Comiss. Própria</TableHead>
                                            <TableHead className="text-right border-l pl-3">Meta Loja (Ref.)</TableHead>
                                            <TableHead className="w-[120px]">Ating. Loja</TableHead>
                                            <TableHead className="text-right">Ganho Meta Loja</TableHead>
                                            <TableHead className="text-right font-bold text-emerald-500 border-l pl-3">Total a Receber</TableHead>
                                            {isManager && <TableHead className="text-right">Ações</TableHead>}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {painel.map(ate => {
                                            const liq = ate.vendas_liquido || 0
                                            const meta = ate.meta_valor || 0
                                            const pctAting = parseFloat(pct(Math.max(0, liq), meta))
                                            const comissPropria = ate.comissao_propria_ganho || 0
                                            
                                            const metaLojaRef = ate.meta_loja_ref || totalMetaLojaGlobal
                                            const atingLojaPct = ate.atingimento_loja_pct || 0
                                            const ganhoLojaTotal = (ate.premio_loja_ganho || 0) + (ate.comissao_loja_ganho || 0)
                                            const totalReceber = ate.total_estimado_receber || (comissPropria + ganhoLojaTotal)

                                            const du = ate.dias_uteis || 0
                                            const sab = ate.sabados || 0
                                            const totalDays = du + (sab * 0.5)
                                            const metaDiariaVendas = totalDays > 0 && meta > 0 ? meta / totalDays : 0
                                            
                                            return (
                                                <TableRow key={ate.atendente_id}>
                                                    <TableCell className="font-semibold">
                                                        {ate.nome} 
                                                        <div className="text-xs text-muted-foreground font-normal">{ate.cargo || 'Vendedor'}</div>
                                                    </TableCell>
                                                    <TableCell className="text-right font-semibold text-emerald-600 dark:text-emerald-400">
                                                        {fmt(liq)}
                                                        <div className="text-[10px] text-muted-foreground font-normal">Bruto: {fmt(ate.total_vendas)}</div>
                                                    </TableCell>
                                                    <TableCell className="text-right text-sm">
                                                        {meta > 0 ? (
                                                            <div className="flex flex-col items-end">
                                                                <span className="font-bold">{fmt(meta)}</span>
                                                                {metaDiariaVendas > 0 && <span className="text-[10px] text-muted-foreground font-normal">Diária: {fmt(metaDiariaVendas)}</span>}
                                                            </div>
                                                        ) : '—'}
                                                    </TableCell>
                                                    <TableCell>{meta > 0 ? <ProgressBar percent={pctAting} /> : '—'}</TableCell>
                                                    <TableCell className="text-right text-sm">
                                                        {comissPropria > 0 ? (
                                                            <div>
                                                                <span className="font-semibold text-amber-500">{fmt(comissPropria)}</span>
                                                                <div className="text-[10px] text-muted-foreground">({ate.comissao_percentual}%)</div>
                                                            </div>
                                                        ) : (
                                                            ate.comissao_percentual > 0 ? `${ate.comissao_percentual}%` : '—'
                                                        )}
                                                    </TableCell>
                                                    
                                                    {/* Meta Individual baseada nas Vendas da Loja */}
                                                    <TableCell className="text-right text-sm border-l pl-3">
                                                        {metaLojaRef > 0 ? fmt(metaLojaRef) : '—'}
                                                    </TableCell>
                                                    <TableCell>
                                                        {metaLojaRef > 0 ? <ProgressBar percent={atingLojaPct} /> : '—'}
                                                    </TableCell>
                                                    <TableCell className="text-right text-sm">
                                                        {ganhoLojaTotal > 0 ? (
                                                            <div>
                                                                <span className="font-semibold text-emerald-500">{fmt(ganhoLojaTotal)}</span>
                                                                <div className="text-[10px] text-muted-foreground">
                                                                    {ate.premio_loja_ganho > 0 && `Prêmio: ${fmt(ate.premio_loja_ganho)}`}
                                                                    {ate.comissao_loja_ganho > 0 && `Comiss: ${fmt(ate.comissao_loja_ganho)}`}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            (ate.premio_loja_fixo > 0 || ate.comissao_loja_percentual > 0) ? (
                                                                <span className="text-xs text-muted-foreground">
                                                                    {ate.premio_loja_fixo > 0 ? `Prêmio: ${fmt(ate.premio_loja_fixo)}` : ''}
                                                                    {ate.comissao_loja_percentual > 0 ? ` (${ate.comissao_loja_percentual}%)` : ''}
                                                                </span>
                                                            ) : '—'
                                                        )}
                                                    </TableCell>

                                                    {/* Total Geral a Receber */}
                                                    <TableCell className="text-right font-bold text-emerald-500 border-l pl-3 text-base">
                                                        {totalReceber > 0 ? fmt(totalReceber) : '—'}
                                                    </TableCell>

                                                    {isManager && (
                                                        <TableCell className="text-right">
                                                            <Button variant="ghost" size="icon" onClick={() => handleEdit(ate)}>
                                                                <Pencil className="w-4 h-4 text-blue-500" />
                                                            </Button>
                                                        </TableCell>
                                                    )}
                                                </TableRow>
                                            )
                                        })}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* TAB 2: CADASTRO E ESTOQUE */}
                <TabsContent value="cadastros" className="mt-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base flex items-center justify-between">
                                <span>{isManager ? "Desempenho de Cadastradores e Estoquistas" : "Meu Desempenho em Cadastros"}</span>
                                <div className="text-sm font-normal text-muted-foreground flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4" /> 
                                    Meta Mensal = (Dias Úteis × Meta Diária) + (Sábados × Metade da Meta Diária)
                                </div>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Colaborador</TableHead>
                                        <TableHead className="text-center">Configuração de Dias</TableHead>
                                        <TableHead className="text-center">Sucata: Meta vs Cadastros</TableHead>
                                        <TableHead className="text-center">Avulso: Meta vs Cadastros</TableHead>
                                        <TableHead className="text-center">Atingimento Global</TableHead>
                                        <TableHead className="text-center">Fotos (Produtos / Total)</TableHead>
                                        {isManager && <TableHead className="text-right">Ações</TableHead>}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {painel.map(ate => {
                                        const du = ate.dias_uteis || 0
                                        const sab = ate.sabados || 0
                                        const mdSuc = ate.meta_diaria_cadastros_sucata || 0
                                        const mdAv = ate.meta_diaria_cadastros_avulso || 0
                                        
                                        const metaMensalSuc = (du * mdSuc) + (sab * (mdSuc / 2))
                                        const metaMensalAv = (du * mdAv) + (sab * (mdAv / 2))
                                        
                                        const rSuc = ate.produtos_sucata || 0
                                        const rAv = ate.produtos_avulso || 0
                                        
                                        const pctSuc = metaMensalSuc > 0 ? (rSuc / metaMensalSuc) : 0
                                        const pctAv = metaMensalAv > 0 ? (rAv / metaMensalAv) : 0
                                        const hasAnyMeta = metaMensalSuc > 0 || metaMensalAv > 0
                                        const pctGlobal = hasAnyMeta ? parseFloat(((pctSuc + pctAv) * 100).toFixed(1)) : 0
                                        
                                        return (
                                            <TableRow key={ate.atendente_id}>
                                                <TableCell className="font-semibold">{ate.nome} <div className="text-xs text-muted-foreground font-normal">{ate.cargo}</div></TableCell>
                                                <TableCell className="text-center text-xs">
                                                    {du > 0 || sab > 0 ? `${du} Úteis, ${sab} Sábados` : '—'}
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    {metaMensalSuc > 0 ? (
                                                        <div className="flex flex-col items-center">
                                                            <span className="text-xs text-muted-foreground">Diária: {mdSuc} | Mensal: {metaMensalSuc}</span>
                                                            <span className={`font-bold ${rSuc >= metaMensalSuc ? 'text-emerald-500' : ''}`}>{rSuc} / {metaMensalSuc}</span>
                                                        </div>
                                                    ) : '—'}
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    {metaMensalAv > 0 ? (
                                                        <div className="flex flex-col items-center">
                                                            <span className="text-xs text-muted-foreground">Diária: {mdAv} | Mensal: {metaMensalAv}</span>
                                                            <span className={`font-bold ${rAv >= metaMensalAv ? 'text-emerald-500' : ''}`}>{rAv} / {metaMensalAv}</span>
                                                        </div>
                                                    ) : '—'}
                                                </TableCell>
                                                <TableCell>
                                                    {hasAnyMeta ? <ProgressBar percent={pctGlobal} /> : '—'}
                                                </TableCell>
                                                <TableCell className="text-center font-medium">
                                                    {ate.produtos_com_foto} pçs / {ate.total_fotos} fotos
                                                </TableCell>
                                                {isManager && (
                                                    <TableCell className="text-right">
                                                        <Button variant="ghost" size="icon" onClick={() => handleEdit(ate)}>
                                                            <Pencil className="w-4 h-4 text-blue-500" />
                                                        </Button>
                                                    </TableCell>
                                                )}
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
                
                {/* TAB 3: DESMONTAGEM */}
                <TabsContent value="desmontes" className="mt-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">
                                {isManager ? "Desempenho de Desmontadores" : "Meu Desempenho em Desmontagem"}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Colaborador</TableHead>
                                        <TableHead className="text-center">Meta (Mês)</TableHead>
                                        <TableHead className="text-center">Carros Desmontados</TableHead>
                                        <TableHead className="w-[200px]">Atingimento</TableHead>
                                        {isManager && <TableHead className="text-right">Ações</TableHead>}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {painel.map(ate => {
                                        const meta = ate.meta_carros_desmontados_cfg || 0
                                        const realizado = ate.carros_desmontados || 0
                                        const ating = parseFloat(pct(realizado, meta))
                                        
                                        return (
                                            <TableRow key={ate.atendente_id}>
                                                <TableCell className="font-semibold">{ate.nome} <div className="text-xs text-muted-foreground font-normal">{ate.cargo}</div></TableCell>
                                                <TableCell className="text-center font-medium">{meta > 0 ? meta : '—'}</TableCell>
                                                <TableCell className="text-center font-bold text-blue-600">{realizado}</TableCell>
                                                <TableCell>{meta > 0 ? <ProgressBar percent={ating} /> : '—'}</TableCell>
                                                {isManager && (
                                                    <TableCell className="text-right">
                                                        <Button variant="ghost" size="icon" onClick={() => handleEdit(ate)}>
                                                            <Pencil className="w-4 h-4 text-blue-500" />
                                                        </Button>
                                                    </TableCell>
                                                )}
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* MODAL: META DA LOJA (GLOBAL) */}
            <Modal isOpen={isMetaGeralModalOpen} onClose={() => setIsMetaGeralModalOpen(false)} title="Configurar Meta da Loja (Global)">
                <form onSubmit={handleSaveMetaGeral} className="space-y-4">
                    <div className="space-y-2">
                        <Label>Meta de Vendas da Loja (R$)</Label>
                        <Input type="number" step="0.01" min="0" value={metaGeralForm.meta_vendas} onChange={e => setMetaGeralForm({ ...metaGeralForm, meta_vendas: e.target.value })} />
                        <p className="text-xs text-muted-foreground">Faturamento total líquido que a loja deve atingir no mês.</p>
                    </div>
                    <div className="space-y-2">
                        <Label>Prêmio Fixo Global da Loja (R$)</Label>
                        <Input type="number" step="0.01" min="0" value={metaGeralForm.premio_fixo} onChange={e => setMetaGeralForm({ ...metaGeralForm, premio_fixo: e.target.value })} />
                        <p className="text-xs text-muted-foreground">Valor de referência do prêmio fixo global caso a meta da loja seja batida.</p>
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <Button variant="outline" type="button" onClick={() => setIsMetaGeralModalOpen(false)}>Cancelar</Button>
                        <Button type="submit">Salvar Meta da Loja</Button>
                    </div>
                </form>
            </Modal>

            {/* MODAL: CONFIGURAR METAS DO COLABORADOR */}
            <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingMeta(null) }} title={editingMeta?.meta_id ? "Editar Metas do Colaborador" : "Configurar Metas"}>
                <form onSubmit={handleSave} className="space-y-6 max-h-[80vh] overflow-y-auto px-1 pb-4">
                    <div className="space-y-2">
                        <Label>Selecione o Colaborador *</Label>
                        <Select required value={form.atendente_id} onChange={e => setForm({ ...form, atendente_id: e.target.value })} disabled={!!editingMeta?.meta_id}>
                            <option value="">Selecione...</option>
                            {(allAtendentesList.length > 0 ? allAtendentesList : painel).map(a => {
                                const aid = a.id || a.atendente_id
                                return (
                                    <option key={aid} value={aid}>{a.nome} ({a.cargo || 'S/ Cargo'})</option>
                                )
                            })}
                        </Select>
                    </div>

                    {/* 1. Vendas Próprias */}
                    <div className="border rounded-md p-4 bg-muted/20 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-sm">1. Meta Individual (Vendas Próprias)</h3>
                            <span className="text-xs text-muted-foreground">Desempenho pessoal</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Meta de Vendas Líquidas Próprias (R$)</Label>
                                <Input type="number" step="0.01" min="0" placeholder="Ex: 50000.00" value={form.meta_valor} onChange={e => setForm({ ...form, meta_valor: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Comissão sobre Vendas Próprias (%)</Label>
                                <Input type="number" step="0.1" min="0" max="100" placeholder="Ex: 1.5" value={form.comissao_percentual} onChange={e => setForm({ ...form, comissao_percentual: e.target.value })} />
                            </div>
                        </div>
                    </div>

                    {/* 2. Meta Baseada nas Vendas Gerais da Loja */}
                    <div className="border rounded-md p-4 bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-sm text-emerald-700 dark:text-emerald-400">2. Meta Individual baseada nas Vendas Gerais da Loja</h3>
                            <span className="text-xs text-muted-foreground">Incentivo por vendas da loja</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label>Meta da Loja Ref. (R$)</Label>
                                <Input type="number" step="0.01" min="0" placeholder={`Padrão: ${fmt(metaGeral.meta_vendas)}`} value={form.meta_loja_valor} onChange={e => setForm({ ...form, meta_loja_valor: e.target.value })} />
                                <p className="text-[11px] text-muted-foreground">Se 0, usa a Meta da Loja ({fmt(metaGeral.meta_vendas)}).</p>
                            </div>
                            <div className="space-y-2">
                                <Label>Prêmio Fixo Individual (R$)</Label>
                                <Input type="number" step="0.01" min="0" placeholder="Ex: 300.00" value={form.premio_loja_fixo} onChange={e => setForm({ ...form, premio_loja_fixo: e.target.value })} />
                                <p className="text-[11px] text-muted-foreground">Pago se a loja atingir 100% da meta.</p>
                            </div>
                            <div className="space-y-2">
                                <Label>Comissão Vendas da Loja (%)</Label>
                                <Input type="number" step="0.01" min="0" max="100" placeholder="Ex: 0.2" value={form.comissao_loja_percentual} onChange={e => setForm({ ...form, comissao_loja_percentual: e.target.value })} />
                                <p className="text-[11px] text-muted-foreground">Comissão opcional sobre faturamento geral.</p>
                            </div>
                        </div>
                    </div>

                    {/* 3. Cadastro de Produtos */}
                    <div className="border rounded-md p-4 bg-muted/20 space-y-4">
                        <h3 className="font-semibold text-sm">3. Cadastro de Produtos</h3>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Data Inicial (Contagem de Cadastros)</Label>
                                <Input type="date" value={form.data_inicio} onChange={e => {
                                    const data_inicio = e.target.value;
                                    const { dias_uteis, sabados } = calculateWorkingDays(data_inicio, form.data_fim);
                                    setForm(f => ({ ...f, data_inicio, dias_uteis: String(dias_uteis), sabados: String(sabados) }));
                                }} />
                            </div>
                            <div className="space-y-2">
                                <Label>Data Final</Label>
                                <Input type="date" value={form.data_fim} onChange={e => {
                                    const data_fim = e.target.value;
                                    const { dias_uteis, sabados } = calculateWorkingDays(form.data_inicio, data_fim);
                                    setForm(f => ({ ...f, data_fim, dias_uteis: String(dias_uteis), sabados: String(sabados) }));
                                }} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Dias Úteis no Mês (Editável)</Label>
                                <Input type="number" min="0" max="31" value={form.dias_uteis} onChange={e => setForm({ ...form, dias_uteis: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Sábados Trabalhados</Label>
                                <Input type="number" min="0" max="5" value={form.sabados} onChange={e => setForm({ ...form, sabados: e.target.value })} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Meta Diária (Desmonte Sucata)</Label>
                                <Input type="number" min="0" value={form.meta_diaria_cadastros_sucata} onChange={e => setForm({ ...form, meta_diaria_cadastros_sucata: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Meta Diária (Cadastros Avulsos)</Label>
                                <Input type="number" min="0" value={form.meta_diaria_cadastros_avulso} onChange={e => setForm({ ...form, meta_diaria_cadastros_avulso: e.target.value })} />
                            </div>
                        </div>
                    </div>

                    {/* 4. Desmontagem de Veículos */}
                    <div className="border rounded-md p-4 bg-muted/20 space-y-4">
                        <h3 className="font-semibold text-sm">4. Desmontagem de Veículos</h3>
                        <div className="space-y-2">
                            <Label>Meta Total (Carros Desmontados no Mês)</Label>
                            <Input type="number" min="0" value={form.meta_carros_desmontados} onChange={e => setForm({ ...form, meta_carros_desmontados: e.target.value })} />
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <Button variant="outline" type="button" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                        <Button type="submit">Salvar Alterações</Button>
                    </div>
                </form>
            </Modal>
        </div>
    )
}
