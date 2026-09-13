import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { FileSpreadsheet, ChevronDown, ChevronUp, Check, AlertTriangle, Loader2, Upload } from "lucide-react"
import { api } from "@/lib/api"
import { toast } from "sonner"

const COLUMN_SYNONYMS: Record<string, string[]> = {
  marca:       ["marca", "montadora", "fabricante", "brand"],
  modelo:      ["modelo", "model", "carro", "veiculo", "veículo"],
  familia:     ["familia", "família", "geracao", "geração", "gen", "generation"],
  versao:      ["versao", "versão", "trim", "acabamento"],
  motorizacao: ["motor", "motorização", "motorizacao", "engine"],
  ano_inicio:  ["ano_inicio", "ano inicio", "ano_ini"],
  ano_fim:     ["ano_fim", "ano fim", "ate", "até", "fim"],
  ano:         ["ano", "year", "anos", "período"],
}

const FIELD_LABELS: Record<string, string> = {
  marca:       "Marca *",
  modelo:      "Modelo *",
  familia:     "Geração",
  versao:      "Versão",
  motorizacao: "Motor",
  ano_inicio:  "Ano Início",
  ano_fim:     "Ano Fim",
  ano:         "Ano (1990/1994)",
}

function autoMap(headers: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [field, synonyms] of Object.entries(COLUMN_SYNONYMS)) {
    const match = headers.find(h =>
      synonyms.some(s => h.toLowerCase().trim().includes(s))
    )
    if (match) result[field] = match
  }
  return result
}

function parseAnoField(val: any): { ini: number | null; fim: number | null } {
  if (!val) return { ini: null, fim: null }
  const str = String(val).trim()
  const m = str.match(/^(\d{4})\s*[\/\-]\s*(\d{4})$/)
  if (m) return { ini: parseInt(m[1], 10), fim: parseInt(m[2], 10) }
  const n = parseInt(str, 10)
  if (!isNaN(n) && n > 1900 && n < 2100) return { ini: n, fim: n }
  return { ini: null, fim: null }
}

function buildRow(raw: any, mapping: Record<string, string>): any | null {
  const get = (field: string) => {
    const col = mapping[field]
    return col ? (raw[col] ?? null) : null
  }

  const marca  = String(get("marca")  || "").trim()
  const modelo = String(get("modelo") || "").trim()
  if (!marca || !modelo) return null

  let ano_inicio: number | null = null
  let ano_fim:    number | null = null

  const rawIni = get("ano_inicio")
  const rawFim = get("ano_fim")

  if (rawIni) ano_inicio = parseInt(String(rawIni), 10)
  if (rawFim) ano_fim    = parseInt(String(rawFim), 10)

  if (!ano_inicio) {
    const parsed = parseAnoField(get("ano"))
    ano_inicio = parsed.ini
    ano_fim    = ano_fim ?? parsed.fim
  }

  return {
    marca,
    modelo,
    familia:     String(get("familia")     || "").trim() || null,
    versao:      String(get("versao")      || "").trim() || null,
    motorizacao: String(get("motorizacao") || "").trim() || null,
    ano_inicio:  isNaN(ano_inicio as any) ? null : ano_inicio,
    ano_fim:     isNaN(ano_fim    as any) ? null : ano_fim,
    ano:         ano_inicio ? String(ano_inicio) : null,
  }
}

interface Props {
  onImportado?: () => void
}

