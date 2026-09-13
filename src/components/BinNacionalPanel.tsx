import React, { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { binApi } from "@/lib/api"
import { getApiBaseUrl } from "@/lib/apiBase"
import { fmtDateTimeShort } from "@/lib/format"
import QRCode from "qrcode"
import {
  Search,
  History,
  Clock,
  User,
  ShieldCheck,
  CreditCard,
  RefreshCw,
  AlertTriangle,
  Landmark,
  Globe2,
  Tag,
  FileJson,
  Wallet,
  QrCode,
  CheckCircle2,
  Copy,
} from "lucide-react"

/** Igual ao Busca Placa — QR gerado localmente quando a API não envia imagem. */
function QrCodeCanvas({ value, size = 200 }: { value: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!canvasRef.current || !value) return
    QRCode.toCanvas(canvasRef.current, value, {
      width: size,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    }).catch(console.error)
  }, [value, size])
  return <canvas ref={canvasRef} className="border-2 rounded-xl bg-white" />
}

interface BalanceInfo {
  credits: number | null
  raw?: unknown
}

interface PixPayment {
  pixCopiaECola: string | null
  qrCodeImageUrl: string | null
  expireDate: string | null
  amount: number
  raw?: unknown
}

type BinSearchRow = {
  id: string
  bin: string
  atendente_id: string | null
  dados_completos: Record<string, unknown> | null
  created_at: string
}

function labelize(k: string) {
  return k
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^\w/, (c) => c.toUpperCase())
}

function renderVal(v: unknown): string {
  if (v === null || v === undefined) return "—"
  if (typeof v === "object") return JSON.stringify(v, null, 2)
  return String(v)
}

export interface BinNacionalPanelProps {
  /** Dentro da Central de Consultas: ocupa só o conteúdo da aba (sem cabeçalho global duplicado). */
  embedded?: boolean
  /** Reabre um resultado a partir do histórico unificado (Central de Consultas). */
  externalBinReplay?: { bin: string; payload: Record<string, unknown> } | null
  onExternalBinReplayConsumed?: () => void
}

