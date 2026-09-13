import { useState, useEffect, useCallback, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  ChevronLeft,
  Save,
  Loader2,
  Search,
  Car,
  Check,
  Trash2,
  Plus,
  X,
  Settings2,
} from "lucide-react"
import { api } from "@/lib/api"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

// ─── Definição de colunas ───────────────────────────────────────────────────
const COLUMN_DEFS = [
  { key: "marca",       label: "Marca",        type: "text",   minWidth: 140 },
  { key: "modelo",      label: "Modelo",        type: "text",   minWidth: 160 },
  { key: "familia",     label: "Família",       type: "text",   minWidth: 150 },
  { key: "versao",      label: "Versão",        type: "text",   minWidth: 160 },
  { key: "motorizacao", label: "Motorização",   type: "text",   minWidth: 140 },
  { key: "ano_inicio",  label: "Ano Ini.",      type: "number", minWidth: 80  },
  { key: "ano_fim",     label: "Ano Fim",       type: "number", minWidth: 80  },
  { key: "detalhes",    label: "Detalhes",      type: "text",   minWidth: 260 },
] as const

type ColKey = typeof COLUMN_DEFS[number]["key"]

const PAGE_SIZE = 150
const BLANK_ROW = () => ({
  _new: true,
  _id: `new-${Date.now()}-${Math.random()}`,
  marca: "", modelo: "", familia: "", versao: "",
  motorizacao: "", ano_inicio: "", ano_fim: "", detalhes: "",
})

