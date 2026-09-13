import { useEffect, useState, useMemo, useCallback, useLayoutEffect, lazy, Suspense } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Modal } from "@/components/ui/modal"
import { cn } from '@/lib/utils'
import {
    Car, Plus, Search, ChevronLeft, ChevronRight, Package, MapPin, DollarSign, Upload, X, Database,
    Wrench, CheckCircle2, AlertCircle, RefreshCw, BarChart2, Camera, ExternalLink, Download,
    Trash2, Pencil, ArrowRight, ClipboardList, Layers, ListChecks, Filter, Brain,
    Scissors, Tag, Check, Printer, Award, TrendingUp, Users, FileBarChart2, Star, PlusCircle,
    FileText, UserCheck, Snowflake, Settings, Cog, CircleDot, Zap, Wind, Thermometer, Box,
    ArrowLeft, Disc, Speaker, Shield, Battery, Gauge, Droplet, Move, Eye, EyeOff, Video, Store
} from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useProdutosCache } from "@/store/produtosCache"
import { useInvalidateStaticResource } from "@/hooks/useStaticResources"
import { DismantlingChecklistDialog } from "@/components/DismantlingChecklistDialog"
import { Link } from "react-router-dom"
import { useAuthStore } from "@/store/authStore"
import { getAuthToken } from "@/lib/auth"
import { fmt, fmtDate } from "@/lib/format"
import { getApiBaseUrl } from "@/lib/apiBase"
import { api, localizacoesApi, configuracoesApi, sucatasApi, financeiroApi, estoqueApi, plateApi } from "@/lib/api"
import { countNewImageUrls, registarFotosSucataVeiculo } from "@/lib/fotoContribuicao"
import { crmPermissionHint, humanErrorMessage, isRlsPermissionError } from "@/lib/permissionErrors"
import { logAcao } from "@/lib/systemLog"
import { emptyMirrorStats, mirrorSucataRowFotos, isUrlAlreadyOnOurStorage } from "@/lib/mirrorImportImages"
import { parseSucataFotos, normalizeFotoDisplayUrl } from "@/lib/imagemUrls"
import { canonicalProdutosImageUrl } from "@/lib/storageProdutosUrl"
import { buildNomeProdutoPecaSucata } from "@/lib/nomeProdutoSucata"
import { SucataCompatibilidadesPanel } from "@/components/SucataCompatibilidadesPanel"
import { uploadPanelProdutoImageFile, uploadSucataVideoFile } from "@/lib/uploadProdutoPainel"
import { PartPhotoCameraModal } from "@/components/PartPhotoCameraModal"
import { SucataVideoCameraModal } from "@/components/SucataVideoCameraModal"

import { MLIcon } from "@/components/MLIcon"
import { QrCameraScanner } from "@/components/QrCameraScanner"
// Lazy: pesa ~1MB (@react-pdf/renderer). Só carrega quando o botão é renderizado.
const GenerateCatalogButton = lazy(() =>
  import("@/components/GenerateCatalogButton").then(m => ({ default: m.GenerateCatalogButton }))
)

// ─── Types ───────────────────────────────────────────────────────────────────

type SucataStatus = "Aguardando" | "Em Desmontagem" | "Concluída" | "Alienada"
// "Produto inativo": o produto vinculado foi desativado (ex.: pela Conferência
// de Estoque) e sumiu da listagem, mas a peça continua fisicamente no galpão.
type PecaStatus = "Disponível" | "Cadastrada no Estoque" | "Vendida" | "Descartada" | "Produto inativo"
export type PecaCondicao = "Ótima" | "Boa" | "Regular" | "Danificada"

interface Sucata {
    id: string
    codigo: string
    status: SucataStatus
    placa: string | null
    chassi: string | null
    marca: string
    modelo: string
    ano_fabricacao: number | null
    ano_modelo: number | null
    cor: string | null
    combustivel: string | null
    km_entrada: number | null
    condicao: string | null
    data_compra: string
    valor_compra: number
    valor_frete: number
    outros_custos: number
    custo_total: number
    local_armazenagem: string | null
    fotos: string[] | null
    videos: string[] | null
    doc_importado_url: string | null
    observacoes: string | null
    responsavel_id: string | null
    created_at: string
    // Novos campos adicionados v125
    numero_motor?: string | null
    cilindrada?: string | null
    potencia_cv?: string | null
    cv?: number | null
    // Agregados v126 (Importação)
    modelo_grupo_peca?: string | null
    fornecedor?: string | null
    certidao_baixa?: string | null
    data_desmontagem?: string | null
    valor_vendido?: number | null
    lucro_bruto?: number | null
    margem_bruta?: number | null
    /** Concatenado ao nome da categoria ao gerar produto; se vazio, usa marca/modelo/ano. */
    nome_complemento_produto?: string | null
    // Integração Loja Online
    mostrar_na_loja?: boolean
    fotos_loja?: string[] | null
    // Agregados do join
    pecas_count?: number
    pecas_disponiveis?: number
}

interface SucataPeca {
    id: string
    sucata_id: string
    produto_id: string | null
    atendente_id?: string | null
    desmontador_id?: string | null
    nome: string
    descricao: string | null
    part_number: string | null
    condicao: PecaCondicao
    localizacao_id: string | null
    custo_estimado: number
    preco_venda: number
    /** Unidades nesta linha (preço unitário × quantidade entra no rateio). */
    quantidade?: number
    valor_venda_real?: number | null
    status: PecaStatus
    fotos: string[]
    created_at: string
    venda_id?: string | null
    data_venda?: string | null
    localizacoes?: { nome: string; sigla: string | null }
    produtos?: { sku: string; nome: string } | null
    vendas?: { numero_pedido: number; data_venda: string } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const statusColors: Record<string, string> = {
    "Aguardando": "bg-slate-100 text-slate-600 border-slate-200",
    "Em Desmontagem": "bg-amber-100 text-amber-700 border-amber-200",
    "Concluída": "bg-emerald-100 text-emerald-700 border-emerald-200",
    "Alienada": "bg-rose-100 text-rose-700 border-rose-200"
}

const pecaStatusColors: Record<string, string> = {
    "Disponível": "bg-emerald-100 text-emerald-700",
    "Cadastrada no Estoque": "bg-blue-100 text-blue-700",
    "Produto inativo": "bg-amber-100 text-amber-800 border border-amber-300",
    "Vendida": "bg-purple-100 text-purple-700",
    "Descartada": "bg-slate-100 text-slate-500"
}

const condicaoColors: Record<string, string> = {
    "Ótima": "text-emerald-600",
    "Boa": "text-blue-600",
    "Regular": "text-amber-600",
    "Danificada": "text-rose-600"
}

// ─── Blank forms ──────────────────────────────────────────────────────────────

const BLANK_SUCATA = {
    codigo: "",
    status: "Aguardando" as SucataStatus,
    placa: "", chassi: "", marca: "", modelo: "",
    ano_fabricacao: new Date().getFullYear(), ano_modelo: new Date().getFullYear(),
    cor: "", combustivel: "Flex", km_entrada: 0, condicao: "Batida",
    data_compra: new Date().toISOString().split("T")[0],
    valor_compra: 0, valor_frete: 0, outros_custos: 0,
    local_armazenagem: "", observacoes: "",
    numero_motor: "", cilindrada: "", potencia_cv: "", cv: null,
    modelo_grupo_peca: "", fornecedor: "", certidao_baixa: "",
    mostrar_na_loja: false, fotos_loja: [],
    data_desmontagem: "", valor_vendido: 0, lucro_bruto: 0, margem_bruta: 0,

    nome_complemento_produto: "",
    videos: [],
}

const BLANK_PECA = {
    nome: "", descricao: "", part_number: "", condicao: "Boa" as PecaCondicao,
    localizacao_id: "", custo_estimado: 0, preco_venda: 0, quantidade: 1, status: "Disponível" as PecaStatus
}

function normalizeVinInput(raw: string): string {
    return raw.replace(/[\s.\-_]/g, "").toUpperCase()
}

/** Combustível do formulário sucata (valores do <Select>) a partir do texto NHTSA. */
function mapNhtsaFuelToCombustivel(raw: string): string | null {
    const t = (raw || "").toLowerCase()
    if (!t) return null
    if (t.includes("flex") || (t.includes("ethanol") && t.includes("gas"))) return "Flex"
    if (t.includes("diesel")) return "Diesel"
    if (t.includes("electric")) return "Elétrico"
    if (t.includes("cng") || t.includes("compressed natural") || t.includes("natural gas")) return "GNV"
    if (t.includes("hybrid")) return "Híbrido"
    if (t.includes("gasoline") || t.includes("petrol")) return "Gasolina"
    return null
}

/** Texto em PT-BR vindo de APIs brasileiras (placa). */
function normalizeCombustivelBr(raw: string): string | null {
    const t = String(raw || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
    if (!t) return null
    if (t.includes("flex")) return "Flex"
    if (t.includes("diesel")) return "Diesel"
    if (t.includes("eletr")) return "Elétrico"
    if (t.includes("gnv") || t.includes("gas natural")) return "GNV"
    if (t.includes("hibrid")) return "Híbrido"
    if (t.includes("gasolina")) return "Gasolina"
    if (t.includes("alcool") || t.includes("etanol")) {
        if (t.includes("gasolina") || t.includes("flex")) return "Flex"
        return "Gasolina"
    }
    return null
}

function mapAnyFuelToCombustivel(raw: string): string | null {
    return normalizeCombustivelBr(raw) || mapNhtsaFuelToCombustivel(raw)
}

/** Exibe foto da sucata com fallback se URL inválida ou erro de rede (404, CORS, link expirado). */
function SucataFotoImg({ src, alt = "", imgClassName }: { src: string; alt?: string; imgClassName?: string }) {
    const [failed, setFailed] = useState(false)
    const raw = typeof src === "string" ? src.trim() : ""
    // canonicalProdutosImageUrl pode devolver "" para URLs HTTPS externas ou com padrões legados;
    // o modal de produtos usa <img src> direto — alinhar com normalizeFotoDisplayUrl + raw.
    const safe = (raw ? canonicalProdutosImageUrl(raw) : "") || normalizeFotoDisplayUrl(raw) || ""

    useLayoutEffect(() => {
        setFailed(false)
    }, [src])

    if (!safe || failed) {
        return (
            <div className="flex h-full w-full min-h-[4rem] items-center justify-center bg-muted">
                <Camera className="h-8 w-8 opacity-25" aria-hidden />
            </div>
        )
    }
    return (
        <img
            src={safe}
            alt={alt}
            className={imgClassName}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
        />
    )
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function Sucatas() {
    const { atendente } = useAuthStore()

    // Data
    const [sucatas, setSucatas] = useState<Sucata[]>([])
    const [locations, setLocations] = useState<{ id: string; nome: string; sigla: string | null; parent_id: string | null }[]>([])
    const [loading, setLoading] = useState(true)

    // View
    const [view, setView] = useState<"list" | "detail" | "comissoes" | "relatorio">("list")
    const { invalidateSucatas } = useInvalidateStaticResource()
    const categorias = useProdutosCache(state => state.categorias) || []
    const sucatasStore = useProdutosCache(state => state.sucatas) || []
    const [comissaoMes, setComissaoMes] = useState(() => new Date().toISOString().slice(0, 7))
    const [comissaoData, setComissaoData] = useState<any[]>([])
    const [relatorioVendas, setRelatorioVendas] = useState<{
        porSucata: Array<{
            sucata: { id: string; codigo: string; marca: string; modelo: string; placa?: string | null; ano_modelo?: number | null }
            qtd: number
            totalCusto: number
            totalReceita: number
            lucro: number
            margem: number
            itens: Array<{ id: string; nome: string; sku?: string; custo: number; preco: number; lucro: number; margem: number; pedido?: number; data?: string }>
        }>
        totais: { qtd: number; custo: number; receita: number; lucro: number; margem: number }
    } | null>(null)
    const [loadingRelatorio, setLoadingRelatorio] = useState(false)
    const [selectedSucata, setSelectedSucata] = useState<Sucata | null>(null)
    const [pecas, setPecas] = useState<SucataPeca[]>([])
    const [loadingPecas, setLoadingPecas] = useState(false)

    // Filters
    const [search, setSearch] = useState("")
    const [filterStatus, setFilterStatus] = useState("todos")
    const [filterPecaStatus, setFilterPecaStatus] = useState<"todos" | "Disponível" | "Cadastrada no Estoque" | "Vendida" | "Descartada">("todos")
    const [searchPeca, setSearchPeca] = useState("")

    // Pagination
    const [currentPage, setCurrentPage] = useState(1)
    const ITEMS_PER_PAGE = 12

    // Modals
    const [isSucataModalOpen, setIsSucataModalOpen] = useState(false)
    const [isPecaModalOpen, setIsPecaModalOpen] = useState(false)
    const [editingSucata, setEditingSucata] = useState<Sucata | null>(null)
    const [editingPeca, setEditingPeca] = useState<SucataPeca | null>(null)
    const [sucataForm, setSucataForm] = useState<any>(BLANK_SUCATA)
    const [pecaForm, setPecaForm] = useState<any>(BLANK_PECA)
    const [pecaDesmontadorId, setPecaDesmontadorId] = useState<string>("")
    const [submitting, setSubmitting] = useState(false)
    const [isDecodingVin, setIsDecodingVin] = useState(false)
    const [isDecodingPlate, setIsDecodingPlate] = useState(false)

    // Dismantling Checklist State
    const [isChecklistOpen, setIsChecklistOpen] = useState(false)

    // Fotos da sucata
    const [sucataFotoFiles, setSucataFotoFiles] = useState<File[]>([])
    const [sucataFotoPreviews, setSucataFotoPreviews] = useState<string[]>([])
    const [sucataVideoFiles, setSucataVideoFiles] = useState<File[]>([])
    const [sucataVideoPreviews, setSucataVideoPreviews] = useState<string[]>([])
    const [isVideoModalOpen, setIsVideoModalOpen] = useState(false)
    const [salvandoCapaFotoIdx, setSalvandoCapaFotoIdx] = useState<number | null>(null)

    // Desmontagem Rápida
    const [isDesmontandoOpen, setIsDesmontandoOpen] = useState(false)
    /** `desmontagem` = peças já desmontadas; `planejado` = ainda no veículo — ambos geram produto + SKU + etiquetas (no veículo inclui fotos WMS e local Sucata). */
    const [batchModalMode, setBatchModalMode] = useState<"desmontagem" | "planejado">("desmontagem")
    /** URLs das fotos da sucata selecionadas para o lote “no veículo” (ordem = galeria do veículo). */
    const [fotosSelecionadasPlanejamento, setFotosSelecionadasPlanejamento] = useState<string[]>([])
    const [filtroGrupoCat, setFiltroGrupoCat] = useState<string>('')
    const [catsSelecionadas, setCatsSelecionadas] = useState<{ categoria: any; quantidade: any; numeracao?: string; detalhes?: string; part_number?: string; fotosCaptura?: File[]; fotosDefeito?: File[]; localizacaoLida?: string }[]>([])
    const [catsEscondidas, setCatsEscondidas] = useState<string[]>([])
    const [cameraModal, setCameraModal] = useState<{ catId: string; mode: 'produto' | 'defeito' } | null>(null)
    const [qrCameraModal, setQrCameraModal] = useState<{ catId: string } | null>(null)
    const [catPedindoInfo, setCatPedindoInfo] = useState<{ cat: any; tipo: 'numeracao' | 'detalhes' | 'ambos' } | null>(null)
    const [catInfoInput, setCatInfoInput] = useState({ numeracao: '', detalhes: '', part_number: '' })
    const [previewImg, setPreviewImg] = useState<string | null>(null)
    const [searchCat, setSearchCat] = useState('')
    const [gerandoPecas, setGerandoPecas] = useState(false)
    const [desmontadores, setDesmontadores] = useState<any[]>([])
    const [desmontadorId, setDesmontadorId] = useState<string>('')
    const [rateandoCusto, setRateandoCusto] = useState(false)
    const [viewDocOpen, setViewDocOpen] = useState(false)


    // ── Fetchers ────────────────────────────────────────────────────────────────

    const fetchSucatas = async (forceRefetch = false) => {
        if (!forceRefetch && sucatasStore.length > 0 && sucatas.length === 0) {
            setLoading(true)
            const list = Array.isArray(sucatasStore) ? sucatasStore : []
            setSucatas(list.map((s: any) => {
                const sp = s.sucatas_pecas
                const pecasArr = Array.isArray(sp) ? sp : (typeof sp === 'string' ? (() => { try { return JSON.parse(sp) } catch { return [] } })() : [])
                return {
                    ...s,
                    mostrar_na_loja: s.mostrar_na_loja === true || s.mostrar_na_loja === 'true' || s.mostrar_na_loja === 't' || s.mostrar_na_loja === 1,
                    fotos: parseSucataFotos(s.fotos)
                        .map((u) => (typeof u === "string" ? u.trim() : ""))
                        .filter((u) => u.length > 0),
                    pecas_count: typeof s.pecas_count === 'number' ? s.pecas_count : (pecasArr?.length || 0),
                    pecas_disponiveis: pecasArr?.filter((p: any) => p.status === "Disponível").length || 0,
                }
            }))
            setLoading(false)
            return
        }

        setLoading(true)
        try {
            const data = await sucatasApi.listar({ limit: 5000 })
            const list = Array.isArray(data) ? data : []
            setSucatas(list.map((s: any) => {
                const sp = s.sucatas_pecas
                const pecasArr = Array.isArray(sp) ? sp : (typeof sp === 'string' ? (() => { try { return JSON.parse(sp) } catch { return [] } })() : [])
                return {
                    ...s,
                    mostrar_na_loja: s.mostrar_na_loja === true || s.mostrar_na_loja === 'true' || s.mostrar_na_loja === 't' || s.mostrar_na_loja === 1,
                    fotos: parseSucataFotos(s.fotos)
                        .map((u) => (typeof u === "string" ? u.trim() : ""))
                        .filter((u) => u.length > 0),
                    pecas_count: typeof s.pecas_count === 'number' ? s.pecas_count : (pecasArr?.length || 0),
                    pecas_disponiveis: pecasArr?.filter((p: any) => p.status === "Disponível").length || 0,
                }
            }))
            invalidateSucatas()
        } catch (e) { console.error(e) }
        finally { setLoading(false) }
    }

    const fetchResources = async () => {
        const [locs, desm] = await Promise.all([
            localizacoesApi.listar(),
            configuracoesApi.listarDesmontadores(),
        ])
        if (locs) setLocations(locs)
        if (desm) setDesmontadores(desm.filter((d: any) => d.status === 'Ativo'))
    }

    useEffect(() => {
        fetchResources()
    }, [])

    // Removed the dynamic search of categories since we will use the cached state directly

    const openModalCategorias = (mode: "desmontagem" | "planejado") => {
        setBatchModalMode(mode)
        setCatsSelecionadas([])
        setSearchCat("")
        setFiltroGrupoCat("")
        if (mode === "planejado" && selectedSucata?.fotos?.length) {
            setFotosSelecionadasPlanejamento([...selectedSucata.fotos])
        } else {
            setFotosSelecionadasPlanejamento([])
        }
        setIsDesmontandoOpen(true)
    }

    /** Ordem das fotos igual à galeria da sucata; só as marcadas entram na peça/produto. */
    const fotosPlanejamentoOrdenadas = useMemo(() => {
        if (!selectedSucata?.fotos?.length) return []
        const set = new Set(fotosSelecionadasPlanejamento)
        return selectedSucata.fotos.filter((u) => set.has(u))
    }, [selectedSucata?.fotos, fotosSelecionadasPlanejamento])

    const toggleFotoPlanejamento = useCallback((url: string) => {
        setFotosSelecionadasPlanejamento((prev) =>
            prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url]
        )
    }, [])

    const fetchPecas = useCallback(async (sucataId: string) => {
        setLoadingPecas(true)
        try {
            const normJson = (v: unknown) => {
                if (typeof v === 'string' && (v.startsWith('{') || v.startsWith('['))) {
                    try { return JSON.parse(v) } catch { return v }
                }
                return v
            }
            const data = await sucatasApi.listarPecas(sucataId)
            const rows = Array.isArray(data) ? data : []
            setPecas(rows.map((p: any) => ({
                ...p,
                localizacoes: normJson(p.localizacoes),
                produtos: normJson(p.produtos),
                vendas: normJson(p.vendas),
            })))
        } catch (e) { console.error(e) }
        finally { setLoadingPecas(false) }
    }, [])

    useEffect(() => {
        void (async () => {
            try {
                await Promise.all([fetchSucatas(), fetchResources()])
            } catch (e) {
                console.error("[Sucatas] Error initializing page:", e)
            }
        })()
    }, [])

    useEffect(() => {
        const fetchMlAccounts = async () => {
            try {
                const { meliAccounts, fetchStaticResources } = useProdutosCache.getState()
                if (meliAccounts.length === 0) {
                    await fetchStaticResources()
                }
                const rows = useProdutosCache.getState().meliAccounts
                const list = Array.isArray(rows) ? rows : []
                setMlAccounts(
                    list
                        .filter((a: { is_active?: boolean }) => a?.is_active !== false)
                        .map((a: { id: string; ml_nickname?: string | null }) => ({
                            id: a.id,
                            ml_nickname: a.ml_nickname ?? null,
                        }))
                )
            } catch {
                setMlAccounts([])
            }
        }
        fetchMlAccounts()
    }, [])

    // ── Computed ─────────────────────────────────────────────────────────────────

    const filtered = useMemo(() => sucatas.filter(s => {
        const term = (search || "").toLowerCase()
        const matchSearch = !search ||
            (s.codigo || "").toLowerCase().includes(term) ||
            (s.marca || "").toLowerCase().includes(term) ||
            (s.modelo || "").toLowerCase().includes(term) ||
            (s.placa || "").toLowerCase().includes(term)
        const matchStatus = filterStatus === "todos" || s.status === filterStatus
        return matchSearch && matchStatus
    }), [sucatas, search, filterStatus])

    useEffect(() => {
        setCurrentPage(1)
    }, [search, filterStatus])

    const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE)
    const paginatedSucatas = useMemo(() => {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
        return filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE)
    }, [filtered, currentPage])

