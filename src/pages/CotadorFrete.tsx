import { useState, useEffect } from "react"
import { 
  Truck, 
  MapPin, 
  Package, 
  Search, 
  Plus, 
  Trash2, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  ArrowRight,
  ChevronRight,
  ExternalLink,
  Calculator,
  Users
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { configuracoesApi } from "@/lib/api"
import { toast } from "sonner"
import { getApiBaseUrl } from "@/lib/apiBase"
import { cn } from "@/lib/utils"
import { getAuthToken } from "@/lib/auth"

type ShippingProduct = {
  id: string
  name: string
  width: number
  height: number
  length: number
  weight: number
  insurance_value: number
  quantity: number
}

type UnifiedQuoteRow = {
  id?: string | number
  name: string
  company: { name?: string | null; picture?: string | null }
  price: number | null
  delivery_time: number | null
  source?: "melhor_envio" | "frenet"
}

/** Logos locais (evita URLs externas bloqueadas ou 404 no painel). Arquivos em `public/shipping/`. */
function shippingPublicAsset(file: string): string {
    const base = import.meta.env.BASE_URL || "/"
    const root = base.endsWith("/") ? base : `${base}/`
    return `${root}${file.replace(/^\//, "")}`
}
const SHIPPING_LOGO_MELHOR_ENVIO = shippingPublicAsset("shipping/melhor-envio.svg")
const SHIPPING_LOGO_FRENET = shippingPublicAsset("shipping/frenet.svg")

function gatewayLogoSrc(source: UnifiedQuoteRow["source"]): string {
  return source === "frenet" ? SHIPPING_LOGO_FRENET : SHIPPING_LOGO_MELHOR_ENVIO
}

export function CotadorFrete() {
  const [loading, setLoading] = useState(false)
  const [companyDefaults, setCompanyDefaults] = useState<any>(null)
  const [fromCep, setFromCep] = useState("")
  const [toCep, setToCep] = useState("")
  const [products, setProducts] = useState<ShippingProduct[]>([
    { id: '1', name: 'Item 1', width: 20, height: 20, length: 20, weight: 1, insurance_value: 50, quantity: 1 }
  ])
  const [quotes, setQuotes] = useState<UnifiedQuoteRow[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchDefaults = async () => {
      const data = await configuracoesApi.obter()
      if (data && typeof data === "object" && Object.keys(data).length > 0) {
        setCompanyDefaults(data)
        setFromCep((data as { cep?: string }).cep || "")
      }
    }
    fetchDefaults()
  }, [])

  const addProduct = () => {
    const newId = (products.length + 1).toString()
    setProducts([...products, { 
      id: newId, 
      name: `Item ${newId}`, 
      width: 20, 
      height: 20, 
      length: 20, 
      weight: 1, 
      insurance_value: 50, 
      quantity: 1 
    }])
  }

  const removeProduct = (id: string) => {
    if (products.length === 1) return
    setProducts(products.filter(p => p.id !== id))
  }

  const updateProduct = (id: string, field: keyof ShippingProduct, value: any) => {
    setProducts(products.map(p => p.id === id ? { ...p, [field]: value } : p))
  }

  const handleQuote = async () => {
    console.log("Iniciando cotação de frete (ME + Frenet)...", { from: fromCep, to: toCep, products });
    
    if (!toCep || toCep.replace(/\D/g, '').length !== 8) {
      toast.error("Informe um CEP de destino válido.")
      return
    }
    if (!fromCep || fromCep.replace(/\D/g, '').length !== 8) {
      toast.error("Informe um CEP de origem válido.")
      return
    }

    setLoading(true)
    setError(null)
    setQuotes([])

    try {
      const token = getAuthToken()

      const payload = {
        from: { postal_code: fromCep.replace(/\D/g, '') },
        to: { postal_code: toCep.replace(/\D/g, '') },
        products: products.map(p => ({
          id: p.name || p.id,
          width: Number(p.width),
          height: Number(p.height),
          length: Number(p.length),
          weight: Number(p.weight),
          insurance_value: Number(p.insurance_value) > 0 ? Number(p.insurance_value) : 10, // Algumas transportadoras exigem valor mínimo de seguro
          quantity: Number(p.quantity)
        })),
        options: {
          receipt: false,
          own_hand: false
        }
        // Removido o filtro fixo "1,2,18" para permitir ver todas as opções disponíveis (ex: Jadlog 17, etc)
      }

      console.log("ME Shipping Payload Sent:", payload);

      const response = await fetch(`${getApiBaseUrl()}/api/shipping/cotar-paralelo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      })

      const result = await response.json()
      console.log("Shipping paralelo (ME + Frenet):", result);
      if (!response.ok) throw new Error(result?.error || 'Falha na cotação')

      const list = (result.quotes || []) as UnifiedQuoteRow[]
      setQuotes(list)

      const err = result.errors as { melhor_envio?: string; frenet?: string } | undefined
      if (err?.melhor_envio) toast.warning(`Melhor Envio: ${err.melhor_envio}`)
      if (err?.frenet) toast.warning(`Frenet: ${err.frenet}`)

      if (list.length === 0) {
        toast.warning("Nenhuma transportadora disponível para esta rota.")
      } else {
        const nMe = (result.quotes_melhor_envio as unknown[] | undefined)?.length ?? 0
        const nFr = (result.quotes_frenet as unknown[] | undefined)?.length ?? 0
        toast.success(`${list.length} opções (${nMe} Melhor Envio + ${nFr} Frenet).`)
      }
    } catch (e: any) {
      console.error(e)
      setError(e.message || "Erro ao conectar com a API de frete.")
      toast.error("Erro ao cotar frete.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Simulador de Frete</h1>
          <p className="text-muted-foreground mt-1">Realize cotações manuais multicanal para transportadoras.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="h-8 border-primary/20 bg-primary/5 text-primary">
            <Truck className="w-3 h-3 mr-1" /> Multi-Gateway Ativo
          </Badge>
          <Badge variant="secondary" className="h-8">
            v2.0
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Form Column */}
        <div className="lg:col-span-8 space-y-6">
          <Card className="border-border shadow-sm overflow-hidden">
            <div className="h-1 bg-primary w-full" />
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <CardTitle>Rota de Entrega</CardTitle>
                  <CardDescription>Configure os pontos de origem e destino.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="from_cep">CEP de Origem</Label>
                  <Input 
                    id="from_cep"
                    placeholder="00000-000"
                    value={fromCep}
                    onChange={(e) => setFromCep(String(e.target.value))}
                    className="h-11 font-mono text-base"
                  />
                  <p className="text-[10px] text-muted-foreground uppercase font-black">Empresa: {companyDefaults?.nome_fantasia || '...'}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="to_cep">CEP de Destino</Label>
                  <div className="relative">
                    <Input 
                      id="to_cep"
                      placeholder="00000-000"
                      value={toCep}
                      onChange={(e) => setToCep(String(e.target.value))}
                      className="h-11 font-mono text-base pr-10 border-primary/30"
                    />
                    <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary opacity-50" />
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <Label>Gateways (cotação em paralelo)</Label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
                  <div
                    className="flex flex-col items-center gap-2 p-3 rounded-xl border-2 border-primary bg-primary/5 text-left"
                  >
                    <img
                      src={SHIPPING_LOGO_MELHOR_ENVIO}
                      alt="Melhor Envio"
                      className="w-6 h-6"
                    />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-center">Melhor Envio</span>
                  </div>
                  <div
                    className="flex flex-col items-center gap-2 p-3 rounded-xl border-2 border-primary bg-primary/5 text-left"
                  >
                    <img
                      src={SHIPPING_LOGO_FRENET}
                      alt="Frenet"
                      className="w-6 h-6 object-contain"
                    />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-center">Frenet</span>
                  </div>
                  <button
                    type="button"
                    disabled
                    className="flex flex-col items-center gap-2 p-3 rounded-xl border-2 border-dashed opacity-50 text-left"
                  >
                    <Calculator className="w-6 h-6 text-muted-foreground" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-center">Correios (Direto)</span>
                  </button>
                  <button
                    type="button"
                    disabled
                    className="flex flex-col items-center gap-2 p-3 rounded-xl border-2 border-dashed opacity-50 text-left"
                  >
                    <Users className="w-6 h-6 text-muted-foreground" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-center">Mercado Envios</span>
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">
                  Cada cotação consulta Melhor Envio e Frenet ao mesmo tempo; os resultados são unificados e ordenados por preço.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <CardTitle>Conteúdo do Pacote</CardTitle>
                  <CardDescription>Adicione as dimensões físicas dos itens.</CardDescription>
                </div>
              </div>
              <Button size="sm" variant="outline" className="gap-2" onClick={addProduct}>
                <Plus className="w-4 h-4" /> Item
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {products.map((p, idx) => (
                <div key={p.id} className="relative p-4 rounded-xl border border-border bg-muted/20 hover:bg-muted/30 transition-colors group">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="md:col-span-2 space-y-2">
                      <Label className="text-[10px] uppercase text-muted-foreground">Nome / Identificador</Label>
                      <Input 
                        value={p.name}
                        onChange={(e) => updateProduct(p.id, 'name', e.target.value)}
                        placeholder="Ex: Amortecedor Dianteiro"
                        className="bg-background h-9 text-xs"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] uppercase text-muted-foreground">Seguro (R$)</Label>
                      <Input 
                        type="number"
                        value={p.insurance_value}
                        onChange={(e) => updateProduct(p.id, 'insurance_value', e.target.value)}
                        className="bg-background h-9 text-xs font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] uppercase text-muted-foreground">Qtd</Label>
                      <Input 
                        type="number"
                        value={p.quantity}
                        onChange={(e) => updateProduct(p.id, 'quantity', e.target.value)}
                        className="bg-background h-9 text-xs font-mono text-center"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-4 mt-4">
                    <div className="space-y-2 text-center">
                      <Label className="text-[9px] uppercase text-muted-foreground">Largura (cm)</Label>
                      <Input 
                        type="number"
                        value={p.width}
                        onChange={(e) => updateProduct(p.id, 'width', e.target.value)}
                        className="bg-background h-9 text-xs font-mono text-center h-8"
                      />
                    </div>
                    <div className="space-y-2 text-center">
                      <Label className="text-[9px] uppercase text-muted-foreground">Altura (cm)</Label>
                      <Input 
                        type="number"
                        value={p.height}
                        onChange={(e) => updateProduct(p.id, 'height', e.target.value)}
                        className="bg-background h-9 text-xs font-mono text-center h-8"
                      />
                    </div>
                    <div className="space-y-2 text-center">
                      <Label className="text-[9px] uppercase text-muted-foreground">Comp. (cm)</Label>
                      <Input 
                        type="number"
                        value={p.length}
                        onChange={(e) => updateProduct(p.id, 'length', e.target.value)}
                        className="bg-background h-9 text-xs font-mono text-center h-8"
                      />
                    </div>
                    <div className="space-y-2 text-center border-l border-border pl-4">
                      <Label className="text-[9px] uppercase text-primary font-bold">Peso (kg)</Label>
                      <Input 
                        type="number"
                        step="0.001"
                        value={p.weight}
                        onChange={(e) => updateProduct(p.id, 'weight', e.target.value)}
                        className="bg-background h-9 text-xs font-mono text-center h-8 border-primary/20"
                      />
                    </div>
                  </div>

                  {products.length > 1 && (
                    <button 
                      onClick={() => removeProduct(p.id)}
                      className="absolute -top-2 -right-2 p-1.5 bg-destructive text-destructive-foreground rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}

              <Button 
                onClick={handleQuote} 
                disabled={loading}
                className="w-full mt-4 h-12 text-base font-bold shadow-lg shadow-primary/20 gap-2"
              >
                {loading ? (
                  <Clock className="w-5 h-5 animate-spin" />
                ) : (
                  <Search className="w-5 h-5" />
                )}
                Cotar Frete Agora
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Results Column */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="border-border shadow-sm h-full flex flex-col min-h-[500px]">
            <CardHeader className="pb-3 border-b border-border bg-muted/10">
              <CardTitle className="text-lg">Opções Disponíveis</CardTitle>
              <CardDescription>As melhores tarifas para sua rota.</CardDescription>
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-auto">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-64 gap-4 p-8 text-center">
                  <div className="relative">
                    <Truck className="w-12 h-12 text-primary animate-bounce" />
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-8 h-1 bg-primary/20 rounded-full blur-sm" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold">Calculando tarifas...</p>
                    <p className="text-xs text-muted-foreground">Consultando Melhor Envio e Frenet em tempo real.</p>
                  </div>
                </div>
              ) : quotes.length > 0 ? (
                <div className="divide-y divide-border">
                  {quotes.map((q, idx) => (
                    <div 
                      key={`${String(q.source ?? "me")}-${String(q.id ?? idx)}-${idx}`}
                      className={cn(
                        "p-4 hover:bg-muted/30 transition-colors flex items-center justify-between group",
                        idx === 0 && "bg-primary/5"
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative shrink-0">
                          <div className="w-10 h-10 rounded-full bg-white border border-border overflow-hidden flex items-center justify-center p-1 shadow-sm">
                            {(() => {
                              const carrier = q.company?.picture
                              const gw = gatewayLogoSrc(q.source)
                              const src = carrier || gw
                              return src ? (
                                <img
                                  src={src}
                                  alt=""
                                  className="max-w-full max-h-full object-contain"
                                />
                              ) : (
                                <Truck className="w-5 h-5 text-muted-foreground" />
                              )
                            })()}
                          </div>
                          {/* Selo do gateway quando há logo da transportadora no avatar (evita duplicar ícone se o avatar já é o do gateway). */}
                          {q.company?.picture ? (
                            <div
                              className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full border-2 border-background bg-white shadow-sm flex items-center justify-center p-0.5"
                              title={q.source === "frenet" ? "Cotação Frenet" : "Cotação Melhor Envio"}
                            >
                              <img
                                src={gatewayLogoSrc(q.source)}
                                alt={q.source === "frenet" ? "Frenet" : "Melhor Envio"}
                                className="w-full h-full object-contain rounded-full"
                              />
                            </div>
                          ) : null}
                          {idx === 0 && (
                            <Badge className="absolute -top-2 -left-2 h-5 w-5 p-0 flex items-center justify-center bg-green-500 border-none shadow-sm z-[1]">
                              <CheckCircle2 className="w-3 h-3 text-white" />
                            </Badge>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                            <img
                              src={gatewayLogoSrc(q.source)}
                              alt=""
                              className="w-3.5 h-3.5 shrink-0 object-contain"
                              aria-hidden
                            />
                            <p className="text-[10px] font-black uppercase text-muted-foreground leading-none truncate">
                              {q.company?.name || "—"}
                            </p>
                            <Badge 
                              variant="outline" 
                              className={cn(
                                "px-1.5 py-0 text-[8px] font-black uppercase tracking-wider rounded-md",
                                q.source === "frenet" 
                                  ? "border-blue-500/30 text-blue-600 bg-blue-500/5 dark:text-blue-400 dark:bg-blue-500/10" 
                                  : "border-amber-500/30 text-amber-600 bg-amber-500/5 dark:text-amber-400 dark:bg-amber-500/10"
                              )}
                            >
                              {q.source === "frenet" ? "Frenet" : "Melhor Envio"}
                            </Badge>
                          </div>
                          <p className="font-bold text-sm leading-tight break-words">{q.name}</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <Badge variant="secondary" className="px-1 text-[9px] py-0 font-bold bg-muted text-muted-foreground border-none">
                              <Clock className="w-2.5 h-2.5 mr-1" />
                              {q.delivery_time != null ? `${q.delivery_time} dias` : "Prazo N/D"}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0 pl-2">
                        <p className={cn("text-lg font-black tracking-tight", idx === 0 ? "text-primary" : "text-foreground")}>
                          {q.price != null ? `R$ ${Number(q.price).toFixed(2)}` : "—"}
                        </p>
                        <p className="text-[9px] uppercase font-bold text-muted-foreground">Preço Final</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center h-64 gap-4 p-8 text-center text-destructive">
                  <AlertCircle className="w-10 h-10" />
                  <p className="text-sm font-medium">{error}</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-64 gap-3 p-8 text-center text-muted-foreground">
                  <Calculator className="w-10 h-10 opacity-20" />
                  <p className="text-sm">Inicie uma cotação para ver aqui os resultados comparados.</p>
                </div>
              )}
            </CardContent>
            {quotes.length > 0 && (
              <div className="p-4 border-t border-border bg-muted/5 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Menor Tarifa:</span>
                  <span className="font-bold text-green-500">
                    {(() => {
                      const prices = quotes
                        .map((q) => q.price)
                        .filter((p): p is number => p != null && Number.isFinite(Number(p)))
                        .map((p) => Number(p))
                      if (!prices.length) return "—"
                      return `R$ ${Math.min(...prices).toFixed(2)}`
                    })()}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Melhor Prazo:</span>
                  <span className="font-bold">
                    {(() => {
                      const days = quotes
                        .map((q) => q.delivery_time)
                        .filter((d): d is number => d != null && Number.isFinite(Number(d)))
                        .map((d) => Number(d))
                      if (!days.length) return "—"
                      return `${Math.min(...days)} dias`
                    })()}
                  </span>
                </div>
                <div className="border-t border-border mt-3 pt-3" />
                <Button variant="ghost" className="w-full text-[10px] uppercase font-black tracking-widest h-8" size="sm">
                  Copiar Todos os Dados
                </Button>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

