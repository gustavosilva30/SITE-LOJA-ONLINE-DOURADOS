import { useRef, useState, useCallback } from "react"
import {
  Upload, FileText, Image, FilePlus2, Minimize2, Merge,
  Download, X, CheckCircle2, Loader2, AlertCircle,
  Table2, Scissors, Sparkles, FileImage,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getApiBaseUrl } from "@/lib/apiBase"
import { getAuthToken } from "@/lib/auth"
import { cn } from "@/lib/utils"

const API = () => `${getApiBaseUrl()}/api/conversor`

const MODOS = [
  {
    id: "doc-pdf", label: "Documento → PDF", icon: FileText, saida: "pdf",
    accept: ".doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.rtf,.txt,.csv",
    desc: "Word, Excel, PowerPoint, ODT, RTF...",
    color: "blue",
  },
  {
    id: "img-pdf", label: "Imagem → PDF", icon: Image, saida: "pdf",
    accept: ".jpg,.jpeg,.png,.webp,.bmp,.tiff,.tif,.heic,.heif",
    desc: "JPG, PNG, WEBP, HEIC e mais",
    color: "indigo",
  },
  {
    id: "pdf-jpg", label: "PDF → Imagem", icon: FileImage, saida: "jpg",
    accept: ".pdf",
    desc: "Cada página vira uma imagem JPG",
    color: "purple",
  },
  {
    id: "pdf-comp", label: "Comprimir PDF", icon: Minimize2, saida: "comprimir",
    accept: ".pdf",
    desc: "Reduz o tamanho do arquivo PDF",
    color: "orange",
  },
  {
    id: "merge", label: "Mesclar PDFs", icon: Merge, saida: "merge",
    accept: ".pdf",
    desc: "Une vários PDFs em um só", multi: true,
    color: "green",
  },
  {
    id: "pdf-excel", label: "PDF → Excel", icon: Table2, saida: "excel",
    accept: ".pdf",
    desc: "Extrai tabelas e dados para planilha",
    color: "emerald",
  },
  {
    id: "heic-jpg", label: "HEIC → JPG", icon: FileImage, saida: "jpg",
    accept: ".heic,.heif",
    desc: "Converte fotos de iPhone para JPG",
    color: "pink",
  },
  {
    id: "otimizar", label: "Otimizar Imagem", icon: Sparkles, saida: "otimizar",
    accept: ".jpg,.jpeg,.png,.webp,.bmp,.tiff,.tif,.heic,.heif",
    desc: "Reduz o peso mantendo qualidade",
    color: "amber",
    hasQuality: true,
  },
  {
    id: "dividir", label: "Dividir PDF", icon: Scissors, saida: "dividir",
    accept: ".pdf",
    desc: "Extrai páginas específicas do PDF",
    color: "red",
    hasPages: true,
  },
] as const

type Modo = typeof MODOS[number]

const COLOR_MAP: Record<string, string> = {
  blue:    "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  indigo:  "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400",
  purple:  "border-purple-500 bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400",
  orange:  "border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400",
  green:   "border-green-500 bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400",
  emerald: "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  pink:    "border-pink-500 bg-pink-50 text-pink-700 dark:bg-pink-950/40 dark:text-pink-400",
  amber:   "border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  red:     "border-red-500 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400",
}

interface ConvResult {
  url: string
  filename: string
  reducao?: string
}

interface FilePreview {
  file: File
  previewUrl?: string
}

function getFileIcon(file: File) {
  if (file.type.startsWith("image/") || /\.(heic|heif)$/i.test(file.name)) return "img"
  if (file.type === "application/pdf" || file.name.endsWith(".pdf")) return "pdf"
  return "doc"
}

function DropZone({
  accept, multi, onFiles,
}: {
  accept: string; multi?: boolean; onFiles: (files: File[]) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handle = (files: FileList | null) => {
    if (!files) return
    onFiles(Array.from(files))
  }

  return (
    <div
      className={cn(
        "border-2 border-dashed rounded-xl p-8 sm:p-10 text-center cursor-pointer transition-colors",
        dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"
      )}
      onClick={() => inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); handle(e.dataTransfer.files) }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multi}
        className="hidden"
        onChange={e => handle(e.target.files)}
      />
      <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
      <p className="font-semibold text-sm">Arraste o arquivo aqui ou clique para selecionar</p>
      <p className="text-xs text-muted-foreground mt-1">Máximo 50 MB por arquivo</p>
    </div>
  )
}