// ─── Componente ──────────────────────────────────────────────────────────────
export function VersoesAlteracaoMassa() {
  const navigate = useNavigate()
  const [versoes, setVersoes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [marcas, setMarcas] = useState<any[]>([])

  // edits: { [existingId]: { field: value } }
  const [edits, setEdits] = useState<Record<string, Record<string, any>>>({})
  // newRows: rows being created (not yet saved)
  const [newRows, setNewRows] = useState<any[]>([])

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkField, setBulkField] = useState<ColKey | "">("")
  const [bulkValue, setBulkValue] = useState("")

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    const w: Record<string, number> = {}
    COLUMN_DEFS.forEach(c => { w[c.key] = c.minWidth })
    return w
  })
  const resizingRef = useRef<{ key: string; startX: number; startW: number } | null>(null)

  // ── Fetch versões ──────────────────────────────────────────────────────────
  const fetchVersoes = useCallback(async (pageNum = 0) => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (searchTerm?.trim()) qs.set("q", searchTerm.trim())
      qs.set("limit", String(PAGE_SIZE))
      qs.set("offset", String(pageNum * PAGE_SIZE))
      const res = await api.get(`/api/catalogo/versoes-veiculos?${qs.toString()}`)
      const items = Array.isArray(res) ? res : (res?.items ?? [])
      const total = typeof res?.total === "number" ? res.total : items.length
      setVersoes(items)
      setTotalCount(total)
      setPage(pageNum)
    } catch {
      toast.error("Erro ao carregar versões")
    } finally {
      setLoading(false)
    }
  }, [searchTerm])

  const fetchMarcas = async () => {
    try {
      const d = await api.get("/api/catalogo/marcas-veiculos")
      setMarcas(Array.isArray(d) ? d : [])
    } catch { setMarcas([]) }
  }

  useEffect(() => { fetchVersoes(0) }, [fetchVersoes])
  useEffect(() => { fetchMarcas() }, [])

  // ── Resize de colunas ──────────────────────────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const r = resizingRef.current
      if (!r) return
      setColumnWidths(prev => ({ ...prev, [r.key]: Math.max(60, r.startW + (e.clientX - r.startX)) }))
    }
    const onUp = () => {
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      resizingRef.current = null
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp) }
  }, [])

  const startResize = (key: string, clientX: number) => {
    resizingRef.current = { key, startX: clientX, startW: columnWidths[key] ?? 100 }
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
  }

  // ── Edição célula (existente) ──────────────────────────────────────────────
  const setCellValue = (id: string, key: string, value: string) => {
    setEdits(prev => ({
      ...prev,
      [id]: { ...(prev[id] || {}), [key]: value }
    }))
  }

  const getExistingCell = (v: any, key: string) =>
    edits[v.id]?.[key] !== undefined ? edits[v.id][key] : (v[key] ?? "")

  // ── Edição célula (nova linha) ─────────────────────────────────────────────
  const setNewRowCell = (tmpId: string, key: string, value: string) => {
    setNewRows(prev => prev.map(r => r._id === tmpId ? { ...r, [key]: value } : r))
  }

  // ── Adicionar nova linha ───────────────────────────────────────────────────
  const addNewRow = () => setNewRows(prev => [...prev, BLANK_ROW()])
  const removeNewRow = (tmpId: string) => setNewRows(prev => prev.filter(r => r._id !== tmpId))

  // ── Salvar (edições existentes + novas linhas) ─────────────────────────────
  const hasChanges = Object.keys(edits).length > 0 || newRows.length > 0

  const handleSave = async () => {
    if (!hasChanges) return
    setSaving(true)
    let ok = 0, err = 0
    try {
      // 1. Salvar edições em registros existentes
      for (const [id, payload] of Object.entries(edits)) {
        try {
          await api.put(`/api/catalogo/versoes-veiculos/${id}`, payload)
          ok++
        } catch { err++ }
      }
      setEdits({})

      // 2. Criar novas linhas
      const validNew = newRows.filter(r => r.marca && r.modelo)
      if (validNew.length > 0) {
        try {
          const res = await api.post("/api/catalogo/versoes-veiculos/importar", {
            rows: validNew.map(r => ({
              marca:       r.marca       || "",
              modelo:      r.modelo      || "",
              familia:     r.familia     || "",
              versao:      r.versao      || "",
              motorizacao: r.motorizacao || "",
              ano_inicio:  r.ano_inicio  || "",
              ano_fim:     r.ano_fim     || "",
              detalhes:    r.detalhes    || "",
            }))
          })
          ok += res?.inseridos ?? 0
          if (res?.ignorados > 0) toast.warning(`${res.ignorados} duplicata(s) ignorada(s).`)
        } catch { err++ }
      }
      setNewRows([])

      if (ok > 0) toast.success(`${ok} versão(ões) salva(s).${err > 0 ? ` ${err} erro(s).` : ""}`)
      else if (err > 0) toast.error(`${err} erro(s) ao salvar.`)
      fetchVersoes(page)
    } finally {
      setSaving(false)
    }
  }

  // ── Excluir selecionados ───────────────────────────────────────────────────
  const deleteSelected = async () => {
    if (selectedIds.size === 0) return
    if (!confirm(`Excluir ${selectedIds.size} versão(ões) permanentemente?`)) return
    setSaving(true)
    let ok = 0
    try {
      for (const id of selectedIds) {
        try { await api.delete(`/api/catalogo/versoes-veiculos/${id}`); ok++ } catch { /* */ }
      }
      toast.success(`${ok} versão(ões) excluída(s).`)
      setSelectedIds(new Set())
      setEdits(prev => {
        const next = { ...prev }
        for (const id of selectedIds) delete next[id]
        return next
      })
      fetchVersoes(page)
    } finally { setSaving(false) }
  }

  // ── Aplicar em massa ───────────────────────────────────────────────────────
  const applyBulkToSelected = () => {
    if (!bulkField || bulkValue === "") return toast.warning("Escolha o campo e o valor")
    if (selectedIds.size === 0) return toast.warning("Selecione ao menos uma linha")
    setEdits(prev => {
      const next = { ...prev }
      for (const id of selectedIds) {
        if (!next[id]) next[id] = {}
        next[id][bulkField] = bulkValue
      }
      return next
    })
    setBulkValue("")
    toast.info(`Valor aplicado a ${selectedIds.size} versão(ões).`)
  }

  // ── Seleção ───────────────────────────────────────────────────────────────
  const allPageSelected = versoes.length > 0 && versoes.every(v => selectedIds.has(v.id))
  const toggleSelectAll = () => {
    if (allPageSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(versoes.map(v => v.id)))
  }
  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 h-full flex flex-col" style={{ minHeight: 0, overflow: "hidden" }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/banco-veiculos")}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Car className="w-6 h-6" /> Versões — Criação e Edição em Massa
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Edite versões existentes ou adicione novas diretamente na grade
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar marca, modelo, versão..."
              className="pl-9 h-10"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              onKeyDown={e => e.key === "Enter" && fetchVersoes(0)}
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => fetchVersoes(0)}>Buscar</Button>
          <Button size="sm" variant="secondary" className="gap-2" onClick={addNewRow}>
            <Plus className="w-4 h-4" /> Nova Linha
          </Button>
          <Button
            size="sm" className="gap-2"
            disabled={!hasChanges || saving}
            onClick={handleSave}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar {hasChanges ? `(${Object.keys(edits).length}ed${newRows.length > 0 ? `+${newRows.length}new` : ""})` : ""}
          </Button>
        </div>
      </div>

      {/* Bulk toolbar */}
      <div className="flex flex-wrap items-center gap-3 bg-muted/30 border p-3 rounded-xl mb-3 shrink-0">
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
          {COLUMN_DEFS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        {bulkField && (
          <Input placeholder="Novo valor..." className="h-8 w-44 text-xs" value={bulkValue}
            onChange={e => setBulkValue(e.target.value)} />
        )}
        {bulkField && (
          <Button size="sm" variant="secondary" className="h-8 text-[10px] font-black uppercase px-3"
            onClick={applyBulkToSelected}>
            <Check className="w-3 h-3 mr-1.5" /> Aplicar ({selectedIds.size})
          </Button>
        )}
        {selectedIds.size > 0 && (
          <Button size="sm" variant="ghost"
            className="h-8 text-destructive hover:bg-destructive/10 text-[10px] font-black uppercase px-3 ml-auto"
            onClick={deleteSelected} disabled={saving}>
            <Trash2 className="w-3 h-3 mr-1.5" /> Excluir {selectedIds.size}
          </Button>
        )}
      </div>

      {/* Pagination info */}
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-2 px-1 shrink-0">
        <span>
          {loading ? "Carregando..." : `${totalCount} versão(ões) — Página ${page + 1} de ${totalPages}`}
          {newRows.length > 0 && (
            <span className="ml-2 text-emerald-600 font-bold">+ {newRows.length} nova(s) não salva(s)</span>
          )}
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={page === 0}
            onClick={() => fetchVersoes(page - 1)}>Anterior</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={page + 1 >= totalPages}
            onClick={() => fetchVersoes(page + 1)}>Próxima</Button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 border rounded-xl overflow-auto bg-background shadow-inner" style={{ minHeight: 0 }}>
        <table className="border-collapse" style={{ width: "max-content", minWidth: "100%" }}>
          <thead className="sticky top-0 z-30 shadow">
            <tr>
              <th className="bg-slate-900 text-white p-3 border-r border-slate-800 w-10 sticky left-0 z-40">
                <input type="checkbox" checked={allPageSelected} onChange={toggleSelectAll}
                  className="w-4 h-4 accent-primary cursor-pointer" />
              </th>
              <th className="bg-slate-900 text-white p-3 border-r border-slate-800 w-12 text-center sticky left-10 z-40">
                <span className="text-[10px] font-black uppercase tracking-widest">#</span>
              </th>
              {COLUMN_DEFS.map(col => (
                <th key={col.key}
                  className="bg-slate-900 text-white p-0 border-r border-slate-800 select-none relative"
                  style={{ width: columnWidths[col.key], minWidth: columnWidths[col.key] }}
                >
                  <div className="flex items-center px-3 py-3 gap-1">
                    <span className="text-[10px] font-black uppercase tracking-widest whitespace-nowrap">{col.label}</span>
                  </div>
                  <div className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-primary/50 transition-colors"
                    onMouseDown={e => { e.preventDefault(); startResize(col.key, e.clientX) }} />
                </th>
              ))}
              {/* Ações col header */}
              <th className="bg-slate-900 text-white p-3 w-10 text-center" />
            </tr>
          </thead>

          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={COLUMN_DEFS.length + 3} className="text-center py-16">
                  <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
                </td>
              </tr>
            ) : (
              <>
                {/* ── Linhas existentes ──────────────────────────────── */}
                {versoes.length === 0 && newRows.length === 0 ? (
                  <tr>
                    <td colSpan={COLUMN_DEFS.length + 3} className="text-center py-16 text-muted-foreground text-sm">
                      Nenhuma versão encontrada. Clique em "Nova Linha" para criar.
                    </td>
                  </tr>
                ) : versoes.map((v, idx) => {
                  const isEdited = !!edits[v.id]
                  const isSelected = selectedIds.has(v.id)
                  return (
                    <tr key={v.id} className={cn(
                      "transition-colors",
                      isSelected ? "bg-primary/5" : "hover:bg-muted/30",
                      isEdited ? "ring-inset ring-1 ring-amber-400/40 bg-amber-50/30 dark:bg-amber-900/10" : ""
                    )}>
                      <td className="p-2 border-r border-border sticky left-0 bg-background z-10 w-10">
                        <input type="checkbox" checked={isSelected} onChange={() => toggleOne(v.id)}
                          className="w-4 h-4 accent-primary cursor-pointer" />
                      </td>
                      <td className="p-2 border-r text-center text-[10px] text-muted-foreground font-mono bg-muted/5 sticky left-10 z-10 w-12">
                        {page * PAGE_SIZE + idx + 1}
                      </td>
                      {COLUMN_DEFS.map(col => {
                        const val = getExistingCell(v, col.key)
                        const wasEdited = edits[v.id]?.[col.key] !== undefined
                        return (
                          <td key={col.key}
                            className={cn("p-0 border-r border-border relative", wasEdited ? "bg-amber-50/60 dark:bg-amber-900/20" : "")}
                            style={{ width: columnWidths[col.key] }}
                          >
                            {col.key === "marca" ? (
                              <select
                                className={cn("w-full h-9 px-2 text-xs bg-transparent border-0 outline-none hover:bg-muted/40 focus:bg-background transition-all",
                                  wasEdited ? "font-semibold text-amber-700 dark:text-amber-400" : "")}
                                value={val}
                                onChange={e => setCellValue(v.id, col.key, e.target.value)}
                              >
                                <option value="">(selecionar)</option>
                                {marcas.map(m => <option key={m.id} value={m.nome}>{m.nome}</option>)}
                              </select>
                            ) : (
                              <input
                                type={col.type === "number" ? "number" : "text"}
                                value={val}
                                onChange={e => setCellValue(v.id, col.key, e.target.value)}
                                className={cn(
                                  "w-full h-9 px-2 text-xs bg-transparent border-0 outline-none",
                                  "hover:bg-muted/40 focus:bg-background focus:ring-2 focus:ring-primary/40 focus:ring-inset transition-all",
                                  col.type === "number" ? "text-center font-mono" : "",
                                  wasEdited ? "font-semibold text-amber-700 dark:text-amber-400" : ""
                                )}
                              />
                            )}
                            {wasEdited && (
                              <div className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500" />
                            )}
                          </td>
                        )
                      })}
                      <td className="p-1 w-10">
                        {isEdited && (
                          <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-foreground"
                            onClick={() => setEdits(prev => { const next = { ...prev }; delete next[v.id]; return next })}>
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}

                {/* ── Novas linhas (criação) ─────────────────────────── */}
                {newRows.map((row, idx) => {
                  const isValid = row.marca && row.modelo
                  return (
                    <tr key={row._id} className={cn(
                      "border-l-4 border-emerald-500 transition-colors",
                      isValid ? "bg-emerald-50/30 dark:bg-emerald-900/10" : "bg-red-50/20 dark:bg-red-900/10"
                    )}>
                      {/* No checkbox for new rows */}
                      <td className="p-2 border-r border-border sticky left-0 bg-emerald-50/50 dark:bg-emerald-950/30 z-10 w-10">
                        <Plus className="w-3.5 h-3.5 text-emerald-600 mx-auto" />
                      </td>
                      <td className="p-2 border-r text-center text-[10px] font-mono sticky left-10 z-10 w-12 text-emerald-600 font-bold">
                        +{idx + 1}
                      </td>
                      {COLUMN_DEFS.map(col => (
                        <td key={col.key} className="p-0 border-r border-border" style={{ width: columnWidths[col.key] }}>
                          {col.key === "marca" ? (
                            <select
                              className={cn("w-full h-9 px-2 text-xs bg-transparent border-0 outline-none hover:bg-muted/40 focus:bg-background transition-all",
                                !row.marca ? "text-red-500" : "text-emerald-700 dark:text-emerald-400 font-semibold")}
                              value={row.marca}
                              onChange={e => setNewRowCell(row._id, "marca", e.target.value)}
                            >
                              <option value="">Marca *</option>
                              {marcas.map(m => <option key={m.id} value={m.nome}>{m.nome}</option>)}
                            </select>
                          ) : (
                            <input
                              type={col.type === "number" ? "number" : "text"}
                              value={(row as any)[col.key]}
                              placeholder={col.key === "modelo" ? "Modelo *" : col.label}
                              onChange={e => setNewRowCell(row._id, col.key, e.target.value)}
                              className={cn(
                                "w-full h-9 px-2 text-xs bg-transparent border-0 outline-none",
                                "hover:bg-muted/40 focus:bg-background focus:ring-2 focus:ring-emerald-400/40 focus:ring-inset transition-all",
                                col.type === "number" ? "text-center font-mono" : "",
                                col.key === "modelo" && !row.modelo ? "text-red-400 placeholder:text-red-300" : "text-emerald-700 dark:text-emerald-400"
                              )}
                            />
                          )}
                        </td>
                      ))}
                      <td className="p-1 w-10">
                        <Button variant="ghost" size="icon" className="w-7 h-7 text-destructive hover:bg-destructive/10"
                          onClick={() => removeNewRow(row._id)}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  )
                })}

                {/* Add row footer */}
                <tr>
                  <td colSpan={COLUMN_DEFS.length + 3} className="p-2">
                    <Button variant="ghost" className="w-full gap-2 text-xs text-muted-foreground border border-dashed hover:border-solid hover:text-foreground"
                      onClick={addNewRow}>
                      <Plus className="w-3.5 h-3.5" /> Adicionar nova linha
                    </Button>
                  </td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Bottom floating bar */}
      {hasChanges && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-6 z-50 border border-slate-700">
          <div className="flex items-center gap-4 pr-6 border-r border-slate-700">
            {Object.keys(edits).length > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-amber-500 rounded-full flex items-center justify-center font-bold text-xs text-slate-900">
                  {Object.keys(edits).length}
                </div>
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">ediç(ões)</span>
              </div>
            )}
            {newRows.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-emerald-500 rounded-full flex items-center justify-center font-bold text-xs text-slate-900">
                  {newRows.length}
                </div>
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">nova(s)</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={handleSave} disabled={saving}
              className="bg-emerald-500 hover:bg-emerald-600 text-white font-black uppercase tracking-widest text-xs h-10 px-6">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Salvar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setEdits({}); setNewRows([]) }}
              className="text-slate-400 hover:bg-white/10 font-black uppercase tracking-widest text-xs h-10 px-4">
              Descartar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