export function ImportadorVeiculos({ onImportado }: Props) {
  const [open,       setOpen]       = useState(false)
  const [rows,       setRows]       = useState<any[]>([])
  const [headers,    setHeaders]    = useState<string[]>([])
  const [mapping,    setMapping]    = useState<Record<string, string>>({})
  const [fileName,   setFileName]   = useState("")
  const [loading,    setLoading]    = useState(false)
  const [result,     setResult]     = useState<{ inseridos: number; ignorados: number; erros: number } | null>(null)

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    setFileName(file.name)
    setResult(null)
    setRows([])
    setHeaders([])

    try {
      const XLSX  = await import("xlsx")
      const buf   = await file.arrayBuffer()
      const wb    = XLSX.read(buf)
      const ws    = wb.Sheets[wb.SheetNames[0]]
      const json: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" })

      if (!json.length) { toast.error("Planilha vazia"); return }

      const hdrsSet = new Set<string>()
      json.forEach((item: any) => {
        if (item && typeof item === 'object') {
          Object.keys(item).forEach(k => hdrsSet.add(k))
        }
      })
      const hdrs = Array.from(hdrsSet)
      setHeaders(hdrs)
      setRows(json)
      setMapping(autoMap(hdrs))
      toast.success(`${json.length} linhas carregadas`)
    } catch {
      toast.error("Erro ao ler planilha")
    }
  }, [])

  const updateMapping = useCallback((field: string, col: string) => {
    setMapping(prev => ({ ...prev, [field]: col }))
  }, [])

  const handleImport = useCallback(async () => {
    const toSend = rows.map(r => buildRow(r, mapping)).filter(Boolean)
    if (!toSend.length) {
      toast.error("Nenhuma linha válida — verifique Marca e Modelo")
      return
    }

    console.log("[importar] total válidas:", toSend.length, "exemplo:", toSend[0])
    setLoading(true)
    setResult(null)

    let totalInseridos = 0
    let totalIgnorados = 0
    let totalErros     = 0

    try {
      const CHUNK = 200
      for (let i = 0; i < toSend.length; i += CHUNK) {
        const chunk = toSend.slice(i, i + CHUNK)
        try {
          console.log("[importar] enviando chunk:", chunk.length, "linhas", chunk[0])
          const res = await api.post("/api/catalogo/versoes-veiculos/importar", { rows: chunk })
          console.log("[importar] resposta do backend:", res)
          
          // Backend pode retornar "inseridos" ou "inseridas" — aceitar os dois
          const ins = res?.inseridos ?? res?.inseridas ?? 0
          const ign = res?.ignorados ?? res?.ignoradas ?? (chunk.length - ins)
          
          totalInseridos += ins
          totalIgnorados += ign
        } catch (err: any) {
          console.error("[importar] erro no chunk:", err)
          totalErros += chunk.length
        }
      }

      setResult({ inseridos: totalInseridos, ignorados: totalIgnorados, erros: totalErros })

      if (totalInseridos > 0) {
        toast.success(`${totalInseridos} versões importadas!`)
        onImportado?.()
      } else if (totalErros > 0) {
        toast.error(`Falha: ${totalErros} erros. Veja o console.`)
      } else {
        toast.warning(`Nenhuma inserida — ${totalIgnorados} já existiam no banco.`)
      }
    } finally {
      setLoading(false)
    }
  }, [rows, mapping, onImportado])

  const preview    = rows.slice(0, 5).map(r => buildRow(r, mapping)).filter(Boolean)
  const validCount = rows.map(r => buildRow(r, mapping)).filter(Boolean).length
  const invalidCount = rows.length - validCount

  return (
    <div className="border rounded-lg bg-muted/20">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors rounded-lg"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2 font-bold text-sm">
          <FileSpreadsheet className="w-4 h-4 text-indigo-500" />
          Importar Versões via Planilha (Excel / CSV)
          {rows.length > 0 && <Badge variant="secondary">{rows.length} linhas</Badge>}
        </div>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {open && (
        <div className="border-t px-4 pb-4 pt-4 space-y-4">

          {/* Dica */}
          <div className="text-xs bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md p-3 text-blue-800 dark:text-blue-300">
            Colunas obrigatórias: <strong>Marca</strong> e <strong>Modelo</strong>. 
            Campo <strong>Ano</strong> aceita <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">1990/1994</code>.
            Campo <strong>Geração</strong> = família (G1, G2...).
          </div>

          {/* Upload */}
          <label className="block border-2 border-dashed border-indigo-400/40 rounded-xl p-6 text-center hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 transition-colors cursor-pointer">
            <Upload className="w-8 h-8 text-indigo-500 mx-auto mb-2" />
            {fileName
              ? <p className="text-sm font-bold text-indigo-600">{fileName}</p>
              : <p className="text-sm text-muted-foreground">Clique aqui — .xlsx, .xls ou .csv</p>
            }
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
          </label>

          {/* Mapeamento */}
          {headers.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-bold">Mapeamento de Colunas</p>
              <div className="grid grid-cols-2 gap-2">
                {Object.keys(COLUMN_SYNONYMS).map(field => (
                  <div key={field} className="flex items-center gap-2">
                    <span className="text-xs w-28 flex-shrink-0">{FIELD_LABELS[field]}</span>
                    <select
                      className="flex-1 h-8 rounded border border-input px-2 text-xs bg-background"
                      value={mapping[field] || ""}
                      onChange={e => updateMapping(field, e.target.value)}
                    >
                      <option value="">— ignorar —</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                    {mapping[field]
                      ? <Check className="w-3 h-3 text-green-500 flex-shrink-0" />
                      : <span className="w-3 flex-shrink-0" />
                    }
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preview */}
          {preview.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold">Prévia (5 primeiras linhas)</p>
                {invalidCount > 0 && (
                  <span className="flex items-center gap-1 text-xs text-amber-600">
                    <AlertTriangle className="w-3 h-3" /> {invalidCount} linhas sem Marca/Modelo serão ignoradas
                  </span>
                )}
              </div>
              <div className="overflow-x-auto border rounded text-xs">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      {["Marca","Modelo","Geração","Versão","Motor","Ano Ini","Ano Fim"].map(h => (
                        <th key={h} className="text-left px-2 py-1.5 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((p, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-2 py-1.5 font-bold">{p.marca}</td>
                        <td className="px-2 py-1.5">{p.modelo}</td>
                        <td className="px-2 py-1.5">{p.familia ?? "—"}</td>
                        <td className="px-2 py-1.5">{p.versao   ?? "—"}</td>
                        <td className="px-2 py-1.5">{p.motorizacao ?? "—"}</td>
                        <td className="px-2 py-1.5">{p.ano_inicio  ?? "—"}</td>
                        <td className="px-2 py-1.5">{p.ano_fim     ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Resultado */}
          {result && (
            <div className={`p-3 rounded border text-sm flex gap-4 ${result.erros > 0 ? "bg-red-50 border-red-200" : "bg-emerald-50 border-emerald-200"}`}>
              <span className="text-emerald-700 font-bold">✓ {result.inseridos} inseridas</span>
              {result.ignorados > 0 && <span className="text-amber-600 font-bold">⚠ {result.ignorados} já existiam</span>}
              {result.erros     > 0 && <span className="text-red-600 font-bold">✗ {result.erros} erros</span>}
            </div>
          )}

          {/* Botões */}
          {rows.length > 0 && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => { setRows([]); setHeaders([]); setMapping({}); setFileName(""); setResult(null) }}
              >
                Limpar
              </Button>
              <Button
                type="button"
                className="bg-indigo-600 hover:bg-indigo-700"
                disabled={loading || validCount === 0}
                onClick={handleImport}
              >
                {loading
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importando...</>
                  : <>Importar {validCount} versões</>
                }
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}