import re
import os

filepath = r"c:\dev\crm-loja-final\src\pages\ConferenciaEstoque.tsx"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add Categoria and suspeitos
content = content.replace(
    "interface Localizacao { id: string; nome: string; sigla?: string; localizacao_pai_nome?: string }",
    "interface Localizacao { id: string; nome: string; sigla?: string; localizacao_pai_nome?: string }\ninterface Categoria { id: string; nome: string }"
)

content = content.replace(
    "interface Resultado { ok: Produto[]; faltantes: Produto[]; excedentes: Excedente[]; resumo:",
    "interface Resultado { ok: Produto[]; faltantes: Produto[]; excedentes: Excedente[]; suspeitos?: Produto[]; resumo:"
)

# 2. Replace EtapaLocalizacao with EtapaAlvo
old_etapa_loc_match = re.search(r"// ─── etapa 1: seleção de localização ───.*?(?=\n// ─── etapa 2: leitura das peças)", content, re.DOTALL)
if old_etapa_loc_match:
    old_etapa_loc = old_etapa_loc_match.group(0)
    new_etapa_alvo = """// ─── etapa 1: seleção de alvo (localização ou categoria) ─────────────────────
function EtapaAlvo({ onSelectLoc, onSelectCat }: { onSelectLoc: (l: Localizacao) => void, onSelectCat: (c: Categoria) => void }) {
    const [aba, setAba] = useState<"loc"|"cat">("loc")
    
    // state for loc
    const [busca, setBusca] = useState("")
    const [resultsLoc, setResultsLoc] = useState<Localizacao[]>([])
    const [loadingLoc, setLoadingLoc] = useState(false)
    const [scanQR, setScanQR] = useState(false)
    const scannerRef = useRef<Html5Qrcode | null>(null)

    // state for cat
    const [buscaCat, setBuscaCat] = useState("")
    const [resultsCat, setResultsCat] = useState<Categoria[]>([])
    const [loadingCat, setLoadingCat] = useState(false)

    useEffect(() => {
        if (!busca.trim()) { setResultsLoc([]); return }
        const t = setTimeout(async () => {
            setLoadingLoc(true)
            try {
                const r = await api.get(`/api/localizacoes/?q=${encodeURIComponent(busca)}&limit=20`)
                setResultsLoc(Array.isArray(r) ? r : r?.items ?? [])
            } finally { setLoadingLoc(false) }
        }, 300)
        return () => clearTimeout(t)
    }, [busca])

    useEffect(() => {
        if (!buscaCat.trim()) { setResultsCat([]); return }
        const t = setTimeout(async () => {
            setLoadingCat(true)
            try {
                const r = await api.get(`/api/catalogo/categorias/`)
                const items = Array.isArray(r) ? r : r?.items ?? []
                const filtered = items.filter((c: any) => c.nome.toLowerCase().includes(buscaCat.toLowerCase())).slice(0,20)
                setResultsCat(filtered)
            } catch(e) { console.error(e) } finally { setLoadingCat(false) }
        }, 300)
        return () => clearTimeout(t)
    }, [buscaCat])

    const iniciarScanLoc = async () => {
        setScanQR(true)
        setTimeout(async () => {
            const scanner = new Html5Qrcode("loc-scanner")
            scannerRef.current = scanner
            await scanner.start(
                { facingMode: "environment" },
                { fps: 12, qrbox: 240 },
                async (decoded) => {
                    await scanner.stop()
                    setScanQR(false)
                    let searchQuery = decoded.trim()
                    let parentName = ""
                    if (searchQuery.includes(" > ")) {
                        const parts = searchQuery.split(" > ")
                        searchQuery = parts[parts.length - 1].trim()
                        if (parts.length > 1) {
                            parentName = parts[parts.length - 2].trim()
                        }
                    }

                    const r = await api.get(`/api/localizacoes/?q=${encodeURIComponent(searchQuery)}&limit=50`)
                    const lista = Array.isArray(r) ? r : r?.items ?? []
                    
                    let match = lista[0]
                    if (parentName && lista.length > 1) {
                        const exact = lista.find((l: any) => 
                            (l.nome === searchQuery || l.sigla === searchQuery) && 
                            l.parent_nome === parentName
                        )
                        if (exact) match = exact
                    }

                    if (match) onSelectLoc(match)
                    else setBusca(decoded)
                },
                () => {}
            )
        }, 300)
    }

    const pararScan = async () => {
        try { await scannerRef.current?.stop() } catch { /* ignore */ }
        setScanQR(false)
    }

    return (
        <div className="space-y-4">
            <div className="flex bg-muted/50 p-1 rounded-lg">
                <button className={cn("flex-1 py-1.5 text-sm font-medium rounded-md", aba === "loc" && "bg-background shadow-sm")} onClick={() => setAba("loc")}>Por Localização</button>
                <button className={cn("flex-1 py-1.5 text-sm font-medium rounded-md", aba === "cat" && "bg-background shadow-sm")} onClick={() => setAba("cat")}>Por Categoria</button>
            </div>

            {aba === "loc" ? (
                <div className="space-y-4">
                    <div className="text-center space-y-1 pb-2">
                        <MapPin className="w-10 h-10 text-primary mx-auto" />
                        <h2 className="text-xl font-bold">Selecione a Localização</h2>
                        <p className="text-sm text-muted-foreground">Escaneie o QR Code da prateleira ou pesquise</p>
                    </div>

                    {scanQR ? (
                        <div className="space-y-3">
                            <div id="loc-scanner" className="w-full rounded-xl overflow-hidden" />
                            <Button variant="outline" className="w-full" onClick={pararScan}>Cancelar</Button>
                        </div>
                    ) : (
                        <>
                            <Button className="w-full gap-2 h-12" onClick={iniciarScanLoc}>
                                <Camera className="w-5 h-5" /> Escanear QR Code da Localização
                            </Button>
                            <div className="relative">
                                <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">🔍</span>
                                <input
                                    className="w-full pl-8 pr-3 h-10 rounded-lg border border-input bg-background text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none"
                                    placeholder="Ou pesquise por nome (ex: A1, Estante 3...)"
                                    value={busca}
                                    onChange={e => setBusca(e.target.value)}
                                    autoFocus
                                />
                            </div>
                            {loadingLoc && <p className="text-center text-sm text-muted-foreground">Buscando...</p>}
                            {resultsLoc.map(l => (
                                <button
                                    key={l.id}
                                    onClick={() => onSelectLoc(l)}
                                    className="w-full flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-all text-left"
                                >
                                    <div>
                                        <p className="font-semibold text-sm">{l.sigla ? `[${l.sigla}] ` : ""}{l.nome}</p>
                                        {l.localizacao_pai_nome && <p className="text-xs text-muted-foreground">{l.localizacao_pai_nome}</p>}
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                </button>
                            ))}
                        </>
                    )}
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="text-center space-y-1 pb-2">
                        <Package className="w-10 h-10 text-primary mx-auto" />
                        <h2 className="text-xl font-bold">Selecione a Categoria</h2>
                        <p className="text-sm text-muted-foreground">Pesquise a categoria para realizar a conferência total</p>
                    </div>
                    <div className="relative">
                        <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">🔍</span>
                        <input
                            className="w-full pl-8 pr-3 h-10 rounded-lg border border-input bg-background text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none"
                            placeholder="Pesquise por nome (ex: Farol, Para-choque...)"
                            value={buscaCat}
                            onChange={e => setBuscaCat(e.target.value)}
                            autoFocus
                        />
                    </div>
                    {loadingCat && <p className="text-center text-sm text-muted-foreground">Buscando...</p>}
                    {resultsCat.map(c => (
                        <button
                            key={c.id}
                            onClick={() => onSelectCat(c)}
                            className="w-full flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-all text-left"
                        >
                            <p className="font-semibold text-sm">{c.nome}</p>
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
"""
    content = content.replace(old_etapa_loc, new_etapa_alvo)

