import React, { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  ChevronLeft,
  Plus,
  Trash2,
  Package,
  Check,
  X,
  Loader2,
  Car,
  Layers,
  ClipboardList,
  AlertCircle,
  CheckCircle2,
  Pencil,
  Keyboard,
  Search,
  Settings2,
  ChevronDown,
  ChevronRight,
} from "lucide-react"
import { api, localizacoesApi } from "@/lib/api"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { parseNomeVeiculoPeca, extractAnosDoTexto, normKey } from "@/lib/parseNomeVeiculoPeca"

// ─── Types ───────────────────────────────────────────────────────────────────

interface Categoria { id: string; nome: string }
interface Localizacao { id: string; nome: string }

interface Versao {
  id?: string
  marca: string
  modelo: string
  familia?: string
  versao?: string
  motorizacao?: string
  ano_inicio?: number
  ano_fim?: number
}

interface LinhaTexto {
  id: string
  texto: string
  status: "idle" | "buscando" | "ok" | "nenhum" | "erro"
  matches: any[]
  selecionadaPeca?: any | null
  selecionadas: Versao[]
  aberto: boolean
}

interface ProdutoRascunho {
  _key: string
  nome: string
  preco: number
  custo: number
  preco_prazo: number
  estoque_inicial: number
  part_number: string
  condicao_produto: string
  qualidade: string
  /** Veículos compatíveis — todos viram entradas em `compatibilidade[]` no produto */
  veiculos: Versao[]
  /** Texto original da linha digitada (para exibição na revisão) */
  textoOrigem?: string
  status?: "idle" | "saving" | "ok" | "erro"
  erro?: string
  produto_id?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function gerarNomeProduto(categoriaNome: string, v: Versao): string {
  const partes: string[] = [categoriaNome]
  if (v.marca) partes.push(v.marca)
  const modelo = v.familia || v.modelo
  if (modelo) partes.push(modelo)
  if (v.versao) partes.push(v.versao)
  if (v.ano_inicio) {
    partes.push(v.ano_fim ? `${v.ano_inicio}/${v.ano_fim}` : String(v.ano_inicio))
  }
  return partes.join(" ")
}

/** Gera nome do produto a partir do texto livre digitado + categoria */
function gerarNomeDaLinha(categoriaNome: string, textoLinha: string): string {
  const texto = textoLinha.trim()
  if (!texto) return categoriaNome
  // Capitaliza primeira letra de cada palavra
  const capitalizado = texto.replace(/\b\w/g, c => c.toUpperCase())
  return `${categoriaNome} ${capitalizado}`
}

function veiculoRepresentativo(veiculos: Versao[]): Versao | Partial<Versao> {
  return veiculos[0] ?? {}
}

function isSameVersao(a: Versao, b: Versao): boolean {
  if (a.id && b.id && a.id === b.id) return true
  return (
    a.marca === b.marca &&
    a.modelo === b.modelo &&
    (a.versao || "") === (b.versao || "") &&
    (a.familia || "") === (b.familia || "") &&
    (a.motorizacao || "") === (b.motorizacao || "") &&
    String(a.ano_inicio || "") === String(b.ano_inicio || "") &&
    String(a.ano_fim || "") === String(b.ano_fim || "")
  )
}

let _linhaCounter = 0
function newLinhaId() { return `linha-${++_linhaCounter}` }

// ─── Component ───────────────────────────────────────────────────────────────

export function ProdutosCriacaoMassa() {
  const navigate = useNavigate()

  const [wizardStep, setWizardStep] = useState(1)

  // ── Etapa 1 ──────────────────────────────────────────────────────────────
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [searchCat, setSearchCat] = useState("")
  const [showCatDrop, setShowCatDrop] = useState(false)
  const [selectedCat, setSelectedCat] = useState<Categoria | null>(null)
  const [custoBase, setCustoBase] = useState(0)
  const [precoBase, setPrecoBase] = useState(0)
  const [precoPrazoBase, setPrecoPrazoBase] = useState(0)
  const [estoqueInicial, setEstoqueInicial] = useState(1)
  const [condicaoBase, setCondicaoBase] = useState("usado")
  const [qualidadeBase, setQualidadeBase] = useState("original")
  const [localizacaoId, setLocalizacaoId] = useState("")
  const [localizacoes, setLocalizacoes] = useState<Localizacao[]>([])

  // ── Etapa 2 — aba banco de veículos ──────────────────────────────────────
  const [abaVeiculos, setAbaVeiculos] = useState<"banco" | "texto">("banco")
  const [marcas, setMarcas] = useState<any[]>([])
  const [modelos, setModelos] = useState<any[]>([])
  const [versoes, setVersoes] = useState<Versao[]>([])
  const [selMarca, setSelMarca] = useState("")
  const [selModelo, setSelModelo] = useState("")
  const [selectedVersoes, setSelectedVersoes] = useState<Versao[]>([])
  const [fMotor, setFMotor] = useState("")
  const [fAnoIni, setFAnoIni] = useState("")
  const [fAnoFim, setFAnoFim] = useState("")

  // ── Etapa 2 — aba digitação livre ─────────────────────────────────────────
  const [linhasTexto, setLinhasTexto] = useState<LinhaTexto[]>([
    { id: newLinhaId(), texto: "", status: "idle", matches: [], selecionadaPeca: null, selecionadas: [], aberto: false },
  ])
  const [nomesModelosCache, setNomesModelosCache] = useState<string[]>([])
  const [nomesMarcasCache, setNomesMarcasCache] = useState<string[]>([])
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // ── Etapa 3 ──────────────────────────────────────────────────────────────
  const [produtos, setProdutos] = useState<ProdutoRascunho[]>([])
  const [saving, setSaving] = useState(false)
  const [savedCount, setSavedCount] = useState(0)

  // ─── Fechar dropdown ao clicar fora ──────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const el = document.getElementById("cat-autocomplete")
      if (el && !el.contains(e.target as Node)) setShowCatDrop(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  // ─── Carga inicial ────────────────────────────────────────────────────────
  useEffect(() => {
    api.get("/api/configuracoes/categorias").then((data: any) => {
      setCategorias(Array.isArray(data) ? data : data.items ?? data.categorias ?? [])
    }).catch(() => setCategorias([]))

    api.get("/api/catalogo/marcas-veiculos").then((data: any) => {
      const list = Array.isArray(data) ? data : data.marcas ?? data.items ?? []
      setMarcas(list)
      setNomesMarcasCache(list.map((m: any) => m.nome).filter(Boolean))
    }).catch(() => setMarcas([]))

    localizacoesApi.listar({ limit: 500 }).then((data: any) => {
      setLocalizacoes(Array.isArray(data) ? data : data.items ?? [])
    }).catch(() => setLocalizacoes([]))

    // Cache de nomes de modelos para parseNomeVeiculoPeca
    api.get("/api/catalogo/modelos-veiculos?limit=10000").then((data: any) => {
      const list = Array.isArray(data) ? data : data.items ?? data.modelos ?? []
      setNomesModelosCache(list.map((m: any) => m.nome).filter(Boolean))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (selMarca) {
      const marcaObj = marcas.find((m: any) => m.nome === selMarca)
      if (marcaObj) {
        api.get(`/api/catalogo/modelos-veiculos?marca_id=${marcaObj.id}`)
          .then((data: any) => setModelos(Array.isArray(data) ? data : data.items ?? data.modelos ?? []))
          .catch(() => setModelos([]))
      }
    } else {
      setModelos([])
      setSelModelo("")
    }
  }, [selMarca, marcas])

  useEffect(() => {
    if (selModelo) {
      api.get(`/api/catalogo/versoes-veiculos?marca=${selMarca}&modelo=${selModelo}&limit=10000`)
        .then((data: any) => setVersoes(Array.isArray(data) ? data : data.items ?? []))
        .catch(() => setVersoes([]))
    } else {
      setVersoes([])
    }
  }, [selModelo, selMarca])

  // ─── Banco: filtros e toggle ──────────────────────────────────────────────
  const filteredVersoes = versoes.filter(v =>
    (!fMotor || (v.motorizacao || "").toLowerCase().includes(fMotor.toLowerCase())) &&
    (!fAnoIni || (v.ano_inicio || 0) >= parseInt(fAnoIni, 10)) &&
    (!fAnoFim || (v.ano_fim || 9999) <= parseInt(fAnoFim, 10))
  )

  const toggleVersao = (v: Versao) => {
    const idx = selectedVersoes.findIndex(x => isSameVersao(x, v))
    if (idx >= 0) setSelectedVersoes(prev => prev.filter((_, i) => i !== idx))
    else setSelectedVersoes(prev => [...prev, v])
  }

  const marcarTodos = () => {
    filteredVersoes.forEach(v => {
      if (!selectedVersoes.find(x => isSameVersao(x, v))) toggleVersao(v)
    })
  }

  // ─── Digitação livre: busca no catálogo a partir do texto ───────────────────
  const buscarProdutosPorTexto = async (linhaId: string, texto: string) => {
    if (!texto.trim()) {
      setLinhasTexto(prev => prev.map(l => l.id === linhaId
        ? { ...l, status: "idle", matches: [], selecionadaPeca: null, selecionadas: [] }
        : l))
      return
    }

    if (!selectedCat) {
      toast.error("Selecione uma categoria primeiro")
      return
    }

    setLinhasTexto(prev => prev.map(l => l.id === linhaId ? { ...l, status: "buscando" } : l))

    try {
      const data: any = await api.get(`/api/catalogo/pecas-v2?categoria_id=${selectedCat.id}&q=${encodeURIComponent(texto)}&limit=100`)
      const items = data.items || []

      setLinhasTexto(prev => prev.map(l => {
        if (l.id !== linhaId) return l
        return {
          ...l,
          status: items.length > 0 ? "ok" : "nenhum",
          matches: items,
          aberto: true,
        }
      }))
    } catch {
      setLinhasTexto(prev => prev.map(l => l.id === linhaId
        ? { ...l, status: "erro", matches: [], selecionadas: [] }
        : l))
    }
  }

  const handleSelectPeca = async (linhaId: string, peca: any) => {
    const linha = linhasTexto.find(l => l.id === linhaId)
    if (!linha) return

    if (linha.selecionadaPeca && linha.selecionadaPeca.id === peca.id) {
      setLinhasTexto(prev => prev.map(l => l.id === linhaId ? { ...l, selecionadaPeca: null, selecionadas: [] } : l))
      return
    }

    setLinhasTexto(prev => prev.map(l => l.id === linhaId ? { ...l, status: "buscando" } : l))
    try {
      const data: any = await api.get(`/api/catalogo/pecas-v2/${peca.id}/compatibilidades`)
      const compatibilidades = Array.isArray(data) ? data : []
      
      const parseAnoString = (anoStr?: string) => {
        if (!anoStr) return { ano_inicio: undefined, ano_fim: undefined }
        const partes = anoStr.split("/")
        const ano_inicio = parseInt(partes[0], 10) || undefined
        const ano_fim = partes[1] ? (parseInt(partes[1], 10) || undefined) : undefined
        return { ano_inicio, ano_fim }
      }

      const mappedVersoes: Versao[] = compatibilidades.map((c: any) => {
        const { ano_inicio, ano_fim } = parseAnoString(c.ano)
        return {
          marca: c.marca || "",
          modelo: c.modelo || "",
          familia: c.familia || undefined,
          versao: c.versao || undefined,
          motorizacao: c.motorizacao || undefined,
          ano_inicio,
          ano_fim,
        }
      })

      setLinhasTexto(prev => prev.map(l => l.id === linhaId ? {
        ...l,
        status: "ok",
        selecionadaPeca: peca,
        selecionadas: mappedVersoes,
      } : l))
    } catch {
      toast.error("Erro ao carregar compatibilidades do produto do catálogo")
      setLinhasTexto(prev => prev.map(l => l.id === linhaId ? {
        ...l,
        status: "ok",
        selecionadaPeca: peca,
        selecionadas: [],
      } : l))
    }
  }

  const handleLinhaTextoChange = (linhaId: string, texto: string) => {
    setLinhasTexto(prev => prev.map(l => l.id === linhaId ? { ...l, texto, status: "idle" } : l))

    // Debounce de 700ms
    if (debounceTimers.current[linhaId]) clearTimeout(debounceTimers.current[linhaId])
    debounceTimers.current[linhaId] = setTimeout(() => {
      buscarProdutosPorTexto(linhaId, texto)
    }, 700)
  }

  const adicionarLinha = () => {
    setLinhasTexto(prev => [...prev, { id: newLinhaId(), texto: "", status: "idle", matches: [], selecionadaPeca: null, selecionadas: [], aberto: false }])
  }

  const toggleAbertoLinha = (id: string) => {
    setLinhasTexto(prev => prev.map(l => l.id === id ? { ...l, aberto: !l.aberto } : l))
  }

  const removerLinha = (id: string) => {
    setLinhasTexto(prev => prev.filter(l => l.id !== id))
  }



  // ─── Combinar veículos das duas abas ─────────────────────────────────────
  const veiculosDaAbaTexto: Versao[] = linhasTexto.flatMap(l => l.selecionadas)

  const todosVeiculosSelecionados: Versao[] = (() => {
    const combined = [...selectedVersoes, ...veiculosDaAbaTexto]
    const seen = new Set<string>()
    return combined.filter(v => {
      const k = `${normKey(v.marca)}|${normKey(v.modelo)}|${v.versao || ""}|${v.familia || ""}|${v.motorizacao || ""}|${v.ano_inicio || ""}|${v.ano_fim || ""}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  })()

  // ─── Ir para revisão ──────────────────────────────────────────────────────
  const irParaRevisao = () => {
    if (!selectedCat) return

    const lista: ProdutoRascunho[] = []

    // ── Aba banco de veículos: 1 produto com todos os veículos selecionados ──
    if (selectedVersoes.length > 0) {
      const rep = veiculoRepresentativo(selectedVersoes) as Versao
      lista.push({
        _key: `banco-${Date.now()}`,
        nome: gerarNomeProduto(selectedCat.nome, rep),
        preco: precoBase,
        custo: custoBase,
        preco_prazo: precoPrazoBase,
        estoque_inicial: estoqueInicial,
        part_number: "",
        condicao_produto: condicaoBase,
        qualidade: qualidadeBase,
        veiculos: selectedVersoes,
        textoOrigem: `Banco: ${selectedVersoes.length} versão(ões)`,
        status: "idle",
      })
    }

    // ── Aba texto livre: 1 produto por linha digitada ────────────────────────
    linhasTexto.forEach((linha, idx) => {
      if (!linha.texto.trim()) return
      lista.push({
        _key: `linha-${linha.id}-${Date.now()}-${idx}`,
        nome: linha.selecionadaPeca ? linha.selecionadaPeca.nome : gerarNomeDaLinha(selectedCat.nome, linha.texto),
        preco: precoBase,
        custo: custoBase,
        preco_prazo: precoPrazoBase,
        estoque_inicial: estoqueInicial,
        part_number: linha.selecionadaPeca?.part_number || "",
        condicao_produto: condicaoBase,
        qualidade: qualidadeBase,
        veiculos: linha.selecionadas || [],
        textoOrigem: linha.texto,
        status: "idle",
      })
    })

    if (lista.length === 0) {
      toast.error("Digite ao menos um produto ou selecione veículos no banco")
      return
    }

    setProdutos(lista)
    setSavedCount(0)
    setWizardStep(3)
  }

  // ─── Edição na tabela de revisão ─────────────────────────────────────────
  const updateProduto = (key: string, field: keyof ProdutoRascunho, value: any) => {
    setProdutos(prev => prev.map(p => p._key === key ? { ...p, [field]: value } : p))
  }

  const removeProduto = (key: string) => {
    setProdutos(prev => prev.filter(p => p._key !== key))
  }

  // ─── Salvar em lote ───────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!selectedCat) return
    setSaving(true)
    setSavedCount(0)

    let count = 0
    const updated = [...produtos]

    for (let i = 0; i < updated.length; i++) {
      const p = updated[i]
      updated[i] = { ...p, status: "saving" }
      setProdutos([...updated])

      try {
        // Referência: primeiro veículo como marca/modelo principal do produto
        const ref = (p.veiculos[0] ?? {}) as Versao

        // Todas as compatibilidades de veículos vão dentro do produto
        const compatibilidade = p.veiculos.map(v => ({
          marca: v.marca ?? null,
          modelo: v.modelo ?? null,
          versao: v.versao ?? null,
          motorizacao: v.motorizacao ?? null,
          familia: v.familia ?? null,
          ano: v.ano_inicio ? String(v.ano_inicio) : null,
          ano_inicio: v.ano_inicio ?? null,
          ano_fim: v.ano_fim ?? null,
        }))

        const payload: any = {
          nome: p.nome,
          categoria_id: selectedCat.id,
          preco: p.preco,
          custo: p.custo,
          preco_prazo: p.preco_prazo,
          estoque_atual: p.estoque_inicial,
          condicao_produto: p.condicao_produto,
          marca: ref.marca ?? null,
          modelo: ref.familia || ref.modelo || null,
          ano_inicio: ref.ano_inicio ?? null,
          ano_fim: ref.ano_fim ?? null,
          versao: ref.versao ?? null,
          ativo: true,
          compatibilidade,
          origem_cadastro: "massa",
        }
        if (p.part_number) payload.part_number = p.part_number
        if (localizacaoId) payload.localizacao_id = localizacaoId

        const result: any = await api.post("/api/estoque/produtos", payload)
        updated[i] = { ...updated[i], status: "ok", produto_id: result?.id ?? result?.produto?.id }
        count++
        setSavedCount(count)
      } catch (err: any) {
        updated[i] = { ...updated[i], status: "erro", erro: err?.message || "Erro ao criar" }
      }
      setProdutos([...updated])
    }

    setSaving(false)
    const erros = updated.filter(p => p.status === "erro").length
    if (erros === 0) toast.success(`${count} produto(s) criado(s) com sucesso!`)
    else toast.warning(`${count} criado(s), ${erros} com erro.`)
  }

  const totalOk = produtos.filter(p => p.status === "ok").length
  const totalErro = produtos.filter(p => p.status === "erro").length
  const jaFinalizou = !saving && (totalOk + totalErro) === produtos.length && produtos.length > 0 && (totalOk > 0 || totalErro > 0)

  const filteredCats = (categorias || []).filter(c =>
    !searchCat || c.nome.toLowerCase().includes(searchCat.toLowerCase())
  )

  const steps = [
    { id: 1, name: "Categoria", icon: Layers },
    { id: 2, name: "Veículos", icon: Car },
    { id: 3, name: "Revisão", icon: ClipboardList },
  ]

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/produtos")}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Criação em Massa — Estoque</h1>
            <p className="text-muted-foreground text-sm">
              Selecione 1 categoria e vários veículos para criar múltiplos produtos de uma vez
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {steps.map((step, idx) => (
            <React.Fragment key={step.id}>
              <div className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-full transition-all text-sm font-bold",
                wizardStep === step.id
                  ? "bg-primary text-primary-foreground shadow-lg scale-105"
                  : wizardStep > step.id
                  ? "text-primary"
                  : "text-muted-foreground",
              )}>
                <step.icon className="w-4 h-4" />
                {step.name}
              </div>
              {idx < steps.length - 1 && <div className="w-4 h-px bg-muted" />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ════════════════════════════════════════
          Etapa 1 — Categoria + Config padrão
      ════════════════════════════════════════ */}
      {wizardStep === 1 && (
        <Card className="border-2 border-primary/20 bg-muted/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-primary" />
              Selecione a Categoria e Configure os Valores Padrão
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-8">
            {/* Autocomplete categoria */}
            <div id="cat-autocomplete" className="relative max-w-xl">
              <Label className="text-xs uppercase font-bold text-muted-foreground mb-2 block">
                Categoria da peça *
              </Label>
              {selectedCat ? (
                <div className="flex items-center gap-3 p-3 border-2 border-primary rounded-xl bg-primary/5">
                  <Package className="w-5 h-5 text-primary shrink-0" />
                  <span className="font-bold flex-1">{selectedCat.nome}</span>
                  <Button
                    variant="ghost" size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => { setSelectedCat(null); setSearchCat("") }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <Input
                    value={searchCat}
                    onChange={e => { setSearchCat(e.target.value); setShowCatDrop(true) }}
                    onFocus={() => setShowCatDrop(true)}
                    placeholder="Buscar categoria (ex: Capô, Para-choque...)"
                    className="h-12 text-base pl-12"
                  />
                  <Package className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  {showCatDrop && (
                    <div className="absolute z-50 w-full mt-2 bg-background border rounded-xl shadow-2xl max-h-72 overflow-y-auto p-2">
                      {filteredCats.length > 0 ? filteredCats.map(c => (
                        <div
                          key={c.id}
                          className="p-3 hover:bg-primary/10 rounded-lg cursor-pointer text-sm transition-colors flex items-center justify-between group"
                          onClick={() => { setSelectedCat(c); setSearchCat(""); setShowCatDrop(false) }}
                        >
                          <span className="font-medium">{c.nome}</span>
                          <Plus className="w-4 h-4 opacity-0 group-hover:opacity-100" />
                        </div>
                      )) : (
                        <div className="p-4 text-center text-muted-foreground italic text-sm">
                          Nenhuma categoria encontrada
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Config compartilhada */}
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-muted-foreground mb-4">
                Valores padrão — aplicados a todos os produtos
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase font-bold text-muted-foreground">Custo (R$)</Label>
                  <Input type="number" min={0} step={0.01} value={custoBase}
                    onChange={e => setCustoBase(parseFloat(e.target.value) || 0)}
                    className="font-mono font-bold" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase font-bold text-muted-foreground">Preço (R$)</Label>
                  <Input type="number" min={0} step={0.01} value={precoBase}
                    onChange={e => setPrecoBase(parseFloat(e.target.value) || 0)}
                    className="font-mono font-bold" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase font-bold text-muted-foreground">Preço Prazo (R$)</Label>
                  <Input type="number" min={0} step={0.01} value={precoPrazoBase}
                    onChange={e => setPrecoPrazoBase(parseFloat(e.target.value) || 0)}
                    className="font-mono font-bold" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase font-bold text-muted-foreground">Estoque Inicial</Label>
                  <Input type="number" min={0} step={1} value={estoqueInicial}
                    onChange={e => setEstoqueInicial(parseInt(e.target.value) || 0)}
                    className="font-mono font-bold" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase font-bold text-muted-foreground">Condição</Label>
                  <select
                    value={condicaoBase}
                    onChange={e => setCondicaoBase(e.target.value)}
                    className="w-full h-10 rounded-lg border bg-background px-3 text-sm focus:ring-2 focus:ring-primary outline-none"
                  >
                    <option value="usado">Usado</option>
                    <option value="novo">Novo</option>
                    <option value="recondicionado">Recondicionado</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase font-bold text-muted-foreground">Qualidade</Label>
                  <select
                    value={qualidadeBase}
                    onChange={e => setQualidadeBase(e.target.value)}
                    className="w-full h-10 rounded-lg border bg-background px-3 text-sm focus:ring-2 focus:ring-primary outline-none"
                  >
                    <option value="original">Original</option>
                    <option value="paralelo">Paralelo</option>
                    <option value="remanufaturado">Remanufaturado</option>
                  </select>
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label className="text-xs uppercase font-bold text-muted-foreground">Localização no Estoque</Label>
                  <select
                    value={localizacaoId}
                    onChange={e => setLocalizacaoId(e.target.value)}
                    className="w-full h-10 rounded-lg border bg-background px-3 text-sm focus:ring-2 focus:ring-primary outline-none"
                  >
                    <option value="">Sem localização</option>
                    {localizacoes.map(l => (
                      <option key={l.id} value={l.id}>{l.nome}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <Button
                size="lg"
                disabled={!selectedCat}
                onClick={() => setWizardStep(2)}
                className="gap-2 px-8"
              >
                Próximo: Selecionar Veículos <Car className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ════════════════════════════════════════
          Etapa 2 — Veículos (2 abas)
      ════════════════════════════════════════ */}
      {wizardStep === 2 && (
        <div className="space-y-4">
          {/* Seletor de aba */}
          <div className="flex gap-2">
            <Button
              variant={abaVeiculos === "banco" ? "default" : "outline"}
              className="gap-2"
              onClick={() => setAbaVeiculos("banco")}
            >
              <Search className="w-4 h-4" />
              Buscar no Banco de Veículos
            </Button>
            <Button
              variant={abaVeiculos === "texto" ? "default" : "outline"}
              className="gap-2"
              onClick={() => setAbaVeiculos("texto")}
            >
              <Keyboard className="w-4 h-4" />
              Digitar Produtos Livremente
              {linhasTexto.filter(l => l.texto.trim()).length > 0 && (
                <Badge className="ml-1 h-5 text-[10px]">{linhasTexto.filter(l => l.texto.trim()).length}</Badge>
              )}
            </Button>
          </div>

          <Card className="border-2 border-primary/20">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                {abaVeiculos === "banco"
                  ? <><Search className="w-5 h-5 text-primary" /> Banco de Veículos</>
                  : <><Keyboard className="w-5 h-5 text-primary" /> Digitação Livre de Produtos</>
                }
                {selectedCat && <Badge variant="outline" className="ml-2">{selectedCat.nome}</Badge>}
              </CardTitle>
              <Badge variant="secondary" className="px-3 py-1 text-sm">
                {selectedVersoes.length > 0 && `Banco: ${selectedVersoes.length} versão(ões)`}
                {selectedVersoes.length > 0 && linhasTexto.filter(l => l.texto.trim()).length > 0 && " · "}
                {linhasTexto.filter(l => l.texto.trim()).length > 0 && `Texto: ${linhasTexto.filter(l => l.texto.trim()).length} produto(s)`}
              </Badge>
            </CardHeader>

            <CardContent className="p-6">

              {/* ── ABA: BANCO ── */}
              {abaVeiculos === "banco" && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-[600px]">
                  <div className="flex flex-col h-full space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase font-black text-muted-foreground">Marca</Label>
                        <select
                          className="w-full h-10 rounded-lg border bg-background px-3 text-sm focus:ring-2 focus:ring-primary outline-none"
                          value={selMarca}
                          onChange={e => { setSelMarca(e.target.value); setSelModelo("") }}
                        >
                          <option value="">Selecione...</option>
                          {marcas.map((m: any) => <option key={m.id} value={m.nome}>{m.nome}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase font-black text-muted-foreground">Modelo</Label>
                        <select
                          className="w-full h-10 rounded-lg border bg-background px-3 text-sm focus:ring-2 focus:ring-primary outline-none disabled:opacity-50"
                          value={selModelo}
                          onChange={e => setSelModelo(e.target.value)}
                          disabled={!selMarca}
                        >
                          <option value="">Selecione...</option>
                          {modelos.map((m: any) => <option key={m.id} value={m.nome}>{m.nome}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <Input placeholder="Motor" className="h-9 text-xs" value={fMotor} onChange={e => setFMotor(e.target.value)} />
                      <Input placeholder="Ano Ini" className="h-9 text-xs" type="number" value={fAnoIni} onChange={e => setFAnoIni(e.target.value)} />
                      <Input placeholder="Ano Fim" className="h-9 text-xs" type="number" value={fAnoFim} onChange={e => setFAnoFim(e.target.value)} />
                    </div>

                    <div className="flex-1 border rounded-xl overflow-hidden bg-muted/20 flex flex-col">
                      <div className="p-2 border-b bg-muted/40 flex justify-between items-center">
                        <span className="text-[10px] font-black uppercase text-muted-foreground ml-2">
                          {filteredVersoes.length} versões
                        </span>
                        <Button variant="ghost" size="sm" className="h-7 text-[10px] font-black uppercase" onClick={marcarTodos}>
                          Marcar Todos
                        </Button>
                      </div>
                      <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {filteredVersoes.map((v, idx) => (
                          <label
                            key={v.id || idx}
                            className="flex items-center gap-3 p-3 hover:bg-background rounded-lg cursor-pointer text-xs border border-transparent hover:border-primary/20 transition-all"
                          >
                            <input
                              type="checkbox"
                              className="w-4 h-4 accent-primary"
                              checked={!!selectedVersoes.find(x => isSameVersao(x, v))}
                              onChange={() => toggleVersao(v)}
                            />
                            <div className="flex flex-col">
                              <span className="font-bold uppercase">{v.familia || v.modelo} — {v.versao}</span>
                              <span className="text-muted-foreground">{v.motorizacao} | {v.ano_inicio}–{v.ano_fim || "Atual"}</span>
                            </div>
                          </label>
                        ))}
                        {filteredVersoes.length === 0 && (
                          <div className="h-full flex items-center justify-center text-muted-foreground italic text-sm">
                            {selModelo ? "Nenhuma versão encontrada" : "Selecione marca e modelo"}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Painel direito: selecionados totais */}
                  <PainelSelecionados
                    versoes={todosVeiculosSelecionados}
                    onRemove={(v) => {
                      // Remove do banco ou da lista de texto
                      const nosBanco = selectedVersoes.find(x => isSameVersao(x, v))
                      if (nosBanco) {
                        setSelectedVersoes(prev => prev.filter(x => !isSameVersao(x, v)))
                      } else {
                        setLinhasTexto(prev => prev.map(l => ({
                          ...l,
                          selecionadas: l.selecionadas.filter(s => !isSameVersao(s, v)),
                        })))
                      }
                    }}
                    onVoltar={() => setWizardStep(1)}
                    onProximo={irParaRevisao}
                    disableProximo={selectedVersoes.length === 0 && linhasTexto.filter(l => l.texto.trim()).length === 0}
                  />
                </div>
              )}

              {/* ── ABA: TEXTO LIVRE ── */}
              {abaVeiculos === "texto" && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Coluna esquerda: linhas de texto */}
                  <div className="space-y-3">
                    <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 border border-dashed">
                      <p className="font-bold mb-1">Como usar:</p>
                      <p>Digite o nome do produto. O sistema buscará no catálogo de acordo com a categoria selecionada.</p>
                      <p className="mt-1 font-mono text-[11px] text-primary">
                        Ex: capô gol · radiador civic · compressor ar
                      </p>
                    </div>

                    <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                      {linhasTexto.map((linha, idx) => (
                        <LinhaVeiculoTexto
                          key={linha.id}
                          linha={linha}
                          numero={idx + 1}
                          onChange={texto => handleLinhaTextoChange(linha.id, texto)}
                          onRemove={() => removerLinha(linha.id)}
                          onSelectPeca={peca => handleSelectPeca(linha.id, peca)}
                          onToggleAberto={() => toggleAbertoLinha(linha.id)}
                          podeLimpar={linhasTexto.length > 1}
                        />
                      ))}
                    </div>

                    <Button variant="outline" className="w-full gap-2 border-dashed" onClick={adicionarLinha}>
                      <Plus className="w-4 h-4" /> Adicionar outro produto
                    </Button>
                  </div>

                  {/* Painel direito: selecionados totais */}
                  <PainelSelecionados
                    versoes={todosVeiculosSelecionados}
                    onRemove={(v) => {
                      setLinhasTexto(prev => prev.map(l => ({
                        ...l,
                        selecionadas: l.selecionadas.filter(s => !isSameVersao(s, v)),
                      })))
                      setSelectedVersoes(prev => prev.filter(x => !isSameVersao(x, v)))
                    }}
                    onVoltar={() => setWizardStep(1)}
                    onProximo={irParaRevisao}
                    disableProximo={selectedVersoes.length === 0 && linhasTexto.filter(l => l.texto.trim()).length === 0}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ════════════════════════════════════════
          Etapa 3 — Revisão e Criação
      ════════════════════════════════════════ */}
      {wizardStep === 3 && (
        <div className="space-y-4">
          {saving && (
            <Card className="border-2 border-primary/30 bg-primary/5">
              <CardContent className="p-4 flex items-center gap-4">
                <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
                <div className="flex-1">
                  <div className="flex justify-between text-sm font-bold mb-1">
                    <span>Criando produtos...</span>
                    <span>{savedCount}/{produtos.length}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-primary h-2 rounded-full transition-all duration-300"
                      style={{ width: `${(savedCount / produtos.length) * 100}%` }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {jaFinalizou && (
            <Card className={cn("border-2", totalErro === 0 ? "border-green-500/30 bg-green-500/5" : "border-yellow-500/30 bg-yellow-500/5")}>
              <CardContent className="p-4 flex items-center gap-4">
                {totalErro === 0
                  ? <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0" />
                  : <AlertCircle className="w-6 h-6 text-yellow-600 shrink-0" />
                }
                <div className="flex-1">
                  <p className="font-bold text-sm">
                    {totalErro === 0
                      ? `${totalOk} produto(s) criado(s) com sucesso!`
                      : `${totalOk} criado(s), ${totalErro} com erro.`}
                  </p>
                  {totalErro === 0 && (
                    <p className="text-xs text-muted-foreground">Use Alteração em Massa para ajustes finais em lote.</p>
                  )}
                </div>
                {totalErro === 0 && (
                  <Button variant="outline" size="sm" onClick={() => navigate("/produtos")}>
                    Ver Estoque
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="border-2 border-primary/10">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardList className="w-5 h-5 text-primary" />
                {produtos.length} produto(s) a criar
                {selectedCat && <Badge variant="outline">{selectedCat.nome}</Badge>}
              </CardTitle>
              <div className="text-xs text-muted-foreground">
                Edite nome, preço, custo ou part number antes de criar
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left p-3 font-black uppercase text-muted-foreground w-8">#</th>
                      <th className="text-left p-3 font-black uppercase text-muted-foreground">Compatibilidades</th>
                      <th className="text-left p-3 font-black uppercase text-muted-foreground min-w-[200px]">Nome do Produto</th>
                      <th className="text-left p-3 font-black uppercase text-muted-foreground w-24">Custo</th>
                      <th className="text-left p-3 font-black uppercase text-muted-foreground w-24">Preço</th>
                      <th className="text-left p-3 font-black uppercase text-muted-foreground w-24">Prazo</th>
                      <th className="text-left p-3 font-black uppercase text-muted-foreground w-20">Estoque</th>
                      <th className="text-left p-3 font-black uppercase text-muted-foreground w-32">Part Number</th>
                      <th className="text-left p-3 font-black uppercase text-muted-foreground w-12">Status</th>
                      <th className="p-3 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {produtos.map((p, idx) => (
                      <tr
                        key={p._key}
                        className={cn(
                          "border-b transition-colors",
                          p.status === "ok" && "bg-green-500/5",
                          p.status === "erro" && "bg-red-500/5",
                          p.status === "saving" && "bg-primary/5 animate-pulse",
                        )}
                      >
                        <td className="p-3 text-muted-foreground font-mono">{idx + 1}</td>
                        <td className="p-3 max-w-[220px]">
                          {/* Texto de origem da linha */}
                          {p.textoOrigem && (
                            <div className="font-bold text-[10px] text-primary uppercase leading-tight mb-1 truncate" title={p.textoOrigem}>
                              {p.textoOrigem}
                            </div>
                          )}
                          {/* Lista resumida de veículos compatíveis */}
                          <div className="space-y-0.5">
                            {p.veiculos.slice(0, 3).map((v, vi) => (
                              <div key={vi} className="text-[10px] text-muted-foreground leading-tight">
                                {v.marca} {v.familia || v.modelo} {v.versao} {v.ano_inicio ? `${v.ano_inicio}${v.ano_fim ? `–${v.ano_fim}` : ""}` : ""}
                              </div>
                            ))}
                            {p.veiculos.length > 3 && (
                              <div className="text-[10px] text-primary font-bold">+{p.veiculos.length - 3} mais...</div>
                            )}
                          </div>
                          <div className="mt-1">
                            <span className="inline-flex items-center gap-1 bg-primary/10 text-primary text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                              <Car className="w-2.5 h-2.5" />{p.veiculos.length} compatibilidade(s)
                            </span>
                          </div>
                        </td>
                        <td className="p-2">
                          <Input value={p.nome} onChange={e => updateProduto(p._key, "nome", e.target.value)}
                            className="h-8 text-xs font-medium"
                            disabled={p.status === "saving" || p.status === "ok"} />
                        </td>
                        <td className="p-2">
                          <Input type="number" min={0} step={0.01} value={p.custo}
                            onChange={e => updateProduto(p._key, "custo", parseFloat(e.target.value) || 0)}
                            className="h-8 text-xs font-mono"
                            disabled={p.status === "saving" || p.status === "ok"} />
                        </td>
                        <td className="p-2">
                          <Input type="number" min={0} step={0.01} value={p.preco}
                            onChange={e => updateProduto(p._key, "preco", parseFloat(e.target.value) || 0)}
                            className="h-8 text-xs font-mono"
                            disabled={p.status === "saving" || p.status === "ok"} />
                        </td>
                        <td className="p-2">
                          <Input type="number" min={0} step={0.01} value={p.preco_prazo}
                            onChange={e => updateProduto(p._key, "preco_prazo", parseFloat(e.target.value) || 0)}
                            className="h-8 text-xs font-mono"
                            disabled={p.status === "saving" || p.status === "ok"} />
                        </td>
                        <td className="p-2">
                          <Input type="number" min={0} step={1} value={p.estoque_inicial}
                            onChange={e => updateProduto(p._key, "estoque_inicial", parseInt(e.target.value) || 0)}
                            className="h-8 text-xs font-mono"
                            disabled={p.status === "saving" || p.status === "ok"} />
                        </td>
                        <td className="p-2">
                          <Input value={p.part_number}
                            onChange={e => updateProduto(p._key, "part_number", e.target.value)}
                            placeholder="opcional"
                            className="h-8 text-xs font-mono"
                            disabled={p.status === "saving" || p.status === "ok"} />
                        </td>
                        <td className="p-3">
                          {p.status === "saving" && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                          {p.status === "ok" && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                          {p.status === "erro" && (
                            <div className="flex flex-col gap-0.5">
                              <AlertCircle className="w-4 h-4 text-destructive" />
                              {p.erro && <span className="text-[10px] text-destructive leading-tight max-w-[120px] break-words">{p.erro}</span>}
                            </div>
                          )}
                          {(!p.status || p.status === "idle") && <Pencil className="w-4 h-4 text-muted-foreground/40" />}
                        </td>
                        <td className="p-2">
                          {(p.status === "idle" || !p.status) && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10"
                              onClick={() => removeProduto(p._key)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-between items-center pt-2">
            <Button variant="outline" onClick={() => setWizardStep(2)} disabled={saving || jaFinalizou}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
            </Button>
            <div className="flex gap-3">
              {jaFinalizou && totalErro === 0 && (
                <Button variant="outline" onClick={() => navigate("/produtos/alteracao-massa")}>
                  <Settings2 className="w-4 h-4 mr-2" /> Alteração em Massa
                </Button>
              )}
              <Button
                size="lg"
                disabled={saving || produtos.length === 0 || jaFinalizou}
                onClick={handleSave}
                className="gap-2 px-8 min-w-[200px]"
              >
                {saving
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Criando...</>
                  : <><Check className="w-4 h-4" /> Criar {produtos.length} produto(s)</>
                }
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sub-componente: painel lateral de selecionados ─────────────────────────

function PainelSelecionados({
  versoes,
  onRemove,
  onVoltar,
  onProximo,
  disableProximo,
}: {
  versoes: Versao[]
  onRemove: (v: Versao) => void
  onVoltar: () => void
  onProximo: () => void
  disableProximo?: boolean
}) {
  return (
    <div className="bg-muted/40 rounded-2xl p-6 flex flex-col h-full border-2 border-dashed border-primary/20 min-h-[500px]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-black uppercase tracking-widest text-sm text-primary">Total Selecionados</h3>
        <Badge className="bg-primary/20 text-primary border-primary/20">{versoes.length}</Badge>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {versoes.map((v, idx) => (
          <div
            key={v.id || idx}
            className="flex items-center justify-between bg-background p-3 rounded-xl border-2 border-transparent hover:border-primary/20 transition-all shadow-sm"
          >
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-xs uppercase truncate">{v.marca} {v.familia || v.modelo}</span>
              <span className="text-[10px] text-muted-foreground truncate">
                {v.versao} | {v.motorizacao} | {v.ano_inicio}–{v.ano_fim || "Atual"}
              </span>
            </div>
            <Button
              variant="ghost" size="icon"
              className="h-8 w-8 text-destructive hover:bg-destructive/10 shrink-0"
              onClick={() => onRemove(v)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
        {versoes.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-4 opacity-50 pt-12">
            <Car className="w-12 h-12" />
            <p className="text-sm">Nenhum veículo selecionado</p>
          </div>
        )}
      </div>

      <div className="flex justify-between pt-6 mt-4 border-t border-primary/10">
        <Button variant="outline" size="lg" onClick={onVoltar}>Voltar</Button>
        <Button size="lg" disabled={disableProximo !== undefined ? disableProximo : versoes.length === 0} onClick={onProximo} className="gap-2 px-8">
          Próximo <ClipboardList className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}

// ─── Sub-componente: linha de digitação livre ────────────────────────────────

function LinhaVeiculoTexto({
  linha,
  numero,
  onChange,
  onRemove,
  onSelectPeca,
  onToggleAberto,
  podeLimpar,
}: {
  linha: LinhaTexto
  numero: number
  onChange: (texto: string) => void
  onRemove: () => void
  onSelectPeca: (peca: any) => void
  onToggleAberto: () => void
  podeLimpar: boolean
}) {
  const { texto, status, matches, selecionadaPeca, aberto } = linha
  const temResultados = status === "ok" && matches.length > 0
  const isSelected = !!selecionadaPeca

  return (
    <div className="border rounded-xl overflow-hidden bg-background">
      {/* Input row */}
      <div className="flex items-center gap-2 p-3 bg-muted/20">
        <span className="text-[10px] font-black text-muted-foreground w-5 shrink-0">{numero}</span>
        <Input
          value={texto}
          onChange={e => onChange(e.target.value)}
          placeholder="Digite para buscar no catálogo (Ex: capô gol, radiador onix...)"
          className="h-8 text-xs flex-1 border-0 shadow-none focus-visible:ring-0 bg-transparent p-0"
        />
        {status === "buscando" && <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />}
        {status === "nenhum" && <AlertCircle className="w-4 h-4 text-yellow-500 shrink-0" />}
        {status === "erro" && <AlertCircle className="w-4 h-4 text-destructive shrink-0" />}

        {/* Botão expandir/recolher — só aparece quando há resultados */}
        {temResultados && (
          <button
            onClick={onToggleAberto}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold transition-colors shrink-0",
              aberto
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary",
            )}
          >
            {aberto ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            {isSelected ? "Selecionado" : "Ver resultados"} ({matches.length})
          </button>
        )}

        {podeLimpar && (
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0" onClick={onRemove}>
            <X className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      {/* Resultados — só visível quando aberto */}
      {temResultados && aberto && (
        <div className="border-t">
          <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
            <span className="text-[10px] text-muted-foreground font-bold uppercase">
              {matches.length} produto(s) de catálogo encontrado(s)
            </span>
          </div>
          <div className="p-2 space-y-1 max-h-48 overflow-y-auto">
            {matches.map((p, idx) => {
              const sel = selecionadaPeca && selecionadaPeca.id === p.id
              return (
                <label
                  key={p.id || idx}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-[11px] transition-colors",
                    sel ? "bg-primary/10 border border-primary/20" : "hover:bg-muted/60 border border-transparent",
                  )}
                >
                  <input
                    type="checkbox"
                    className="w-3.5 h-3.5 accent-primary shrink-0"
                    checked={sel}
                    onChange={() => onSelectPeca(p)}
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold uppercase truncate">
                      {p.nome}
                    </span>
                    <span className="text-muted-foreground truncate">
                      {p.part_number ? `Part Number: ${p.part_number}` : "Sem part number"}
                      {p.qtd_compatibilidades > 0 ? ` · ${p.qtd_compatibilidades} compatibilidade(s)` : ""}
                      {p.modelos_resumo ? ` (${p.modelos_resumo})` : ""}
                    </span>
                  </div>
                  {sel && <Check className="w-3 h-3 text-primary ml-auto shrink-0" />}
                </label>
              )
            })}
          </div>
        </div>
      )}


    </div>
  )
}
