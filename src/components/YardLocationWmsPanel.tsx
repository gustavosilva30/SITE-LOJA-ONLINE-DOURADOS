import { useState, useEffect, useMemo, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
    Plus,
    Search,
    MapPin,
    Layers,
    ChevronRight,
    Pencil,
    Printer,
    Trash2,
    ArrowRightLeft,
    Save,
    MoreVertical,
    CheckSquare,
    Package,
    Car,
    Eye,
    EyeOff,
} from "lucide-react"
import { isLocalizacaoSucataRow } from "@/lib/localizacaoSucata"
import { api } from "@/lib/api"
import { Select } from "@/components/ui/select"
import { Modal } from "@/components/ui/modal"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

type YardLocationWmsPanelProps = {
    /** Chamado após criar/editar/transferir/excluir localização (ex.: recarregar mapa). */
    onStructureChanged?: () => void
}

type PrintModalTarget = { kind: "single"; id: string } | { kind: "batch"; ids: string[] }

export function YardLocationWmsPanel({ onStructureChanged }: YardLocationWmsPanelProps) {
    const [locations, setLocations] = useState<any[]>([])
    const [filterLocationSearch, setFilterLocationSearch] = useState("")
    const [loading, setLoading] = useState(false)
    const [isMobile, setIsMobile] = useState(false)

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768)
        handleResize()
        window.addEventListener("resize", handleResize)
        return () => window.removeEventListener("resize", handleResize)
    }, [])

    const [newLocation, setNewLocation] = useState({ nome: "", sigla: "", descricao: "", parent_id: null as string | null, nivel: 1 })
    const [editingLocation, setEditingLocation] = useState<any | null>(null)
    const [editLocForm, setEditLocForm] = useState({ nome: "", sigla: "", descricao: "", nivel: 1 as number })
    const [isEditLocModalOpen, setIsEditLocModalOpen] = useState(false)
    const [addSubLocParent, setAddSubLocParent] = useState<any | null>(null)
    const [subLocForm, setSubLocForm] = useState({ nome: "", sigla: "", descricao: "" })
    const [isAddSubLocModalOpen, setIsAddSubLocModalOpen] = useState(false)
    const [printModalTarget, setPrintModalTarget] = useState<PrintModalTarget | null>(null)
    const [printDepth, setPrintDepth] = useState<1 | 2 | 3>(3)
    const [isPrintLocModalOpen, setIsPrintLocModalOpen] = useState(false)
    const [isTransferLocModalOpen, setIsTransferLocModalOpen] = useState(false)
    const [locToTransfer, setLocToTransfer] = useState<any | null>(null)
    const [transferDestParentId, setTransferDestParentId] = useState<string | null>(null)
    /** Transferência em lote a partir da seleção na árvore */
    const [transferBatchMode, setTransferBatchMode] = useState(false)
    const [selectedLocIds, setSelectedLocIds] = useState<Set<string>>(() => new Set())
    /** Expansão da árvore de destino nos modais de transferência */
    const [transferDestExpanded, setTransferDestExpanded] = useState<Set<string>>(() => new Set())
    const [productDestExpanded, setProductDestExpanded] = useState<Set<string>>(() => new Set())

    const [selectedLocationProducts, setSelectedLocationProducts] = useState<any[]>([])
    const [isProductListModalOpen, setIsProductListModalOpen] = useState(false)
    const [viewingLocationName, setViewingLocationName] = useState("")

    const [isTransferProductsModalOpen, setIsTransferProductsModalOpen] = useState(false)
    const [locToTransferProducts, setLocToTransferProducts] = useState<any | null>(null)
    const [transferProductsDestLocId, setTransferProductsDestLocId] = useState<string | null>(null)
    const [transferProductsLoading, setTransferProductsLoading] = useState(false)
    const [expandedLocIds, setExpandedLocIds] = useState<Set<string>>(() => new Set())

    /** Transferência em lote por lista de SKU → um destino */
    const [isSkuBatchTransferModalOpen, setIsSkuBatchTransferModalOpen] = useState(false)
    const [skuBatchText, setSkuBatchText] = useState("")
    const [skuBatchDestLocId, setSkuBatchDestLocId] = useState<string | null>(null)
    const [skuBatchDestExpanded, setSkuBatchDestExpanded] = useState<Set<string>>(() => new Set())
    const [skuBatchOp, setSkuBatchOp] = useState<null | "validate" | "transfer">(null)
    const [skuBatchResult, setSkuBatchResult] = useState<{
        ok: { id: string; sku: string; nome: string | null; localizacao_id: string | null; localizacao: string | null }[]
        missing: string[]
    } | null>(null)

    /** Locais automáticos de sucata (no veículo) podem ficar ocultos na árvore. */
    const [mostrarLocaisSucata, setMostrarLocaisSucata] = useState(false)

    const locationsForTree = useMemo(
        () => locations.filter((l) => mostrarLocaisSucata || !isLocalizacaoSucataRow(l)),
        [locations, mostrarLocaisSucata]
    )

    const qtdLocaisSucata = useMemo(
        () => locations.filter((l) => isLocalizacaoSucataRow(l)).length,
        [locations]
    )

    useEffect(() => {
        if (mostrarLocaisSucata) return
        setSelectedLocIds((prev) => {
            if (prev.size === 0) return prev
            const next = new Set<string>()
            for (const id of prev) {
                const loc = locations.find((l) => l.id === id)
                if (loc && !isLocalizacaoSucataRow(loc)) next.add(id)
            }
            return next
        })
    }, [mostrarLocaisSucata, locations])

    const getTrailingNum = (nome: string | null | undefined): string => {
        const n = (nome || "").trim().match(/(\d+)\s*$/)?.[1]
        return n || ""
    }

    const getNivelLabel = (nivel: number | null | undefined): string => {
        if (nivel === 1) return "Nível 1"
        if (nivel === 2) return "Nível 2"
        if (nivel === 3) return "Nível 3"
        return "—"
    }

    /** Nível existe só em localização pai (raiz, sem parent_id). Filhos não têm nivel no banco. */
    const isRootLocation = (loc: { parent_id?: string | null } | null | undefined) => !loc?.parent_id

    const nivelLabelForTree = (loc: any) => (isRootLocation(loc) ? getNivelLabel(loc.nivel) : "—")

    const displayLocLabel = (loc: { nome: string; sigla: string | null }) => {
        if (loc.sigla) return formatSiglaNum(loc.sigla, getTrailingNum(loc.nome))
        return loc.nome
    }

    const getLocBreadcrumbLabel = (locId: string): string => {
        const chain = buildLocChain(locId)
        return chain
            .map((s) => {
                const piece = formatSiglaNum(s.sigla, s.num)
                return piece || (s.nome || "").trim()
            })
            .filter(Boolean)
            .join(" > ")
    }

    /** Nível vem só da raiz; sobe a árvore até achar `nivel` preenchido. */
    const resolveNivelForLocation = (locId: string): number | null => {
        let cur = locations.find((l) => l.id === locId)
        let d = 0
        while (cur && d < 30) {
            if (cur.nivel != null && cur.nivel !== "") {
                const n = Number(cur.nivel)
                if (!isNaN(n) && n >= 1 && n <= 3) return n
            }
            if (!cur.parent_id) break
            cur = locations.find((l) => l.id === cur.parent_id)
            d++
        }
        return null
    }

    const openTransferProducts = (loc: any) => {
        setLocToTransferProducts(loc)
        setTransferProductsDestLocId(null)
        setProductDestExpanded(new Set())
        setIsTransferProductsModalOpen(true)
    }

    const handleTransferProducts = async () => {
        if (!locToTransferProducts?.id) return
        if (!transferProductsDestLocId) return alert("Selecione o destino.")
        if (transferProductsDestLocId === locToTransferProducts.id) return alert("O destino precisa ser diferente do local atual.")

        setTransferProductsLoading(true)
        try {
            const dest = locations.find((l) => l.id === transferProductsDestLocId)
            const destLabel = dest ? getLocBreadcrumbLabel(dest.id) : null

            const patch: Record<string, unknown> = { localizacao_id: transferProductsDestLocId }
            if (destLabel) patch.localizacao = destLabel

            const pageSize = 500
            let offset = 0
            const prodIds: string[] = []
            for (;;) {
                const res = await api.get(
                    `/api/estoque/produtos?painel=true&localizacao_id=${encodeURIComponent(locToTransferProducts.id)}&limit=${pageSize}&offset=${offset}`,
                )
                const items = Array.isArray(res?.items) ? res.items : []
                for (const row of items) {
                    if (row?.id) prodIds.push(String(row.id))
                }
                if (items.length < pageSize) break
                offset += pageSize
            }
            const chunkPut = 50
            for (let i = 0; i < prodIds.length; i += chunkPut) {
                await Promise.all(
                    prodIds.slice(i, i + chunkPut).map((pid) => api.put(`/api/estoque/produtos/${pid}`, patch)),
                )
            }

            setIsTransferProductsModalOpen(false)
            setLocToTransferProducts(null)
            setTransferProductsDestLocId(null)
            alert("Produtos transferidos com sucesso.")
        } catch (e: any) {
            alert("Erro ao transferir produtos: " + (e?.message || e))
        } finally {
            setTransferProductsLoading(false)
        }
    }

    const handlePrintProductLabels = async (locId: string, locNome: string) => {
        setLoading(true)
        try {
            const pageSize = 500
            let offset = 0
            const rows: any[] = []
            for (;;) {
                const res = await api.get(
                    `/api/estoque/produtos?painel=true&localizacao_id=${encodeURIComponent(locId)}&ordenar=sku&direcao=asc&limit=${pageSize}&offset=${offset}`,
                )
                const chunk = Array.isArray(res?.items) ? res.items : []
                rows.push(...chunk)
                if (chunk.length < pageSize) break
                offset += pageSize
            }

            const items = rows.filter((p: any) => p?.sku)
            if (items.length === 0) {
                alert("Nenhum produto com SKU neste local.")
                return
            }

            const pathFull = getLocBreadcrumbLabel(locId) || locNome || "LOCAL"
            const nv = resolveNivelForLocation(locId)
            const nivelTxt = nv === 1 ? "Nível 1" : nv === 2 ? "Nível 2" : nv === 3 ? "Nível 3" : ""
            const locLabel = nivelTxt ? `${pathFull} • ${nivelTxt}` : pathFull

            // Mesma etiqueta usada em Produtos.tsx (100mm x 50mm)
            const printWindow = window.open("", "_blank")
            if (!printWindow) return
            printWindow.document.write(
                '<html><head><title>Carregando etiquetas...</title></head><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;">Carregando etiquetas...</body></html>'
            )
            printWindow.document.close()

            const totalLabelsCount = items.reduce((sum: number, p: any) => sum + (p.estoque_atual > 0 ? p.estoque_atual : 1), 0)
            const QRCode = (await import("qrcode")).default
            const labelsHtml = await Promise.all(
                items.map(async (p: any) => {
                    const sku = String(p.sku)
                    const nome = String(p.nome || "")
                    const part = p.part_number ? String(p.part_number) : ""

                    const qrDataUrl = await QRCode.toDataURL(sku, {
                        width: 120,
                        margin: 1,
                        color: { dark: "#000000", light: "#ffffff" },
                    })

                    const singleLabel = `
          <div class="label">
            <div class="left">
              <div class="name">${nome}</div>
              <div class="location">&#128205; ${locLabel}</div>
              ${part ? `<div class="part">PN: ${part}</div>` : ""}
            </div>
            <div class="right">
              <img src="${qrDataUrl}" class="qr" alt="QR ${sku}" />
              <div class="sku">${sku}</div>
              <div class="qr-label">ESCANEIE</div>
            </div>
          </div>
        `
                    const qty = p.estoque_atual > 0 ? p.estoque_atual : 1
                    return Array(qty).fill(singleLabel).join("")
                })
            )

            printWindow.document.open()
            printWindow.document.write(`
      <html>
        <head>
          <title>Etiquetas — ${totalLabelsCount} etiqueta(s)</title>
          <style>
            @page {
              size: 100mm 50mm;
              margin: 0;
            }
            *, *::before, *::after { box-sizing: border-box; }
            body {
              margin: 0;
              padding: 0;
              font-family: Arial, Helvetica, sans-serif;
              background: #fff;
            }
            .label {
              width: 100mm;
              height: 50mm;
              padding: 4mm 4mm 3mm 4mm;
              display: flex;
              flex-direction: row;
              align-items: center;
              gap: 3mm;
              border: 1px dashed #aaa;
              page-break-after: always;
              overflow: hidden;
            }
            .left {
              flex: 1;
              display: flex;
              flex-direction: column;
              justify-content: center;
              gap: 2mm;
              overflow: hidden;
            }
            .right {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              flex-shrink: 0;
              gap: 1mm;
            }
            .sku {
              font-size: 22pt;
              font-weight: 900;
              letter-spacing: -0.5px;
              color: #000;
              line-height: 1.1;
            }
            .name {
              font-size: 9.75pt;
              font-weight: 600;
              color: #222;
              line-height: 1.15;
              word-wrap: break-word;
              overflow-wrap: break-word;
              white-space: normal;
              display: -webkit-box;
              -webkit-line-clamp: 6;
              -webkit-box-orient: vertical;
              overflow: hidden;
              max-height: 28mm;
            }
            .location {
              font-size: 8.5pt;
              font-weight: bold;
              color: #000;
              border-top: 1px solid #ccc;
              padding-top: 1.5mm;
              margin-top: 0.5mm;
              width: 100%;
              line-height: 1.15;
              white-space: normal;
              overflow-wrap: anywhere;
              word-break: break-word;
              display: -webkit-box;
              -webkit-line-clamp: 4;
              -webkit-box-orient: vertical;
              overflow: hidden;
            }
            .part {
              font-size: 7.5pt;
              color: #555;
              font-family: monospace;
            }
            .qr {
              width: 30mm;
              height: 30mm;
              display: block;
              border: 1px solid #ddd;
              border-radius: 2px;
            }
            .qr-label {
              font-size: 6pt;
              color: #888;
              text-align: center;
              letter-spacing: 0.5px;
              font-weight: bold;
            }
          </style>
        </head>
        <body>
          ${labelsHtml.join("")}
          <script>
            window.onload = () => {
              window.print();
              window.close();
            };
          <\/script>
        </body>
      </html>
    `)
            printWindow.document.close()
        } catch (e: any) {
            alert("Erro ao imprimir etiquetas: " + (e?.message || e))
        } finally {
            setLoading(false)
        }
    }

    const LocationActionsMenu = ({ loc }: { loc: any }) => {
        const label = displayLocLabel(loc)
        return (
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        title="Ações"
                        type="button"
                        onPointerDown={(e) => {
                            // Evita que o clique "vaze" para a linha (expandir/recolher) e feche o menu imediatamente.
                            e.stopPropagation()
                        }}
                        onClick={(e) => {
                            e.stopPropagation()
                        }}
                    >
                        <MoreVertical className="w-4 h-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[260px]">
                    <DropdownMenuItem onClick={() => openAddSubLoc(loc)}>
                        <Plus className="w-4 h-4 mr-2 text-emerald-600" /> Adicionar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openEditLocation(loc)}>
                        <Pencil className="w-4 h-4 mr-2 text-sky-600" /> Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void deleteLocation(loc.id)}>
                        <Trash2 className="w-4 h-4 mr-2 text-destructive" /> Deletar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openTransferLoc(loc)}>
                        <ArrowRightLeft className="w-4 h-4 mr-2 text-violet-600" /> Alterar vinculação do Local
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openTransferProducts(loc)}>
                        <ArrowRightLeft className="w-4 h-4 mr-2 text-violet-600" /> Alterar vinculação dos Produtos
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openPrintLoc(loc.id)}>
                        <Printer className="w-4 h-4 mr-2 text-orange-600" /> Imprimir Etiqueta do Local
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void handlePrintProductLabels(loc.id, label)}>
                        <Printer className="w-4 h-4 mr-2 text-slate-700" /> Imprimir Etiqueta dos Produtos
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void viewProductsInLocation(loc.id, label)}>
                        <Search className="w-4 h-4 mr-2 text-indigo-600" /> Produtos Relacionados
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        )
    }

    const fetchLocations = async () => {
        const out: any[] = []
        const pageSize = 1000
        let offset = 0
        for (;;) {
            try {
                const chunk = await api.get(`/api/localizacoes/?limit=${pageSize}&offset=${offset}`)
                const data = Array.isArray(chunk) ? chunk : []
                out.push(...data)
                if (data.length < pageSize) break
                offset += pageSize
            } catch (e: any) {
                alert("Erro ao carregar localizações: " + (e?.message || e))
                break
            }
        }
        setLocations(out)
    }

    const afterMutation = async () => {
        await fetchLocations()
        onStructureChanged?.()
    }

    useEffect(() => {
        void fetchLocations()
    }, [])

    const handleAddLocation = async () => {
        if (!newLocation.nome || !newLocation.sigla) return alert("Nome e Sigla são obrigatórios")
        const isRoot = !newLocation.parent_id
        setLoading(true)
        let row: Record<string, unknown>
        if (isRoot) {
            const nivelFinal = newLocation.nivel
            if (nivelFinal < 1 || nivelFinal > 3) {
                setLoading(false)
                return alert("Nível inválido. Use 1, 2 ou 3.")
            }
            row = {
                nome: newLocation.nome,
                sigla: newLocation.sigla,
                descricao: newLocation.descricao || null,
                parent_id: null,
                nivel: nivelFinal,
            }
        } else {
            row = {
                nome: newLocation.nome,
                sigla: newLocation.sigla,
                descricao: newLocation.descricao || null,
                parent_id: newLocation.parent_id,
                nivel: null,
            }
        }
        try {
            await api.post("/api/localizacoes/", row)
            setNewLocation((prev) => ({
                nome: "",
                sigla: "",
                descricao: "",
                // Mantém o "Dentro de" selecionado para cadastrar várias sub-localizações em sequência.
                parent_id: prev.parent_id,
                // Se estiver na raiz, mantém o nível escolhido; se estiver dentro de um pai, nível não se aplica.
                nivel: prev.parent_id ? 1 : prev.nivel,
            }))
            await afterMutation()
        } catch (e: any) {
            alert("Erro ao salvar localização: " + (e?.message || e))
        }
        setLoading(false)
    }

    const openEditLocation = (loc: any) => {
        setEditingLocation(loc)
        const nv = Number(loc.nivel)
        const nivelInicial = nv >= 1 && nv <= 3 ? nv : 1
        setEditLocForm({ nome: loc.nome, sigla: loc.sigla || "", descricao: loc.descricao || "", nivel: nivelInicial })
        setIsEditLocModalOpen(true)
    }

    const handleEditLocation = async () => {
        if (!editLocForm.nome || !editLocForm.sigla) return alert("Nome e Sigla são obrigatórios")
        if (!editingLocation) return
        const isRoot = isRootLocation(editingLocation)
        if (isRoot) {
            const nv = Number(editLocForm.nivel)
            if (nv < 1 || nv > 3) return alert("Nível inválido. Use 1, 2 ou 3.")
        }
        setLoading(true)
        try {
            await api.put(`/api/localizacoes/${editingLocation.id}`, {
                nome: editLocForm.nome,
                sigla: editLocForm.sigla,
                descricao: editLocForm.descricao || null,
                nivel: isRoot ? editLocForm.nivel : null,
            })
            setIsEditLocModalOpen(false)
            setEditingLocation(null)
            await afterMutation()
        } catch (e: any) {
            alert("Erro ao editar: " + (e?.message || e))
        }
        setLoading(false)
    }

    const openAddSubLoc = (parentLoc: any) => {
        setAddSubLocParent(parentLoc)
        setSubLocForm({ nome: "", sigla: "", descricao: "" })
        setIsAddSubLocModalOpen(true)
    }

    const handleAddSubLoc = async () => {
        if (!subLocForm.nome || !subLocForm.sigla) return alert("Nome e Sigla são obrigatórios")
        if (!addSubLocParent) return
        setLoading(true)
        try {
            await api.post("/api/localizacoes/", {
                nome: subLocForm.nome,
                sigla: subLocForm.sigla,
                descricao: subLocForm.descricao || null,
                parent_id: addSubLocParent.id,
                nivel: null,
            })
            setIsAddSubLocModalOpen(false)
            setAddSubLocParent(null)
            await afterMutation()
        } catch (e: any) {
            alert("Erro ao adicionar: " + (e?.message || e))
        }
        setLoading(false)
    }

    const collectDescendantIds = useCallback((rootId: string): Set<string> => {
        const out = new Set<string>()
        const stack = [rootId]
        while (stack.length) {
            const id = stack.pop()!
            for (const l of locations) {
                if (l.parent_id === id) {
                    out.add(l.id)
                    stack.push(l.id)
                }
            }
        }
        return out
    }, [locations])

    const getExcludedIdsForTransferSources = useCallback(
        (sourceIds: string[]) => {
            const ex = new Set<string>()
            for (const sid of sourceIds) {
                ex.add(sid)
                collectDescendantIds(sid).forEach((id) => ex.add(id))
            }
            return ex
        },
        [collectDescendantIds],
    )

    const depthOf = useCallback((locId: string): number => {
        let d = 0
        let cur = locations.find((l) => l.id === locId)
        while (cur?.parent_id) {
            d++
            cur = locations.find((l) => l.id === cur!.parent_id)
        }
        return d
    }, [locations])

    const toggleTransferDestExpand = useCallback((id: string) => {
        setTransferDestExpanded((prev) => {
            const n = new Set(prev)
            if (n.has(id)) n.delete(id)
            else n.add(id)
            return n
        })
    }, [])

    const toggleProductDestExpand = useCallback((id: string) => {
        setProductDestExpanded((prev) => {
            const n = new Set(prev)
            if (n.has(id)) n.delete(id)
            else n.add(id)
            return n
        })
    }, [])

    const toggleSkuBatchDestExpand = useCallback((id: string) => {
        setSkuBatchDestExpanded((prev) => {
            const n = new Set(prev)
            if (n.has(id)) n.delete(id)
            else n.add(id)
            return n
        })
    }, [])

    const parseSkuList = (text: string): string[] => {
        const parts = text
            .split(/[\n,;\t]+/)
            .map((s) => s.trim())
            .filter(Boolean)
        return [...new Set(parts)]
    }

    const fetchProdutosBySkuList = async (skus: string[]) => {
        const out: { id: string; sku: string; nome: string | null; localizacao_id: string | null; localizacao: string | null }[] = []
        const seenId = new Set<string>()
        const rows = await Promise.all(
            skus.map(async (sku) => {
                try {
                    const data = await api.get(
                        `/api/estoque/produtos/busca?exact_code=${encodeURIComponent(sku)}&limit=3`,
                    )
                    const arr = Array.isArray(data) ? data : []
                    return arr[0] as any
                } catch {
                    return null
                }
            }),
        )
        for (const r of rows) {
            if (r?.id && !seenId.has(r.id)) {
                seenId.add(r.id)
                out.push({
                    id: r.id,
                    sku: String(r.sku ?? ""),
                    nome: r.nome ?? null,
                    localizacao_id: r.localizacao_id ?? null,
                    localizacao: r.localizacao ?? null,
                })
            }
        }
        return out
    }

    const openSkuBatchTransferModal = () => {
        setSkuBatchText("")
        setSkuBatchDestLocId(null)
        setSkuBatchDestExpanded(new Set())
        setSkuBatchResult(null)
        setIsSkuBatchTransferModalOpen(true)
    }

    const handleSkuBatchValidate = async () => {
        const skus = parseSkuList(skuBatchText)
        if (skus.length === 0) {
            alert("Informe pelo menos um SKU (um por linha ou separados por vírgula).")
            return
        }
        setSkuBatchOp("validate")
        try {
            const rows = await fetchProdutosBySkuList(skus)
            const foundSku = new Set(rows.map((r) => String(r.sku)))
            const missing = skus.filter((s) => !foundSku.has(String(s)))
            setSkuBatchResult({ ok: rows, missing })
        } catch (e: any) {
            alert("Erro ao buscar produtos: " + (e?.message || e))
        } finally {
            setSkuBatchOp(null)
        }
    }

    const handleSkuBatchTransfer = async () => {
        if (!skuBatchDestLocId) {
            alert("Selecione o local de destino.")
            return
        }
        if (!skuBatchResult?.ok?.length) {
            alert("Valide a lista de SKUs e confira se há produtos encontrados.")
            return
        }
        const dest = locations.find((l) => l.id === skuBatchDestLocId)
        const destLabel = dest ? getLocBreadcrumbLabel(dest.id) : null
        const ids = skuBatchResult.ok.map((p) => p.id)

        setSkuBatchOp("transfer")
        try {
            const patch: Record<string, unknown> = { localizacao_id: skuBatchDestLocId }
            if (destLabel) patch.localizacao = destLabel

            const chunkSize = 50
            for (let i = 0; i < ids.length; i += chunkSize) {
                const chunk = ids.slice(i, i + chunkSize)
                await Promise.all(chunk.map((id) => api.put(`/api/estoque/produtos/${id}`, patch)))
            }

            setIsSkuBatchTransferModalOpen(false)
            setSkuBatchText("")
            setSkuBatchDestLocId(null)
            setSkuBatchResult(null)
            alert(`${ids.length} produto(s) transferido(s) com sucesso.`)
            onStructureChanged?.()
        } catch (e: any) {
            alert("Erro ao transferir: " + (e?.message || e))
        } finally {
            setSkuBatchOp(null)
        }
    }

    const openTransferLoc = (loc: any) => {
        setTransferBatchMode(false)
        setLocToTransfer(loc)
        setTransferDestParentId(loc.parent_id)
        setTransferDestExpanded(new Set())
        setIsTransferLocModalOpen(true)
    }

    const openBatchTransferFromSelection = () => {
        if (selectedLocIds.size === 0) return
        setTransferBatchMode(true)
        setLocToTransfer(null)
        setTransferDestParentId(null)
        setTransferDestExpanded(new Set())
        setIsTransferLocModalOpen(true)
    }

    const selectAllLocations = () => {
        setSelectedLocIds(new Set(locationsForTree.map((l) => l.id)))
    }

    const clearLocationSelection = () => {
        setSelectedLocIds(new Set())
    }

    const toggleLocationRowSelected = (id: string, checked: boolean) => {
        setSelectedLocIds((prev) => {
            const n = new Set(prev)
            if (checked) n.add(id)
            else n.delete(id)
            return n
        })
    }

    const handleTransferLoc = async () => {
        const newParentId = transferDestParentId ?? null

        if (transferBatchMode) {
            const ids = Array.from(selectedLocIds)
            if (ids.length === 0) return
            const ex = getExcludedIdsForTransferSources(ids)
            if (newParentId !== null && ex.has(newParentId)) {
                alert("Destino inválido: não pode ser um dos locais selecionados nem um sub-local deles.")
                return
            }
            const sorted = [...ids].sort((a, b) => depthOf(b) - depthOf(a))
            setLoading(true)
            try {
                for (const id of sorted) {
                    const loc = locations.find((l) => l.id === id)
                    if (!loc) continue
                    await api.put(`/api/localizacoes/${id}`, {
                        parent_id: newParentId,
                        nivel: newParentId ? null : loc.nivel ?? 1,
                    })
                }
                setIsTransferLocModalOpen(false)
                setTransferBatchMode(false)
                setTransferDestParentId(null)
                setTransferDestExpanded(new Set())
                clearLocationSelection()
                await afterMutation()
                alert(`${sorted.length} localização(ões) transferida(s) com sucesso.`)
            } catch (e: any) {
                alert("Erro ao transferir: " + (e.message || e))
            } finally {
                setLoading(false)
            }
            return
        }

        if (!locToTransfer) return
        const ex = getExcludedIdsForTransferSources([locToTransfer.id])
        if (newParentId !== null && ex.has(newParentId)) {
            alert("Destino inválido: escolha outro local (não pode ser o próprio nem um filho dele).")
            return
        }
        setLoading(true)
        try {
            await api.put(`/api/localizacoes/${locToTransfer.id}`, {
                parent_id: newParentId,
                nivel: newParentId ? null : locToTransfer.nivel ?? 1,
            })
            setIsTransferLocModalOpen(false)
            setLocToTransfer(null)
            setTransferDestParentId(null)
            setTransferBatchMode(false)
            setTransferDestExpanded(new Set())
            await afterMutation()
            alert("Localização transferida com sucesso.")
        } catch (e: any) {
            alert("Erro ao transferir: " + (e.message || e))
        } finally {
            setLoading(false)
        }
    }

    const buildLocChain = (locId: string): { sigla: string; nome: string; num: string }[] => {
        const chain: { sigla: string; nome: string; num: string }[] = []
        let current = locations.find((l) => l.id === locId)
        let depth = 0
        // Aumenta o limite para suportar hierarquias mais profundas.
        while (current && depth < 30) {
            chain.unshift({ sigla: current.sigla || "", nome: current.nome, num: "" })
            if (!current.parent_id) break
            current = locations.find((l) => l.id === current!.parent_id)
            depth++
        }
        // Número de cada nível vem do `nome` da própria linha (evita descasar com o filho final).
        return chain.map((item) => {
            const num = (item.nome || "").match(/(\d+)\s*$/)?.[1] || ""
            return { ...item, num }
        })
    }

    const formatSiglaNum = (siglaRaw: string, num: string) => {
        const sigla = (siglaRaw || "").trim()
        if (!sigla) return ""
        // Se a sigla já tiver número no fim (ex.: "sala 1"), não duplicar (evita "sala 11").
        if (/\d+\s*$/.test(sigla)) return sigla
        return num ? `${sigla} ${num}` : sigla
    }

    const openPrintLoc = (locId: string) => {
        setPrintModalTarget({ kind: "single", id: locId })
        const chain = buildLocChain(locId)
        setPrintDepth(chain.length >= 3 ? 3 : chain.length >= 2 ? 2 : 1)
        setIsPrintLocModalOpen(true)
    }

    const openBatchPrintFromSelection = () => {
        if (selectedLocIds.size === 0) return
        const ids = Array.from(selectedLocIds)
        setPrintModalTarget({ kind: "batch", ids })
        const firstChain = buildLocChain(ids[0])
        setPrintDepth(firstChain.length >= 3 ? 3 : firstChain.length >= 2 ? 2 : 1)
        setIsPrintLocModalOpen(true)
    }

    const wrapLocationLabelDocument = (labelBodiesHtml: string, pageTitle: string, batch: boolean) => `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>${pageTitle}</title>
<style>
  @page { size: 100mm 50mm; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', 'Segoe UI', Arial, sans-serif; }
  body.single-print { background: #f3f4f6; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  body.batch-print { background: #f3f4f6; display: block; padding: 8px; }
  body.batch-print .label { page-break-after: always; margin-bottom: 10px; }
  body.batch-print .label:last-child { margin-bottom: 0; }
  .label {
    width: 100mm; height: 50mm; border: 3px solid #000000;
    border-radius: 4px; display: flex; align-items: stretch; overflow: hidden; background: white;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
  }
  .left {
    flex: 1; padding: 5mm 6mm;
    display: flex; flex-direction: column; justify-content: center;
    overflow: hidden;
  }
  .label-tag {
    font-size: 10px; color: #000000; font-weight: 800;
    text-transform: uppercase; letter-spacing: 2px; margin-bottom: 3mm;
    display: flex; align-items: center; gap: 4px;
    border-bottom: 1px solid #000000; padding-bottom: 1mm; width: fit-content;
  }
  .full-path { font-size: 9px; color: #666666; margin-top: 3mm; letter-spacing: 0.5px; font-weight: 500; }
  .right {
    width: 44mm; background: #ffffff; flex-shrink: 0;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    border-left: 2px dashed #000000; padding: 4mm;
  }
  .right img { width: 34mm; height: 34mm; margin-bottom: 2mm; }
  .scan { font-size: 10px; font-weight: 800; color: #000000; text-transform: uppercase; letter-spacing: 3px; }
  @media print {
    body { background: white; margin: 0; }
    body.batch-print { padding: 0; }
    .label { box-shadow: none; border-width: 2px; }
    body.batch-print .label:last-child { page-break-after: auto; }
  }
</style></head>
<body class="${batch ? "batch-print" : "single-print"}">
${labelBodiesHtml}
<script>window.onload=()=>{ setTimeout(()=>window.print(), 350); }<\/script>
</body></html>`

    const buildLocationLabelBlockHtml = async (locId: string, depth: 1 | 2 | 3): Promise<{ pathText: string; html: string } | null> => {
        const chain = buildLocChain(locId)
        if (chain.length === 0) return null
        const effectiveDepth = Math.min(depth, chain.length) as 1 | 2 | 3
        const slice = chain.slice(-effectiveDepth)
        const pathText = slice.map((s) => formatSiglaNum(s.sigla, s.num)).filter(Boolean).join(" > ")
        const fullPath = chain.map((s) => formatSiglaNum(s.sigla, s.num)).filter(Boolean).join(" > ")

        const segments = pathText.split(" > ")
        const totalSegs = segments.length
        const segHtml = segments
            .map((seg, i) => {
                const segLen = seg.length
                const fs =
                    totalSegs === 1
                        ? segLen <= 5
                            ? 58
                            : segLen <= 10
                              ? 48
                              : 38
                        : segLen <= 6
                          ? 42
                          : segLen <= 12
                            ? 32
                            : 24

                const color = "#000000"
                const marginBottom = i === totalSegs - 1 ? "0" : "1mm"

                return `<div style="font-size:${fs}px; font-weight:900; color:${color}; line-height:1; letter-spacing:-0.02em; margin-bottom:${marginBottom}; text-transform: uppercase;">${seg}</div>`
            })
            .join("")

        const QRCode = (await import("qrcode")).default
        const qr = await QRCode.toDataURL(fullPath, { width: 300, margin: 1, color: { dark: "#000000", light: "#ffffff" } })

        const html = `  <div class="label">
    <div class="left">
      <div class="label-tag">📍 LOCALIZAÇÃO</div>
      ${segHtml}
      ${effectiveDepth < chain.length ? `<div class="full-path">${fullPath}</div>` : ""}
    </div>
    <div class="right">
      <img src="${qr}" alt="QR" />
      <div class="scan">ESCANEIE</div>
    </div>
  </div>`

        return { pathText, html }
    }

    const handlePrintLoc = async (locId: string, depth: 1 | 2 | 3) => {
        const built = await buildLocationLabelBlockHtml(locId, depth)
        if (!built) return
        const win = window.open("", "_blank", "width=800,height=500")
        if (!win) return
        win.document.write(wrapLocationLabelDocument(built.html, `Etiqueta — ${built.pathText}`, false))
        win.document.close()
    }

    const handlePrintLocBatch = async (locIds: string[], depth: 1 | 2 | 3) => {
        setLoading(true)
        try {
            const parts: string[] = []
            for (const id of locIds) {
                const built = await buildLocationLabelBlockHtml(id, depth)
                if (built) parts.push(built.html)
            }
            if (parts.length === 0) {
                alert("Nenhuma etiqueta pôde ser gerada.")
                return
            }
            const win = window.open("", "_blank", "width=800,height=500")
            if (!win) return
            win.document.write(
                wrapLocationLabelDocument(
                    parts.join("\n"),
                    `Etiquetas — ${parts.length} localização(ões)`,
                    true,
                ),
            )
            win.document.close()
        } catch (e: any) {
            alert("Erro ao imprimir em lote: " + (e?.message || e))
        } finally {
            setLoading(false)
        }
    }

    const viewProductsInLocation = async (locId: string, locNome: string) => {
        setLoading(true)
        setViewingLocationName(locNome)
        try {
            const pageSize = 500
            let offset = 0
            const acc: any[] = []
            for (;;) {
                const res = await api.get(
                    `/api/estoque/produtos?painel=true&localizacao_id=${encodeURIComponent(locId)}&limit=${pageSize}&offset=${offset}`,
                )
                const chunk = Array.isArray(res?.items) ? res.items : []
                acc.push(...chunk)
                if (chunk.length < pageSize) break
                offset += pageSize
            }
            setSelectedLocationProducts(
                acc.map((p) => ({ sku: p.sku, nome: p.nome, estoque_atual: p.estoque_atual })),
            )
            setIsProductListModalOpen(true)
        } catch (e: any) {
            alert("Erro ao carregar produtos: " + (e?.message || e))
        }
        setLoading(false)
    }

    const deleteLocation = async (id: string) => {
        if (!confirm("Deseja realmente excluir esta localização?\n\nOs filhos NÃO serão apagados: eles ficarão na raiz.")) return
        try {
            const filhos = await api.get(`/api/localizacoes/?parent_id=${encodeURIComponent(id)}`)
            const rows = Array.isArray(filhos) ? filhos : []
            await Promise.all(rows.map((f: { id: string }) => api.put(`/api/localizacoes/${f.id}`, { parent_id: null })))
            await api.delete(`/api/localizacoes/${id}`)
            await afterMutation()
        } catch (e: any) {
            alert("Erro ao excluir: " + (e?.message || e))
        }
    }

    const childrenByParent = useMemo(() => {
        const map = new Map<string | null, any[]>()
        for (const l of locationsForTree) {
            const key = (l.parent_id ?? null) as string | null
            const arr = map.get(key) || []
            arr.push(l)
            map.set(key, arr)
        }
        // ordem estável
        for (const [k, arr] of map.entries()) {
            arr.sort((a, b) => String(a?.sigla || a?.nome || "").localeCompare(String(b?.sigla || b?.nome || ""), "pt-BR"))
            map.set(k, arr)
        }
        return map
    }, [locationsForTree])

    const orphanLocations = useMemo(() => {
        if (!locationsForTree.length) return []
        const ids = new Set(locationsForTree.map((l) => l.id))
        return locationsForTree.filter((l) => l.parent_id && !ids.has(l.parent_id))
    }, [locationsForTree])

    useEffect(() => {
        // Iniciar recolhido: apenas pastas principais visíveis.
        // (Em busca, a árvore expande automaticamente via `forceExpanded`.)
    }, [])

    const expandAll = () => {
        const parents = new Set<string>()
        for (const l of locationsForTree) {
            if (l.parent_id) parents.add(l.parent_id)
        }
        setExpandedLocIds(parents)
    }

    const collapseAll = () => {
        setExpandedLocIds(new Set())
    }

    const filteredRoots = useMemo(() => {
        const q = (filterLocationSearch || "").toLowerCase().trim()
        const roots = childrenByParent.get(null) || []
        if (!q) return roots
        const match = (loc: any) =>
            (loc?.nome || "").toLowerCase().includes(q) ||
            (loc?.sigla || "").toLowerCase().includes(q) ||
            (loc?.descricao || "").toLowerCase().includes(q)
        const hasMatchInTree = (loc: any): boolean => {
            if (match(loc)) return true
            const kids = childrenByParent.get(loc.id) || []
            return kids.some((c) => hasMatchInTree(c))
        }
        return roots.filter((r) => hasMatchInTree(r))
    }, [childrenByParent, filterLocationSearch])

    const matchesQuery = useCallback((loc: any) => {
        const q = (filterLocationSearch || "").toLowerCase().trim()
        if (!q) return true
        return (
            (loc?.nome || "").toLowerCase().includes(q) ||
            (loc?.sigla || "").toLowerCase().includes(q) ||
            (loc?.descricao || "").toLowerCase().includes(q)
        )
    }, [filterLocationSearch])

    const hasMatchInSubtree = useCallback((loc: any): boolean => {
        if (!filterLocationSearch) return true
        if (matchesQuery(loc)) return true
        const kids = childrenByParent.get(loc.id) || []
        return kids.some((c) => hasMatchInSubtree(c))
    }, [childrenByParent, filterLocationSearch, matchesQuery])

    const toggleExpanded = (id: string) => {
        setExpandedLocIds((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const renderTransferDestNodes = (parentKey: string | null, level: number, excludeIds: Set<string>) => {
        const raw = childrenByParent.get(parentKey) || []
        const nodes = raw.filter((l) => !excludeIds.has(l.id))
        if (nodes.length === 0) return null
        return (
            <div className={level > 0 ? "mt-1 space-y-0.5 border-l-2 border-violet-200/70 pl-2 ml-0.5" : "space-y-1"}>
                {nodes.map((loc: any) => {
                    const kidsRaw = childrenByParent.get(loc.id) || []
                    const kids = kidsRaw.filter((k: any) => !excludeIds.has(k.id))
                    const hasKids = kids.length > 0
                    const expanded = transferDestExpanded.has(loc.id)
                    const isSelected = transferDestParentId === loc.id
                    return (
                        <div key={loc.id}>
                            <div className="flex items-stretch gap-1">
                                <button
                                    type="button"
                                    className={`w-8 shrink-0 flex items-center justify-center rounded-md ${hasKids ? "hover:bg-muted text-orange-600" : "opacity-25 cursor-default"}`}
                                    onClick={(e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        if (hasKids) toggleTransferDestExpand(loc.id)
                                    }}
                                >
                                    {hasKids ? (
                                        <ChevronRight className={`w-4 h-4 transition-transform ${expanded ? "rotate-90" : ""}`} />
                                    ) : (
                                        <span className="w-4 inline-block" />
                                    )}
                                </button>
                                <button
                                    type="button"
                                    className={`flex-1 min-w-0 text-left rounded-xl border px-3 py-2 text-sm transition-all ${isSelected ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30 shadow-sm ring-1 ring-violet-200" : "border-border/70 hover:bg-muted/70"}`}
                                    onClick={() => setTransferDestParentId(loc.id)}
                                >
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-mono font-bold">{displayLocLabel(loc)}</span>
                                        <span className="text-[10px] font-bold text-muted-foreground">{nivelLabelForTree(loc)}</span>
                                    </div>
                                    {loc.nome ? (
                                        <div className="text-[10px] text-muted-foreground truncate" title={loc.nome}>
                                            {loc.nome}
                                        </div>
                                    ) : null}
                                </button>
                            </div>
                            {hasKids && expanded ? renderTransferDestNodes(loc.id, level + 1, excludeIds) : null}
                        </div>
                    )
                })}
            </div>
        )
    }

    type LocDestPickerCfg = {
        excludeId: string | null
        expanded: Set<string>
        toggleExpand: (id: string) => void
        selectedId: string | null
        onSelect: (id: string) => void
    }

    const renderLocDestPickerNodes = (parentKey: string | null, level: number, cfg: LocDestPickerCfg) => {
        const ex = cfg.excludeId
        const raw = childrenByParent.get(parentKey) || []
        const nodes = raw.filter((l) => (ex ? l.id !== ex : true))
        if (nodes.length === 0) return null
        return (
            <div className={level > 0 ? "mt-1 space-y-0.5 border-l-2 border-emerald-200/80 pl-2 ml-0.5" : "space-y-1"}>
                {nodes.map((loc: any) => {
                    const kidsRaw = childrenByParent.get(loc.id) || []
                    const kids = kidsRaw.filter((k: any) => (ex ? k.id !== ex : true))
                    const hasKids = kids.length > 0
                    const expanded = cfg.expanded.has(loc.id)
                    const isSelected = cfg.selectedId === loc.id
                    return (
                        <div key={loc.id}>
                            <div className="flex items-stretch gap-1">
                                <button
                                    type="button"
                                    className={`w-8 shrink-0 flex items-center justify-center rounded-md ${hasKids ? "hover:bg-muted text-orange-600" : "opacity-25 cursor-default"}`}
                                    onClick={(e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        if (hasKids) cfg.toggleExpand(loc.id)
                                    }}
                                >
                                    {hasKids ? (
                                        <ChevronRight className={`w-4 h-4 transition-transform ${expanded ? "rotate-90" : ""}`} />
                                    ) : (
                                        <span className="w-4 inline-block" />
                                    )}
                                </button>
                                <button
                                    type="button"
                                    className={`flex-1 min-w-0 text-left rounded-xl border px-3 py-2 text-sm transition-all ${isSelected ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/25 shadow-sm ring-1 ring-emerald-200" : "border-border/70 hover:bg-muted/70"}`}
                                    onClick={() => cfg.onSelect(loc.id)}
                                >
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-mono font-bold">{displayLocLabel(loc)}</span>
                                        <span className="text-[10px] font-bold text-muted-foreground">{nivelLabelForTree(loc)}</span>
                                    </div>
                                    {loc.nome ? (
                                        <div className="text-[10px] text-muted-foreground truncate" title={loc.nome}>
                                            {loc.nome}
                                        </div>
                                    ) : null}
                                </button>
                            </div>
                            {hasKids && expanded ? renderLocDestPickerNodes(loc.id, level + 1, cfg) : null}
                        </div>
                    )
                })}
            </div>
        )
    }

    return (
        <>
            <Card className="border-orange-500/20 bg-orange-500/5">
                <CardHeader>
                    <CardTitle className="text-orange-600 flex items-center gap-2">
                        <MapPin className="w-5 h-5" /> Estrutura de armazenamento (WMS)
                    </CardTitle>
                    <CardDescription>
                        Cadastre setores, boxes e subníveis. O mapa acima reflete esta hierarquia.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end bg-background/50 p-4 rounded-xl border border-orange-500/10">
                        <div className="md:col-span-1 space-y-2">
                            <Label>Nome da localização</Label>
                            <Input
                                placeholder="Ex: Frente 1"
                                value={newLocation.nome}
                                onChange={(e) => setNewLocation({ ...newLocation, nome: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Sigla</Label>
                            <Input
                                placeholder="Ex: COR-A"
                                value={newLocation.sigla}
                                onChange={(e) => setNewLocation({ ...newLocation, sigla: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Dentro de (opcional)</Label>
                            <Select
                                value={newLocation.parent_id || ""}
                                onChange={(e) => {
                                    const pid = e.target.value || null
                                    setNewLocation({ ...newLocation, parent_id: pid })
                                }}
                            >
                                <option value="">-- Local principal (nível só na raiz) --</option>
                                {locations.map((l) => (
                                    <option key={l.id} value={l.id}>
                                        {displayLocLabel(l)} • {nivelLabelForTree(l)}
                                    </option>
                                ))}
                            </Select>
                        </div>
                        {!newLocation.parent_id ? (
                        <div className="space-y-2">
                            <Label>Nível (somente raiz)</Label>
                            <Select
                                value={String(newLocation.nivel)}
                                onChange={(e) => setNewLocation({ ...newLocation, nivel: Number(e.target.value) as 1 | 2 | 3 })}
                            >
                                <option value="1">Nível 1</option>
                                <option value="2">Nível 2</option>
                                <option value="3">Nível 3</option>
                            </Select>
                        </div>
                        ) : (
                        <div className="space-y-2">
                            <Label className="text-muted-foreground">Nível</Label>
                            <p className="text-xs text-muted-foreground pt-2">
                                Sub-localizações não têm nível próprio; use nível só no local principal (raiz).
                            </p>
                        </div>
                        )}
                        <div className="md:col-span-2 space-y-2">
                            <Label>Descrição / observações</Label>
                            <Input
                                placeholder="Detalhes sobre este local..."
                                value={newLocation.descricao}
                                onChange={(e) => setNewLocation({ ...newLocation, descricao: e.target.value })}
                            />
                        </div>
                        <div className="md:col-span-2">
                            <Button className="w-full bg-orange-600 hover:bg-orange-700 font-bold" onClick={() => void handleAddLocation()} disabled={loading}>
                                <Plus className="w-4 h-4 mr-2" /> Cadastrar localização
                            </Button>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative flex-1 max-w-sm min-w-[200px]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar por nome ou sigla..."
                                value={filterLocationSearch}
                                onChange={(e) => setFilterLocationSearch(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                        <Button
                            type="button"
                            variant={mostrarLocaisSucata ? "default" : "outline"}
                            size="sm"
                            className={`gap-1.5 shrink-0 ${mostrarLocaisSucata ? "bg-amber-600 hover:bg-amber-700" : "border-amber-300 text-amber-900"}`}
                            onClick={() => setMostrarLocaisSucata((v) => !v)}
                            title="Locais criados automaticamente para peças ainda no veículo (Sucata COD)"
                        >
                            {mostrarLocaisSucata ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                            Sucata {qtdLocaisSucata > 0 ? `(${qtdLocaisSucata})` : ""}
                        </Button>
                        {filterLocationSearch && (
                            <Button variant="ghost" size="sm" onClick={() => setFilterLocationSearch("")}>
                                Limpar
                            </Button>
                        )}
                    </div>

                    <div className="rounded-xl border border-border bg-background/60 overflow-hidden">
                        <div className="px-4 py-3 border-b bg-muted/30 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div className="flex items-center gap-2">
                                <Layers className="w-4 h-4 text-orange-600" />
                                <span className="font-black tracking-tight">Estrutura</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 justify-start md:justify-end">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    className="h-8 text-xs gap-1"
                                    type="button"
                                    onClick={selectAllLocations}
                                    disabled={locationsForTree.length === 0}
                                    title="Marca todas as localizações para transferência em lote"
                                >
                                    <CheckSquare className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">Selecionar todos</span>
                                    <span className="sm:hidden">Todos</span>
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-xs gap-1"
                                    type="button"
                                    onClick={clearLocationSelection}
                                    disabled={selectedLocIds.size === 0}
                                >
                                    <span className="hidden sm:inline">Limpar seleção</span>
                                    <span className="sm:hidden">Limpar</span>
                                </Button>
                                <Button
                                    variant="default"
                                    size="sm"
                                    className="h-8 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 gap-1"
                                    type="button"
                                    onClick={openSkuBatchTransferModal}
                                    title="Informe vários SKUs e transfira os produtos para um local"
                                >
                                    <Package className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">Transferir por SKU</span>
                                    <span className="sm:hidden">SKU</span>
                                </Button>
                                <Button
                                    variant="default"
                                    size="sm"
                                    className="h-8 text-xs font-bold bg-orange-600 hover:bg-orange-700 gap-1"
                                    type="button"
                                    onClick={openBatchPrintFromSelection}
                                    disabled={selectedLocIds.size === 0}
                                    title="Gera uma única impressão com uma etiqueta por local selecionado"
                                >
                                    <Printer className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">Imprimir em lote ({selectedLocIds.size})</span>
                                    <span className="sm:hidden">Imprimir ({selectedLocIds.size})</span>
                                </Button>
                                <Button
                                    variant="default"
                                    size="sm"
                                    className="h-8 text-xs font-bold bg-violet-600 hover:bg-violet-700 gap-1"
                                    type="button"
                                    onClick={openBatchTransferFromSelection}
                                    disabled={selectedLocIds.size === 0}
                                    title="Abre o assistente para escolher o destino das localizações marcadas"
                                >
                                    <ArrowRightLeft className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">Transferir lote ({selectedLocIds.size})</span>
                                    <span className="sm:hidden">Transf. ({selectedLocIds.size})</span>
                                </Button>
                                <Button variant="outline" size="sm" className="h-8 text-xs" type="button" onClick={expandAll}>
                                    <span className="hidden sm:inline">Expandir tudo</span>
                                    <span className="sm:hidden">Expandir</span>
                                </Button>
                                <Button variant="outline" size="sm" className="h-8 text-xs" type="button" onClick={collapseAll}>
                                    <span className="hidden sm:inline">Recolher tudo</span>
                                    <span className="sm:hidden">Recolher</span>
                                </Button>
                                <div className="text-[11px] text-muted-foreground font-medium pl-1">
                                    {locationsForTree.length} locais
                                    {qtdLocaisSucata > 0 && !mostrarLocaisSucata ? (
                                        <span className="text-amber-700 font-bold"> · +{qtdLocaisSucata} sucata oculto(s)</span>
                                    ) : null}
                                </div>
                            </div>
                        </div>

                        <div className="p-2 max-h-[560px] overflow-y-auto">
                            {filteredRoots.length === 0 ? (
                                <p className="text-sm text-muted-foreground italic p-3">Nenhuma localização encontrada.</p>
                            ) : (
                                <div className="space-y-1">
                                    {(() => {
                                        const renderNode = (loc: any, level: number): React.ReactNode => {
                                            if (!hasMatchInSubtree(loc)) return null

                                            const kids = childrenByParent.get(loc.id) || []
                                            const hasKids = kids.length > 0
                                            const forceExpanded = !!filterLocationSearch
                                            const expanded = forceExpanded || expandedLocIds.has(loc.id)
                                            const rowHit = !!filterLocationSearch && matchesQuery(loc)

                                            return (
                                                <div key={loc.id}>
                                                    <div
                                                        className={`group flex items-center gap-2 rounded-lg border border-transparent hover:border-orange-200 hover:bg-orange-50/60 dark:hover:bg-orange-950/15 px-2 py-1.5 ${rowHit ? "bg-orange-50/80 border-orange-200" : ""}`}
                                                        style={{ paddingLeft: 8 + level * (isMobile ? 8 : 14) }}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            className="h-4 w-4 rounded border-muted-foreground/40 shrink-0 accent-violet-600 cursor-pointer"
                                                            checked={selectedLocIds.has(loc.id)}
                                                            onChange={(e) => {
                                                                e.stopPropagation()
                                                                toggleLocationRowSelected(loc.id, e.target.checked)
                                                            }}
                                                            onClick={(e) => e.stopPropagation()}
                                                            title="Selecionar para transferência em lote"
                                                            aria-label="Selecionar localização"
                                                        />
                                                        <button
                                                            type="button"
                                                            className={`h-6 w-6 rounded-md flex items-center justify-center shrink-0 ${hasKids ? "hover:bg-orange-100" : "opacity-30 cursor-default"}`}
                                                            onClick={() => hasKids && toggleExpanded(loc.id)}
                                                            title={hasKids ? (expanded ? "Recolher" : "Expandir") : "Sem sub-localizações"}
                                                        >
                                                            <ChevronRight className={`w-4 h-4 text-orange-500 transition-transform ${expanded ? "rotate-90" : ""}`} />
                                                        </button>

                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                <span className="font-semibold font-mono truncate" title={displayLocLabel(loc)}>
                                                                    {displayLocLabel(loc)}
                                                                </span>
                                                                <span className="text-[10px] font-bold text-muted-foreground shrink-0">
                                                                    {nivelLabelForTree(loc)}
                                                                </span>
                                                                {isLocalizacaoSucataRow(loc) && (
                                                                    <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-200 text-amber-950 shrink-0 inline-flex items-center gap-0.5">
                                                                        <Car className="w-2.5 h-2.5" /> Sucata
                                                                    </span>
                                                                )}
                                                                {hasKids && (
                                                                    <span className="text-[10px] text-muted-foreground font-bold shrink-0">
                                                                        {kids.length}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {loc.sigla && (
                                                                <div className="text-[10px] text-muted-foreground truncate" title={loc.nome}>
                                                                    {loc.nome}
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className="shrink-0 opacity-70 hover:opacity-100 transition-opacity">
                                                            <LocationActionsMenu loc={loc} />
                                                        </div>
                                                    </div>

                                                    {hasKids && expanded && (
                                                        <div className="mt-1 space-y-1">
                                                            {kids.map((k) => renderNode(k, level + 1))}
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        }

                                        return filteredRoots.map((r) => renderNode(r, 0))
                                    })()}
                                </div>
                            )}

                            {orphanLocations.length > 0 && (
                                <div className="mt-4 border-t pt-3">
                                    <div className="px-2 pb-2 flex items-center justify-between">
                                        <span className="text-xs font-black text-muted-foreground uppercase tracking-widest">
                                            Órfãs (sem pai)
                                        </span>
                                        <span className="text-[11px] text-muted-foreground font-medium">
                                            {orphanLocations.length}
                                        </span>
                                    </div>
                                    <div className="space-y-1">
                                        {orphanLocations.map((loc) => (
                                            <div
                                                key={loc.id}
                                                className="group flex items-center gap-2 rounded-lg border border-transparent hover:border-orange-200 hover:bg-orange-50/60 dark:hover:bg-orange-950/15 px-2 py-1.5"
                                            >
                                                <input
                                                    type="checkbox"
                                                    className="h-4 w-4 rounded border-muted-foreground/40 shrink-0 accent-violet-600 cursor-pointer"
                                                    checked={selectedLocIds.has(loc.id)}
                                                    onChange={(e) => {
                                                        e.stopPropagation()
                                                        toggleLocationRowSelected(loc.id, e.target.checked)
                                                    }}
                                                    onClick={(e) => e.stopPropagation()}
                                                    title="Selecionar para transferência em lote"
                                                    aria-label="Selecionar localização"
                                                />
                                                <div className="h-6 w-6 flex items-center justify-center opacity-30">
                                                    <ChevronRight className="w-4 h-4" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className="font-semibold font-mono truncate" title={displayLocLabel(loc)}>
                                                            {displayLocLabel(loc)}
                                                        </span>
                                                        <span className="text-[10px] font-bold text-muted-foreground shrink-0">
                                                            {nivelLabelForTree(loc)}
                                                        </span>
                                                    </div>
                                                    {loc.sigla && (
                                                        <div className="text-[10px] text-muted-foreground truncate" title={loc.nome}>
                                                            {loc.nome}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="shrink-0 opacity-70 hover:opacity-100 transition-opacity">
                                                    <LocationActionsMenu loc={loc} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Modal
                isOpen={isPrintLocModalOpen}
                onClose={() => {
                    setIsPrintLocModalOpen(false)
                    setPrintModalTarget(null)
                }}
                title={
                    printModalTarget?.kind === "batch"
                        ? `Imprimir em lote (${printModalTarget.ids.length} localização(ões))`
                        : "Imprimir etiqueta de localização"
                }
            >
                {printModalTarget &&
                    (() => {
                        const previewLocId = printModalTarget.kind === "single" ? printModalTarget.id : printModalTarget.ids[0]
                        const chain = buildLocChain(previewLocId)
                        const options: { depth: 1 | 2 | 3; label: string }[] = []
                        if (chain.length >= 1) options.push({ depth: 1, label: chain.slice(-1).map((s) => formatSiglaNum(s.sigla, s.num)).filter(Boolean).join(" > ") })
                        if (chain.length >= 2) options.push({ depth: 2, label: chain.slice(-2).map((s) => formatSiglaNum(s.sigla, s.num)).filter(Boolean).join(" > ") })
                        if (chain.length >= 3) options.push({ depth: 3, label: chain.slice(-3).map((s) => formatSiglaNum(s.sigla, s.num)).filter(Boolean).join(" > ") })
                        
                        const selectedLabel = options.find((o) => o.depth === printDepth)?.label || ""
                        const selectedSegments = selectedLabel.split(" > ")
                        
                        return (
                            <div className="space-y-5">
                                <p className="text-xs text-muted-foreground">Selecione quantos níveis exibir na etiqueta:</p>
                                {printModalTarget.kind === "batch" && (
                                    <p className="text-xs text-orange-700/90 dark:text-orange-400/90">
                                        A pré-visualização abaixo usa o primeiro local selecionado; a impressão incluirá uma etiqueta para cada local marcado.
                                    </p>
                                )}
                                <div className="grid grid-cols-1 gap-2">
                                    {options.map((opt) => (
                                        <button
                                            key={opt.depth}
                                            type="button"
                                            onClick={() => setPrintDepth(opt.depth)}
                                            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all text-left ${printDepth === opt.depth ? "border-orange-500 bg-orange-50" : "border-border hover:border-orange-200"}`}
                                        >
                                            <div className="min-w-0">
                                                <p className="text-[10px] text-muted-foreground font-bold uppercase mb-1">
                                                    {opt.depth === 1 ? "1 nível (foco)" : opt.depth === 2 ? "2 níveis" : "3 níveis (completo)"}
                                                </p>
                                                <p className="font-black text-sm text-slate-800 truncate">{opt.label}</p>
                                            </div>
                                            <div
                                                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${printDepth === opt.depth ? "border-slate-800 bg-slate-800" : "border-muted-foreground/30"}`}
                                            >
                                                {printDepth === opt.depth && <div className="w-2 h-2 bg-white rounded-full" />}
                                            </div>
                                        </button>
                                    ))}
                                </div>

                                {/* Preview Responsiva em Preto e Branco */}
                                <div className="border-2 border-slate-300 rounded-2xl overflow-hidden bg-white shadow-sm ring-4 ring-slate-100">
                                    <div className="bg-slate-800 px-4 py-2 flex items-center justify-between">
                                        <span className="text-[10px] font-black text-white uppercase tracking-widest">Prévia em Preto e Branco (100x50mm)</span>
                                        <div className="flex gap-1">
                                            <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
                                            <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
                                        </div>
                                    </div>
                                    <div className="flex items-stretch" style={{ height: "140px" }}>
                                        <div className="flex-1 flex flex-col justify-center px-5 gap-0.5 border-r-2 border-dashed border-slate-200">
                                            <p className="text-[8px] text-slate-400 font-black uppercase tracking-[0.2em] mb-2 leading-none">📍 LOCALIZAÇÃO</p>
                                            <div className="flex flex-col justify-center">
                                                {selectedSegments.map((seg, i) => (
                                                    <p key={i} className={`font-black uppercase leading-none tracking-tight ${
                                                        selectedSegments.length === 1 ? "text-2xl" : "text-lg"
                                                    } text-slate-900`}>
                                                        {seg}
                                                    </p>
                                                ))}
                                            </div>
                                            {printDepth < chain.length && (
                                                <p className="text-[7px] text-slate-400 mt-2 font-medium truncate">
                                                    {chain.map((s) => formatSiglaNum(s.sigla, s.num)).filter(Boolean).join(" > ")}
                                                </p>
                                            )}
                                        </div>
                                        <div className="w-32 bg-slate-50 flex flex-col items-center justify-center gap-2 p-4">
                                            <div className="w-20 h-20 bg-white border border-slate-200 rounded-lg shadow-inner flex items-center justify-center text-[8px] text-slate-300 font-black text-center p-2 leading-tight">
                                                QR CODE<br/>B&W
                                            </div>
                                            <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Escaneie</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-3 pt-2">
                                    <Button
                                        variant="outline"
                                        className="flex-1 h-12 rounded-xl"
                                        onClick={() => {
                                            setIsPrintLocModalOpen(false)
                                            setPrintModalTarget(null)
                                        }}
                                    >
                                        Cancelar
                                    </Button>
                                    <Button
                                        className="flex-1 h-12 rounded-xl bg-slate-900 hover:bg-black font-bold shadow-lg shadow-slate-200"
                                        disabled={loading}
                                        onClick={() => {
                                            if (printModalTarget.kind === "single") {
                                                void handlePrintLoc(printModalTarget.id, printDepth)
                                            } else {
                                                void handlePrintLocBatch(printModalTarget.ids, printDepth)
                                            }
                                            setIsPrintLocModalOpen(false)
                                            setPrintModalTarget(null)
                                        }}
                                    >
                                        <Printer className="w-4 h-4 mr-2" />{" "}
                                        {printModalTarget.kind === "batch" ? "Imprimir lote" : "Imprimir Etiqueta"}
                                    </Button>
                                </div>
                            </div>
                        )
                    })()}
            </Modal>

            <Modal isOpen={isEditLocModalOpen} onClose={() => setIsEditLocModalOpen(false)} title={`Editar: ${editingLocation?.nome || ""}`}>
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>Nome</Label>
                        <Input value={editLocForm.nome} onChange={(e) => setEditLocForm({ ...editLocForm, nome: e.target.value })} placeholder="Ex: Frente 1" />
                    </div>
                    <div className="space-y-2">
                        <Label>Sigla</Label>
                        <Input value={editLocForm.sigla} onChange={(e) => setEditLocForm({ ...editLocForm, sigla: e.target.value })} placeholder="Ex: COR-A" />
                    </div>
                    {editingLocation && isRootLocation(editingLocation) ? (
                    <div className="space-y-2">
                        <Label>Nível (somente raiz)</Label>
                        <Select
                            value={String(editLocForm.nivel)}
                            onChange={(e) => setEditLocForm({ ...editLocForm, nivel: Number(e.target.value) as 1 | 2 | 3 })}
                        >
                            <option value="1">Nível 1</option>
                            <option value="2">Nível 2</option>
                            <option value="3">Nível 3</option>
                        </Select>
                    </div>
                    ) : (
                    <p className="text-xs text-muted-foreground">
                        Esta localização é filha: não possui nível próprio (apenas a raiz define Nível 1–3).
                    </p>
                    )}
                    <div className="space-y-2">
                        <Label>Descrição / observações</Label>
                        <Input value={editLocForm.descricao} onChange={(e) => setEditLocForm({ ...editLocForm, descricao: e.target.value })} placeholder="Opcional..." />
                    </div>
                    <div className="flex gap-3 pt-2">
                        <Button variant="outline" className="flex-1" onClick={() => setIsEditLocModalOpen(false)}>
                            Cancelar
                        </Button>
                        <Button className="flex-1 bg-orange-600 hover:bg-orange-700 font-bold" onClick={() => void handleEditLocation()} disabled={loading}>
                            <Save className="w-4 h-4 mr-2" /> Salvar alterações
                        </Button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={isAddSubLocModalOpen} onClose={() => setIsAddSubLocModalOpen(false)} title={`Adicionar dentro de: ${addSubLocParent?.nome || ""}`}>
                <div className="space-y-4">
                    <p className="text-xs text-muted-foreground">
                        A nova localização será criada como sub-nível de <strong>{addSubLocParent?.nome}</strong>.
                    </p>
                    <div className="space-y-2">
                        <Label>Nome</Label>
                        <Input value={subLocForm.nome} onChange={(e) => setSubLocForm({ ...subLocForm, nome: e.target.value })} placeholder="Ex: Caixa 12" autoFocus />
                    </div>
                    <div className="space-y-2">
                        <Label>Sigla</Label>
                        <Input value={subLocForm.sigla} onChange={(e) => setSubLocForm({ ...subLocForm, sigla: e.target.value })} placeholder="Ex: PRATE-1" />
                    </div>
                    <div className="space-y-2">
                        <Label>Descrição / observações</Label>
                        <Input value={subLocForm.descricao} onChange={(e) => setSubLocForm({ ...subLocForm, descricao: e.target.value })} placeholder="Opcional..." />
                    </div>
                    <div className="flex gap-3 pt-2">
                        <Button variant="outline" className="flex-1" onClick={() => setIsAddSubLocModalOpen(false)}>
                            Cancelar
                        </Button>
                        <Button className="flex-1 bg-orange-600 hover:bg-orange-700 font-bold" onClick={() => void handleAddSubLoc()} disabled={loading}>
                            <Plus className="w-4 h-4 mr-2" /> Adicionar
                        </Button>
                    </div>
                </div>
            </Modal>

            <Modal
                isOpen={isTransferLocModalOpen}
                onClose={() => {
                    setIsTransferLocModalOpen(false)
                    setLocToTransfer(null)
                    setTransferDestParentId(null)
                    setTransferBatchMode(false)
                    setTransferDestExpanded(new Set())
                }}
                title={
                    transferBatchMode
                        ? `Transferir lote (${selectedLocIds.size} localização(ões))`
                        : `Transferir: ${locToTransfer?.sigla || locToTransfer?.nome || ""}`
                }
            >
                <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        {transferBatchMode
                            ? "Todas as localizações selecionadas passarão a ter o mesmo destino: na raiz (topo) ou dentro do local que você escolher abaixo."
                            : "Defina o novo pai da localização: na raiz ou dentro de outro local (expanda com a seta para ver filhos)."}
                    </p>
                    <div className="space-y-2">
                        <Label>Destino</Label>
                        <div className="rounded-xl border border-violet-200/50 bg-gradient-to-b from-violet-50/40 to-background dark:from-violet-950/20 p-3 max-h-[min(420px,55vh)] overflow-y-auto">
                            <button
                                type="button"
                                className={`w-full text-left rounded-xl border px-3 py-2.5 mb-3 text-sm font-bold transition-all ${transferDestParentId === null ? "border-violet-500 bg-violet-100/80 dark:bg-violet-950/40 ring-1 ring-violet-300" : "border-border/80 hover:bg-muted/60"}`}
                                onClick={() => setTransferDestParentId(null)}
                            >
                                <span className="font-mono">Raiz</span>
                                <span className="block text-[10px] font-normal text-muted-foreground mt-0.5">
                                    Topo da árvore — sem pasta pai (nível de armazenamento principal na raiz)
                                </span>
                            </button>
                            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">
                                Pastas principais e sub-localizações
                            </p>
                            {(() => {
                                const ex = transferBatchMode
                                    ? getExcludedIdsForTransferSources(Array.from(selectedLocIds))
                                    : locToTransfer
                                      ? getExcludedIdsForTransferSources([locToTransfer.id])
                                      : new Set<string>()
                                return renderTransferDestNodes(null, 0, ex)
                            })()}
                        </div>
                        <p className="text-[10px] text-muted-foreground leading-snug">
                            <strong>Dica:</strong> clique na seta laranja para abrir os filhos. Clique no bloco do local para escolhê-lo como destino (ele será o novo &quot;pai&quot;).
                        </p>
                    </div>
                    <div className="flex gap-3 pt-2">
                        <Button
                            variant="outline"
                            className="flex-1"
                            onClick={() => {
                                setIsTransferLocModalOpen(false)
                                setLocToTransfer(null)
                                setTransferBatchMode(false)
                                setTransferDestExpanded(new Set())
                            }}
                        >
                            Cancelar
                        </Button>
                        <Button className="flex-1 bg-violet-600 hover:bg-violet-700 font-bold" onClick={() => void handleTransferLoc()} disabled={loading}>
                            <ArrowRightLeft className="w-4 h-4 mr-2" />{" "}
                            {transferBatchMode ? `Transferir ${selectedLocIds.size}` : "Transferir"}
                        </Button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={isProductListModalOpen} onClose={() => setIsProductListModalOpen(false)} title={`Inventário: ${viewingLocationName}`}>
                <div className="space-y-4">
                    <div className="border rounded-lg overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>SKU</TableHead>
                                    <TableHead>Produto</TableHead>
                                    <TableHead className="text-right">Qtd</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {selectedLocationProducts.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                                            Nenhum produto vinculado a esta localização.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    selectedLocationProducts.map((p, idx) => (
                                        <TableRow key={idx}>
                                            <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                                            <TableCell className="text-xs font-medium">{p.nome}</TableCell>
                                            <TableCell className="text-right font-bold text-orange-600">{p.estoque_atual}</TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                    <div className="flex justify-end">
                        <Button onClick={() => setIsProductListModalOpen(false)}>Fechar</Button>
                    </div>
                </div>
            </Modal>

            <Modal
                isOpen={isTransferProductsModalOpen}
                onClose={() => {
                    setIsTransferProductsModalOpen(false)
                    setLocToTransferProducts(null)
                    setTransferProductsDestLocId(null)
                    setProductDestExpanded(new Set())
                }}
                title="Alterar vinculação dos produtos"
            >
                <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        Isso move <b>todos os produtos</b> que estão neste local para outro local. Escolha primeiro um local principal e, se precisar, abra os filhos.
                    </p>

                    <div className="space-y-2">
                        <Label>Destino dos produtos</Label>
                        <div className="rounded-xl border border-emerald-200/60 bg-gradient-to-b from-emerald-50/50 to-background dark:from-emerald-950/15 p-3 max-h-[min(380px,50vh)] overflow-y-auto">
                            {locToTransferProducts?.id ? (
                                renderLocDestPickerNodes(null, 0, {
                                    excludeId: locToTransferProducts.id,
                                    expanded: productDestExpanded,
                                    toggleExpand: toggleProductDestExpand,
                                    selectedId: transferProductsDestLocId,
                                    onSelect: setTransferProductsDestLocId,
                                })
                            ) : (
                                <p className="text-sm text-muted-foreground">Nenhum local de origem.</p>
                            )}
                        </div>
                        <p className="text-[10px] text-muted-foreground leading-snug">
                            Locais principais aparecem primeiro; use a seta para expandir e escolher uma sub-localização.
                        </p>
                    </div>

                    <div className="flex gap-2 justify-end">
                        <Button variant="outline" onClick={() => setIsTransferProductsModalOpen(false)} disabled={transferProductsLoading}>
                            Cancelar
                        </Button>
                        <Button
                            className="bg-emerald-600 hover:bg-emerald-700 font-bold"
                            onClick={() => void handleTransferProducts()}
                            disabled={transferProductsLoading || !transferProductsDestLocId}
                        >
                            {transferProductsLoading ? "Transferindo..." : "Transferir produtos"}
                        </Button>
                    </div>
                </div>
            </Modal>

            <Modal
                isOpen={isSkuBatchTransferModalOpen}
                onClose={() => {
                    if (skuBatchOp) return
                    setIsSkuBatchTransferModalOpen(false)
                    setSkuBatchText("")
                    setSkuBatchDestLocId(null)
                    setSkuBatchDestExpanded(new Set())
                    setSkuBatchResult(null)
                }}
                title="Transferir produtos por SKU"
                className="max-w-3xl"
                alignTop
            >
                <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        Cole ou digite vários SKUs (um por linha ou separados por vírgula/ponto e vírgula). Valide a lista,
                        escolha o <strong>local de destino</strong> e confirme a transferência.
                    </p>

                    <div className="space-y-2">
                        <Label>Lista de SKUs</Label>
                        <textarea
                            className="w-full min-h-[132px] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            placeholder={"Ex.:\n12345\n67890\nABC-001"}
                            value={skuBatchText}
                            onChange={(e) => {
                                setSkuBatchText(e.target.value)
                                setSkuBatchResult(null)
                            }}
                            disabled={!!skuBatchOp}
                        />
                        <div className="flex flex-wrap gap-2">
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                className="font-bold"
                                onClick={() => void handleSkuBatchValidate()}
                                disabled={!!skuBatchOp}
                            >
                                <Search className="w-4 h-4 mr-2" />
                                {skuBatchOp === "validate" ? "Buscando..." : "Validar SKUs"}
                            </Button>
                            {skuBatchResult && (
                                <span className="text-xs text-muted-foreground self-center">
                                    {skuBatchResult.ok.length} encontrado(s)
                                    {skuBatchResult.missing.length > 0 ? ` · ${skuBatchResult.missing.length} não encontrado(s)` : ""}
                                </span>
                            )}
                        </div>
                    </div>

                    {skuBatchResult && skuBatchResult.missing.length > 0 && (
                        <div className="rounded-lg border border-amber-200/80 bg-amber-50/60 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
                            <span className="font-bold">SKUs não encontrados no cadastro:</span>{" "}
                            <span className="font-mono break-all">{skuBatchResult.missing.slice(0, 80).join(", ")}</span>
                            {skuBatchResult.missing.length > 80 ? "…" : ""}
                        </div>
                    )}

                    {skuBatchResult && skuBatchResult.ok.length > 0 && (
                        <div className="border rounded-lg overflow-hidden max-h-[min(220px,40vh)] overflow-y-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[100px]">SKU</TableHead>
                                        <TableHead>Produto</TableHead>
                                        <TableHead>Local atual (texto)</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {skuBatchResult.ok.map((p) => (
                                        <TableRow key={p.id}>
                                            <TableCell className="font-mono text-xs align-top">{p.sku}</TableCell>
                                            <TableCell className="text-xs align-top">{p.nome || "—"}</TableCell>
                                            <TableCell className="text-[11px] text-muted-foreground align-top">
                                                {p.localizacao_id
                                                    ? p.localizacao || getLocBreadcrumbLabel(p.localizacao_id)
                                                    : "—"}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label>Destino dos produtos</Label>
                        <div className="rounded-xl border border-emerald-200/60 bg-gradient-to-b from-emerald-50/50 to-background dark:from-emerald-950/15 p-3 max-h-[min(320px,45vh)] overflow-y-auto">
                            {renderLocDestPickerNodes(null, 0, {
                                excludeId: null,
                                expanded: skuBatchDestExpanded,
                                toggleExpand: toggleSkuBatchDestExpand,
                                selectedId: skuBatchDestLocId,
                                onSelect: setSkuBatchDestLocId,
                            })}
                        </div>
                        <p className="text-[10px] text-muted-foreground leading-snug">
                            Use a seta para expandir sub-localizações e clique no bloco para selecionar o destino.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2 justify-end pt-1">
                        <Button
                            variant="outline"
                            onClick={() => {
                                setIsSkuBatchTransferModalOpen(false)
                                setSkuBatchText("")
                                setSkuBatchDestLocId(null)
                                setSkuBatchResult(null)
                            }}
                            disabled={!!skuBatchOp}
                        >
                            Cancelar
                        </Button>
                        <Button
                            className="bg-emerald-600 hover:bg-emerald-700 font-bold"
                            onClick={() => void handleSkuBatchTransfer()}
                            disabled={
                                !!skuBatchOp ||
                                !skuBatchDestLocId ||
                                !skuBatchResult?.ok?.length
                            }
                        >
                            {skuBatchOp === "transfer"
                                ? "Transferindo..."
                                : `Transferir ${skuBatchResult?.ok?.length ?? 0} produto(s)`}
                        </Button>
                    </div>
                </div>
            </Modal>
        </>
    )
}