# 3. EtapaLeitura parameters
content = content.replace(
    "function EtapaLeitura({\n    localizacao, codigos, setCodigos, onFinalizar, produtosEsperados\n}: {\n    localizacao: Localizacao\n",
    "function EtapaLeitura({\n    alvoNome, codigos, setCodigos, onFinalizar, produtosEsperados\n}: {\n    alvoNome: string\n"
)
content = content.replace(
    """<p className="font-bold text-base">{localizacao.sigla ? `[${localizacao.sigla}] ` : ""}{localizacao.nome}</p>""",
    """<p className="font-bold text-base">{alvoNome}</p>"""
)


# 4. EtapaResultado parameters
content = content.replace(
    "function EtapaResultado({\n    resultado: initialResultado, localizacao, onReiniciar\n}: {\n    resultado: Resultado\n    localizacao: Localizacao\n    onReiniciar: () => void\n}) {",
    "function EtapaResultado({\n    resultado: initialResultado, alvoNome, onReiniciar\n}: {\n    resultado: Resultado\n    alvoNome: string\n    onReiniciar: () => void\n}) {"
)
content = content.replace(
    """<p className="font-bold text-base">{localizacao.nome}</p>""",
    """<p className="font-bold text-base">{alvoNome}</p>"""
)
content = content.replace(
    "nova_localizacao_id: localizacao.id,",
    "// nova_localizacao_id removido para suportar categorias sem mudar loc"
)
content = content.replace(
    "nova_localizacao: localizacao.nome,",
    ""
)
content = content.replace(
    "`Localização: ${localizacao.nome}`",
    "`Alvo: ${alvoNome}`"
)
content = content.replace(
    "conferencia_${localizacao.sigla || localizacao.nome}_${new Date()",
    "conferencia_${alvoNome}_${new Date()"
)

