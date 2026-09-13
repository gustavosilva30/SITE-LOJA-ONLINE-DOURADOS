import { useCallback, useEffect, useMemo, useState } from "react"
import { Navigate } from "react-router-dom"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ChevronDown, MapPinned, Plus, Save, Search, Trash2, Truck, Upload } from "lucide-react"
import { configuracoesApi } from "@/lib/api"
import { useAuthStore } from "@/store/authStore"
import { UFS_BR } from "@/lib/brasilUfs"
import { fetchMunicipiosPorUf, stripAccents, type IbgeMunicipio } from "@/lib/ibgeMunicipios"
import { cn } from "@/lib/utils"
import { hasCrmPathAccess } from "@/config/crmRoutePermissions"

type Transportadora = {
  id: string
  nome: string
  razao_social?: string | null
  documento?: string | null
  inscricao_estadual?: string | null
  contato?: string | null
}

type AtendimentoRow = {
  id: string
  transportadora_id: string
  uf: string
  cidade: string
  codigo_ibge: number
  valor_frete: number | null
  prazo_dias: number | null
}

function normHeader(h: string): string {
  return h
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, "_")
}

function parseNumberBr(s: string | number | undefined | null): number | null {
  if (s === undefined || s === null || s === "") return null
  if (typeof s === "number" && !Number.isNaN(s)) return s
  const t = String(s).trim().replace(/\./g, "").replace(",", ".")
  const n = parseFloat(t)
  return Number.isFinite(n) ? n : null
}

function parseIntSafe(s: string | number | undefined | null): number | null {
  if (s === undefined || s === null || s === "") return null
  if (typeof s === "number" && Number.isFinite(s)) return Math.round(s)
  const n = parseInt(String(s).replace(/\D/g, ""), 10)
  return Number.isFinite(n) ? n : null
}

