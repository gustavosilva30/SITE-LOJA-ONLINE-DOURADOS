import os

path = r"c:\dev\crm-loja-final\src\pages\MetasVendedores.tsx"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. State for metaGeral
meta_geral_state = '''    const [painel, setPainel] = useState<any[]>([])
    const [metaGeral, setMetaGeral] = useState({ meta_vendas: 0, premio_fixo: 0 })
    const [isMetaGeralModalOpen, setIsMetaGeralModalOpen] = useState(false)
    const [metaGeralForm, setMetaGeralForm] = useState({ meta_vendas: '', premio_fixo: '' })'''

content = content.replace("    const [painel, setPainel] = useState<any[]>([])", meta_geral_state)

# 2. Fetch metaGeral in fetchData
fetch_logic = '''    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const [data, metaGeralData] = await Promise.all([
                api.get(`/api/metas-vendedores/painel?mes_ano=${mesAno}`),
                api.get(`/api/metas-gerais?mes_ano=${mesAno}`).catch(() => ({ meta_vendas: 0, premio_fixo: 0 }))
            ])
            setPainel(Array.isArray(data) ? data : [])
            setMetaGeral({ meta_vendas: metaGeralData.meta_vendas || 0, premio_fixo: metaGeralData.premio_fixo || 0 })
        } catch (e: unknown) {'''

content = content.replace('''    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const data = await api.get(`/api/metas-vendedores/painel?mes_ano=${mesAno}`)
            setPainel(Array.isArray(data) ? data : [])
        } catch (e: unknown) {''', fetch_logic)

# 3. Save MetaGeral logic
save_meta_geral = '''
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
            toast.success("Meta geral salva!")
        } catch (err: any) {
            toast.error("Erro ao salvar meta geral")
        }
    }
'''

content = content.replace("    const handleSave = async (e: React.FormEvent) => {", save_meta_geral + "\n    const handleSave = async (e: React.FormEvent) => {")

# 4. Top cards updates
cards = '''            {/* KPIs Gerais (Focado em Vendas por padrão) */}
            <div className="grid gap-4 sm:grid-cols-3">
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Vendas Líquidas (Geral)</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold text-emerald-500">{fmt(totalVendasLiq)}</div></CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Meta Vendas Loja (Geral)</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold">{metaGeral.meta_vendas > 0 ? fmt(metaGeral.meta_vendas) : fmt(totalMetaVendas)}</div></CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{metaGeral.meta_vendas > 0 ? 'Prêmio Fixo a Pagar (Geral)' : 'Comissões a Pagar'}</CardTitle></CardHeader>
                    <CardContent>
                        {metaGeral.meta_vendas > 0 ? (
                            <div className={`text-2xl font-bold ${totalVendasLiq >= metaGeral.meta_vendas ? 'text-emerald-500' : 'text-amber-500'}`}>
                                {totalVendasLiq >= metaGeral.meta_vendas ? fmt(metaGeral.premio_fixo) : 'R$ 0,00'}
                            </div>
                        ) : (
                            <div className="text-2xl font-bold text-amber-500">{fmt(totalComissao)}</div>
                        )}
                    </CardContent>
                </Card>
            </div>'''

content = content.replace('''            {/* KPIs Gerais (Focado em Vendas por padrão) */}
            <div className="grid gap-4 sm:grid-cols-3">
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Vendas Líquidas (Geral)</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold text-emerald-500">{fmt(totalVendasLiq)}</div></CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Meta Vendas (Geral)</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold">{fmt(totalMetaVendas)}</div></CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Comissões a Pagar</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold text-amber-500">{fmt(totalComissao)}</div></CardContent>
                </Card>
            </div>''', cards)

# 5. Add Meta Geral Button
buttons = '''                {isManager && (
                    <div className="flex gap-2">
                        <Button variant="outline" className="gap-2" onClick={() => {
                            setMetaGeralForm({ meta_vendas: String(metaGeral.meta_vendas), premio_fixo: String(metaGeral.premio_fixo) })
                            setIsMetaGeralModalOpen(true)
                        }}>
                            Configurar Meta da Loja
                        </Button>
                        <Button className="gap-2" onClick={() => { setEditingMeta(null); setForm(emptyForm); setIsModalOpen(true) }}>
                            <Plus className="w-4 h-4" /> Configurar Metas Vendedor
                        </Button>
                    </div>
                )}'''