    const stats = useMemo(() => ({
        total: sucatas.length,
        ativas: sucatas.filter(s => s.status === "Em Desmontagem").length,
        custo: sucatas.reduce((a, s) => a + (s.custo_total || 0), 0),
        pecas: sucatas.reduce((a, s) => a + (s.pecas_count || 0), 0)
    }), [sucatas])

    // IDs dos produtos do estoque já cadastrados a partir das peças desta sucata
    const produtoIdsParaPublicar = useMemo(() =>
        pecas
            .filter(p => p.produto_id && p.status === "Cadastrada no Estoque")
            .map(p => p.produto_id as string),
        [pecas]
    )

    const filteredPecas = useMemo(() => {
        let result = pecas
        if (filterPecaStatus !== "todos") {
            result = result.filter(p => p.status === filterPecaStatus)
        }
        if (searchPeca) {
            const term = searchPeca.toLowerCase()
            result = result.filter(p => 
                (p.nome || "").toLowerCase().includes(term) ||
                (p.part_number || "").toLowerCase().includes(term) ||
                (p.produtos?.sku || "").toLowerCase().includes(term)
            )
        }
        return result
    }, [pecas, filterPecaStatus, searchPeca])

    const pecasVendidasReport = useMemo(() => {
        const vendidas = pecas.filter(p => p.status === "Vendida")
        if (vendidas.length === 0) return null
        const valorEfetivo = (p: typeof vendidas[0]) => (p.valor_venda_real != null ? p.valor_venda_real : p.preco_venda) || 0
        const totalCusto = vendidas.reduce((a, p) => a + (p.custo_estimado || 0), 0)
        const totalReceita = vendidas.reduce((a, p) => a + valorEfetivo(p), 0)
        const lucroTotal = totalReceita - totalCusto
        const margemMedia = totalReceita > 0 ? (lucroTotal / totalReceita) * 100 : 0
        return {
            itens: vendidas.map(p => {
                const custo = p.custo_estimado || 0
                const precoCadastrado = p.preco_venda || 0
                const valorReal = valorEfetivo(p)
                const lucro = valorReal - custo
                const margem = valorReal > 0 ? (lucro / valorReal) * 100 : 0
                return { ...p, precoCadastrado, valorReal, lucro, margem }
            }),
            totalCusto,
            totalReceita,
            lucroTotal,
            margemMedia
        }
    }, [pecas])

    // ── SUCATA CRUD ─────────────────────────────────────────────────────────────

    const openNewSucata = () => {
        setEditingSucata(null)
        setSucataForm({ ...BLANK_SUCATA })
        setSucataFotoFiles([])
        setSucataFotoPreviews([])
        setSucataVideoFiles([])
        setSucataVideoPreviews([])
        setIsSucataModalOpen(true)
    }

    const openEditSucata = (s: Sucata) => {
        setEditingSucata(s)
        setSucataForm({
            codigo: s.codigo,
            status: s.status,
            placa: s.placa || "",
            chassi: s.chassi || "",
            marca: s.marca,
            modelo: s.modelo,
            ano_fabricacao: s.ano_fabricacao || new Date().getFullYear(),
            ano_modelo: s.ano_modelo || new Date().getFullYear(),
            cor: s.cor || "",
            combustivel: s.combustivel || "Flex",
            km_entrada: s.km_entrada || 0,
            condicao: s.condicao || "Batida",
            data_compra: s.data_compra,
            valor_compra: s.valor_compra,
            valor_frete: s.valor_frete,
            outros_custos: s.outros_custos,
            local_armazenagem: s.local_armazenagem || "",
            observacoes: s.observacoes || "",
            nome_complemento_produto: s.nome_complemento_produto ?? "",
            // Novos campos v125+
            numero_motor: s.numero_motor || "",
            cilindrada: s.cilindrada || "",
            potencia_cv: s.potencia_cv || "",
            cv: s.cv,
            modelo_grupo_peca: s.modelo_grupo_peca || "",
            fornecedor: s.fornecedor || "",
            certidao_baixa: s.certidao_baixa || "",
            data_desmontagem: s.data_desmontagem || "",
            valor_vendido: s.valor_vendido || 0,
            lucro_bruto: s.lucro_bruto || 0,
            margem_bruta: s.margem_bruta || 0,
            mostrar_na_loja: s.mostrar_na_loja === true || (s.mostrar_na_loja as any) === 'true' || (s.mostrar_na_loja as any) === 't' || (s.mostrar_na_loja as any) === 1,
            fotos_loja: Array.isArray(s.fotos_loja) ? s.fotos_loja : (s.fotos_loja ? [s.fotos_loja] : []),
        })
        setSucataFotoFiles([])
        setSucataFotoPreviews(s.fotos || [])
        setSucataVideoFiles([])
        setSucataVideoPreviews(s.videos || [])
        setIsSucataModalOpen(true)
    }