export function BinNacionalPanel({
  embedded = false,
  externalBinReplay = null,
  onExternalBinReplayConsumed,
}: BinNacionalPanelProps) {
  const [binInput, setBinInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [history, setHistory] = useState<BinSearchRow[]>([])
  const [balance, setBalance] = useState<BalanceInfo | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [showPixModal, setShowPixModal] = useState(false)
  const [pixData, setPixData] = useState<PixPayment | null>(null)
  const [pixLoading, setPixLoading] = useState(false)
  const [rechargeValue, setRechargeValue] = useState("1000")
  const [copiedPix, setCopiedPix] = useState(false)
  const [selected, setSelected] = useState<{
    bin: string
    payload: Record<string, unknown>
    meta?: { created_at?: string; id?: string }
  } | null>(null)

  const fetchBalance = async () => {
    setBalanceLoading(true)
    try {
      const data = await binApi.balance()
      const creditsVal =
        data?.credits ?? data?.dados?.Saldo ?? data?.dados?.credits ?? data?.saldo ?? data?.Saldo ?? null
      setBalance({ credits: creditsVal, raw: data })
    } catch (e) {
      console.error("[BinNacionalPanel] Erro ao buscar saldo:", e)
    } finally {
      setBalanceLoading(false)
    }
  }

  const fetchHistory = useCallback(async () => {
    try {
      const data = await binApi.historico(30)
      if (Array.isArray(data)) setHistory(data as BinSearchRow[])
    } catch (e) {
      console.error("[BinNacionalPanel] fetchHistory:", e)
    }
  }, [])

  useEffect(() => {
    fetchHistory()
    fetchBalance()
  }, [fetchHistory])

  useEffect(() => {
    if (!externalBinReplay) return
    setSelected({
      bin: externalBinReplay.bin,
      payload: externalBinReplay.payload,
      meta: undefined,
    })
    onExternalBinReplayConsumed?.()
  }, [externalBinReplay, onExternalBinReplayConsumed])

  const handleGeneratePix = async () => {
    const valueCents = parseInt(rechargeValue, 10)
    if (Number.isNaN(valueCents) || valueCents < 100) {
      toast.error("Valor mínimo: R$ 1,00 (100 centavos)")
      return
    }
    setPixLoading(true)
    try {
      const data = await binApi.payment(valueCents)
      setPixData(data as PixPayment)
    } catch (e: unknown) {
      toast.error("Erro ao gerar PIX: " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setPixLoading(false)
    }
  }

  const copyPix = (text: string) => {
    void navigator.clipboard.writeText(text)
    setCopiedPix(true)
    setTimeout(() => setCopiedPix(false), 2000)
  }

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const digits = binInput.replace(/\D/g, "").slice(0, 16)
    if (digits.length < 6 || loading) return

    setLoading(true)
    setErrorMsg(null)
    setBinInput("")

    try {
      const data = (await binApi.consultar(digits)) as Record<string, unknown>
      setSelected({
        bin: digits,
        payload: data,
      })
      setTimeout(() => {
        fetchHistory()
        fetchBalance()
      }, 2000)
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Não foi possível consultar o BIN. Tente novamente em instantes."
      setErrorMsg(msg)
      setBinInput(digits)
    } finally {
      setLoading(false)
    }
  }

  const dados = selected?.payload?.dados
  const dadosObj =
    dados && typeof dados === "object" && !Array.isArray(dados) ? (dados as Record<string, unknown>) : null

  const highlight = (keyVariants: string[]) => {
    if (!dadosObj) return undefined
    for (const k of keyVariants) {
      if (dadosObj[k] !== undefined && dadosObj[k] !== null && dadosObj[k] !== "") return dadosObj[k]
    }
    const lower = Object.fromEntries(Object.entries(dadosObj).map(([k, v]) => [k.toLowerCase(), v]))
    for (const k of keyVariants) {
      const x = lower[k.toLowerCase()]
      if (x !== undefined && x !== null && x !== "") return x
    }
    return undefined
  }

  const bandeira = highlight(["bandeira", "Bandeira", "brand", "marca"])
  const banco = highlight(["banco", "Banco", "issuer", "emissor", "banco_emissor"])
  const tipo = highlight(["tipo", "Tipo", "tipo_cartao", "product_type", "cartao"])
  const pais = highlight(["pais", "País", "country", "país"])

  const saldoDisplayValue = balance?.credits
  const pixCode = pixData?.pixCopiaECola || ""
  const qrCodeUrl = pixData?.qrCodeImageUrl || null

  const shellClass = embedded ? "space-y-6" : "p-6 space-y-6 max-w-7xl mx-auto"

  return (
    <div className={shellClass}>
      {!embedded && (
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              Consulta BIN Nacional
            </h1>
            <p className="text-muted-foreground text-sm flex items-center gap-2 mt-1">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              Dados do cartão via API Full — <span className="font-semibold text-foreground">R$ 3,00</span> por consulta —
              histórico salvo automaticamente
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap justify-end">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-card border rounded-xl shadow-sm">
              <Wallet className="w-4 h-4 text-emerald-500" />
              <div className="text-right">
                <div className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Saldo API</div>
                <div className="font-black text-xl leading-none">
                  {balanceLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin inline" />
                  ) : saldoDisplayValue !== null && saldoDisplayValue !== undefined ? (
                    <span className={Number(saldoDisplayValue) < 10 ? "text-rose-500" : "text-emerald-600"}>
                      {typeof saldoDisplayValue === "number" && saldoDisplayValue % 1 !== 0
                        ? `R$ ${saldoDisplayValue.toFixed(2).replace(".", ",")}`
                        : saldoDisplayValue}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </div>
                <div className="text-[9px] uppercase text-muted-foreground/60 font-black tracking-tighter">
                  {typeof saldoDisplayValue === "number" && saldoDisplayValue % 1 !== 0 ? "Saldo em R$" : "Créditos"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => fetchBalance()}
                className="p-1 rounded hover:bg-muted transition-colors ml-1"
                title="Atualizar saldo"
              >
                <RefreshCw className="w-3 h-3 text-muted-foreground" />
              </button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPixModal(true)}
              className="gap-2 border-emerald-500/40 text-emerald-700 hover:bg-emerald-50"
            >
              <QrCode className="w-4 h-4" />
              Recarregar via PIX
            </Button>
          </div>
        </header>
      )}

      {embedded && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground flex flex-wrap items-center gap-2 justify-between">
          <span className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-primary shrink-0" />
            <span>
              BIN Nacional — <strong className="text-foreground">R$ 3,00</strong> por consulta (saldo API Full acima).
            </span>
          </span>
          <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => setShowPixModal(true)}>
            <QrCode className="w-3 h-3" /> Recarregar saldo (PIX)
          </Button>
        </div>
      )}

      {errorMsg && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-4 flex gap-3 items-start">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-destructive text-sm">Não foi possível concluir a consulta</p>
              <p className="text-sm text-muted-foreground mt-1">{errorMsg}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-6">
          <Card className="border-primary/20 shadow-lg shadow-primary/5 overflow-hidden">
            <div className="h-1.5 bg-primary w-full" />
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Search className="w-5 h-5 text-primary" />
                Nova consulta
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSearch} className="flex gap-2">
                <Input
                  placeholder="6 a 16 dígitos"
                  inputMode="numeric"
                  autoComplete="off"
                  value={binInput}
                  onChange={(e) => setBinInput(e.target.value.replace(/\D/g, ""))}
                  className="font-mono text-lg tracking-widest h-12"
                  maxLength={16}
                />
                <Button type="submit" size="lg" disabled={loading || binInput.replace(/\D/g, "").length < 6} className="h-12 px-6">
                  {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                </Button>
              </form>
              <p className="text-[10px] text-muted-foreground mt-2 text-center">
                Informe o BIN (início do número do cartão). Cada consulta custa{" "}
                <span className="font-bold text-foreground">R$ 3,00</span> do saldo API Full.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <History className="w-4 h-4" />
                Consultas recentes
              </CardTitle>
              <button type="button" onClick={fetchHistory} className="p-1 rounded hover:bg-muted transition-colors" title="Recarregar histórico">
                <RefreshCw className="w-3 h-3 text-muted-foreground" />
              </button>
            </CardHeader>
            <CardContent className="px-2 max-h-[500px] overflow-y-auto">
              <div className="space-y-1">
                {history.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      setSelected({
                        bin: item.bin,
                        payload: (item.dados_completos || {}) as Record<string, unknown>,
                        meta: { created_at: item.created_at, id: item.id },
                      })
                    }
                    className={`w-full text-left p-3 rounded-lg transition-all hover:bg-muted flex items-center justify-between group ${
                      selected?.meta?.id === item.id ? "bg-primary/10 border-l-4 border-primary" : ""
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-mono font-black text-lg tracking-wider group-hover:text-primary transition-colors leading-none">
                        {item.bin}
                      </div>
                      <div className="text-[10px] text-muted-foreground flex items-center gap-2 mt-1">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 opacity-50" />
                          {fmtDateTimeShort(item.created_at)}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
                {history.length === 0 && (
                  <div className="p-8 text-center text-muted-foreground italic text-sm">Nenhuma consulta registrada ainda.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-8">
          {selected ? (
            <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-400">
              <div className="flex items-center justify-between bg-card p-4 rounded-xl border shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-10 rounded-lg border-2 bg-gradient-to-br from-slate-800 to-slate-600 flex items-center justify-center shadow-inner">
                    <CreditCard className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold uppercase tracking-tight font-mono">{selected.bin}</h2>
                    <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                      {selected.meta?.created_at && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {fmtDateTimeShort(selected.meta.created_at)}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-black uppercase text-primary flex items-center gap-2">
                      <Tag className="w-4 h-4" /> Resumo
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-2 space-y-1.5">
                    {(
                      [
                        ["Bandeira", bandeira],
                        ["Banco emissor", banco],
                        ["Tipo de cartão", tipo],
                        ["País", pais],
                      ] as [string, unknown][]
                    ).map(([label, value]) => (
                      <div
                        key={String(label)}
                        className="flex justify-between items-center py-1.5 border-b border-border/40 last:border-0 gap-2"
                      >
                        <span className="text-[10px] text-muted-foreground font-bold uppercase shrink-0">{label}</span>
                        <span className="text-xs font-bold text-right break-all">{renderVal(value)}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-black uppercase text-amber-600 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4" /> Status da API
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-2 space-y-1.5">
                    {["status", "mensagem", "message"].map((k) => {
                      const v = selected.payload[k]
                      if (v === undefined) return null
                      return (
                        <div key={k} className="flex justify-between gap-2 py-1.5 border-b border-border/40 last:border-0">
                          <span className="text-[10px] text-muted-foreground font-bold uppercase">{labelize(k)}</span>
                          <span className="text-xs font-bold text-right break-all">{renderVal(v)}</span>
                        </div>
                      )
                    })}
                  </CardContent>
                </Card>
              </div>

              {dadosObj && Object.keys(dadosObj).length > 0 && (
                <Card>
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs font-black uppercase flex items-center gap-2">
                      <Landmark className="w-4 h-4 text-primary" />
                      Dados completos (API)
                    </CardTitle>
                    <Globe2 className="w-4 h-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent className="pt-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {Object.entries(dadosObj).map(([k, v]) => (
                        <div key={k} className="flex flex-col gap-0.5 p-2 rounded-md border border-border/50 bg-muted/30">
                          <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wide">{labelize(k)}</span>
                          <span className="text-xs font-semibold break-words whitespace-pre-wrap">{renderVal(v)}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card className="border-muted">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-black uppercase text-muted-foreground flex items-center gap-2">
                    <FileJson className="w-4 h-4" /> Resposta bruta
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="text-[11px] leading-relaxed overflow-x-auto p-4 rounded-lg bg-muted/50 border max-h-[320px] overflow-y-auto">
                    {JSON.stringify(selected.payload, null, 2)}
                  </pre>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card className="min-h-[320px] flex items-center justify-center text-muted-foreground border-dashed">
              <div className="text-center px-6 py-12">
                <User className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Digite um BIN e clique em consultar para ver o resultado aqui.</p>
              </div>
            </Card>
          )}
        </div>
      </div>

      {showPixModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setShowPixModal(false)}
          role="presentation"
        >
          <div className="bg-card border rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <QrCode className="w-5 h-5 text-emerald-500" />
                  Recarregar Créditos via PIX
                </h2>
                <p className="text-xs text-muted-foreground mt-1">Pagamento direto à API Full</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowPixModal(false)
                  setPixData(null)
                }}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted transition-colors text-xl leading-none"
              >
                ×
              </button>
            </div>

            {!pixData ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-muted-foreground">Valor (em centavos)</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[1000, 5000, 10000].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setRechargeValue(String(v))}
                        className={`py-2 rounded-lg text-sm font-bold border transition-all ${
                          rechargeValue === String(v)
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border hover:bg-muted"
                        }`}
                      >
                        R$ {(v / 100).toFixed(2)}
                      </button>
                    ))}
                  </div>
                  <Input
                    type="number"
                    placeholder="Ou insira em centavos (ex: 2500 = R$25)"
                    value={rechargeValue}
                    onChange={(e) => setRechargeValue(e.target.value)}
                    className="mt-2"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Valor atual: <strong>R$ {(parseInt(rechargeValue || "0", 10) / 100).toFixed(2)}</strong>
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={handleGeneratePix}
                  disabled={pixLoading}
                  className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700"
                >
                  {pixLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
                  Gerar QR Code PIX
                </Button>
              </div>
            ) : (
              <div className="space-y-4 text-center">
                <div className="flex flex-col items-center gap-3">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                  <p className="text-sm font-semibold">PIX gerado! Escaneie ou copie o código.</p>
                  {qrCodeUrl ? (
                    <img src={qrCodeUrl} alt="QR Code PIX" className="w-52 h-52 border-2 rounded-xl object-contain bg-white p-2" />
                  ) : pixCode ? (
                    <QrCodeCanvas value={pixCode} size={200} />
                  ) : null}
                  {pixData?.expireDate && (
                    <p className="text-[10px] text-muted-foreground">
                      Vence em: <strong>{new Date(pixData.expireDate).toLocaleString("pt-BR")}</strong>
                    </p>
                  )}
                </div>
                {pixCode ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground font-bold uppercase">Pix Copia e Cola</p>
                    <div className="flex gap-2">
                      <div className="flex-1 p-2.5 bg-muted rounded-lg text-[10px] font-mono break-all text-left max-h-20 overflow-y-auto">
                        {pixCode}
                      </div>
                      <button
                        type="button"
                        onClick={() => copyPix(pixCode)}
                        className="p-2.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-colors shrink-0"
                        title="Copiar código PIX"
                      >
                        {copiedPix ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                    {copiedPix && <p className="text-[10px] text-emerald-600 font-bold">✓ Copiado!</p>}
                  </div>
                ) : null}
                <Button variant="outline" size="sm" type="button" onClick={() => setPixData(null)} className="w-full">
                  Gerar novo PIX
                </Button>
              </div>
            )}
            <div className="text-[10px] text-center text-muted-foreground border-t pt-3">
              Após confirmação do pagamento, o saldo será atualizado automaticamente pela API Full.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
