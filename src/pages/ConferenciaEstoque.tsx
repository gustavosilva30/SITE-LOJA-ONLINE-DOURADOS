import { useCallback, useEffect, useRef, useState } from "react"
import { Html5Qrcode } from "html5-qrcode"
import { createWorker } from "tesseract.js"
import {
    CheckCircle, XCircle, AlertTriangle, Camera, Keyboard,
    ArrowRight, RotateCcw, Download, MapPin,
    Package, Loader2, ScanLine, ChevronRight, Check,
    Trash2, Edit3, MapPinOff, Plus, LayoutList, Flag,
    ChevronDown, ChevronUp, ArrowLeft
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { api } from "@/lib/api"
import { getApiBaseUrl } from "@/lib/apiBase"
import { getAuthToken } from "@/lib/auth"
import { cn } from "@/lib/utils"
import { thumbUrl, imgFallbackToOriginal } from "@/lib/thumbUrl"

// ─── tipos ───────────────────────────────────────────────────────────────────
interface Localizacao { id: string; nome: string; sigla?: string; localizacao_pai_nome?: string }
interface Categoria { id: string; nome: string }
interface Produto {
    id: string; nome: string; sku: string; codigo_etiqueta: string
    codigo_barras: string; localizacao: string; localizacao_id?: string
    estoque_atual: number; imagem_url: string; imagem_urls?: any
}
interface Excedente { codigo_lido: string; produto: Produto | null; motivo: string }

// Resultado para conferência por localização simples
interface ResultadoSimples {
    ok: Produto[]
    faltantes: Produto[]
    excedentes: Excedente[]
    suspeitos?: Produto[]
    resumo: { total_sistema: number; total_lidos: number; ok: number; faltantes: number; excedentes: number; percentual_conferido: number }
}

// Resultado de uma localização conferida dentro de uma categoria
interface ResultadoLocalizacao {
    corretos: Produto[]
    faltantes: Produto[]
    excedentes: Excedente[]
    resumo: { total_sistema: number; total_lidos: number; ok: number; faltantes: number; excedentes: number; percentual_conferido: number }
}

interface ConferenciaLocalizacao {
    localizacao: Localizacao
    codigosLidos: string[]
    resultado: ResultadoLocalizacao
    salvaEm: string
}

interface SessaoCategoria {
    categoria: Categoria
    localizacoesConferidas: ConferenciaLocalizacao[]
    todosProdutos: Produto[] // todos os produtos da categoria (carregados no início)
    iniciadaEm: string
}

// Etapas do fluxo
type EtapaSimples = "alvo" | "leitura" | "resultado"
type EtapaCat = "cat_select" | "loc_select" | "leitura" | "resultado" | "panorama"
type ModoConferencia = "simples" | "categoria"

// ─── helpers ─────────────────────────────────────────────────────────────────
const normalizeCode = (c?: string | null) => {
    if (!c) return ""
    let cod = c.trim().toUpperCase()
    if (cod.startsWith("0")) cod = cod.replace(/^0+/, "") || "0"
    return cod
}

const getProdImg = (p: any): string => {
    if (!p) return ""
    if (p.imagem_url) return p.imagem_url
    if (p.imagem_urls) {
        if (Array.isArray(p.imagem_urls) && p.imagem_urls.length > 0) return p.imagem_urls[0]
        if (typeof p.imagem_urls === "string") {
            try { const arr = JSON.parse(p.imagem_urls); if (Array.isArray(arr) && arr.length > 0) return arr[0] } catch (e) { }
        }
    }
    return ""
}

const authFetch = (path: string, opts: RequestInit = {}) =>
    fetch(`${getApiBaseUrl()}${path}`, {
        ...opts,
        headers: { Authorization: `Bearer ${getAuthToken()}`, ...(opts.headers || {}) },
    })

const locNome = (l: Localizacao) => l.sigla ? `[${l.sigla}] ${l.nome}` : l.nome

// ─── useOCR ──────────────────────────────────────────────────────────────────
function useOCR() {
    const workerRef = useRef<Awaited<ReturnType<typeof createWorker>> | null>(null)
    const [ocrPronto, setOcrPronto] = useState(false)

    useEffect(() => {
        let mounted = true
        ;(async () => {
            try {
                const w = await createWorker("por+eng", 1, { logger: () => {} })
                await w.setParameters({ tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-." })
                if (mounted) { workerRef.current = w; setOcrPronto(true) }
            } catch (error) { console.error("Erro ao inicializar Tesseract:", error) }
        })()
        return () => { mounted = false; workerRef.current?.terminate() }
    }, [])

    const reconhecer = useCallback(async (imageData: string): Promise<string[]> => {
        if (!workerRef.current) return []
        try {
            const { data } = await workerRef.current.recognize(imageData)
            return data.text.split(/\s+/).filter(t => /^[A-Z0-9\-\.]{3,}$/.test(t.trim()))
        } catch { return [] }
    }, [])

    return { ocrPronto, reconhecer }
}

// ─── ProdutoCard ─────────────────────────────────────────────────────────────
function ProdutoCard({ produto, status, qtdLida, qtdEsperada, compact = false }: {
    produto: Produto
    status?: "ok" | "faltante" | "excedente" | "neutro"
    qtdLida?: number
    qtdEsperada?: number
    compact?: boolean
}) {
    const img = getProdImg(produto)
    const bgClass = status === "ok" ? "bg-green-500/10 border-green-200 dark:border-green-900"
        : status === "faltante" ? "bg-red-500/5 border-red-200 dark:border-red-900"
        : status === "excedente" ? "bg-amber-500/5 border-amber-200 dark:border-amber-900"
        : "bg-muted/10 border-border"

    return (
        <div className={cn("flex items-center gap-3 p-2 rounded-lg border", bgClass)}>
            {img ? (
                <img
                    src={thumbUrl(img)}
                    alt={produto.nome}
                    className={cn("rounded-md object-cover shrink-0", compact ? "w-8 h-8" : "w-11 h-11")}
                    onError={(e) => {
                        if (e.currentTarget.dataset.fallback !== "done") {
                            imgFallbackToOriginal(img)(e)
                        } else {
                            e.currentTarget.style.display = "none"
                            e.currentTarget.nextElementSibling?.classList.remove("hidden")
                        }
                    }}
                />
            ) : null}
            <div className={cn("rounded-md bg-muted flex items-center justify-center shrink-0", img && "hidden", compact ? "w-8 h-8" : "w-11 h-11")}>
                <Package className={cn("text-muted-foreground", compact ? "w-4 h-4" : "w-5 h-5")} />
            </div>
            <div className="flex-1 min-w-0">
                <p className={cn("font-bold truncate", compact ? "text-xs" : "text-sm",
                    status === "ok" && "text-green-700 dark:text-green-400")}>{produto.nome}</p>
                <p className="text-[10px] text-muted-foreground font-mono">{produto.sku || produto.codigo_etiqueta}</p>
            </div>
            {qtdLida !== undefined && qtdEsperada !== undefined && (
                <div className="shrink-0 text-right">
                    <span className={cn("font-black text-sm",
                        status === "ok" ? "text-green-600"
                        : qtdLida > 0 ? "text-amber-600"
                        : "text-muted-foreground")}>
                        {qtdLida}/{qtdEsperada}
                    </span>
                    {status === "ok" && <CheckCircle className="w-4 h-4 text-green-500 ml-auto mt-0.5" />}
                </div>
            )}
        </div>
    )
}

// ─── EtapaAlvo (Por Localização — fluxo simples) ──────────────────────────────
function EtapaAlvo({ onSelectLoc, onSelectCat }: {
    onSelectLoc: (l: Localizacao) => void
    onSelectCat: (c: Categoria) => void
}) {
    const [aba, setAba] = useState<"loc" | "cat">("loc")
    const [busca, setBusca] = useState("")
    const [resultsLoc, setResultsLoc] = useState<Localizacao[]>([])
    const [loadingLoc, setLoadingLoc] = useState(false)
    const [scanQR, setScanQR] = useState(false)
    const scannerRef = useRef<Html5Qrcode | null>(null)

    const [buscaCat, setBuscaCat] = useState("")
    const [resultsCat, setResultsCat] = useState<Categoria[]>([])
    const [loadingCat, setLoadingCat] = useState(false)

    useEffect(() => {
        if (!busca.trim()) { setResultsLoc([]); return }
        const t = setTimeout(async () => {
            setLoadingLoc(true)
            try {
                const r = await api.get(`/api/localizacoes/?q=${encodeURIComponent(busca)}&limit=200`)
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
                const r = await api.get(`/api/configuracoes/categorias`)
                const items = Array.isArray(r) ? r : r?.items ?? []
                setResultsCat(items.filter((c: any) => c.nome.toLowerCase().includes(buscaCat.toLowerCase())).slice(0, 20))
            } catch (e) { console.error(e) } finally { setLoadingCat(false) }
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
                        if (parts.length > 1) parentName = parts[parts.length - 2].trim()
                    }
                    const r = await api.get(`/api/localizacoes/?q=${encodeURIComponent(searchQuery)}&limit=200`)
                    const lista = Array.isArray(r) ? r : r?.items ?? []
                    let match = lista[0]
                    if (parentName && lista.length > 1) {
                        const exact = lista.find((l: any) => (l.nome === searchQuery || l.sigla === searchQuery) && l.parent_nome === parentName)
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
        try { await scannerRef.current?.stop() } catch { }
        setScanQR(false)
    }

    return (
        <div className="space-y-4">
            <div className="flex bg-muted/50 p-1 rounded-lg">
                <button className={cn("flex-1 py-1.5 text-sm font-medium rounded-md transition-all", aba === "loc" && "bg-background shadow-sm")} onClick={() => setAba("loc")}>Por Localização</button>
                <button className={cn("flex-1 py-1.5 text-sm font-medium rounded-md transition-all", aba === "cat" && "bg-background shadow-sm")} onClick={() => setAba("cat")}>Por Categoria</button>
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
                                <button key={l.id} onClick={() => onSelectLoc(l)}
                                    className="w-full flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-all text-left">
                                    <div>
                                        <p className="font-semibold text-sm">{locNome(l)}</p>
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
                        <p className="text-sm text-muted-foreground">Conferência por localização dentro da categoria</p>
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
                        <button key={c.id} onClick={() => onSelectCat(c)}
                            className="w-full flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-all text-left">
                            <p className="font-semibold text-sm">{c.nome}</p>
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

// ─── EtapaSelecaoLocalizacaoCat ───────────────────────────────────────────────
function EtapaSelecaoLocalizacaoCat({
    sessao, onSelectLoc, onEncerrarCategoria, carregando
}: {
    sessao: SessaoCategoria
    onSelectLoc: (l: Localizacao) => void
    onEncerrarCategoria: () => void
    carregando: boolean
}) {
    const [busca, setBusca] = useState("")
    const [resultsLoc, setResultsLoc] = useState<Localizacao[]>([])
    const [loadingLoc, setLoadingLoc] = useState(false)
    const [scanQR, setScanQR] = useState(false)
    const scannerRef = useRef<Html5Qrcode | null>(null)

    // Agrupar produtos por localização para mostrar as locs disponíveis
    const locsDisponiveisMap = new Map<string, { loc: Localizacao; qtd: number }>()
    sessao.todosProdutos.forEach(p => {
        if (p.localizacao_id && p.localizacao) {
            if (!locsDisponiveisMap.has(p.localizacao_id)) {
                locsDisponiveisMap.set(p.localizacao_id, {
                    loc: { id: p.localizacao_id, nome: p.localizacao },
                    qtd: 0
                })
            }
            locsDisponiveisMap.get(p.localizacao_id)!.qtd++
        }
    })
    const locsDisponiveis = Array.from(locsDisponiveisMap.values())
        .sort((a, b) => a.loc.nome.localeCompare(b.loc.nome))

    const idsConferidas = new Set(sessao.localizacoesConferidas.map(l => l.localizacao.id))

    const locsNaoConferidas = locsDisponiveis.filter(l => !idsConferidas.has(l.loc.id))
    const locsConferidas = locsDisponiveis.filter(l => idsConferidas.has(l.loc.id))

    // Produtos sem localização
    const semLoc = sessao.todosProdutos.filter(p => !p.localizacao_id)

    useEffect(() => {
        if (!busca.trim()) { setResultsLoc([]); return }
        const t = setTimeout(async () => {
            setLoadingLoc(true)
            try {
                const r = await api.get(`/api/localizacoes/?q=${encodeURIComponent(busca)}&limit=200`)
                setResultsLoc(Array.isArray(r) ? r : r?.items ?? [])
            } finally { setLoadingLoc(false) }
        }, 300)
        return () => clearTimeout(t)
    }, [busca])

    const iniciarScan = async () => {
        setScanQR(true)
        setTimeout(async () => {
            const scanner = new Html5Qrcode("cat-loc-scanner")
            scannerRef.current = scanner
            await scanner.start(
                { facingMode: "environment" },
                { fps: 12, qrbox: 240 },
                async (decoded) => {
                    await scanner.stop()
                    setScanQR(false)
                    let searchQuery = decoded.trim()
                    if (searchQuery.includes(" > ")) {
                        const parts = searchQuery.split(" > ")
                        searchQuery = parts[parts.length - 1].trim()
                    }
                    const r = await api.get(`/api/localizacoes/?q=${encodeURIComponent(searchQuery)}&limit=200`)
                    const lista = Array.isArray(r) ? r : r?.items ?? []
                    if (lista[0]) onSelectLoc(lista[0])
                    else setBusca(decoded)
                },
                () => {}
            )
        }, 300)
    }

    const pararScan = async () => {
        try { await scannerRef.current?.stop() } catch { }
        setScanQR(false)
    }

    const totalConferidas = sessao.localizacoesConferidas.length
    const totalProdConferidos = sessao.localizacoesConferidas.reduce((acc, l) => acc + l.resultado.corretos.length, 0)

    return (
        <div className="space-y-5">
            {/* Header da sessão */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-xs text-muted-foreground font-bold uppercase">Conferindo Categoria</p>
                        <p className="font-bold text-base">{sessao.categoria.nome}</p>
                    </div>
                    <Badge variant="outline" className="text-sm font-bold px-3">
                        {sessao.todosProdutos.length} produtos
                    </Badge>
                </div>
                {totalConferidas > 0 && (
                    <div className="flex items-center gap-3 pt-1 border-t border-primary/10">
                        <div className="text-center">
                            <p className="text-lg font-black text-green-600">{totalConferidas}</p>
                            <p className="text-[10px] font-semibold text-green-700">Locs OK</p>
                        </div>
                        <div className="text-center">
                            <p className="text-lg font-black text-primary">{totalProdConferidos}</p>
                            <p className="text-[10px] font-semibold text-muted-foreground">Prods OK</p>
                        </div>
                        <div className="flex-1 space-y-1">
                            <div className="flex flex-wrap gap-1">
                                {sessao.localizacoesConferidas.map(l => (
                                    <Badge key={l.localizacao.id} className="text-[10px] bg-green-500/10 text-green-700 border-green-200 dark:text-green-400 dark:border-green-800">
                                        ✅ {locNome(l.localizacao)}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Seleção de localização */}
            <div className="space-y-3">
                <p className="text-sm font-bold flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-primary" /> Selecione a próxima localização
                </p>

                {carregando ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground animate-pulse">
                        <Loader2 className="w-4 h-4 animate-spin" /> Carregando produtos da categoria...
                    </div>
                ) : (
                    <>
                        {/* Localizações com produtos desta categoria */}
                        {locsNaoConferidas.length > 0 && (
                            <div className="space-y-1">
                                <p className="text-xs font-semibold text-muted-foreground uppercase">Localizações desta categoria ({locsNaoConferidas.length})</p>
                                <div className="space-y-1 max-h-56 overflow-y-auto">
                                    {locsNaoConferidas.map(({ loc, qtd }) => (
                                        <button key={loc.id} onClick={() => onSelectLoc(loc)}
                                            className="w-full flex items-center justify-between p-2.5 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-all text-left">
                                            <div>
                                                <p className="font-semibold text-sm">{locNome(loc)}</p>
                                                <p className="text-[10px] text-muted-foreground">{qtd} produto{qtd !== 1 ? "s" : ""}</p>
                                            </div>
                                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Já conferidas */}
                        {locsConferidas.length > 0 && (
                            <div className="space-y-1">
                                <p className="text-xs font-semibold text-muted-foreground uppercase">Já conferidas</p>
                                {locsConferidas.map(({ loc }) => (
                                    <button key={loc.id} onClick={() => onSelectLoc(loc)}
                                        className="w-full flex items-center justify-between p-2.5 rounded-lg border border-green-200 dark:border-green-900 bg-green-500/5 hover:bg-green-500/10 transition-all text-left">
                                        <div>
                                            <p className="font-semibold text-sm text-green-700 dark:text-green-400">✅ {locNome(loc)}</p>
                                            <p className="text-[10px] text-muted-foreground">Conferida — clique para reabrir</p>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                    </button>
                                ))}
                            </div>
                        )}

                        {semLoc.length > 0 && (
                            <div className="p-2.5 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-500/5">
                                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                                    <AlertTriangle className="w-3.5 h-3.5" /> {semLoc.length} produto{semLoc.length !== 1 ? "s" : ""} sem localização definida
                                </p>
                            </div>
                        )}
                    </>
                )}

                {/* Scanner QR */}
                {scanQR ? (
                    <div className="space-y-2">
                        <div id="cat-loc-scanner" className="w-full rounded-xl overflow-hidden" />
                        <Button variant="outline" className="w-full" onClick={pararScan}>Cancelar Scanner</Button>
                    </div>
                ) : (
                    <Button variant="outline" className="w-full gap-2" onClick={iniciarScan}>
                        <Camera className="w-4 h-4" /> Escanear QR de outra localização
                    </Button>
                )}

                {/* Busca manual */}
                <div className="relative">
                    <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">🔍</span>
                    <input
                        className="w-full pl-8 pr-3 h-10 rounded-lg border border-input bg-background text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none"
                        placeholder="Ou pesquise outra localização..."
                        value={busca}
                        onChange={e => setBusca(e.target.value)}
                    />
                </div>
                {loadingLoc && <p className="text-center text-sm text-muted-foreground">Buscando...</p>}
                {resultsLoc.map(l => (
                    <button key={l.id} onClick={() => onSelectLoc(l)}
                        className="w-full flex items-center justify-between p-2.5 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-all text-left">
                        <div>
                            <p className="font-semibold text-sm">{locNome(l)}</p>
                            {l.localizacao_pai_nome && <p className="text-xs text-muted-foreground">{l.localizacao_pai_nome}</p>}
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </button>
                ))}
            </div>

            {/* Encerrar */}
            {totalConferidas > 0 && (
                <div className="pt-2 border-t border-border">
                    <Button
                        variant="default"
                        className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white"
                        onClick={onEncerrarCategoria}
                    >
                        <Flag className="w-4 h-4" /> Encerrar categoria e ver panorama
                    </Button>
                </div>
            )}
        </div>
    )
}

// ─── EtapaLeitura (reutilizada pelos dois fluxos) ─────────────────────────────
function EtapaLeitura({
    alvoNome, codigos, setCodigos, onFinalizar, produtosEsperados, finalizando
}: {
    alvoNome: string
    codigos: string[]
    setCodigos: (c: string[] | ((prev: string[]) => string[])) => void
    onFinalizar: () => void
    produtosEsperados: Produto[]
    finalizando?: boolean
}) {
    const [modo, setModo] = useState<"qr" | "ocr" | "manual">("qr")
    const [scanning, setScanning] = useState(false)
    const [ocrProcessando, setOcrProcessando] = useState(false)
    const [manualInput, setManualInput] = useState("")
    const [ultimoLido, setUltimoLido] = useState<string | null>(null)
    const [listExpanded, setListExpanded] = useState(false)
    const scannerRef = useRef<Html5Qrcode | null>(null)
    const videoRef = useRef<HTMLVideoElement | null>(null)
    const streamRef = useRef<MediaStream | null>(null)
    const { ocrPronto, reconhecer } = useOCR()

    const adicionarCodigo = useCallback((cod: string) => {
        let c = cod.trim().toUpperCase()
        if (c.startsWith("0")) c = c.replace(/^0+/, "") || "0"
        if (!c) return
        setUltimoLido(c)
        setCodigos(prev => [...prev, c])
    }, [setCodigos])

    const iniciarQR = async () => {
        setScanning(true)
        setTimeout(async () => {
            const scanner = new Html5Qrcode("peca-scanner")
            scannerRef.current = scanner
            try {
                await scanner.start(
                    { facingMode: "environment" },
                    { fps: 15, qrbox: 260 },
                    (decoded) => { adicionarCodigo(decoded) },
                    () => {}
                )
            } catch { setScanning(false) }
        }, 200)
    }

    const pararQR = async () => {
        try { await scannerRef.current?.stop() } catch { }
        setScanning(false)
    }

    const iniciarOCR = async () => {
        setModo("ocr")
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
    }

    const capturarOCR = async () => {
        if (!videoRef.current || !ocrPronto) return
        setOcrProcessando(true)
        try {
            const canvas = document.createElement("canvas")
            canvas.width = videoRef.current.videoWidth
            canvas.height = videoRef.current.videoHeight
            canvas.getContext("2d")!.drawImage(videoRef.current, 0, 0)
            const dataUrl = canvas.toDataURL("image/png")
            const tokens = await reconhecer(dataUrl)
            let foundCode: string | null = null
            if (tokens.length > 0) {
                for (const t of tokens) {
                    if (produtosEsperados?.some(p => p.sku === t || p.codigo_etiqueta === t || p.codigo_barras === t)) {
                        foundCode = t; break
                    }
                }
                if (!foundCode) {
                    const numericos = tokens.filter(t => /^\d+$/.test(t))
                    if (numericos.length > 0) foundCode = numericos.sort((a, b) => b.length - a.length)[0]
                    else {
                        const comNumeros = tokens.filter(t => /\d/.test(t))
                        foundCode = comNumeros.length > 0 ? comNumeros[0] : tokens[0]
                    }
                }
            }
            if (foundCode) adicionarCodigo(foundCode)
            else alert("Não foi possível reconhecer o código. Aproxime mais ou use a digitação manual.")
        } catch (error) {
            console.error("Erro ao capturar OCR:", error)
            alert("Ocorreu um erro ao processar a imagem. Tente novamente.")
        } finally { setOcrProcessando(false) }
    }

    const pararOCR = () => {
        streamRef.current?.getTracks().forEach(t => t.stop())
        streamRef.current = null
        setModo("qr")
    }

    useEffect(() => () => {
        scannerRef.current?.stop().catch(() => {})
        streamRef.current?.getTracks().forEach(t => t.stop())
    }, [])

    const adicionarManual = () => {
        if (!manualInput.trim()) return
        const codigos = manualInput.split(/[\s,;]+/).filter(Boolean)
        codigos.forEach(c => adicionarCodigo(c))
        setManualInput("")
    }

    // Progresso em tempo real
    const totalEsperados = produtosEsperados.length
    const conferidos = produtosEsperados.filter(p => {
        const qtdEsperada = Number(p.estoque_atual) || 1
        const nSku = normalizeCode(p.sku)
        const nEti = normalizeCode(p.codigo_etiqueta)
        const nBar = normalizeCode(p.codigo_barras)
        const qtdLida = codigos.filter(c => c === nSku || (nEti && c === nEti) || (nBar && c === nBar)).length
        return qtdLida >= qtdEsperada
    }).length

    return (
        <div className="space-y-4">
            {/* Cabeçalho */}
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-xs text-muted-foreground uppercase font-bold">Conferindo</p>
                    <p className="font-bold text-base">{alvoNome}</p>
                </div>
                <div className="text-right">
                    <Badge variant="outline" className="text-lg font-black px-3 py-1">{codigos.length}</Badge>
                    {totalEsperados > 0 && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                            {conferidos}/{totalEsperados} prods
                        </p>
                    )}
                </div>
            </div>

            {/* Barra de progresso */}
            {totalEsperados > 0 && (
                <div className="space-y-1">
                    <div className="w-full bg-muted rounded-full h-2">
                        <div
                            className="h-2 rounded-full bg-green-500 transition-all"
                            style={{ width: `${Math.min(100, (conferidos / totalEsperados) * 100)}%` }}
                        />
                    </div>
                    <p className="text-[10px] text-muted-foreground text-right">{Math.round((conferidos / totalEsperados) * 100)}% dos produtos desta localização</p>
                </div>
            )}

            {/* Modos */}
            <div className="flex gap-2">
                {[
                    { id: "qr", label: "QR Code", icon: ScanLine },
                    { id: "ocr", label: "Etiqueta Num.", icon: Camera },
                    { id: "manual", label: "Digitar SKU", icon: Keyboard },
                ].map(({ id, label, icon: Icon }) => (
                    <button key={id}
                        onClick={() => {
                            pararQR(); pararOCR()
                            if (id === "ocr") iniciarOCR()
                            else setModo(id as any)
                        }}
                        className={cn(
                            "flex-1 flex flex-col items-center gap-1 p-2 rounded-lg border text-xs font-semibold transition-all",
                            modo === id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
                        )}>
                        <Icon className="w-4 h-4" /> {label}
                    </button>
                ))}
            </div>

            {/* QR */}
            {modo === "qr" && (
                <div className="space-y-3">
                    <div id="peca-scanner" className={cn("w-full rounded-xl overflow-hidden", !scanning && "hidden")} />
                    {!scanning
                        ? <Button className="w-full gap-2 h-12" onClick={iniciarQR}><ScanLine className="w-5 h-5" /> Iniciar Scanner QR</Button>
                        : <Button variant="outline" className="w-full" onClick={pararQR}>Pausar scanner</Button>}
                    {ultimoLido && (
                        <div className="flex items-center gap-2 p-2 bg-green-500/10 rounded-lg text-sm text-green-700 dark:text-green-400">
                            <Check className="w-4 h-4 shrink-0" /> <span className="font-mono font-bold">{ultimoLido}</span> adicionado
                        </div>
                    )}
                </div>
            )}

            {/* OCR */}
            {modo === "ocr" && (
                <div className="space-y-3">
                    <video ref={videoRef} autoPlay playsInline className="w-full rounded-xl bg-black" style={{ maxHeight: 260 }} />
                    <div className="flex gap-2">
                        <Button className="flex-1 gap-2" onClick={capturarOCR} disabled={!ocrPronto || ocrProcessando}>
                            {ocrProcessando ? <><Loader2 className="w-4 h-4 animate-spin" /> Reconhecendo...</> : <><Camera className="w-4 h-4" /> Capturar Etiqueta</>}
                        </Button>
                        <Button variant="outline" onClick={pararOCR}>Cancelar</Button>
                    </div>
                    {!ocrPronto && <p className="text-xs text-center text-muted-foreground"><Loader2 className="w-3 h-3 inline animate-spin mr-1" /> Carregando motor OCR…</p>}
                </div>
            )}

            {/* Manual */}
            {modo === "manual" && (
                <div className="flex flex-col gap-2">
                    <textarea
                        className="w-full min-h-[80px] p-3 rounded-lg border border-input bg-background text-sm font-mono focus:ring-2 focus:ring-primary/20 focus:outline-none uppercase resize-y"
                        placeholder="Digite os SKUs (separados por espaço, vírgula ou linha)..."
                        value={manualInput}
                        onChange={e => setManualInput(e.target.value.toUpperCase())}
                        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); adicionarManual() } }}
                        autoFocus
                    />
                    <Button onClick={adicionarManual} className="w-full h-10">Adicionar Códigos</Button>
                </div>
            )}

            {/* Lista de lidos (colapsável) */}
            {codigos.length > 0 && (
                <div className="space-y-1">
                    <button
                        className="w-full flex items-center justify-between text-xs font-bold text-muted-foreground uppercase py-1"
                        onClick={() => setListExpanded(v => !v)}
                    >
                        <span>Lidos ({codigos.length})</span>
                        {listExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                    {listExpanded && (
                        <div className="max-h-40 overflow-y-auto space-y-1">
                            {[...codigos].reverse().map((c, i) => (
                                <div key={i} className="flex items-center justify-between bg-muted/30 rounded px-3 py-1.5 text-sm font-mono">
                                    <span>{c}</span>
                                    <button onClick={() => setCodigos(codigos.filter(x => x !== c))} className="text-muted-foreground hover:text-destructive ml-2">×</button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Produtos esperados */}
            {produtosEsperados.length > 0 && (
                <details className="group border border-border rounded-lg overflow-hidden" open>
                    <summary className="bg-muted/30 p-2.5 text-xs font-bold flex items-center justify-between cursor-pointer hover:bg-muted/50">
                        PRODUTOS REGISTRADOS AQUI ({produtosEsperados.length})
                        <ChevronRight className="w-4 h-4 group-open:rotate-90 transition-transform" />
                    </summary>
                    <div className="p-2 space-y-1.5 max-h-[400px] overflow-y-auto bg-background">
                        {produtosEsperados.map(p => {
                            const qtdEsperada = Number(p.estoque_atual) || 1
                            const nSku = normalizeCode(p.sku)
                            const nEti = normalizeCode(p.codigo_etiqueta)
                            const nBar = normalizeCode(p.codigo_barras)
                            const qtdLida = codigos.filter(c => c === nSku || (nEti && c === nEti) || (nBar && c === nBar)).length
                            const lido = qtdLida >= qtdEsperada
                            return (
                                <div key={p.id} onClick={() => {
                                    if (lido) setCodigos(codigos.filter(x => x !== nSku && x !== nEti && x !== nBar))
                                    else { const code = p.sku || p.codigo_etiqueta || p.codigo_barras; if (code) adicionarCodigo(code) }
                                }} className="cursor-pointer">
                                    <ProdutoCard
                                        produto={p}
                                        status={lido ? "ok" : qtdLida > 0 ? "excedente" : "neutro"}
                                        qtdLida={qtdLida}
                                        qtdEsperada={qtdEsperada}
                                    />
                                </div>
                            )
                        })}
                    </div>
                </details>
            )}

            {/* Botão Conferir */}
            <Button
                className="w-full gap-2 h-12 font-bold"
                disabled={codigos.length === 0 || finalizando}
                onClick={onFinalizar}
            >
                {finalizando ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
                {finalizando ? "Processando..." : `Conferir ${codigos.length > 0 ? `(${codigos.length} leituras)` : ""}`}
            </Button>
        </div>
    )
}

// ─── EtapaResultadoLocalizacao (fluxo categoria) ──────────────────────────────
function EtapaResultadoLocalizacao({
    resultado: initialResultado,
    localizacao,
    categoria,
    onSalvarEContinuar,
    onSalvarEEncerrar,
}: {
    resultado: ResultadoLocalizacao
    localizacao: Localizacao
    categoria: Categoria
    onSalvarEContinuar: (r: ResultadoLocalizacao) => void
    onSalvarEEncerrar: (r: ResultadoLocalizacao) => void
}) {
    const [resultado, setResultado] = useState<ResultadoLocalizacao>(initialResultado)
    const [actionLoading, setActionLoading] = useState<string | null>(null)
    const [confirmados, setConfirmados] = useState<Set<string>>(new Set())
    const { corretos, faltantes, excedentes } = resultado

    const executarAcao = async (produtoId: string, acao: string, extra?: any) => {
        setActionLoading(`${produtoId}-${acao}`)
        try {
            await api.post("/api/conferencia/acao-item", { produto_id: produtoId, acao, ...extra })
            // Atualiza estado local após ação
            if (acao === "remover_localizacao" || acao === "inativar") {
                setResultado(prev => ({
                    ...prev,
                    faltantes: prev.faltantes.filter(p => p.id !== produtoId),
                    resumo: { ...prev.resumo, faltantes: prev.faltantes.filter(p => p.id !== produtoId).length }
                }))
            }
        } catch (e: any) {
            alert(e.message || "Erro ao executar ação")
        } finally { setActionLoading(null) }
    }

    const adicionarLocalizacao = async (produtoId: string) => {
        setActionLoading(`${produtoId}-add_loc`)
        try {
            await api.post("/api/conferencia/acao-item", {
                produto_id: produtoId,
                acao: "atualizar_localizacao",
                nova_localizacao_id: localizacao.id
            })
            // Remove dos excedentes e adiciona aos corretos
            setResultado(prev => {
                const exc = prev.excedentes.find(e => e.produto?.id === produtoId)
                const prod = exc?.produto
                const novosExc = prev.excedentes.filter(e => e.produto?.id !== produtoId)
                const novosCorretos = prod ? [...prev.corretos, prod] : prev.corretos
                return {
                    ...prev,
                    excedentes: novosExc,
                    corretos: novosCorretos,
                    resumo: { ...prev.resumo, excedentes: novosExc.length, ok: novosCorretos.length }
                }
            })
        } catch (e: any) {
            alert(e.message || "Erro ao adicionar localização")
        } finally { setActionLoading(null) }
    }

    const excluirExcedente = async (produtoId: string) => {
        if (!confirm("Inativar este produto? O saldo em estoque será baixado (saída registrada) e ele sai da listagem.")) return
        setActionLoading(`${produtoId}-inativar_exc`)
        try {
            await api.post("/api/conferencia/acao-item", { produto_id: produtoId, acao: "inativar" })
            setResultado(prev => ({
                ...prev,
                excedentes: prev.excedentes.filter(e => e.produto?.id !== produtoId)
            }))
        } catch (e: any) {
            alert(e.message || "Erro ao excluir")
        } finally { setActionLoading(null) }
    }

    const ajustarEstoque = (p: any) => {
        const nova = prompt(`Novo estoque para ${p.nome}:`, String(p.estoque_atual))
        if (nova !== null) {
            const val = parseInt(nova)
            if (!isNaN(val)) executarAcao(p.id, "ajustar_estoque", { nova_quantidade: val })
        }
    }

    const pct = resultado.resumo.percentual_conferido
    const corPct = pct >= 90 ? "text-green-600" : pct >= 60 ? "text-amber-600" : "text-red-600"
    const bgPct = pct >= 90 ? "bg-green-500" : pct >= 60 ? "bg-amber-500" : "bg-red-500"

    return (
        <div className="space-y-5">
            {/* Resumo */}
            <div className="rounded-xl border border-border p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-xs font-bold text-muted-foreground uppercase">Resultado</p>
                        <p className="font-bold text-sm">{locNome(localizacao)}</p>
                    </div>
                    <span className={cn("text-2xl font-black", corPct)}>{pct}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2.5">
                    <div className={cn("h-2.5 rounded-full transition-all", bgPct)} style={{ width: `${pct}%` }} />
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-green-500/10 rounded-lg p-2">
                        <p className="text-xl font-black text-green-600">{resultado.resumo.ok}</p>
                        <p className="text-[10px] text-green-700 font-semibold">Corretos</p>
                    </div>
                    <div className="bg-red-500/10 rounded-lg p-2">
                        <p className="text-xl font-black text-red-600">{resultado.resumo.faltantes}</p>
                        <p className="text-[10px] text-red-700 font-semibold">Faltantes</p>
                    </div>
                    <div className="bg-amber-500/10 rounded-lg p-2">
                        <p className="text-xl font-black text-amber-600">{resultado.resumo.excedentes}</p>
                        <p className="text-[10px] text-amber-700 font-semibold">Excedentes</p>
                    </div>
                </div>
            </div>

            {/* ✅ Corretos */}
            {corretos.length > 0 && (
                <details className="group">
                    <summary className="text-sm font-bold text-green-600 flex items-center gap-1.5 cursor-pointer list-none">
                        <CheckCircle className="w-4 h-4" /> Corretos ({corretos.length})
                        <ChevronRight className="w-3 h-3 ml-auto group-open:rotate-90 transition-transform" />
                    </summary>
                    <div className="mt-2 space-y-1 max-h-64 overflow-y-auto pr-1">
                        {corretos.map(p => <ProdutoCard key={p.id} produto={p} status="ok" compact />)}
                    </div>
                </details>
            )}

            {/* ⚠️ Excedentes */}
            {excedentes.length > 0 && (
                <div className="space-y-2">
                    <p className="text-sm font-bold text-amber-600 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4" /> Excedentes ({excedentes.length})
                        <span className="text-xs font-normal text-muted-foreground ml-1">Escaneados mas não registrados aqui</span>
                    </p>
                    <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                        {excedentes.map((e, i) => (
                            <div key={i} className="p-2 rounded-lg bg-amber-500/5 border border-amber-200 dark:border-amber-900 space-y-2">
                                <div className="flex items-center gap-3">
                                    {e.produto ? (
                                        <>
                                            {getProdImg(e.produto) && (
                                                <img src={thumbUrl(getProdImg(e.produto))} className="w-8 h-8 rounded object-cover shrink-0"
                                                    onError={(ev) => {
                                                        if (ev.currentTarget.dataset.fallback !== "done") imgFallbackToOriginal(getProdImg(e.produto))(ev)
                                                        else { ev.currentTarget.style.display = "none"; ev.currentTarget.nextElementSibling?.classList.remove("hidden") }
                                                    }} />
                                            )}
                                            <Package className={cn("w-8 h-8 text-muted-foreground shrink-0", getProdImg(e.produto) && "hidden")} />
                                        </>
                                    ) : <Package className="w-8 h-8 text-muted-foreground shrink-0" />}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-bold truncate">{e.produto?.nome ?? e.codigo_lido}</p>
                                        <p className="text-[10px] text-muted-foreground font-mono">{e.motivo}</p>
                                        {e.produto?.localizacao && <p className="text-[10px] text-muted-foreground">Loc atual: {e.produto.localizacao}</p>}
                                    </div>
                                    <Badge className="text-[10px] shrink-0 bg-amber-500/20 text-amber-700 border-amber-300">Excedente</Badge>
                                </div>
                                {e.produto && (
                                    <div className="flex gap-1 pt-1">
                                        <Button size="sm" variant="outline"
                                            className="h-7 text-[10px] flex-1 gap-1 px-1 border-green-300 text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
                                            onClick={() => adicionarLocalizacao(e.produto!.id)}
                                            disabled={actionLoading === `${e.produto.id}-add_loc`}>
                                            {actionLoading === `${e.produto!.id}-add_loc` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                                            Add a {locNome(localizacao)}
                                        </Button>
                                        <Button size="sm" variant="outline"
                                            className="h-7 text-[10px] flex-1 gap-1 px-1"
                                            onClick={() => ajustarEstoque(e.produto)}
                                            disabled={actionLoading === `${e.produto!.id}-ajustar_estoque`}>
                                            {actionLoading === `${e.produto!.id}-ajustar_estoque` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Edit3 className="w-3 h-3" />}
                                            Estoque
                                        </Button>
                                        <Button size="sm" variant="outline"
                                            className="h-7 text-[10px] flex-1 gap-1 px-1 text-destructive hover:text-destructive"
                                            onClick={() => excluirExcedente(e.produto!.id)}
                                            disabled={actionLoading === `${e.produto!.id}-inativar_exc`}>
                                            {actionLoading === `${e.produto!.id}-inativar_exc` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                            Inativar
                                        </Button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ❌ Faltantes */}
            {faltantes.length > 0 && (
                <div className="space-y-2">
                    <p className="text-sm font-bold text-red-600 flex items-center gap-1.5">
                        <XCircle className="w-4 h-4" /> Faltantes ({faltantes.length})
                        <span className="text-xs font-normal text-muted-foreground ml-1">Registrados aqui mas não encontrados</span>
                    </p>
                    <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                        {faltantes.map(p => (
                            <div key={p.id} className="p-2 rounded-lg bg-red-500/5 border border-red-200 dark:border-red-900 space-y-2">
                                <ProdutoCard produto={p} status="faltante" compact />
                                <div className="flex gap-1">
                                    <Button size="sm" variant="outline" className="h-7 text-[10px] flex-1 gap-1 px-1"
                                        onClick={() => executarAcao(p.id, "remover_localizacao")}
                                        disabled={actionLoading === `${p.id}-remover_localizacao`}>
                                        {actionLoading === `${p.id}-remover_localizacao` ? <Loader2 className="w-3 h-3 animate-spin" /> : <MapPinOff className="w-3 h-3" />}
                                        Tirar Local
                                    </Button>
                                    <Button size="sm" variant="outline" className="h-7 text-[10px] flex-1 gap-1 px-1"
                                        onClick={() => ajustarEstoque(p)}
                                        disabled={actionLoading === `${p.id}-ajustar_estoque`}>
                                        {actionLoading === `${p.id}-ajustar_estoque` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Edit3 className="w-3 h-3" />}
                                        Estoque
                                    </Button>
                                    <Button size="sm" variant="outline"
                                        className="h-7 text-[10px] flex-1 gap-1 px-1 text-destructive hover:text-destructive"
                                        onClick={() => confirm(`Inativar ${p.nome}? O saldo em estoque será baixado e ele sai da listagem.`) && executarAcao(p.id, "inativar")}
                                        disabled={actionLoading === `${p.id}-inativar`}>
                                        {actionLoading === `${p.id}-inativar` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                        Inativar
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Ações */}
            <div className="flex flex-col gap-2 pt-2 border-t border-border">
                <Button className="w-full gap-2 h-12 font-bold bg-primary" onClick={() => onSalvarEContinuar(resultado)}>
                    <MapPin className="w-4 h-4" /> Salvar e conferir outra localização
                </Button>
                <Button variant="outline" className="w-full gap-2 border-green-400 text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
                    onClick={() => onSalvarEEncerrar(resultado)}>
                    <Flag className="w-4 h-4" /> Salvar e encerrar categoria
                </Button>
            </div>
        </div>
    )
}

// ─── EtapaResultadoSimples (fluxo Por Localização — mantido original) ─────────
function EtapaResultadoSimples({
    resultado: initialResultado, alvoNome, localizacaoId, onReiniciar
}: {
    resultado: ResultadoSimples
    alvoNome: string
    localizacaoId?: string
    onReiniciar: () => void
}) {
    const [resultado, setResultado] = useState<ResultadoSimples>(initialResultado)
    const [confirming, setConfirming] = useState(false)
    const [confirmados, setConfirmados] = useState<Set<string>>(new Set())
    const [actionLoading, setActionLoading] = useState<string | null>(null)
    const { resumo, ok, faltantes, excedentes } = resultado

    useEffect(() => { setResultado(initialResultado) }, [initialResultado])

    const executarAcao = async (produtoId: string, acao: string, extra?: any) => {
        setActionLoading(`${produtoId}-${acao}`)
        try {
            await api.post("/api/conferencia/acao-item", { produto_id: produtoId, acao, ...extra })
            setResultado(prev => {
                const newFaltantes = prev.faltantes.filter(p => p.id !== produtoId)
                const newTotalSistema = prev.resumo.total_sistema - 1
                return {
                    ...prev, faltantes: newFaltantes,
                    resumo: { ...prev.resumo, faltantes: newFaltantes.length, total_sistema: newTotalSistema,
                        percentual_conferido: newTotalSistema > 0 ? Math.round((prev.ok.length / newTotalSistema) * 100 * 10) / 10 : 0 }
                }
            })
        } catch (e: any) { alert(e.message || "Erro ao executar ação") }
        finally { setActionLoading(null) }
    }

    const confirmarAtualizacoes = async () => {
        const atualizacoes = excedentes
            .filter(e => e.produto && confirmados.has(e.produto.id))
            .map(e => ({ produto_id: e.produto!.id, novo_localizacao_id: localizacaoId }))
        if (!atualizacoes.length) return
        setConfirming(true)
        try {
            const res = await authFetch("/api/conferencia/confirmar", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ atualizacoes }),
            })
            if (!res.ok) {
                const text = await res.text()
                throw new Error(text || "Erro ao salvar conferência")
            }
            alert(`${atualizacoes.length} item(s) atualizado(s) com sucesso.`)
            onReiniciar()
        } catch (e: any) {
            alert(e.message || "Erro ao salvar atualizações.")
        } finally {
            setConfirming(false)
        }
    }

    const gerarRelatorio = () => {
        const linhas = [
            `RELATÓRIO DE CONFERÊNCIA DE ESTOQUE`, `Alvo: ${alvoNome}`,
            `Data: ${new Date().toLocaleString("pt-BR")}`, ``,
            `RESUMO`, `Total no sistema: ${resumo.total_sistema}`,
            `Total lidos: ${resumo.total_lidos}`, `OK: ${resumo.ok}`,
            `Faltantes: ${resumo.faltantes}`, `Excedentes: ${resumo.excedentes}`, ``,
            `--- ITENS FALTANTES ---`, ...faltantes.map(p => `${p.sku || p.codigo_etiqueta} | ${p.nome}`), ``,
            `--- ITENS EXCEDENTES ---`, ...excedentes.map(e => `${e.codigo_lido} | ${e.produto?.nome ?? "Não encontrado"} | ${e.motivo}`),
        ]
        const blob = new Blob([linhas.join("\n")], { type: "text/plain" })
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob)
        a.download = `conferencia_${alvoNome}_${new Date().toISOString().slice(0, 10)}.txt`; a.click()
    }

    const pct = resumo.percentual_conferido
    const cor = pct >= 90 ? "text-green-600" : pct >= 60 ? "text-amber-600" : "text-red-600"
    const bgCor = pct >= 90 ? "bg-green-500" : pct >= 60 ? "bg-amber-500" : "bg-red-500"

    return (
        <div className="space-y-4">
            <div className="rounded-xl border border-border p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <p className="font-bold text-base">{alvoNome}</p>
                    <span className={cn("text-2xl font-black", cor)}>{pct}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2.5">
                    <div className={cn("h-2.5 rounded-full transition-all", bgCor)} style={{ width: `${pct}%` }} />
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-green-500/10 rounded-lg p-2">
                        <p className="text-2xl font-black text-green-600">{resumo.ok}</p>
                        <p className="text-xs text-green-700 font-semibold">OK</p>
                    </div>
                    <div className="bg-red-500/10 rounded-lg p-2">
                        <p className="text-2xl font-black text-red-600">{resumo.faltantes}</p>
                        <p className="text-xs text-red-700 font-semibold">Faltantes</p>
                    </div>
                    <div className="bg-amber-500/10 rounded-lg p-2">
                        <p className="text-2xl font-black text-amber-600">{resumo.excedentes}</p>
                        <p className="text-xs text-amber-700 font-semibold">Excedentes</p>
                    </div>
                </div>
            </div>

            {faltantes.length > 0 && (
                <div className="space-y-2">
                    <p className="text-sm font-bold text-red-600 flex items-center gap-1.5">
                        <XCircle className="w-4 h-4" /> Itens Faltantes ({faltantes.length})
                    </p>
                    <div className="space-y-1 max-h-[500px] overflow-y-auto pr-1">
                        {faltantes.map(p => (
                            <div key={p.id} className="p-2 rounded-lg bg-red-500/5 border border-red-200 dark:border-red-900 space-y-2">
                                <ProdutoCard produto={p} status="faltante" compact />
                                <div className="flex gap-1 pt-1">
                                    <Button size="sm" variant="outline" className="h-7 text-[10px] flex-1 gap-1 px-1"
                                        onClick={() => executarAcao(p.id, "remover_localizacao")}
                                        disabled={actionLoading === `${p.id}-remover_localizacao`}>
                                        {actionLoading === `${p.id}-remover_localizacao` ? <Loader2 className="w-3 h-3 animate-spin" /> : <MapPinOff className="w-3 h-3" />}
                                        Tirar Local
                                    </Button>
                                    <Button size="sm" variant="outline" className="h-7 text-[10px] flex-1 gap-1 px-1"
                                        onClick={() => { const nova = prompt(`Novo estoque para ${p.nome}:`, String(p.estoque_atual)); if (nova !== null) { const val = parseInt(nova); if (!isNaN(val)) executarAcao(p.id, "ajustar_estoque", { nova_quantidade: val }) } }}
                                        disabled={actionLoading === `${p.id}-ajustar_estoque`}>
                                        {actionLoading === `${p.id}-ajustar_estoque` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Edit3 className="w-3 h-3" />}
                                        Estoque
                                    </Button>
                                    <Button size="sm" variant="outline"
                                        className="h-7 text-[10px] flex-1 gap-1 px-1 text-destructive hover:text-destructive"
                                        onClick={() => confirm(`Inativar ${p.nome}? O saldo em estoque será baixado e ele sai da listagem.`) && executarAcao(p.id, "inativar")}
                                        disabled={actionLoading === `${p.id}-inativar`}>
                                        {actionLoading === `${p.id}-inativar` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                        Inativar
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {excedentes.length > 0 && (
                <div className="space-y-2">
                    <p className="text-sm font-bold text-amber-600 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4" /> Itens Excedentes ({excedentes.length})
                        <span className="text-xs font-normal text-muted-foreground ml-1">Marque para atualizar localização</span>
                    </p>
                    <div className="space-y-1 max-h-[500px] overflow-y-auto pr-1">
                        {excedentes.map((e, i) => (
                            <div key={i}
                                onClick={() => e.produto && setConfirmados(prev => { const next = new Set(prev); next.has(e.produto!.id) ? next.delete(e.produto!.id) : next.add(e.produto!.id); return next })}
                                className={cn("flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-all",
                                    e.produto && confirmados.has(e.produto.id) ? "border-primary bg-primary/5" : "border-amber-200 dark:border-amber-900 bg-amber-500/5")}>
                                {getProdImg(e.produto) && (
                                    <img src={thumbUrl(getProdImg(e.produto))} className="w-8 h-8 rounded object-cover shrink-0"
                                        onError={(ev) => {
                                            if (ev.currentTarget.dataset.fallback !== "done") imgFallbackToOriginal(getProdImg(e.produto))(ev)
                                            else { ev.currentTarget.style.display = "none"; ev.currentTarget.nextElementSibling?.classList.remove("hidden") }
                                        }} />
                                )}
                                <Package className={cn("w-8 h-8 text-muted-foreground shrink-0", getProdImg(e.produto) && "hidden")} />
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold truncate">{e.produto?.nome ?? e.codigo_lido}</p>
                                    <p className="text-[10px] text-muted-foreground">{e.motivo}</p>
                                </div>
                                {e.produto && (
                                    <div className={cn("w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors",
                                        confirmados.has(e.produto.id) ? "bg-primary border-primary" : "border-border")}>
                                        {confirmados.has(e.produto.id) && <Check className="w-3 h-3 text-white" />}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {resultado.suspeitos && resultado.suspeitos.length > 0 && (
                <div className="space-y-2 mt-4">
                    <p className="text-sm font-bold text-blue-600 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4" /> Suspeitos ({resultado.suspeitos.length})
                    </p>
                    <p className="text-xs text-muted-foreground">Produtos com nome similar e saldo positivo, mas fora desta categoria.</p>
                    <div className="space-y-1 max-h-[300px] overflow-y-auto pr-1">
                        {resultado.suspeitos.map(p => (
                            <div key={p.id} className="p-2 rounded-lg bg-blue-500/5 border border-blue-200 dark:border-blue-900">
                                <ProdutoCard produto={p} status="neutro" compact />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {ok.length > 0 && (
                <details className="group">
                    <summary className="text-sm font-bold text-green-600 flex items-center gap-1.5 cursor-pointer list-none">
                        <CheckCircle className="w-4 h-4" /> Itens OK ({ok.length})
                        <ChevronRight className="w-3 h-3 ml-auto group-open:rotate-90 transition-transform" />
                    </summary>
                    <div className="mt-2 space-y-1 max-h-[300px] overflow-y-auto pr-1">
                        {ok.map(p => <ProdutoCard key={p.id} produto={p} status="ok" compact />)}
                    </div>
                </details>
            )}

            <div className="flex flex-col gap-2 pt-2 border-t border-border">
                {confirmados.size > 0 && (
                    <Button onClick={confirmarAtualizacoes} disabled={confirming} className="w-full gap-2">
                        {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        Confirmar atualização de {confirmados.size} item(s)
                    </Button>
                )}
                <Button variant="outline" className="w-full gap-2" onClick={gerarRelatorio}>
                    <Download className="w-4 h-4" /> Gerar relatório .txt
                </Button>
                <Button variant="ghost" className="w-full gap-2" onClick={onReiniciar}>
                    <RotateCcw className="w-4 h-4" /> Nova conferência
                </Button>
            </div>
        </div>
    )
}

// ─── EtapaPanoramaCategoria ───────────────────────────────────────────────────
function EtapaPanoramaCategoria({
    sessao, onNovaCat, onNovaSessao
}: {
    sessao: SessaoCategoria
    onNovaCat: () => void
    onNovaSessao: () => void
}) {
    const [actionLoading, setActionLoading] = useState<string | null>(null)
    const [produtosLocais, setProdutosLocais] = useState<Produto[]>([])

    // IDs de todos os produtos que foram confirmados como corretos
    const idsConferidos = new Set(
        sessao.localizacoesConferidas.flatMap(l => l.resultado.corretos.map(p => p.id))
    )

    // Produtos da categoria que NÃO foram confirmados como corretos em nenhuma localização
    const naoConferidos = sessao.todosProdutos.filter(p => !idsConferidos.has(p.id))

    // Agrupar por: sem localização vs com localização (mas loc não conferida)
    const semLoc = naoConferidos.filter(p => !p.localizacao_id)
    const comLoc = naoConferidos.filter(p => !!p.localizacao_id)

    useEffect(() => {
        setProdutosLocais(naoConferidos)
    }, [])

    const executarAcao = async (produtoId: string, acao: string, extra?: any) => {
        setActionLoading(`${produtoId}-${acao}`)
        try {
            await api.post("/api/conferencia/acao-item", { produto_id: produtoId, acao, ...extra })
            setProdutosLocais(prev => prev.filter(p => p.id !== produtoId))
        } catch (e: any) {
            alert(e.message || "Erro ao executar ação")
        } finally { setActionLoading(null) }
    }

    const ajustarEstoque = (p: Produto) => {
        const nova = prompt(`Novo estoque para ${p.nome}:`, String(p.estoque_atual))
        if (nova !== null) {
            const val = parseInt(nova)
            if (!isNaN(val)) executarAcao(p.id, "ajustar_estoque", { nova_quantidade: val })
        }
    }

    const marcarConferido = (prodId: string) => {
        setProdutosLocais(prev => prev.filter(p => p.id !== prodId))
    }

    // Stats da sessão
    const totalLocs = sessao.localizacoesConferidas.length
    const totalProdsCat = sessao.todosProdutos.length
    const totalConfirmados = idsConferidos.size
    const totalNaoConferidos = produtosLocais.length
    const pctGeral = totalProdsCat > 0 ? Math.round((totalConfirmados / totalProdsCat) * 100) : 0
    const corPct = pctGeral >= 90 ? "text-green-600" : pctGeral >= 60 ? "text-amber-600" : "text-red-600"
    const bgPct = pctGeral >= 90 ? "bg-green-500" : pctGeral >= 60 ? "bg-amber-500" : "bg-red-500"

    const gerarRelatorio = () => {
        const linhas = [
            `RELATÓRIO DE CONFERÊNCIA DE CATEGORIA`, `Categoria: ${sessao.categoria.nome}`,
            `Data: ${new Date().toLocaleString("pt-BR")}`,
            `Iniciada: ${new Date(sessao.iniciadaEm).toLocaleString("pt-BR")}`, ``,
            `RESUMO GERAL`,
            `Total produtos na categoria: ${totalProdsCat}`,
            `Total confirmados: ${totalConfirmados}`,
            `Não conferidos: ${totalNaoConferidos}`,
            `Aproveitamento: ${pctGeral}%`, ``,
            `LOCALIZAÇÕES CONFERIDAS (${totalLocs}):`,
            ...sessao.localizacoesConferidas.map(l =>
                `  [${locNome(l.localizacao)}] OK:${l.resultado.resumo.ok} | Faltantes:${l.resultado.resumo.faltantes} | Excedentes:${l.resultado.resumo.excedentes}`
            ), ``,
            `PRODUTOS NÃO CONFERIDOS (${totalNaoConferidos}):`,
            ...produtosLocais.map(p => `  ${p.sku || p.codigo_etiqueta} | ${p.nome} | Loc: ${p.localizacao || "SEM LOCAL"} | Est: ${p.estoque_atual}`),
        ]
        const blob = new Blob([linhas.join("\n")], { type: "text/plain" })
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob)
        a.download = `conferencia_cat_${sessao.categoria.nome}_${new Date().toISOString().slice(0, 10)}.txt`; a.click()
    }

    return (
        <div className="space-y-5">
            {/* Banner de conclusão */}
            <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4 space-y-3 text-center">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                    <Flag className="w-6 h-6 text-primary" />
                </div>
                <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase">Panorama Final</p>
                    <p className="font-black text-lg">{sessao.categoria.nome}</p>
                </div>
                <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Progresso geral</span>
                        <span className={cn("font-bold", corPct)}>{pctGeral}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-3">
                        <div className={cn("h-3 rounded-full transition-all", bgPct)} style={{ width: `${pctGeral}%` }} />
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-background rounded-lg p-2 border">
                        <p className="text-xl font-black text-primary">{totalLocs}</p>
                        <p className="text-[10px] font-semibold text-muted-foreground">Localizações</p>
                    </div>
                    <div className="bg-green-500/10 rounded-lg p-2">
                        <p className="text-xl font-black text-green-600">{totalConfirmados}</p>
                        <p className="text-[10px] font-semibold text-green-700">Confirmados</p>
                    </div>
                    <div className={cn("rounded-lg p-2", totalNaoConferidos > 0 ? "bg-red-500/10" : "bg-muted/20")}>
                        <p className={cn("text-xl font-black", totalNaoConferidos > 0 ? "text-red-600" : "text-muted-foreground")}>{totalNaoConferidos}</p>
                        <p className={cn("text-[10px] font-semibold", totalNaoConferidos > 0 ? "text-red-700" : "text-muted-foreground")}>Não conf.</p>
                    </div>
                </div>
            </div>

            {/* Localizações conferidas (resumo) */}
            <details className="group border border-border rounded-lg overflow-hidden">
                <summary className="bg-muted/30 p-2.5 text-xs font-bold flex items-center justify-between cursor-pointer hover:bg-muted/50">
                    <span className="flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5 text-green-500" /> Localizações conferidas ({totalLocs})</span>
                    <ChevronRight className="w-4 h-4 group-open:rotate-90 transition-transform" />
                </summary>
                <div className="p-2 space-y-1.5 max-h-64 overflow-y-auto bg-background">
                    {sessao.localizacoesConferidas.map(l => (
                        <div key={l.localizacao.id} className="flex items-center justify-between p-2 rounded-lg bg-green-500/5 border border-green-200 dark:border-green-900">
                            <div>
                                <p className="text-xs font-bold text-green-700 dark:text-green-400">✅ {locNome(l.localizacao)}</p>
                                <p className="text-[10px] text-muted-foreground">{new Date(l.salvaEm).toLocaleTimeString("pt-BR")}</p>
                            </div>
                            <div className="flex gap-2 text-[10px] font-semibold">
                                <span className="text-green-600">✓ {l.resultado.resumo.ok}</span>
                                {l.resultado.resumo.faltantes > 0 && <span className="text-red-600">✗ {l.resultado.resumo.faltantes}</span>}
                                {l.resultado.resumo.excedentes > 0 && <span className="text-amber-600">⚠ {l.resultado.resumo.excedentes}</span>}
                            </div>
                        </div>
                    ))}
                </div>
            </details>

            {/* Produtos não conferidos */}
            {produtosLocais.length > 0 && (
                <div className="space-y-3">
                    <p className="text-sm font-bold text-red-600 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4" /> Produtos não conferidos ({produtosLocais.length})
                        <span className="text-xs font-normal text-muted-foreground ml-1">— verificar se existem fisicamente</span>
                    </p>

                    {semLoc.filter(p => produtosLocais.find(pl => pl.id === p.id)).length > 0 && (
                        <div className="space-y-1">
                            <p className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1">
                                <MapPinOff className="w-3 h-3" /> Sem localização definida ({semLoc.filter(p => produtosLocais.find(pl => pl.id === p.id)).length})
                            </p>
                            {semLoc.filter(p => produtosLocais.find(pl => pl.id === p.id)).map(p => (
                                <ProdutoAcaoCard key={p.id} produto={p} actionLoading={actionLoading}
                                    onAjustar={ajustarEstoque}
                                    onAcao={executarAcao}
                                    onMarcarConferido={marcarConferido} />
                            ))}
                        </div>
                    )}

                    {comLoc.filter(p => produtosLocais.find(pl => pl.id === p.id)).length > 0 && (
                        <div className="space-y-1">
                            <p className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1">
                                <MapPin className="w-3 h-3" /> Com localização, mas loc não conferida ({comLoc.filter(p => produtosLocais.find(pl => pl.id === p.id)).length})
                            </p>
                            {comLoc.filter(p => produtosLocais.find(pl => pl.id === p.id)).map(p => (
                                <ProdutoAcaoCard key={p.id} produto={p} actionLoading={actionLoading}
                                    onAjustar={ajustarEstoque}
                                    onAcao={executarAcao}
                                    onMarcarConferido={marcarConferido} />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {produtosLocais.length === 0 && (
                <div className="text-center py-6 space-y-2">
                    <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
                    <p className="font-bold text-green-600">Todos os produtos foram conferidos!</p>
                    <p className="text-xs text-muted-foreground">Excelente trabalho. A conferência está completa.</p>
                </div>
            )}

            {/* Ações finais */}
            <div className="flex flex-col gap-2 pt-2 border-t border-border">
                <Button variant="outline" className="w-full gap-2" onClick={gerarRelatorio}>
                    <Download className="w-4 h-4" /> Gerar relatório completo .txt
                </Button>
                <Button className="w-full gap-2 h-11" onClick={onNovaCat}>
                    <Package className="w-4 h-4" /> Iniciar nova categoria
                </Button>
                <Button variant="ghost" className="w-full gap-2" onClick={onNovaSessao}>
                    <RotateCcw className="w-4 h-4" /> Reiniciar tudo
                </Button>
            </div>
        </div>
    )
}

// ─── ProdutoAcaoCard (usado no panorama) ─────────────────────────────────────
function ProdutoAcaoCard({ produto, actionLoading, onAjustar, onAcao, onMarcarConferido }: {
    produto: Produto
    actionLoading: string | null
    onAjustar: (p: Produto) => void
    onAcao: (id: string, acao: string, extra?: any) => void
    onMarcarConferido: (id: string) => void
}) {
    return (
        <div className="p-2 rounded-lg bg-red-500/5 border border-red-200 dark:border-red-900 space-y-2">
            <ProdutoCard produto={produto} status="faltante" compact />
            {produto.localizacao && (
                <p className="text-[10px] text-muted-foreground pl-1">📍 {produto.localizacao} | Est: {produto.estoque_atual}</p>
            )}
            <div className="flex gap-1 flex-wrap">
                <Button size="sm" variant="outline" className="h-7 text-[10px] flex-1 gap-1 px-1"
                    onClick={() => onAcao(produto.id, "remover_localizacao")}
                    disabled={actionLoading === `${produto.id}-remover_localizacao`}>
                    {actionLoading === `${produto.id}-remover_localizacao` ? <Loader2 className="w-3 h-3 animate-spin" /> : <MapPinOff className="w-3 h-3" />}
                    Tirar Local
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-[10px] flex-1 gap-1 px-1"
                    onClick={() => onAjustar(produto)}
                    disabled={actionLoading === `${produto.id}-ajustar_estoque`}>
                    {actionLoading === `${produto.id}-ajustar_estoque` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Edit3 className="w-3 h-3" />}
                    Estoque
                </Button>
                <Button size="sm" variant="outline"
                    className="h-7 text-[10px] flex-1 gap-1 px-1 text-destructive hover:text-destructive"
                    onClick={() => confirm(`Deseja inativar ${produto.nome}?`) && onAcao(produto.id, "inativar")}
                    disabled={actionLoading === `${produto.id}-inativar`}>
                    {actionLoading === `${produto.id}-inativar` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    Inativar
                </Button>
                <Button size="sm" variant="outline"
                    className="h-7 text-[10px] flex-1 gap-1 px-1 text-green-700 border-green-300 hover:bg-green-50 dark:hover:bg-green-900/20"
                    onClick={() => onMarcarConferido(produto.id)}>
                    <Check className="w-3 h-3" /> OK (existe)
                </Button>
            </div>
        </div>
    )
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export function ConferenciaEstoque() {
    // Modo de conferência: simples (por localização) ou categoria (multi-loc)
    const [modo, setModo] = useState<ModoConferencia>("simples")

    // ── Estado do fluxo SIMPLES (Por Localização) ──
    const [etapaSimples, setEtapaSimples] = useState<EtapaSimples>("alvo")
    const [localizacaoSimples, setLocalizacaoSimples] = useState<Localizacao | null>(null)
    const [codigosSimples, setCodigosSimples] = useState<string[]>([])
    const [resultadoSimples, setResultadoSimples] = useState<ResultadoSimples | null>(null)
    const [conferindoSimples, setConferindoSimples] = useState(false)
    const [produtosEsperadosSimples, setProdutosEsperadosSimples] = useState<Produto[]>([])
    const [loadingEsperados, setLoadingEsperados] = useState(false)

    // ── Estado do fluxo CATEGORIA ──
    const [etapaCat, setEtapaCat] = useState<EtapaCat>("cat_select")
    const [sessaoCategoria, setSessaoCategoria] = useState<SessaoCategoria | null>(null)
    const [locAtual, setLocAtual] = useState<Localizacao | null>(null)
    const [produtosLocAtual, setProdutosLocAtual] = useState<Produto[]>([])
    const [codigosCat, setCodigosCat] = useState<string[]>([])
    const [resultadoLocAtual, setResultadoLocAtual] = useState<ResultadoLocalizacao | null>(null)
    const [conferindoCat, setConferindoCat] = useState(false)
    const [carregandoCatProds, setCarregandoCatProds] = useState(false)

    // Recuperar sessão do localStorage ao montar
    useEffect(() => {
        // Sem recuperação automática no mount — pode ser adicionada depois com prompt ao usuário
    }, [])

    // ── Handlers Fluxo Simples ──
    const handleSelectLoc = async (l: Localizacao) => {
        setModo("simples")
        setLocalizacaoSimples(l)
        setCodigosSimples([])
        setResultadoSimples(null)
        setEtapaSimples("leitura")
        setLoadingEsperados(true)
        try {
            const r = await api.get(`/api/estoque/produtos/?localizacao_id=${l.id}&ativo=true&estoque=positivo&limit=2000&painel=true`)
            setProdutosEsperadosSimples(Array.isArray(r) ? r : r?.items ?? [])
        } catch (e) { console.error("Erro ao carregar produtos:", e) }
        finally { setLoadingEsperados(false) }
    }

    const handleFinalizarSimples = async () => {
        if (!localizacaoSimples || codigosSimples.length === 0) return
        setConferindoSimples(true)
        try {
            const r = await authFetch("/api/conferencia/comparar", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id_localizacao: localizacaoSimples.id, codigos_lidos: codigosSimples }),
            })
            if (!r.ok) throw new Error("Erro na conferência")
            const res = await r.json()
            setResultadoSimples(res)
            setEtapaSimples("resultado")
        } catch (e: any) { alert(e.message || "Erro ao conferir") }
        finally { setConferindoSimples(false) }
    }

    const reiniciarSimples = () => {
        setEtapaSimples("alvo")
        setLocalizacaoSimples(null)
        setCodigosSimples([])
        setResultadoSimples(null)
        setModo("simples")
    }

    // ── Handlers Fluxo Categoria ──
    const handleSelectCat = async (c: Categoria) => {
        setModo("categoria")
        setCarregandoCatProds(true)
        try {
            const r = await api.get(`/api/estoque/produtos/?categoria_id=${c.id}&ativo=true&estoque=positivo&limit=2000&painel=true`)
            const prods = Array.isArray(r) ? r : r?.items ?? []
            const novaSessao: SessaoCategoria = {
                categoria: c,
                localizacoesConferidas: [],
                todosProdutos: prods,
                iniciadaEm: new Date().toISOString()
            }
            setSessaoCategoria(novaSessao)
            // Salvar no localStorage
            localStorage.setItem(`conferencia_sessao_${c.id}`, JSON.stringify(novaSessao))
        } catch (e) { console.error("Erro ao carregar produtos da categoria:", e) }
        finally { setCarregandoCatProds(false) }
        setEtapaCat("loc_select")
    }

    const handleSelectLocCat = async (l: Localizacao) => {
        if (!sessaoCategoria) return
        setLocAtual(l)
        setCodigosCat([])
        setResultadoLocAtual(null)

        // Filtrar produtos desta localização dentro da categoria
        const prodsDaLoc = sessaoCategoria.todosProdutos.filter(p => p.localizacao_id === l.id)
        setProdutosLocAtual(prodsDaLoc)
        setEtapaCat("leitura")
    }

    const handleFinalizarCat = async () => {
        if (!sessaoCategoria || !locAtual || codigosCat.length === 0) return
        setConferindoCat(true)
        try {
            // Calcular resultado localmente (como no fluxo original de categoria)
            const corretos: Produto[] = []
            const faltantes: Produto[] = []
            const excedentes: Excedente[] = []

            produtosLocAtual.forEach(p => {
                const qtdEsperada = Number(p.estoque_atual) || 1
                const nSku = normalizeCode(p.sku)
                const nEti = normalizeCode(p.codigo_etiqueta)
                const nBar = normalizeCode(p.codigo_barras)
                const qtdLida = codigosCat.filter(c => c === nSku || (nEti && c === nEti) || (nBar && c === nBar)).length
                if (qtdLida >= qtdEsperada) corretos.push(p)
                else faltantes.push({ ...p, _lidos: qtdLida } as any)
            })

            // Excedentes: escaneados que não são da lista desta localização
            const codigosUnicos = [...new Set(codigosCat)]
            for (const cod of codigosUnicos) {
                if (!produtosLocAtual.some(p => {
                    const nSku = normalizeCode(p.sku)
                    const nEti = normalizeCode(p.codigo_etiqueta)
                    const nBar = normalizeCode(p.codigo_barras)
                    return cod === nSku || (nEti && cod === nEti) || (nBar && cod === nBar)
                })) {
                    let prodInfo: Produto | null = null
                    try {
                        const pRes = await api.get(`/api/estoque/produtos/?q=${cod}&limit=10`)
                        const items = Array.isArray(pRes) ? pRes : pRes?.items ?? []
                        if (items.length > 0) {
                            prodInfo = items.find((item: any) => 
                                normalizeCode(item.sku) === cod || 
                                normalizeCode(item.codigo_etiqueta) === cod || 
                                normalizeCode(item.codigo_barras) === cod
                            ) || items[0]
                        }
                    } catch (e) { }
                    excedentes.push({
                        codigo_lido: cod,
                        produto: prodInfo,
                        motivo: prodInfo
                            ? prodInfo.localizacao_id === locAtual.id
                                ? "Produto desta localização (sem registro de estoque?)"
                                : `Localização diferente: ${prodInfo.localizacao || "sem local"}`
                            : "Código não encontrado"
                    })
                }
            }

            const resultado: ResultadoLocalizacao = {
                corretos, faltantes, excedentes,
                resumo: {
                    total_sistema: produtosLocAtual.length,
                    total_lidos: codigosCat.length,
                    ok: corretos.length,
                    faltantes: faltantes.length,
                    excedentes: excedentes.length,
                    percentual_conferido: produtosLocAtual.length > 0
                        ? Math.round((corretos.length / produtosLocAtual.length) * 100 * 10) / 10 : 0
                }
            }
            setResultadoLocAtual(resultado)
            setEtapaCat("resultado")
        } catch (e: any) { alert(e.message || "Erro ao processar") }
        finally { setConferindoCat(false) }
    }

    const handleSalvarLocalizacao = (resultado: ResultadoLocalizacao, encerrar: boolean) => {
        if (!sessaoCategoria || !locAtual) return
        const novaConf: ConferenciaLocalizacao = {
            localizacao: locAtual,
            codigosLidos: codigosCat,
            resultado,
            salvaEm: new Date().toISOString()
        }
        const novaSessao: SessaoCategoria = {
            ...sessaoCategoria,
            localizacoesConferidas: [
                ...sessaoCategoria.localizacoesConferidas.filter(l => l.localizacao.id !== locAtual.id),
                novaConf
            ]
        }
        setSessaoCategoria(novaSessao)
        localStorage.setItem(`conferencia_sessao_${sessaoCategoria.categoria.id}`, JSON.stringify(novaSessao))

        if (encerrar) {
            // Ir para panorama final
            setEtapaCat("panorama")
        } else {
            // Voltar para seleção de localização
            setLocAtual(null)
            setCodigosCat([])
            setResultadoLocAtual(null)
            setProdutosLocAtual([])
            setEtapaCat("loc_select")
        }
    }

    const handleEncerrarCategoria = () => {
        if (!sessaoCategoria || !locAtual) {
            // Encerrar direto se não há localização em andamento
            setEtapaCat("panorama")
            return
        }
        // Há localização em andamento — salvar estado atual e encerrar
        if (resultadoLocAtual) {
            handleSalvarLocalizacao(resultadoLocAtual, true)
        } else {
            setEtapaCat("panorama")
        }
    }

    const handleEncerrarCategoriaFromLocSelect = () => {
        setEtapaCat("panorama")
    }

    const reiniciarCategoria = () => {
        // Limpa localStorage da sessão anterior
        if (sessaoCategoria) localStorage.removeItem(`conferencia_sessao_${sessaoCategoria.categoria.id}`)
        setEtapaCat("cat_select")
        setSessaoCategoria(null)
        setLocAtual(null)
        setCodigosCat([])
        setResultadoLocAtual(null)
        setProdutosLocAtual([])
    }

    const reiniciarTudo = () => {
        reiniciarSimples()
        reiniciarCategoria()
        setModo("simples")
    }

    const handleVoltar = () => {
        if (modo === "simples") {
            if (etapaSimples === "leitura") setEtapaSimples("alvo")
            else if (etapaSimples === "resultado") setEtapaSimples("leitura")
        } else {
            if (etapaCat === "loc_select") {
                reiniciarCategoria()
            } else if (etapaCat === "leitura") {
                setEtapaCat("loc_select")
                setLocAtual(null)
                setCodigosCat([])
                setResultadoLocAtual(null)
                setProdutosLocAtual([])
            } else if (etapaCat === "resultado") {
                setEtapaCat("leitura")
            } else if (etapaCat === "panorama") {
                setEtapaCat("loc_select")
            }
        }
    }

    // ── Breadcrumb / barra de progresso ──
    const getEtapas = () => {
        if (modo === "simples") {
            return [
                { id: "alvo", label: "Alvo" },
                { id: "leitura", label: "Leitura" },
                { id: "resultado", label: "Resultado" },
            ]
        } else {
            return [
                { id: "cat_select", label: "Categoria" },
                { id: "loc_select", label: "Localização" },
                { id: "leitura", label: "Leitura" },
                { id: "resultado", label: "Resultado" },
                { id: "panorama", label: "Panorama" },
            ]
        }
    }

    const getEtapaAtual = () => modo === "simples" ? etapaSimples : etapaCat
    const etapas = getEtapas()
    const etapaAtual = getEtapaAtual()
    const etapaIdx = etapas.findIndex(e => e.id === etapaAtual)

    // Render
    const renderConteudo = () => {
        // Fluxo SIMPLES (Por Localização)
        if (modo === "simples") {
            if (etapaSimples === "alvo") {
                return <EtapaAlvo onSelectLoc={handleSelectLoc} onSelectCat={handleSelectCat} />
            }
            if (etapaSimples === "leitura" && localizacaoSimples) {
                return (
                    <div className="space-y-4">
                        {loadingEsperados && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
                                <Loader2 className="w-3 h-3 animate-spin" /> Carregando produtos...
                            </div>
                        )}
                        <EtapaLeitura
                            alvoNome={locNome(localizacaoSimples)}
                            codigos={codigosSimples}
                            setCodigos={setCodigosSimples as any}
                            onFinalizar={handleFinalizarSimples}
                            produtosEsperados={produtosEsperadosSimples}
                            finalizando={conferindoSimples}
                        />
                    </div>
                )
            }
            if (etapaSimples === "resultado" && resultadoSimples && localizacaoSimples) {
                return (
                    <EtapaResultadoSimples
                        resultado={resultadoSimples}
                        alvoNome={locNome(localizacaoSimples)}
                        localizacaoId={localizacaoSimples.id}
                        onReiniciar={reiniciarSimples}
                    />
                )
            }
        }

        // Fluxo CATEGORIA
        if (modo === "categoria") {
            if (etapaCat === "cat_select") {
                return <EtapaAlvo onSelectLoc={handleSelectLoc} onSelectCat={handleSelectCat} />
            }
            if (etapaCat === "loc_select" && sessaoCategoria) {
                return (
                    <EtapaSelecaoLocalizacaoCat
                        sessao={sessaoCategoria}
                        onSelectLoc={handleSelectLocCat}
                        onEncerrarCategoria={handleEncerrarCategoriaFromLocSelect}
                        carregando={carregandoCatProds}
                    />
                )
            }
            if (etapaCat === "leitura" && locAtual && sessaoCategoria) {
                return (
                    <EtapaLeitura
                        alvoNome={`${sessaoCategoria.categoria.nome} › ${locNome(locAtual)}`}
                        codigos={codigosCat}
                        setCodigos={setCodigosCat as any}
                        onFinalizar={handleFinalizarCat}
                        produtosEsperados={produtosLocAtual}
                        finalizando={conferindoCat}
                    />
                )
            }
            if (etapaCat === "resultado" && resultadoLocAtual && locAtual && sessaoCategoria) {
                return (
                    <EtapaResultadoLocalizacao
                        resultado={resultadoLocAtual}
                        localizacao={locAtual}
                        categoria={sessaoCategoria.categoria}
                        onSalvarEContinuar={(r) => handleSalvarLocalizacao(r, false)}
                        onSalvarEEncerrar={(r) => handleSalvarLocalizacao(r, true)}
                    />
                )
            }
            if (etapaCat === "panorama" && sessaoCategoria) {
                return (
                    <EtapaPanoramaCategoria
                        sessao={sessaoCategoria}
                        onNovaCat={reiniciarCategoria}
                        onNovaSessao={reiniciarTudo}
                    />
                )
            }
        }

        // Fallback
        return <EtapaAlvo onSelectLoc={handleSelectLoc} onSelectCat={handleSelectCat} />
    }

    return (
        <div className="w-full max-w-4xl mx-auto space-y-6 pb-20">
            {/* Barra de progresso */}
            <div className="flex items-center gap-2 mb-4">
                {etapas.map((e, i) => (
                    <div key={e.id} className="flex-1 flex flex-col gap-1">
                        <div className={cn("h-1.5 rounded-full transition-all", i <= etapaIdx ? "bg-primary" : "bg-muted")} />
                        <span className={cn("text-[10px] font-bold uppercase", i <= etapaIdx ? "text-primary" : "text-muted-foreground")}>{e.label}</span>
                    </div>
                ))}
            </div>

            {/* Header: Botão Voltar + Breadcrumb */}
            {((modo === "simples" && etapaSimples !== "alvo") || (modo === "categoria" && etapaCat !== "cat_select")) && (
                <div className="flex items-center gap-3 mb-2">
                    <Button variant="outline" size="sm" onClick={handleVoltar} className="h-8 gap-1.5 px-2">
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span className="text-xs">Voltar</span>
                    </Button>
                    
                    {modo === "categoria" && sessaoCategoria && etapaCat !== "cat_select" && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap flex-1">
                            <span className="font-semibold text-foreground">{sessaoCategoria.categoria.nome}</span>
                            {locAtual && (etapaCat === "leitura" || etapaCat === "resultado") && (
                                <>
                                    <ChevronRight className="w-3 h-3" />
                                    <span className="font-semibold text-foreground">{locNome(locAtual)}</span>
                                </>
                            )}
                            {sessaoCategoria.localizacoesConferidas.length > 0 && (
                                <Badge variant="outline" className="ml-auto text-[10px] gap-1 shrink-0">
                                    <LayoutList className="w-3 h-3" />
                                    {sessaoCategoria.localizacoesConferidas.length} loc{sessaoCategoria.localizacoesConferidas.length !== 1 ? "s" : ""}
                                </Badge>
                            )}
                        </div>
                    )}
                </div>
            )}

            <Card className="shadow-none border-none sm:border-solid bg-transparent sm:bg-card">
                <CardContent className="p-0 sm:p-6">
                    {renderConteudo()}
                </CardContent>
            </Card>
        </div>
    )
}