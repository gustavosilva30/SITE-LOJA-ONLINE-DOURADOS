import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { configuracoesApi, sucatasApi } from "@/lib/api"
import { compatRowDedupeKey } from "@/lib/compatCatalogo"
import { Car, Plus, RefreshCw, Trash2 } from "lucide-react"

type CompatDraft = {
  marca: string
  modelo: string
  ano: string
  versao: string
  motorizacao: string
  familia: string
}

export type SucataCompatibilidadesPanelProps = {
  sucataId: string
  /** Dados do veículo da sucata — botão “usar veículo” preenche uma linha. */
  veiculoMarca: string
  veiculoModelo: string
  anoFabricacao: number | null
  anoModelo: number | null
}

export function SucataCompatibilidadesPanel({
  sucataId,
  veiculoMarca,
  veiculoModelo,
  anoFabricacao,
  anoModelo,
}: SucataCompatibilidadesPanelProps) {
  const [rows, setRows] = useState<
    Array<{
      id: string
      marca: string
      modelo: string
      ano: string | null
      versao: string | null
      motorizacao: string | null
      familia: string | null
    }>
  >([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [allMasterVehicles, setAllMasterVehicles] = useState<any[]>([])
  const [newCompat, setNewCompat] = useState<CompatDraft>({
    marca: "",
    modelo: "",
    ano: "",
    versao: "",
    motorizacao: "",
    familia: "",
  })

  const loadRows = useCallback(async () => {
    setLoading(true)
    try {
      const data = await sucatasApi.listarCompatibilidade(sucataId)
      setRows(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error(e)
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [sucataId])

  const fetchMasterVehicles = useCallback(async () => {
    try {
      const data = await configuracoesApi.listarModelos()
      setAllMasterVehicles(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error("fetchMasterVehicles (sucata compat):", e)
    }
  }, [])

  useEffect(() => {
    void loadRows()
  }, [loadRows])

  useEffect(() => {
    void fetchMasterVehicles()
  }, [fetchMasterVehicles])

  const existingKeys = () => new Set(rows.map((r) => compatRowDedupeKey(r)))

  const insertRows = async (
    items: Array<{
      marca: string
      modelo: string
      ano?: string | null
      versao?: string | null
      motorizacao?: string | null
      familia?: string | null
    }>
  ) => {
    const keys = existingKeys()
    const novel = items.filter((r) => {
      const k = compatRowDedupeKey(r)
      if (keys.has(k)) return false
      keys.add(k)
      return true
    })
    if (novel.length === 0) return { inserted: 0 }
    setSaving(true)
    try {
      await sucatasApi.bulkCompatibilidade(
        sucataId,
        novel.map((r) => ({
          marca: r.marca,
          modelo: r.modelo,
          ano: r.ano ?? null,
          versao: r.versao ?? null,
          motorizacao: r.motorizacao ?? null,
          familia: r.familia ?? null,
        }))
      )
      await loadRows()
      return { inserted: novel.length }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      alert("Erro ao salvar compatibilidade: " + msg)
      return { inserted: 0 }
    } finally {
      setSaving(false)
    }
  }

  const handleAddManual = async () => {
    if (!newCompat.marca?.trim() || !newCompat.modelo?.trim()) {
      alert("Preencha marca e modelo.")
      return
    }
    const n = await insertRows([
      {
        marca: newCompat.marca.trim(),
        modelo: newCompat.modelo.trim(),
        ano: newCompat.ano || null,
        versao: newCompat.versao || null,
        motorizacao: newCompat.motorizacao || null,
        familia: newCompat.familia || null,
      },
    ])
    if (n.inserted > 0) {
      setNewCompat({ marca: "", modelo: "", ano: "", versao: "", motorizacao: "", familia: "" })
    }
  }

  const handleUsarVeiculoSucata = async () => {
    const m = veiculoMarca?.trim()
    const mo = veiculoModelo?.trim()
    if (!m || !mo) {
      alert("A sucata precisa ter marca e modelo preenchidos para usar este atalho.")
      return
    }
    let anoStr = ""
    if (anoFabricacao != null && anoModelo != null && anoFabricacao !== anoModelo) {
      anoStr = `${anoFabricacao}/${anoModelo}`
    } else if (anoModelo != null) {
      anoStr = String(anoModelo)
    } else if (anoFabricacao != null) {
      anoStr = String(anoFabricacao)
    }
    await insertRows([{ marca: m, modelo: mo, ano: anoStr || null, versao: null, motorizacao: null, familia: null }])
  }

  const handleVincularTodasVersoes = async () => {
    if (!newCompat.marca?.trim() || !newCompat.modelo?.trim()) {
      alert("Preencha marca e modelo (lista acima) para buscar versões no catálogo.")
      return
    }
    const matches = allMasterVehicles.filter(
      (v) =>
        v.marca?.toLowerCase() === newCompat.marca.toLowerCase() &&
        v.modelo?.toLowerCase() === newCompat.modelo.toLowerCase()
    )
    if (matches.length === 0) {
      alert("Nenhuma versão encontrada em veículos master para esta marca/modelo.")
      return
    }
    const toAdd = matches.map((v: any) => ({
      marca: v.marca,
      modelo: v.modelo,
      ano: v.ano ?? null,
      versao: v.versao ?? null,
      motorizacao: v.motorizacao ?? null,
      familia: v.familia ?? null,
    }))
    const n = await insertRows(toAdd)
    if (n.inserted > 0) alert(`${n.inserted} linha(s) adicionada(s) (duplicadas ignoradas).`)
    else alert("Todas essas versões já estavam na lista.")
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Remover esta compatibilidade?")) return
    setSaving(true)
    try {
      await sucatasApi.deletarCompatibilidade(sucataId, id)
      await loadRows()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      alert("Erro ao remover: " + msg)
    } finally {
      setSaving(false)
    }
  }

  const grouped = rows.reduce<Record<string, typeof rows>>((acc, r) => {
    const k = r.marca || "—"
    if (!acc[k]) acc[k] = []
    acc[k].push(r)
    return acc
  }, {})

  const listIdMarcas = `sucata-compat-marcas-${sucataId}`
  const listIdModelos = `sucata-compat-modelos-${sucataId}`

  return (
    <Card className="border-violet-200/40 bg-gradient-to-br from-violet-50/40 to-card dark:from-violet-950/10 w-full min-w-0 overflow-visible shadow-sm">
      <CardHeader className="pb-2 space-y-1">
        <CardTitle className="text-base font-bold leading-snug flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-2">
          <span className="inline-flex items-center gap-2 shrink-0">
            <Car className="w-4 h-4 text-violet-600 shrink-0" />
            Compatibilidades do veículo
          </span>
          <span className="text-[10px] font-normal text-muted-foreground font-medium max-w-none">
            (replicadas para produtos ao cadastrar peças no estoque)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 min-w-0 overflow-x-visible">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1 border-violet-300 text-violet-800"
            disabled={saving}
            onClick={() => void handleUsarVeiculoSucata()}
          >
            Usar marca/modelo/ano da sucata
          </Button>
          <Button type="button" variant="ghost" size="sm" className="gap-1" disabled={loading} onClick={() => void loadRows()}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar lista
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 pt-1 border-t border-border/30 min-w-0">
          <div className="space-y-1 min-w-0">
            <Label className="text-[10px] uppercase">Marca</Label>
            <Input
              className="h-8 text-xs min-w-0 w-full"
              value={newCompat.marca}
              onChange={(e) => setNewCompat({ ...newCompat, marca: e.target.value, modelo: "" })}
              list={listIdMarcas}
            />
            <datalist id={listIdMarcas}>
              {Array.from(new Set(allMasterVehicles.map((v) => v.marca).filter(Boolean))).map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1 min-w-0">
            <Label className="text-[10px] uppercase">Modelo</Label>
            <Input
              className="h-8 text-xs min-w-0 w-full"
              value={newCompat.modelo}
              onChange={(e) => {
                const v = e.target.value
                const found = allMasterVehicles.find((x) => x.marca === newCompat.marca && x.modelo === v)
                if (found) {
                  setNewCompat({
                    ...newCompat,
                    modelo: v,
                    ano: found.ano || newCompat.ano,
                    motorizacao: found.motorizacao || newCompat.motorizacao,
                    versao: found.versao || newCompat.versao,
                    familia: found.familia || newCompat.familia,
                  })
                } else {
                  setNewCompat({ ...newCompat, modelo: v })
                }
              }}
              disabled={!newCompat.marca}
              list={listIdModelos}
            />
            <datalist id={listIdModelos}>
              {allMasterVehicles
                .filter((v) => v.marca === newCompat.marca)
                .map((v, i) => (
                  <option key={i} value={v.modelo} />
                ))}
            </datalist>
          </div>
          <div className="space-y-1 min-w-0">
            <Label className="text-[10px] uppercase">Ano</Label>
            <Input
              className="h-8 text-xs min-w-0 w-full"
              value={newCompat.ano}
              onChange={(e) => setNewCompat({ ...newCompat, ano: e.target.value })}
            />
          </div>
          <div className="space-y-1 min-w-0">
            <Label className="text-[10px] uppercase">Família / geração</Label>
            <Input
              className="h-8 text-xs min-w-0 w-full"
              placeholder="Ex.: G5"
              value={newCompat.familia}
              onChange={(e) => setNewCompat({ ...newCompat, familia: e.target.value })}
            />
          </div>
          <div className="space-y-1 min-w-0">
            <Label className="text-[10px] uppercase">Motorização</Label>
            <Input
              className="h-8 text-xs min-w-0 w-full"
              placeholder="Ex.: 1.0 12V"
              value={newCompat.motorizacao}
              onChange={(e) => setNewCompat({ ...newCompat, motorizacao: e.target.value })}
            />
          </div>
          <div className="space-y-1 min-w-0 xl:col-span-1">
            <Label className="text-[10px] uppercase">Versão</Label>
            <Input
              className="h-8 text-xs min-w-0 w-full"
              value={newCompat.versao}
              onChange={(e) => setNewCompat({ ...newCompat, versao: e.target.value })}
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <Button type="button" size="sm" className="gap-1 flex-1" disabled={saving} onClick={() => void handleAddManual()}>
            <Plus className="w-4 h-4" />
            Adicionar linha
          </Button>
          {newCompat.marca && newCompat.modelo && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1 flex-1 border-emerald-400 text-emerald-800"
              disabled={saving}
              onClick={() => void handleVincularTodasVersoes()}
            >
              Vincular todas as versões (catálogo)
            </Button>
          )}
        </div>

        {loading ? (
          <p className="text-xs text-muted-foreground py-4 text-center">Carregando…</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-4 text-center border border-dashed rounded-lg">
            Nenhuma compatibilidade cadastrada. Use o botão acima ou adicione manualmente — as peças cadastradas no estoque herdarão estas linhas.
          </p>
        ) : (
          <div className="space-y-3 max-h-[min(70vh,520px)] overflow-y-auto overflow-x-hidden pr-1 -mr-1 min-w-0 rounded-md border border-border/40 bg-muted/20 p-2">
            {Object.entries(grouped)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([marca, items]) => (
                <div key={marca} className="space-y-1">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase text-violet-700">
                    <Car className="w-3 h-3" />
                    {marca}
                    <Badge variant="secondary" className="text-[9px]">
                      {items.length}
                    </Badge>
                  </div>
                  <div className="pl-2 space-y-1">
                    {items.map((r) => (
                      <div
                        key={r.id}
                        className="flex items-start justify-between gap-2 p-2 rounded-lg border bg-background/80 text-[11px]"
                      >
                        <div>
                          <span className="font-semibold">{r.modelo}</span>
                          <span className="text-muted-foreground ml-2">
                            {r.ano ? `Ano ${r.ano}` : ""}
                            {r.motorizacao ? ` · ${r.motorizacao}` : ""}
                            {r.familia ? ` · ${r.familia}` : ""}
                            {r.versao ? ` · ${r.versao}` : ""}
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-destructive"
                          disabled={saving}
                          onClick={() => void handleDelete(r.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