# Insert suspeitos visual block
suspeitos_block = """
            {/* suspeitos (apenas em conferência por categoria) */}
            {resultado.suspeitos && resultado.suspeitos.length > 0 && (
                <div className="space-y-2 mt-4">
                    <p className="text-sm font-bold text-blue-600 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4" /> Suspeitos ({resultado.suspeitos.length})
                    </p>
                    <p className="text-xs text-muted-foreground">Produtos com nome similar e saldo positivo, mas fora desta categoria.</p>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                        {resultado.suspeitos.map(p => (
                            <div key={p.id} className="p-2 rounded-lg bg-blue-500/5 border border-blue-200 dark:border-blue-900 space-y-2">
                                <div className="flex items-center gap-3">
                                    {p.imagem_url
                                        ? <img src={p.imagem_url} className="w-8 h-8 rounded object-cover shrink-0" />
                                        : <Package className="w-8 h-8 text-muted-foreground shrink-0" />}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-bold truncate">{p.nome}</p>
                                        <p className="text-[10px] text-muted-foreground font-mono">
                                            {p.sku || p.codigo_etiqueta} | {p.localizacao || "Sem loc"}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-1 pt-1">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-[10px] flex-1 gap-1 px-1"
                                        onClick={() => executarAcao(p.id, "ajustar_estoque", { nova_quantidade: 0 })}
                                        disabled={actionLoading === `${p.id}-ajustar_estoque`}
                                    >
                                        <MapPinOff className="w-3 h-3" /> Zerar Estoque
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-[10px] flex-1 gap-1 px-1 text-destructive hover:text-destructive"
                                        onClick={() => confirm(`Deseja inativar o produto ${p.nome}?`) && executarAcao(p.id, "inativar")}
                                        disabled={actionLoading === `${p.id}-inativar`}
                                    >
                                        <Trash2 className="w-3 h-3" /> Inativar
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
"""
content = content.replace("{/* ok (colapsado) */}", suspeitos_block + "\n            {/* ok (colapsado) */}")


