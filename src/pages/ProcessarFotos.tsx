/**
 * Gerenciador de fila de remoção de fundo (fila no front-end; 10s entre cada chamada à API).
 * Rota: /admin/processar-fotos — também acessível pelo menu: "Fundo de fotos (IA)" ou Estoque → "Remover fundo (IA)".
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { estoqueApi, api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Play,
  Pause,
  RefreshCw,
  ImageIcon,
  CheckCircle2,
  XCircle,
  Loader2,
  CalendarRange,
  ListChecks,
  Layers,
  Info,
  Search,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { uniqueImageUrlsForQueue } from "@/lib/imagemUrls"
import { getApiBaseUrl } from "@/lib/apiBase"
import { getAuthToken } from "@/lib/auth"
import { ImageEditorModal } from "@/components/ImageEditor/ImageEditorModal"
import { Pencil } from "lucide-react"

const DELAY_MS = 2000
const REFRESH_DELAY_MS = 500
/** Polling do job assíncrono (POST 202) — 200 × 3s = 10 min */
const FUNDO_POLL_MS = 3000
const FUNDO_MAX_POLLS = 200

async function waitForFundoJob(
  jobId: string,
  _token: string,
  shouldAbort: () => boolean
): Promise<Record<string, unknown>> {
  for (let i = 0; i < FUNDO_MAX_POLLS; i++) {
    if (shouldAbort()) {
      throw new Error("Operação pausada ou fila interrompida durante o processamento.")
    }
    const j = await api.get(`/api/admin/processar-fundo/status/${encodeURIComponent(jobId)}`)
    
    if (j.status === "done" && j.resultado) {
      return j.resultado
    }
    if (j.status === "error") {
      throw new Error(j.erro || "Processamento falhou no servidor.")
    }
    await sleep(FUNDO_POLL_MS)
  }
  throw new Error("Tempo esgotado aguardando o processamento do fundo.")
}

export type QueueJob = {
  produtoId: string
  nome: string
  sku: string | null
  sourceUrl: string
  /** Índice na lista canônica de pendentes (mesmo critério do backend) */
  sourceIndex: number
  isLastImage: boolean
}

export type QueueFilter =
  | { mode: "all" }
  | { mode: "selected"; productIds: string[] }
  | { mode: "period"; dateFrom: string; dateTo: string }