content = content.replace('''                {isManager && (
                    <Button className="gap-2" onClick={() => { setEditingMeta(null); setForm(emptyForm); setIsModalOpen(true) }}>
                        <Plus className="w-4 h-4" /> Configurar Metas
                    </Button>
                )}''', buttons)

# 6. Add visual daily goal in table
table_vendas = '''                                        const pctAting = parseFloat(pct(Math.max(0, liq), meta))
                                        const comisR = liq > 0 ? liq * ((ate.comissao_percentual || 0) / 100) : 0
                                        const du = ate.dias_uteis || 0
                                        const sab = ate.sabados || 0
                                        const totalDays = du + (sab * 0.5)
                                        const metaDiariaVendas = totalDays > 0 && meta > 0 ? meta / totalDays : 0
                                        
                                        return (
                                            <TableRow key={ate.atendente_id}>
                                                <TableCell className="font-semibold">{ate.nome} <div className="text-xs text-muted-foreground font-normal">{ate.cargo}</div></TableCell>
                                                <TableCell className="text-right">{fmt(ate.total_vendas)}</TableCell>
                                                <TableCell className="text-right text-rose-500">-{fmt(ate.total_devolucoes)}</TableCell>
                                                <TableCell className="text-right font-bold text-emerald-500">{fmt(liq)}</TableCell>
                                                <TableCell className="text-right text-sm">
                                                    {meta > 0 ? (
                                                        <div className="flex flex-col items-end">
                                                            <span className="font-bold">{fmt(meta)}</span>
                                                            {metaDiariaVendas > 0 && <span className="text-xs text-muted-foreground font-normal">Diária ref.: {fmt(metaDiariaVendas)}</span>}
                                                        </div>
                                                    ) : '—'}
                                                </TableCell>
                                                <TableCell>{meta > 0 ? <ProgressBar percent={pctAting} /> : '—'}</TableCell>'''

content = content.replace('''                                        const pctAting = parseFloat(pct(Math.max(0, liq), meta))
                                        const comisR = liq > 0 ? liq * ((ate.comissao_percentual || 0) / 100) : 0
                                        
                                        return (
                                            <TableRow key={ate.atendente_id}>
                                                <TableCell className="font-semibold">{ate.nome} <div className="text-xs text-muted-foreground font-normal">{ate.cargo}</div></TableCell>
                                                <TableCell className="text-right">{fmt(ate.total_vendas)}</TableCell>
                                                <TableCell className="text-right text-rose-500">-{fmt(ate.total_devolucoes)}</TableCell>
                                                <TableCell className="text-right font-bold text-emerald-500">{fmt(liq)}</TableCell>
                                                <TableCell className="text-right text-sm">{meta > 0 ? fmt(meta) : '—'}</TableCell>
                                                <TableCell>{meta > 0 ? <ProgressBar percent={pctAting} /> : '—'}</TableCell>''', table_vendas)

# 7. Add Modal for Meta Geral
modal_loja = '''            <Modal isOpen={isMetaGeralModalOpen} onClose={() => setIsMetaGeralModalOpen(false)} title="Configurar Meta da Loja">
                <form onSubmit={handleSaveMetaGeral} className="space-y-4">
                    <div className="space-y-2">
                        <Label>Meta de Vendas da Loja (R$)</Label>
                        <Input type="number" step="0.01" min="0" value={metaGeralForm.meta_vendas} onChange={e => setMetaGeralForm({ ...metaGeralForm, meta_vendas: e.target.value })} />
                        <p className="text-xs text-muted-foreground">Valor total que a loja deve atingir no mês.</p>
                    </div>
                    <div className="space-y-2">
                        <Label>Prêmio Fixo a Pagar (R$)</Label>
                        <Input type="number" step="0.01" min="0" value={metaGeralForm.premio_fixo} onChange={e => setMetaGeralForm({ ...metaGeralForm, premio_fixo: e.target.value })} />
                        <p className="text-xs text-muted-foreground">Valor pago se a loja atingir a meta geral.</p>
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <Button variant="outline" type="button" onClick={() => setIsMetaGeralModalOpen(false)}>Cancelar</Button>
                        <Button type="submit">Salvar Meta da Loja</Button>
                    </div>
                </form>
            </Modal>

            <Modal isOpen={isModalOpen}'''

content = content.replace("            <Modal isOpen={isModalOpen}", modal_loja)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("Patched MetasVendedores.tsx")