    const handleSaveSucata = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!sucataForm.marca || !sucataForm.modelo) return alert("Marca e modelo são obrigatórios.")
        setSubmitting(true)
        try {
            // Mantém URLs já salvas (http(s), //, caminhos sucatas/…); data: vem só de ficheiros novos no loop abaixo.
            const existingUrls: string[] = []
            const finalFotosLoja: string[] = []
            const newBlobUrls = sucataFotoPreviews.filter(p => p.startsWith("blob:") || p.startsWith("data:"))
            
            for (const p of sucataFotoPreviews) {
                if (typeof p !== "string" || !p.trim()) continue
                if (p.trim().startsWith("data:") || p.trim().startsWith("blob:")) continue
                const n = canonicalProdutosImageUrl(p.trim())
                if (n) {
                    existingUrls.push(n)
                    if (sucataForm.fotos_loja?.includes(p)) {
                        finalFotosLoja.push(n)
                    }
                }
            }
            const uploaded: string[] = [...existingUrls]
            const failed: string[] = []
            
            for (let i = 0; i < sucataFotoFiles.length; i++) {
                const file = sucataFotoFiles[i]
                try {
                    const url = await uploadPanelProdutoImageFile(file)
                    if (url) {
                        uploaded.push(url)
                        if (sucataForm.fotos_loja?.includes(newBlobUrls[i])) {
                            finalFotosLoja.push(url)
                        }
                    } else {
                        failed.push(file.name)
                    }
                } catch (e) {
                    console.error(e)
                    failed.push(file.name)
                }
            }

            if (failed.length > 0) {
                alert(`⚠️ ${uploaded.length - existingUrls.length} foto(s) nova(s) salva(s). Falha em: ${failed.join(', ')}`)
            }
            
            const uploadedUrls = uploaded

            const existingVideoUrls: string[] = []
            for (const p of sucataVideoPreviews) {
                if (typeof p !== "string" || !p.trim()) continue
                if (p.trim().startsWith("data:") || p.trim().startsWith("blob:")) continue
                existingVideoUrls.push(p.trim())
            }
            const uploadedVideos: string[] = [...existingVideoUrls]
            const failedVideos: string[] = []
            for (const file of sucataVideoFiles) {
                try {
                    const url = await uploadSucataVideoFile(file)
                    if (url) uploadedVideos.push(url)
                    else failedVideos.push(file.name)
                } catch (e) {
                    console.error(e)
                    failedVideos.push(file.name)
                }
            }
            if (failedVideos.length > 0) {
                alert(`⚠️ Falha ao salvar vídeos: ${failedVideos.join(', ')}`)
            }

            const payload = {
                ...sucataForm,
                codigo: sucataForm.codigo || undefined,
                placa: sucataForm.placa || null,
                chassi: sucataForm.chassi || null,
                cor: sucataForm.cor || null,
                // Evita enviar "" para colunas DATE (Postgres rejeita: invalid input syntax for type date: "").
                data_compra: (sucataForm.data_compra || "").trim() ? sucataForm.data_compra : new Date().toISOString().split("T")[0],
                data_desmontagem: (sucataForm.data_desmontagem || "").trim() ? sucataForm.data_desmontagem : null,
                local_armazenagem: sucataForm.local_armazenagem || null,
                observacoes: sucataForm.observacoes || null,
                responsavel_id: atendente?.id || null,
                valor_compra: parseFloat(sucataForm.valor_compra as any) || 0,
                valor_frete: parseFloat(sucataForm.valor_frete as any) || 0,
                outros_custos: parseFloat(sucataForm.outros_custos as any) || 0,
                km_entrada: parseInt(sucataForm.km_entrada as any) || 0,
                ano_fabricacao: parseInt(sucataForm.ano_fabricacao as any) || null,
                ano_modelo: parseInt(sucataForm.ano_modelo as any) || null,
                nome_complemento_produto: (sucataForm.nome_complemento_produto || "").trim() || null,
                fotos: uploadedUrls,
                videos: uploadedVideos,
                mostrar_na_loja: !!sucataForm.mostrar_na_loja,
                fotos_loja: finalFotosLoja,
                // Novos campos v125+

                fornecedor: sucataForm.fornecedor || null,
                certidao_baixa: sucataForm.certidao_baixa || null,
                modelo_grupo_peca: sucataForm.modelo_grupo_peca || null,
                numero_motor: sucataForm.numero_motor || null,
                cilindrada: sucataForm.cilindrada || null,
                potencia_cv: sucataForm.potencia_cv || null,
                valor_vendido: parseFloat(sucataForm.valor_vendido as any) || 0,
                lucro_bruto: parseFloat(sucataForm.lucro_bruto as any) || 0,
                margem_bruta: parseFloat(sucataForm.margem_bruta as any) || 0,
                cv:
                    sucataForm.cv == null || String(sucataForm.cv).trim() === ""
                        ? null
                        : Number.isFinite(Number(sucataForm.cv))
                            ? Math.trunc(Number(sucataForm.cv))
                            : null,
            }

            const prevFotosHttp = (editingSucata?.fotos || []).filter((u): u is string => typeof u === "string" && u.startsWith("http"))
            const finalFotosHttp = uploadedUrls.filter((u): u is string => typeof u === "string" && u.startsWith("http"))
            const fotosNovas = countNewImageUrls(prevFotosHttp, finalFotosHttp)

            let sucataIdGravada: string | null = editingSucata?.id ?? null

            if (editingSucata) {
                await sucatasApi.atualizar(editingSucata.id, payload)
            } else {
                const saved = await sucatasApi.criar(payload)
                sucataIdGravada = saved?.id ?? null

                // Launch automatic financial entry for the purchase
                if (saved) {
                    financeiroApi.criar({
                        tipo: "Despesa",
                        descricao: `Compra de Sucata: ${saved.codigo} — ${saved.marca} ${saved.modelo} ${saved.ano_modelo || ""}`,
                        valor: saved.custo_total,
                        data_vencimento: saved.data_compra,
                        data_pagamento: saved.data_compra,
                        status: "Pago",
                        forma_pagamento: "Outro"
                    }).catch(() => {})
                }
            }

            if (fotosNovas > 0 && sucataIdGravada && atendente?.id) {
                await registarFotosSucataVeiculo({
                    sucataId: sucataIdGravada,
                    quantidadeNovas: fotosNovas,
                    atendenteId: atendente.id,
                    origem: "sucatas_modal",
                })
            }

            logAcao(editingSucata ? 'sucata.editar' : 'sucata.criar', `${editingSucata ? 'Editada' : 'Criada'} sucata ${payload.marca} ${payload.modelo} (cod: ${payload.codigo || 'S/N'})`, atendente?.id)

            if (selectedSucata && editingSucata?.id === selectedSucata.id) {
                setSelectedSucata((prev) =>
                    prev ? { ...prev, ...payload } : prev
                )
            }

            setIsSucataModalOpen(false)
            setSucataForm(BLANK_SUCATA)
            setSucataFotoFiles([])
            setSucataFotoPreviews([])
            setSucataVideoFiles([])
            setSucataVideoPreviews([])
            setSalvandoCapaFotoIdx(null)
            await fetchSucatas(true)
            const sucataIdRateio = editingSucata?.id ?? sucataIdGravada
            if (sucataIdRateio) {
                await sucatasApi.aplicarRateio(sucataIdRateio).catch(e => console.warn("Rateio de custo da sucata:", e))
                if (selectedSucata?.id === sucataIdRateio) {
                    await fetchPecas(sucataIdRateio)
                }
            }
        } catch (e: unknown) {
            if (isRlsPermissionError(e as { code?: string; message?: string })) {
                alert(crmPermissionHint("salvar sucata/peças e fotos"))
            } else {
                alert("Erro ao salvar: " + humanErrorMessage(e))
            }
        } finally {
            setSubmitting(false)
        }
    }

    const handleDeleteSucata = async (id: string, opts?: { fecharDetalhe?: boolean }) => {
        if (!confirm("Excluir esta sucata e todas as peças vinculadas? Esta ação não pode ser desfeita.")) return
        await sucatasApi.deletar(id)
        logAcao('sucata.excluir', `Sucata excluída (id ${id.slice(0, 8)}…)`, atendente?.id)
        if (opts?.fecharDetalhe) {
            setView("list")
            setSelectedSucata(null)
        }
        await fetchSucatas(true)
    }

    /** Primeira posição do array `fotos` é a capa (lista e cards). */
    const handleDefinirFotoPrincipalSucata = async (index: number) => {
        if (!selectedSucata?.fotos?.length || index <= 0 || index >= selectedSucata.fotos.length) return
        setSalvandoCapaFotoIdx(index)
        try {
            const fotos = [...selectedSucata.fotos]
            const [x] = fotos.splice(index, 1)
            fotos.unshift(x)
            await sucatasApi.atualizar(selectedSucata.id, { fotos })
            setSelectedSucata(prev => (prev ? { ...prev, fotos } : prev))
            await fetchSucatas()
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e)
            alert("Não foi possível definir a foto de capa: " + msg)
        } finally {
            setSalvandoCapaFotoIdx(null)
        }
    }

    /** No modal de edição: reordena pré-visualização e mantém arquivos locais alinhados às miniaturas data:. */
    const moverFotoParaCapaNoModal = (fromIndex: number) => {
        setSucataFotoPreviews(oldP => {
            if (fromIndex <= 0 || fromIndex >= oldP.length) return oldP
            const newP = [...oldP]
            const [item] = newP.splice(fromIndex, 1)
            newP.unshift(item)
            setSucataFotoFiles(oldF => {
                if (!oldP[fromIndex].startsWith("data:")) return oldF
                const dataSlot = oldP.slice(0, fromIndex).filter(p => p.startsWith("data:")).length
                const nf = [...oldF]
                const [moved] = nf.splice(dataSlot, 1)
                return [moved, ...nf]
            })
            return newP
        })
    }

    const decodePlate = async () => {
        const placa = String(sucataForm.placa ?? "").replace(/[\s-]/g, "").toUpperCase()
        if (!placa || placa.length < 7) {
            alert("Informe uma placa válida (mínimo 7 caracteres).")
            return
        }

        setIsDecodingPlate(true)
        try {
            const data = await plateApi.decode({
                plate: placa,
                atendenteId: atendente?.id,
                atendenteNome: atendente?.nome
            })

            console.log('[Sucatas] Plate decode result:', data)

            const fuel = normalizeCombustivelBr(data.combustivel)

            setSucataForm((prev: typeof BLANK_SUCATA) => ({
                ...prev,
                placa: data.placa || prev.placa,
                chassi: data.chassi || prev.chassi,
                marca: data.marca || prev.marca,
                modelo: data.modelo || prev.modelo,
                ano_fabricacao: data.anoFabricacao || data.ano_fabricacao || prev.ano_fabricacao,
                ano_modelo: data.anoModelo || data.ano_modelo || prev.ano_modelo,
                cor: (data.cor || "").toUpperCase() || prev.cor,
                combustivel: fuel || prev.combustivel || "Flex",
                numero_motor: data.numero_motor || data.motor || prev.numero_motor,
                cilindrada: data.cilindrada || prev.cilindrada,
                potencia_cv: data.potencia_cv || data.potencia || prev.potencia_cv,
                cv: (Number(String(data.potencia_cv ?? '').replace(/[^\d]/g, '')) || Number(String(data.potencia ?? '').replace(/[^\d]/g, '')) || prev.cv || null),
            }))

            alert("Dados do veículo preenchidos via API Full. Por favor, revise os campos.")
        } catch (e: any) {
            console.error('[Sucatas] Error decoding plate:', e)
            alert(e.message || "Erro ao consultar a placa.")
        } finally {
            setIsDecodingPlate(false)
        }
    }

    const decodeVIN = async () => {
        const vin = normalizeVinInput(String(sucataForm.chassi ?? ""))
        if (!vin) {
            alert("Informe o chassi (VIN) com 17 caracteres.")
            return
        }
        if (vin.length !== 17) {
            alert(
                "O VIN deve ter 17 caracteres (espaços e hífens são ignorados).\n\nNota: RENAVAM não é consultado — use apenas o número do chassi gravado no veículo."
            )
            return
        }
        if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
            alert("VIN com caracteres inválidos. No chassi oficial não entram as letras I, O nem Q.")
            return
        }

        setIsDecodingVin(true)
        try {
            const res = await fetch(`${getApiBaseUrl()}/api/vin/decode?vin=${encodeURIComponent(vin)}`)
            const data = (await res.json().catch(() => ({}))) as {
                error?: string
                make?: string
                model?: string
                modelYear?: number | null
                fuelType?: string
            }
            if (!res.ok) {
                alert(data?.error || "Não foi possível consultar o VIN.")
                return
            }
            const make = (data.make || "").trim()
            const model = (data.model || "").trim()
            const year = data.modelYear
            const fuel = mapAnyFuelToCombustivel(data.fuelType || "")

            setSucataForm((prev: typeof BLANK_SUCATA) => ({
                ...prev,
                chassi: vin,
                marca: make || prev.marca,
                modelo: model || prev.modelo,
                ...(year != null && !Number.isNaN(year)
                    ? { ano_modelo: year, ano_fabricacao: year }
                    : {}),
                ...(fuel ? { combustivel: fuel } : {}),
            }))
            alert("Dados do VIN preenchidos pela base NHTSA. Revise marca, modelo, ano e combustível antes de salvar.")
        } catch {
            alert("Erro de rede ao consultar o VIN. Confirme se o backend está rodando (npm run start-backend) e VITE_API_URL em produção.")
        } finally {
            setIsDecodingVin(false)
        }
    }

    const openDetail = (s: Sucata) => {
        setSelectedSucata(s)
        setView("detail")
        fetchPecas(s.id)
    }

    const handleRecalcularRateioCusto = async () => {
        if (!selectedSucata) return
        setRateandoCusto(true)
        try {
            const r = await sucatasApi.aplicarRateio(selectedSucata.id).catch(e => ({ ok: false, error: String(e) }))
            if (!(r as any).ok && (r as any).error) {
                alert("Não foi possível recalcular o custo: " + (r as any).error)
                return
            }
            await fetchPecas(selectedSucata.id)
            await fetchSucatas()
        } finally {
            setRateandoCusto(false)
        }
    }

    // ── PECA CRUD ───────────────────────────────────────────────────────────────

    const openNewPeca = () => {
        setEditingPeca(null)
        setPecaDesmontadorId("")
        setPecaForm({ ...BLANK_PECA, custo_estimado: 0, quantidade: 1 })
        setIsPecaModalOpen(true)
    }

    const openEditPeca = (p: SucataPeca) => {
        setEditingPeca(p)
        setPecaDesmontadorId(p.desmontador_id || "")
        setPecaForm({
            nome: p.nome, descricao: p.descricao || "", part_number: p.part_number || "",
            condicao: p.condicao, localizacao_id: p.localizacao_id || "",
            custo_estimado: p.custo_estimado,
            preco_venda: p.preco_venda,
            quantidade: Math.max(1, Math.floor(parseInt(String(p.quantidade), 10) || 1)),
            status: p.status
        })
        setIsPecaModalOpen(true)
    }

    const handleSavePeca = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!pecaForm.nome || !selectedSucata) return
        setSubmitting(true)
        try {
            const qtd = Math.max(1, Math.floor(parseInt(String(pecaForm.quantidade ?? 1), 10) || 1))
            const payload = {
                sucata_id: selectedSucata.id,
                nome: pecaForm.nome,
                descricao: pecaForm.descricao || null,
                part_number: pecaForm.part_number || null,
                condicao: pecaForm.condicao,
                localizacao_id: pecaForm.localizacao_id || null,
                custo_estimado: parseFloat(pecaForm.custo_estimado) || 0,
                preco_venda: parseFloat(pecaForm.preco_venda) || 0,
                quantidade: qtd,
                status: pecaForm.status,
                atendente_id: atendente?.id || null,
                desmontador_id: pecaDesmontadorId || null,
            }

            if (editingPeca) {
                await sucatasApi.atualizarPeca(selectedSucata.id, editingPeca.id, payload)
            } else {
                await sucatasApi.adicionarPeca(selectedSucata.id, payload)
                // Update sucata status to Em Desmontagem automatically
                if (selectedSucata.status === "Aguardando") {
                    await sucatasApi.atualizar(selectedSucata.id, { status: "Em Desmontagem" })
                    setSelectedSucata(prev => prev ? { ...prev, status: "Em Desmontagem" } : prev)
                }
            }

            logAcao(editingPeca ? 'sucata.peca.editar' : 'sucata.peca.criar', `${editingPeca ? 'Editada' : 'Criada'} peça de sucata: ${payload.nome}`, atendente?.id)

            setIsPecaModalOpen(false)
            setPecaForm(BLANK_PECA)
            if (selectedSucata) fetchPecas(selectedSucata.id)
            await sucatasApi.aplicarRateio(selectedSucata.id).catch(e => console.warn("Rateio de custo:", e))
            await fetchSucatas(true)
        } catch (e: any) {
            alert("Erro ao salvar peça: " + e.message)
        } finally {
            setSubmitting(false)
        }
    }

    const handleDeletePeca = async (id: string) => {
        if (!confirm("Excluir esta peça?")) return
        try {
            await sucatasApi.removerPeca(selectedSucata!.id, id)
            logAcao('sucata.peca.excluir', `Peça de sucata removida (id ${id.slice(0, 8)}…)`, atendente?.id)
            const sid = selectedSucata!.id
            await sucatasApi.aplicarRateio(sid).catch(e => console.warn("Rateio de custo:", e))
            await fetchPecas(sid)
            await fetchSucatas(true)
        } catch (e: any) {
            alert("Erro: " + e.message)
        }
    }

    // ── Cadastrar Peça no Estoque ────────────────────────────────────────────────

    const handleAddPecaToEstoque = async (peca: SucataPeca) => {
        if (!selectedSucata) return
        if (!confirm(`Cadastrar "${peca.nome}" como produto no estoque?`)) return

        setSubmitting(true)
        try {
            let prod: any = null
            try {
                const urlsPeca = Array.isArray(peca.fotos) && peca.fotos.length > 0 ? peca.fotos : []
                prod = await estoqueApi.criarProduto({
                    sku: undefined, // O servidor gera o próximo disponível automaticamente
                    nome: peca.nome,
                    descricao: peca.descricao || `Peça desmontada da sucata ${selectedSucata.codigo} — ${selectedSucata.marca} ${selectedSucata.modelo} ${selectedSucata.ano_modelo || ""}`,
                    part_number: peca.part_number || null,
                    custo: (() => {
                        const q = Math.max(1, Math.floor(Number(peca.quantidade) || 1))
                        return (peca.custo_estimado || 0) / q
                    })(),
                    preco: peca.preco_venda || Math.round((peca.custo_estimado || 0) * 1.5 * 100) / 100,
                    estoque_atual: Math.max(1, Math.floor(Number(peca.quantidade) || 1)),
                    estoque_minimo: 0,
                    marca: selectedSucata.marca,
                    modelo: selectedSucata.modelo,
                    ano: selectedSucata.ano_modelo,
                    qualidade: peca.condicao === "Ótima" ? "A" : peca.condicao === "Boa" ? "B" : peca.condicao === "Regular" ? "C" : "D",
                    origem: "Sucata",
                    localizacao_id: peca.localizacao_id || null,
                    ativo: true,
                    atendente_id: atendente?.id || null,
                    desmontador_id: peca.desmontador_id || null,
                    cadastrado_por_tipo: peca.desmontador_id ? "desmontador" : "atendente",
                    imagem_urls: urlsPeca.length > 0 ? urlsPeca : null,
                    imagem_url: urlsPeca[0] ?? null,
                    origem_cadastro: "desmontar_sucata",
                })
            } catch (err: any) {
                throw err
            }
            if (!prod) throw new Error("Falha ao criar produto após múltiplas tentativas")

            // Link the part to the product
            await sucatasApi.atualizarPeca(selectedSucata.id, peca.id, { produto_id: prod.id, status: "Cadastrada no Estoque" })

            await sucatasApi.aplicarRateio(selectedSucata.id).catch(e => console.warn("Rateio de custo:", e))
            await sucatasApi.mergeCompat(selectedSucata.id, prod.id).catch(e => console.warn("Compat. sucata → produto:", e))

            // Registro de contribuição de fotos (atendente logado)
            const urlsPeca = Array.isArray(peca.fotos) && peca.fotos.length > 0 ? peca.fotos : []
            if (urlsPeca.length > 0) {
                try {
                    const { registarFotosProduto } = await import("@/lib/fotoContribuicao")
                    await registarFotosProduto({
                        produtoId: prod.id,
                        quantidadeNovas: urlsPeca.length,
                        desmontadorIdProduto: peca.desmontador_id || null,
                        atendenteIdProduto: atendente?.id || null,
                        atendenteIdSessao: atendente?.id || null,
                        origem: "sucata_peca_individual",
                    })
                } catch (e) {
                    console.warn("[Sucatas] Erro ao registrar contribuição de fotos:", e)
                }
            }
            alert(`✅ Peça cadastrada no estoque!\nSKU: ${prod?.sku || 'N/A'}\nAcesse Estoque para ver e imprimir a etiqueta.`)
            await fetchPecas(selectedSucata.id)
            await fetchSucatas(true)
        } catch (e: any) {
            alert("Erro ao cadastrar no estoque: " + e.message)
        } finally {
            setSubmitting(false)
        }
    }

    // ── Bulk Save Pecas from Checklist ──────────────────────────────────────────

    const handleBulkSavePecas = async (newPecas: Omit<SucataPeca, 'id' | 'created_at' | 'sucata_id'>[]) => {
        if (!selectedSucata || newPecas.length === 0) return
        setSubmitting(true)
        try {
            // Prevent duplicating pieces already in the list
            const existingNames = new Set(pecas.map(p => (p.nome || "").toLowerCase().trim()))
            const filteredNewPecas = newPecas.filter(p => !existingNames.has((p.nome || "").toLowerCase().trim()))

            if (filteredNewPecas.length === 0) {
                setIsChecklistOpen(false)
                return
            }

            const pecasToInsert = filteredNewPecas.map(p => ({
                ...p,
                sucata_id: selectedSucata.id,
                custo_estimado: parseFloat(p.custo_estimado as any) || 0,
                preco_venda: parseFloat(p.preco_venda as any) || 0,
                quantidade: Math.max(1, Math.floor(parseInt(String((p as SucataPeca).quantidade ?? 1), 10) || 1)),
                descricao: p.descricao || null,
                part_number: p.part_number || null,
                localizacao_id: p.localizacao_id || null,
                atendente_id: atendente?.id || null,
            }))

            const createdItems = await sucatasApi.bulkInserirPecas(selectedSucata.id, pecasToInsert)

            // Update sucata status to Em Desmontagem automatically if it was Aguardando
            if (selectedSucata.status === "Aguardando") {
                await sucatasApi.atualizar(selectedSucata.id, { status: "Em Desmontagem" })
                setSelectedSucata(prev => prev ? { ...prev, status: "Em Desmontagem" } : prev)
            }

            setIsChecklistOpen(false)

            // Aplicar compatibilidades aos produtos criados se o retorno incluir os IDs
            // TODO: Se o bulkInserirPecas não retornar os IDs dos produtos criados, migrar para loop individual via sucatasApi.pecaToEstoque()
            if (Array.isArray(createdItems)) {
                for (const item of createdItems) {
                    if (item.produto_id) {
                        await sucatasApi.mergeCompat(selectedSucata.id, item.produto_id).catch(e => console.warn('Merge compat bulk:', e))
                    }
                }
            }

            await sucatasApi.aplicarRateio(selectedSucata.id).catch(e => console.warn('Rateio bulk:', e))
            await fetchPecas(selectedSucata.id)
            await fetchSucatas(true)
            alert("Peças registradas com sucesso!")
        } catch (e: any) {
            alert("Erro ao registrar peças em massa: " + e.message)
        } finally {
            setSubmitting(false)
        }
    }

    // SKU auto-geração removida do frontend (agora é feita no backend ao salvar)


    // ── Imprimir etiquetas do lote ──────────────────────────────────────────────

    const buildLocLabel = (locId: string | null | undefined, sep = ' › '): string => {
        if (!locId) return ''
        const chain: any[] = []
        let current = locations.find(l => l.id === locId)
        let depth = 0
        while (current && depth < 6) {
            chain.unshift(current)
            if (!current.parent_id) break
            current = locations.find(l => l.id === current!.parent_id)
            depth++
        }
        if (chain.length === 0) return ''
        const deepNome = chain[chain.length - 1]?.nome || ''
        const segments = deepNome.includes(' > ') ? deepNome.split(' > ') : null
        return chain.map((loc, i) => {
            const seg = segments ? (segments[i] || loc.nome) : loc.nome
            const num = seg.match(/(\d+)\s*$/)
            return (loc.sigla || '') + (num ? ' ' + num[1] : '')
        }).filter(Boolean).join(sep)
    }

    const getLocSiglaPath = (locId: string | null | undefined): string => buildLocLabel(locId, ' › ')

    const fetchComissoes = async (mes: string) => {
        try {
            const rows = await sucatasApi.relatorioComissoes(mes)
            const list = Array.isArray(rows) ? rows : []
            setComissaoData(list.map((r: any) => ({
                nome: r.nome || r.desmontador_id || '—',
                carros: Number(r.carros) || 0,
                pecas: Number(r.pecas) || 0,
                comissao_por_carro: Number(r.comissao_por_carro) || 0,
                comissao_por_peca: Number(r.comissao_por_peca) || 0,
            })))
        } catch (e) {
            console.error(e)
            setComissaoData([])
        }
    }

    const fetchRelatorioVendas = async () => {
        setLoadingRelatorio(true)
        try {
            const raw = await sucatasApi.relatorioVendasPecas()
            const data = Array.isArray(raw) ? raw.map((row: any) => ({
                ...row,
                produtos: typeof row.produtos === 'string' ? (() => { try { return JSON.parse(row.produtos) } catch { return row.produtos } })() : row.produtos,
                vendas: typeof row.vendas === 'string' ? (() => { try { return JSON.parse(row.vendas) } catch { return row.vendas } })() : row.vendas,
                sucatas: typeof row.sucatas === 'string' ? (() => { try { return JSON.parse(row.sucatas) } catch { return row.sucatas } })() : row.sucatas,
            })) : []
            if (!data || data.length === 0) {
                setRelatorioVendas({ porSucata: [], totais: { qtd: 0, custo: 0, receita: 0, lucro: 0, margem: 0 } })
                return
            }
            const bySucata = new Map<string, typeof data>()
            for (const p of data) {
                const sid = p.sucata_id as string
                if (!bySucata.has(sid)) bySucata.set(sid, [])
                bySucata.get(sid)!.push(p)
            }
            const porSucata: typeof relatorioVendas extends { porSucata: infer T } ? T : never = []
            let totalCusto = 0, totalReceita = 0
            for (const [sucataId, itens] of bySucata) {
                const sucata = (itens[0] as any).sucatas
                if (!sucata) continue
                const totalC = itens.reduce((a, p) => a + (p.custo_estimado || 0), 0)
                const totalR = itens.reduce((a, p) => a + ((p as any).valor_venda_real != null ? (p as any).valor_venda_real : p.preco_venda || 0), 0)
                const lucro = totalR - totalC
                const margem = totalR > 0 ? (lucro / totalR) * 100 : 0
                totalCusto += totalC
                totalReceita += totalR
                porSucata.push({
                    sucata: { id: sucataId, ...sucata },
                    qtd: itens.length,
                    totalCusto: totalC,
                    totalReceita: totalR,
                    lucro,
                    margem,
                    itens: itens.map((p: any) => {
                        const c = p.custo_estimado || 0
                        const precoCadastrado = p.preco_venda || 0
                        const valorReal = p.valor_venda_real != null ? p.valor_venda_real : precoCadastrado
                        const l = valorReal - c
                        const m = valorReal > 0 ? (l / valorReal) * 100 : 0
                        return {
                            id: p.id,
                            nome: p.nome,
                            sku: p.produtos?.sku,
                            custo: c,
                            preco: precoCadastrado,
                            valorReal,
                            lucro: l,
                            margem: m,
                            pedido: p.vendas?.numero_pedido,
                            data: p.vendas?.data_venda
                        }
                    })
                })
            }
            const lucroTotal = totalReceita - totalCusto
            const margemTotal = totalReceita > 0 ? (lucroTotal / totalReceita) * 100 : 0
            setRelatorioVendas({
                porSucata: porSucata.sort((a, b) => b.totalReceita - a.totalReceita),
                totais: { qtd: data.length, custo: totalCusto, receita: totalReceita, lucro: lucroTotal, margem: margemTotal }
            })
        } catch (e) {
            console.error(e)
            setRelatorioVendas(null)
        } finally {
            setLoadingRelatorio(false)
        }
    }

    const [mirroring, setMirroring] = useState(false)
    const handleMirrorPhotos = async () => {
        if (!selectedSucata || mirroring) return
        const externalPhotos = selectedSucata.fotos.filter(u => !isUrlAlreadyOnOurStorage(u))
        if (externalPhotos.length === 0) return alert("Todas as imagens já estão salvas no seu storage.")

        if (!confirm(`Existem ${externalPhotos.length} fotos salvas em links externos. Deseja baixar e salvar permanentemente no seu storage? Isso evita que as imagens sumam se o link original expirar.`)) return

        setMirroring(true)
        try {
            const token = getAuthToken() || null
            const cache = new Map<string, string>()
            const stats = emptyMirrorStats()
            const updated = await mirrorSucataRowFotos(selectedSucata as any, cache, stats, token)
            const newFotos = (updated as any).fotos

            await sucatasApi.atualizar(selectedSucata.id, { fotos: newFotos })

            setSelectedSucata(prev => prev ? { ...prev, fotos: newFotos } : prev)
            await fetchSucatas()
            
            if (stats.failed > 0) {
                alert(`Concluído com avisos: ${stats.failed} imagem(ns) não puderam ser baixadas (CORS ou erro de rede). Foi mantido o link original para estas.`)
            } else {
                alert("✅ Sucesso! Todas as imagens foram migradas para o seu storage permanente.")
            }
        } catch (e: any) {
            alert("Erro ao espelhar imagens: " + e.message)
        } finally {
            setMirroring(false)
        }
    }

    const printChecklistCategorias = async (sucata?: { marca?: string; modelo?: string; ano_modelo?: number | null; placa?: string | null } | null) => {
        let allCats = categorias
        try {
            const res = await configuracoesApi.listarCategorias({ limit: 5000 })
            if (Array.isArray(res)) {
                allCats = res
            }
        } catch (e) {
            console.warn("Erro ao buscar categorias para impressão:", e)
        }

        const ORDEM_GRUPOS = ['Motor', 'Injeção', 'Arrefecimento', 'Ar Condicionado', 'Transmissão', 'Suspensão', 'Freios', 'Direção', 'Elétrica', 'Lataria', 'Carroceria', 'Peças Exterior', 'Peças Interior', 'Outro', '']
        const GRUPO_CORES: Record<string, string> = {
            'Motor': '#ef4444', 'Injeção': '#06b6d4', 'Arrefecimento': '#0ea5e9', 'Ar Condicionado': '#3b82f6',
            'Transmissão': '#6366f1', 'Suspensão': '#a855f7', 'Freios': '#dc2626', 'Direção': '#14b8a6',
            'Elétrica': '#eab308', 'Lataria': '#f97316', 'Carroceria': '#f59e0b', 'Peças Exterior': '#65a30d',
            'Peças Interior': '#10b981', 'Outro': '#6b7280',
        }

        // Agrupa categorias por grupo
        const gruposMap: Record<string, string[]> = {}
        for (const cat of allCats) {
            const g = cat.grupo || 'Outro'
            if (!gruposMap[g]) gruposMap[g] = []
            gruposMap[g].push(cat.nome)
        }

        const gruposOrdenados = ORDEM_GRUPOS.filter(g => gruposMap[g]?.length)

        const veiculo = sucata
            ? [sucata.marca, sucata.modelo, sucata.ano_modelo, sucata.placa ? `— Placa: ${sucata.placa}` : ''].filter(Boolean).join(' ')
            : ''

        const colsHtml = (() => {
            // Distribui grupos em 3 colunas equilibradas
            const col1: string[] = [], col2: string[] = [], col3: string[] = []
            const cols = [col1, col2, col3]
            let ci = 0
            for (const g of gruposOrdenados) {
                const rows = gruposMap[g].length + 1 // +1 para o header
                cols[ci % 3].push(g)
                ci++
            }

            const renderCol = (grupos: string[]) => `
                <div style="flex:1; min-width:0; padding: 0 6px;">
                    ${grupos.map(g => `
                        <div style="margin-bottom:12px; break-inside:avoid;">
                            <div style="background:${GRUPO_CORES[g] || '#6b7280'}; color:#fff; padding:4px 10px; border-radius:6px; font-size:10px; font-weight:900; letter-spacing:0.08em; text-transform:uppercase; margin-bottom:6px;">
                                ${g}
                            </div>
                            ${gruposMap[g].sort().map(cat => `
                                <div style="display:flex; align-items:center; gap:8px; padding:3px 4px; border-bottom:1px solid #f0f0f0;">
                                    <div style="width:14px; height:14px; border:2px solid #999; border-radius:3px; flex-shrink:0;"></div>
                                    <span style="font-size:10px; color:#333;">${cat}</span>
                                </div>
                            `).join('')}
                        </div>
                    `).join('')}
                </div>`

            return [col1, col2, col3].map(renderCol).join('')
        })()

        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
        <title>Checklist de Desmontagem</title>
        <style>
            @page { size: A4; margin: 12mm; }
            * { box-sizing: border-box; margin: 0; padding: 0; font-family: Arial, sans-serif; }
            body { background: #fff; color: #111; }
            @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        </style></head><body>
        <div style="border-bottom:3px solid #1e293b; padding-bottom:8px; margin-bottom:12px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:6px;">
            <div>
                <div style="font-size:16px; font-weight:900; text-transform:uppercase; letter-spacing:0.05em; color:#1e293b;">Checklist de Desmontagem</div>
                ${veiculo ? `<div style="font-size:11px; color:#64748b; font-weight:600; margin-top:2px;">${veiculo}</div>` : ''}
            </div>
            <div style="text-align:right; font-size:9px; color:#94a3b8;">
                <div>Data: _____ / _____ / _________</div>
                <div style="margin-top:2px;">Desmontador: _______________________</div>
            </div>
        </div>
        <div style="display:flex; gap:0; align-items:flex-start;">
            ${colsHtml}
        </div>
        <div style="margin-top:14px; border-top:2px dashed #cbd5e1; padding-top:8px; display:flex; gap:16px; font-size:9px; color:#64748b;">
            <span>Observações: ________________________________________________________________________</span>
        </div>
        </body></html>`

        const w = window.open('', '_blank', 'width=900,height=700')
        if (!w) return
        w.document.write(html)
        w.document.close()
        w.focus()
        setTimeout(() => { w.print() }, 400)
    }

    const printLoteEtiquetas = async (produtosCriados: any[]) => {
        if (produtosCriados.length === 0) return
        const totalLabelsCount = produtosCriados.reduce((sum, p) => sum + (p.estoque_atual > 0 ? p.estoque_atual : 1), 0);
        const QRCode = (await import('qrcode')).default
        const labelsHtml = await Promise.all(
            produtosCriados.map(async (p) => {
                const locSigla = getLocSiglaPath(p.localizacao_id)
                const qrDataUrl = await QRCode.toDataURL(p.sku, {
                    width: 120, margin: 1,
                    color: { dark: '#000000', light: '#ffffff' }
                })
                const singleLabel = `
                  <div class="label">
                    <div class="left">
                      <div class="name">${p.nome}</div>
                      <div class="origin">Sucata: ${selectedSucata?.codigo || ''}${locSigla ? ` | ${locSigla}` : ''}</div>
                    </div>
                    <div class="right">
                      <img src="${qrDataUrl}" class="qr" alt="QR ${p.sku}" />
                      <div class="sku">${p.sku}</div>
                      <div class="qr-label">ESCANEIE</div>
                    </div>
                  </div>`
                const qty = p.estoque_atual > 0 ? p.estoque_atual : 1;
                return Array(qty).fill(singleLabel).join('');
            })
        )
        const printWindow = window.open('', '_blank', 'width=800,height=600')
        if (!printWindow) return
        printWindow.document.write(`
          <!DOCTYPE html><html><head><meta charset="UTF-8">
          <title>Etiquetas — ${totalLabelsCount} etiqueta(s) — Desmontagem ${selectedSucata?.codigo}</title>
          <style>
            @page { size: 100mm 50mm; margin: 0; }
            * { box-sizing: border-box; margin: 0; padding: 0; font-family: Arial, sans-serif; }
            body { background: white; }
            .label {
              width: 100mm; height: 50mm; display: flex; align-items: stretch;
              border: 1px solid #ccc; page-break-after: always;
              padding: 4mm;
            }
            .left { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 2mm; overflow: hidden; }
            .sku { font-size: 22pt; font-weight: 900; letter-spacing: -0.5px; }
            .name { font-size: 12pt; font-weight: 600; text-transform: uppercase; line-height: 1.25; }
            .origin { font-size: 7pt; color: #555; margin-top: 1mm; }
            .right { display: flex; flex-direction: column; align-items: center; justify-content: center; width: 30mm; gap: 1mm; }
            .qr { width: 28mm; height: 28mm; }
            .qr-label { font-size: 6pt; font-weight: bold; color: #666; margin-top: 1mm; letter-spacing: 1px; }
          </style></head>
          <body>${labelsHtml.join('')}</body>
          <script>window.onload = () => { window.print(); window.close(); }<\/script>
          </html>`)
        printWindow.document.close()

        // Marcar como impresso no backend
        try {
            const pids = produtosCriados.map(p => p.id).filter(Boolean)
            if (pids.length > 0) {
                await estoqueApi.marcarEtiquetasImpressas(pids)
            }
        } catch (err) {
            console.error("Erro ao marcar etiquetas como impressas (sucata):", err)
        }
    }

    // ── Desmontagem / categorias no veículo: mesmo fluxo (produto + SKU + peça + etiquetas) ──

    /**
     * `planejado`: fotos da sucata escolhidas + localização WMS "Sucata (código)" na linha da peça.
     * `desmontagem`: sem fotos automáticas na linha; sem local fixo de sucata na peça.
     */
    const handleConfirmarLoteCategorias = async () => {
        if (!selectedSucata || catsSelecionadas.length === 0) return
        const modoPlanejado = batchModalMode === "planejado"
        const fotosVeiculoUrls = modoPlanejado
            ? (selectedSucata.fotos || []).filter((u) => fotosSelecionadasPlanejamento.includes(u))
            : []

        setGerandoPecas(true)
        try {
            let locIdPeca: string | null = null
            if (modoPlanejado) {
                const locEnsured = await sucatasApi.ensureLocalizacao(selectedSucata.id)
                locIdPeca = locEnsured?.id ?? null
            }

            const produtosCriados: any[] = []
            let nextSkuNum: number | null = null

            for (const { categoria, quantidade, numeracao, detalhes, part_number, fotosCaptura, fotosDefeito, localizacaoLida } of catsSelecionadas) {
                const existing = pecas.find(
                    (p) => (p.nome || "").toLowerCase().trim() === (categoria.nome || "").toLowerCase().trim()
                )

                if (existing?.status === "Cadastrada no Estoque") {
                    console.log(`Peça ${categoria.nome} já está no estoque. Pulando.`)
                    continue
                }

                const nomeRaw = buildNomeProdutoPecaSucata(categoria.nome, selectedSucata, { numeracao, detalhes })

                let prod: any = null
                try {
                    prod = await estoqueApi.criarProduto({
                        sku: undefined, // Servidor gera automático no momento do INSERT
                        nome: nomeRaw,
                        categoria_id: categoria.id,
                        marca: selectedSucata.marca,
                        modelo: selectedSucata.modelo,
                        ano_inicio: selectedSucata.ano_fabricacao || null,
                        ano_fim: selectedSucata.ano_modelo || null,
                            estoque_atual: Math.max(1, Math.floor(Number(quantidade) || 1)),
                            estoque_minimo: 0,
                            estoque_reservado: 0,
                            custo: 0,
                            preco: 0,
                            origem: "Sucata",
                            ativo: true,
                            atendente_id: atendente?.id || null,
                            part_number: part_number || null,
                            ...(localizacaoLida ? { localizacao_id: localizacaoLida } : locIdPeca ? { localizacao_id: locIdPeca } : {}),
                            origem_cadastro: "desmontar_sucata",
                        })
                    } catch (err: any) {
                        throw err
                    }
                if (!prod) throw new Error("Falha ao criar produto após múltiplas tentativas")

                // Upload das fotos capturadas pela câmera (produto + defeito)
                const fotosCapturaUrls: string[] = []
                for (const f of (fotosCaptura || [])) {
                    try { fotosCapturaUrls.push(await uploadPanelProdutoImageFile(f)) } catch (e) { console.warn('[Sucatas] Erro upload foto captura:', e) }
                }
                const fotosDefeitoUrls: string[] = []
                for (const f of (fotosDefeito || [])) {
                    try { fotosDefeitoUrls.push(await uploadPanelProdutoImageFile(f)) } catch (e) { console.warn('[Sucatas] Erro upload foto defeito:', e) }
                }
                const todasFotosUrls = [...fotosVeiculoUrls, ...fotosCapturaUrls, ...fotosDefeitoUrls]

                // Atualizar produto com as URLs de fotos, se houver
                if (todasFotosUrls.length > 0 && prod) {
                    try {
                        const { estoqueApi: estApi } = await import('@/lib/api')
                        await estApi.atualizarProduto(prod.id, {
                            imagem_urls: todasFotosUrls,
                            imagem_url: todasFotosUrls[0] ?? null,
                        })
                        prod = { ...prod, imagem_urls: todasFotosUrls, imagem_url: todasFotosUrls[0] ?? null }
                    } catch (e) { console.warn('[Sucatas] Erro ao atualizar fotos do produto:', e) }
                }

                await sucatasApi.mergeCompat(selectedSucata.id, prod.id).catch(e => console.warn("Compat. sucata → produto (lote categorias):", e))

                const basePeca: Record<string, unknown> = {
                    produto_id: prod.id,
                    status: "Cadastrada no Estoque" as const,
                    quantidade: Math.max(1, Math.floor(Number(quantidade) || 1)),
                    desmontador_id: desmontadorId || null,
                    atendente_id: atendente?.id || null,
                    part_number: part_number || null,
                }
                if (localizacaoLida) {
                    basePeca.localizacao_id = localizacaoLida
                } else if (locIdPeca) {
                    basePeca.localizacao_id = locIdPeca
                }
                const todasFotosParaPeca = [...fotosVeiculoUrls, ...(fotosCapturaUrls || []), ...(fotosDefeitoUrls || [])]
                if (todasFotosParaPeca.length > 0) basePeca.fotos = todasFotosParaPeca

                if (existing) {
                    await sucatasApi.atualizarPeca(selectedSucata.id, existing.id, basePeca)
                } else {
                    await sucatasApi.adicionarPeca(selectedSucata.id, {
                        sucata_id: selectedSucata.id,
                        nome: categoria.nome,
                        condicao: "Boa",
                        custo_estimado: 0,
                        preco_venda: 0,
                        ...basePeca,
                    })
                }

                produtosCriados.push(prod)

                // Registro de contribuição de fotos (atendente logado)
                const totalFotosContrib = fotosVeiculoUrls.length + (fotosCapturaUrls?.length || 0) + (fotosDefeitoUrls?.length || 0)
                if (totalFotosContrib > 0) {
                    try {
                        const { registarFotosProduto } = await import("@/lib/fotoContribuicao")
                        await registarFotosProduto({
                            produtoId: prod.id,
                            quantidadeNovas: totalFotosContrib,
                            desmontadorIdProduto: desmontadorId || null,
                            atendenteIdProduto: atendente?.id || null,
                            atendenteIdSessao: atendente?.id || null,
                            origem: "sucatas_lote_categorias",
                        })
                    } catch (e) {
                        console.warn("[Sucatas] Erro ao registrar contribuição de fotos:", e)
                    }
                }
            }

            if (produtosCriados.length === 0) {
                alert(
                    "Nenhum produto novo: todas as categorias selecionadas já estão cadastradas no estoque, ou não há itens para processar."
                )
                return
            }

            const sucataUpd: Record<string, unknown> = {}
            if (selectedSucata.status === "Aguardando") sucataUpd.status = "Em Desmontagem"
            if (desmontadorId) sucataUpd.desmontador_id = desmontadorId
            if (Object.keys(sucataUpd).length > 0) {
                await sucatasApi.atualizar(selectedSucata.id, sucataUpd)
                setSelectedSucata((prev) => (prev ? { ...prev, ...sucataUpd } : prev))
            }

            await sucatasApi.aplicarRateio(selectedSucata.id).catch(e => console.warn("Rateio de custo (lote categorias):", e))
            await fetchPecas(selectedSucata.id)
            await fetchSucatas()
            await fetchResources()

            logAcao(
                modoPlanejado ? "sucata.peca.lote_veiculo_estoque" : "sucata.peca.desmontagem_lote",
                `${produtosCriados.length} produto(s) por categoria — sucata ${selectedSucata.codigo}`,
                atendente?.id
            )

            setIsDesmontandoOpen(false)
            setBatchModalMode("desmontagem")
            setCatsSelecionadas([])
            setSearchCat("")
            setFiltroGrupoCat("")
            setDesmontadorId("")
            setFotosSelecionadasPlanejamento([])

            // Removido a pedido do usuário: não abrir impressão automaticamente
            // await printLoteEtiquetas(produtosCriados)
            alert(`✅ ${produtosCriados.length} peças cadastradas com sucesso!`)
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e)
            alert("Erro ao gerar produtos: " + msg)
        } finally {
            setGerandoPecas(false)
        }
    }

    // ── Toggle categoria na seleção ─────────────────────────────────────────────

    const toggleCategoria = (cat: any) => {
        const exists = catsSelecionadas.find(c => c.categoria.id === cat.id)
        if (exists) {
            setCatsSelecionadas(prev => prev.filter(c => c.categoria.id !== cat.id))
            return
        }
        if (cat.pede_numeracao || cat.pede_detalhes) {
            const tipo = cat.pede_numeracao && cat.pede_detalhes ? 'ambos' : cat.pede_numeracao ? 'numeracao' : 'detalhes'
            setCatInfoInput({ numeracao: '', detalhes: '', part_number: '' })
            setCatPedindoInfo({ cat, tipo })
        } else {
            setCatsSelecionadas(prev => [...prev, { categoria: cat, quantidade: 1 }])
        }
    }

    const confirmarCatInfo = () => {
        if (!catPedindoInfo) return
        setCatsSelecionadas(prev => [...prev, {
            categoria: catPedindoInfo.cat,
            quantidade: 1,
            numeracao: catInfoInput.numeracao.trim() || undefined,
            detalhes: catInfoInput.detalhes.trim() || undefined,
            part_number: catInfoInput.part_number.trim() || undefined,
        }])
        setCatPedindoInfo(null)
        setCatInfoInput({ numeracao: '', detalhes: '', part_number: '' })
    }

    const updateQtd = (catId: string, val: any) => {
        setCatsSelecionadas(prev => prev.map(c => c.categoria.id === catId ? { ...c, quantidade: Number(val) || 1 } : c))
    }

    const handleSaveCameraPhotos = (catId: string, mode: 'produto' | 'defeito', files: File[]) => {
        setCatsSelecionadas(prev => prev.map(c =>
            c.categoria.id === catId
                ? mode === 'produto'
                    ? { ...c, fotosCaptura: files }
                    : { ...c, fotosDefeito: files }
                : c
        ))
        setCameraModal(null)
    }

    // ── Rentabilidade do veículo ─────────────────────────────────────────────────

    const rentabilidade = useMemo(() => {
        if (!selectedSucata) return null
        const receitaEstimada = pecas.reduce((a, p) => {
            const q = Math.max(1, Math.floor(Number(p.quantidade) || 1))
            return a + (p.preco_venda || 0) * q
        }, 0)
        const custo = selectedSucata.custo_total || 0
        const margem = custo > 0 ? ((receitaEstimada - custo) / custo) * 100 : 0
        return { receitaEstimada, custo, margem }
    }, [selectedSucata, pecas])

    // ── Location helper ──────────────────────────────────────────────────────────

    const getLocLabel = (locId: string | null) => buildLocLabel(locId) || "—"

    // ────────────────────────────────────────────────────────────────────────────
    // RENDER — DETAIL VIEW
    // ────────────────────────────────────────────────────────────────────────────

    if (view === "detail" && selectedSucata) {
        const canonicalDocUrl = selectedSucata.doc_importado_url ? canonicalProdutosImageUrl(selectedSucata.doc_importado_url) : ""

        const handlePrintDoc = () => {
            const url = canonicalDocUrl
            if (!url) return
            const isPdf = url.toLowerCase().includes(".pdf")
            if (isPdf) {
                const iframe = document.createElement("iframe")
                iframe.style.position = "fixed"
                iframe.style.right = "0"
                iframe.style.bottom = "0"
                iframe.style.width = "0"
                iframe.style.height = "0"
                iframe.style.border = "0"
                iframe.src = url
                iframe.onload = () => {
                    iframe.contentWindow?.focus()
                    iframe.contentWindow?.print()
                }
                document.body.appendChild(iframe)
                setTimeout(() => {
                    document.body.removeChild(iframe)
                }, 10000)
            } else {
                const printWindow = window.open("", "_blank")
                if (printWindow) {
                    printWindow.document.write(`
                        <html>
                        <head>
                            <title>Imprimir Documento</title>
                            <style>
                                body { margin: 0; display: flex; justify-content: center; align-items: center; height: 100vh; }
                                img { max-width: 100%; max-height: 100%; object-fit: contain; }
                                @media print {
                                    body { margin: 0; }
                                    img { max-width: 100%; max-height: 100vh; page-break-after: avoid; page-break-before: avoid; }
                                }
                            </style>
                        </head>
                        <body>
                            <img src="${url}" onload="window.focus(); window.print(); window.close();" />
                        </body>
                        </html>
                    `)
                    printWindow.document.close()
                }
            }
        }

        const handleDownloadDoc = async () => {
            const url = canonicalDocUrl
            if (!url) return
            try {
                const res = await fetch(url)
                const blob = await res.blob()
                const blobUrl = URL.createObjectURL(blob)
                const a = document.createElement("a")
                a.href = blobUrl
                const ext = url.split("?")[0].split(".").pop() || "jpg"
                a.download = `documento-${selectedSucata.codigo}.${ext}`
                document.body.appendChild(a)
                a.click()
                document.body.removeChild(a)
                URL.revokeObjectURL(blobUrl)
            } catch (err) {
                console.error("Erro ao baixar documento:", err)
                window.open(url, "_blank")
            }
        }

        const handleUploadDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0]
            if (!file) return
            try {
                const url = await uploadPanelProdutoImageFile(file)
                if (url) {
                    await sucatasApi.atualizar(selectedSucata.id, {
                        ...selectedSucata,
                        doc_importado_url: url
                    })
                    setSelectedSucata(prev => prev ? { ...prev, doc_importado_url: url } : null)
                    setSucatas(prev => prev.map(s => s.id === selectedSucata.id ? { ...s, doc_importado_url: url } : s))
                    alert("Documento anexado com sucesso!")
                } else {
                    alert("Falha ao fazer upload do documento.")
                }
            } catch (err: any) {
                console.error("Erro ao subir documento:", err)
                alert(`Erro ao salvar documento: ${err?.message || err}`)
            }
        }

        const handleRemoveDoc = async () => {
            if (!confirm("Deseja realmente remover o documento desta sucata?")) return
            try {
                await sucatasApi.atualizar(selectedSucata.id, {
                    ...selectedSucata,
                    doc_importado_url: null
                })
                setSelectedSucata(prev => prev ? { ...prev, doc_importado_url: null } : null)
                setSucatas(prev => prev.map(s => s.id === selectedSucata.id ? { ...s, doc_importado_url: null } : s))
                alert("Documento removido!")
            } catch (err: any) {
                console.error("Erro ao remover documento:", err)
                alert(`Erro ao remover documento: ${err?.message || err}`)
            }
        }

        const progressPct = pecas.length
            ? Math.round((pecas.filter(p => p.status !== "Disponível").length / pecas.length) * 100)
            : 0

        return (
            <div className="space-y-6 w-full min-w-0">
                {/* Título em linha própria (largura total); botões abaixo — evita a coluna do título ser espremida pelo flex row em xl */}
                <div className="flex flex-col gap-4 w-full min-w-0">
                    <div className="flex items-start gap-3 min-w-0 w-full">
                        <Button variant="outline" size="icon" className="shrink-0" onClick={() => { setView("list"); setSelectedSucata(null) }}>
                            <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <div className="min-w-0 flex-1 w-full">
                            <div className="flex items-center gap-3 flex-wrap">
                                <h1 className="text-2xl font-bold tracking-tight">{selectedSucata.codigo}</h1>
                                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${statusColors[selectedSucata.status]}`}>
                                    {selectedSucata.status}
                                </span>
                            </div>
                            <p className="text-muted-foreground text-sm mt-0.5 break-words">
                                {[selectedSucata.marca, selectedSucata.modelo, selectedSucata.ano_modelo]
                                    .filter((x) => x !== null && x !== undefined && String(x).trim() !== "")
                                    .join(" ")}
                                {selectedSucata.placa ? ` · ${selectedSucata.placa}` : ""}
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2 w-full min-w-0 sm:justify-end">
                        <Suspense fallback={null}>
                          <GenerateCatalogButton vehicleId={selectedSucata.id} className="shrink-0" />
                        </Suspense>

                        <Button
                            variant="outline"
                            className="gap-2 border-violet-300 text-violet-700 hover:bg-violet-50 font-bold shrink-0"
                            onClick={() => openModalCategorias("desmontagem")}
                        >
                            <Scissors className="w-4 h-4" /> Desmontar Peças
                        </Button>
                        <Button
                            variant="outline"
                            className="gap-2 border-slate-300 text-slate-600 hover:bg-slate-50 shrink-0"
                            onClick={() => printChecklistCategorias(selectedSucata)}
                            title="Imprimir checklist de categorias para desmontagem"
                        >
                            <Printer className="w-4 h-4" /> Checklist A4
                        </Button>
                        <Button variant="outline" className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50 shrink-0" onClick={() => setIsChecklistOpen(true)}>
                            <ListChecks className="w-4 h-4" /> Checklist Rápido
                        </Button>
                        <Button
                            variant="outline"
                            className="gap-2 border-emerald-300 text-emerald-800 hover:bg-emerald-50 shrink-0"
                            disabled={rateandoCusto}
                            onClick={handleRecalcularRateioCusto}
                            title="Redistribui o custo total da sucata entre as peças disponíveis e no estoque, proporcional ao preço unitário × quantidade de cada linha"
                        >
                            {rateandoCusto ? <RefreshCw className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
                            Ratear custo
                        </Button>
                        <Button
                            variant="outline"
                            className="gap-2 shrink-0 border-sky-300 text-sky-900 hover:bg-sky-50"
                            onClick={() => openModalCategorias("planejado")}
                            title="Gera produto no estoque (SKU) por categoria, com fotos opcionais e local WMS Sucata (código) — peças ainda no veículo"
                        >
                            <Layers className="w-4 h-4" /> Por categorias (no veículo)
                        </Button>
                        <Button className="gap-2 shrink-0" onClick={openNewPeca}>
                            <Plus className="w-4 h-4" /> Registrar Peça
                        </Button>
                        <Button variant="outline" className="gap-2 shrink-0" onClick={() => openEditSucata(selectedSucata)}>
                            <Pencil className="w-4 h-4" /> Editar
                        </Button>
                        <Button
                            variant="outline"
                            className="gap-2 border-destructive/50 text-destructive hover:bg-destructive/10 shrink-0"
                            onClick={() => handleDeleteSucata(selectedSucata.id, { fecharDetalhe: true })}
                        >
                            <Trash2 className="w-4 h-4" /> Excluir sucata
                        </Button>
                    </div>
                </div>

                {/* Summary cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full min-w-0">
                    {/* Vehicle info */}
                    <Card className="md:col-span-2 min-w-0 overflow-hidden">
                        <CardContent className="pt-4">
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm font-sans">
                                {[
                                    ["Custo de Compra", fmt(selectedSucata.valor_compra)],
                                    ["Frete", fmt(selectedSucata.valor_frete)],
                                    ["Custo Total", fmt(selectedSucata.custo_total)],
                                    ["Comprado em", fmtDate(selectedSucata.data_compra)],
                                    ["Condição", selectedSucata.condicao || "—"],
                                    ["KM Entrada", selectedSucata.km_entrada?.toLocaleString("pt-BR") || "—"],
                                    ["Fornecedor", selectedSucata.fornecedor || "—"],
                                    ["Certidão Baixa", selectedSucata.certidao_baixa || "—"],
                                    ["Grupo de Peça", selectedSucata.modelo_grupo_peca || "—"],
                                    ["Nº Motor", selectedSucata.numero_motor || "—"],
                                    ["Cilindrada", selectedSucata.cilindrada || "—"],
                                    ["Potência (CV)", selectedSucata.potencia_cv || "—"],
                                    ["Desmontagem", selectedSucata.data_desmontagem ? fmtDate(selectedSucata.data_desmontagem) : "—"],
                                ].map(([label, value]) => (
                                    <div key={label} className="p-3 rounded-xl bg-muted/40 border border-border/50">
                                        <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">{label}</p>
                                        <p className="font-bold text-sm">{value}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Novos indicadores financeiros de importação/histórico */}
                            {(selectedSucata.valor_vendido > 0 || selectedSucata.lucro_bruto !== 0) && (
                                <div className="mt-4 grid grid-cols-3 gap-3">
                                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 dark:bg-emerald-950/20 dark:border-emerald-900/50">
                                        <p className="text-[10px] uppercase font-bold text-emerald-600 mb-1">Valor Vendido</p>
                                        <p className="font-black text-sm text-emerald-700">{fmt(selectedSucata.valor_vendido)}</p>
                                    </div>
                                    <div className="p-3 rounded-xl bg-blue-50 border border-blue-100 dark:bg-blue-950/20 dark:border-blue-900/50">
                                        <p className="text-[10px] uppercase font-bold text-blue-600 mb-1">Lucro Bruto</p>
                                        <p className="font-black text-sm text-blue-700">{fmt(selectedSucata.lucro_bruto)}</p>
                                    </div>
                                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 dark:bg-amber-950/20 dark:border-amber-900/50">
                                        <p className="text-[10px] uppercase font-bold text-amber-600 mb-1">Margem Bruta (%)</p>
                                        <p className="font-black text-sm text-amber-700">
                                            {typeof selectedSucata.margem_bruta === 'number' ? selectedSucata.margem_bruta.toFixed(1) : "0.0"}%
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Progress bar */}
                            <div className="mt-4">
                                <div className="flex justify-between text-xs font-bold text-muted-foreground mb-1">
                                    <span>Progresso de Desmontagem</span>
                                    <span>{pecas.filter(p => p.status !== "Disponível").length}/{pecas.length} peças</span>
                                </div>
                                <div className="h-2 rounded-full bg-muted overflow-hidden">
                                    <div
                                        className="h-2 rounded-full bg-gradient-to-r from-amber-400 to-emerald-500 transition-all"
                                        style={{ width: `${progressPct}%` }}
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Rentabilidade */}
                    {rentabilidade && (
                        <Card className={rentabilidade.margem >= 0 ? "border-emerald-200 bg-emerald-50/30" : "border-rose-200 bg-rose-50/30"}>
                            <CardHeader className="pb-2 pt-4">
                                <CardTitle className="text-sm flex items-center gap-2">
                                    <BarChart2 className="w-4 h-4 text-primary" /> Rentabilidade Projetada
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-1.5 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Investimento</span>
                                    <span className="font-bold text-rose-600">{fmt(rentabilidade.custo)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Receita Estimada</span>
                                    <span className="font-bold text-emerald-600">{fmt(rentabilidade.receitaEstimada)}</span>
                                </div>
                                <div className="flex justify-between border-t border-border pt-1.5 mt-1.5">
                                    <span className="font-bold">Margem</span>
                                    <span className={`font-black text-base ${rentabilidade.margem >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                        {rentabilidade.margem >= 0 ? "+" : ""}{rentabilidade.margem.toFixed(1)}%
                                    </span>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Documento Original de Importação */}
                    <Card className="border-primary/20 bg-primary/5 transition-all duration-300 shadow-md">
                        <CardHeader className="pb-2 pt-4">
                            <CardTitle className="text-sm flex items-center justify-between w-full">
                                <div className="flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-primary" />
                                    <span>Documento Original</span>
                                </div>
                                {canonicalDocUrl && (
                                    <Badge variant="outline" className="text-[10px] bg-primary/10 border-primary/20 text-primary">
                                        {canonicalDocUrl.toLowerCase().includes(".pdf") ? "PDF" : "Imagem"}
                                    </Badge>
                                )}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {canonicalDocUrl ? (
                                <>
                                    <p className="text-xs text-muted-foreground">Documento digitalizado importado na criação da sucata.</p>
                                    <div className="flex gap-2 flex-wrap">
                                        <Button 
                                            variant="outline" 
                                            size="sm" 
                                            className={cn("flex-1 min-w-[80px] text-xs gap-1.5 font-bold transition-all", viewDocOpen ? "bg-primary text-white hover:bg-primary/95 hover:text-white" : "")}
                                            onClick={() => setViewDocOpen(!viewDocOpen)}
                                        >
                                            {viewDocOpen ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                            {viewDocOpen ? "Ocultar" : "Visualizar"}
                                        </Button>
                                        <Button 
                                            variant="outline" 
                                            size="sm" 
                                            className="flex-1 min-w-[80px] text-xs gap-1.5 font-bold"
                                            onClick={handlePrintDoc}
                                        >
                                            <Printer className="w-3.5 h-3.5" /> Imprimir
                                        </Button>
                                        <Button 
                                            variant="outline" 
                                            size="sm" 
                                            className="flex-1 min-w-[80px] text-xs gap-1.5 font-bold"
                                            onClick={handleDownloadDoc}
                                        >
                                            <Download className="w-3.5 h-3.5" /> Baixar
                                        </Button>
                                        <Button 
                                            variant="outline" 
                                            size="sm" 
                                            className="text-xs px-3 bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100 hover:text-rose-700 transition-colors"
                                            title="Remover documento"
                                            onClick={handleRemoveDoc}
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                        <Button 
                                            variant="outline" 
                                            size="sm" 
                                            className="text-xs px-3"
                                            title="Abrir em nova guia"
                                            onClick={() => window.open(canonicalDocUrl, '_blank')}
                                        >
                                            <ExternalLink className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                    {viewDocOpen && (
                                        <div className="relative mt-3 rounded-2xl overflow-hidden border bg-white shadow-inner transition-all animate-in fade-in duration-300">
                                            {canonicalDocUrl.toLowerCase().includes(".pdf") ? (
                                                <iframe 
                                                    src={canonicalDocUrl} 
                                                    className="w-full h-[500px] border-0" 
                                                    title="Visualizador de PDF"
                                                />
                                            ) : (
                                                <div className="flex items-center justify-center p-4 bg-muted/20">
                                                    <img 
                                                        src={canonicalDocUrl} 
                                                        className="max-w-full max-h-[500px] object-contain rounded-lg shadow-sm" 
                                                        alt="Documento Importado" 
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-6 border-2 border-dashed border-slate-200 rounded-xl bg-white hover:border-primary/40 transition-colors">
                                    <FileText className="w-8 h-8 text-slate-300 mb-2" />
                                    <p className="text-xs font-bold text-slate-500 mb-3">Nenhum documento anexado</p>
                                    <label className="cursor-pointer">
                                        <span className="inline-flex items-center justify-center px-4 py-2 border border-slate-200 hover:bg-slate-50 text-xs font-bold rounded-lg gap-2 text-slate-600 shadow-sm transition-all">
                                            <Upload className="w-3.5 h-3.5 text-primary" />
                                            Anexar Documento
                                        </span>
                                        <input 
                                            type="file" 
                                            accept="image/*,application/pdf" 
                                            className="hidden" 
                                            onChange={handleUploadDoc} 
                                        />
                                    </label>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                <SucataCompatibilidadesPanel
                    sucataId={selectedSucata.id}
                    veiculoMarca={selectedSucata.marca}
                    veiculoModelo={selectedSucata.modelo}
                    anoFabricacao={selectedSucata.ano_fabricacao}
                    anoModelo={selectedSucata.ano_modelo}
                />

                {/* Galeria de fotos */}
                {selectedSucata.fotos && selectedSucata.fotos.length > 0 && (
                    <Card>
                        <CardHeader className="pb-2 pt-4">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-sm flex items-center gap-2">
                                    <Camera className="w-4 h-4 text-primary" /> Fotos do Veículo ({selectedSucata.fotos.length})
                                </CardTitle>
                                {selectedSucata.fotos && selectedSucata.fotos.some(u => !isUrlAlreadyOnOurStorage(u)) && (
                                    <Button 
                                        variant="outline" 
                                        size="sm" 
                                        className="h-7 text-[9px] font-black uppercase bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100" 
                                        onClick={handleMirrorPhotos}
                                        disabled={mirroring}
                                    >
                                        {mirroring ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : <Database className="w-3 h-3 mr-1" />}
                                        Salvar Físico
                                    </Button>
                                )}
                            </div>
                            <p className="text-[10px] text-muted-foreground font-medium mt-1">
                                A primeira foto é a capa nos cards. Nas outras, use <span className="font-bold text-foreground">Capa</span> (ou toque no celular) para trocar.
                            </p>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                                {selectedSucata.fotos.map((url, i) => (
                                    <div
                                        key={`${url}-${i}`}
                                        className="relative aspect-square rounded-lg overflow-hidden border bg-muted group"
                                    >
                                        <a
                                            href={canonicalProdutosImageUrl(url) || url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block w-full h-full hover:opacity-90 transition-opacity"
                                        >
                                            <SucataFotoImg src={url} alt="" imgClassName="w-full h-full object-cover" />
                                        </a>
                                        {i === 0 ? (
                                            <div className="absolute bottom-0 left-0 right-0 bg-black/55 text-[8px] text-white text-center py-0.5 font-bold pointer-events-none">
                                                Principal
                                            </div>
                                        ) : (
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                size="sm"
                                                disabled={salvandoCapaFotoIdx !== null}
                                                className="absolute bottom-0 left-0 right-0 h-7 rounded-none text-[9px] font-black uppercase gap-1 opacity-95 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity shadow-md"
                                                onClick={() => handleDefinirFotoPrincipalSucata(i)}
                                            >
                                                {salvandoCapaFotoIdx === i ? (
                                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                                ) : (
                                                    <Star className="w-3 h-3 fill-amber-400 text-amber-600" />
                                                )}
                                                Capa
                                            </Button>
                                        )}
                                    </div>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => openEditSucata(selectedSucata)}
                                    className="aspect-square rounded-lg border-2 border-dashed flex flex-col items-center justify-center hover:border-primary/40 hover:bg-primary/5 transition-all text-muted-foreground/40"
                                >
                                    <Plus className="w-5 h-5" />
                                    <span className="text-[8px] font-black uppercase mt-0.5">Foto</span>
                                </button>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Parts list */}
                <Card>
                    <CardHeader className="pb-3 flex flex-row items-center justify-between flex-wrap gap-2">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Layers className="w-4 h-4 text-primary" />
                            Peças Registradas ({filteredPecas.length}{filterPecaStatus !== "todos" ? ` de ${pecas.length}` : ""})
                        </CardTitle>
                        {pecas.length > 0 && (
                            <div className="flex items-center gap-2">
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                                    <Input
                                        placeholder="Buscar peça..."
                                        value={searchPeca}
                                        onChange={e => setSearchPeca(e.target.value)}
                                        className="h-8 w-[150px] sm:w-[200px] pl-8 text-xs"
                                    />
                                </div>
                                <select
                                    value={filterPecaStatus}
                                    onChange={e => setFilterPecaStatus(e.target.value as any)}
                                    className="h-8 text-xs rounded-md border border-input bg-background px-2"
                                >
                                    <option value="todos">Todas</option>
                                    <option value="Disponível">Disponíveis</option>
                                    <option value="Cadastrada no Estoque">No estoque</option>
                                    <option value="Vendida">Vendidas</option>
                                    <option value="Descartada">Descartadas</option>
                                </select>
                            </div>
                        )}
                    </CardHeader>
                    <CardContent>
                        {loadingPecas ? (
                            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
                                <RefreshCw className="w-4 h-4 animate-spin" /> Carregando peças...
                            </div>
                        ) : pecas.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-14 text-muted-foreground gap-3">
                                <Wrench className="w-12 h-12 opacity-20" />
                                <p className="text-sm">Nenhuma peça registrada ainda.</p>
                                <Button variant="outline" size="sm" onClick={openNewPeca} className="gap-2">
                                    <Plus className="w-4 h-4" /> Registrar primeira peça
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {filteredPecas.map(p => (
                                    <div key={p.id} className="flex items-start gap-4 px-4 py-3 rounded-xl border border-border/70 bg-card hover:bg-muted/20 transition-colors">
                                        {/* Thumbnail da Peça */}
                                        <div className="w-12 h-12 rounded-lg border bg-muted flex-shrink-0 overflow-hidden flex items-center justify-center">
                                            {(() => {
                                                const prodImgUrl = (p.produtos as any)?.imagem_url || ((p.produtos as any)?.imagem_urls && (p.produtos as any).imagem_urls[0]);
                                                const url = prodImgUrl || (p.fotos && p.fotos[0]);
                                                if (url) {
                                                    return (
                                                        <img 
                                                            src={normalizeFotoDisplayUrl(url)} 
                                                            alt={p.nome}
                                                            className="w-full h-full object-cover"
                                                        />
                                                    );
                                                }
                                                return <Package className="w-6 h-6 text-muted-foreground/40" />;
                                            })()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-bold text-sm">{p.nome}</span>
                                                {Math.max(1, Math.floor(Number(p.quantidade) || 1)) > 1 && (
                                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                                        ×{Math.max(1, Math.floor(Number(p.quantidade) || 1))}
                                                    </span>
                                                )}
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${pecaStatusColors[p.status]}`}>
                                                    {p.status}
                                                </span>
                                                <span className={`text-[10px] font-bold ${condicaoColors[p.condicao]}`}>
                                                    {p.condicao}
                                                </span>
                                                {p.produtos?.sku && (
                                                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700 flex items-center gap-1">
                                                        <Tag className="w-2.5 h-2.5" /> SKU: {p.produtos.sku}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground flex-wrap">
                                                {p.part_number && <span className="font-mono">PN: {p.part_number}</span>}
                                                <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{getLocLabel(p.localizacao_id)}</span>
                                                <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />Custo: {fmt(p.custo_estimado)}</span>
                                                <span className="text-muted-foreground">
                                                    Preço atual: {fmt((p.produtos as any)?.preco ?? p.preco_venda)}
                                                </span>
                                                <span className="font-bold text-foreground">Venda real: {fmt(p.valor_venda_real ?? p.preco_venda)}</span>
                                                {p.status === "Vendida" && (p.vendas as any)?.numero_pedido && (
                                                    <span className="flex items-center gap-1 text-purple-600 font-semibold">
                                                        <CheckCircle2 className="w-3 h-3" />
                                                        Pedido #{String((p.vendas as any).numero_pedido).padStart(6, "0")}
                                                        {(p.vendas as any).data_venda && ` em ${fmtDate((p.vendas as any).data_venda)}`}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            {p.status === "Disponível" && !p.produto_id && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="text-xs gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                                                    onClick={() => handleAddPecaToEstoque(p)}
                                                    disabled={submitting}
                                                >
                                                    <Package className="w-3.5 h-3.5" /> → Estoque
                                                </Button>
                                            )}
                                            <Button size="sm" variant="ghost" onClick={() => openEditPeca(p)} className="h-8 w-8 p-0">
                                                <Pencil className="w-3.5 h-3.5" />
                                            </Button>
                                            <Button size="sm" variant="ghost" onClick={() => handleDeletePeca(p.id)} className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10">
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Relatório de Peças Vendidas com Margem de Lucro */}
                {pecasVendidasReport && pecasVendidasReport.itens.length > 0 && (
                    <Card className="border-emerald-200/50 bg-gradient-to-br from-emerald-50/30 to-white dark:from-emerald-950/10 dark:to-card">
                        <CardHeader className="pb-3 border-b border-emerald-200/30">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <FileBarChart2 className="w-4 h-4 text-emerald-600" />
                                    Relatório de Peças Vendidas
                                    <span className="text-[10px] font-normal text-muted-foreground">(Receita e Lucro pelo valor real da venda)</span>
                                </CardTitle>
                                <div className="flex gap-4 text-sm font-bold">
                                    <span className="text-rose-600">Custo: {fmt(pecasVendidasReport.totalCusto)}</span>
                                    <span className="text-emerald-600">Receita: {fmt(pecasVendidasReport.totalReceita)}</span>
                                    <span className={pecasVendidasReport.lucroTotal >= 0 ? "text-emerald-700" : "text-rose-700"}>
                                        Lucro: {fmt(pecasVendidasReport.lucroTotal)}
                                    </span>
                                    <span className={pecasVendidasReport.margemMedia >= 0 ? "text-emerald-700" : "text-rose-700"}>
                                        Margem: {pecasVendidasReport.margemMedia >= 0 ? "+" : ""}{pecasVendidasReport.margemMedia.toFixed(1)}%
                                    </span>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-4">
                            <div className="rounded-lg border border-border/50 overflow-hidden">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/50">
                                            <TableHead className="font-bold">Peça</TableHead>
                                            <TableHead className="font-bold">SKU</TableHead>
                                            <TableHead className="text-right font-bold">Custo</TableHead>
                                            <TableHead className="text-right font-bold">Preço Cadastrado</TableHead>
                                            <TableHead className="text-right font-bold">Valor Real</TableHead>
                                            <TableHead className="text-right font-bold">Lucro</TableHead>
                                            <TableHead className="text-right font-bold">Margem</TableHead>
                                            <TableHead className="font-bold">Pedido</TableHead>
                                            <TableHead className="font-bold">Data</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {pecasVendidasReport.itens.map((p) => (
                                            <TableRow key={p.id} className="hover:bg-muted/20">
                                                <TableCell className="font-medium">{p.nome}</TableCell>
                                                <TableCell className="font-mono text-xs">{(p as any).produtos?.sku || "—"}</TableCell>
                                                <TableCell className="text-right font-mono text-rose-600">{fmt(p.custo_estimado)}</TableCell>
                                                <TableCell className="text-right font-mono text-muted-foreground">{fmt((p as any).precoCadastrado)}</TableCell>
                                                <TableCell className="text-right font-mono text-emerald-600 font-bold">{fmt((p as any).valorReal)}</TableCell>
                                                <TableCell className={`text-right font-mono font-bold ${(p as any).lucro >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                                    {fmt((p as any).lucro)}
                                                </TableCell>
                                                <TableCell className={`text-right font-mono font-bold ${(p as any).margem >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                                    {(p as any).margem >= 0 ? "+" : ""}{(p as any).margem.toFixed(1)}%
                                                </TableCell>
                                                <TableCell className="font-mono text-xs">
                                                    {(p as any).vendas?.numero_pedido
                                                        ? `#${String((p as any).vendas.numero_pedido).padStart(6, "0")}`
                                                        : "—"}
                                                </TableCell>
                                                <TableCell className="text-xs text-muted-foreground">
                                                    {(p as any).vendas?.data_venda ? fmtDate((p as any).vendas.data_venda) : "—"}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                            <div className="mt-4 pt-4 border-t border-border flex flex-wrap gap-6 justify-end text-sm">
                                <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground">Total Custo:</span>
                                    <span className="font-bold text-rose-600">{fmt(pecasVendidasReport.totalCusto)}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground">Total Receita:</span>
                                    <span className="font-bold text-emerald-600">{fmt(pecasVendidasReport.totalReceita)}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground">Lucro Total:</span>
                                    <span className={`font-black text-base ${pecasVendidasReport.lucroTotal >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                        {fmt(pecasVendidasReport.lucroTotal)}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground">Margem Média:</span>
                                    <span className={`font-black text-base ${pecasVendidasReport.margemMedia >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                        {pecasVendidasReport.margemMedia >= 0 ? "+" : ""}{pecasVendidasReport.margemMedia.toFixed(1)}%
                                    </span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}


                {/* Modal: Add/Edit Peça */}
                <Modal
                    isOpen={isPecaModalOpen}
                    onClose={() => setIsPecaModalOpen(false)}
                    title={editingPeca ? "Editar Peça" : "Registrar Nova Peça"}
                    className="max-w-5xl"
                >
                    <form onSubmit={handleSavePeca} className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="sm:col-span-2 space-y-1">
                                <Label className="text-sm font-bold uppercase tracking-tight">Nome da Peça *</Label>
                                <Input placeholder="Ex: Motor de Partida" value={pecaForm.nome}
                                    onChange={e => setPecaForm({ ...pecaForm, nome: e.target.value })} required />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-sm font-bold uppercase tracking-tight">Part Number</Label>
                                <Input placeholder="12345-67890" value={pecaForm.part_number}
                                    onChange={e => setPecaForm({ ...pecaForm, part_number: e.target.value })} />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-sm font-bold uppercase tracking-tight">Condição</Label>
                                <Select value={pecaForm.condicao} onChange={e => setPecaForm({ ...pecaForm, condicao: e.target.value })}>
                                    {["Ótima", "Boa", "Regular", "Danificada"].map(c => <option key={c} value={c}>{c}</option>)}
                                </Select>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-sm font-bold uppercase tracking-tight">Custo rateado (R$)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    readOnly
                                    className="bg-muted/60 cursor-not-allowed"
                                    value={pecaForm.custo_estimado}
                                />
                                <p className="text-xs text-muted-foreground leading-snug">
                                    Calculado automaticamente: o custo total da sucata é dividido entre as peças <strong>Disponível</strong> e{" "}
                                    <strong>Cadastrada no Estoque</strong>, em proporção ao valor de venda esperado da linha (preço unitário × quantidade).
                                </p>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-sm font-bold uppercase tracking-tight">Preço de venda unitário (R$)</Label>
                                <Input type="number" step="0.01" min="0" value={pecaForm.preco_venda}
                                    onChange={e => setPecaForm({ ...pecaForm, preco_venda: e.target.value })} />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-sm font-bold uppercase tracking-tight">Quantidade</Label>
                                <Input
                                    type="number"
                                    step="1"
                                    min="1"
                                    value={pecaForm.quantidade}
                                    onChange={e => setPecaForm({ ...pecaForm, quantidade: e.target.value })}
                                />
                                <p className="text-xs text-muted-foreground">Ex.: 4 rodas — mesmo preço unitário, peso no rateio = preço × 4.</p>
                            </div>
                            <div className="space-y-1 sm:col-span-2">
                                <Label className="text-sm font-bold uppercase tracking-tight">Localização (WMS)</Label>
                                <Select value={pecaForm.localizacao_id} onChange={e => setPecaForm({ ...pecaForm, localizacao_id: e.target.value })}>
                                    <option value="">Sem localização</option>
                                    {locations.map(l => (
                                        <option key={l.id} value={l.id}>{l.sigla || l.nome} — {l.nome}</option>
                                    ))}
                                </Select>
                            </div>
                            <div className="space-y-1 sm:col-span-2">
                                <Label className="text-sm font-bold uppercase tracking-tight">Status</Label>
                                <Select value={pecaForm.status} onChange={e => setPecaForm({ ...pecaForm, status: e.target.value })}>
                                    {["Disponível", "Cadastrada no Estoque", "Vendida", "Descartada"].map(s => <option key={s} value={s}>{s}</option>)}
                                </Select>
                            </div>
                            <div className="space-y-1 sm:col-span-2">
                                <Label className="text-xs font-black uppercase text-muted-foreground">Responsável</Label>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <div className="flex-1 px-3 py-1.5 rounded-md border border-dashed border-primary/30 bg-primary/5 text-xs font-bold text-primary flex items-center gap-2">
                                        <UserCheck className="w-3.5 h-3.5" /> {atendente?.nome || "Atendente Logado"}
                                    </div>
                                    <select 
                                        className="h-8 text-[10px] border rounded-md px-1 bg-transparent border-muted-foreground/20 text-muted-foreground w-full sm:w-32"
                                        value={pecaDesmontadorId} 
                                        onChange={e => setPecaDesmontadorId(e.target.value)}
                                    >
                                        <option value="">+ Desmontador</option>
                                        {desmontadores.map((d: { id: string; nome: string }) => (
                                            <option key={d.id} value={d.id}>{d.nome}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="space-y-1 sm:col-span-2">
                                <Label className="text-sm font-bold uppercase tracking-tight">Descrição</Label>
                                <textarea
                                    className="w-full h-20 rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                                    placeholder="Detalhes adicionais..."
                                    value={pecaForm.descricao}
                                    onChange={e => setPecaForm({ ...pecaForm, descricao: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="flex gap-3 pt-2">
                            <Button type="button" variant="outline" className="flex-1" onClick={() => setIsPecaModalOpen(false)}>Cancelar</Button>
                            <Button type="submit" className="flex-1" disabled={submitting}>
                                {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                {editingPeca ? " Atualizar" : " Registrar"}
                            </Button>
                        </div>
                    </form>
                </Modal>

                <DismantlingChecklistDialog
                    isOpen={isChecklistOpen}
                    onClose={() => setIsChecklistOpen(false)}
                    sucata={selectedSucata}
                    onComplete={handleBulkSavePecas}
                    locations={locations}
                    categorias={categorias}
                />

                {/* Mini-modal: coletar numeração/detalhes ao selecionar categoria */}
                {catPedindoInfo && (
                    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                        <div className="bg-background rounded-2xl shadow-2xl border border-violet-300 w-full max-w-sm p-5 space-y-4">
                            <div>
                                <p className="text-sm font-black uppercase text-violet-700">{catPedindoInfo.cat.nome}</p>
                                <p className="text-[11px] text-muted-foreground mt-0.5">Preencha as informações para compor o nome do produto.</p>
                            </div>
                            {(catPedindoInfo.tipo === 'numeracao' || catPedindoInfo.tipo === 'ambos') && (
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground">Numeração</label>
                                    <input
                                        autoFocus
                                        type="text"
                                        placeholder="Ex: 1234, A5, 001..."
                                        value={catInfoInput.numeracao}
                                        onChange={e => setCatInfoInput(prev => ({ ...prev, numeracao: e.target.value }))}
                                        onKeyDown={e => e.key === 'Enter' && confirmarCatInfo()}
                                        className="w-full h-9 px-3 rounded-lg border border-violet-300 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-violet-400"
                                    />
                                </div>
                            )}
                            {(catPedindoInfo.tipo === 'detalhes' || catPedindoInfo.tipo === 'ambos') && (
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground">Detalhes</label>
                                    <input
                                        autoFocus={catPedindoInfo.tipo === 'detalhes'}
                                        type="text"
                                        placeholder="Ex: lado esquerdo, 2.0, turbo..."
                                        value={catInfoInput.detalhes}
                                        onChange={e => setCatInfoInput(prev => ({ ...prev, detalhes: e.target.value }))}
                                        onKeyDown={e => e.key === 'Enter' && confirmarCatInfo()}
                                        className="w-full h-9 px-3 rounded-lg border border-violet-300 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-violet-400"
                                    />
                                </div>
                            )}
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-muted-foreground">Part Number</label>
                                <input
                                    type="text"
                                    placeholder="Ex: 5W0809811..."
                                    value={catInfoInput.part_number}
                                    onChange={e => setCatInfoInput(prev => ({ ...prev, part_number: e.target.value }))}
                                    onKeyDown={e => e.key === 'Enter' && confirmarCatInfo()}
                                    className="w-full h-9 px-3 rounded-lg border border-violet-300 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-violet-400"
                                />
                            </div>
                            <div className="flex gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={() => { setCatPedindoInfo(null); setCatInfoInput({ numeracao: '', detalhes: '', part_number: '' }) }}
                                    className="flex-1 h-9 rounded-lg border border-border text-sm font-bold hover:bg-muted transition-colors"
                                >Cancelar</button>
                                <button
                                    type="button"
                                    onClick={confirmarCatInfo}
                                    className="flex-1 h-9 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold transition-colors"
                                >Confirmar</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Modal: Desmontagem Rápida por Categorias */}
                <Modal
                    isOpen={isDesmontandoOpen}
                    onClose={() => {
                        if (window.confirm("Deseja realmente voltar? As categorias selecionadas podem ser perdidas.")) {
                            setIsDesmontandoOpen(false)
                            setBatchModalMode("desmontagem")
                            setFotosSelecionadasPlanejamento([])
                            setCatsEscondidas([])
                        }
                    }}
                    title={
                        batchModalMode === "planejado"
                            ? `Peças no veículo (por categorias) — ${selectedSucata.marca} ${selectedSucata.modelo} ${selectedSucata.ano_modelo || ""}`
                            : `Desmontagem rápida — ${selectedSucata.marca} ${selectedSucata.modelo} ${selectedSucata.ano_modelo || ""}`
                    }
                    className="max-w-5xl"
                >
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 flex-wrap p-2 rounded-lg bg-muted/40 border border-border">
                            <UserCheck className="w-4 h-4 text-primary shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Vincular Registro</p>
                                <p className="text-sm font-bold text-foreground">Registrando como: {atendente?.nome || "Atendente Logado"}</p>
                            </div>
                            {/* Mantemos o estado do desmontador caso o backend ainda exija, mas escondemos a obrigatoriedade */}
                            <select
                                value={desmontadorId}
                                onChange={e => setDesmontadorId(e.target.value)}
                                className="h-7 text-[10px] border rounded-md px-1 bg-transparent border-muted-foreground/20 text-muted-foreground"
                            >
                                <option value="">Alterar (opcional)</option>
                                {desmontadores.map(d => (
                                    <option key={d.id} value={d.id}>{d.nome}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex items-center justify-between gap-2 flex-wrap">
                            <p className="text-sm text-muted-foreground flex-1 min-w-0">
                                {batchModalMode === "planejado" ? (
                                    <>
                                        Selecione as categorias das peças que <strong>ainda estão no veículo</strong>. O sistema criará <strong>produto no estoque</strong> (SKU automático), linha na sucata e abrirá as etiquetas — como em &quot;Desmontar peças&quot;. A localização WMS da linha será{" "}
                                        <strong className="text-foreground">Sucata ({selectedSucata.codigo})</strong>.
                                    </>
                                ) : (
                                    <>
                                        Selecione as categorias das peças já desmontadas. O sistema criará um produto por categoria com SKU automático e nome gerado a partir da sucata.
                                    </>
                                )}
                            </p>
                            <button
                                type="button"
                                onClick={() => printChecklistCategorias(selectedSucata)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
                                title="Imprimir checklist de categorias"
                            >
                                <Printer className="w-3.5 h-3.5" /> Imprimir Checklist
                            </button>
                        </div>

                        {batchModalMode === "planejado" && (
                            <div className="rounded-xl border border-sky-200 bg-sky-50/80 p-3 space-y-2">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1 space-y-1">
                                        <p className="text-xs font-black uppercase tracking-widest text-sky-800 flex items-center gap-1.5">
                                            <Camera className="w-3.5 h-3.5 shrink-0" />
                                            Fotos para as peças e para o estoque
                                        </p>
                                        <p className="text-xs text-sky-900/90 leading-snug">
                                            Escolha quais fotos do veículo copiar para o produto e para a linha da peça (primeira = capa).
                                        </p>
                                    </div>
                                    {/* Botões: remover shrink-0 para permitir quebra */}
                                    {(selectedSucata.fotos?.length ?? 0) > 0 && (
                                        <div className="flex flex-wrap gap-1.5">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="h-7 text-[10px] border-sky-300 bg-white"
                                                onClick={() => setFotosSelecionadasPlanejamento([...(selectedSucata.fotos || [])])}
                                            >
                                                Marcar todas
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="h-7 text-[10px] border-sky-300 bg-white"
                                                onClick={() => setFotosSelecionadasPlanejamento([])}
                                            >
                                                Desmarcar todas
                                            </Button>
                                        </div>
                                    )}
                                </div>
                                {!(selectedSucata.fotos?.length) ? (
                                    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
                                        Esta sucata ainda não tem fotos do veículo. Adicione fotos na sucata para associá-las às peças planejadas.
                                    </p>
                                ) : (
                                    <>
                                        <p className="text-xs font-bold text-sky-800">
                                            {fotosPlanejamentoOrdenadas.length} de {(selectedSucata.fotos || []).length} selecionada(s)
                                        </p>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                            {(selectedSucata.fotos || []).map((url) => {
                                                const on = fotosSelecionadasPlanejamento.includes(url)
                                                return (
                                                    <button
                                                        key={url}
                                                        type="button"
                                                        onClick={() => toggleFotoPlanejamento(url)}
                                                        className={cn(
                                                            "relative aspect-square rounded-lg overflow-hidden border-2 transition-all focus:outline-none focus:ring-2 focus:ring-sky-400",
                                                            on ? "border-sky-600 ring-1 ring-sky-400" : "border-border opacity-80 hover:opacity-100"
                                                        )}
                                                        title={on ? "Remover da seleção" : "Incluir nas peças"}
                                                    >
                                                        <SucataFotoImg src={url} alt="" imgClassName="w-full h-full object-cover" />
                                                        {on && (
                                                            <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-sky-600 text-white flex items-center justify-center shadow">
                                                                <Check className="w-3 h-3" />
                                                            </span>
                                                        )}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Grupos / Busca / Lista */}
                        <div className="flex-1 flex flex-col min-h-[50vh] md:min-h-0 relative">
                            {(() => {
                                const normalize = (str: string) => (str || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                                const searchTerms = normalize(searchCat).split(" ").filter(Boolean);
                                const isViewingGroups = !filtroGrupoCat && searchTerms.length === 0;

                                const GRUPO_ICONS: Record<string, any> = {
                                    'Motor': Settings, 'Injeção': Zap, 'Arrefecimento': Thermometer,
                                    'Ar Condicionado': Snowflake, 'Transmissão': Cog, 'Suspensão': Move,
                                    'Freios': Disc, 'Direção': CircleDot, 'Elétrica': Battery,
                                    'Lataria': Car, 'Carroceria': Box, 'Peças Exterior': Shield,
                                    'Peças Interior': Speaker, 'Outro': Layers,
                                }
                                const allGroups = Object.keys(GRUPO_ICONS).sort((a, b) => a.localeCompare(b));
                                
                                const GRUPO_COLORS_LOCAL: Record<string, string> = {
                                    'Motor': 'bg-rose-500', 'Injeção': 'bg-cyan-500', 'Arrefecimento': 'bg-sky-500',
                                    'Ar Condicionado': 'bg-blue-500', 'Transmissão': 'bg-indigo-500', 'Suspensão': 'bg-purple-500',
                                    'Freios': 'bg-red-500', 'Direção': 'bg-teal-500', 'Elétrica': 'bg-yellow-500',
                                    'Lataria': 'bg-orange-500', 'Carroceria': 'bg-amber-500', 'Peças Exterior': 'bg-lime-600',
                                    'Peças Interior': 'bg-emerald-500', 'Outro': 'bg-gray-500',
                                }

                                if (isViewingGroups) {
                                    return (
                                        <div className="flex flex-col flex-1 h-full">
                                            <div className="relative mb-4 shrink-0 px-1">
                                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                                <Input
                                                    placeholder="Buscar peça..."
                                                    value={searchCat}
                                                    onChange={e => setSearchCat(e.target.value)}
                                                    className="pl-11 h-12 rounded-xl text-base shadow-sm border-2 focus-visible:ring-0 focus-visible:border-violet-500 transition-all bg-card"
                                                />
                                            </div>
                                            <div className="flex-1 overflow-y-auto pb-16 md:pb-0 px-1">
                                                <h3 className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                                                    <span className="w-4 h-[2px] bg-border rounded-full inline-block" />
                                                    Selecione um Grupo
                                                </h3>
                                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                                    {allGroups.map(g => {
                                                        const Icon = GRUPO_ICONS[g] || Layers;
                                                        const colorClass = GRUPO_COLORS_LOCAL[g] || 'bg-gray-500';
                                                        return (
                                                            <div key={g} onClick={() => setFiltroGrupoCat(g)}
                                                                className="flex flex-col items-center justify-center p-3 sm:p-4 rounded-2xl border-2 border-border/60 bg-card hover:border-violet-400 hover:bg-violet-50/30 active:scale-95 transition-all cursor-pointer select-none text-center gap-3 shadow-sm hover:shadow-md overflow-hidden min-w-0">
                                                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white ${colorClass} shadow-md shrink-0`}>
                                                                    <Icon className="w-6 h-6" />
                                                                </div>
                                                                <span className="text-xs font-black leading-snug uppercase text-foreground break-words w-full">{g}</span>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                }

                                // else render categories list
                                const selectedCatsList = catsSelecionadas.map(x => x.categoria).filter(Boolean);
                                const allPossibleCats = [
                                    ...selectedCatsList,
                                    ...(categorias || [])
                                ].filter((c, index, self) => self.findIndex(x => x.id === c.id) === index)

                                const filtered = allPossibleCats.filter(c => {
                                    if (catsEscondidas.includes(c.id)) return false;

                                    const isSelected = catsSelecionadas.some(sel => sel.categoria.id === c.id);
                                    if (isSelected) return true;

                                    const hasSearch = searchCat.trim() !== "";
                                    const nameMatch = !hasSearch ? true : searchTerms.every(term => normalize(c.nome).includes(term));
                                    // If name search is active, ignore group filter to search across all categories. Otherwise, match the selected group.
                                    const groupMatch = !hasSearch ? (!filtroGrupoCat || c.grupo === filtroGrupoCat) : true;
                                    
                                    return nameMatch && groupMatch;
                                })

                                return (
                                    <div className="flex flex-col flex-1 h-full">
                                        <div className="flex gap-2 mb-4 shrink-0 px-1">
                                            <Button variant="outline" className="w-12 h-12 rounded-xl shrink-0 p-0 border-2 shadow-sm" onClick={() => {setFiltroGrupoCat(''); setSearchCat('')}}>
                                                <ArrowLeft className="w-5 h-5 text-foreground" />
                                            </Button>
                                            <div className="relative flex-1">
                                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                                <Input
                                                    placeholder={filtroGrupoCat ? `Buscar em ${filtroGrupoCat}...` : "Buscar..."}
                                                    value={searchCat}
                                                    onChange={e => setSearchCat(e.target.value)}
                                                    className="pl-11 h-12 rounded-xl text-base shadow-sm border-2 focus-visible:ring-0 focus-visible:border-violet-500 transition-all bg-card"
                                                    autoFocus={searchTerms.length > 0}
                                                />
                                            </div>
                                        </div>
                                        
                                        <div className="flex-1 overflow-y-auto pr-1 pb-16 md:pb-0">
                                            {filtroGrupoCat && (
                                                <h3 className="text-[11px] font-black uppercase tracking-widest text-violet-600 mb-3 px-1 flex items-center gap-2">
                                                    <span className="w-4 h-[2px] bg-violet-400 rounded-full inline-block" />
                                                    Grupo: {filtroGrupoCat}
                                                </h3>
                                            )}
                                            
                                            {filtered.length === 0 ? (
                                                <div className="flex flex-col items-center justify-center py-10 text-center space-y-3 opacity-60">
                                                    <Search className="w-10 h-10 text-muted-foreground" />
                                                    <p className="text-sm font-bold text-muted-foreground uppercase">Nenhuma peça encontrada.</p>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                                    {filtered.map(cat => {
                                                        const sel = catsSelecionadas.find(c => c.categoria.id === cat.id)
                                                        return (
                                                            <div key={cat.id} onClick={() => toggleCategoria(cat)}
                                                                className={`relative cursor-pointer rounded-2xl border-2 px-3 py-3 transition-all select-none flex flex-col gap-3 ${sel ? 'border-violet-500 bg-violet-50/50 shadow-md' : 'border-border/60 hover:border-violet-300 hover:bg-violet-50/40 bg-card'}`}>
                                                                
                                                                <div className="flex flex-row items-center gap-3">
                                                                    {cat.imagem_url ? (
                                                                        <img 
                                                                            src={normalizeFotoDisplayUrl(cat.imagem_url)} 
                                                                            alt="" 
                                                                            className="w-14 h-14 object-cover rounded-xl bg-muted shrink-0 shadow-sm" 
                                                                            onClick={(e) => { e.stopPropagation(); setPreviewImg(cat.imagem_url); }}
                                                                        />
                                                                    ) : (
                                                                        <div className="w-14 h-14 flex items-center justify-center rounded-xl bg-muted shrink-0">
                                                                            <Layers className="w-6 h-6 opacity-30 text-muted-foreground" />
                                                                        </div>
                                                                    )}
                                                                    
                                                                    <span className="flex-1 text-sm font-bold uppercase leading-snug text-foreground break-words">{cat.nome}</span>
                                                                    
                                                                    <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${sel ? 'bg-violet-500 border-violet-500' : 'border-muted-foreground/30 bg-background'}`}>
                                                                        {sel && <Check className="w-5 h-5 text-white" />}
                                                                    </div>
                                                                </div>
                                                                {sel && (
                                                                    <div className="pt-2 border-t border-violet-200/60 space-y-1.5" onClick={e => e.stopPropagation()}>
                                                                        <div className="flex items-center gap-2">
                                                                            <label className="text-[11px] text-muted-foreground font-bold shrink-0 uppercase tracking-wider">Qtd:</label>
                                                                            <input type="number" min={1} value={sel.quantidade}
                                                                                onChange={e => updateQtd(cat.id, e.target.value)}
                                                                                className="w-full h-8 text-sm text-center rounded-lg border border-violet-300 bg-white font-bold focus:outline-none focus:ring-2 focus:ring-violet-400" />
                                                                        </div>
                                                                        {sel.numeracao && <p className="text-[11px] font-bold text-violet-700 truncate bg-violet-100/50 px-2 py-1 rounded">Nº: {sel.numeracao}</p>}
                                                                        {sel.detalhes && <p className="text-[11px] font-bold text-violet-700 truncate bg-violet-100/50 px-2 py-1 rounded">Det: {sel.detalhes}</p>}
                                                                        {sel.part_number && <p className="text-[11px] font-bold text-violet-700 truncate bg-violet-100/50 px-2 py-1 rounded">PN: {sel.part_number}</p>}
                                                                        {/* ── Botões de câmera ── */}
                                                                        <div className="flex gap-2 pt-1">
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setCameraModal({ catId: cat.id, mode: 'produto' })}
                                                                                className={cn(
                                                                                    "flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg text-xs font-black uppercase tracking-wide transition-all border-2",
                                                                                    (sel.fotosCaptura?.length ?? 0) > 0
                                                                                        ? "border-violet-500 bg-violet-500 text-white shadow-md"
                                                                                        : "border-violet-300 text-violet-700 bg-white hover:bg-violet-50"
                                                                                )}
                                                                                title="Tirar fotos da peça"
                                                                            >
                                                                                <Camera className="w-3.5 h-3.5 shrink-0" />
                                                                                Fotos ({sel.fotosCaptura?.length ?? 0}/10)
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setCameraModal({ catId: cat.id, mode: 'defeito' })}
                                                                                className={cn(
                                                                                    "flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg text-xs font-black uppercase tracking-wide transition-all border-2",
                                                                                    (sel.fotosDefeito?.length ?? 0) > 0
                                                                                        ? "border-red-500 bg-red-500 text-white shadow-md"
                                                                                        : "border-red-300 text-red-600 bg-white hover:bg-red-50"
                                                                                )}
                                                                                title="Tirar fotos do defeito da peça"
                                                                            >
                                                                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                                                                Defeito ({sel.fotosDefeito?.length ?? 0}/3)
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setQrCameraModal({ catId: cat.id })}
                                                                                className={cn(
                                                                                    "flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg text-xs font-black uppercase tracking-wide transition-all border-2",
                                                                                    sel.localizacaoLida
                                                                                        ? "border-emerald-500 bg-emerald-500 text-white shadow-md"
                                                                                        : "border-emerald-300 text-emerald-700 bg-white hover:bg-emerald-50"
                                                                                )}
                                                                                title="Ler QR Code da Localização"
                                                                            >
                                                                                <MapPin className="w-3.5 h-3.5 shrink-0" />
                                                                                Local
                                                                            </button>
                                                                        </div>
                                                                        <button
                                                                            type="button"
                                                                            onClick={(e) => { e.stopPropagation(); setCatsEscondidas([...catsEscondidas, cat.id]) }}
                                                                            className="w-full flex items-center justify-center gap-1.5 h-8 mt-1.5 rounded-lg text-xs font-black uppercase tracking-wide transition-all bg-green-500 hover:bg-green-600 text-white shadow-sm"
                                                                            title="Confirmar seleção e ocultar"
                                                                        >
                                                                            <Check className="w-3.5 h-3.5" />
                                                                            OK
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )
                            })()}
                        </div>

                        {/* Resumo da seleção */}
                        {catsSelecionadas.length > 0 && (
                            <div className="p-3 rounded-xl bg-violet-50 border border-violet-200 space-y-1.5">
                                <p className="text-xs font-black text-violet-700 uppercase tracking-wide flex items-center gap-1.5 flex-wrap">
                                    {batchModalMode === "planejado" ? (
                                        <Layers className="w-3.5 h-3.5 shrink-0" />
                                    ) : (
                                        <Scissors className="w-3.5 h-3.5 shrink-0" />
                                    )}
                                    {catsSelecionadas.length} categorias —{" "}
                                    {batchModalMode === "planejado"
                                        ? `${catsSelecionadas.reduce((a, c) => a + c.quantidade, 0)} produtos a criar (veículo)`
                                        : `${catsSelecionadas.reduce((a, c) => a + c.quantidade, 0)} produtos a criar`}
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {catsSelecionadas.map(({ categoria, quantidade, numeracao, detalhes, part_number }) => (
                                        <button
                                            key={categoria.id}
                                            type="button"
                                            onClick={() => setCatsEscondidas(prev => prev.filter(id => id !== categoria.id))}
                                            className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500 hover:bg-violet-600 transition-colors text-white cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-1"
                                            title="Clique para voltar a exibir na lista"
                                        >
                                            {categoria.nome}{numeracao ? ` #${numeracao}` : ''}{detalhes ? ` · ${detalhes}` : ''}{part_number ? ` (PN: ${part_number})` : ''} ×{quantidade}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Preview do nome do produto gerado */}
                        {catsSelecionadas.length > 0 && (
                            <div className="p-3 rounded-xl bg-muted/40 border border-border">
                                <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Exemplo de nome do produto gerado:</p>
                                <p className="text-xs font-mono font-bold text-foreground uppercase">
                                    {buildNomeProdutoPecaSucata(catsSelecionadas[0].categoria.nome, selectedSucata, { numeracao: catsSelecionadas[0].numeracao, detalhes: catsSelecionadas[0].detalhes })}
                                </p>
                            </div>
                        )}

                        <div className="flex gap-3 pt-2 border-t border-border">
                            <Button type="button" variant="outline" className="flex-1" onClick={() => { 
                                if (window.confirm("Deseja realmente cancelar? As categorias selecionadas serão perdidas.")) {
                                    setIsDesmontandoOpen(false); 
                                    setBatchModalMode("desmontagem"); 
                                    setFotosSelecionadasPlanejamento([]);
                                    setCatsEscondidas([]);
                                }
                            }}>
                                Cancelar
                            </Button>
                            <Button
                                type="button"
                                className={`flex-1 gap-2 font-bold text-white ${batchModalMode === "planejado" ? "bg-sky-600 hover:bg-sky-700" : "bg-violet-600 hover:bg-violet-700"}`}
                                disabled={catsSelecionadas.length === 0 || gerandoPecas}
                                onClick={() => handleConfirmarLoteCategorias()}
                            >
                                {gerandoPecas ? (
                                    <><RefreshCw className="w-4 h-4 animate-spin" /> Gerando...</>
                                ) : (
                                    <><Printer className="w-4 h-4" /> Gerar Produtos e Imprimir Etiquetas</>
                                )}
                            </Button>
                        </div>
                    </div>
                </Modal>

                {/* Overlay para visualização da imagem da categoria */}
                {previewImg && (
                    <div 
                        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm cursor-zoom-out animate-in fade-in zoom-in-95"
                        onClick={() => setPreviewImg(null)}
                    >
                        <div className="relative max-w-4xl max-h-full overflow-hidden rounded-2xl shadow-2xl bg-white p-2">
                            <img 
                                src={normalizeFotoDisplayUrl(previewImg)} 
                                alt="Preview" 
                                className="max-w-full max-h-[90vh] object-contain rounded-xl"
                            />
                            <button 
                                className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
                                onClick={() => setPreviewImg(null)}
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Modal de vídeos da sucata */}
                {isVideoModalOpen && (
                    <SucataVideoCameraModal
                        isOpen={isVideoModalOpen}
                        maxVideos={5}
                        onSave={(files) => {
                            setSucataVideoFiles(prev => [...prev, ...files])
                            const newUrls = files.map(f => URL.createObjectURL(f))
                            setSucataVideoPreviews(prev => [...prev, ...newUrls])
                            setIsVideoModalOpen(false)
                        }}
                        onClose={() => setIsVideoModalOpen(false)}
                    />
                )}

                {/* Modal de câmera: fotos da peça ou de defeito */}
                {cameraModal && (
                    <PartPhotoCameraModal
                        isOpen={!!cameraModal}
                        mode={cameraModal.mode}
                        maxPhotos={cameraModal.mode === 'produto' ? 10 : 3}
                        existingFiles={
                            cameraModal.mode === 'produto'
                                ? catsSelecionadas.find(c => c.categoria.id === cameraModal.catId)?.fotosCaptura
                                : catsSelecionadas.find(c => c.categoria.id === cameraModal.catId)?.fotosDefeito
                        }
                        onSave={(files) => handleSaveCameraPhotos(cameraModal.catId, cameraModal.mode, files)}
                        onClose={() => setCameraModal(null)}
                    />
                )}

                {/* Modal do QR Scanner */}
                {qrCameraModal && (
                    <Modal isOpen={true} onClose={() => setQrCameraModal(null)} title="Ler QR Code da Localização" className="max-w-md">
                        <div className="p-4 space-y-4 flex flex-col items-center justify-center">
                            <p className="text-sm text-center text-muted-foreground">Aponte a câmera para o QR Code da prateleira/localização onde a peça será guardada.</p>
                            <div className="w-full max-w-[300px] aspect-square rounded-xl overflow-hidden bg-black flex items-center justify-center relative">
                                <QrCameraScanner
                                    key={`qr-sucatas-${qrCameraModal.catId}`}
                                    divId={`qr-sucatas-${qrCameraModal.catId}`}
                                    active={!!qrCameraModal}
                                    onResult={(result) => {
                                        setCatsSelecionadas(prev => prev.map(c => 
                                            c.categoria.id === qrCameraModal.catId ? { ...c, localizacaoLida: result } : c
                                        ))
                                        setQrCameraModal(null)
                                    }}
                                />
                            </div>
                        </div>
                    </Modal>
                )}
            </div >
        )
    }
    // ────────────────────────────────────────────────────────────────────────────
    // RENDER — LIST VIEW
    // ────────────────────────────────────────────────────────────────────────────

    return (
        <div className="space-y-6 w-full min-w-0">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between min-w-0">
                <div className="min-w-0">
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                        <Car className="w-8 h-8 text-primary shrink-0" /> Sucatas
                    </h1>
                    <p className="text-muted-foreground mt-1">Gestão de veículos comprados em leilão e suas peças desmontadas.</p>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                    <Button variant="outline" className="gap-2" onClick={() => { setView('relatorio'); fetchRelatorioVendas() }}>
                        <FileBarChart2 className="w-4 h-4" /> Relatório de Vendas
                    </Button>
                    <Button variant="outline" className="gap-2" onClick={() => { setView('comissoes'); fetchComissoes(comissaoMes) }}>
                        <Award className="w-4 h-4" /> Comissões
                    </Button>
                    <Link to="/relatorios?relatorio=cadastro_e_fotos" className={cn("inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 gap-2 border-cyan-200 text-cyan-800 hover:bg-cyan-50")}>
                        <Camera className="w-4 h-4" /> Fotos e cadastro
                    </Link>
                    <Button className="gap-2" onClick={openNewSucata}>
                        <Plus className="w-4 h-4" /> Nova Sucata
                    </Button>
                </div>
            </div>

            {/* ── VIEW RELATÓRIO DE PEÇAS VENDIDAS ───────────────────────── */}
            {view === 'relatorio' && (
                <div className="space-y-5">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                        <div className="flex items-center gap-3">
                            <Button variant="outline" size="sm" className="gap-2" onClick={() => setView('list')}>
                                <ChevronLeft className="w-4 h-4" /> Voltar
                            </Button>
                            <h2 className="text-lg font-black flex items-center gap-2">
                                <FileBarChart2 className="w-5 h-5 text-emerald-600" />
                                Relatório de Peças Vendidas por Sucata
                            </h2>
                        </div>
                        {relatorioVendas && relatorioVendas.porSucata.length > 0 && (
                            <Button variant="outline" size="sm" className="gap-2" onClick={() => {
                                const rows: string[] = [
                                    "Sucata;Veículo;Qtd;Custo;Receita;Lucro;Margem %",
                                    ...relatorioVendas.porSucata.map(s =>
                                        `${s.sucata.codigo};${s.sucata.marca} ${s.sucata.modelo} ${s.sucata.ano_modelo || ""};${s.qtd};${s.totalCusto.toFixed(2)};${s.totalReceita.toFixed(2)};${s.lucro.toFixed(2)};${s.margem.toFixed(1)}%`
                                    ),
                                    `;;${relatorioVendas.totais.qtd};${relatorioVendas.totais.custo.toFixed(2)};${relatorioVendas.totais.receita.toFixed(2)};${relatorioVendas.totais.lucro.toFixed(2)};${relatorioVendas.totais.margem.toFixed(1)}%`
                                ]
                                const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" })
                                const url = URL.createObjectURL(blob)
                                const a = document.createElement("a")
                                a.href = url
                                a.download = `relatorio-pecas-vendidas-${new Date().toISOString().slice(0, 10)}.csv`
                                a.click()
                                URL.revokeObjectURL(url)
                            }}>
                                <Printer className="w-4 h-4" /> Exportar CSV
                            </Button>
                        )}
                    </div>
                    {loadingRelatorio ? (
                        <div className="flex justify-center py-16 text-muted-foreground gap-2">
                            <RefreshCw className="w-5 h-5 animate-spin" /> Carregando relatório...
                        </div>
                    ) : !relatorioVendas || relatorioVendas.porSucata.length === 0 ? (
                        <Card className="border-dashed">
                            <CardContent className="py-16 text-center text-muted-foreground">
                                <FileBarChart2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                <p className="font-bold">Nenhuma peça vendida encontrada</p>
                                <p className="text-sm mt-1">As peças vendidas de cada sucata aparecerão aqui quando houver vendas.</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="space-y-4">
                            {/* Cards de totais */}
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                <Card className="bg-muted/30">
                                    <CardContent className="pt-4 pb-3">
                                        <p className="text-xs text-muted-foreground font-bold uppercase">Peças Vendidas</p>
                                        <p className="text-2xl font-black text-blue-600">{relatorioVendas.totais.qtd}</p>
                                    </CardContent>
                                </Card>
                                <Card className="bg-rose-50/50 dark:bg-rose-950/20 border-rose-200/50">
                                    <CardContent className="pt-4 pb-3">
                                        <p className="text-xs text-muted-foreground font-bold uppercase">Custo Total</p>
                                        <p className="text-xl font-black text-rose-600">{fmt(relatorioVendas.totais.custo)}</p>
                                    </CardContent>
                                </Card>
                                <Card className="bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/50">
                                    <CardContent className="pt-4 pb-3">
                                        <p className="text-xs text-muted-foreground font-bold uppercase">Receita Total</p>
                                        <p className="text-xl font-black text-emerald-600">{fmt(relatorioVendas.totais.receita)}</p>
                                    </CardContent>
                                </Card>
                                <Card className={relatorioVendas.totais.lucro >= 0 ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/50" : "bg-rose-50/50 dark:bg-rose-950/20 border-rose-200/50"}>
                                    <CardContent className="pt-4 pb-3">
                                        <p className="text-xs text-muted-foreground font-bold uppercase">Lucro Total</p>
                                        <p className={`text-xl font-black ${relatorioVendas.totais.lucro >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                            {fmt(relatorioVendas.totais.lucro)}
                                        </p>
                                    </CardContent>
                                </Card>
                                <Card className={relatorioVendas.totais.margem >= 0 ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/50" : "bg-rose-50/50 dark:bg-rose-950/20 border-rose-200/50"}>
                                    <CardContent className="pt-4 pb-3">
                                        <p className="text-xs text-muted-foreground font-bold uppercase">Margem Média</p>
                                        <p className={`text-xl font-black ${relatorioVendas.totais.margem >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                            {relatorioVendas.totais.margem >= 0 ? "+" : ""}{relatorioVendas.totais.margem.toFixed(1)}%
                                        </p>
                                    </CardContent>
                                </Card>
                            </div>
                            {/* Tabela por sucata */}
                            <Card className="border-emerald-200/50 overflow-hidden">
                                <div className="rounded-lg overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-muted/50">
                                                <TableHead className="font-bold">Sucata</TableHead>
                                                <TableHead className="font-bold">Veículo</TableHead>
                                                <TableHead className="text-center font-bold">Qtd</TableHead>
                                                <TableHead className="text-right font-bold">Custo</TableHead>
                                                <TableHead className="text-right font-bold">Receita</TableHead>
                                                <TableHead className="text-right font-bold">Lucro</TableHead>
                                                <TableHead className="text-right font-bold">Margem</TableHead>
                                                <TableHead className="w-24"></TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {relatorioVendas.porSucata.map((s) => (
                                                <TableRow key={s.sucata.id} className="hover:bg-muted/20">
                                                    <TableCell className="font-mono font-bold">{s.sucata.codigo}</TableCell>
                                                    <TableCell>
                                                        <span className="font-medium">{s.sucata.marca} {s.sucata.modelo}</span>
                                                        {s.sucata.ano_modelo && <span className="text-muted-foreground text-sm"> {s.sucata.ano_modelo}</span>}
                                                    </TableCell>
                                                    <TableCell className="text-center font-mono">{s.qtd}</TableCell>
                                                    <TableCell className="text-right font-mono text-rose-600">{fmt(s.totalCusto)}</TableCell>
                                                    <TableCell className="text-right font-mono text-emerald-600 font-bold">{fmt(s.totalReceita)}</TableCell>
                                                    <TableCell className={`text-right font-mono font-bold ${s.lucro >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{fmt(s.lucro)}</TableCell>
                                                    <TableCell className={`text-right font-mono font-bold ${s.margem >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                                        {s.margem >= 0 ? "+" : ""}{s.margem.toFixed(1)}%
                                                    </TableCell>
                                                    <TableCell>
                                                        <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => {
                                                            const suc = sucatas.find(x => x.id === s.sucata.id)
                                                            if (suc) { setSelectedSucata(suc); setView("detail"); fetchPecas(s.sucata.id) }
                                                        }}>
                                                            <ExternalLink className="w-3.5 h-3.5" /> Ver
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                                <div className="border-t bg-muted/30 px-4 py-3 flex flex-wrap gap-6 justify-end text-sm font-bold">
                                    <span className="text-muted-foreground">Total:</span>
                                    <span className="text-rose-600">{fmt(relatorioVendas.totais.custo)}</span>
                                    <span className="text-emerald-600">{fmt(relatorioVendas.totais.receita)}</span>
                                    <span className={relatorioVendas.totais.lucro >= 0 ? "text-emerald-600" : "text-rose-600"}>{fmt(relatorioVendas.totais.lucro)}</span>
                                    <span className={relatorioVendas.totais.margem >= 0 ? "text-emerald-600" : "text-rose-600"}>
                                        {relatorioVendas.totais.margem >= 0 ? "+" : ""}{relatorioVendas.totais.margem.toFixed(1)}%
                                    </span>
                                </div>
                            </Card>
                        </div>
                    )}
                </div>
            )}

            {/* ── VIEW COMISSÕES ─────────────────────────────────────────── */}
            {view === 'comissoes' && (
                <div className="space-y-5">
                    <div className="flex items-center gap-3">
                        <Button variant="outline" size="sm" className="gap-2" onClick={() => setView('list')}>
                            <ChevronLeft className="w-4 h-4" /> Voltar
                        </Button>
                        <h2 className="text-lg font-black flex items-center gap-2"><Award className="w-5 h-5 text-amber-500" /> Comissões por Desmontador</h2>
                    </div>
                    <div className="flex items-center gap-3">
                        <label className="text-sm font-bold text-muted-foreground">Mês:</label>
                        <input
                            type="month"
                            value={comissaoMes}
                            onChange={e => { setComissaoMes(e.target.value); fetchComissoes(e.target.value) }}
                            className="h-9 border rounded-lg px-3 text-sm"
                        />
                    </div>
                    {comissaoData.length === 0 ? (
                        <div className="text-center py-16 text-muted-foreground">
                            <Award className="w-12 h-12 mx-auto mb-3 opacity-20" />
                            <p className="font-bold">Nenhum dado de desmontagem neste mês</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {comissaoData.map((d, i) => {
                                const totalComissao = (d.carros * d.comissao_por_carro) + (d.pecas * d.comissao_por_peca)
                                return (
                                    <div key={i} className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-5 space-y-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center shadow-md">
                                                <Wrench className="w-5 h-5 text-white" />
                                            </div>
                                            <div>
                                                <p className="font-black text-base">{d.nome}</p>
                                                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Desmontador</p>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="bg-white rounded-xl p-3 text-center border border-amber-100">
                                                <p className="text-2xl font-black text-blue-600">{d.carros}</p>
                                                <p className="text-[10px] font-bold text-muted-foreground uppercase">Carros</p>
                                                <p className="text-[10px] text-emerald-600 font-bold">+ R$ {(d.carros * d.comissao_por_carro).toFixed(2)}</p>
                                            </div>
                                            <div className="bg-white rounded-xl p-3 text-center border border-amber-100">
                                                <p className="text-2xl font-black text-violet-600">{d.pecas}</p>
                                                <p className="text-[10px] font-bold text-muted-foreground uppercase">Peças</p>
                                                <p className="text-[10px] text-emerald-600 font-bold">+ R$ {(d.pecas * d.comissao_por_peca).toFixed(2)}</p>
                                            </div>
                                        </div>
                                        <div className="bg-emerald-500 rounded-xl p-3 text-white text-center">
                                            <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Total Comissão</p>
                                            <p className="text-2xl font-black">R$ {totalComissao.toFixed(2)}</p>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            )}

            {view !== 'comissoes' && view !== 'relatorio' && <>
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: "Total de Sucatas", value: stats.total, icon: Car, color: "text-blue-500" },
                    { label: "Em Desmontagem", value: stats.ativas, icon: Wrench, color: "text-amber-500" },
                    { label: "Custo Total", value: fmt(stats.custo), icon: DollarSign, color: "text-rose-500" },
                    { label: "Peças Registradas", value: stats.pecas, icon: Layers, color: "text-emerald-500" },
                ].map(s => (
                    <Card key={s.label} className="hover:shadow-sm transition-shadow">
                        <CardContent className="pt-4 flex items-center gap-3">
                            <div className={`p-2 rounded-lg bg-muted ${s.color}`}>
                                <s.icon className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">{s.label}</p>
                                <p className="font-bold text-lg leading-tight">{s.value}</p>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[220px]">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Buscar por código, marca, modelo, placa..." className="pl-9"
                        value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <Select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                    <option value="todos">Todos os Status</option>
                    {["Aguardando", "Em Desmontagem", "Concluída", "Alienada"].map(s =>
                        <option key={s} value={s}>{s}</option>
                    )}
                </Select>
            </div>

            {/* Grid */}
            {loading ? (
                <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
                    <RefreshCw className="w-5 h-5 animate-spin" /> Carregando sucatas...
                </div>
            ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-4">
                    <Car className="w-16 h-16 opacity-15" />
                    <p className="text-sm">Nenhuma sucata encontrada.</p>
                    <Button variant="outline" onClick={openNewSucata} className="gap-2">
                        <Plus className="w-4 h-4" /> Cadastrar primeira sucata
                    </Button>
                </div>
            ) : (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {paginatedSucatas.map(s => {
                            const pct = s.pecas_count ? Math.round(((s.pecas_count - (s.pecas_disponiveis || 0)) / s.pecas_count) * 100) : 0
                            return (
                                <Card key={s.id} className="flex flex-col hover:shadow-md transition-shadow border border-border overflow-hidden">
                                    {/* Foto de capa */}
                                    {s.fotos && s.fotos.length > 0 ? (
                                        <div className="relative h-36 bg-muted overflow-hidden cursor-pointer group" onClick={() => openDetail(s)}>
                                            <SucataFotoImg
                                                src={s.fotos[0]}
                                                alt={`${s.marca} ${s.modelo}`}
                                                imgClassName="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                                            {s.fotos.length > 1 && (
                                                <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/50 text-white text-[9px] font-bold px-2 py-0.5 rounded-full backdrop-blur-sm">
                                                    <Camera className="w-2.5 h-2.5" /> {s.fotos.length}
                                                </div>
                                            )}
                                            <div className="absolute bottom-2 left-2">
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusColors[s.status]}`}>{s.status}</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="h-20 bg-muted/40 flex items-center justify-center cursor-pointer border-b border-border/30" onClick={() => openDetail(s)}>
                                            <Car className="w-10 h-10 text-muted-foreground/20" />
                                        </div>
                                    )}
                                    <CardHeader className="pb-2 pt-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-black text-base">{s.codigo}</span>
                                                    {s.mostrar_na_loja && (
                                                        <span className="bg-[#B6D433]/20 text-emerald-600 px-1.5 py-0.5 rounded flex items-center gap-1 text-[10px] font-bold border border-[#B6D433]/30" title="Ativa na Loja Online">
                                                            <Store className="w-3 h-3" />
                                                            Loja
                                                        </span>
                                                    )}
                                                    {(!s.fotos || s.fotos.length === 0) && (
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusColors[s.status]}`}>
                                                            {s.status}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-sm font-semibold mt-0.5">
                                                    {s.marca} {s.modelo} {s.ano_modelo || ""}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {s.placa || "S/ Placa"} · {s.cor || "—"} · {s.combustivel || "—"}
                                                </p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="text-xs text-muted-foreground">Custo total</p>
                                                <p className="font-bold text-sm text-rose-600">{fmt(s.custo_total)}</p>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="flex-1 space-y-3 pb-4">
                                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                            <span>Comprado: {fmtDate(s.data_compra)}</span>
                                            {s.condicao && <span className="text-foreground font-medium">{s.condicao}</span>}
                                        </div>

                                        {/* Desmontagem progress */}
                                        <div>
                                            <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                                                <span>Progresso</span>
                                                <span className="font-bold">{s.pecas_count} peças</span>
                                            </div>
                                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                                <div className="h-1.5 rounded-full bg-gradient-to-r from-amber-400 to-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap gap-2 pt-1">
                                            <Button size="sm" variant="outline" className="flex-1 min-w-[100px] gap-2 text-xs" onClick={(e) => { e.stopPropagation(); openEditSucata(s) }}>
                                                <Pencil className="w-3 h-3" /> Editar
                                            </Button>
                                            <Button variant="outline" size="sm" className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50" onClick={(e) => { e.stopPropagation(); setSelectedSucata(s); setIsChecklistOpen(true) }}>
                                                <ListChecks className="w-4 h-4" /> Checklist
                                            </Button>
                                            <Button size="sm" className="flex-1 min-w-[100px] gap-2 text-xs" onClick={(e) => { e.stopPropagation(); openDetail(s) }}>
                                                Visualizar <ArrowRight className="w-3 h-3" />
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="gap-2 text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
                                                title="Excluir sucata"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleDeleteSucata(s.id)
                                                }}
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            )
                        })}
                    </div>

                    {/* Pagination Controls */}
                    {filtered.length > 0 && totalPages > 1 && (
                        <div className="flex items-center justify-between border-t border-border pt-4">
                            <div className="text-sm text-muted-foreground">
                                Mostrando {((currentPage - 1) * ITEMS_PER_PAGE) + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} de {filtered.length} sucatas
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                    disabled={currentPage === 1}
                                    className="h-8 w-8 p-0"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </Button>
                                <div className="flex items-center gap-1">
                                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                        let pageNum
                                        if (totalPages <= 5) {
                                            pageNum = i + 1
                                        } else if (currentPage <= 3) {
                                            pageNum = i + 1
                                        } else if (currentPage >= totalPages - 2) {
                                            pageNum = totalPages - 4 + i
                                        } else {
                                            pageNum = currentPage - 2 + i
                                        }
                                        return (
                                            <Button
                                                key={pageNum}
                                                variant={currentPage === pageNum ? "default" : "outline"}
                                                size="sm"
                                                onClick={() => setCurrentPage(pageNum)}
                                                className="h-8 w-8 p-0 text-xs"
                                            >
                                                {pageNum}
                                            </Button>
                                        )
                                    })}
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                    disabled={currentPage === totalPages}
                                    className="h-8 w-8 p-0"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Modal: Add/Edit Sucata */}
            <Modal
                isOpen={isSucataModalOpen}
                onClose={() => setIsSucataModalOpen(false)}
                title={editingSucata ? `Editar ${editingSucata.codigo}` : "Cadastrar Nova Sucata"}
                className="max-w-4xl"
            >
                <form onSubmit={handleSaveSucata} className="space-y-5">
                    {/* Section: Veiculo */}
                    <div>
                        <p className="text-xs font-bold uppercase text-muted-foreground mb-3 flex items-center gap-1">
                            <Car className="w-3 h-3" /> Dados do Veículo
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label>Marca *</Label>
                                <Input value={sucataForm.marca} onChange={e => setSucataForm({ ...sucataForm, marca: e.target.value })} placeholder="Fiat, VW, Ford..." required />
                            </div>
                            <div className="space-y-1">
                                <Label>Modelo *</Label>
                                <Input value={sucataForm.modelo} onChange={e => setSucataForm({ ...sucataForm, modelo: e.target.value })} placeholder="Palio, Gol, Ka..." required />
                            </div>
                            <div className="space-y-1">
                                <Label>Ano Fabricação</Label>
                                <Input type="number" min="1950" max="2099" value={sucataForm.ano_fabricacao} onChange={e => setSucataForm({ ...sucataForm, ano_fabricacao: e.target.value })} />
                            </div>
                            <div className="space-y-1">
                                <Label>Ano Modelo</Label>
                                <Input type="number" min="1950" max="2099" value={sucataForm.ano_modelo} onChange={e => setSucataForm({ ...sucataForm, ano_modelo: e.target.value })} />
                            </div>
                            <div className="space-y-1">
                                <Label className="flex justify-between items-center">
                                    Placa
                                    <button
                                        type="button"
                                        onClick={decodePlate}
                                        disabled={isDecodingPlate || !String(sucataForm.placa || "").trim()}
                                        className="text-[9px] font-black uppercase tracking-tighter text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1 hover:bg-emerald-100 disabled:opacity-50 transition-all font-sans"
                                    >
                                        {isDecodingPlate ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : <Search className="w-2.5 h-2.5" />}
                                        Consultar Placa
                                    </button>
                                </Label>
                                <Input
                                    value={sucataForm.placa}
                                    onChange={e => setSucataForm({ ...sucataForm, placa: e.target.value })}
                                    placeholder="ABC1D23 ou ABC-1234"
                                />
                            </div>
                            <div className="space-y-1 col-span-2">
                                <Label className="flex justify-between items-center">
                                    Chassi (VIN)
                                    <button
                                        type="button"
                                        onClick={decodeVIN}
                                        disabled={isDecodingVin || !String(sucataForm.chassi || "").trim()}
                                        className="text-[9px] font-black uppercase tracking-tighter text-purple-600 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 flex items-center gap-1 hover:bg-purple-100 disabled:opacity-50 transition-all"
                                    >
                                        {isDecodingVin ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : <Brain className="w-2.5 h-2.5" />}
                                        Buscar pelo VIN
                                    </button>
                                </Label>
                                <Input value={sucataForm.chassi} onChange={e => setSucataForm({ ...sucataForm, chassi: e.target.value })} placeholder="17 caracteres (RENAVAM não consulta)" />
                                <p className="text-[10px] text-muted-foreground">
                                    Consulta automática gratuita só pelo VIN (NHTSA). Placa, motor e RENAVAM: preencha manualmente — não integramos APIs pagas de terceiros.
                                </p>
                            </div>
                            <div className="space-y-1">
                                <Label>Cor</Label>
                                <Input value={sucataForm.cor} onChange={e => setSucataForm({ ...sucataForm, cor: e.target.value })} placeholder="Branco, Prata..." />
                            </div>
                            <div className="space-y-1">
                                <Label>Combustível</Label>
                                <Select value={sucataForm.combustivel} onChange={e => setSucataForm({ ...sucataForm, combustivel: e.target.value })}>
                                    {["Flex", "Gasolina", "Diesel", "Elétrico", "GNV", "Híbrido"].map(c => <option key={c} value={c}>{c}</option>)}
                                </Select>
                            </div>
                            <div className="space-y-1">
                                <Label>KM na Entrada</Label>
                                <Input type="number" min="0" value={sucataForm.km_entrada} onChange={e => setSucataForm({ ...sucataForm, km_entrada: e.target.value })} />
                            </div>
                            <div className="space-y-1">
                                <Label>Número do Motor</Label>
                                <Input
                                    value={sucataForm.numero_motor}
                                    onChange={e => setSucataForm({ ...sucataForm, numero_motor: e.target.value })}
                                    placeholder="Ex: ABC-123456"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label>Cilindrada</Label>
                                <Input
                                    value={sucataForm.cilindrada}
                                    onChange={e => setSucataForm({ ...sucataForm, cilindrada: e.target.value })}
                                    placeholder="Ex: 1.6 / 1600"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label>Potência (CV)</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    value={sucataForm.cv ?? ""}
                                    onChange={e => {
                                        const raw = e.target.value
                                        const nextCv = raw === "" ? null : (parseInt(raw, 10) || 0)
                                        setSucataForm({ ...sucataForm, cv: nextCv, potencia_cv: raw })
                                    }}
                                    placeholder="Ex: 104"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label>Condição</Label>
                                <Select value={sucataForm.condicao} onChange={e => setSucataForm({ ...sucataForm, condicao: e.target.value })}>
                                    {["Batida", "Queimada", "Afogada", "Desmontada", "Outros"].map(c => <option key={c} value={c}>{c}</option>)}
                                </Select>
                            </div>
                        </div>
                    </div>

                    {/* Section: Compra */}
                    <div className="border-t border-border pt-4">
                        <p className="text-xs font-bold uppercase text-muted-foreground mb-3 flex items-center gap-1">
                            <DollarSign className="w-3 h-3" /> Dados da Compra
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label>Data da Compra</Label>
                                <Input type="date" value={sucataForm.data_compra} onChange={e => setSucataForm({ ...sucataForm, data_compra: e.target.value })} />
                            </div>
                            <div className="space-y-1">
                                <Label>Status</Label>
                                <Select value={sucataForm.status} onChange={e => setSucataForm({ ...sucataForm, status: e.target.value })}>
                                    {["Aguardando", "Em Desmontagem", "Concluída", "Alienada"].map(s => <option key={s} value={s}>{s}</option>)}
                                </Select>
                            </div>
                            <div className="space-y-1">
                                <Label>Valor de Compra (R$)</Label>
                                <Input type="number" step="0.01" min="0" value={sucataForm.valor_compra} onChange={e => setSucataForm({ ...sucataForm, valor_compra: e.target.value })} />
                            </div>
                            <div className="space-y-1">
                                <Label>Frete (R$)</Label>
                                <Input type="number" step="0.01" min="0" value={sucataForm.valor_frete} onChange={e => setSucataForm({ ...sucataForm, valor_frete: e.target.value })} />
                            </div>
                            <div className="space-y-1">
                                <Label>Outros Custos (R$)</Label>
                                <Input type="number" step="0.01" min="0" value={sucataForm.outros_custos} onChange={e => setSucataForm({ ...sucataForm, outros_custos: e.target.value })} />
                            </div>
                            <div className="space-y-1">
                                <Label>Custo Total Estimado</Label>
                                <div className="h-9 flex items-center px-3 rounded-md bg-muted border border-input text-sm font-bold text-primary">
                                    {fmt(
                                        (parseFloat(sucataForm.valor_compra) || 0) +
                                        (parseFloat(sucataForm.valor_frete) || 0) +
                                        (parseFloat(sucataForm.outros_custos) || 0)
                                    )}
                                </div>
                            </div>
                            <div className="space-y-1 col-span-2">
                                <Label>Local de Armazenagem</Label>
                                <Input value={sucataForm.local_armazenagem} onChange={e => setSucataForm({ ...sucataForm, local_armazenagem: e.target.value })} placeholder="Pátio A, Box 3..." />
                            </div>
                            <div className="space-y-1 col-span-2 rounded-lg border border-dashed border-primary/25 bg-primary/5 p-3">
                                <Label className="text-primary">Complemento do nome do produto (opcional)</Label>
                                <p className="text-[10px] text-muted-foreground leading-snug mb-1.5">
                                    Ao gerar peças por categoria, o nome do produto será <strong className="text-foreground">categoria + este texto</strong> (ex.: alternador + &quot;fiesta 2003/2007 1.0 flex&quot;).
                                    Se deixar em branco, continua automático: categoria + marca + modelo + ano da sucata.
                                </p>
                                <Input
                                    value={sucataForm.nome_complemento_produto ?? ""}
                                    onChange={(e) => setSucataForm({ ...sucataForm, nome_complemento_produto: e.target.value })}
                                    placeholder='Ex: fiesta 2003/2007 1.0 flex'
                                    className="font-medium"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Section: Informações Adicionais / Importação */}
                    <div className="border-t border-border pt-4">
                        <p className="text-xs font-bold uppercase text-muted-foreground mb-3 flex items-center gap-1">
                            <PlusCircle className="w-3 h-3 text-rose-500" /> Informações Complementares
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label>Fornecedor</Label>
                                <Input value={sucataForm.fornecedor} onChange={e => setSucataForm({ ...sucataForm, fornecedor: e.target.value })} placeholder="Nome do fornecedor..." />
                            </div>
                            <div className="space-y-1">
                                <Label>Certidão de Baixa</Label>
                                <Input value={sucataForm.certidao_baixa} onChange={e => setSucataForm({ ...sucataForm, certidao_baixa: e.target.value })} placeholder="Nº da certidão..." />
                            </div>
                            <div className="space-y-1">
                                <Label>Modelo de Grupo de Peça</Label>
                                <Input value={sucataForm.modelo_grupo_peca} onChange={e => setSucataForm({ ...sucataForm, modelo_grupo_peca: e.target.value })} placeholder="Ex: GOL G5..." />
                            </div>
                            <div className="space-y-1">
                                <Label>Data de Desmontagem</Label>
                                <Input type="date" value={sucataForm.data_desmontagem} onChange={e => setSucataForm({ ...sucataForm, data_desmontagem: e.target.value })} />
                            </div>
                            <div className="space-y-1">
                                <Label>Valor Vendido (Importação)</Label>
                                <Input type="number" step="0.01" value={sucataForm.valor_vendido} onChange={e => setSucataForm({ ...sucataForm, valor_vendido: e.target.value })} />
                            </div>
                            <div className="space-y-1">
                                <Label>Lucro Bruto (Importação)</Label>
                                <Input type="number" step="0.01" value={sucataForm.lucro_bruto} onChange={e => setSucataForm({ ...sucataForm, lucro_bruto: e.target.value })} />
                            </div>
                            <div className="space-y-1">
                                <Label>Margem Bruta (Importação %)</Label>
                                <Input type="number" step="0.1" value={sucataForm.margem_bruta} onChange={e => setSucataForm({ ...sucataForm, margem_bruta: e.target.value })} />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4 border-t border-border pt-4">
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="mostrar_na_loja"
                                checked={!!sucataForm.mostrar_na_loja}
                                onChange={(e) => setSucataForm({ ...sucataForm, mostrar_na_loja: e.target.checked })}
                                className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                            />
                            <Label htmlFor="mostrar_na_loja" className="font-bold text-sm cursor-pointer text-emerald-600 flex items-center gap-1">
                                <Package className="w-4 h-4" /> Mostrar na Loja Online
                            </Label>
                        </div>
                        <div className="space-y-1">
                            <Label>Observações</Label>
                            <textarea
                                className="w-full h-20 rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                                placeholder="Informações adicionais sobre o veículo..."
                                value={sucataForm.observacoes}
                                onChange={e => setSucataForm({ ...sucataForm, observacoes: e.target.value })}
                            />
                        </div>
                    </div>

                    {/* Fotos da sucata */}
                    <div className="border-t border-border pt-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <Label className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-muted-foreground">
                                <Camera className="w-3.5 h-3.5" /> Fotos do Veículo ({sucataFotoPreviews.length})
                            </Label>
                            <label className="cursor-pointer text-xs font-bold text-primary hover:underline flex items-center gap-1">
                                <Plus className="w-3 h-3" /> Adicionar Fotos
                                <input
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    className="hidden"
                                    onChange={e => {
                                        const files = Array.from(e.target.files || [])
                                        setSucataFotoFiles(prev => [...prev, ...files])
                                        const newUrls = files.map(file => URL.createObjectURL(file))
                                        setSucataFotoPreviews(prev => [...prev, ...newUrls])
                                    }}
                                />
                            </label>
                        </div>
                        {sucataFotoPreviews.length > 0 ? (
                            <div className="grid grid-cols-4 gap-2">
                                {sucataFotoPreviews.map((src, i) => (
                                    <div key={i} className={`relative aspect-square rounded-lg overflow-hidden border ${sucataForm.fotos_loja?.includes(src) ? 'border-emerald-500 ring-2 ring-emerald-500/50' : 'bg-muted'} group`}>
                                        <SucataFotoImg src={src} imgClassName="w-full h-full object-cover" />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSucataFotoPreviews(prev => prev.filter((_, j) => j !== i))
                                                if (src.startsWith('data:') || src.startsWith('blob:')) {
                                                    setSucataFotoFiles(prev => {
                                                        const dataUrls = sucataFotoPreviews.filter(p => p.startsWith('data:') || p.startsWith('blob:'))
                                                        const idx = dataUrls.indexOf(src)
                                                        return prev.filter((_, j) => j !== idx)
                                                    })
                                                }
                                                // Remova também da seleção da loja
                                                setSucataForm(prev => ({
                                                    ...prev,
                                                    fotos_loja: (prev.fotos_loja || []).filter(u => u !== src)
                                                }))
                                            }}
                                            className="absolute top-1 right-1 p-1 bg-destructive text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                        <div className="absolute top-1 left-1 z-10 flex gap-1">
                                            {i > 0 && (
                                                <button
                                                    type="button"
                                                    title="Usar como primeira foto (capa)"
                                                    onClick={() => moverFotoParaCapaNoModal(i)}
                                                    className="p-1 bg-background/90 border border-border text-amber-600 rounded-full opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shadow-sm"
                                                >
                                                    <Star className="w-3 h-3" />
                                                </button>
                                            )}
                                            {sucataForm.mostrar_na_loja && (
                                                <button
                                                    type="button"
                                                    title={sucataForm.fotos_loja?.includes(src) ? "Remover da Loja Online" : "Adicionar na Loja Online"}
                                                    onClick={() => {
                                                        const inStore = sucataForm.fotos_loja?.includes(src)
                                                        setSucataForm(prev => ({
                                                            ...prev,
                                                            fotos_loja: inStore 
                                                                ? (prev.fotos_loja || []).filter(u => u !== src)
                                                                : [...(prev.fotos_loja || []), src]
                                                        }))
                                                    }}
                                                    className={`p-1 border rounded-full transition-all shadow-sm ${sucataForm.fotos_loja?.includes(src) ? 'bg-emerald-500 text-white border-emerald-600 opacity-100' : 'bg-background/90 border-border text-slate-400 sm:opacity-0 sm:group-hover:opacity-100'}`}
                                                >
                                                    <Package className="w-3 h-3" />
                                                </button>
                                            )}
                                        </div>
                                        <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-[8px] text-white text-center py-0.5 font-bold flex justify-center items-center gap-1">
                                            {i === 0 ? "Principal" : `Foto ${i + 1}`}
                                            {sucataForm.fotos_loja?.includes(src) && <Package className="w-2.5 h-2.5 text-emerald-400" />}
                                        </div>
                                    </div>
                                ))}
                                <label className="aspect-square rounded-lg border-2 border-dashed flex flex-col items-center justify-center cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-all text-muted-foreground/40">
                                    <Plus className="w-5 h-5" />
                                    <span className="text-[8px] font-black uppercase mt-0.5">Foto</span>
                                    <input type="file" accept="image/*" multiple className="hidden" onChange={e => {
                                        const files = Array.from(e.target.files || [])
                                        setSucataFotoFiles(prev => [...prev, ...files])
                                        const newUrls = files.map(file => URL.createObjectURL(file))
                                        setSucataFotoPreviews(prev => [...prev, ...newUrls])
                                    }} />
                                </label>
                            </div>
                        ) : (
                            <label className="cursor-pointer block">
                                <div className="border-2 border-dashed rounded-xl p-6 text-center hover:border-primary/40 hover:bg-primary/5 transition-all">
                                    <Camera className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
                                    <p className="text-xs text-muted-foreground font-bold">Clique para adicionar fotos do veículo</p>
                                </div>
                                <input type="file" accept="image/*" multiple className="hidden" onChange={e => {
                                    const files = Array.from(e.target.files || [])
                                    setSucataFotoFiles(prev => [...prev, ...files])
                                    const newUrls = files.map(file => URL.createObjectURL(file))
                                    setSucataFotoPreviews(prev => [...prev, ...newUrls])
                                }} />
                            </label>
                        )}
                    </div>

                    {/* Vídeos da sucata */}
                    <div className="border-t border-border pt-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <Label className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-muted-foreground">
                                <Video className="w-3.5 h-3.5" /> Vídeos do Veículo ({sucataVideoPreviews.length})
                            </Label>
                            <div className="flex items-center gap-4">
                                <label className="cursor-pointer text-xs font-bold text-primary hover:underline flex items-center gap-1">
                                    <Plus className="w-3 h-3" /> Enviar Vídeo
                                    <input
                                        type="file"
                                        accept="video/*"
                                        multiple
                                        className="hidden"
                                        onChange={e => {
                                            const files = Array.from(e.target.files || [])
                                            setSucataVideoFiles(prev => [...prev, ...files])
                                            const newUrls = files.map(file => URL.createObjectURL(file))
                                            setSucataVideoPreviews(prev => [...prev, ...newUrls])
                                        }}
                                    />
                                </label>
                                <button type="button" onClick={() => setIsVideoModalOpen(true)} className="cursor-pointer text-xs font-bold text-primary hover:underline flex items-center gap-1">
                                    <Plus className="w-3 h-3" /> Gravar na Câmera
                                </button>
                            </div>
                        </div>
                        {sucataVideoPreviews.length > 0 && (
                            <div className="grid grid-cols-4 gap-2">
                                {sucataVideoPreviews.map((src, i) => (
                                    <div key={i} className="relative aspect-square rounded-lg overflow-hidden border bg-muted group">
                                        <video src={src} className="w-full h-full object-cover" />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSucataVideoPreviews(prev => prev.filter((_, j) => j !== i))
                                                if (src.startsWith('blob:') || src.startsWith('data:')) {
                                                    setSucataVideoFiles(prev => {
                                                        const dataUrls = sucataVideoPreviews.filter(p => p.startsWith('blob:') || p.startsWith('data:'))
                                                        const idx = dataUrls.indexOf(src)
                                                        return prev.filter((_, j) => j !== idx)
                                                    })
                                                }
                                            }}
                                            className="absolute top-1 right-1 p-1 bg-destructive text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex gap-3">
                        <Button type="button" variant="outline" className="flex-1" onClick={() => setIsSucataModalOpen(false)}>Cancelar</Button>
                        <Button type="submit" className="flex-1" disabled={submitting}>
                            {submitting ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                            {editingSucata ? "Salvar Alterações" : "Cadastrar Sucata"}
                        </Button>
                    </div>
                </form>
            </Modal>
            </>}
        </div>
    )
}