export function Transportadoras() {
  const { atendente } = useAuthStore()
  const canAccess = useMemo(
    () => hasCrmPathAccess("/transportadoras", atendente),
    [atendente]
  )

  const [loading, setLoading] = useState(false)
  const [carriers, setCarriers] = useState<Transportadora[]>([])
  const [cityCounts, setCityCounts] = useState<Record<string, number>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filterList, setFilterList] = useState("")

  const [newShip, setNewShip] = useState({
    nome: "",
    razao_social: "",
    documento: "",
    inscricao_estadual: "",
    contato: "",
  })

  const [atendimentoRows, setAtendimentoRows] = useState<AtendimentoRow[]>([])
  /** codigo_ibge -> extras */
  const [extraByIbge, setExtraByIbge] = useState<Record<number, { valor_frete: number | null; prazo_dias: number | null }>>({})
  /** uf -> Set<codigo_ibge> */
  const [selectedByUf, setSelectedByUf] = useState<Record<string, Set<number>>>({})
  const [openUf, setOpenUf] = useState<string | null>(null)
  const [municipiosCache, setMunicipiosCache] = useState<Record<string, IbgeMunicipio[]>>({})
  const [loadingUf, setLoadingUf] = useState<string | null>(null)
  const [cityFilter, setCityFilter] = useState<Record<string, string>>({})
  const [ufSearch, setUfSearch] = useState("")

  const selected = carriers.find((c) => c.id === selectedId) ?? null

  const loadCarriersAndCounts = useCallback(async () => {
    try {
      const [list, countsRaw] = await Promise.all([
        configuracoesApi.listarTransportadoras(),
        configuracoesApi.contagensAtendimentoTransportadoras(),
      ])
      setCarriers(list as Transportadora[])
      setCityCounts(countsRaw ?? {})
    } catch (e) {
      console.error(e)
      toast.error(e instanceof Error ? e.message : "Erro ao carregar transportadoras.")
    }
  }, [])

  useEffect(() => {
    loadCarriersAndCounts()
  }, [loadCarriersAndCounts])

  const loadAtendimentoFor = useCallback(async (transportadoraId: string) => {
    let data: unknown
    try {
      data = await configuracoesApi.listarAtendimentoTransportadora(transportadoraId)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar cidades.")
      return
    }
    const rows = (Array.isArray(data) ? data : []) as AtendimentoRow[]
    setAtendimentoRows(rows)
    const sel: Record<string, Set<number>> = {}
    const extras: Record<number, { valor_frete: number | null; prazo_dias: number | null }> = {}
    for (const r of rows) {
      const uf = r.uf.toUpperCase()
      if (!sel[uf]) sel[uf] = new Set()
      sel[uf].add(r.codigo_ibge)
      extras[r.codigo_ibge] = { valor_frete: r.valor_frete, prazo_dias: r.prazo_dias }
    }
    setSelectedByUf(sel)
    setExtraByIbge(extras)
  }, [])

  useEffect(() => {
    if (!selectedId) {
      setAtendimentoRows([])
      setSelectedByUf({})
      setExtraByIbge({})
      setOpenUf(null)
      return
    }
    loadAtendimentoFor(selectedId)
  }, [selectedId, loadAtendimentoFor])

  const limparNomeFantasia = (nome: string | null | undefined): string => {
    if (!nome) return ""
    let n = nome.trim()
    // Remove CPF/CNPJ prefixos do início (comum em MEI)
    n = n.replace(/^(\d{2}\.\d{3}\.\d{3}|\d{8}|\d{3}\.\d{3}\.\d{3}-\d{2}|\d{11})\s+/i, "")
    n = n.replace(/\s+(\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2})$/i, "")
    n = n.replace(/[,.\s]+(LTDA|MEI|ME|EPP|EIRELI|LIMITADA|S\.?A\.?|S\/A)$/i, "")
    return n.trim()
  }

  const limparRazaoSocial = (razao: string | null | undefined): string => {
    if (!razao) return ""
    let r = razao.trim()
    // Remove CPF/CNPJ prefixos do início (comum em MEI)
    r = r.replace(/^(\d{2}\.\d{3}\.\d{3}|\d{8}|\d{3}\.\d{3}\.\d{3}-\d{2}|\d{11})\s+/i, "")
    r = r.replace(/\s+(\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2})$/i, "")
    return r.trim()
  }

  const searchCNPJ = async () => {
    const cnpj = newShip.documento.replace(/\D/g, "")
    if (cnpj.length !== 14) {
      toast.error("Digite um CNPJ válido")
      return
    }
    setLoading(true)
    try {
      let res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`)
      let data: Record<string, unknown>
      if (res.ok) {
        data = (await res.json()) as Record<string, unknown>
      } else {
        res = await fetch(`https://minhareceita.org/${cnpj}`)
        if (!res.ok) throw new Error("Não encontrado")
        data = (await res.json()) as Record<string, unknown>
      }
      setNewShip((prev) => ({
        ...prev,
        nome: limparNomeFantasia(String(data.nome_fantasia || data.razao_social || data.fantasia || data.nome || prev.nome)),
        razao_social: limparRazaoSocial(String(data.razao_social || data.nome || prev.razao_social)),
        contato: String(data.ddd_telefone_1 || data.telefone || prev.contato),
      }))
    } catch {
      toast.error("Não foi possível buscar o CNPJ.")
    } finally {
      setLoading(false)
    }
  }

  const handleAddCarrier = async () => {
    if (!newShip.nome?.trim()) return
    setLoading(true)
    const payload = {
      nome: newShip.nome.trim(),
      razao_social: newShip.razao_social?.trim() || null,
      documento: newShip.documento?.trim() || null,
      inscricao_estadual: newShip.inscricao_estadual?.trim() || null,
      contato: newShip.contato?.trim() || null,
    }
    try {
      await configuracoesApi.criarTransportadora(payload)
      setNewShip({ nome: "", razao_social: "", documento: "", inscricao_estadual: "", contato: "" })
      await loadCarriersAndCounts()
      toast.success("Transportadora cadastrada.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao cadastrar.")
    }
    setLoading(false)
  }

  const deleteCarrier = async (id: string) => {
    if (!confirm("Excluir esta transportadora e todas as cidades vinculadas?")) return
    setLoading(true)
    try {
      await configuracoesApi.excluirTransportadora(id)
      if (selectedId === id) setSelectedId(null)
      await loadCarriersAndCounts()
      toast.success("Transportadora removida.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir.")
    }
    setLoading(false)
  }

  const toggleUfOpen = async (uf: string) => {
    if (openUf === uf) {
      setOpenUf(null)
      return
    }
    setOpenUf(uf)
    if (municipiosCache[uf]) return
    setLoadingUf(uf)
    try {
      const list = await fetchMunicipiosPorUf(uf)
      setMunicipiosCache((prev) => ({ ...prev, [uf]: list }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar cidades (IBGE).")
      setOpenUf(null)
    } finally {
      setLoadingUf(null)
    }
  }

  const toggleCity = (uf: string, codigoIbge: number) => {
    setSelectedByUf((prev) => {
      const next = { ...prev }
      const set = new Set(next[uf] ?? [])
      if (set.has(codigoIbge)) set.delete(codigoIbge)
      else set.add(codigoIbge)
      next[uf] = set
      return next
    })
    setExtraByIbge((prev) => {
      if (prev[codigoIbge]) return prev
      return { ...prev, [codigoIbge]: { valor_frete: null, prazo_dias: null } }
    })
  }

  const marcarTodasUf = (uf: string) => {
    const list = municipiosCache[uf]
    if (!list?.length) return
    setSelectedByUf((prev) => {
      const next = { ...prev }
      next[uf] = new Set(list.map((m) => m.id))
      return next
    })
    setExtraByIbge((prev) => {
      const n = { ...prev }
      for (const m of list) {
        if (!n[m.id]) n[m.id] = { valor_frete: null, prazo_dias: null }
      }
      return n
    })
  }

  const desmarcarTodasUf = (uf: string) => {
    setSelectedByUf((prev) => ({ ...prev, [uf]: new Set() }))
  }

  const buildPayloadRows = (): {
    transportadora_id: string
    uf: string
    cidade: string
    codigo_ibge: number
    valor_frete: number | null
    prazo_dias: number | null
  }[] => {
    if (!selectedId) return []
    const nomePorIbge = new Map<number, string>()
    for (const [uf, list] of Object.entries(municipiosCache)) {
      for (const m of list) nomePorIbge.set(m.id, m.nome)
    }
    for (const r of atendimentoRows) {
      if (!nomePorIbge.has(r.codigo_ibge)) nomePorIbge.set(r.codigo_ibge, r.cidade)
    }
    const out: {
      transportadora_id: string
      uf: string
      cidade: string
      codigo_ibge: number
      valor_frete: number | null
      prazo_dias: number | null
    }[] = []
    for (const [uf, set] of Object.entries(selectedByUf)) {
      for (const cod of set) {
        const nome = nomePorIbge.get(cod)
        if (!nome) continue
        const ex = extraByIbge[cod] ?? { valor_frete: null, prazo_dias: null }
        out.push({
          transportadora_id: selectedId,
          uf: uf.toUpperCase(),
          cidade: nome,
          codigo_ibge: cod,
          valor_frete: ex.valor_frete,
          prazo_dias: ex.prazo_dias,
        })
      }
    }
    return out
  }

  const salvarCidades = async () => {
    if (!selectedId) return
    const rows = buildPayloadRows()
    setLoading(true)
    try {
      await configuracoesApi.substituirAtendimentoTransportadora(selectedId, { rows })
      toast.success(`Salvo: ${rows.length} cidade(s).`)
      await loadCarriersAndCounts()
      await loadAtendimentoFor(selectedId)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar.")
    } finally {
      setLoading(false)
    }
  }

  const handleImportFile = async (file: File | null) => {
    if (!file || !selectedId) return
    setLoading(true)
    try {
      const XLSX = await import("xlsx")
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: "array" })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" })
      if (!json.length) {
        toast.error("Planilha vazia.")
        return
      }
      const hdrsSet = new Set<string>()
      json.forEach((item) => {
        if (item && typeof item === "object") {
          Object.keys(item).forEach(k => hdrsSet.add(k))
        }
      })
      const headers = Array.from(hdrsSet).map((k) => ({ raw: k, norm: normHeader(k) }))
      const findCol = (...candidates: string[]) => {
        for (const c of candidates) {
          const h = headers.find((x) => x.norm === normHeader(c) || x.norm.includes(normHeader(c)))
          if (h) return h.raw
        }
        return null
      }
      const colUf = findCol("UF", "ESTADO_SIGLA", "Uf")
      const colCidade = findCol("CIDADE", "MUNICIPIO", "MUNICÍPIO", "MUNICIPIO_NOME")
      const colValor = findCol("VALOR", "VALOR_FRETE", "FRETE", "COTACAO", "PRECO")
      const colPrazo = findCol("PRAZO", "PRAZO_DIAS", "DIAS", "PRAZO_EM_DIAS")
      if (!colUf || !colCidade) {
        toast.error("Defina colunas UF e Cidade (ou Município) na primeira linha.")
        return
      }

      const ufsNoArquivo = new Set<string>()
      for (const row of json) {
        const u = String(row[colUf] ?? "").trim().toUpperCase()
        if (u.length === 2) ufsNoArquivo.add(u)
      }
      const municipioPorUf = new Map<string, Map<string, IbgeMunicipio>>()
      for (const u of ufsNoArquivo) {
        const list = await fetchMunicipiosPorUf(u)
        const m = new Map<string, IbgeMunicipio>()
        for (const mun of list) {
          m.set(stripAccents(mun.nome), mun)
        }
        municipioPorUf.set(u, m)
      }

      let ok = 0
      let skip = 0
      const novosSel: Record<string, Set<number>> = {}
      for (const [uf, set] of Object.entries(selectedByUf)) {
        novosSel[uf] = new Set(set)
      }
      const novosExtra = { ...extraByIbge }

      for (const row of json) {
        const uf = String(row[colUf] ?? "")
          .trim()
          .toUpperCase()
        const cidadeRaw = String(row[colCidade] ?? "").trim()
        if (uf.length !== 2 || !cidadeRaw) {
          skip++
          continue
        }
        const mapMun = municipioPorUf.get(uf)
        if (!mapMun) {
          skip++
          continue
        }
        const mun =
          mapMun.get(stripAccents(cidadeRaw)) ||
          [...mapMun.values()].find((m) => stripAccents(m.nome) === stripAccents(cidadeRaw))
        if (!mun) {
          skip++
          continue
        }
        if (!novosSel[uf]) novosSel[uf] = new Set()
        novosSel[uf].add(mun.id)
        const v = colValor ? parseNumberBr(row[colValor] as string | number) : null
        const p = colPrazo ? parseIntSafe(row[colPrazo] as string | number) : null
        const prevEx = novosExtra[mun.id]
        novosExtra[mun.id] = {
          valor_frete: colValor ? (v ?? prevEx?.valor_frete ?? null) : (prevEx?.valor_frete ?? null),
          prazo_dias: colPrazo ? (p ?? prevEx?.prazo_dias ?? null) : (prevEx?.prazo_dias ?? null),
        }
        ok++
      }

      setSelectedByUf(novosSel)
      setExtraByIbge(novosExtra)
      for (const u of ufsNoArquivo) {
        if (!municipiosCache[u]) {
          const list = await fetchMunicipiosPorUf(u)
          setMunicipiosCache((prev) => ({ ...prev, [u]: list }))
        }
      }
      toast.success(`Importação: ${ok} linha(s) reconhecida(s).${skip ? ` Ignoradas: ${skip}.` : ""} Clique em Salvar áreas para gravar.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao ler arquivo.")
    } finally {
      setLoading(false)
    }
  }

  const filteredCarriers = useMemo(() => {
    const q = filterList.toLowerCase().trim()
    if (!q) return carriers
    return carriers.filter((c) => [c.nome, c.documento, c.razao_social].some((x) => String(x ?? "").toLowerCase().includes(q)))
  }, [carriers, filterList])

  const ufsFiltered = useMemo(() => {
    const q = ufSearch.toLowerCase().trim()
    if (!q) return UFS_BR
    return UFS_BR.filter((u) => u.sigla.toLowerCase().includes(q) || u.nome.toLowerCase().includes(q))
  }, [ufSearch])

  if (!canAccess) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight uppercase flex items-center gap-2">
          <Truck className="w-8 h-8 text-emerald-600" />
          Transportadoras
        </h1>
        <p className="text-muted-foreground mt-1">
          Cadastro, áreas de atendimento por cidade e importação de tabelas de cotação (CSV ou Excel).
        </p>
      </div>

      <Card className="border-emerald-500/20 bg-emerald-500/5">
        <CardHeader>
          <CardTitle className="text-emerald-600 flex items-center gap-2">
            <Plus className="w-5 h-5" /> Nova transportadora
          </CardTitle>
          <CardDescription>Os mesmos dados que existiam em Configurações.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Nome fantasia</Label>
              <Input value={newShip.nome} onChange={(e) => setNewShip({ ...newShip, nome: e.target.value })} placeholder="Ex.: Jadlog" />
            </div>
            <div className="space-y-2">
              <Label>Razão social</Label>
              <Input value={newShip.razao_social} onChange={(e) => setNewShip({ ...newShip, razao_social: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>CPF / CNPJ</Label>
              <div className="flex gap-1">
                <Input value={newShip.documento} onChange={(e) => setNewShip({ ...newShip, documento: e.target.value })} />
                <Button type="button" variant="outline" size="icon" onClick={searchCNPJ}>
                  <Search className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Inscrição estadual</Label>
              <Input value={newShip.inscricao_estadual} onChange={(e) => setNewShip({ ...newShip, inscricao_estadual: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Contato</Label>
              <Input value={newShip.contato} onChange={(e) => setNewShip({ ...newShip, contato: e.target.value })} />
            </div>
          </div>
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleAddCarrier} disabled={loading}>
            <Save className="w-4 h-4 mr-2" />
            {loading ? "Salvando…" : "Salvar transportadora"}
          </Button>

          <div className="pt-4 border-t border-emerald-500/10 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {carriers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                      Nenhuma transportadora cadastrada.
                    </TableCell>
                  </TableRow>
                ) : (
                  carriers.map((item) => (
                    <TableRow key={item.id} className={selectedId === item.id ? "bg-emerald-500/10" : undefined}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-bold">{item.nome}</span>
                          <span className="text-[10px] text-muted-foreground uppercase">{item.razao_social || "—"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{item.documento || "—"}</TableCell>
                      <TableCell className="text-xs">{item.contato || "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => setSelectedId(item.id)}>
                          Áreas
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteCarrier(item.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <Card className="lg:col-span-4 border-border/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPinned className="w-4 h-4" /> Lista
            </CardTitle>
            <Input placeholder="Buscar…" value={filterList} onChange={(e) => setFilterList(e.target.value)} className="mt-2" />
          </CardHeader>
          <CardContent className="max-h-[480px] overflow-y-auto space-y-1 pr-1">
            {filteredCarriers.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                className={cn(
                  "w-full text-left rounded-lg border px-3 py-2.5 text-sm transition-colors",
                  selectedId === c.id ? "border-emerald-500 bg-emerald-500/10" : "border-border hover:bg-muted/60"
                )}
              >
                <div className="font-semibold truncate">{c.nome}</div>
                <div className="text-[11px] text-muted-foreground">{cityCounts[c.id] ?? 0} cidade(s)</div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-8 border-border/80 min-h-[400px]">
          <CardHeader>
            <CardTitle className="text-lg">
              {selected ? (
                <>
                  {selected.nome}
                  <span className="text-sm font-normal text-muted-foreground ml-2">— cidades atendidas</span>
                </>
              ) : (
                "Selecione uma transportadora"
              )}
            </CardTitle>
            {selected && (
              <CardDescription>
                Importe uma planilha com colunas <strong>UF</strong> e <strong>Cidade</strong> (ou Município). Opcionais:{" "}
                <strong>Valor</strong> / <strong>Frete</strong>, <strong>Prazo</strong> / <strong>Prazo_dias</strong>. Depois use{" "}
                <em>Salvar áreas</em> para gravar no banco.
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            {!selected ? (
              <p className="text-muted-foreground text-sm">Clique em uma transportadora na lista à esquerda ou na tabela acima em &quot;Áreas&quot;.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="import-cotacao">Importar cotação (.csv, .xlsx)</Label>
                    <div className="flex items-center gap-2">
                      <input
                        id="import-cotacao"
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        className="hidden"
                        onChange={(e) => {
                          handleImportFile(e.target.files?.[0] ?? null)
                          e.target.value = ""
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="gap-2"
                        onClick={() => document.getElementById("import-cotacao")?.click()}
                      >
                        <Upload className="w-4 h-4" />
                        Escolher arquivo
                      </Button>
                    </div>
                  </div>
                  <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={salvarCidades} disabled={loading}>
                    <Save className="w-4 h-4 mr-2" />
                    Salvar áreas
                  </Button>
                </div>

                <div>
                  <Label className="mb-2 block">Filtrar estados</Label>
                  <Input placeholder="Sigla ou nome (ex.: sp, são paulo)" value={ufSearch} onChange={(e) => setUfSearch(e.target.value)} className="max-w-md" />
                </div>

                <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
                  {ufsFiltered.map((u) => {
                    const isOpen = openUf === u.sigla
                    const count = selectedByUf[u.sigla]?.size ?? 0
                    const list = municipiosCache[u.sigla]
                    const loadingThis = loadingUf === u.sigla
                    const qCity = cityFilter[u.sigla] ?? ""
                    const filteredCities = list?.filter((m) => {
                      if (!qCity.trim()) return true
                      return m.nome.toLowerCase().includes(qCity.toLowerCase().trim())
                    })

                    return (
                      <div key={u.sigla} className="rounded-lg border border-border bg-card/30">
                        <button
                          type="button"
                          onClick={() => toggleUfOpen(u.sigla)}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-muted/50 rounded-t-lg"
                        >
                          <span className="font-medium">
                            {u.sigla} — {u.nome}
                            <span className="text-muted-foreground text-xs ml-2">({count} selecionada(s))</span>
                          </span>
                          <ChevronDown className={cn("w-4 h-4 shrink-0 transition-transform", isOpen && "rotate-180")} />
                        </button>
                        {isOpen && (
                          <div className="px-3 pb-3 border-t border-border space-y-3">
                            {loadingThis ? (
                              <p className="text-sm text-muted-foreground py-2">Carregando cidades…</p>
                            ) : list && list.length > 0 ? (
                              <>
                                <div className="flex flex-wrap gap-2 pt-2">
                                  <Button type="button" size="sm" variant="secondary" onClick={() => marcarTodasUf(u.sigla)}>
                                    Selecionar todas as cidades
                                  </Button>
                                  <Button type="button" size="sm" variant="outline" onClick={() => desmarcarTodasUf(u.sigla)}>
                                    Limpar estado
                                  </Button>
                                </div>
                                <Input
                                  placeholder="Filtrar cidades neste estado…"
                                  value={qCity}
                                  onChange={(e) => setCityFilter((prev) => ({ ...prev, [u.sigla]: e.target.value }))}
                                  className="max-w-md"
                                />
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 max-h-64 overflow-y-auto border rounded-md p-2 bg-muted/20">
                                  {filteredCities?.map((m) => {
                                    const checked = selectedByUf[u.sigla]?.has(m.id) ?? false
                                    return (
                                      <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer">
                                        <input
                                          type="checkbox"
                                          className="h-4 w-4 rounded border-gray-300"
                                          checked={checked}
                                          onChange={() => toggleCity(u.sigla, m.id)}
                                        />
                                        <span className="truncate">{m.nome}</span>
                                      </label>
                                    )
                                  })}
                                </div>
                              </>
                            ) : (
                              <p className="text-sm text-destructive">Não foi possível carregar municípios.</p>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