# 5. ConferenciaEstoque main component
old_main = re.search(r"export function ConferenciaEstoque\(\) \{.*", content, re.DOTALL)
if old_main:
    new_main = """export function ConferenciaEstoque() {
    const [etapa, setEtapa] = useState<Etapa>("localizacao")
    const [localizacao, setLocalizacao] = useState<Localizacao | null>(null)
    const [categoria, setCategoria] = useState<Categoria | null>(null)
    const [codigos, setCodigos] = useState<string[]>([])
    const [resultado, setResultado] = useState<Resultado | null>(null)
    const [conferindo, setConferindo] = useState(false)
    const [produtosEsperados, setProdutosEsperados] = useState<Produto[]>([])
    const [loadingEsperados, setLoadingEsperados] = useState(false)

    const handleSelectLoc = async (l: Localizacao) => {
        setLocalizacao(l)
        setCategoria(null)
        setCodigos([])
        setResultado(null)
        setEtapa("leitura")
        
        setLoadingEsperados(true)
        try {
            const r = await api.get(`/api/estoque/produtos/?localizacao_id=${l.id}&ativo=true&estoque=positivo&limit=2000&painel=true`)
            setProdutosEsperados(Array.isArray(r) ? r : r?.items ?? [])
        } catch (e) {
            console.error("Erro ao carregar produtos:", e)
        } finally { setLoadingEsperados(false) }
    }

    const handleSelectCat = async (c: Categoria) => {
        setCategoria(c)
        setLocalizacao(null)
        setCodigos([])
        setResultado(null)
        setEtapa("leitura")
        
        setLoadingEsperados(true)
        try {
            const r = await api.get(`/api/estoque/produtos/?categoria_id=${c.id}&ativo=true&estoque=positivo&limit=2000&painel=true`)
            setProdutosEsperados(Array.isArray(r) ? r : r?.items ?? [])
        } catch (e) {
            console.error("Erro ao carregar produtos:", e)
        } finally { setLoadingEsperados(false) }
    }

    const handleFinalizar = async () => {
        if ((!localizacao && !categoria) || codigos.length === 0) return
        setConferindo(true)
        try {
            let res: Resultado;
            if (localizacao) {
                const r = await authFetch("/api/conferencia/comparar", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id_localizacao: localizacao.id, codigos_lidos: codigos }),
                })
                if (!r.ok) throw new Error("Erro na conferência")
                res = await r.json()
            } else if (categoria) {
                const ok: Produto[] = []
                const faltantes: Produto[] = []
                const excedentes: Excedente[] = []
                
                produtosEsperados.forEach(p => {
                    if (codigos.includes(p.sku) || codigos.includes(p.codigo_etiqueta) || codigos.includes(p.codigo_barras)) {
                        ok.push(p)
                    } else {
                        faltantes.push(p)
                    }
                })
                
                for (const cod of codigos) {
                    if (!produtosEsperados.some(p => p.sku === cod || p.codigo_etiqueta === cod || p.codigo_barras === cod)) {
                        let prodInfo = null;
                        try {
                            const pRes = await api.get(`/api/estoque/produtos/?q=${cod}&limit=1`)
                            const items = Array.isArray(pRes) ? pRes : pRes?.items ?? []
                            if (items.length > 0) prodInfo = items[0]
                        } catch(e){}
                        excedentes.push({
                            codigo_lido: cod,
                            produto: prodInfo,
                            motivo: prodInfo ? "Produto fora da categoria" : "Código não encontrado"
                        })
                    }
                }
                
                res = {
                    ok, faltantes, excedentes,
                    resumo: {
                        total_sistema: produtosEsperados.length,
                        total_lidos: codigos.length,
                        ok: ok.length, faltantes: faltantes.length, excedentes: excedentes.length,
                        percentual_conferido: produtosEsperados.length > 0 ? Math.round((ok.length / produtosEsperados.length) * 100 * 10) / 10 : 0
                    }
                }
                
                // Buscar suspeitos para categorias
                try {
                    let abbrevs = categoria.nome.toLowerCase()
                    abbrevs = abbrevs.replace(/\\besq\\b/gi, 'le').replace(/\\bdir\\b/gi, 'ld')
                    const r = await api.get(`/api/estoque/produtos/?q=${encodeURIComponent(abbrevs)}&estoque=positivo&limit=50&ativo=true`)
                    const similares = Array.isArray(r) ? r : r?.items ?? []
                    res.suspeitos = similares.filter((s: any) => s.categoria_id !== categoria.id && !codigos.includes(s.sku) && !codigos.includes(s.codigo_etiqueta))
                } catch(e){}
            } else {
                return;
            }
            
            setResultado(res)
            setEtapa("resultado")
        } catch (e: any) {
            alert(e.message || "Erro ao conferir")
        } finally { setConferindo(false) }
    }

    const reiniciar = () => {
        setEtapa("localizacao")
        setLocalizacao(null)
        setCategoria(null)
        setCodigos([])
        setResultado(null)
    }

    const etapas = [
        { id: "localizacao", label: "Alvo" },
        { id: "leitura", label: "Leitura" },
        { id: "resultado", label: "Resultado" },
    ]
    const etapaIdx = etapas.findIndex(e => e.id === etapa)
    const alvoNome = localizacao ? (localizacao.sigla ? `[${localizacao.sigla}] ${localizacao.nome}` : localizacao.nome) : categoria?.nome || "";

    return (
        <div className="w-full max-w-lg mx-auto space-y-6 pb-20">
            <div className="flex items-center gap-2 mb-4">
                {etapas.map((e, i) => (
                    <div key={e.id} className="flex-1 flex flex-col gap-1">
                        <div className={cn("h-1.5 rounded-full transition-all", i <= etapaIdx ? "bg-primary" : "bg-muted")} />
                        <span className={cn("text-[10px] font-bold uppercase", i <= etapaIdx ? "text-primary" : "text-muted-foreground")}>{e.label}</span>
                    </div>
                ))}
            </div>

            <Card className="shadow-none border-none sm:border-solid bg-transparent sm:bg-card">
                <CardContent className="p-0 sm:p-6">
                    {etapa === "localizacao" ? (
                        <EtapaAlvo onSelectLoc={handleSelectLoc} onSelectCat={handleSelectCat} />
                    ) : etapa === "leitura" && (localizacao || categoria) ? (
                        <div className="space-y-4">
                            {loadingEsperados && (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
                                    <Loader2 className="w-3 h-3 animate-spin" /> Carregando produtos...
                                </div>
                            )}
                            <EtapaLeitura
                                alvoNome={alvoNome}
                                codigos={codigos}
                                setCodigos={setCodigos}
                                onFinalizar={handleFinalizar}
                                produtosEsperados={produtosEsperados}
                            />
                        </div>
                    ) : etapa === "resultado" && resultado && (localizacao || categoria) ? (
                        <EtapaResultado
                            resultado={resultado}
                            alvoNome={alvoNome}
                            onReiniciar={reiniciar}
                        />
                    ) : null}
                </CardContent>
            </Card>
        </div>
    )
}"""
    content = content.replace(old_main.group(0), new_main)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)
