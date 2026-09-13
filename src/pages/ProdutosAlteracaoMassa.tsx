import { useEffect, useState, useCallback, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Modal } from "@/components/ui/modal"
import {
  ChevronLeft,
  Save,
  Loader2,
  Settings2,
  Search,
  Check,
  X,
  Package,
  Filter,
  Camera,
  CameraOff,
  ChevronRight,
  QrCode,
  CheckCircle2,
  Plus,
  Minus,
  Trash2,
  Sparkles,
  Brain,
  Wand2,
  ClipboardList,
  AlertTriangle,
  RotateCw,
  Printer,
} from "lucide-react"
import { QrCameraScanner } from "@/components/QrCameraScanner"
import { captureVideoFrameAsJpegBlob } from "@/lib/captureVideoFrameWithOrientation"
import { PartPhotoCameraModal } from "@/components/PartPhotoCameraModal"
import { api, estoqueApi, catalogoApi } from "@/lib/api"
import { countNewImageUrls, galleryUrlsFromProduto, registarFotosProduto } from "@/lib/fotoContribuicao"
import { removeOrphanedProdutosBucketPathsForUrls } from "@/lib/mirrorImportImages"
import { uploadPanelProdutoImageFile } from "@/lib/uploadProdutoPainel"
import { crmPermissionHint, humanErrorMessage, isRlsPermissionError } from "@/lib/permissionErrors"
import { syncSucataPecaFromProduto } from "@/lib/sucataPecaSync"
import { logAcao } from "@/lib/systemLog"
import { useAuthStore } from "@/store/authStore"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { getAuthToken } from "@/lib/auth"
import { getApiBaseUrl } from "@/lib/apiBase"
import { parseBulkMasterNomeCompleto, normKey } from "@/lib/parseNomeVeiculoPeca"
import { thumbUrl, imgFallbackToOriginal } from "@/lib/thumbUrl"
import { useProdutosCache } from "@/store/produtosCache"

import { MLIcon } from "@/components/MLIcon"
import { GerarCatalogoModal } from "@/components/GerarCatalogoModal"

function temFotoDefeito(produto: { imagem_urls?: string[] | null }): boolean {
  if (!produto.imagem_urls || !Array.isArray(produto.imagem_urls)) return false
  return produto.imagem_urls.some(u => {
    if (!u) return false
    const parts = u.split('/')
    const filename = parts[parts.length - 1] || ''
    return filename.startsWith('defeito-') || u.includes('/defeito-')
  })
}

const MAX_FOTOS = 10

// Campos editáveis em massa (key, label, type, minWidth)
const COLUMN_DEFS: { key: string; label: string; type: "text" | "number" | "boolean" | "select"; minWidth?: string }[] = [
  { key: "sku", label: "SKU", type: "text", minWidth: "36px" },
  { key: "nome", label: "Nome", type: "text", minWidth: "480px" },
  { key: "categoria_id", label: "Categoria", type: "select", minWidth: "150px" },
  { key: "marca", label: "Marca", type: "text", minWidth: "100px" },
  { key: "modelo", label: "Modelo", type: "text", minWidth: "120px" },
  { key: "part_number", label: "Part Number", type: "text", minWidth: "110px" },
  { key: "localizacao", label: "Localização", type: "text", minWidth: "120px" },
  { key: "descricao", label: "Descrição", type: "text", minWidth: "200px" },
  { key: "estoque_atual", label: "Estoque", type: "number", minWidth: "70px" },
  { key: "estoque_minimo", label: "Est. Mínimo", type: "number", minWidth: "80px" },
  { key: "custo", label: "Custo", type: "number", minWidth: "70px" },
  { key: "preco", label: "Preço", type: "number", minWidth: "70px" },
  { key: "preco_prazo", label: "Preço Prazo", type: "number", minWidth: "90px" },
  { key: "unidade_medida", label: "Unidade", type: "text", minWidth: "70px" },
  { key: "origem", label: "Origem", type: "text", minWidth: "90px" },
  { key: "qualidade", label: "Qualidade", type: "text", minWidth: "90px" },
  { key: "codigo_barras", label: "Cód. Barras", type: "text", minWidth: "110px" },
  { key: "ncm", label: "NCM", type: "text", minWidth: "100px" },
  { key: "peso_g", label: "Peso (g)", type: "number", minWidth: "75px" },
  { key: "altura_cm", label: "Altura (cm)", type: "number", minWidth: "80px" },
  { key: "largura_cm", label: "Largura (cm)", type: "number", minWidth: "90px" },
  { key: "comprimento_cm", label: "Comprimento (cm)", type: "number", minWidth: "110px" },
  { key: "condicao_produto", label: "Condição", type: "text", minWidth: "100px" },
  { key: "ativo", label: "Ativo", type: "boolean", minWidth: "64px" },
  { key: "is_published", label: "Anunciado", type: "boolean", minWidth: "80px" },
  { key: "mercadolivre", label: "Mercado Livre", type: "text", minWidth: "160px" },
  { key: "estoque_reservado", label: "Est. Reservado", type: "number", minWidth: "90px" },
  { key: "created_at", label: "Cadastrado em", type: "text", minWidth: "100px" },
]

const DEFAULT_VISIBLE = ["sku", "nome", "categoria_id", "marca", "modelo", "condicao_produto", "localizacao", "estoque_atual", "estoque_minimo", "custo", "preco", "ativo", "mercadolivre"]

const COL_WIDTH_STORAGE_KEY = "produtos-alteracao-massa-column-widths"

// Mínimo absoluto ao redimensionar: permite diminuir colunas livremente
const RESIZE_MIN = 24

function parseMinWidth(s: string | undefined): number {
  if (!s) return 100
  const n = parseInt(String(s).replace(/px|rem|em/g, ""), 10)
  return isNaN(n) ? 100 : Math.max(RESIZE_MIN, n)
}

function loadColumnWidths(): Record<string, number> {
  try {
    const raw = localStorage.getItem(COL_WIDTH_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, number>
      if (parsed && typeof parsed === "object") return parsed
    }
  } catch {}
  const def: Record<string, number> = {}
  COLUMN_DEFS.forEach((c) => { def[c.key] = parseMinWidth(c.minWidth) })
  return def
}

function saveColumnWidths(widths: Record<string, number>) {
  try { localStorage.setItem(COL_WIDTH_STORAGE_KEY, JSON.stringify(widths)) } catch {}
}

type FilterEstoque = "todos" | "com_quantidade" | "zerado" | "baixo"
type FilterStatus = "todos" | "ativos" | "inativos"
type FilterAnunciado = "todos" | "anunciados" | "nao_anunciados"
type FilterPreco = "todos" | "zero" | "maior_zero"
type FilterSucata = "todos" | "vinculados" | "nao_vinculados"
type FilterOrdenacao = "sku" | "created_at_desc" | "created_at_asc" | "nome"

function BlobImage({ blob, className, alt, onClick }: { blob: Blob, className?: string, alt?: string, onClick?: () => void }) {
  const [url, setUrl] = useState("")
  useEffect(() => {
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url ? <img src={url} className={className} alt={alt} onClick={onClick} /> : null
}

async function rotateImageBlob(blob: Blob, degrees: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error("Canvas context error"));
        return;
      }

      if (degrees % 180 !== 0) {
        canvas.width = img.height;
        canvas.height = img.width;
      } else {
        canvas.width = img.width;
        canvas.height = img.height;
      }

      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((degrees * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);

      canvas.toBlob((rotatedBlob) => {
        if (rotatedBlob) resolve(rotatedBlob);
        else reject(new Error("Blob creation error"));
      }, 'image/jpeg', 0.9);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
}

async function rotateImageUrl(url: string, rotationDeg: number = 90): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      const canvas = document.createElement("canvas")
      if (rotationDeg % 180 !== 0) {
        canvas.width = img.height
        canvas.height = img.width
      } else {
        canvas.width = img.width
        canvas.height = img.height
      }
      const ctx = canvas.getContext("2d")
      if (!ctx) {
        reject(new Error("Erro ao criar contexto 2D"))
        return
      }
      ctx.translate(canvas.width / 2, canvas.height / 2)
      ctx.rotate((rotationDeg * Math.PI) / 180)
      ctx.drawImage(img, -img.width / 2, -img.height / 2)
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob)
          else reject(new Error("Erro ao gerar Blob da imagem"))
        },
        "image/jpeg",
        0.9
      )
    }
    img.onerror = (err) => reject(err)
    img.src = url
  })
}