function FileCard({ fp, onRemove }: { fp: FilePreview; onRemove: () => void }) {
  const kind = getFileIcon(fp.file)
  return (
    <div className="flex items-center gap-3 bg-muted/40 rounded-lg px-3 py-2">
      {/* Miniatura */}
      <div className="w-10 h-10 rounded shrink-0 overflow-hidden bg-muted flex items-center justify-center">
        {kind === "img" && fp.previewUrl ? (
          <img src={fp.previewUrl} alt="" className="w-full h-full object-cover" />
        ) : kind === "pdf" ? (
          <FileText className="w-5 h-5 text-red-500" />
        ) : (
          <FileText className="w-5 h-5 text-blue-500" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate font-medium">{fp.file.name}</p>
        <p className="text-xs text-muted-foreground">{(fp.file.size / 1024 / 1024).toFixed(2)} MB</p>
      </div>
      <button onClick={onRemove} className="text-muted-foreground hover:text-destructive shrink-0">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
      <div
        className="h-full bg-primary transition-all duration-300 rounded-full"
        style={{ width: `${value}%` }}
      />
    </div>
  )
}

export function Conversor() {
  const [modo, setModo] = useState<Modo>(MODOS[0])
  const [filePreviews, setFilePreviews] = useState<FilePreview[]>([])
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<ConvResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [qualidade, setQualidade] = useState(75)
  const [paginas, setPaginas] = useState("")

  const token = getAuthToken()

  const reset = () => { setFilePreviews([]); setResult(null); setError(null); setProgress(0) }
  const changeModo = (m: Modo) => { setModo(m); reset() }

  const addFiles = useCallback((newFiles: File[]) => {
    const previews: FilePreview[] = newFiles.map(file => {
      const kind = getFileIcon(file)
      let previewUrl: string | undefined
      if (kind === "img") {
        previewUrl = URL.createObjectURL(file)
      }
      return { file, previewUrl }
    })
    setFilePreviews(prev => (modo as any).multi ? [...prev, ...previews] : previews)
  }, [modo])

  const removeFile = (i: number) => {
    setFilePreviews(prev => {
      const copy = [...prev]
      if (copy[i].previewUrl) URL.revokeObjectURL(copy[i].previewUrl!)
      copy.splice(i, 1)
      return copy
    })
  }

  // Simula progresso enquanto aguarda resposta
  const startFakeProgress = () => {
    setProgress(5)
    let p = 5
    const interval = setInterval(() => {
      p += Math.random() * 12
      if (p >= 90) { clearInterval(interval); setProgress(90); return }
      setProgress(Math.round(p))
    }, 400)
    return () => clearInterval(interval)
  }

  const converter = async () => {
    if (filePreviews.length === 0) return
    setLoading(true)
    setError(null)
    setResult(null)

    const stopProgress = startFakeProgress()

    try {
      const base = API()
      let resp: Response
      const files = filePreviews.map(fp => fp.file)

      if (modo.saida === "merge") {
        const fd = new FormData()
        files.forEach(f => fd.append("files", f))
        resp = await fetch(`${base}/mesclar-pdfs`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        })
      } else {
        const fd = new FormData()
        fd.append("file", files[0])
        fd.append("saida", modo.saida)
        if ("hasQuality" in modo && modo.hasQuality) fd.append("qualidade", String(qualidade))
        if ("hasPages" in modo && modo.hasPages) fd.append("paginas", paginas)
        resp = await fetch(`${base}/converter`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        })
      }

      stopProgress()

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: "Erro desconhecido" }))
        throw new Error(err.detail || `Erro ${resp.status}`)
      }

      setProgress(100)

      const blob = await resp.blob()
      const disposition = resp.headers.get("content-disposition") || ""
      const match = disposition.match(/filename="?([^"]+)"?/)
      const filename = match?.[1] || "arquivo_convertido"
      const reducao = resp.headers.get("x-reducao-percent") || undefined

      setResult({ url: URL.createObjectURL(blob), filename, reducao })
    } catch (e: any) {
      stopProgress()
      setError(e.message || "Erro na conversão")
      setProgress(0)
    } finally {
      setLoading(false)
    }
  }

  const download = () => {
    if (!result) return
    const a = document.createElement("a")
    a.href = result.url
    a.download = result.filename
    a.click()
  }

  const files = filePreviews.map(fp => fp.file)
  const canConvert = files.length > 0 && (!("multi" in modo && modo.multi) || files.length >= 2) &&
    (!("hasPages" in modo && modo.hasPages) || paginas.trim().length > 0)

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
          <FilePlus2 className="w-7 h-7 sm:w-8 sm:h-8 text-primary" />
          Conversor de Arquivos
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">Converta documentos, imagens e PDFs de forma rápida e segura.</p>
      </div>

      {/* Seleção de modo — grid responsivo */}
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
        {MODOS.map(m => {
          const Icon = m.icon
          const active = modo.id === m.id
          return (
            <button
              key={m.id}
              onClick={() => changeModo(m)}
              className={cn(
                "flex flex-col items-center gap-1.5 p-2.5 sm:p-3 rounded-xl border-2 text-[11px] sm:text-xs font-semibold transition-all text-center leading-tight",
                active
                  ? COLOR_MAP[m.color]
                  : "border-border hover:border-primary/40 hover:bg-muted/30 text-muted-foreground"
              )}
            >
              <Icon className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
              <span>{m.label}</span>
            </button>
          )
        })}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            <modo.icon className="w-4 h-4 text-primary shrink-0" />
            {modo.label}
            <span className="text-xs font-normal text-muted-foreground">— {modo.desc}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {result ? (
            <div className="flex flex-col items-center gap-4 py-6">
              <CheckCircle2 className="w-14 h-14 text-green-500" />
              <div className="text-center">
                <p className="font-bold text-lg">Conversão concluída!</p>
                <p className="text-sm text-muted-foreground break-all">{result.filename}</p>
                {result.reducao && (
                  <p className="text-xs text-green-600 font-semibold mt-1">
                    Redução de {result.reducao}% no tamanho
                  </p>
                )}
              </div>
              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <Button onClick={download} className="gap-2">
                  <Download className="w-4 h-4" /> Baixar arquivo
                </Button>
                <Button variant="outline" onClick={reset}>
                  <X className="w-4 h-4 mr-1" /> Nova conversão
                </Button>
              </div>
            </div>
          ) : (
            <>
              <DropZone
                accept={modo.accept}
                multi={"multi" in modo && modo.multi ? true : undefined}
                onFiles={addFiles}
              />

              {/* Previews */}
              {filePreviews.length > 0 && (
                <div className="space-y-1.5">
                  {filePreviews.map((fp, i) => (
                    <FileCard key={i} fp={fp} onRemove={() => removeFile(i)} />
                  ))}
                </div>
              )}

              {/* Slider de qualidade (modo otimizar) */}
              {"hasQuality" in modo && modo.hasQuality && (
                <div className="space-y-2 p-3 rounded-lg bg-muted/30 border">
                  <div className="flex justify-between items-center text-sm font-medium">
                    <span>Qualidade da imagem</span>
                    <span className={cn(
                      "font-bold",
                      qualidade >= 80 ? "text-green-600" : qualidade >= 50 ? "text-amber-600" : "text-red-600"
                    )}>
                      {qualidade}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={20}
                    max={95}
                    value={qualidade}
                    onChange={e => setQualidade(Number(e.target.value))}
                    className="w-full accent-primary"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Menor tamanho</span>
                    <span>Maior qualidade</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {qualidade >= 80
                      ? "Alta qualidade — redução moderada (~20-40%)"
                      : qualidade >= 55
                      ? "Balanceado — redução média (~40-60%)"
                      : "Compressão agressiva — redução máxima (>60%)"}
                  </p>
                </div>
              )}

              {/* Campo de páginas (modo dividir) */}
              {"hasPages" in modo && modo.hasPages && (
                <div className="space-y-1.5 p-3 rounded-lg bg-muted/30 border">
                  <label className="text-sm font-medium">Intervalo de páginas</label>
                  <input
                    type="text"
                    placeholder="Ex: 1-3, 5, 7-9"
                    value={paginas}
                    onChange={e => setPaginas(e.target.value)}
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <p className="text-xs text-muted-foreground">
                    Use vírgula para separar intervalos. Ex: <strong>1-3, 5, 8-10</strong>
                  </p>
                </div>
              )}

              {/* Barra de progresso */}
              {loading && (
                <div className="space-y-1.5">
                  <ProgressBar value={progress} />
                  <p className="text-xs text-muted-foreground text-center">
                    Convertendo... {progress}%
                  </p>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              <Button
                onClick={converter}
                disabled={loading || !canConvert}
                className="w-full gap-2 h-11 font-bold"
              >
                {loading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Convertendo...</>
                  : <><FilePlus2 className="w-4 h-4" /> Converter</>
                }
              </Button>

              {"multi" in modo && modo.multi && files.length > 0 && files.length < 2 && (
                <p className="text-xs text-muted-foreground text-center">
                  Adicione pelo menos 2 PDFs para mesclar
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