function rowsToJobs(
  rows: {
    id: string
    nome: string
    sku: string | null
    imagem_url?: string | null
    imagem_urls?: unknown
  }[]
): QueueJob[] {
  const jobs: QueueJob[] = []
  for (const p of rows) {
    const urls = uniqueImageUrlsForQueue(p)
    if (urls.length === 0) continue
    urls.forEach((url, idx) => {
      jobs.push({
        produtoId: p.id,
        nome: p.nome,
        sku: p.sku,
        sourceUrl: url,
        sourceIndex: idx,
        isLastImage: idx === urls.length - 1,
      })
    })
  }
  return jobs
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function fetchPainelProdutos(params: {
  produto_ids?: string
  fundo_removido?: string
  created_after?: string
  created_before?: string
  q?: string
  limit?: number
  offset?: number
  painel?: boolean
}): Promise<
  {
    id: string
    nome: string
    sku: string | null
    imagem_url?: string | null
    imagem_urls?: unknown
    fundo_removido?: boolean | null
    created_at?: string | null
  }[]
> {
  const req: Parameters<typeof estoqueApi.listarProdutos>[0] = {
    painel: params.painel ?? true,
    ordem: "nome_asc",
    limit: params.limit ?? 8000,
    offset: params.offset ?? 0,
  }
  if (params.produto_ids) req.produto_ids = params.produto_ids
  if (params.fundo_removido) req.fundo_removido = params.fundo_removido
  if (params.created_after) req.created_after = params.created_after
  if (params.created_before) req.created_before = params.created_before
  if (params.q) req.q = params.q
  const res = await estoqueApi.listarProdutos(req)
  const items = res && typeof res === "object" && "items" in res ? (res as { items: unknown }).items : res
  return Array.isArray(items) ? (items as any[]) : []
}

async function buildQueueFromDb(filter: QueueFilter, loadedCandidates: CandidateRow[] = []): Promise<QueueJob[]> {
  if (filter.mode === "selected" && loadedCandidates.length > 0) {
    const candidateMap = new Map(loadedCandidates.map(c => [c.id, c]))
    const allLoaded = filter.productIds.every(id => candidateMap.has(id))
    
    if (allLoaded && filter.productIds.length > 0) {
      const selectedRows = filter.productIds
        .map(id => candidateMap.get(id)!)
        .filter(Boolean)
      return rowsToJobs(selectedRows)
    }
  }

  const qs = new URLSearchParams()
  qs.set("mode", filter.mode)

  if (filter.mode === "selected") {
    if (filter.productIds.length === 0) return []
    qs.set("product_ids", filter.productIds.join(","))
  } else if (filter.mode === "period") {
    const [y1, m1, d1] = filter.dateFrom.split("-").map(Number)
    const start = new Date(y1, m1 - 1, d1, 0, 0, 0, 0)

    const [y2, m2, d2] = filter.dateTo.split("-").map(Number)
    const end = new Date(y2, m2 - 1, d2, 23, 59, 59, 999)

    qs.set("created_after", start.toISOString())
    qs.set("created_before", end.toISOString())
  }

  const res = await api.get(`/api/admin/processar-fundo/fila-candidatos?${qs.toString()}`)
  const data = res && Array.isArray(res.items) ? res.items : []
  return rowsToJobs(data)
}


type LogEntry = {
  id: string
  at: string
  kind: "success" | "error" | "info"
  message: string
  detail?: string
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

type CandidateRow = {
  id: string
  nome: string
  sku: string | null
  imagem_url: string | null
  imagem_urls: string[] | null
  fundo_removido?: boolean | null
  created_at: string | null
}

export function ProcessarFotos() {
  const [searchParams, setSearchParams] = useSearchParams()

  const [filterMode, setFilterMode] = useState<"all" | "selected" | "period">(() => {
    return searchParams.has("ids") ? "selected" : "all"
  })
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return d.toISOString().slice(0, 10)
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10))

  const [selectedProductIds, setSelectedProductIds] = useState<string[]>(() => {
    const raw = searchParams.get("ids")
    if (!raw) return []
    return raw.split(",").map((s) => s.trim()).filter(Boolean)
  })
  const [candidates, setCandidates] = useState<CandidateRow[]>([])
  const [loadingCandidates, setLoadingCandidates] = useState(false)
  const [candidateSearch, setCandidateSearch] = useState("")

  const [pendingPhotos, setPendingPhotos] = useState(0)
  const [pendingProducts, setPendingProducts] = useState(0)
  const [loadingStats, setLoadingStats] = useState(true)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [totalAtStart, setTotalAtStart] = useState(0)
  const [recentResults, setRecentResults] = useState<{ produtoId: string; nome: string; url: string }[]>([])
  const [lastError, setLastError] = useState<string | null>(null)

  const [resumoFila, setResumoFila] = useState<{
    pending: number
    processing: number
    done: number
    error: number
    total: number
  }>({ pending: 0, processing: 0, done: 0, error: 0, total: 0 })

  const [enqueuing, setEnqueuing] = useState(false)
  const running = enqueuing || resumoFila.pending > 0 || resumoFila.processing > 0

  // Status do serviço de IA (api-ia-fundo). 'unknown' enquanto carrega.
  const [iaServiceStatus, setIaServiceStatus] = useState<"online" | "offline" | "checking" | "unknown">("unknown")
  const [iaServiceLatency, setIaServiceLatency] = useState<number | null>(null)
  const [iaServiceCheckedAt, setIaServiceCheckedAt] = useState<string | null>(null)

  const [editorData, setEditorData] = useState<{ isOpen: boolean; url: string; produtoId: string } | null>(null)
  
  const candidatesRef = useRef<CandidateRow[]>([])
  const selectedProductIdsRef = useRef<string[]>(selectedProductIds)
  const filterModeRef = useRef<string>(filterMode)

  useEffect(() => {
    candidatesRef.current = candidates
  }, [candidates])

  useEffect(() => {
    selectedProductIdsRef.current = selectedProductIds
  }, [selectedProductIds])

  useEffect(() => {
    filterModeRef.current = filterMode
  }, [filterMode])

  const selectedProductIdsSet = useMemo(() => new Set(selectedProductIds), [selectedProductIds])

  const fetchResumo = useCallback(async () => {

    try {
      const res = await api.get("/api/admin/processar-fundo/fila-resumo")
      if (res && res.resumo) {
        setResumoFila(res.resumo)
        if (res.recent) {
          const newLogs = res.recent.map((rj: any) => {
            let kind: LogEntry["kind"] = "info"
            if (rj.status === "done") kind = "success"
            else if (rj.status === "error") kind = "error"
            
            const urlTail = rj.source_url.length > 56 ? `…${rj.source_url.slice(-52)}` : rj.source_url
            const timeStr = rj.updated_at ? new Date(rj.updated_at).toLocaleTimeString("pt-BR", { hour12: false }) : ""
            const message = rj.status === "done"
              ? `OK — ${rj.nome || rj.produto_id}`
              : rj.status === "error"
              ? `Erro — ${rj.nome || rj.produto_id}`
              : `Processando — ${rj.nome || rj.produto_id}`
            const detail = rj.status === "error"
              ? rj.erro
              : `${rj.sku ? `SKU ${rj.sku} · ` : ""}${urlTail}`
            return {
              id: rj.id,
              at: timeStr,
              kind,
              message,
              detail
            }
          })
          setLogs(newLogs)
        }
      }
    } catch (e) {
      console.error("Erro ao buscar resumo da fila:", e)
    }
  }, [])

  const initialFilter: QueueFilter = useMemo(() => {
    const raw = searchParams.get("ids")
    if (raw) {
      return { mode: "selected", productIds: raw.split(",").map(s => s.trim()).filter(Boolean) }
    }
    return { mode: "all" }
  }, []) // searchParams inicial

  const filterRef = useRef<QueueFilter>(initialFilter)
  const lastRequestId = useRef(0)

  // Limpa o ?ids= da URL após carregar, para manter a URL limpa
  useEffect(() => {
    if (searchParams.has("ids")) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete("ids")
          return next
        },
        { replace: true }
      )
    }
  }, [searchParams, setSearchParams])

  const appendLog = useCallback((kind: LogEntry["kind"], message: string, detail?: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const at = new Date().toLocaleTimeString("pt-BR", { hour12: false })
    setLogs((prev) => [{ id, at, kind, message, detail }, ...prev].slice(0, 200))
  }, [])

  const refreshStats = useCallback(async () => {
    const rid = ++lastRequestId.current
    setLoadingStats(true)
    try {
      const q = await buildQueueFromDb(filterRef.current, candidatesRef.current)
      if (rid !== lastRequestId.current) return

      setPendingPhotos(q.length)
      setPendingProducts(new Set(q.map((j) => j.produtoId)).size)
    } catch (e: unknown) {
      if (rid !== lastRequestId.current) return
      const msg = e instanceof Error ? e.message : String(e)
      appendLog("error", `Erro ao carregar fila: ${msg}`)
    } finally {
      if (rid === lastRequestId.current) {
        setLoadingStats(false)
      }
    }
  }, [appendLog])

  /**
   * Verifica se a API Python de IA (api-ia-fundo) está respondendo.
   * Resposta esperada: { ok, ia_status: 'online', latency_ms } ou 503 com ia_status='offline'.
   */
  const checkIaService = useCallback(async () => {
    setIaServiceStatus("checking")
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/admin/processar-fundo/health`, {
        headers: { Authorization: `Bearer ${getAuthToken() || ""}` },
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data?.ia_status === "online") {
        setIaServiceStatus("online")
        setIaServiceLatency(typeof data.latency_ms === "number" ? data.latency_ms : null)
      } else {
        setIaServiceStatus("offline")
        setIaServiceLatency(null)
      }
    } catch {
      setIaServiceStatus("offline")
      setIaServiceLatency(null)
    } finally {
      setIaServiceCheckedAt(new Date().toLocaleTimeString("pt-BR", { hour12: false }))
    }
  }, [])

  // Checagem inicial + a cada 30s. Quando o lote está rodando aumenta a frequência para 15s.
  useEffect(() => {
    void checkIaService()
    const interval = running ? 15_000 : 30_000
    const t = setInterval(() => void checkIaService(), interval)
    return () => clearInterval(t)
  }, [checkIaService, running])

  // Polling para resumo da fila do servidor
  useEffect(() => {
    void fetchResumo()
    const t = setInterval(() => void fetchResumo(), 3000)
    return () => clearInterval(t)
  }, [fetchResumo])

  const selectedProductIdsStr = selectedProductIds.join(",")

  useEffect(() => {
    const nextFilter: QueueFilter =
      filterMode === "all"
        ? { mode: "all" }
        : filterMode === "selected"
        ? { mode: "selected", productIds: [...selectedProductIds] }
        : { mode: "period", dateFrom, dateTo }

    filterRef.current = nextFilter
    console.log("[ProcessarFotos] Filtro atualizado:", nextFilter)

    const delay = filterMode === "selected" ? 100 : 0
    const t = setTimeout(() => {
      void refreshStats()
    }, delay)
    return () => clearTimeout(t)
  }, [filterMode, selectedProductIdsStr, dateFrom, dateTo, refreshStats])

  const loadCandidates = useCallback(async (searchQuery = "") => {
    setLoadingCandidates(true)
    try {
      const isSelectedMode = filterModeRef.current === "selected"
      const hasSelectedIds = selectedProductIdsRef.current.length > 0

      const data = await fetchPainelProdutos({
        q: searchQuery || undefined,
        produto_ids: (!searchQuery && isSelectedMode && hasSelectedIds)
          ? selectedProductIdsRef.current.join(",")
          : undefined,
        limit: searchQuery ? 150 : (isSelectedMode && hasSelectedIds ? 1000 : 2000),
        offset: 0,
        painel: false
      })
      /** Inclui produtos com fundo_removido true se ainda houver URLs “originais” (não sem-fundo) */
      const withImg = (data || []).filter((p) => uniqueImageUrlsForQueue(p).length > 0) as CandidateRow[]
      setCandidates(withImg)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      appendLog("error", `Erro ao listar produtos: ${msg}`)
    } finally {
      setLoadingCandidates(false)
    }
  }, [appendLog])


  // Busca debandada no servidor quando o usuário digita na busca
  useEffect(() => {
    if (filterMode !== "selected") return

    // Carrega inicial se a lista estiver vazia e não tiver busca
    if (candidates.length === 0 && !loadingCandidates && !candidateSearch) {
      void loadCandidates()
      return
    }

    const delayDebounce = setTimeout(() => {
      void loadCandidates(candidateSearch)
    }, 400) // 400ms debounce

    return () => clearTimeout(delayDebounce)
  }, [candidateSearch, filterMode, loadCandidates])

  const filteredCandidates = useMemo(() => {
    // Como a busca já é feita no servidor via debounce, retornamos os candidatos diretamente
    return candidates
  }, [candidates])

  const toggleProduct = (id: string) => {
    setSelectedProductIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const selectAllVisible = () => {
    const ids = filteredCandidates.map((c) => c.id)
    setSelectedProductIds((prev) => {
      const set = new Set([...prev, ...ids])
      return Array.from(set)
    })
  }

  const clearSelection = () => setSelectedProductIds([])

  const validateFilterForStart = (): string | null => {
    if (filterMode === "selected" && selectedProductIds.length === 0) {
      return "Selecione ao menos um produto na lista abaixo (ou use outro modo de filtro)."
    }
    if (filterMode === "period") {
      if (!dateFrom || !dateTo) return "Informe data inicial e final do período."
      if (new Date(dateFrom) > new Date(dateTo)) return "Data inicial não pode ser maior que a final."
    }
    return null
  }

  const handleSaveEditedImage = async (produtoId: string, blob: Blob) => {
    try {
      appendLog("info", `Salvando edição da imagem para o produto ${produtoId}...`)
      
      const formData = new FormData()
      formData.append("file", blob, "foto-editada.png")
      formData.append("produto_id", produtoId)
      
      // Reutiliza o endpoint de upload do painel
      await api.post(`/api/admin/upload-produto`, formData)
      
      appendLog("success", "Edição salva com sucesso e atualizada no estoque!")
      void refreshStats()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      appendLog("error", `Erro ao salvar edição: ${msg}`)
    }
  }

  const handleRevertImage = async (produtoId: string, currentUrl: string) => {
    if (!window.confirm("Deseja realmente reverter esta imagem ao seu estado original antes da remoção de fundo?")) return
    try {
      appendLog("info", `Revertendo imagem do produto ${produtoId} ao estado original...`)
      await api.post("/api/admin/reverter-fundo", { produto_id: produtoId, current_url: currentUrl })
      
      appendLog("success", "Imagem original restaurada com sucesso!")
      setRecentResults(prev => prev.filter(r => r.url !== currentUrl))
      void refreshStats()
      void loadCandidates()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      appendLog("error", `Erro ao reverter imagem: ${msg}`)
    }
  }


  const handleStart = async () => {
    if (running) return
    const err = validateFilterForStart()
    if (err) {
      alert(err)
      return
    }

    if (iaServiceStatus === "offline") {
      const ok = window.confirm(
        "O serviço de IA aparece como Indisponível. As próximas chamadas devem falhar.\n\n" +
        "Deseja iniciar o lote mesmo assim?"
      )
      if (!ok) return
    }

    setEnqueuing(true)
    appendLog("info", "Preparando lote de fotos no navegador...")

    try {
      const nextFilter: QueueFilter =
        filterMode === "all"
          ? { mode: "all" }
          : filterMode === "selected"
          ? { mode: "selected", productIds: [...selectedProductIds] }
          : { mode: "period", dateFrom, dateTo }

      const q = await buildQueueFromDb(nextFilter)
      if (q.length === 0) {
        alert("Nenhuma imagem pendente para o filtro selecionado.")
        setEnqueuing(false)
        return
      }

      setTotalAtStart(q.length)
      appendLog("info", `Enviando ${q.length} fotos para a fila do servidor...`)
      
      const res = await api.post("/api/admin/processar-fundo/enfileirar-lote", {
        jobs: q.map(j => ({
          produto_id: j.produtoId,
          source_url: j.sourceUrl,
          source_index: j.sourceIndex,
          is_last_image: j.isLastImage
        }))
      })

      appendLog("success", `Lote enfileirado! ${res.count} fotos novas adicionadas ao processamento em lote no servidor.`)
      void fetchResumo()
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : String(e)
      appendLog("error", "Erro ao enfileirar lote no servidor", msg)
    } finally {
      setEnqueuing(false)
    }
  }

  const handleAbort = async () => {
    if (!window.confirm("Deseja realmente cancelar todos os processamentos pendentes e em andamento no servidor? Isso removerá as imagens da fila.")) return
    try {
      appendLog("info", "Cancelando fila no servidor...")
      const res = await api.post("/api/admin/processar-fundo/limpar-fila", {})
      appendLog("success", `Fila cancelada! ${res.count} fotos pendentes foram canceladas e removidas.`)
      setTotalAtStart(0)
      void fetchResumo()
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : String(e)
      appendLog("error", "Erro ao cancelar fila no servidor", msg)
    }
  }

  const activePending = resumoFila.pending + resumoFila.processing
  const completedInBatch = totalAtStart > 0 ? Math.max(0, totalAtStart - activePending) : 0
  const progressPct =
    totalAtStart > 0 ? Math.min(100, (completedInBatch / totalAtStart) * 100) : 0

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 flex gap-3">
        <Info className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
        <div className="text-sm space-y-1">
          <p className="font-semibold text-foreground">Como usar o Editor de Imagens</p>
          <p className="text-muted-foreground">
            Você pode <strong>remover o fundo via IA</strong> usando o botão verde abaixo, ou clicar no ícone de lápis em qualquer foto da lista para <strong>adicionar textos e setas</strong> manualmente.
          </p>
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ImageIcon className="h-7 w-7 text-primary" />
          Editor de Imagens
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Processamento no navegador: uma foto por vez, com pausa de {DELAY_MS / 1000}s entre cada chamada ao servidor.
        </p>
      </div>

      {/* Status do serviço de IA (api-ia-fundo) — visibilidade antes/durante o lote */}
      <div
        className={cn(
          "rounded-xl border p-3 flex items-center gap-3 text-sm",
          iaServiceStatus === "online" && "border-emerald-500/30 bg-emerald-500/5",
          iaServiceStatus === "offline" && "border-red-500/40 bg-red-500/5",
          (iaServiceStatus === "checking" || iaServiceStatus === "unknown") &&
            "border-muted-foreground/20 bg-muted/30"
        )}
      >
        <div
          className={cn(
            "h-2.5 w-2.5 rounded-full shrink-0",
            iaServiceStatus === "online" && "bg-emerald-500 animate-pulse",
            iaServiceStatus === "offline" && "bg-red-500",
            (iaServiceStatus === "checking" || iaServiceStatus === "unknown") && "bg-muted-foreground/50"
          )}
          aria-hidden
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold">
              Serviço de IA:{" "}
              {iaServiceStatus === "online" && (
                <span className="text-emerald-600">Online</span>
              )}
              {iaServiceStatus === "offline" && (
                <span className="text-red-600">Indisponível</span>
              )}
              {iaServiceStatus === "checking" && (
                <span className="text-muted-foreground">Verificando…</span>
              )}
              {iaServiceStatus === "unknown" && (
                <span className="text-muted-foreground">—</span>
              )}
            </span>
            {iaServiceStatus === "online" && iaServiceLatency != null && (
              <Badge variant="outline" className="text-[10px]">
                {iaServiceLatency} ms
              </Badge>
            )}
            {iaServiceCheckedAt && (
              <span className="text-[11px] text-muted-foreground">
                checado às {iaServiceCheckedAt}
              </span>
            )}
          </div>
          {iaServiceStatus === "offline" && (
            <p className="text-[12px] text-red-700 dark:text-red-400 mt-1">
              A API Python de remoção de fundo não está respondendo. O lote vai falhar até o serviço voltar.
              Verifique o container <code className="px-1 bg-red-500/10 rounded">api-ia-fundo</code> ou
              as variáveis <code className="px-1 bg-red-500/10 rounded">IA_FUNDO_BASE_URL</code> /{" "}
              <code className="px-1 bg-red-500/10 rounded">IA_FUNDO_REMOVER_URL</code>.
            </p>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void checkIaService()}
          disabled={iaServiceStatus === "checking"}
          className="shrink-0"
        >
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1", iaServiceStatus === "checking" && "animate-spin")} />
          Verificar
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Layers className="h-5 w-5" />
            Escopo da fila
          </CardTitle>
          <CardDescription>
            Escolha quais produtos entram na fila antes de clicar em <strong>Iniciar processamento</strong>.
            <div className="mt-2 flex gap-2">
              <Badge variant="outline" className={cn(filterMode === "all" && "bg-primary/20 border-primary")}>
                Modo: {filterMode === "all" ? "Todos os pendentes" : filterMode === "selected" ? "Selecionados" : "Período"}
              </Badge>
              {filterMode === "selected" && (
                <Badge variant="secondary">{selectedProductIds.length} produtos selecionados</Badge>
              )}
            </div>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setFilterMode("all")}
              className={cn(
                "rounded-lg border p-3 text-left text-sm transition-colors",
                filterMode === "all"
                  ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                  : "border-border hover:bg-muted/50"
              )}
            >
              <span className="font-bold flex items-center gap-2">
                <Layers className="h-4 w-4" /> Todos os pendentes
              </span>
              <span className="text-xs text-muted-foreground mt-1 block">
                Com foto e sem fundo removido (até 8000 registros).
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setFilterMode("selected")
                if (candidates.length === 0) void loadCandidates()
              }}
              className={cn(
                "rounded-lg border p-3 text-left text-sm transition-colors",
                filterMode === "selected"
                  ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                  : "border-border hover:bg-muted/50"
              )}
            >
              <span className="font-bold flex items-center gap-2">
                <ListChecks className="h-4 w-4" /> Selecionar produtos
              </span>
              <span className="text-xs text-muted-foreground mt-1 block">
                Marque na lista quais produtos processar.
              </span>
            </button>
            <button
              type="button"
              onClick={() => setFilterMode("period")}
              className={cn(
                "rounded-lg border p-3 text-left text-sm transition-colors",
                filterMode === "period"
                  ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                  : "border-border hover:bg-muted/50"
              )}
            >
              <span className="font-bold flex items-center gap-2">
                <CalendarRange className="h-4 w-4" /> Por período
              </span>
              <span className="text-xs text-muted-foreground mt-1 block">
                Só produtos cadastrados entre as datas (data de criação).
              </span>
            </button>
          </div>

          {filterMode === "period" && (
            <div className="flex flex-wrap items-end gap-4 pt-2">
              <div className="space-y-1">
                <Label htmlFor="df">Cadastrados de</Label>
                <Input id="df" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="dt">até</Label>
                <Input id="dt" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
            </div>
          )}

          {filterMode === "selected" && (
            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
              <div className="flex flex-wrap gap-2 items-center justify-between">
                <div className="relative flex-1 min-w-[200px] max-w-md">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome ou SKU..."
                    className="pl-9"
                    value={candidateSearch}
                    onChange={(e) => setCandidateSearch(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => void loadCandidates()}>
                    <RefreshCw className="h-3.5 w-3.5 mr-1" />
                    Recarregar lista
                  </Button>
                  <Button type="button" variant="secondary" size="sm" onClick={selectAllVisible}>
                    Marcar visíveis
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={clearSelection}>
                    Limpar seleção
                  </Button>
                </div>
              </div>
              {loadingCandidates ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando produtos…
                </div>
              ) : (
                <div className="max-h-[280px] overflow-y-auto rounded-md border border-border bg-background">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/90 backdrop-blur text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="w-10 p-2 text-left" />
                        <th className="p-2 text-left">Produto</th>
                        <th className="p-2 text-left">SKU</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCandidates.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="p-4 text-center text-muted-foreground">
                            Nenhum produto com foto original pendente (ou lista ainda não carregou).
                          </td>
                        </tr>
                      ) : (
                        filteredCandidates.map((c) => (
                          <tr
                            key={c.id}
                            className={cn(
                              "border-t border-border/60 hover:bg-muted/40",
                              selectedProductIdsSet.has(c.id) && "bg-primary/5"
                            )}
                          >
                            <td className="p-2">
                              <input
                                type="checkbox"
                                className="rounded border-input"
                                checked={selectedProductIdsSet.has(c.id)}
                                onChange={() => toggleProduct(c.id)}
                              />
                            </td>
                            <td className="p-2 font-medium">{c.nome}</td>
                            <td className="p-2 font-mono text-xs">{c.sku || "—"}</td>
                            <td className="p-2 text-right">
                              {c.imagem_url && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                                  title="Editar Arte"
                                  onClick={() => setEditorData({ isOpen: true, url: c.imagem_url!, produtoId: c.id })}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Selecionados: <strong>{selectedProductIds.length}</strong> produto(s)
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fila pendente (filtro atual)</CardTitle>
          <CardDescription>
            Contagem por <strong>URLs de foto ainda não processadas</strong> (exclui links que já são saída{" "}
            <code className="text-xs">sem-fundo-</code>). No modo <strong>Todos / Período</strong> só entram produtos com{" "}
            <code className="text-xs">fundo_removido</code> falso ou nulo. No modo <strong>Selecionados</strong>, usa os
            produtos escolhidos e calcula a fila pela galeria — mesmo que o cadastro esteja marcado como fundo removido.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-4 items-center">
            {loadingStats ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : (
              <>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground uppercase font-bold">Fotos na fila</span>
                  <span className="text-3xl font-bold tabular-nums">{pendingPhotos}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground uppercase font-bold">Produtos</span>
                  <span className="text-3xl font-bold tabular-nums">{pendingProducts}</span>
                </div>
                <Button variant="outline" size="sm" onClick={() => refreshStats()} className="ml-auto">
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Atualizar contagem
                </Button>
              </>
            )}
          </div>
          {filterMode === "selected" &&
            !loadingStats &&
            selectedProductIds.length > 0 &&
            pendingPhotos === 0 && (
              <p className="text-sm rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-950 dark:text-amber-100">
                <strong>Fila 0 com produtos selecionados:</strong> não há URLs originais pendentes (só imagens já
                processadas ou sem foto em <code className="text-xs">imagem_url</code> / <code className="text-xs">imagem_urls</code>
                ). Se a foto ainda aparece com fundo na loja, verifique se o ficheiro não contém{" "}
                <code className="text-xs">sem-fundo-</code> no caminho (caso contrário o sistema ignora na fila).
              </p>
            )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Controle — Processamento no Servidor</CardTitle>
          <CardDescription>
            <strong>Iniciar processamento</strong> enfileira as fotos no servidor. O processamento ocorrerá de forma assíncrona em segundo plano. Você pode fechar o sistema e desligar o computador.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-3 items-center">
            <Button
              onClick={handleStart}
              disabled={running || loadingStats}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {enqueuing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
              Iniciar processamento no Servidor
            </Button>
            <Button variant="outline" onClick={handleAbort} disabled={!running}>
              Cancelar / Limpar Fila
            </Button>
            <Badge variant={running ? "default" : "secondary"} className="ml-2">
              {running ? `Processando no Servidor (${resumoFila.pending} pendentes, ${resumoFila.processing} ativa)` : "Fila vazia / Parado"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Progresso do Lote Atual</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="text-sm text-muted-foreground grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
            <div>Pendentes: <strong>{resumoFila.pending}</strong></div>
            <div>Processando: <strong>{resumoFila.processing}</strong></div>
            <div>Sucesso (Histórico): <strong>{resumoFila.done}</strong></div>
            <div>Erro: <strong>{resumoFila.error}</strong></div>
          </div>
          {resumoFila.processing > 0 && (
            <p className="text-xs text-muted-foreground mt-2 animate-pulse flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
              O servidor está removendo o fundo das imagens em segundo plano. Você pode fechar a aba ou desligar o PC.
            </p>
          )}
          {lastError && (
            <p className="text-sm text-destructive flex items-center gap-2">
              <XCircle className="h-4 w-4 shrink-0" />
              {lastError}
            </p>
          )}
        </CardContent>
      </Card>

      {recentResults.length > 0 && (
        <Card className="border-emerald-500/20 shadow-lg">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              Resultados Recentes
            </CardTitle>
            <CardDescription>Clique em editar para adicionar textos ou formas às fotos prontas.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
              {recentResults.map((res, i) => (
                <div key={`${res.produtoId}-${i}`} className="group relative rounded-lg border overflow-hidden bg-white shadow-sm hover:shadow-md transition-all">
                  <div className="aspect-square bg-[url('https://www.transparenttextures.com/patterns/checkerboard.png')] bg-repeat">
                    <img src={res.url} alt={res.nome} className="w-full h-full object-contain" />
                  </div>
                  <div className="p-2 border-t bg-background flex flex-col gap-1">
                    <p className="text-[10px] font-medium truncate leading-tight" title={res.nome}>{res.nome}</p>
                    <div className="flex gap-1">
                      <Button 
                        size="sm" 
                        variant="secondary" 
                        className="h-7 text-[10px] gap-1 flex-1 px-1.5"
                        onClick={() => setEditorData({ isOpen: true, url: res.url, produtoId: res.produtoId })}
                      >
                        <Pencil className="h-3 w-3 shrink-0" />
                        Editar
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="h-7 text-[10px] gap-1 flex-1 px-1.5 text-destructive hover:bg-destructive/10"
                        onClick={() => handleRevertImage(res.produtoId, res.url)}
                      >
                        Reverter
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {editorData && (
        <ImageEditorModal
          isOpen={editorData.isOpen}
          imageUrl={editorData.url}
          produtoId={editorData.produtoId}
          onClose={() => setEditorData(null)}
          onSave={() => {
            setEditorData(null)
            void loadCandidates()
            void refreshStats()
          }}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Log recente</CardTitle>
          <CardDescription>Últimas 200 linhas (mais recentes no topo)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-border max-h-[420px] overflow-y-auto font-mono text-xs">
            {logs.length === 0 ? (
              <p className="p-4 text-muted-foreground">Nenhum evento ainda.</p>
            ) : (
              <ul className="divide-y divide-border">
                {logs.map((l) => (
                  <li
                    key={l.id}
                    className={cn(
                      "px-3 py-2 flex gap-2",
                      l.kind === "success" && "bg-emerald-500/5",
                      l.kind === "error" && "bg-destructive/5",
                      l.kind === "info" && "bg-muted/30"
                    )}
                  >
                    <span className="text-muted-foreground shrink-0 w-[72px]">{l.at}</span>
                    {l.kind === "success" && <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />}
                    {l.kind === "error" && <XCircle className="h-4 w-4 text-destructive shrink-0" />}
                    {l.kind === "info" && <span className="w-4 shrink-0" />}
                    <span className="flex-1 min-w-0">
                      <span className="font-medium">{l.message}</span>
                      {l.detail && (
                        <span className="block text-muted-foreground truncate" title={l.detail}>
                          {l.detail}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
