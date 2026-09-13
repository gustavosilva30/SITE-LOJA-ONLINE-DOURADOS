import { useState, useEffect, useCallback, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  ChevronLeft,
  Save,
  Loader2,
  Search,
  Package,
  Check,
  Trash2,
  Settings2,
} from "lucide-react"
import { api } from "@/lib/api"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

// Colunas editáveis
const COLUMN_DEFS = [
  { key: "nome",             label: "Nome",             type: "text",   minWidth: 400 },
  { key: "part_number",      label: "Part Number",      type: "text",   minWidth: 130 },
  { key: "preco_padrao",     label: "Preço Padrão",     type: "number", minWidth: 110 },
  { key: "marca_veiculo",    label: "Marca Veíc.",      type: "text",   minWidth: 130 },
  { key: "modelo_veiculo",   label: "Modelo Veíc.",     type: "text",   minWidth: 150 },
  { key: "motorizacao",      label: "Motorização",      type: "text",   minWidth: 130 },
  { key: "ano_inicio",       label: "Ano Ini.",         type: "number", minWidth: 85  },
  { key: "ano_fim",          label: "Ano Fim",          type: "number", minWidth: 85  },
  { key: "descricao",        label: "Descrição",        type: "text",   minWidth: 300 },
  { key: "detalhes",         label: "Detalhes",         type: "text",   minWidth: 200 },
  { key: "detalhes_tecnicos",label: "Det. Técnicos",    type: "text",   minWidth: 300 },
] as const

type ColKey = typeof COLUMN_DEFS[number]["key"]

const PAGE_SIZE = 100