export function ProdutosAlteracaoMassa() {
  const navigate = useNavigate()
  const { atendente } = useAuthStore()
  const [produtos, setProdutos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const searchTermRef = useRef("")
  const [filterEstoque, setFilterEstoque] = useState<FilterEstoque>("todos")
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("todos")
  const [filterAnunciado, setFilterAnunciado] = useState<FilterAnunciado>("todos")
  const [filterPreco, setFilterPreco] = useState<FilterPreco>("todos")
  const [filterSucata, setFilterSucata] = useState<FilterSucata>("todos")
  const [filterOrdenacao, setFilterOrdenacao] = useState<FilterOrdenacao>("created_at_desc")
  const [localizacoes, setLocalizacoes] = useState<any[]>([])
  const [filterParentLoc, setFilterParentLoc] = useState<string>("todas")
  const [filterChildLoc, setFilterChildLoc] = useState<string>("todas")
  const [sucatas, setSucatas] = useState<any[]>([])
  const [filterSucataId, setFilterSucataId] = useState<string>("todas")
  const [showFilters, setShowFilters] = useState(false)
  const [visibleColumns, setVisibleColumns] = useState<string[]>(DEFAULT_VISIBLE)
  const [showColumnPicker, setShowColumnPicker] = useState(false)
  const [edits, setEdits] = useState<Record<string, Record<string, any>>>({})
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkColumn, setBulkColumn] = useState<string>("estoque_atual")
  const [bulkValue, setBulkValue] = useState<string>("")
  const [bulkOp, setBulkOp] = useState<"add" | "sub">("add")
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 100

  const [allCategories, setAllCategories] = useState<{ id: string; nome: string }[]>([])
  useEffect(() => {
    const fetchCats = async () => {
      try {
        const res = await estoqueApi.listarCategorias()
        const list = Array.isArray(res) ? res : []
        setAllCategories(list.sort((a, b) => a.nome.localeCompare(b.nome)))
      } catch (e) {
        console.error(e)
      }
    }
    fetchCats()
  }, [])

  // Master data para o parse inteligente
  const [masterData, setMasterData] = useState<{
    categorias: { id: string; nome: string }[]
    modelos: string[]
    marcas: string[]
    marcaPorModelo: Map<string, string>
  } | null>(null)
  const [isEnriching, setIsEnriching] = useState(false)

  const NUMERIC_COLUMNS = COLUMN_DEFS.filter((c) => c.type === "number").map((c) => c.key)

  // Larguras das colunas (redimensionáveis como Excel)
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(loadColumnWidths)
  const resizingRef = useRef<{ key: string; startX: number; startW: number } | null>(null)

  // Modal de fotos
  const [photoProduto, setPhotoProduto] = useState<any | null>(null)
  const [capturedPhotos, setCapturedPhotos] = useState<Blob[]>([])
  const [photoUploading, setPhotoUploading] = useState(false)
  const [editingPhotoIndex, setEditingPhotoIndex] = useState<number | null>(null)
  const [isRotating, setIsRotating] = useState(false)
  const [mlIdentification, setMlIdentification] = useState<any | null>(null)
  const [identifying, setIdentifying] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [cameraFallback, setCameraFallback] = useState(false)

  // Modal QR + Fotos (fluxo rápido: scan -> confirmar -> fotos -> salvar -> scan)
  const [showQrFotosModal, setShowQrFotosModal] = useState(false)
  const [qrFotosPhase, setQrFotosPhase] = useState<"scan" | "confirm" | "photos" | "saved">("scan")
  const [qrScannedProduct, setQrScannedProduct] = useState<any | null>(null)
  const [isPartPhotoDefectOpen, setIsPartPhotoDefectOpen] = useState(false)
  const [qrLastScannedCode, setQrLastScannedCode] = useState<string>("")
  const [qrSavedMessage, setQrSavedMessage] = useState<string>("")
  /** Incrementa ao voltar para a fase scan para remontar o leitor QR (libera câmera corretamente). */
  const [qrScannerSession, setQrScannerSession] = useState(0)
  const [qrCameraActive, setQrCameraActive] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)

  // Modal "Colar SKUs"
  const [showSkuPasteModal, setShowSkuPasteModal] = useState(false)
  const [skuPasteText, setSkuPasteText] = useState("")
  const [skuPasteLoading, setSkuPasteLoading] = useState(false)
  const [skuPasteResults, setSkuPasteResults] = useState<{ produto: any; qty: number }[]>([])
  const [skuPasteNotFound, setSkuPasteNotFound] = useState<string[]>([])
  const [skuPasteBulkQty, setSkuPasteBulkQty] = useState<string>("")
  const [skuPasteSaving, setSkuPasteSaving] = useState(false)
  const [viewingImages, setViewingImages] = useState<string[]>([])
  const [viewingImageIdx, setViewingImageIdx] = useState<number>(0)
  const [isGerarCatalogoModalOpen, setIsGerarCatalogoModalOpen] = useState(false)
  const [selectedProductsMap, setSelectedProductsMap] = useState<Record<string, any>>({})
  const [viewingProduct, setViewingProduct] = useState<any | null>(null)
  const [imageRotations, setImageRotations] = useState<Record<string, number>>({})
  const [savingRotations, setSavingRotations] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (viewingImages.length === 0) return
      if (e.key === "ArrowLeft") {
        setViewingImageIdx((prev) => (prev === 0 ? viewingImages.length - 1 : prev - 1))
      } else if (e.key === "ArrowRight") {
        setViewingImageIdx((prev) => (prev === viewingImages.length - 1 ? 0 : prev + 1))
      } else if (e.key === "Escape") {
        setViewingImages([])
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [viewingImages])

  const handleSaveRotations = async () => {
    if (!viewingProduct) return
    const rotatedUrls = Object.keys(imageRotations).filter((url) => (imageRotations[url] || 0) > 0)
    if (rotatedUrls.length === 0) {
      toast.info("Nenhuma imagem rotacionada para salvar.")
      return
    }

    setSavingRotations(true)
    try {
      const nextUrls: string[] = []
      for (const url of viewingImages) {
        const deg = imageRotations[url] || 0
        if (deg > 0) {
          toast.loading("Girando imagem...", { id: "rotate-loader" })
          const rotatedBlob = await rotateImageUrl(url, deg)
          const ts = Date.now()
          const file = new File([rotatedBlob], `foto-rotacionada-${ts}.jpg`, { type: "image/jpeg" })
          const newUrl = await uploadPanelProdutoImageFile(file)
          nextUrls.push(newUrl)
        } else {
          nextUrls.push(url)
        }
      }

      await api.put(`/api/estoque/produtos/${viewingProduct.id}`, {
        imagem_url: nextUrls[0] || null,
        imagem_urls: nextUrls,
      })

      toast.success("Imagens rotacionadas salvas com sucesso!", { id: "rotate-loader" })

      setProdutos((prev) =>
        prev.map((p) =>
          p.id === viewingProduct.id ? { ...p, imagem_url: nextUrls[0], imagem_urls: nextUrls } : p
        )
      )

      setViewingImages(nextUrls)
      setImageRotations({})
    } catch (e: any) {
      console.error(e)
      toast.error(`Erro ao salvar rotações: ${e?.message || e}`, { id: "rotate-loader" })
    } finally {
      setSavingRotations(false)
    }
  }

  const fetchProdutos = useCallback(async (pageNum = 0) => {
    setLoading(true)
    try {
      const params: NonNullable<Parameters<typeof estoqueApi.listarProdutos>[0]> = {
        painel: true,
        limit: PAGE_SIZE,
        offset: pageNum * PAGE_SIZE,
      }
      if (searchTermRef.current?.trim()) params.q = searchTermRef.current.trim()
      if (filterStatus === "ativos") params.ativo = true
      else if (filterStatus === "inativos") params.ativo = false
      if (filterEstoque === "com_quantidade") params.estoque = "positivo"
      else if (filterEstoque === "zerado") params.estoque = "zerado"
      else if (filterEstoque === "baixo") params.estoque = "baixo5"
      if (filterAnunciado === "anunciados") params.anunciados = "sim"
      else if (filterAnunciado === "nao_anunciados") params.anunciados = "nao"
      if (filterPreco === "zero") params.preco = "zero"
      else if (filterPreco === "maior_zero") params.preco = "maior_zero"
      if (filterSucata === "vinculados") params.sucata = "vinculados"
      else if (filterSucata === "nao_vinculados") params.sucata = "nao_vinculados"
      if (filterSucataId !== "todas") params.sucata_id = filterSucataId
      if (filterOrdenacao === "sku") {
        params.ordenar = "sku"
        params.direcao = "asc"
      } else if (filterOrdenacao === "created_at_desc") {
        params.ordenar = "created_at"
        params.direcao = "desc"
      } else if (filterOrdenacao === "created_at_asc") {
        params.ordenar = "created_at"
        params.direcao = "asc"
      } else if (filterOrdenacao === "nome") {
        params.ordenar = "nome"
        params.direcao = "asc"
      }
      if (filterChildLoc !== "todas") {
        params.localizacao_id = filterChildLoc
      } else if (filterParentLoc !== "todas") {
        const childIds = localizacoes.filter((l) => l.parent_id === filterParentLoc).map((l) => l.id)
        params.localizacao_ids = [filterParentLoc, ...childIds].join(",")
      }

      const res = await estoqueApi.listarProdutos(params)
      const items = Array.isArray(res?.items) ? res.items : []
      const total = typeof res?.total === "number" ? res.total : null
      setProdutos(items)
      if (total !== null) {
        setTotalCount(total)
      }
      setPage(pageNum)
    } catch (e: any) {
      console.error(e)
      alert("Erro ao carregar produtos: " + (e?.message || e))
    } finally {
      setLoading(false)
    }
  }, [filterEstoque, filterStatus, filterAnunciado, filterPreco, filterSucata, filterSucataId, filterOrdenacao, filterParentLoc, filterChildLoc, localizacoes])

  useEffect(() => {
    const fetchLocais = async () => {
      try {
        const acc: any[] = []
        const lim = 1000
        let off = 0
        for (;;) {
          const chunk = await api.get(`/api/localizacoes/?limit=${lim}&offset=${off}`)
          const rows = Array.isArray(chunk) ? chunk : []
          acc.push(...rows)
          if (rows.length < lim) break
          off += lim
        }
        acc.sort((a, b) => String(a?.nome || "").localeCompare(String(b?.nome || ""), "pt-BR"))
        setLocalizacoes(acc)
      } catch (e) {
        console.error(e)
      }
    }
    void fetchLocais()
  }, [])

  useEffect(() => {
    const fetchSucatas = async () => {
      try {
        const data = await api.get('/api/sucatas/?limit=1000')
        const list = Array.isArray(data) ? data : []
        list.sort((a: any, b: any) => String(a?.codigo || "").localeCompare(String(b?.codigo || ""), "pt-BR"))
        setSucatas(list)
      } catch (e) {
        console.error(e)
      }
    }
    void fetchSucatas()
  }, [])

  useEffect(() => {
    fetchProdutos(0)
  }, [fetchProdutos])

  const startResize = useCallback((key: string, clientX: number) => {
    const def = COLUMN_DEFS.find((c) => c.key === key)
    const defaultW = def ? parseMinWidth(def.minWidth) : 100
    const current = columnWidths[key] ?? defaultW
    resizingRef.current = { key, startX: clientX, startW: current }
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
  }, [columnWidths])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const r = resizingRef.current
      if (!r) return
      const delta = e.clientX - r.startX
      const newW = Math.max(RESIZE_MIN, r.startW + delta)
      setColumnWidths((prev) => {
        const next = { ...prev, [r.key]: newW }
        saveColumnWidths(next)
        return next
      })
    }
    const onUp = () => {
      if (resizingRef.current) {
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
      }
      resizingRef.current = null
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [])

  const getCellValue = (prod: any, key: string) => {
    if (edits[prod.id]?.[key] !== undefined) return edits[prod.id][key]
    const v = prod[key]
    if (key === "ativo" || key === "is_published") return v ?? (key === "is_published" ? false : true)
    if (key === "created_at" && v) return new Date(v).toLocaleDateString("pt-BR")
    return v ?? ""
  }

  const setCellValue = (prodId: string, key: string, value: any) => {
    if (key === "created_at") return
    setEdits((prev) => {
      const next = { ...prev }
      if (!next[prodId]) next[prodId] = {}
      const def = COLUMN_DEFS.find((c) => c.key === key)
      if (def?.type === "number") {
        const n = parseFloat(String(value))
        next[prodId][key] = isNaN(n) ? 0 : n
      } else if (def?.type === "boolean") {
        next[prodId][key] = value === true || value === "true" || value === "1"
      } else {
        next[prodId][key] = value == null ? "" : String(value)
      }
      return next
    })
  }

  const hasChanges = Object.keys(edits).length > 0

  const handleSave = async () => {
    if (!hasChanges) return
    setSaving(true)
    try {
      let ok = 0
      let err = 0
      for (const [prodId, payload] of Object.entries(edits)) {
        try {
          await api.put(`/api/estoque/produtos/${prodId}`, { ...payload, origem_edicao: "massa" })
          ok++
          const prod = produtos.find((p) => p.id === prodId)
          if (prod) {
            const merged = { ...prod, ...payload }
            await syncSucataPecaFromProduto({
              id: prodId,
              nome: merged.nome,
              descricao: merged.descricao,
              part_number: merged.part_number,
              custo: merged.custo,
              preco: merged.preco,
              qualidade: merged.qualidade,
              localizacao_id: merged.localizacao_id,
            })
          }
        } catch (error) {
          console.error("Erro ao salvar produto", prodId, error)
          err++
        }
      }
      setEdits({})
      await fetchProdutos(page)
      if (ok > 0) {
        logAcao("produto.alteracao_massa", `${ok} produto(s) atualizado(s) na alteracao em massa`, atendente?.id)
      }
      alert(`Salvo: ${ok} produto(s).${err > 0 ? ` Erros: ${err}.` : ""}`)
    } catch (e: any) {
      alert("Erro ao salvar: " + (e?.message || e))
    } finally {
      setSaving(false)
    }
  }

  const toggleColumn = (key: string) => {
    setVisibleColumns((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === produtos.length) {
      setSelectedIds(new Set())
      setSelectedProductsMap({})
    } else {
      const allIds = produtos.map((p) => p.id)
      setSelectedIds(new Set(allIds))
      setSelectedProductsMap((prev) => {
        const next = { ...prev }
        produtos.forEach((p) => {
          next[p.id] = p
        })
        return next
      })
    }
  }

  const handlePrintLabels = async () => {
    const selectedProducts = Array.from(selectedIds).map(id => selectedProductsMap[id]).filter(Boolean);
    if (selectedProducts.length === 0) {
      alert('Selecione pelo menos um produto para imprimir etiquetas.');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Permita pop-ups para este site para imprimir etiquetas.');
      return;
    }
    printWindow.document.write('<html><head><title>Carregando etiquetas...</title></head><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;">Carregando etiquetas...</body></html>');
    printWindow.document.close();

    const getLocSigla = (locId: string | null | undefined): string => {
      if (!locId) return 'N/A';
      const loc = localizacoes.find(l => l.id === locId);
      return loc ? (loc.sigla || loc.nome || 'N/A') : 'N/A';
    };

    const totalLabelsCount = selectedProducts.reduce((sum, p) => sum + (p.estoque_atual > 0 ? p.estoque_atual : 1), 0);
    const QRCode = (await import('qrcode')).default;
    
    const labelsHtml = await Promise.all(
      selectedProducts.map(async (p) => {
        const locSigla = getLocSigla(p.localizacao_id) !== 'N/A' ? getLocSigla(p.localizacao_id) : (p.localizacao || 'N/A');
        const qrDataUrl = await QRCode.toDataURL(p.sku, {
          width: 120,
          margin: 1,
          color: { dark: '#000000', light: '#ffffff' }
        });

        const singleLabel = `
          <div class="label">
            <div class="left">
              <div class="name">${p.nome || ''}</div>
              <div class="location">&#128205; ${locSigla}</div>
              ${p.part_number ? `<div class="part">PN: ${p.part_number}</div>` : ''}
            </div>
            <div class="right">
              <img src="${qrDataUrl}" class="qr" alt="QR ${p.sku}" />
              <div class="sku">${p.sku}</div>
              <div class="qr-label">ESCANEIE</div>
            </div>
          </div>
        `;
        const qty = p.estoque_atual > 0 ? p.estoque_atual : 1;
        return Array(qty).fill(singleLabel).join('');
      })
    );

    printWindow.document.open();
    printWindow.document.write(`
      <html>
        <head>
          <title>Etiquetas — ${totalLabelsCount} etiqueta(s)</title>
          <style>
            @page { size: 100mm 50mm; margin: 0; }
            *, *::before, *::after { box-sizing: border-box; }
            body { margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background: #fff; }
            .label { width: 100mm; height: 50mm; padding: 4mm 4mm 3mm 4mm; display: flex; flex-direction: row; align-items: center; gap: 3mm; border: 1px dashed #aaa; page-break-after: always; overflow: hidden; }
            .left { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 2mm; overflow: hidden; }
            .right { display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink: 0; gap: 1mm; }
            .sku { font-size: 22pt; font-weight: 900; letter-spacing: -0.5px; color: #000; line-height: 1.1; }
            .name { font-size: 9.75pt; font-weight: 600; color: #222; line-height: 1.15; word-wrap: break-word; overflow-wrap: break-word; white-space: normal; display: -webkit-box; -webkit-line-clamp: 6; -webkit-box-orient: vertical; overflow: hidden; max-height: 28mm; }
            .location { font-size: 8.5pt; font-weight: bold; color: #000; border-top: 1px solid #ccc; padding-top: 1.5mm; margin-top: 0.5mm; width: 100%; line-height: 1.15; white-space: normal; overflow-wrap: anywhere; word-break: break-word; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
            .part { font-size: 8pt; font-weight: bold; color: #444; border-top: 1px solid #eee; padding-top: 1.5mm; }
            .qr { width: 28mm; height: 28mm; object-fit: contain; }
            .qr-label { font-size: 6.5pt; font-weight: 800; color: #444; text-transform: uppercase; letter-spacing: 1px; }
            @media print { .label { border: none; } }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          ${labelsHtml.join('')}
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        setSelectedProductsMap((prevMap) => {
          const nextMap = { ...prevMap }
          delete nextMap[id]
          return nextMap
        })
      } else {
        next.add(id)
        const found = produtos.find((p) => p.id === id)
        if (found) {
          setSelectedProductsMap((prevMap) => ({ ...prevMap, [id]: found }))
        }
      }
      return next
    })
  }

  const handleBulkAdjust = () => {
    if (selectedIds.size === 0) {
      alert("Selecione pelo menos um produto.")
      return
    }

    if (bulkColumn === "categoria_id") {
      if (!bulkValue) {
        alert("Selecione uma categoria.")
        return
      }
      setEdits((prev) => {
        const next = { ...prev }
        for (const prod of produtos) {
          if (!selectedIds.has(prod.id)) continue
          if (!next[prod.id]) next[prod.id] = {}
          next[prod.id]["categoria_id"] = bulkValue
        }
        return next
      })
      setBulkValue("")
      return
    }

    const val = parseFloat(bulkValue)
    if (isNaN(val) || val <= 0) {
      alert("Informe um valor numérico maior que zero.")
      return
    }
    if (!NUMERIC_COLUMNS.includes(bulkColumn)) return

    setEdits((prev) => {
      const next = { ...prev }
      for (const prod of produtos) {
        if (!selectedIds.has(prod.id)) continue
        const current = getCellValue(prod, bulkColumn)
        const num = typeof current === "number" ? current : parseFloat(String(current || 0)) || 0
        const newVal = bulkOp === "add" ? num + val : Math.max(0, num - val)
        if (!next[prod.id]) next[prod.id] = {}
        next[prod.id][bulkColumn] = newVal
      }
      return next
    })
    setBulkValue("")
  }

  const handleAutoEnrich = async (ids?: Set<string>) => {
    const targetIds = ids || selectedIds
    if (targetIds.size === 0) return

    setIsEnriching(true)
    try {
      let data = masterData
      if (!data) {
        toast.info("Carregando base de veículos para análise...")
        const [cats, brands, mods] = await Promise.all([
          estoqueApi.listarCategorias(),
          api.get("/api/configuracoes/veiculos/marcas"),
          api.get("/api/configuracoes/veiculos/modelos"),
        ])

        const marcaMap = new Map<string, string>()
        const marcasArr = Array.isArray(brands) ? brands : []
        const modelosArr = Array.isArray(mods) ? mods : []
        const categoriasArr = Array.isArray(cats) ? cats : []
        
        modelosArr.forEach((m: any) => {
          const br = marcasArr.find((b: any) => b.id === m.marca_id)
          if (br?.nome) marcaMap.set(normKey(m.nome), br.nome)
        })

        data = {
          categorias: categoriasArr.map((c: any) => ({ id: c.id, nome: c.nome })),
          marcas: marcasArr.map((m: any) => m.nome),
          modelos: modelosArr.map((m: any) => m.nome),
          marcaPorModelo: marcaMap,
        }
        setMasterData(data)
      }

      let count = 0
      let compatCount = 0

      // Processar produtos em paralelo para ganhar tempo
      const selectedProds = produtos.filter(p => targetIds.has(p.id))
      const newEdits = { ...edits }

      for (const prod of selectedProds) {
        const parsed = parseBulkMasterNomeCompleto(prod.nome || "", {
          categoriasNomes: data!.categorias.map(c => c.nome),
          nomesMarcas: data!.marcas,
          nomesModelos: data!.modelos,
          marcaPorModeloNome: data!.marcaPorModelo,
        })

        const payload: Record<string, any> = {}
        let changed = false

        if (parsed.marca && !prod.marca) {
          payload.marca = parsed.marca
          changed = true
        }
        if (parsed.modelo_texto && !prod.modelo) {
          payload.modelo = parsed.modelo_texto
          changed = true
        }
        if (parsed.ano_inicio && prod.ano_inicio == null) {
          payload.ano_inicio = parsed.ano_inicio
          changed = true
        }
        if (parsed.ano_fim && prod.ano_fim == null) {
          payload.ano_fim = parsed.ano_fim
          changed = true
        }
        if (parsed.variacao && !prod.variacao) {
          payload.variacao = parsed.variacao
          changed = true
        }

        // Enriquecer categoria se estiver vazia
        if (parsed.categoria_nome && !prod.categoria_id) {
          const catHit = data!.categorias.find(
            c => c.nome.toLowerCase() === parsed.categoria_nome?.toLowerCase()
          )
          if (catHit) {
            payload.categoria_id = catHit.id
            changed = true
          }
        }

        // Se tem Part Number, tentar buscar compatibilidades no catálogo master
        const pn = (prod.part_number || "").trim()
        if (pn && pn.length >= 4) {
          try {
            const piece = await catalogoApi.listarPecas({ q: pn, limit: 1 })
            if (piece && piece.length > 0 && piece[0].id) {
              const compats = await catalogoApi.listarCompatBulk([piece[0].id])
              if (compats && compats.length > 0) {
                // Salvar compatibilidades imediatamente (pois é uma tabela separada)
                await api.put(`/api/estoque/produtos/${prod.id}/compatibilidade`, {
                  items: compats.map((c: any) => ({
                    marca: c.marca,
                    modelo: c.modelo,
                    ano: c.ano,
                    versao: c.versao,
                    motorizacao: c.motorizacao,
                    familia: c.familia,
                  }))
                })
                compatCount++
              }
            }
          } catch (e) {
            console.warn(`[AutoEnrich] Falha ao buscar compatibilidade para ${prod.sku}:`, e)
          }
        }

        if (changed) {
          newEdits[prod.id] = { ...(newEdits[prod.id] || {}), ...payload }
          count++
        }
      }

      setEdits(newEdits)

      if (count > 0 || compatCount > 0) {
        // Silently update for reactive feel, or show subtle toast if manual
        if (!ids) {
          let msg = ""
          if (count > 0) msg += `${count} produto(s) com campos preenchidos. `
          if (compatCount > 0) msg += `${compatCount} produto(s) com compatibilidades vinculadas automaticamente.`
          toast.success(msg + " Clique em Salvar para persistir os campos de texto.")
        }
      }
    } catch (e: any) {
      console.error(e)
      toast.error("Erro ao processar produtos: " + (e?.message || e))
    } finally {
      setIsEnriching(false)
    }
  }

  const openPhotoModal = useCallback(async (produto: any) => {
    setPhotoProduto(produto)
    setCapturedPhotos([])
    setCameraFallback(false)
    try {
      const isLocalhost =
        typeof window !== "undefined" &&
        (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
      if (!window.isSecureContext && !isLocalhost) {
        setCameraFallback(true)
        throw new Error("Câmera requer HTTPS (ou localhost em dev).")
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraFallback(true)
        throw new Error("Câmera indisponível neste dispositivo/navegador.")
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      streamRef.current = stream
      setTimeout(() => {
        if (videoRef.current && stream) videoRef.current.srcObject = stream
      }, 50)
    } catch (e: any) {
      const msg = e?.message || "Permissão negada"
      alert("Erro ao acessar câmera: " + msg + "\n\nVocê pode enviar fotos escolhendo arquivos da galeria.")
      setCameraFallback(true)
    }
  }, [])

  const closePhotoModal = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    setPhotoProduto(null)
    setCapturedPhotos([])
    setCameraFallback(false)
  }, [])

  const removeCapturedPhoto = useCallback((index: number) => {
    setCapturedPhotos((prev) => prev.filter((_, i) => i !== index))
    if (editingPhotoIndex === index) setEditingPhotoIndex(null)
  }, [editingPhotoIndex])

  const handleRotatePhoto = useCallback(async (index: number) => {
    const blob = capturedPhotos[index]
    if (!blob || isRotating) return
    setIsRotating(true)
    try {
      const rotated = await rotateImageBlob(blob, 90)
      setCapturedPhotos(prev => {
        const next = [...prev]
        next[index] = rotated
        return next
      })
    } catch (e) {
      console.error("Erro ao rotacionar foto", e)
    } finally {
      setIsRotating(false)
    }
  }, [capturedPhotos, isRotating])

  const identifyPieceWithIA = useCallback(async (blob: Blob) => {
    if (identifying) return
    setIdentifying(true)
    try {
      toast.info("Analisando peça com Inteligência do Mercado Livre...")
      
      // 1. Upload temporário para obter URL pública necessária para o Classificador ML
      const file = new File([blob], `ia-detect-${Date.now()}.jpg`, { type: "image/jpeg" })
      const imageUrl = await uploadPanelProdutoImageFile(file)
      
      if (!imageUrl) throw new Error("Erro no upload da imagem")

      // 2. Chamar o endpoint Classifier no Backend
      const result = await api.post("/api/mercadolivre/classifier/predict", { image_url: imageUrl })
      
      if (result) {
        setMlIdentification(result)
        // Se já houver um produto sendo editado, podemos preencher campos sugeridos
        if (photoProduto) {
          setCellValue(photoProduto.id, "nome", result.title || photoProduto.nome)
          // Adicionar outros mapeamentos se necessário
        }
      }
      toast.success("Peça identificada pelo Mercado Livre!")
    } catch (e: any) {
      console.error(e)
      toast.error("Falha na identificação: " + (e?.message || "Tente novamente"))
    } finally {
      setIdentifying(false)
    }
  }, [identifying, photoProduto])

  const capturePhoto = useCallback(() => {
    const video = videoRef.current
    if (!video || !streamRef.current || video.readyState !== 4) return
    void captureVideoFrameAsJpegBlob(video, 0.85).then((blob) => {
      if (blob) setCapturedPhotos((prev) => (prev.length >= MAX_FOTOS ? prev : [...prev, blob]))
    })
  }, [])

  const onPickFiles = useCallback((files: FileList | null) => {
    const arr = Array.from(files || [])
    if (!arr.length) return
    setCapturedPhotos((prev) => {
      const next = [...prev]
      for (const f of arr) {
        if (next.length >= MAX_FOTOS) break
        next.push(f)
      }
      return next
    })
  }, [])

  const goToNextProduct = useCallback(() => {
    if (!photoProduto) return
    const idx = produtos.findIndex((p) => p.id === photoProduto.id)
    if (idx >= 0 && idx < produtos.length - 1) {
      const next = produtos[idx + 1]
      closePhotoModal()
      setCapturedPhotos([])
      setTimeout(() => openPhotoModal(next), 100)
    } else {
      closePhotoModal()
    }
  }, [photoProduto, produtos, closePhotoModal, openPhotoModal])

  const savePhotosToProduct = useCallback(
    async (produto: any, goToNext = false) => {
      if (!produto || capturedPhotos.length === 0) {
        if (goToNext) goToNextProduct()
        return
      }
      setPhotoUploading(true)
      try {
        const prevGallery = galleryUrlsFromProduto(produto)
        // Modo "massa": substituir fotos antigas (incluindo as vindas do catálogo) pelas novas capturas.
        const uploadedUrls: string[] = []
        const ts = Date.now()
        for (let i = 0; i < capturedPhotos.length; i++) {
          const blob = capturedPhotos[i]
          const file = new File([blob], `foto-${ts}-${i}.jpg`, { type: "image/jpeg" })
          uploadedUrls.push(await uploadPanelProdutoImageFile(file))
        }
        const finalUrls = Array.from(new Set(uploadedUrls)).filter(Boolean)
        const added = countNewImageUrls(prevGallery, finalUrls)
        const nextSet = new Set(finalUrls.map((s) => String(s || "").trim()).filter(Boolean))
        const removedUrls = prevGallery
          .map((s) => String(s || "").trim())
          .filter(Boolean)
          .filter((u) => !nextSet.has(u))
        await api.put(`/api/estoque/produtos/${produto.id}`, {
          imagem_url: finalUrls[0] || null,
          imagem_urls: finalUrls,
        })
        if (removedUrls.length > 0) {
          try {
            await removeOrphanedProdutosBucketPathsForUrls(removedUrls)
          } catch (e) {
            console.warn("[ProdutosAlteracaoMassa] limpeza Storage (substituição fotos):", e)
          }
        }
        if (added > 0) {
          await registarFotosProduto({
            produtoId: produto.id,
            quantidadeNovas: added,
            desmontadorIdProduto: produto.desmontador_id,
            atendenteIdProduto: produto.atendente_id,
            atendenteIdSessao: atendente?.id,
            origem: "estoque_massa_camera",
          })
        }
        setProdutos((prev) =>
          prev.map((p) =>
            p.id === produto.id ? { ...p, imagem_url: finalUrls[0], imagem_urls: finalUrls } : p
          )
        )
        setCapturedPhotos([])
        if (goToNext) {
          goToNextProduct()
        } else {
          closePhotoModal()
        }
      } catch (e: unknown) {
        if (isRlsPermissionError(e as { code?: string; message?: string })) {
          alert(crmPermissionHint("salvar fotos do produto"))
        } else {
          alert("Erro ao salvar fotos: " + humanErrorMessage(e))
        }
      } finally {
        setPhotoUploading(false)
      }
    },
    [capturedPhotos, goToNextProduct, atendente?.id]
  )

  useEffect(() => {
    const inPhotoMode = !!photoProduto || (showQrFotosModal && qrFotosPhase === "photos")
    if (!inPhotoMode) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault()
        capturePhoto()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    if (streamRef.current && !showQrFotosModal) {
        streamRef.current.getTracks().forEach((t) => t.stop())
    }
  }, [photoProduto, showQrFotosModal, qrFotosPhase, capturePhoto])

  // ── QR + Fotos (fluxo rápido) ─────────────────────────────────────────────────
  const lookupProductByCode = useCallback(async (code: string) => {
    let c = code?.trim()
    if (!c) return null
    if (c.startsWith("0")) {
      c = c.replace(/^0+/, "") || "0"
    }
    try {
      const rows = await api.get(`/api/estoque/produtos/busca?exact_code=${encodeURIComponent(c)}&limit=5`)
      const arr = Array.isArray(rows) ? rows : []
      return arr[0] ?? null
    } catch {
      return null
    }
  }, [])

  const openQrFotosModal = useCallback(() => {
    setQrScannerSession((s) => s + 1)
    setShowQrFotosModal(true)
    setQrFotosPhase("scan")
    setQrScannedProduct(null)
    setQrLastScannedCode("")
    setQrSavedMessage("")
    setQrCameraActive(false)
  }, [])

  const closeQrFotosModal = useCallback(async () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    setShowQrFotosModal(false)
    setQrFotosPhase("scan")
    setQrScannedProduct(null)
    setPhotoProduto(null)
    setCapturedPhotos([])
    setQrCameraActive(false)
  }, [])

  const handleQrScan = useCallback(async (code: string) => {
    const c = code.trim()
    if (!c || c === qrLastScannedCode || isTransitioning) return
    setQrLastScannedCode(c)
    
    const prod = await lookupProductByCode(c)
    if (prod) {
      setQrScannedProduct(prod)
      setQrCameraActive(false)
      setIsTransitioning(true)
      
      // Delay essencial para liberar o hardware da câmera antes do modo de foto abrir
      setTimeout(() => {
        setQrFotosPhase("confirm")
        setIsTransitioning(false)
      }, 500)
    } else {
      setQrLastScannedCode("")
      alert("Produto não encontrado para o código: " + c)
    }
  }, [lookupProductByCode, qrLastScannedCode, isTransitioning])

  const confirmQrProduct = useCallback(async () => {
    if (!qrScannedProduct) return
    setQrFotosPhase("photos")
    setPhotoProduto(qrScannedProduct)
    setCapturedPhotos([])
    setCameraFallback(false)
    try {
      const isLocalhost =
        typeof window !== "undefined" &&
        (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
      if (!window.isSecureContext && !isLocalhost) {
        setCameraFallback(true)
        throw new Error("Câmera requer HTTPS (ou localhost em dev).")
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraFallback(true)
        throw new Error("Câmera indisponível neste dispositivo/navegador.")
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      streamRef.current = stream
      setTimeout(() => {
        if (videoRef.current && stream) videoRef.current.srcObject = stream
      }, 50)
    } catch (e: any) {
      const msg = e?.message || "Permissão negada"
      alert("Erro ao acessar câmera: " + msg + "\n\nVocê pode enviar fotos escolhendo arquivos da galeria.")
      setCameraFallback(true)
    }
  }, [qrScannedProduct])

  const saveQrFotosAndContinue = useCallback(async () => {
    if (!qrScannedProduct || capturedPhotos.length === 0) {
      setQrScannedProduct(null)
      setQrLastScannedCode("")
      setPhotoProduto(null)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
      if (videoRef.current) videoRef.current.srcObject = null
      setCapturedPhotos([])
      setQrScannerSession((s) => s + 1)
      setQrFotosPhase("scan")
      return
    }
    setPhotoUploading(true)
    try {
      const produto = qrScannedProduct
      const prevGallery = galleryUrlsFromProduto(produto)
      // Modo QR em massa: substituir fotos antigas (incluindo as vindas do catálogo) pelas novas capturas.
      const uploadedUrls: string[] = []
      const ts = Date.now()
      for (let i = 0; i < capturedPhotos.length; i++) {
        const blob = capturedPhotos[i]
        const file = new File([blob], `foto-${ts}-${i}.jpg`, { type: "image/jpeg" })
        uploadedUrls.push(await uploadPanelProdutoImageFile(file))
      }
      const finalUrls = Array.from(new Set(uploadedUrls)).filter(Boolean)
      const added = countNewImageUrls(prevGallery, finalUrls)
      const nextSet = new Set(finalUrls.map((s) => String(s || "").trim()).filter(Boolean))
      const removedUrls = prevGallery
        .map((s) => String(s || "").trim())
        .filter(Boolean)
        .filter((u) => !nextSet.has(u))
      await api.put(`/api/estoque/produtos/${produto.id}`, {
        imagem_url: finalUrls[0] || null,
        imagem_urls: finalUrls,
        origem_edicao: "fotos_qrcode",
      })
      if (removedUrls.length > 0) {
        try {
          await removeOrphanedProdutosBucketPathsForUrls(removedUrls)
        } catch (e) {
          console.warn("[ProdutosAlteracaoMassa] limpeza Storage (substituição fotos QR):", e)
        }
      }
      if (added > 0) {
        await registarFotosProduto({
          produtoId: produto.id,
          quantidadeNovas: added,
          desmontadorIdProduto: produto.desmontador_id,
          atendenteIdProduto: produto.atendente_id,
          atendenteIdSessao: atendente?.id,
          origem: "estoque_massa_qr",
        })
      }
      setCapturedPhotos([])
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
      if (videoRef.current) videoRef.current.srcObject = null
      toast.success(`Fotos salvas em ${produto.sku}. Leia o próximo QR Code.`)
      setQrSavedMessage("")
      setQrScannedProduct(null)
      setQrLastScannedCode("")
      setPhotoProduto(null)
      setCapturedPhotos([])
      // Nova sessão: remonta o leitor QR (divId único) após soltar a câmera do preview de fotos
      setQrScannerSession((s) => s + 1)
      setQrCameraActive(false)
      setQrFotosPhase("scan")
    } catch (e: unknown) {
      if (isRlsPermissionError(e as { code?: string; message?: string })) {
        alert(crmPermissionHint("salvar fotos do produto"))
      } else {
        alert("Erro ao salvar fotos: " + humanErrorMessage(e))
      }
    } finally {
      setPhotoUploading(false)
    }
  }, [qrScannedProduct, capturedPhotos, atendente?.id])

  const cancelQrConfirm = useCallback(() => {
    setQrScannedProduct(null)
    setQrLastScannedCode("")
    setQrScannerSession((s) => s + 1)
    setQrCameraActive(false)
    setQrFotosPhase("scan")
  }, [])

  const cancelQrPhotos = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    setCapturedPhotos([])
    setQrScannedProduct(null)
    setQrLastScannedCode("")
    setPhotoProduto(null)
    setQrScannerSession((s) => s + 1)
    setQrCameraActive(false)
    setQrFotosPhase("scan")
  }, [])

  const handleSkuPasteLookup = useCallback(async () => {
    const skus = skuPasteText
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (skus.length === 0) return
    setSkuPasteLoading(true)
    setSkuPasteResults([])
    setSkuPasteNotFound([])
    try {
      const found: { produto: any; qty: number }[] = []
      const notFound: string[] = []
      await Promise.all(
        skus.map(async (sku) => {
          try {
            const items = await estoqueApi.buscarProdutos({ exact_code: sku, limit: 1 })
            const exact = items.find((p) => String(p.sku).trim() === sku.trim())
            if (exact) found.push({ produto: exact, qty: 1 })
            else notFound.push(sku)
          } catch {
            notFound.push(sku)
          }
        })
      )
      // mantém a ordem dos SKUs colados
      const ordered = skus
        .map((sku) => found.find((f) => String(f.produto.sku).trim() === sku.trim()))
        .filter(Boolean) as { produto: any; qty: number }[]
      setSkuPasteResults(ordered)
      setSkuPasteNotFound(notFound)
    } finally {
      setSkuPasteLoading(false)
    }
  }, [skuPasteText])

  const handleSkuPasteApplyBulkQty = useCallback(() => {
    const v = parseInt(skuPasteBulkQty, 10)
    if (isNaN(v) || v < 0) return
    setSkuPasteResults((prev) => prev.map((r) => ({ ...r, qty: v })))
  }, [skuPasteBulkQty])

  const handleSkuPasteSave = useCallback(async () => {
    if (skuPasteResults.length === 0) return
    setSkuPasteSaving(true)
    try {
      await Promise.all(
        skuPasteResults.map(({ produto, qty }) =>
          api.put(`/api/estoque/produtos/${produto.id}`, { estoque_atual: qty })
        )
      )
      // Atualiza localmente a lista principal se os produtos estiverem carregados
      setProdutos((prev) =>
        prev.map((p) => {
          const hit = skuPasteResults.find((r) => r.produto.id === p.id)
          return hit ? { ...p, estoque_atual: hit.qty } : p
        })
      )
      toast.success(`${skuPasteResults.length} produto(s) atualizados com sucesso!`)
      setShowSkuPasteModal(false)
      setSkuPasteText("")
      setSkuPasteResults([])
      setSkuPasteNotFound([])
      setSkuPasteBulkQty("")
    } catch (e: any) {
      toast.error("Erro ao salvar: " + (e?.message || "Tente novamente"))
    } finally {
      setSkuPasteSaving(false)
    }
  }, [skuPasteResults])

  const displayedCols = COLUMN_DEFS.filter((c) => visibleColumns.includes(c.key))

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/produtos")}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Package className="w-6 h-6" />
              Alteração em Massa
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Edite produtos em lote como em uma planilha
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 min-w-[200px] sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar SKU, nome, marca..."
              className="pl-9 h-10"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                searchTermRef.current = e.target.value
              }}
              onKeyDown={(e) => e.key === "Enter" && fetchProdutos(0)}
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => fetchProdutos(0)}>
            Buscar
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-amber-600 border-amber-200 hover:bg-amber-50"
            onClick={openQrFotosModal}
          >
            <QrCode className="w-4 h-4" />
            QR + Fotos
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-violet-600 border-violet-200 hover:bg-violet-50"
            onClick={() => {
              setShowSkuPasteModal(true)
              setSkuPasteText("")
              setSkuPasteResults([])
              setSkuPasteNotFound([])
              setSkuPasteBulkQty("")
            }}
          >
            <ClipboardList className="w-4 h-4" />
            Colar SKUs
          </Button>
          <div className="relative">
            <Button
              variant={showFilters ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="w-4 h-4 mr-1" />
              Filtros
            </Button>
            {showFilters && (
              <div className="absolute left-0 top-full mt-1 z-50 w-72 p-4 bg-card border rounded-lg shadow-lg space-y-3">
                <p className="text-xs font-bold text-muted-foreground">Ordenação</p>
                <select
                  value={filterOrdenacao}
                  onChange={(e) => setFilterOrdenacao(e.target.value as FilterOrdenacao)}
                  className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm"
                >
                  <option value="created_at_desc">Últimos cadastrados</option>
                  <option value="created_at_asc">Mais antigos primeiro</option>
                  <option value="sku">Por SKU</option>
                  <option value="nome">Por nome</option>
                </select>
                <p className="text-xs font-bold text-muted-foreground">Status</p>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
                  className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm"
                >
                  <option value="todos">Todos</option>
                  <option value="ativos">Ativos</option>
                  <option value="inativos">Inativos</option>
                </select>
                <p className="text-xs font-bold text-muted-foreground">Estoque</p>
                <select
                  value={filterEstoque}
                  onChange={(e) => setFilterEstoque(e.target.value as FilterEstoque)}
                  className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm"
                >
                  <option value="todos">Todos</option>
                  <option value="com_quantidade">Com quantidade</option>
                  <option value="zerado">Zerado</option>
                  <option value="baixo">Estoque baixo (≤5)</option>
                </select>
                <p className="text-xs font-bold text-muted-foreground">Anunciados</p>
                <select
                  value={filterAnunciado}
                  onChange={(e) => setFilterAnunciado(e.target.value as FilterAnunciado)}
                  className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm"
                >
                  <option value="todos">Todos</option>
                  <option value="anunciados">Anunciados (Loja/ML)</option>
                  <option value="nao_anunciados">Não anunciados</option>
                </select>
                <p className="text-xs font-bold text-muted-foreground">Preço</p>
                <select
                  value={filterPreco}
                  onChange={(e) => setFilterPreco(e.target.value as FilterPreco)}
                  className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm"
                >
                  <option value="todos">Todos</option>
                  <option value="zero">Preço = R$ 0,00</option>
                  <option value="maior_zero">Preço &gt; R$ 0,00</option>
                </select>
                <p className="text-xs font-bold text-muted-foreground">Vínculo Sucata</p>
                <select
                  value={filterSucata}
                  onChange={(e) => {
                    setFilterSucata(e.target.value as FilterSucata)
                    setFilterSucataId("todas")
                  }}
                  className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm"
                >
                  <option value="todos">Todos</option>
                  <option value="vinculados">Vinculados a sucata</option>
                  <option value="nao_vinculados">Não vinculados</option>
                </select>
                {filterSucata === "vinculados" && (
                  <>
                    <p className="text-xs font-bold text-muted-foreground">Sucata Específica</p>
                    <select
                      value={filterSucataId}
                      onChange={(e) => setFilterSucataId(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm"
                    >
                      <option value="todas">Todas as sucatas</option>
                      {sucatas.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.codigo} - {s.marca} {s.modelo} ({s.ano_modelo})
                        </option>
                      ))}
                    </select>
                  </>
                )}
                <p className="text-xs font-bold text-muted-foreground">Localização Pai</p>
                <select
                  value={filterParentLoc}
                  onChange={(e) => {
                    setFilterParentLoc(e.target.value)
                    setFilterChildLoc("todas")
                  }}
                  className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm"
                >
                  <option value="todas">Todas</option>
                  {localizacoes.filter(l => !l.parent_id).map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.sigla ? `${loc.sigla} - ${loc.nome}` : loc.nome}
                    </option>
                  ))}
                </select>

                {filterParentLoc !== "todas" && (
                  <>
                    <p className="text-xs font-bold text-muted-foreground mt-2">Sub-localização</p>
                    <select
                      value={filterChildLoc}
                      onChange={(e) => setFilterChildLoc(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm"
                    >
                      <option value="todas">Tudo dentro de "{localizacoes.find(l => l.id === filterParentLoc)?.nome}"</option>
                      {localizacoes.filter(l => l.parent_id === filterParentLoc).map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.sigla ? `${loc.sigla} - ${loc.nome}` : loc.nome}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>
            )}
          </div>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
              <span className="text-xs font-bold text-primary">{selectedIds.size} selecionados</span>
              <select
                value={bulkColumn}
                onChange={(e) => { setBulkColumn(e.target.value); setBulkValue(""); }}
                className="h-8 px-2 rounded border border-border bg-background text-xs font-medium"
              >
                <option value="categoria_id">Categoria</option>
                <optgroup label="Valores Numéricos">
                  {NUMERIC_COLUMNS.map((k) => {
                    const def = COLUMN_DEFS.find((c) => c.key === k)
                    return (
                      <option key={k} value={k}>
                        {def?.label || k}
                      </option>
                    )
                  })}
                </optgroup>
              </select>
              {bulkColumn === "categoria_id" ? (
                <select
                  value={bulkValue}
                  onChange={(e) => setBulkValue(e.target.value)}
                  className="h-8 px-2 rounded border border-border bg-background text-xs font-medium max-w-[200px]"
                >
                  <option value="">Selecione a categoria...</option>
                  {allCategories.map(c => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              ) : (
                <>
                  <select
                    value={bulkOp}
                    onChange={(e) => setBulkOp(e.target.value as "add" | "sub")}
                    className="h-8 px-2 rounded border border-border bg-background text-xs font-medium"
                  >
                    <option value="add">Aumentar (+)</option>
                    <option value="sub">Diminuir (−)</option>
                  </select>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="Valor"
                    value={bulkValue}
                    onChange={(e) => setBulkValue(e.target.value)}
                    className="h-8 w-20 text-xs"
                  />
                </>
              )}
              <Button variant="secondary" size="sm" className="h-8 gap-1 text-xs" onClick={handleBulkAdjust}>
                {bulkOp === "add" ? <Plus className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                Aplicar
              </Button>
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setSelectedIds(new Set()); setSelectedProductsMap({}); }}>
                Limpar
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs font-bold text-blue-700 hover:text-blue-800 hover:bg-blue-500/15 border-blue-200"
                onClick={handlePrintLabels}
              >
                <Printer className="w-3.5 h-3.5" />
                Imprimir
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs font-bold text-violet-700 hover:text-violet-800 hover:bg-violet-500/15 border-violet-200"
                onClick={() => setIsGerarCatalogoModalOpen(true)}
              >
                <Package className="w-3.5 h-3.5" />
                Gerar Catálogo
              </Button>
            </div>
          )}
          <div className="relative">
            <Button
              variant={showColumnPicker ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowColumnPicker(!showColumnPicker)}
            >
              <Settings2 className="w-4 h-4 mr-1" />
              Colunas
            </Button>
            {showColumnPicker && (
              <div className="absolute right-0 top-full mt-1 z-50 w-64 p-3 bg-card border rounded-lg shadow-lg">
                <p className="text-xs font-bold text-muted-foreground mb-2">Campos visíveis</p>
                <div className="max-h-48 overflow-y-auto space-y-1.5">
                  {COLUMN_DEFS.map((c) => (
                    <label
                      key={c.key}
                      className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-2 py-1"
                    >
                      <input
                        type="checkbox"
                        checked={visibleColumns.includes(c.key)}
                        onChange={() => toggleColumn(c.key)}
                        className="rounded"
                      />
                      <span className="text-sm">{c.label}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2 mb-1">Arraste a borda direita do cabeçalho para redimensionar colunas.</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs h-8"
                  onClick={() => {
                    const def: Record<string, number> = {}
                    COLUMN_DEFS.forEach((col) => { def[col.key] = parseMinWidth(col.minWidth) })
                    setColumnWidths(def)
                    saveColumnWidths(def)
                  }}
                >
                  Restaurar larguras padrão
                </Button>
              </div>
            )}
          </div>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span className="ml-1">Salvar</span>
            {hasChanges && (
              <Badge variant="secondary" className="ml-2 text-[10px]">
                {Object.keys(edits).length}
              </Badge>
            )}
          </Button>
        </div>
      </div>

      {/* Grid tipo planilha */}
      <Card className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <CardHeader className="py-3 shrink-0">
          <CardTitle className="text-sm font-medium">
            {totalCount} produto(s) — Página {page + 1} de {Math.ceil(totalCount / PAGE_SIZE) || 1}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-auto p-0">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm" style={{ tableLayout: "fixed" }}>
                <thead className="sticky top-0 bg-muted/80 z-10">
                  <tr>
                    <th className="border-b border-r px-1 py-2 text-center font-bold text-xs w-10">
                      <input
                        type="checkbox"
                        checked={produtos.length > 0 && selectedIds.size === produtos.length}
                        onChange={toggleSelectAll}
                        title="Selecionar todos"
                        className="rounded cursor-pointer"
                      />
                    </th>
                    <th className="border-b border-r px-2 py-2 text-left font-bold text-xs w-12">#</th>
                    <th className="border-b border-r px-1 py-2 text-center font-bold text-xs w-14" title="Fotos">📷</th>
                    <th className="border-b border-r px-1 py-2 text-center font-bold text-xs w-16">Foto</th>
                    {displayedCols.map((c) => {
                      const defaultW = parseMinWidth(c.minWidth)
                      const w = columnWidths[c.key] ?? defaultW
                      return (
                        <th
                          key={c.key}
                          className="border-b border-r px-2 py-2 text-left font-bold text-xs whitespace-nowrap relative group select-none"
                          style={{ width: w, minWidth: RESIZE_MIN }}
                        >
                          <span className="block truncate pr-1">{c.label}</span>
                          <div
                            role="separator"
                            aria-orientation="vertical"
                            className="absolute right-0 top-0 bottom-0 w-3 cursor-col-resize flex-shrink-0 touch-none flex items-center justify-center hover:bg-primary/20 active:bg-primary/30"
                            onMouseDown={(e) => { e.preventDefault(); startResize(c.key, e.clientX) }}
                            title="Arrastar para redimensionar coluna"
                          >
                            <span className="w-0.5 h-6 bg-muted-foreground/60 rounded-full group-hover:bg-primary" />
                          </div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {produtos.map((prod, idx) => (
                    <tr
                      key={prod.id}
                      className={cn(
                        "hover:bg-muted/30",
                        edits[prod.id] && "bg-emerald-50/50 dark:bg-emerald-950/20"
                      )}
                    >
                      <td className="border-b border-r px-1 py-0.5 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(prod.id)}
                          onChange={() => toggleSelectOne(prod.id)}
                          className="rounded cursor-pointer"
                        />
                      </td>
                      <td className="border-b border-r px-2 py-1 text-muted-foreground text-xs">
                        {page * PAGE_SIZE + idx + 1}
                      </td>
                      <td className="border-b border-r px-1 py-0.5 text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                          onClick={() => openPhotoModal(prod)}
                          title="Tirar fotos"
                        >
                          <Camera className="w-4 h-4" />
                        </Button>
                      </td>
                      <td className="border-b border-r px-1 py-0.5 text-center">
                        {prod.imagem_url ? (
                            <div 
                              className="relative w-10 h-10 mx-auto rounded overflow-hidden border cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() => {
                                const urls = galleryUrlsFromProduto(prod)
                                if (urls.length > 0) {
                                  setViewingProduct(prod)
                                  setViewingImages(urls)
                                  setViewingImageIdx(0)
                                  setImageRotations({})
                                }
                              }}
                            >
                              {temFotoDefeito(prod) && (
                                <div
                                  title="Este produto possui foto(s) de defeito"
                                  className="absolute -top-1 -right-1 bg-red-600 text-white rounded px-1 py-0.5 shadow-sm border border-red-700/50 flex items-center gap-0.5 z-10 scale-[0.6] origin-top-right"
                                >
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                  <span className="text-[9px] font-black uppercase tracking-wider">Defeito</span>
                                </div>
                              )}
                              <img
                                src={thumbUrl(prod.imagem_url)}
                                alt={prod.sku}
                                className="w-full h-full object-cover"
                                onError={imgFallbackToOriginal(prod.imagem_url)}
                              />
                          </div>
                        ) : (
                          <div className="w-10 h-10 mx-auto rounded border border-dashed border-muted flex items-center justify-center bg-muted/20">
                            <CameraOff className="w-4 h-4 text-muted-foreground/40" />
                          </div>
                        )}
                      </td>
                      {displayedCols.map((col) => {
                        const val = getCellValue(prod, col.key)
                        const isReadOnly = col.key === "created_at" || col.key === "mercadolivre"
                        const w = columnWidths[col.key] ?? parseMinWidth(col.minWidth)
                        return (
                          <td key={col.key} className="border-b border-r px-1 py-0.5 overflow-hidden" style={{ width: w, minWidth: RESIZE_MIN }}>
                            {col.key === "mercadolivre" ? (
                              <div className="flex flex-col gap-1 p-1 max-h-24 overflow-y-auto custom-scrollbar">
                                {prod.mercadolivre_product_links && prod.mercadolivre_product_links.length > 0 ? (
                                  prod.mercadolivre_product_links.map((link: any, lidx: number) => (
                                    <div key={lidx} className="flex items-center gap-1.5 text-[10px] leading-tight bg-muted/30 p-1 rounded border">
                                      <MLIcon size={12} className="flex-shrink-0" />
                                      <span className="font-semibold text-muted-foreground truncate flex-1" title={link.ml_nickname || "Conta"}>
                                        {link.ml_nickname || "Conta"}
                                      </span>
                                      <span className={cn(
                                        "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider flex-shrink-0",
                                        link.ml_status === "active" ? "bg-emerald-100 text-emerald-800 border border-emerald-200" :
                                        link.ml_status === "paused" ? "bg-amber-100 text-amber-800 border border-amber-200" :
                                        "bg-slate-100 text-slate-800 border border-slate-200"
                                      )} title={link.ml_status_detail || link.ml_status}>
                                        {link.ml_status === "active" ? "Ativo" : link.ml_status === "paused" ? "Pausado" : link.ml_status || "N/A"}
                                      </span>
                                    </div>
                                  ))
                                ) : (
                                  <span className="text-[10px] text-muted-foreground/60 italic p-1 flex items-center justify-center h-full">Não anunciado</span>
                                )}
                              </div>
                            ) : col.type === "select" && col.key === "categoria_id" ? (
                              <select
                                value={val || ""}
                                onChange={(e) => setCellValue(prod.id, col.key, e.target.value)}
                                className="w-full h-8 px-2 rounded-md border border-input bg-background text-sm focus:ring-1 focus:ring-ring focus:outline-none"
                              >
                                <option value="">Sem categoria</option>
                                {allCategories.map(c => (
                                  <option key={c.id} value={c.id}>{c.nome}</option>
                                ))}
                              </select>
                            ) : col.type === "boolean" ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setCellValue(prod.id, col.key, !val)
                                }
                                className={cn(
                                  "w-full flex items-center justify-center py-1.5 rounded",
                                  val
                                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50"
                                    : "bg-slate-100 text-slate-400 dark:bg-slate-800"
                                )}
                              >
                                {val ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                              </button>
                            ) : isReadOnly ? (
                              <span className="block py-2 px-1 text-xs text-muted-foreground">{val}</span>
                            ) : (
                              <Input
                                value={val}
                                onChange={(e) =>
                                  setCellValue(prod.id, col.key, e.target.value)
                                }
                                onBlur={(e) => {
                                  if (col.key === "nome" && e.target.value.length >= 5) {
                                    handleAutoEnrich(new Set([prod.id]))
                                  }
                                }}
                                className="h-8 text-xs border-0 rounded-none focus-visible:ring-1 bg-transparent"
                                type={col.type === "number" ? "number" : "text"}
                                step={col.type === "number" ? "any" : undefined}
                              />
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Paginação */}
      {totalCount > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => fetchProdutos(page - 1)}
          >
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            {page * PAGE_SIZE + 1} - {Math.min((page + 1) * PAGE_SIZE, totalCount)} de {totalCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={(page + 1) * PAGE_SIZE >= totalCount}
            onClick={() => fetchProdutos(page + 1)}
          >
            Próxima
          </Button>
        </div>
      )}

      {(showColumnPicker || showFilters) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setShowColumnPicker(false)
            setShowFilters(false)
          }}
          aria-hidden="true"
        />
      )}

      {/* Modal de fotos */}
      {!!photoProduto && !showQrFotosModal && (
        <div className="fixed inset-0 z-[200] bg-black flex flex-col">
          {/* Editor de Foto (Zoom e Rotação) */}
          {editingPhotoIndex !== null && capturedPhotos[editingPhotoIndex] && (
            <div className="fixed inset-0 z-[300] bg-black/95 flex flex-col items-center justify-center p-4 backdrop-blur-md">
              <div className="relative w-full max-w-2xl h-[70vh] flex items-center justify-center overflow-hidden">
                <img
                  src={URL.createObjectURL(capturedPhotos[editingPhotoIndex])}
                  className="max-w-full max-h-full object-contain shadow-2xl"
                  key={editingPhotoIndex + capturedPhotos[editingPhotoIndex].size}
                  alt="Editando foto"
                />
                <div className="absolute top-4 right-4">
                   <button onClick={() => setEditingPhotoIndex(null)} className="p-2 rounded-full bg-black/50 text-white border border-white/20">
                     <X className="w-6 h-6" />
                   </button>
                </div>
              </div>
              <div className="mt-8 flex flex-col items-center gap-6">
                <p className="text-white/60 text-sm">Clique no botão para virar a imagem</p>
                <div className="flex gap-4">
                  <Button
                    onClick={() => handleRotatePhoto(editingPhotoIndex!)}
                    disabled={isRotating}
                    className="gap-3 bg-white text-black hover:bg-white/90 rounded-full h-14 px-8 text-lg font-bold shadow-xl active:scale-95 transition-transform"
                  >
                    {isRotating ? <Loader2 className="w-6 h-6 animate-spin" /> : <RotateCw className="w-6 h-6" />}
                    Rotacionar 90º
                  </Button>
                  <Button
                    onClick={() => identifyPieceWithIA(capturedPhotos[editingPhotoIndex!])}
                    disabled={identifying}
                    className="gap-3 bg-indigo-600 text-white hover:bg-indigo-700 rounded-full h-14 px-8 text-lg font-bold shadow-xl active:scale-95 transition-transform"
                  >
                    {identifying ? <Loader2 className="w-6 h-6 animate-spin" /> : <Sparkles className="w-6 h-6" />}
                    Identificar com IA
                  </Button>
                  <Button
                    onClick={() => setEditingPhotoIndex(null)}
                    variant="outline"
                    className="text-white border-white/20 hover:bg-white/10 rounded-full h-14 px-8 text-lg"
                  >
                    Pronto
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Barra superior — nome do produto */}
          <div
            className="absolute top-0 left-0 right-0 z-10 flex items-center
            justify-between px-4 pt-10 py-3
            bg-gradient-to-b from-black/70 to-transparent"
          >
            <p className="text-white text-sm font-semibold truncate flex-1">
              {photoProduto?.sku} — {photoProduto?.nome?.slice(0, 35)}
            </p>
            <button
              onClick={closePhotoModal}
              className="text-white p-1 rounded-full bg-black/40 ml-2"
              type="button"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Vídeo fullscreen */}
          {!cameraFallback ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 w-full h-full flex items-center justify-center text-white/80 text-sm font-semibold text-center p-6">
              Câmera indisponível. Selecione fotos da galeria usando o botão “Escolher arquivos”.
            </div>
          )}

          {/* Miniaturas das fotos — barra lateral direita */}
          <div
            className="absolute right-2 top-16 bottom-32 z-10
            flex flex-col gap-1.5 overflow-y-auto w-16"
          >
            {capturedPhotos.map((blob, i) => (
              <div key={i} className="relative shrink-0 group">
                <img
                  src={URL.createObjectURL(blob)}
                  className="w-16 h-16 object-cover rounded-lg border-2 border-white/50 cursor-pointer active:scale-95 transition-transform"
                  alt={`Foto ${i + 1}`}
                  onClick={() => setEditingPhotoIndex(i)}
                />
                <button
                  onClick={(e) => { e.stopPropagation(); identifyPieceWithIA(blob); }}
                  disabled={identifying}
                  className="absolute bottom-1 left-1 w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow backdrop-blur-sm border border-white/20 active:scale-90 transition-transform disabled:opacity-50"
                  type="button"
                  title="Identificar com IA ML"
                >
                  {identifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleRotatePhoto(i); }}
                  className="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center shadow backdrop-blur-sm border border-white/20 active:rotate-90 transition-transform"
                  type="button"
                  title="Rotacionar 90º"
                >
                  <RotateCw className="w-3 h-3" />
                </button>
                <button
                  onClick={() => removeCapturedPhoto(i)}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full
                    bg-red-600 text-white flex items-center justify-center shadow"
                  type="button"
                  title="Apagar foto"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>

          {/* Barra inferior — botões principais */}
          <div
            className="absolute bottom-0 left-0 right-0 z-10
            bg-gradient-to-t from-black/80 to-transparent
            pb-8 px-4 pt-6"
          >
            {/* Contador de fotos */}
            <p className="text-white/70 text-xs text-center mb-3">
              {capturedPhotos.length}/{MAX_FOTOS} fotos
            </p>

            {/* Linha de botões: [Apagar todas] [TIRAR FOTO] [Salvar] */}
            <div className="flex items-center justify-center gap-4 mb-3 relative">
              {/* Botão Identificar última foto — Visibilidade Máxima */}
              {capturedPhotos.length > 0 && (
                <button
                  onClick={() => identifyPieceWithIA(capturedPhotos[capturedPhotos.length - 1])}
                  disabled={identifying}
                  className="absolute left-[15%] w-14 h-14 rounded-full bg-indigo-600 text-white flex flex-col items-center justify-center shadow-xl border-2 border-white/30 active:scale-95 transition-all text-[8px] font-bold gap-0.5 animate-in zoom-in duration-300"
                  type="button"
                >
                  {identifying ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-6 h-6 text-amber-300" />}
                  IA ML
                </button>
              )}

              {/* Botão Apagar todas — esquerda */}
              <button
                onClick={() => setCapturedPhotos([])}
                disabled={capturedPhotos.length === 0}
                className="w-12 h-12 rounded-full bg-white/20 border border-white/30
                  flex items-center justify-center text-white
                  disabled:opacity-30 active:scale-95 transition-transform"
                type="button"
              >
                <Trash2 className="w-5 h-5" />
              </button>

              {/* Botão TIRAR FOTO — centro, maior */}
              <button
                onClick={capturePhoto}
                disabled={capturedPhotos.length >= MAX_FOTOS}
                className="w-20 h-20 rounded-full bg-white border-4 border-white/50
                  shadow-lg flex items-center justify-center
                  disabled:opacity-40 active:scale-95 transition-transform"
                type="button"
              >
                <div className="w-16 h-16 rounded-full bg-white border-2 border-black/10" />
              </button>

              {/* Botão Salvar e próximo — direita */}
              <button
                onClick={() => savePhotosToProduct(photoProduto, true)}
                disabled={capturedPhotos.length === 0 || photoUploading}
                className="w-12 h-12 rounded-full bg-amber-500/80 border border-amber-400/50
                  flex items-center justify-center text-white
                  disabled:opacity-30 active:scale-95 transition-transform"
                type="button"
              >
                {photoUploading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <ChevronRight className="w-5 h-5" />
                )}
              </button>
            </div>

            {/* Linha secundária: [Salvar fotos] [Próximo (pular)] */}
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => savePhotosToProduct(photoProduto, false)}
                disabled={capturedPhotos.length === 0 || photoUploading}
                className="flex-1 max-w-[140px] py-2 rounded-xl bg-emerald-600/80
                  text-white text-sm font-medium flex items-center justify-center gap-1
                  disabled:opacity-30"
                type="button"
              >
                <Save className="w-4 h-4" />
                Salvar fotos
              </button>
              <button
                onClick={goToNextProduct}
                disabled={photoUploading}
                className="flex-1 max-w-[140px] py-2 rounded-xl bg-white/10 border
                  border-white/20 text-white text-sm flex items-center justify-center gap-1"
                type="button"
              >
                <ChevronRight className="w-4 h-4" />
                Próximo (pular)
              </button>
            </div>
          </div>

          {/* Mantém fallback de galeria sem mexer na lógica */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => onPickFiles(e.target.files)}
          />
        </div>
      )}

      {/* Modal QR + Fotos — fluxo rápido */}
      {showQrFotosModal && (
        <div className="fixed inset-0 z-[100] bg-background flex flex-col">
          <div className="flex items-center justify-between p-4 border-b shrink-0">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <QrCode className="w-5 h-5 text-amber-600" />
              QR + Fotos
            </h2>
            <Button variant="ghost" size="icon" onClick={closeQrFotosModal}>
              <X className="w-5 h-5" />
            </Button>
          </div>
          <div className="flex-1 overflow-auto p-4 flex flex-col min-h-0">
            {qrFotosPhase === "scan" && !isTransitioning && (
              <div className="space-y-4 max-w-md mx-auto w-full">
                <p className="text-sm font-semibold text-center text-foreground">Leia o QR Code da peça</p>
                <QrCameraScanner
                  key={`qr-fotos-massa-${qrScannerSession}`}
                  divId={`qr-fotos-massa-${qrScannerSession}`}
                  active={true}
                  onResult={handleQrScan}
                />
                <p className="text-[11px] text-muted-foreground text-center animate-pulse">
                  Aguardando leitura do código...
                </p>
              </div>
            )}
            {isTransitioning && (
              <div className="flex flex-col items-center justify-center h-64 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Identificando peça e preparando câmera...</p>
              </div>
            )}
            {qrFotosPhase === "confirm" && qrScannedProduct && (
              <div className="space-y-4 max-w-md mx-auto">
                <p className="text-sm font-bold text-center">Produto identificado</p>
                <div className="p-4 rounded-xl bg-muted/50 border">
                  <p className="font-black text-lg">{qrScannedProduct.sku}</p>
                  <p className="text-sm text-muted-foreground truncate">{qrScannedProduct.nome}</p>
                </div>
                <div className="flex gap-2">
                  <Button className="flex-1 gap-2 bg-amber-600 hover:bg-amber-700" onClick={confirmQrProduct}>
                    <Check className="w-4 h-4" />
                    Confirmar e tirar fotos
                  </Button>
                  <Button variant="outline" onClick={cancelQrConfirm}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
            {qrFotosPhase === "photos" && (
              <div className="fixed inset-0 z-[200] bg-black flex flex-col">
                {/* Barra superior — nome do produto */}
                <div
                  className="absolute top-0 left-0 right-0 z-10 flex items-center
                    justify-between px-4 pt-10 py-3
                    bg-gradient-to-b from-black/70 to-transparent"
                >
                  <p className="text-white text-sm font-semibold truncate flex-1">
                    {qrScannedProduct?.sku} — {qrScannedProduct?.nome?.slice(0, 35)}
                  </p>
                  <button
                    onClick={cancelQrPhotos}
                    className="text-white p-1 rounded-full bg-black/40 ml-2"
                    type="button"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Vídeo fullscreen */}
                {!cameraFallback ? (
                  <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 w-full h-full flex items-center justify-center text-white/80 text-sm font-semibold text-center p-6">
                    Câmera indisponível. Selecione fotos da galeria usando “Escolher arquivos”.
                  </div>
                )}

                {/* Miniaturas das fotos — barra lateral direita */}
                <div
                  className="absolute right-2 top-16 bottom-32 z-10
                    flex flex-col gap-1.5 overflow-y-auto w-16"
                >
                  {capturedPhotos.map((blob, i) => (
                    <div key={i} className="relative shrink-0 group">
                      <BlobImage
                        blob={blob}
                        className="w-16 h-16 object-cover rounded-lg border-2 border-white/50 cursor-pointer active:scale-95 transition-transform"
                        alt={`Foto ${i + 1}`}
                        onClick={() => setEditingPhotoIndex(i)}
                      />
                      <button
                        onClick={(e) => { e.stopPropagation(); identifyPieceWithIA(blob); }}
                        disabled={identifying}
                        className="absolute bottom-1 left-1 w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow backdrop-blur-sm border border-white/20 active:scale-90 transition-transform disabled:opacity-50"
                        type="button"
                        title="Identificar com IA ML"
                      >
                        {identifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRotatePhoto(i); }}
                        className="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center shadow backdrop-blur-sm border border-white/20 active:rotate-90 transition-transform"
                        type="button"
                        title="Rotacionar 90º"
                      >
                        <RotateCw className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => removeCapturedPhoto(i)}
                        className="absolute -top-1 -right-1 w-5 h-5 rounded-full
                          bg-red-600 text-white flex items-center justify-center shadow"
                        type="button"
                        title="Apagar foto"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Barra inferior — botões principais */}
                <div
                  className="absolute bottom-0 left-0 right-0 z-10
                    bg-gradient-to-t from-black/80 to-transparent
                    pb-8 px-4 pt-6"
                >
                  {/* Contador de fotos */}
                  <p className="text-white/70 text-xs text-center mb-3">
                    {capturedPhotos.length}/{MAX_FOTOS} fotos
                  </p>

                  {/* Linha de botões: [Apagar todas] [TIRAR FOTO] [Salvar] */}
                  <div className="flex items-center justify-center gap-4 mb-3 relative">
                    {/* Botão Identificar última foto — Visibilidade Máxima QR */}
                    {capturedPhotos.length > 0 && (
                      <button
                        onClick={() => identifyPieceWithIA(capturedPhotos[capturedPhotos.length - 1])}
                        disabled={identifying}
                        className="absolute left-[15%] w-14 h-14 rounded-full bg-indigo-600 text-white flex flex-col items-center justify-center shadow-xl border-2 border-white/30 active:scale-95 transition-all text-[8px] font-bold gap-0.5 animate-in zoom-in duration-300"
                        type="button"
                      >
                        {identifying ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-6 h-6 text-amber-300" />}
                        IA ML
                      </button>
                    )}

                    {/* Botão Apagar todas — esquerda */}
                    <button
                      onClick={() => setCapturedPhotos([])}
                      disabled={capturedPhotos.length === 0}
                      className="w-12 h-12 rounded-full bg-white/20 border border-white/30
                        flex items-center justify-center text-white
                        disabled:opacity-30 active:scale-95 transition-transform"
                      type="button"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>

                    {/* Botão Foto de Defeito — centro/esquerda */}
                    <button
                      onClick={() => setIsPartPhotoDefectOpen(true)}
                      disabled={capturedPhotos.length >= MAX_FOTOS}
                      className="w-16 h-16 rounded-full bg-red-600 border-4 border-red-500/50
                        shadow-lg flex items-center justify-center text-white
                        disabled:opacity-40 active:scale-95 transition-transform"
                      type="button"
                      title="Foto de Defeito"
                    >
                      <AlertTriangle className="w-8 h-8" />
                    </button>

                    {/* Botão TIRAR FOTO — centro, maior */}
                    <button
                      onClick={capturePhoto}
                      disabled={capturedPhotos.length >= MAX_FOTOS}
                      className="w-20 h-20 rounded-full bg-white border-4 border-white/50
                        shadow-lg flex items-center justify-center
                        disabled:opacity-40 active:scale-95 transition-transform"
                      type="button"
                    >
                      <div className="w-16 h-16 rounded-full bg-white border-2 border-black/10" />
                    </button>

                    {/* Botão Salvar — direita */}
                    <button
                      onClick={saveQrFotosAndContinue}
                      disabled={capturedPhotos.length === 0 || photoUploading}
                      className="w-12 h-12 rounded-full bg-emerald-600/80 border border-emerald-500/40
                        flex items-center justify-center text-white
                        disabled:opacity-30 active:scale-95 transition-transform"
                      type="button"
                    >
                      {photoUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    </button>
                  </div>

                  {/* Abaixo: botão "Cancelar" centralizado menor */}
                  <div className="flex justify-center">
                    <button
                      onClick={cancelQrPhotos}
                      disabled={photoUploading}
                      className="px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white text-sm"
                      type="button"
                    >
                      Cancelar
                    </button>
                  </div>

                  {/* Mantém fallback de galeria sem mexer na lógica */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => onPickFiles(e.target.files)}
                  />
                </div>

                <PartPhotoCameraModal
                  isOpen={isPartPhotoDefectOpen}
                  mode="defeito"
                  onClose={() => setIsPartPhotoDefectOpen(false)}
                  onSave={(files) => {
                    setCapturedPhotos((prev) => [...prev, ...files])
                    setIsPartPhotoDefectOpen(false)
                  }}
                />
              </div>
            )}
            {qrFotosPhase === "saved" && (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <CheckCircle2 className="w-16 h-16 text-emerald-500" />
                <p className="text-lg font-bold text-center">{qrSavedMessage}</p>
                <p className="text-sm text-muted-foreground">Aguardando próximo QR...</p>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Modal de Resultados da IA */}
      {mlIdentification && (
        <Modal
          isOpen={true}
          title="Identificação de Peça (IA Mercado Livre)"
          onClose={() => setMlIdentification(null)}
        >
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
            <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
              <h4 className="text-sm font-bold text-indigo-900 mb-1 flex items-center gap-2">
                 <Sparkles className="w-4 h-4" />
                 Título Sugerido
              </h4>
              <p className="text-indigo-800 font-medium">{mlIdentification.title}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-[10px] uppercase font-bold text-muted-foreground">ID Categoria</p>
                <p className="text-sm font-mono">{mlIdentification.category_id}</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-[10px] uppercase font-bold text-muted-foreground">ID Domínio</p>
                <p className="text-sm font-mono">{mlIdentification.domain_id}</p>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-bold mb-2 flex items-center gap-2">
                 <Wand2 className="w-4 h-4" />
                 Atributos Detectados
              </h4>
              <div className="space-y-1.5">
                {mlIdentification.attributes?.map((attr: any) => (
                  <div key={attr.id} className="flex items-center justify-between p-2 text-xs border rounded-lg bg-card">
                    <span className="text-muted-foreground">{attr.name}:</span>
                    <span className="font-bold">{attr.value_name}</span>
                  </div>
                ))}
                {(!mlIdentification.attributes || mlIdentification.attributes.length === 0) && (
                  <p className="text-xs text-muted-foreground italic">Nenhum atributo específico detalhado.</p>
                )}
              </div>
            </div>

            <div className="pt-4 border-t sticky bottom-0 bg-background pb-2">
              <Button 
                 className="w-full bg-emerald-600 hover:bg-emerald-700"
                 onClick={() => {
                    // Aplica o título e fecha
                    if (photoProduto) {
                      setCellValue(photoProduto.id, "nome", mlIdentification.title);
                    }
                    setMlIdentification(null);
                 }}
              >
                Aplicar Título Sugerido
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Colar SKUs */}
      {showSkuPasteModal && (
        <Modal
          isOpen={true}
          title="Colar SKUs e Editar Quantidade"
          onClose={() => setShowSkuPasteModal(false)}
        >
          <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
            {skuPasteResults.length === 0 ? (
              /* Fase 1: colar SKUs */
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Cole os códigos SKU abaixo (um por linha, ou separados por vírgula/ponto e vírgula).
                </p>
                <textarea
                  className="w-full h-40 p-3 rounded-lg border border-border bg-background text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder={"123\n1256\n12345\n1258"}
                  value={skuPasteText}
                  onChange={(e) => setSkuPasteText(e.target.value)}
                  autoFocus
                />
                <Button
                  className="w-full gap-2"
                  onClick={handleSkuPasteLookup}
                  disabled={skuPasteLoading || !skuPasteText.trim()}
                >
                  {skuPasteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  Identificar Produtos
                </Button>
              </div>
            ) : (
              /* Fase 2: lista de produtos + editor de quantidade */
              <div className="space-y-4">
                {/* Barra de quantidade em massa */}
                <div className="flex items-center gap-2 p-3 rounded-lg bg-violet-50 border border-violet-200">
                  <span className="text-sm font-medium text-violet-700 whitespace-nowrap">
                    Definir quantidade para todos:
                  </span>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="Ex: 1"
                    value={skuPasteBulkQty}
                    onChange={(e) => setSkuPasteBulkQty(e.target.value)}
                    className="h-8 w-24 text-sm"
                    onKeyDown={(e) => e.key === "Enter" && handleSkuPasteApplyBulkQty()}
                  />
                  <Button size="sm" variant="secondary" className="h-8 gap-1" onClick={handleSkuPasteApplyBulkQty}>
                    <Check className="w-3 h-3" />
                    Aplicar
                  </Button>
                  <div className="flex gap-1 ml-auto">
                    {[1, 2, 3, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setSkuPasteResults((prev) => prev.map((r) => ({ ...r, qty: n })))}
                        className="px-2 py-1 text-xs rounded border border-violet-300 bg-white text-violet-700 hover:bg-violet-100 font-bold"
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Lista de produtos encontrados */}
                <div className="space-y-2">
                  {skuPasteResults.map(({ produto, qty }, idx) => (
                    <div
                      key={produto.id}
                      className="flex items-center gap-3 p-2 rounded-lg border border-border bg-card"
                    >
                      {/* Imagem */}
                      <div className="w-12 h-12 rounded-md overflow-hidden bg-muted flex-shrink-0 border border-border">
                        {produto.imagem_url ? (
                          <img
                            src={thumbUrl(produto.imagem_url)}
                            alt={produto.nome}
                            className="w-full h-full object-cover"
                            onError={imgFallbackToOriginal(produto.imagem_url)}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package className="w-5 h-5 text-muted-foreground/40" />
                          </div>
                        )}
                      </div>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-muted-foreground">SKU {produto.sku}</p>
                        <p className="text-sm font-medium truncate">{produto.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          R$ {Number(produto.preco || 0).toFixed(2).replace(".", ",")}
                          {produto.estoque_atual != null && (
                            <span className="ml-2 opacity-60">
                              · Estoque atual: {produto.estoque_atual}
                            </span>
                          )}
                        </p>
                      </div>
                      {/* Input de quantidade */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setSkuPasteResults((prev) =>
                              prev.map((r, i) => (i === idx ? { ...r, qty: Math.max(0, r.qty - 1) } : r))
                            )
                          }
                          className="w-7 h-7 rounded border border-border bg-muted flex items-center justify-center hover:bg-muted/80"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          value={qty}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10)
                            setSkuPasteResults((prev) =>
                              prev.map((r, i) => (i === idx ? { ...r, qty: isNaN(v) ? 0 : v } : r))
                            )
                          }}
                          className="h-7 w-16 text-center text-sm p-1"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setSkuPasteResults((prev) =>
                              prev.map((r, i) => (i === idx ? { ...r, qty: r.qty + 1 } : r))
                            )
                          }
                          className="w-7 h-7 rounded border border-border bg-muted flex items-center justify-center hover:bg-muted/80"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setSkuPasteResults((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="w-7 h-7 rounded border border-red-200 bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100 ml-1"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* SKUs não encontrados */}
                {skuPasteNotFound.length > 0 && (
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-amber-700">
                        {skuPasteNotFound.length} SKU(s) não encontrado(s):
                      </p>
                      <p className="text-xs text-amber-600 font-mono mt-0.5">
                        {skuPasteNotFound.join(", ")}
                      </p>
                    </div>
                  </div>
                )}

                {/* Ações */}
                <div className="flex gap-2 pt-2 sticky bottom-0 bg-background pb-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => {
                      setSkuPasteResults([])
                      setSkuPasteNotFound([])
                    }}
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Voltar
                  </Button>
                  <Button
                    className="flex-1 gap-2 bg-violet-600 hover:bg-violet-700"
                    onClick={handleSkuPasteSave}
                    disabled={skuPasteSaving || skuPasteResults.length === 0}
                  >
                    {skuPasteSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    Salvar Estoque ({skuPasteResults.length} produto{skuPasteResults.length !== 1 ? "s" : ""})
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Modal de visualização de imagem em tamanho grande (Carrossel/Galeria) */}
      {viewingImages.length > 0 && (
        <div 
          className="fixed inset-0 z-[300] bg-black/90 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => { setViewingImages([]); setViewingProduct(null); }}
        >
          <div 
            className="relative max-w-5xl max-h-[85vh] w-full flex items-center justify-center select-none" 
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute -top-12 left-0 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs text-white bg-white/10 hover:bg-white/20 border-white/20"
                onClick={() => {
                  const currentUrl = viewingImages[viewingImageIdx]
                  if (currentUrl) {
                    setImageRotations((prev) => ({
                      ...prev,
                      [currentUrl]: ((prev[currentUrl] || 0) + 90) % 360,
                    }))
                  }
                }}
              >
                <RotateCw className="w-3.5 h-3.5" />
                Girar 90°
              </Button>
              {Object.values(imageRotations).some((r) => r > 0) && (
                <Button
                  variant="default"
                  size="sm"
                  className="h-8 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white animate-in fade-in zoom-in-95 duration-150"
                  onClick={handleSaveRotations}
                  disabled={savingRotations}
                >
                  {savingRotations ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  Salvar Rotações
                </Button>
              )}
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="absolute -top-12 right-0 text-white hover:bg-white/20"
              onClick={() => { setViewingImages([]); setViewingProduct(null); }}
            >
              <X className="w-8 h-8" />
            </Button>

            {viewingImages.length > 1 && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute left-2 z-[310] text-white hover:bg-white/20 bg-black/40 rounded-full h-12 w-12"
                  onClick={() => setViewingImageIdx((prev) => (prev === 0 ? viewingImages.length - 1 : prev - 1))}
                >
                  <ChevronLeft className="w-8 h-8" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 z-[310] text-white hover:bg-white/20 bg-black/40 rounded-full h-12 w-12"
                  onClick={() => setViewingImageIdx((prev) => (prev === viewingImages.length - 1 ? 0 : prev + 1))}
                >
                  <ChevronRight className="w-8 h-8" />
                </Button>
              </>
            )}

            <img 
              src={viewingImages[viewingImageIdx]} 
              alt="Visualização do produto" 
              className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-2xl transition-transform duration-200"
              style={{ transform: `rotate(${imageRotations[viewingImages[viewingImageIdx]] || 0}deg)` }}
            />

            {viewingImages.length > 1 && (
              <div className="absolute -bottom-10 left-0 right-0 flex justify-center gap-1.5">
                {viewingImages.map((_, i) => (
                  <button
                    key={i}
                    className={cn(
                      "w-2.5 h-2.5 rounded-full transition-all",
                      i === viewingImageIdx ? "bg-white scale-125" : "bg-white/50 hover:bg-white/80"
                    )}
                    onClick={() => setViewingImageIdx(i)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {isGerarCatalogoModalOpen && (
        <GerarCatalogoModal
          isOpen={isGerarCatalogoModalOpen}
          onClose={() => setIsGerarCatalogoModalOpen(false)}
          selectedProducts={Object.values(selectedProductsMap).filter(Boolean)}
          onSuccess={() => {
            setSelectedIds(new Set())
            setSelectedProductsMap({})
            setIsGerarCatalogoModalOpen(false)
            fetchProdutos(page)
          }}
        />
      )}


    </div>
  )
}