export function CatalogoAlteracaoMassa() {
  const navigate = useNavigate()
  const [pecas, setPecas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [edits, setEdits] = useState<Record<string, Record<string, any>>>({})
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkField, setBulkField] = useState<ColKey | "">("")
  const [bulkValue, setBulkValue] = useState("")
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    const w: Record<string, number> = {}
    COLUMN_DEFS.forEach(c => { w[c.key] = c.minWidth })
    return w
  })
  const resizingRef = useRef<{ key: string; startX: number; startW: number } | null>(null)

  const fetchPecas = useCallback(async (pageNum = 0) => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (searchTerm?.trim()) qs.set("q", searchTerm.trim())
      qs.set("limit", String(PAGE_SIZE))
      qs.set("offset", String(pageNum * PAGE_SIZE))
      const res = await api.get(`/api/catalogo/pecas-v2?${qs.toString()}`)
      // Backend returns { items: [...], total: N }
      const items = Array.isArray(res) ? res : (res?.items ?? res?.pecas ?? [])
      const total = typeof res?.total === "number" ? res.total : items.length
      setPecas(items)
      setTotalCount(total)
      setPage(pageNum)
    } catch (e: any) {
      toast.error("Erro ao carregar peças: " + (e?.message || e))
    } finally {
      setLoading(false)
    }
  }, [searchTerm])

  useEffect(() => { fetchPecas(0) }, [fetchPecas])

  // Redimensionamento de colunas
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const r = resizingRef.current
      if (!r) return
      const newW = Math.max(60, r.startW + (e.clientX - r.startX))
      setColumnWidths(prev => ({ ...prev, [r.key]: newW }))
    }
    const onUp = () => {
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      resizingRef.current = null
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [])

  const startResize = (key: string, clientX: number) => {
    resizingRef.current = { key, startX: clientX, startW: columnWidths[key] ?? 100 }
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
  }

  const getCellValue = (peca: any, key: string) =>
    edits[peca.id]?.[key] !== undefined ? edits[peca.id][key] : (peca[key] ?? "")

  const setCellValue = (id: string, key: string, value: any) => {
    setEdits(prev => {
      const next = { ...prev }
      if (!next[id]) next[id] = {}
      const col = COLUMN_DEFS.find(c => c.key === key)
      if (col?.type === "number") {
        const n = parseFloat(String(value))
        next[id][key] = isNaN(n) ? 0 : n
      } else {
        next[id][key] = value ?? ""
      }
      return next
    })
  }

  const hasChanges = Object.keys(edits).length > 0

  const handleSave = async () => {
    if (!hasChanges) return
    setSaving(true)
    let ok = 0, err = 0
    try {
      for (const [id, payload] of Object.entries(edits)) {
        try {
          await api.put(`/api/catalogo/pecas-v2/${id}`, payload)
          ok++
        } catch {
          err++
        }
      }
      setEdits({})
      toast.success(`${ok} peça(s) salva(s).${err > 0 ? ` ${err} erro(s).` : ""}`)
      fetchPecas(page)
    } finally {
      setSaving(false)
    }
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === pecas.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(pecas.map(p => p.id)))
  }

  const toggleSelectOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const applyBulkToSelected = () => {
    if (!bulkField || bulkValue === "") return toast.warning("Escolha o campo e o valor")
    if (selectedIds.size === 0) return toast.warning("Selecione ao menos uma linha")
    const col = COLUMN_DEFS.find(c => c.key === bulkField)
    setEdits(prev => {
      const next = { ...prev }
      for (const id of selectedIds) {
        if (!next[id]) next[id] = {}
        if (col?.type === "number") {
          const n = parseFloat(bulkValue)
          next[id][bulkField] = isNaN(n) ? 0 : n
        } else {
          next[id][bulkField] = bulkValue
        }
      }
      return next
    })
    setBulkValue("")
    toast.info(`Valor aplicado a ${selectedIds.size} peça(s).`)
  }

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return
    if (!confirm(`Excluir ${selectedIds.size} peça(s) permanentemente?`)) return
    setSaving(true)
    let ok = 0
    try {
      for (const id of selectedIds) {
        try {
          await api.delete(`/api/catalogo/pecas-v2/${id}`)
          ok++
        } catch { /**/ }
      }
      toast.success(`${ok} peça(s) excluída(s).`)
      setSelectedIds(new Set())
      fetchPecas(page)
    } finally {
      setSaving(false)
    }
  }

  const allPageSelected = pecas.length > 0 && pecas.every(p => selectedIds.has(p.id))

  return (
    <div className="p-6 h-full flex flex-col" style={{ minHeight: 0, overflow: "hidden" }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/catalogo")}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Package className="w-6 h-6" />
              Catálogo — Alteração em Massa
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Edite peças do catálogo como em uma planilha
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou part number..."
              className="pl-9 h-10"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              onKeyDown={e => e.key === "Enter" && fetchPecas(0)}
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => fetchPecas(0)}>Buscar</Button>
          <Button
            size="sm"
            className="gap-2"
            disabled={!hasChanges || saving}
            onClick={handleSave}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar {Object.keys(edits).length > 0 ? `(${Object.keys(edits).length})` : ""}
          </Button>
        </div>
      </div>

      {/* Bulk toolbar */}
      <div className="flex flex-wrap items-center gap-3 bg-muted/30 border p-3 rounded-xl mb-3">
        <div className="flex items-center gap-2 shrink-0">
          <Settings2 className="w-4 h-4 text-primary" />
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Aplicar a selecionados:
          </span>
        </div>
        <select
          className="h-8 rounded-md border border-input px-2 text-xs bg-background"
          value={bulkField}
          onChange={e => setBulkField(e.target.value as ColKey | "")}
        >
          <option value="">Campo...</option>
          {COLUMN_DEFS.filter(c => c.key !== "nome").map(c => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>
        {bulkField && (
          <Input
            placeholder="Novo valor..."
            className="h-8 w-44 text-xs"
            value={bulkValue}
            onChange={e => setBulkValue(e.target.value)}
          />
        )}
        {bulkField && (
          <Button size="sm" variant="secondary" className="h-8 text-[10px] font-black uppercase px-3" onClick={applyBulkToSelected}>
            <Check className="w-3 h-3 mr-1.5" /> Aplicar ({selectedIds.size})
          </Button>
        )}
        {selectedIds.size > 0 && (
          <Button size="sm" variant="ghost" className="h-8 text-destructive hover:bg-destructive/10 text-[10px] font-black uppercase px-3 ml-auto" onClick={deleteSelected} disabled={saving}>
            <Trash2 className="w-3 h-3 mr-1.5" /> Excluir {selectedIds.size} selecionados
          </Button>
        )}
      </div>

      {/* Contagem e paginação */}
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-2 px-1">
        <span>
          {loading ? "Carregando..." : `${totalCount} peça(s) — Página ${page + 1} de ${Math.ceil(totalCount / PAGE_SIZE) || 1}`}
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={page === 0} onClick={() => fetchPecas(page - 1)}>Anterior</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={(page + 1) * PAGE_SIZE >= totalCount} onClick={() => fetchPecas(page + 1)}>Próxima</Button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 border rounded-xl overflow-auto bg-background shadow-inner" style={{ minHeight: 0 }}>
        <table className="border-collapse" style={{ width: "max-content", minWidth: "100%" }}>
          <thead className="sticky top-0 z-30 shadow">
            <tr>
              {/* Checkbox col */}
              <th className="bg-slate-900 text-white p-3 border-r border-slate-800 w-10 sticky left-0 z-40">
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 accent-primary cursor-pointer"
                />
              </th>
              {/* # col */}
              <th className="bg-slate-900 text-white p-3 border-r border-slate-800 w-12 text-center sticky left-10 z-40">
                <span className="text-[10px] font-black uppercase tracking-widest">#</span>
              </th>
              {COLUMN_DEFS.map(col => (
                <th
                  key={col.key}
                  className="bg-slate-900 text-white p-0 border-r border-slate-800 select-none relative"
                  style={{ width: columnWidths[col.key], minWidth: columnWidths[col.key] }}
                >
                  <div className="flex items-center px-3 py-3 gap-1">
                    <span className="text-[10px] font-black uppercase tracking-widest whitespace-nowrap">{col.label}</span>
                  </div>
                  {/* Resize handle */}
                  <div
                    className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-primary/50 transition-colors"
                    onMouseDown={e => { e.preventDefault(); startResize(col.key, e.clientX) }}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={COLUMN_DEFS.length + 2} className="text-center py-16">
                  <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
                </td>
              </tr>
            ) : pecas.length === 0 ? (
              <tr>
                <td colSpan={COLUMN_DEFS.length + 2} className="text-center py-16 text-muted-foreground text-sm">
                  Nenhuma peça encontrada.
                </td>
              </tr>
            ) : pecas.map((peca, idx) => {
              const isEdited = !!edits[peca.id]
              const isSelected = selectedIds.has(peca.id)
              return (
                <tr
                  key={peca.id}
                  className={cn(
                    "transition-colors",
                    isSelected ? "bg-primary/5" : "hover:bg-muted/30",
                    isEdited ? "ring-inset ring-1 ring-amber-400/40 bg-amber-50/30 dark:bg-amber-900/10" : ""
                  )}
                >
                  {/* Checkbox */}
                  <td className="p-2 border-r border-border sticky left-0 bg-background z-10 w-10">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectOne(peca.id)}
                      className="w-4 h-4 accent-primary cursor-pointer"
                    />
                  </td>
                  {/* Index */}
                  <td className="p-2 border-r text-center text-[10px] text-muted-foreground font-mono bg-muted/5 sticky left-10 z-10 w-12">
                    {page * PAGE_SIZE + idx + 1}
                  </td>
                  {/* Data cells */}
                  {COLUMN_DEFS.map(col => {
                    const val = getCellValue(peca, col.key)
                    const wasEdited = edits[peca.id]?.[col.key] !== undefined
                    return (
                      <td
                        key={col.key}
                        className={cn("p-0 border-r border-border relative", wasEdited ? "bg-amber-50/60 dark:bg-amber-900/20" : "")}
                        style={{ width: columnWidths[col.key] }}
                      >
                        <input
                          type={col.type === "number" ? "number" : "text"}
                          value={val}
                          onChange={e => setCellValue(peca.id, col.key, e.target.value)}
                          maxLength={col.key === 'nome' ? 60 : undefined}
                          className={cn(
                            "w-full h-9 px-2 text-xs bg-transparent border-0 outline-none",
                            "hover:bg-muted/40 focus:bg-background focus:ring-2 focus:ring-primary/40 focus:ring-inset transition-all",
                            col.type === "number" ? "text-right font-mono" : "",
                            wasEdited ? "font-semibold text-amber-700 dark:text-amber-400" : ""
                          )}
                        />
                        {wasEdited && (
                          <div className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500" />
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Bottom bar */}
      {hasChanges && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-6 z-50 border border-slate-700">
          <div className="flex items-center gap-3 pr-6 border-r border-slate-700">
            <div className="w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center font-bold text-sm text-slate-900">
              {Object.keys(edits).length}
            </div>
            <span className="text-sm font-bold uppercase tracking-widest text-slate-400">Alterações pendentes</span>
          </div>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="bg-emerald-500 hover:bg-emerald-600 text-white font-black uppercase tracking-widest text-xs h-10 px-6"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Salvar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEdits({})}
              className="text-slate-400 hover:bg-white/10 font-black uppercase tracking-widest text-xs h-10 px-4"
            >
              Descartar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
