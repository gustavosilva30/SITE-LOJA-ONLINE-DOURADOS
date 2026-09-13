import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { useProdutosCache } from "@/store/produtosCache"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Modal } from "@/components/ui/modal"
import { Plus, Search, Filter, MoreHorizontal, FileText, User, Trash2, Pencil, ShoppingCart, CheckCircle2, Printer, Package, X, FilePlus2, MessageCircle, Car, Loader2, Ticket, Wrench } from "lucide-react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { formatNumOrcamento, fmt, normalizeBrazilianPhone } from "@/lib/format"
import { useDraftStore } from "@/store/draftStore"
import { useAuthStore } from "@/store/authStore"
import { logAcao } from "@/lib/systemLog"
import { orcamentosApi, clientesApi, estoqueApi, atendentesApi, configuracoesApi, cuponsApi } from "@/lib/api"
import { toast } from "sonner"
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query"
import { getCachedPage, invalidateCachedPage } from "@/store/pagePrefetchCache"
import { openWhatsAppApp } from "@/lib/whatsappWeb"

interface Orcamento {
  id: string
  numero_pedido?: number
  cliente_id: string | null
  cliente_avulso_nome?: string | null
  cliente_avulso_telefone?: string | null
  cliente_avulso_documento?: string | null
  vendedor_id: string | null
  total: number
  data_inicio: string | null
  validade: string | null
  condicao_pagamento: string | null
  status: string
  veiculo_marca?: string | null
  veiculo_modelo?: string | null
  veiculo_ano?: string | null
  veiculo_motor?: string | null
  created_at?: string
  clientes?: { nome: string; telefone?: string; documento?: string; endereco?: string; endereco_numero?: string; endereco_bairro?: string; endereco_cidade?: string; endereco_uf?: string; inscricao_estadual?: string }
  vendedor?: { nome: string }
  /** Preenchido pelo select `atendentes!vendedor_id` */
  atendentes?: { nome: string } | { nome: string }[] | null
  orcamentos_itens?: { descricao_avulso?: string; quantidade: number; preco_unitario: number; produtos?: { nome: string; preco?: number; preco_prazo?: number; sku?: string } }[]
}

interface ItemOrcamento {
  produto_id?: string | null
  descricao_avulso?: string
  quantidade: number
  preco_unitario: number
}

/** PostgREST devolve o join em `atendentes`, não em `vendedor` */
function nomeVendedorOrcamento(o: {
  vendedor?: { nome?: string } | null
  atendentes?: { nome?: string } | { nome?: string }[] | null
}): string {
  if (o.vendedor?.nome) return o.vendedor.nome
  const a = o.atendentes as { nome?: string } | { nome?: string }[] | null | undefined
  if (!a) return '—'
  if (Array.isArray(a)) return a[0]?.nome || '—'
  return a.nome || '—'
}

/** Modelo · ano · motor do orçamento antes do nome do produto na lista/impressão (marca já costuma estar no topo). */
function nomeItemOrcamentoComVeiculo(
  orc: {
    veiculo_modelo?: string | null
    veiculo_ano?: string | null
    veiculo_motor?: string | null
    veiculo_marca?: string | null
  },
  item: { produtos?: { nome?: string } | null; descricao_avulso?: string | null },
  nomeFallback = 'Item',
): string {
  if (!item) return nomeFallback
  const base =
    item.produtos?.nome || item.descricao_avulso || nomeFallback
  const parts = [orc.veiculo_modelo, orc.veiculo_ano, orc.veiculo_motor]
    .map((x) => String(x ?? '').trim())
    .filter(Boolean)
  
  if (!parts.length) return base

  // Se a descrição já contém as informações do veículo (comum no novo fluxo de lote), 
  // retornamos apenas a base para evitar duplicidade.
  const baseLower = base.toLowerCase()
  const containsMost = parts.filter(p => baseLower.includes(p.toLowerCase())).length >= Math.min(parts.length, 2)
  
  if (containsMost) return base

  return `${base} ${parts.join(' ')}`
}

export function Orcamentos() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { atendente, initialized } = useAuthStore()
  const [searchTerm, setSearchTerm] = useState("")
  const [activeTab, setActiveTab] = useState("andamento")
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([])
  const [loading, setLoading] = useState(true)
  
  // Paginação
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 20
  
  // Calcular itens da página atual
  const indexOfLastItem = currentPage * itemsPerPage
  const indexOfFirstItem = indexOfLastItem - itemsPerPage
  const currentItems = orcamentos.slice(indexOfFirstItem, indexOfLastItem)
  const totalPages = Math.ceil(orcamentos.length / itemsPerPage)
  
  // Resetar para página 1 quando lista mudar
  useEffect(() => {
    setCurrentPage(1)
  }, [orcamentos.length])

  const {
    isOrcamentoModalOpen: isModalOpen,
    newOrcamento: formData,
    orcamentoItems: items,
    editingOrcamentoId: createdOrcamentoId,
    setOrcamentosDraft,
    clearOrcamentosDraft,
    setVendasDraft
  } = useDraftStore()

  const setIsModalOpen = (open: boolean | ((prev: boolean) => boolean)) =>
    setOrcamentosDraft({ isOrcamentoModalOpen: typeof open === 'function' ? open(isModalOpen) : open })

  const setFormData = (data: any | ((prev: any) => any)) =>
    setOrcamentosDraft({ newOrcamento: typeof data === 'function' ? data(formData) : data })

  const setItems = (itm: any[] | ((prev: any[]) => any[])) => {
    const currentItems = useDraftStore.getState().orcamentoItems
    const nextItems = typeof itm === 'function' ? itm(currentItems) : itm
    setOrcamentosDraft({ orcamentoItems: nextItems })
  }

  const setCreatedOrcamentoId = (id: string | null | ((prev: string | null) => string | null)) =>
    setOrcamentosDraft({ editingOrcamentoId: typeof id === 'function' ? id(createdOrcamentoId) : id })

  const [submitting, setSubmitting] = useState(false)
  const [printAfterSave, setPrintAfterSave] = useState(false)
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false)
  const [selectedOrcamentoForReceipt, setSelectedOrcamentoForReceipt] = useState<any>(null)
  const [printFormat, setPrintFormat] = useState<'a4' | 'a5' | 'cupom' | 'cupom58'>('a4')

  // Modal de Separação de Peças
  const [isSeparacaoModalOpen, setIsSeparacaoModalOpen] = useState(false)
  const [orcamentoParaSeparacao, setOrcamentoParaSeparacao] = useState<Orcamento | null>(null)
  const [separacaoAtendente1, setSeparacaoAtendente1] = useState(true)
  const [separacaoAtendente2, setSeparacaoAtendente2] = useState(false)
  const [sendingSeparacao, setSendingSeparacao] = useState(false)
  const [company, setCompany] = useState<any>(null)
  
  // Custom Search for Customer
  const [customerSearch, setCustomerSearch] = useState("")
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const marcas = useProdutosCache(state => state.marcasStandard) || []
  const modelos = useProdutosCache(state => state.modelosStandard) || []

  // Cupom
  const handleEnviarSeparacao = async () => {
    if (!orcamentoParaSeparacao) return
    if (!separacaoAtendente1 && !separacaoAtendente2) {
      toast.error('Selecione ao menos um destinatário')
      return
    }
    setSendingSeparacao(true)
    try {
      await orcamentosApi.notificarSeparacao(orcamentoParaSeparacao.id, {
        notificar_atendente1: separacaoAtendente1,
        notificar_atendente2: separacaoAtendente2,
      })
      toast.success('Notificação de separação enviada!')
      setIsSeparacaoModalOpen(false)
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao enviar notificação')
    } finally {
      setSendingSeparacao(false)
    }
  }

  const [couponCode, setCouponCode] = useState('')
  const handleApplyCoupon = async () => {
    if (!couponCode) return
    try {
      const subtotal = (Array.isArray(items) ? items : []).reduce((acc, item) => acc + ((item?.quantidade || 0) * (item?.preco_unitario || 0)), 0)
      const res = await cuponsApi.validar(couponCode, subtotal)
      setFormData({
        ...formData,
        cupom_id: res.coupon.id,
        desconto_cupom: res.discount_amount,
        appliedCoupon: res.coupon
      })
      toast.success(`Cupom ${res.coupon.codigo} aplicado!`)
    } catch (err: any) {
      toast.error(err.message || "Cupom inválido")
      setFormData({
        ...formData,
        cupom_id: null,
        desconto_cupom: 0,
        appliedCoupon: null
      })
    }
  }

  // Dynamic search for customers that might not be in the initial limit
  useEffect(() => {
    // Only search if not matched an existing client fully
    const isAlreadySelected = clientes.some(c => c.nome.toLowerCase() === customerSearch.toLowerCase());
    if (customerSearch.trim().length < 2 || isAlreadySelected) return;

    const timer = setTimeout(async () => {
      const q = customerSearch.trim();
      const data = await clientesApi.listar({ q, limit: 50 })
      if (data) {
        setClientes(prev => {
          const map = new Map(prev.map(c => [c.id, c]));
          data.forEach(d => map.set(d.id, d));
          return Array.from(map.values());
        });
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [customerSearch]);

  // Sincronizar descrições dos itens do lote com os dados do veículo quando eles mudarem
  useEffect(() => {
    const veiculoParts = [
      formData.veiculo_marca,
      formData.veiculo_modelo,
      formData.veiculo_geracao,
      formData.veiculo_ano,
      formData.veiculo_motor
    ].filter(Boolean)
    
    if (veiculoParts.length === 0) return

    const sufixo = ` ${veiculoParts.join(' ')}`
    
    setItems((prev) => {
      let changed = false
      const next = (prev || []).filter(Boolean).map(item => {
        // Se for um item do lote (possui _categoriaOriginal)
        if (item?._categoriaOriginal) {
          const novoNome = `${item._categoriaOriginal}${sufixo}`
          if (item.descricao_avulso !== novoNome) {
            changed = true
            return { ...item, descricao_avulso: novoNome }
          }
        }
        return item
      })
      return changed ? next : prev
    })
  }, [formData.veiculo_marca, formData.veiculo_modelo, formData.veiculo_ano, formData.veiculo_motor])

  // Resources for Form
  const [clientes, setClientes] = useState<{ id: string, nome: string }[]>([])
  /** Busca on-demand de produtos (debounce 300ms) — não pré-carrega o catálogo inteiro. */
  const [produtoSearch, setProdutoSearch] = useState("")
  const [produtoResults, setProdutoResults] = useState<{ id: string; nome: string; preco: number; preco_prazo?: number }[]>([])
  /** Nome/preço por id: resultados da busca + itens já selecionados / edição de orçamento. */
  const [produtoLookupById, setProdutoLookupById] = useState<
    Record<string, { id: string; nome: string; preco: number; preco_prazo?: number }>
  >({})
  const [produtoEditIndex, setProdutoEditIndex] = useState<number | null>(null)
  
  // Lote de categorias
  const [isCategoryLoteModalOpen, setIsCategoryLoteModalOpen] = useState(false)
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [preservedCategories, setPreservedCategories] = useState<any[]>([])
  const categorias = useProdutosCache(state => state.categorias) || []
  const [searchTermCat, setSearchTermCat] = useState("")
  const [lotePreco, setLotePreco] = useState<number>(0)

  // Form State (now from useDraftStore)

  // ─── Listagem de Orçamentos via TanStack Query ────────────────────────────
  // Cache 60s. Voltar à tela = instantâneo. Mutações (deletar, converter em venda)
  // continuam funcionando — fetchOrcamentos virou wrapper de invalidate.
  const queryClient = useQueryClient()

  const orcamentosQuery = useQuery({
    queryKey: ['orcamentos-list'] as const,
    queryFn: () => orcamentosApi.listar({ limit: 1000 }),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  })

  // Sync data → state local (preserva mutações)
  useEffect(() => {
    if (!orcamentosQuery.data) return
    setOrcamentos(orcamentosQuery.data || [])
    setCurrentPage(1)
  }, [orcamentosQuery.data])

  // Loading reflete estado do query
  useEffect(() => {
    setLoading(orcamentosQuery.isFetching)
  }, [orcamentosQuery.isFetching])

  const fetchOrcamentos = async () => {
    await queryClient.invalidateQueries({ queryKey: ['orcamentos-list'] })
  }

  const [atendentes, setAtendentes] = useState<{ id: string, nome: string }[]>([])

  const fetchResources = async () => {
    const [clients, staff, configs] = await Promise.allSettled([
      clientesApi.listar({ limit: 200 }),
      atendentesApi.listar(),
      configuracoesApi.obter(),
    ])
    if (clients.status === 'fulfilled' && clients.value) setClientes(clients.value)
    if (staff.status === 'fulfilled' && staff.value) setAtendentes(staff.value)
    if (configs.status === 'fulfilled' && configs.value) setCompany(configs.value)
  }

  useEffect(() => {
    if (produtoSearch.trim().length < 2) {
      setProdutoResults([])
      return
    }
    const t = setTimeout(async () => {
      try {
        const res = await estoqueApi.listarProdutos({
          q: produtoSearch.trim(),
          limit: 20,
          painel: true,
        })
        const raw = res?.items ?? res ?? []
        const arr = Array.isArray(raw) ? raw : []
        setProdutoResults(
          arr.map((p: any) => ({
            id: String(p.id),
            nome: String(p.nome ?? ''),
            preco: typeof p.preco === 'number' ? p.preco : 0,
            preco_prazo: typeof p.preco_prazo === 'number' ? p.preco_prazo : undefined,
          }))
        )
        setProdutoLookupById((prev) => {
          const next = { ...prev }
          for (const p of arr as any[]) {
            if (p?.id == null) continue
            const id = String(p.id)
            next[id] = {
              id,
              nome: String(p.nome ?? ''),
              preco: typeof p.preco === 'number' ? p.preco : 0,
              preco_prazo: typeof p.preco_prazo === 'number' ? p.preco_prazo : undefined,
            }
          }
          return next
        })
      } catch {
        setProdutoResults([])
      }
    }, 300)
    return () => clearTimeout(t)
  }, [produtoSearch])


  useEffect(() => {
    if (!initialized) return
    // Cache rápido pra 1ª pintura — TanStack Query assume depois
    const cached = getCachedPage('orcamentos')
    if (cached && !orcamentosQuery.data) {
      setOrcamentos(Array.isArray(cached) ? cached : [])
      setLoading(false)
    }
    fetchResources()

    // Resetar paginação ao montar componente
    setCurrentPage(1)

    const savedCart = localStorage.getItem('crm_orcamento_items')
    if (savedCart) {
      try {
        const parsedItems = JSON.parse(savedCart)
        const cleanItems = Array.isArray(parsedItems) ? parsedItems.filter(Boolean) : []
        if (cleanItems.length > 0) {
          setProdutoLookupById((prev) => {
            const next = { ...prev }
            for (const item of cleanItems) {
              if (item.produto_id) {
                const id = String(item.produto_id)
                next[id] = {
                  id,
                  nome: String(item.nome ?? ''),
                  preco: typeof item.preco_unitario === 'number' ? item.preco_unitario : 0,
                }
              }
            }
            return next
          })
          setItems(cleanItems)
          const aid = useAuthStore.getState().atendente?.id
          setFormData((prev: any) => ({ ...prev, vendedor_id: prev?.vendedor_id || aid || '' }))
          setIsModalOpen(true)
          localStorage.removeItem('crm_orcamento_items')
        }
      } catch (e) { }
    }
  }, [initialized])

  const formatOrcamentoMensagem = (orc: any) => {
    const fmt = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
    const rawItens = orc.itens || orc.orcamentos_itens || []
    const itens = Array.isArray(rawItens) ? rawItens.filter(Boolean) : []
    let totalAVista = 0
    let totalAPrazo = 0
    const linhasProdutos = itens.map((i: any) => {
      const nome = nomeItemOrcamentoComVeiculo(orc, i, 'Item')
      const qtd = i.quantidade || 1
      const precoUnit = i.preco_unitario || 0
      const preco = i.produtos?.preco
      const precoPrazo = i.produtos?.preco_prazo
      if (typeof preco === 'number' && preco > 0) totalAVista += qtd * preco
      if (typeof precoPrazo === 'number' && precoPrazo > 0) totalAPrazo += qtd * precoPrazo
      else if (typeof preco === 'number') totalAPrazo += qtd * preco
      return `${nome}\nQtd: ${qtd} | Unit: ${fmt(precoUnit)} | Total: ${fmt(precoUnit * qtd)}`
    })
    const totalOrc = orc.total ?? itens.reduce((s: number, i: any) => s + (i.quantidade || 1) * (i.preco_unitario || 0), 0)
    const dataCriacao = orc.data_inicio || orc.created_at ? new Date(orc.data_inicio || orc.created_at).toLocaleDateString('pt-BR') : '-'
    
    // Formatação limpa e organizada
    let msg = `ORÇAMENTO #${formatNumOrcamento(orc.numero_pedido)}\n`
    msg += `${company?.nome_fantasia || 'Loja'}\n\n`
    msg += `Cliente: ${orc.clientes?.nome || orc.cliente_avulso_nome || 'Consumidor Final'}\n`
    if (orc.veiculo_marca || orc.veiculo_modelo) {
      msg += `Veículo: ${[orc.veiculo_marca, orc.veiculo_modelo, orc.veiculo_ano, orc.veiculo_motor].filter(Boolean).join(' ')}\n`
    }
    msg += `Vendedor: ${nomeVendedorOrcamento(orc)}\n`
    msg += `Data: ${dataCriacao}\n`
    msg += `────────────────────\n\n`
    
    if (linhasProdutos.length > 0) {
      msg += `PRODUTOS:\n\n`
      msg += linhasProdutos.join('\n\n')
      msg += `\n\n────────────────────\n\n`
    }
    
    msg += `Total do Orçamento: ${fmt(totalOrc)}\n`
    if (totalAVista > 0 || totalAPrazo > 0) {
      if (totalAVista > 0) msg += `Valor à vista: ${fmt(totalAVista)}\n`
      if (totalAPrazo > 0 && totalAPrazo !== totalAVista) msg += `Valor a prazo: ${fmt(totalAPrazo)}\n`
    }
    msg += `Condição: ${orc.condicao_pagamento || 'À Vista'}\n`
    if (orc.forma_pagamento) {
      msg += `Forma de pagamento: ${orc.forma_pagamento}\n`
    }
    return msg
  }

  const handleEnviarOrcamentoWhatsApp = async (orc: Orcamento) => {
    setLoading(true)
    try {
      const orcFull = await orcamentosApi.detalhe(orc.id)
      if (!orcFull) throw new Error('Orçamento não encontrado')
      const orcCompleto = orcFull
      const msg = formatOrcamentoMensagem(orcCompleto)
      const telefone = orcCompleto.clientes?.telefone || orcCompleto.cliente_avulso_telefone

      if (!telefone) {
        toast.error('Cliente sem telefone cadastrado.')
        return
      }

      const res = openWhatsAppApp(telefone, msg)
      if (res.ok === false) {
        toast.error(res.error)
      } else {
        toast.success('WhatsApp aberto com a mensagem do orçamento!')
      }
    } catch (err) {
      console.error(err)
      toast.error('Erro ao carregar orçamento.')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenReceipt = async (orcId: string) => {
    setLoading(true)
    try {
      const orc = await orcamentosApi.detalhe(orcId)
      if (!orc) throw new Error('Orçamento não encontrado')
      setSelectedOrcamentoForReceipt(orc)
      setIsReceiptModalOpen(true)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const addItem = () => {
    setItems([...items, { produto_id: '', quantidade: 1, preco_unitario: 0 }])
  }

  const addItemAvulso = () => {
    setItems([...items, { produto_id: null, descricao_avulso: '', quantidade: 1, preco_unitario: 0 }])
  }

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  const updateItem = useCallback(
    (index: number, updates: Partial<ItemOrcamento>) => {
      setItems((prev) => {
        const newItems = [...prev]
        const existing = newItems[index]
        if (!existing) return prev
        const item = { ...existing, ...updates }

        if (updates.produto_id !== undefined && updates.preco_unitario === undefined) {
          const pid = updates.produto_id
          if (pid !== null && pid !== undefined && String(pid).trim() !== '') {
            const s = String(pid)
            const prod = produtoLookupById[s] ?? produtoResults.find((p) => p.id === s)
            if (prod) {
              item.preco_unitario =
                formData.condicao_pagamento === 'A Prazo' && prod.preco_prazo && prod.preco_prazo > 0
                  ? prod.preco_prazo
                  : prod.preco
            }
          }
        }

        newItems[index] = item
        return newItems
      })
    },
    [formData.condicao_pagamento, produtoLookupById, produtoResults]
  )

  const calculateTotal = () => {
    const subtotal = (Array.isArray(items) ? items : []).reduce((acc, item) => acc + ((item?.quantidade || 0) * (item?.preco_unitario || 0)), 0)
    return Math.max(0, subtotal - (formData.desconto_cupom || 0))
  }

  const handleConfirmarLoteCategorias = () => {
    if (selectedCategories.length === 0) return alert('Selecione pelo menos uma categoria')

    const newItems = selectedCategories.map((catId, idx) => {
      const cat = categorias.find(c => c.id === catId) || preservedCategories.find(c => c.id === catId)
      const catNome = cat?.nome || 'Peça'
      
      const veiculoParts = [
        formData.veiculo_marca,
        formData.veiculo_modelo,
        formData.veiculo_geracao,
        formData.veiculo_ano,
        formData.veiculo_motor
      ].filter(Boolean)
      
      const nomeFormatado = veiculoParts.length > 0 
        ? `${catNome} ${veiculoParts.join(' ')}`
        : catNome

      return {
        produto_id: null,
        categoria_id: catId,
        descricao_avulso: nomeFormatado,
        quantidade: 1,
        preco_unitario: lotePreco || 0,
        _tempId: `cat_${catId}_${Date.now()}_${idx}`,
        _categoriaOriginal: catNome
      }
    })

    setItems([...items, ...newItems])
    setIsCategoryLoteModalOpen(false)
    setSelectedCategories([])
    setLotePreco(0)
  }

  const handleCreateOrcamento = async (e: React.FormEvent) => {
    e.preventDefault()
    if (items.length === 0) return alert('Adicione pelo menos um item')

    const invalidItems = items.filter(Boolean).some(i => {
      const temProduto = i.produto_id && String(i.produto_id).trim() !== ''
      const temAvulso = i.descricao_avulso && String(i.descricao_avulso).trim() !== ''
      return !temProduto && !temAvulso
    })
    if (invalidItems) {
      return alert('Preencha o produto ou a descrição do item avulso para todos os itens.')
    }

    const isClienteAvulso = formData.cliente_tipo === 'avulso'
    const temCliente = isClienteAvulso
      ? (formData.cliente_avulso_nome && String(formData.cliente_avulso_nome).trim() !== '')
      : (formData.cliente_id && String(formData.cliente_id).trim() !== '')
    if (!temCliente) {
      return alert(isClienteAvulso ? 'Informe o nome do cliente avulso.' : 'Selecione um cliente ou use cliente avulso.')
    }

    setSubmitting(true)
    try {
      const total = calculateTotal()

      const orcamentoData = {
        cliente_id: isClienteAvulso ? null : (formData.cliente_id || null),
        cliente_avulso_nome: isClienteAvulso ? (formData.cliente_avulso_nome || '').trim() : null,
        cliente_avulso_telefone: isClienteAvulso ? (formData.cliente_avulso_telefone || '').trim() || null : null,
        cliente_avulso_documento: isClienteAvulso ? (formData.cliente_avulso_documento || '').trim() || null : null,
        vendedor_id: formData.vendedor_id || atendente?.id || null,
        condicao_pagamento: formData.condicao_pagamento,
        validade: formData.validade,
        status: formData.status,
        total: total,
        data_inicio: new Date().toISOString(),
        veiculo_marca: formData.veiculo_marca || null,
        veiculo_modelo: formData.veiculo_geracao && formData.veiculo_modelo ? `${formData.veiculo_modelo} ${formData.veiculo_geracao}` : (formData.veiculo_modelo || formData.veiculo_geracao || null),
        veiculo_ano: formData.veiculo_ano || null,
        veiculo_motor: formData.veiculo_motor || null,
        cupom_id: formData.cupom_id || null,
        desconto_cupom: formData.desconto_cupom || 0,
        itens: items.filter(Boolean).map(item => {
          const hasProduto = item.produto_id != null && String(item.produto_id).trim() !== ''
          const isAvulso = !hasProduto
          return {
            produto_id: isAvulso ? null : item.produto_id,
            categoria_id: isAvulso ? (item as any).categoria_id : null,
            descricao_avulso: isAvulso ? (item.descricao_avulso || '').trim() : null,
            quantidade: item.quantidade,
            preco_unitario: item.preco_unitario
          }
        })
      }

      let orcData
      if (createdOrcamentoId) {
        // Edit Mode
        orcData = await orcamentosApi.atualizar(createdOrcamentoId, orcamentoData)
        logAcao('orcamento.editar', `Orçamento atualizado — #${formatNumOrcamento(orcamentos.find(o => o.id === createdOrcamentoId)?.numero_pedido)}`, atendente?.id)
      } else {
        // Create Mode
        orcData = await orcamentosApi.criar(orcamentoData)
        logAcao('orcamento.criar', `Novo orçamento #${formatNumOrcamento(orcData?.numero_pedido)} — ${fmt(total)}`, atendente?.id)
      }

      setIsModalOpen(false)
      clearOrcamentosDraft()
      invalidateCachedPage('orcamentos')
      invalidateCachedPage('produtos')
      fetchOrcamentos()
      if (printAfterSave) {
        handleOpenReceipt(orcData.id)
        setPrintAfterSave(false)
      }
    } catch (err) {
      console.error('Error creating/updating quote:', err)
      alert('Erro ao salvar orçamento')
      setPrintAfterSave(false)
    } finally {
      setSubmitting(false)
    }
  }

  // Process ?edit= param
  useEffect(() => {
    const editId = searchParams.get('edit')
    if (editId) {
      const fetchEdit = async () => {
        try {
          const res = await orcamentosApi.detalhe(editId)
          if (res) {
            handleEditOrcamento(res)
          }
        } catch (e) {
          console.error("Failed to fetch orcamento for edit", e)
        } finally {
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev)
            next.delete('edit')
            return next
          })
        }
      }
      fetchEdit()
    }
  }, [searchParams])

  const handleEditOrcamento = async (orc: Orcamento) => {
    setCreatedOrcamentoId(orc.id);
    const orcFull = await orcamentosApi.detalhe(orc.id)
    const itens = orcFull?.itens || []

    const isAvulso = !orc.cliente_id && (orc.cliente_avulso_nome || '').trim() !== ''
    setFormData({
      cliente_id: orc.cliente_id || '',
      cliente_tipo: isAvulso ? 'avulso' : 'cadastrado',
      cliente_avulso_nome: orc.cliente_avulso_nome || '',
      cliente_avulso_telefone: orc.cliente_avulso_telefone || '',
      cliente_avulso_documento: orc.cliente_avulso_documento || '',
      vendedor_id: orc.vendedor_id || '',
      condicao_pagamento: orc.condicao_pagamento || 'À Vista',
      validade: orc.validade ? orc.validade.split('T')[0] : '',
      status: orc.status,
      veiculo_marca: orc.veiculo_marca || '',
      veiculo_modelo: orc.veiculo_modelo || '',
      veiculo_geracao: '',
      veiculo_ano: orc.veiculo_ano || '',
      veiculo_motor: orc.veiculo_motor || '',
      cupom_id: (orc as any).cupom_id || null,
      desconto_cupom: (orc as any).desconto_cupom || 0,
      appliedCoupon: (orc as any).appliedCoupon || null
    });

    const cNome = orc.clientes?.nome || orc.cliente_avulso_nome || '';
    setCustomerSearch(cNome);

    const lookupSeed: Record<string, { id: string; nome: string; preco: number; preco_prazo?: number }> = {}
    for (const i of (itens as any[] || []).filter(Boolean)) {
      if (i.produto_id && i.produtos?.nome) {
        lookupSeed[String(i.produto_id)] = {
          id: String(i.produto_id),
          nome: String(i.produtos.nome),
          preco: typeof i.produtos.preco === 'number' ? i.produtos.preco : 0,
        }
      }
    }
    setProdutoLookupById(lookupSeed)
    setProdutoResults([])
    setProdutoSearch('')
    setProdutoEditIndex(null)

    if (itens && Array.isArray(itens)) {
      setItems(itens.filter(Boolean).map(i => ({
        produto_id: i.produto_id,
        categoria_id: i.categoria_id,
        descricao_avulso: i.descricao_avulso || undefined,
        quantidade: i.quantidade,
        preco_unitario: i.preco_unitario
      })));
    } else {
      setItems([]);
    }

    setIsModalOpen(true);
  }

  const handleDeleteOrcamento = async (id: string) => {
    if (!confirm('Deseja realmente excluir este orçamento?')) return;
    try {
      await orcamentosApi.deletar(id);
      
      // Atualização Instantânea na UI
      setOrcamentos(prev => prev.filter(o => o.id !== id));
      invalidateCachedPage('orcamentos')
      invalidateCachedPage('produtos')
      
      // Tarefas em background
      void (async () => {
        logAcao('orcamento.excluir', `Orçamento removido (id ${id.slice(0, 8)}.)`, atendente?.id)
        await fetchOrcamentos();
      })();

      toast.success("Orçamento excluído com sucesso");
    } catch (e: any) {
      toast.error('Erro ao excluir: ' + e.message);
      void fetchOrcamentos();
    }
  }

  const handleConvertOrcamento = async (orc: Orcamento) => {
    if (submitting) return;

    const itensAvulsosSemCategoria = (orc.orcamentos_itens || []).filter(
      (i: any) => i && !i.produto_id && !i.categoria_id
    ) || [];

    if (itensAvulsosSemCategoria.length > 0) {
      window.alert(
        `Atenção: ${itensAvulsosSemCategoria.length} item(ns) avulso(s) não possuem categoria e serão ignorados.

Edite o orçamento e selecione a categoria para incluí-los na venda.`
      );
    }

    setSubmitting(true);
    try {
      // Step 1: Prepare the conversion (create products for avulsos)
      const data = await orcamentosApi.prepararVenda(orc.id);
      
      if (!data) throw new Error('Erro ao preparar dados da venda');

      const { orcamento, itens } = data;

      // Step 2: Prepare the Sale Draft
      const vendaItems = (itens || []).map((i: any) => ({
        _rowId: `r_${Math.random().toString(36).substr(2, 9)}`,
        produto_id: i.produto_id || '',
        quantidade: i.quantidade || 1,
        preco_unitario: i.preco_unitario || 0,
        desconto: 0,
        subtotal: (i.quantidade || 1) * (i.preco_unitario || 0),
        _search: i.produto_nome || i.descricao_avulso || '',
        _sku: i.produto_sku || ''
      })).filter((i: any) => i.produto_id); // Only include items that became products

      if (vendaItems.length === 0) {
        alert('Nenhum item válido para venda (verifique se os itens avulsos têm categoria).');
        return;
      }

      // Fill the draft store
      setVendasDraft({
        isNovoPedidoModalOpen: true,
        editingVendaId: null,
        vendaItems,
        vendaForm: {
          cliente_id: orcamento.cliente_id || '',
          atendente_id: orcamento.vendedor_id || atendente?.id || '',
          status: 'Pendente',
          forma_pagamento: orcamento.condicao_pagamento || 'Dinheiro',
          parcelas: (orcamento as any).parcelas || 1,
          observacoes: `Convertido do Orçamento #${formatNumOrcamento(orc.numero_pedido)}`,
          orcamento_id: orcamento.id,
          cupom_id: orcamento.cupom_id || null,
          desconto_cupom: orcamento.desconto_cupom || 0,
          appliedCoupon: orcamento.appliedCoupon || null
        },
        vendaDelivery: (() => {
          let rua = (orcamento.endereco_logradouro || '').trim();
          let numero = (orcamento.endereco_numero || '').trim();
          let bairro = (orcamento.endereco_bairro || '').trim();

          if (rua && !numero && !bairro) {
            const parts = rua.split(/[,–-]/).map(s => s.trim()).filter(Boolean);
            if (parts.length >= 2) {
              rua = parts[0];
              numero = parts[1];
              if (parts.length >= 3) bairro = parts.slice(2).join(' - ');
            } else {
              const match = rua.match(/^(.+?)\s+(\d+[a-zA-Z]?|s\/n|S\/N)\s+(.*)$/i);
              if (match) {
                rua = match[1].trim();
                numero = match[2].trim();
                bairro = match[3].trim();
              }
            }
          }

          return {
            cliente_contato: orcamento.cliente_telefone || '',
            recebedor_nome: orcamento.cliente_nome || orcamento.cliente_avulso_nome || '',
            rua: rua || '',
            numero: numero || '',
            bairro: bairro || '',
            cidade: orcamento.endereco_cidade || '',
            estado: orcamento.endereco_uf || '',
            cep: orcamento.cep || '',
            horario_entrega: '09:00',
            observacao_entrega: ''
          };
        })()
      });

      // Step 3: Navigate to Vendas
      navigate('/vendas');

    } catch (e: any) {
      console.error('Erro na preparação da venda:', e);
      alert('Erro ao preparar venda: ' + (e?.message || e));
    } finally {
      setSubmitting(false);
    }
  }

  const filteredOrcamentos = orcamentos.filter(o =>
    String(o.numero_pedido || '').includes(searchTerm) ||
    o.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (o.clientes?.nome || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (o.cliente_avulso_nome || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    nomeVendedorOrcamento(o).toLowerCase().includes(searchTerm.toLowerCase()) ||
    (o.orcamentos_itens || []).filter(Boolean).some((i: any) =>
      nomeItemOrcamentoComVeiculo(o, i, '')
        .toLowerCase()
        .includes(searchTerm.toLowerCase()),
    )
  )

  // Paginação nos resultados filtrados
  const filteredTotalPages = Math.ceil(filteredOrcamentos.length / itemsPerPage)
  const filteredIndexOfLastItem = currentPage * itemsPerPage
  const filteredIndexOfFirstItem = filteredIndexOfLastItem - itemsPerPage
  const paginatedOrcamentos = filteredOrcamentos.slice(filteredIndexOfFirstItem, filteredIndexOfLastItem)

  // Handlers de navegação
  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= filteredTotalPages) {
      setCurrentPage(page)
    }
  }

  const hasDraftOrcamento = !createdOrcamentoId && !isModalOpen && (items.length > 0 || !!formData?.cliente_id || !!formData?.cliente_avulso_nome)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Orçamentos</h1>
          <p className="text-foreground mt-1">Gerencie propostas comerciais e converta em vendas.</p>
        </div>
        <div className="flex items-center gap-2">
          {hasDraftOrcamento && (
            <button
              onClick={() => {
                if (!window.confirm('Descartar o rascunho e começar um novo orçamento?')) return
                clearOrcamentosDraft()
              }}
              className="text-xs text-muted-foreground hover:text-destructive underline underline-offset-2 transition-colors"
            >
              Descartar
            </button>
          )}
          <Button className="gap-2 relative" onClick={() => {
            if (hasDraftOrcamento) {
              setIsModalOpen(true)
              return
            }
            const savedCart = localStorage.getItem('crm_orcamento_items')
            let hasLoadedCart = false
            if (savedCart) {
              try {
                const parsedItems = JSON.parse(savedCart)
                const cleanItems = Array.isArray(parsedItems) ? parsedItems.filter(Boolean) : []
                if (cleanItems.length > 0) {
                  setProdutoLookupById((prev) => {
                    const next = { ...prev }
                    for (const item of cleanItems) {
                      if (item.produto_id) {
                        const id = String(item.produto_id)
                        next[id] = {
                          id,
                          nome: String(item.nome ?? ''),
                          preco: typeof item.preco_unitario === 'number' ? item.preco_unitario : 0,
                        }
                      }
                    }
                    return next
                  })
                  setItems(cleanItems)
                  localStorage.removeItem('crm_orcamento_items')
                  hasLoadedCart = true
                }
              } catch (e) { setItems([]) }
            } else {
              setItems([])
            }
            setProdutoSearch('')
            setProdutoResults([])
            if (!hasLoadedCart) {
              setProdutoLookupById({})
            }
            setProdutoEditIndex(null)
            setCreatedOrcamentoId(null)
            setFormData({
              cliente_id: '',
              cliente_tipo: 'cadastrado',
              cliente_avulso_nome: '',
              cliente_avulso_telefone: '',
              cliente_avulso_documento: '',
              vendedor_id: atendente?.id || '',
              condicao_pagamento: 'À Vista',
              validade: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              status: 'Aberto',
              veiculo_marca: '',
              veiculo_modelo: '',
              veiculo_geracao: '',
              veiculo_ano: '',
              veiculo_motor: ''
            })
            setCustomerSearch('')
            setIsModalOpen(true)
          }}>
            <Plus className="w-4 h-4" />
            {hasDraftOrcamento ? 'Continuar Rascunho' : 'Novo Orçamento'}
            {hasDraftOrcamento && <span className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-amber-400 rounded-full border-2 border-background" />}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="relative w-72">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por cliente, ID..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Button variant="outline" className="gap-2">
              <Filter className="w-4 h-4" />
              Filtros
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center p-8 text-muted-foreground">
              Carregando orçamentos...
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Produtos</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Condição</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Período (Início/Fim)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrcamentos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Nenhum orçamento encontrado.
                    </TableCell>
                  </TableRow>
                ) : paginatedOrcamentos.map((orcamento) => (
                  <TableRow key={orcamento.id}>
                    <TableCell className="font-extrabold text-indigo-700 text-sm">
                      #{formatNumOrcamento(orcamento.numero_pedido)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 max-w-[320px]">
                        {(orcamento.orcamentos_itens || []).filter(Boolean).map((item: any, idx: number) => (
                          <div key={idx} className="text-[13px] font-bold text-foreground flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                            {nomeItemOrcamentoComVeiculo(orcamento, item, 'Item avulso')}
                            {item.produtos?.estoque_atual !== undefined && (
                              <Badge 
                                variant={item.produtos.estoque_atual > 0 ? "outline" : "destructive"} 
                                className="text-[9px] h-4 px-1 font-black uppercase tracking-tighter"
                                title={`Estoque atual: ${item.produtos.estoque_atual}`}
                              >
                                {item.produtos.estoque_atual > 0 ? `Est: ${item.produtos.estoque_atual}` : "Vazio"}
                              </Badge>
                            )}
                          </div>
                        ))}
                        {(!orcamento.orcamentos_itens || orcamento.orcamentos_itens.length === 0) && <span className="text-[10px] text-muted-foreground italic">Sem itens</span>}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium text-sm">
                      <div className="flex items-center gap-2">
                        <User className="w-3 h-3 text-muted-foreground" />
                        {orcamento.clientes?.nome || orcamento.cliente_avulso_nome || "Consumidor Final"}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs italic text-foreground">
                      {nomeVendedorOrcamento(orcamento)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {orcamento.condicao_pagamento || 'À Vista'}
                    </TableCell>
                    <TableCell className="font-bold">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(orcamento.total)}
                    </TableCell>
                    <TableCell className="text-[10px] leading-tight">
                      <div className="flex flex-col">
                        <span className="text-muted-foreground">De: {orcamento.created_at || orcamento.data_inicio ? String(orcamento.created_at || orcamento.data_inicio).substring(0, 10).split('-').reverse().join('/') : '-'}</span>
                        <span className="font-medium text-destructive">Até: {orcamento.validade ? String(orcamento.validade).substring(0, 10).split('-').reverse().join('/') : "-"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          orcamento.status === 'Convertido' ? 'default' :
                          orcamento.status === 'Aprovado' ? 'default' :
                            orcamento.status === 'Aberto' ? 'outline' : 'destructive'
                        }
                        className={"text-[10px]" + (orcamento.status === 'Convertido' ? ' bg-emerald-600 hover:bg-emerald-600 text-white border-emerald-600' : '')}
                      >
                        {orcamento.status === 'Convertido' ? '✓ Vendido' : orcamento.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          title="Enviar para Separação de Peças"
                          onClick={() => {
                            setOrcamentoParaSeparacao(orcamento)
                            setSeparacaoAtendente1(true)
                            setSeparacaoAtendente2(false)
                            setIsSeparacaoModalOpen(true)
                          }}
                        >
                          <Wrench className="w-4 h-4 text-amber-600" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" title="Abrir no WhatsApp do sistema" onClick={() => handleEnviarOrcamentoWhatsApp(orcamento)}>
                          <MessageCircle className="w-4 h-4 text-emerald-600" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" title="Imprimir" onClick={() => handleOpenReceipt(orcamento.id)}>
                          <Printer className="w-4 h-4 text-primary" />
                        </Button>
                        {orcamento.status !== 'Aprovado' && orcamento.status !== 'Convertido' && (
                          <Button 
                            type="button"
                            variant="ghost" 
                            size="icon" 
                            title="Converter em Venda" 
                            onClick={() => handleConvertOrcamento(orcamento)}
                            disabled={submitting}
                          >
                            {submitting ? (
                              <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                            ) : (
                              <ShoppingCart className="w-4 h-4 text-emerald-500" />
                            )}
                          </Button>
                        )}
                        <Button type="button" variant="ghost" size="icon" title="Editar" onClick={() => handleEditOrcamento(orcamento)}>
                          <Pencil className="w-4 h-4 text-muted-foreground" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" title="Excluir" onClick={() => handleDeleteOrcamento(orcamento.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
        
        {/* Paginação */}
        {filteredOrcamentos.length > 0 && (
          <div className="px-6 py-4 border-t flex items-center justify-between bg-gray-50/50">
            <div className="text-sm text-muted-foreground">
              Mostrando {filteredIndexOfFirstItem + 1}-{Math.min(filteredIndexOfLastItem, filteredOrcamentos.length)} de {filteredOrcamentos.length} orçamentos
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="h-8 w-8 p-0"
              >
                &lt;
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, filteredTotalPages) }, (_, i) => {
                  // Mostra páginas ao redor da atual
                  let pageNum
                  if (filteredTotalPages <= 5) {
                    pageNum = i + 1
                  } else if (currentPage <= 3) {
                    pageNum = i + 1
                  } else if (currentPage >= filteredTotalPages - 2) {
                    pageNum = filteredTotalPages - 4 + i
                  } else {
                    pageNum = currentPage - 2 + i
                  }
                  return (
                    <Button
                      key={pageNum}
                      variant={currentPage === pageNum ? "default" : "outline"}
                      size="sm"
                      onClick={() => handlePageChange(pageNum)}
                      className="h-8 w-8 p-0 text-xs"
                    >
                      {pageNum}
                    </Button>
                  )
                })}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === filteredTotalPages}
                className="h-8 w-8 p-0"
              >
                &gt;
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Paginação */}
      {filteredOrcamentos.length > 0 && (
        <div className="px-6 py-4 border-t flex items-center justify-between bg-gray-50/50">
          <div className="text-sm text-muted-foreground">
            Mostrando {filteredIndexOfFirstItem + 1}-{Math.min(filteredIndexOfLastItem, filteredOrcamentos.length)} de {filteredOrcamentos.length} orçamentos
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="h-8 w-8 p-0"
            >
              &lt;
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, filteredTotalPages) }, (_, i) => {
                // Mostra páginas ao redor da atual
                let pageNum
                if (filteredTotalPages <= 5) {
                  pageNum = i + 1
                } else if (currentPage <= 3) {
                  pageNum = i + 1
                } else if (currentPage >= filteredTotalPages - 2) {
                  pageNum = filteredTotalPages - 4 + i
                } else {
                  pageNum = currentPage - 2 + i
                }
                return (
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? "default" : "outline"}
                    size="sm"
                    onClick={() => handlePageChange(pageNum)}
                    className="h-8 w-8 p-0 text-xs"
                  >
                    {pageNum}
                  </Button>
                )
              })}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === filteredTotalPages}
              className="h-8 w-8 p-0"
            >
              &gt;
            </Button>
          </div>
        </div>
      )}

      {/* NEW QUOTE MODAL */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={createdOrcamentoId ? "Editar Orçamento" : "Gerar Novo Orçamento"}
        className="max-w-2xl"
      >
        <form onSubmit={handleCreateOrcamento} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cliente</Label>
              <div className="flex gap-2 mb-2">
                <Button
                  type="button"
                  variant={formData.cliente_tipo === 'cadastrado' ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1"
                  onClick={() => setFormData({ ...formData, cliente_tipo: 'cadastrado', cliente_id: formData.cliente_id, cliente_avulso_nome: '', cliente_avulso_telefone: '', cliente_avulso_documento: '' })}
                >
                  <User className="w-3 h-3 mr-1" /> Cadastrado
                </Button>
                <Button
                  type="button"
                  variant={formData.cliente_tipo === 'avulso' ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1 border-amber-500/50"
                  onClick={() => setFormData({ ...formData, cliente_tipo: 'avulso', cliente_id: '', cliente_avulso_nome: formData.cliente_avulso_nome || '', cliente_avulso_telefone: formData.cliente_avulso_telefone || '', cliente_avulso_documento: formData.cliente_avulso_documento || '' })}
                >
                  <FilePlus2 className="w-3 h-3 mr-1" /> Avulso
                </Button>
              </div>
              {formData.cliente_tipo === 'cadastrado' ? (
                <div className="relative">
                  <Input
                    placeholder="Pesquisar cliente (nome)..."
                    value={customerSearch}
                    onChange={e => {
                      setCustomerSearch(e.target.value);
                      setShowCustomerDropdown(true);
                      // Se apagar tudo, limpa o ID
                      if (!e.target.value) setFormData({ ...formData, cliente_id: '' });
                    }}
                    onFocus={() => setShowCustomerDropdown(true)}
                  />
                  {showCustomerDropdown && (
                    <div className="absolute z-50 mt-1 w-full bg-background border rounded-md shadow-xl max-h-[250px] overflow-auto scrollbar-thin">
                      {clientes
                        .filter(c => !customerSearch || c.nome.toLowerCase().includes(customerSearch.toLowerCase()) || (c.razao_social && c.razao_social.toLowerCase().includes(customerSearch.toLowerCase())))
                        .slice(0, 100)
                        .map(c => (
                          <div
                            key={c.id}
                            className="p-3 text-sm hover:bg-muted cursor-pointer transition-colors border-b last:border-0"
                            onClick={() => {
                              setFormData({ ...formData, cliente_id: c.id });
                              setCustomerSearch(c.nome);
                              setShowCustomerDropdown(false);
                            }}
                          >
                            {c.nome}
                          </div>
                        ))}
                      {clientes.filter(c => !customerSearch || c.nome.toLowerCase().includes(customerSearch.toLowerCase()) || (c.razao_social && c.razao_social.toLowerCase().includes(customerSearch.toLowerCase()))).length === 0 && (
                        <div className="p-4 text-center text-xs text-muted-foreground italic">Nenhum cliente encontrado</div>
                      )}
                    </div>
                  )}
                  {showCustomerDropdown && (
                    <div className="fixed inset-0 z-40" onClick={() => setShowCustomerDropdown(false)}></div>
                  )}
                </div>
              ) : (
                <div className="space-y-2 p-3 border border-amber-500/50 rounded-lg bg-amber-50/30 dark:bg-amber-950/20">
                  <Input
                    placeholder="Nome do cliente *"
                    value={formData.cliente_avulso_nome || ''}
                    onChange={e => setFormData({ ...formData, cliente_avulso_nome: e.target.value })}
                  />
                  <Input
                    placeholder="Telefone"
                    value={formData.cliente_avulso_telefone || ''}
                    onChange={e => setFormData({ ...formData, cliente_avulso_telefone: e.target.value })}
                  />
                  <Input
                    placeholder="CPF/CNPJ"
                    value={formData.cliente_avulso_documento || ''}
                    onChange={e => setFormData({ ...formData, cliente_avulso_documento: e.target.value })}
                  />
                  <p className="text-[10px] text-muted-foreground">Não será cadastrado. Dados apagados com o orçamento.</p>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Vendedor Responsável</Label>
              <Select
                value={formData.vendedor_id}
                onChange={e => setFormData({ ...formData, vendedor_id: e.target.value })}
              >
                <option value="">Selecionar vendedor...</option>
                {atendentes.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </Select>
            </div>
          </div>

          {/* DADOS DO VEÍCULO */}
          <div className="p-4 bg-muted/30 rounded-xl border border-border/50 space-y-3">
            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Car className="w-3.5 h-3.5" /> Informações do Veículo
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Marca</Label>
                <div className="relative">
                  <Input
                    placeholder="Marca..."
                    value={formData.veiculo_marca || ''}
                    className="h-10"
                    onChange={e => setFormData({ ...formData, veiculo_marca: e.target.value })}
                    list="marcas-orc-header"
                  />
                  <datalist id="marcas-orc-header">
                    {marcas.map(m => <option key={m.id} value={m.nome} />)}
                  </datalist>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Modelo</Label>
                <div className="relative">
                  <Input
                    placeholder="Modelo..."
                    value={formData.veiculo_modelo || ''}
                    className="h-10"
                    onChange={e => setFormData({ ...formData, veiculo_modelo: e.target.value })}
                    list="modelos-orc-header"
                  />
                  <datalist id="modelos-orc-header">
                    {modelos
                      .filter(m => !formData.veiculo_marca || marcas.find(br => br.nome === formData.veiculo_marca)?.id === m.marca_id)
                      .slice(0, 50)
                      .map(m => <option key={m.id} value={m.nome} />)}
                  </datalist>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Geração</Label>
                <Input
                  placeholder="Ex: G5"
                  className="h-10"
                  value={formData.veiculo_geracao || ''}
                  onChange={e => setFormData({ ...formData, veiculo_geracao: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Ano</Label>
                <Input
                  placeholder="Ex: 2015"
                  className="h-10"
                  value={formData.veiculo_ano || ''}
                  onChange={e => setFormData({ ...formData, veiculo_ano: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Motor</Label>
                <Input
                  placeholder="Ex: 1.0 8V"
                  className="h-10"
                  value={formData.veiculo_motor || ''}
                  onChange={e => setFormData({ ...formData, veiculo_motor: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Condição de Pagamento</Label>
              <Select
                value={formData.condicao_pagamento}
                onChange={e => {
                  const newCond = e.target.value;
                  setFormData({ ...formData, condicao_pagamento: newCond });
                  setItems(items.filter(Boolean).map(item => {
                    const pid = item?.produto_id
                    if (pid === null || pid === undefined || String(pid).trim() === '') return item
                    const s = String(pid)
                    const p = produtoLookupById[s] ?? produtoResults.find((pp) => pp.id === s)
                    if (p) {
                      const newPrice = newCond === 'A Prazo' && p.preco_prazo && p.preco_prazo > 0 ? p.preco_prazo : p.preco
                      return { ...item, preco_unitario: newPrice }
                    }
                    return item
                  }))
                }}
              >
                <option value="À Vista">À Vista</option>
                <option value="A Prazo">A Prazo</option>
              </Select>
            </div>
            <div className="space-y-2 invisible">
              {/* Spacer */}
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
              <FileText className="w-4 h-4" /> Itens do Orçamento
            </h3>

            <div className="space-y-3">
              {(items || []).filter(Boolean).map((item, index) => {
                const isAvulso = !item.produto_id || String(item.produto_id).trim() === ''
                const itemKey = item._tempId || `${index}_${item.produto_id || 'av'}`
                return (
                  <div key={itemKey} className={`grid grid-cols-[1fr_80px_120px_40px] gap-3 items-end p-3 border rounded-lg ${isAvulso ? 'border-amber-500/50 bg-amber-50/30 dark:bg-amber-950/20' : 'border-border bg-muted/20'}`}>
                    <div className="space-y-2">
                      <Label className="text-[10px]">{isAvulso ? 'Descrição (item avulso)' : 'Produto'}</Label>
                      {isAvulso ? (
                        <Input
                          placeholder="Ex: Frete, Instalação, Serviço..."
                          value={item.descricao_avulso || ''}
                          onChange={e => updateItem(index, { descricao_avulso: e.target.value })}
                        />
                      ) : (
                        <Input
                          list="orcamento-produtos-datalist"
                          autoComplete="off"
                          placeholder="Digite para buscar produto..."
                          className="h-10"
                          value={
                            produtoEditIndex === index
                              ? produtoSearch
                              : item.produto_id
                                ? (produtoLookupById[String(item.produto_id)]?.nome ?? '')
                                : ''
                          }
                          onFocus={() => {
                            setProdutoEditIndex(index)
                            const id = item.produto_id ? String(item.produto_id) : ''
                            setProdutoSearch(id ? (produtoLookupById[id]?.nome ?? '') : '')
                          }}
                          onChange={(e) => {
                            setProdutoEditIndex(index)
                            setProdutoSearch(e.target.value)
                            if (!e.target.value.trim()) {
                              updateItem(index, { produto_id: '', preco_unitario: 0 })
                            }
                          }}
                          onBlur={() => {
                            if (produtoEditIndex !== index) return
                            const trimmed = produtoSearch.trim()
                            const match =
                              produtoResults.find((p) => p.nome === trimmed) ||
                              Object.values(produtoLookupById).find((p) => p.nome === trimmed)
                            if (match) {
                              setProdutoLookupById((prev) => ({ ...prev, [match.id]: match }))
                              const newPrice =
                                formData.condicao_pagamento === 'A Prazo' && match.preco_prazo && match.preco_prazo > 0
                                  ? match.preco_prazo
                                  : match.preco
                              updateItem(index, { produto_id: match.id, preco_unitario: newPrice })
                            } else if (item.produto_id) {
                              setProdutoSearch(produtoLookupById[String(item.produto_id)]?.nome ?? '')
                            }
                            setProdutoEditIndex(null)
                          }}
                        />
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px]">Qtd</Label>
                      <Input
                        type="number"
                        min="1"
                        value={item.quantidade}
                        onChange={e => updateItem(index, { quantidade: parseInt(e.target.value, 10) || 0 })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px]">Preço Un.</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={item.preco_unitario}
                        onChange={e => updateItem(index, { preco_unitario: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive h-10 w-10 shrink-0"
                      onClick={() => removeItem(index)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )
              })}
            </div>
            <datalist id="orcamento-produtos-datalist">
              {produtoResults.map((p) => (
                <option key={p.id} value={p.nome} />
              ))}
            </datalist>
            <div className="flex justify-center pt-2">
              <Button 
                type="button" 
                variant="outline" 
                size="lg"
                onClick={() => setIsCategoryLoteModalOpen(true)} 
                className="gap-2 border-indigo-500/50 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 w-full md:w-auto h-12 px-8 font-bold text-base shadow-sm hover:shadow-md transition-all"
              >
                <Plus className="w-5 h-5" /> 
                Lote por Categorias
              </Button>
            </div>
          </div>

          <div className="p-4 bg-indigo-50/50 dark:bg-indigo-950/20 border-y border-indigo-100 dark:border-indigo-900/50 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] font-black uppercase tracking-widest text-indigo-500 flex items-center gap-1">
                <Ticket className="w-3 h-3" /> Cupom de Desconto
              </Label>
              {formData.appliedCoupon && (
                <Badge variant="outline" className="bg-indigo-100 text-indigo-700 border-indigo-200 text-[9px] uppercase font-bold">
                  Aplicado
                </Badge>
              )}
            </div>
            <div className="flex gap-2">
              <Input 
                placeholder="CÓDIGO" 
                className="h-10 text-sm font-bold text-indigo-600 bg-white border-indigo-100 focus:border-indigo-500 uppercase" 
                value={couponCode}
                onChange={e => setCouponCode(e.target.value.toUpperCase())}
                disabled={!!formData.appliedCoupon}
              />
              {formData.appliedCoupon ? (
                <Button 
                  type="button" 
                  variant="ghost"
                  className="h-10 px-3 text-red-500 hover:text-red-700 hover:bg-red-50"
                  onClick={() => {
                    setFormData({
                      ...formData,
                      cupom_id: null,
                      desconto_cupom: 0,
                      appliedCoupon: null
                    })
                    setCouponCode('')
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              ) : (
                <Button 
                  type="button" 
                  className="h-10 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[10px] uppercase tracking-wider rounded-xl transition-all active:scale-95"
                  onClick={handleApplyCoupon}
                  disabled={!couponCode}
                >
                  Validar
                </Button>
              )}
            </div>
            {formData.appliedCoupon && (
              <div className="flex items-center justify-between px-1">
                <p className="text-[10px] font-bold text-indigo-600">
                  {formData.appliedCoupon.tipo === 'porcentagem' ? `${formData.appliedCoupon.valor}% de desconto` : `R$ ${formData.appliedCoupon.valor} de desconto`}
                </p>
                <p className="text-[10px] font-black text-indigo-700">
                  - {fmt(formData.desconto_cupom)}
                </p>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between p-4 border-t border-border mt-4">
            <div className="text-sm text-foreground font-medium">
              Total do Orçamento: <span className="text-xl font-bold text-foreground ml-2">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(calculateTotal())}
              </span>
            </div>
            <div className="flex gap-3">
              <Button type="submit" variant="outline" onClick={() => setPrintAfterSave(true)} className="gap-2 border-primary text-primary hover:bg-primary hover:text-white">
                <Printer className="w-4 h-4" /> Salvar e Imprimir
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* MODAL SEPARAÇÃO DE PEÇAS */}
      <Modal
        isOpen={isSeparacaoModalOpen}
        onClose={() => setIsSeparacaoModalOpen(false)}
        title="Enviar para Separação de Peças"
        className="max-w-sm"
      >
        <div className="space-y-5 py-2">
          <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-lg">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
              🔧 Orçamento <span className="font-black">#{orcamentoParaSeparacao?.numero_pedido ? String(orcamentoParaSeparacao.numero_pedido).padStart(4, '0') : '?'}</span>
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
              Uma mensagem WhatsApp será enviada por produto do orçamento.
            </p>
          </div>

          <div className="space-y-3">
            <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Destinatários</Label>
            <label className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/40 cursor-pointer transition-colors">
              <input
                type="checkbox"
                className="w-4 h-4 accent-amber-600"
                checked={separacaoAtendente1}
                onChange={e => setSeparacaoAtendente1(e.target.checked)}
              />
              <span className="text-sm font-medium">
                {company?.whatsapp_pedido_venda_atendente1_nome || 'Atendente 1'} (configurado no sistema)
              </span>
            </label>
            <label className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/40 cursor-pointer transition-colors">
              <input
                type="checkbox"
                className="w-4 h-4 accent-amber-600"
                checked={separacaoAtendente2}
                onChange={e => setSeparacaoAtendente2(e.target.checked)}
              />
              <span className="text-sm font-medium">
                {company?.whatsapp_pedido_venda_atendente2_nome || 'Atendente 2'} (configurado no sistema)
              </span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setIsSeparacaoModalOpen(false)} disabled={sendingSeparacao}>
              Cancelar
            </Button>
            <Button
              onClick={handleEnviarSeparacao}
              disabled={sendingSeparacao || (!separacaoAtendente1 && !separacaoAtendente2)}
              className="bg-amber-600 hover:bg-amber-700 text-white gap-2"
            >
              {sendingSeparacao ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Wrench className="w-4 h-4" />
              )}
              {sendingSeparacao ? 'Enviando...' : 'Enviar Separação'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL IMPRESSÃO ORÇAMENTO */}
      <Modal isOpen={isReceiptModalOpen} onClose={() => setIsReceiptModalOpen(false)} title="Impressão de Orçamento" className="max-w-4xl">
        {selectedOrcamentoForReceipt && (
          <div className="space-y-4">
            <div className="flex justify-between items-center bg-muted/50 p-2 rounded-lg no-print">
              <div className="flex gap-2">
                {(['a4', 'a5', 'cupom', 'cupom58'] as const).map(f => (
                  <Button
                    key={f}
                    variant={printFormat === f ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setPrintFormat(f)}
                    className="h-8 capitalize"
                  >
                    {f === 'cupom' ? 'Cupom 80mm' : f === 'cupom58' ? 'Cupom 58mm' : `Papel ${f.toUpperCase()}`}
                  </Button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="gap-2 border-emerald-500 text-emerald-600 hover:bg-emerald-50"
                  onClick={() => {
                    setIsReceiptModalOpen(false)
                    handleEnviarOrcamentoWhatsApp(selectedOrcamentoForReceipt)
                  }}
                >
                  <MessageCircle className="w-4 h-4" /> Enviar pelo WhatsApp
                </Button>
                <Button onClick={() => window.print()} className="bg-primary hover:bg-primary/90">
                  <Printer className="w-4 h-4 mr-2" /> Imprimir Agora
                </Button>
              </div>
            </div>

            <div className="bg-slate-100 p-8 overflow-auto max-h-[70vh] rounded-lg border border-slate-200 print-wrapper">
              <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&display=swap');
                .print-preview-container { 
                  background-color: #ffffff !important; 
                  color: #000000 !important;
                  margin: 0 auto;
                  box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                }
                @media print {
                  @page { margin: 5mm; size: auto; }
                  body { background: white !important; margin: 0 !important; padding: 0 !important; }
                  .no-print { display: none !important; }
                  
                  #root, .modal-backdrop, [role="dialog"] > div:first-child { 
                    display: none !important; 
                  }

                  .fixed.inset-0 { 
                    position: static !important; 
                    display: block !important; 
                    padding: 0 !important; 
                  }

                  .modal-container { 
                    position: static !important;
                    width: 100% !important;
                    height: auto !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    box-shadow: none !important;
                    border: none !important;
                    background: white !important;
                    max-width: none !important;
                  }

                  .modal-body {
                    padding: 0 !important;
                    margin: 0 !important;
                    max-height: none !important;
                    overflow: visible !important;
                  }

                  .print-wrapper {
                    background: transparent !important;
                    padding: 0 !important;
                    margin: 0 !important;
                    border: none !important;
                    max-height: none !important;
                    overflow: visible !important;
                    box-shadow: none !important;
                  }

                  .print-preview-container { 
                    width: 100% !important;
                    max-width: 100% !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    box-shadow: none !important;
                    border: none !important;
                  }
                  
                  .a4, .a5, .cupom, .cupom58 { 
                    width: 100% !important; 
                    min-height: 0 !important; 
                    padding: 0 !important; 
                    margin: 0 !important;
                    border: none !important;
                  }

                  .max-h-[70vh], .overflow-auto { 
                    max-height: none !important; 
                    overflow: visible !important; 
                    padding: 0 !important;
                    margin: 0 !important;
                  }
                }
                .a4 { width: 210mm; min-height: 297mm; padding: 15mm; font-size: 11pt; --base-font: 11pt; }
                .a5 { width: 148mm; min-height: 210mm; padding: 8mm; font-size: 9pt; --base-font: 9pt; }
                .cupom { width: 80mm; padding: 4mm; font-size: 10pt; --base-font: 10pt; font-family: 'Courier Prime', monospace; }
                .cupom58 { width: 58mm; padding: 2mm; font-size: 8pt; --base-font: 8pt; font-family: 'Courier Prime', monospace; }
                .formal-header { border-bottom: 2px solid #000; padding: 10px 0; display: flex; align-items: center; justify-content: space-between; margin-bottom: 15px; }
                /* A5 Specific Compaction */
                .a5 .formal-header { margin-bottom: 8px; padding: 5px 0; }
                .a5 .delivery-box { padding: 4px !important; margin-bottom: 8px !important; margin-top: 8px !important; border: 1px solid #000 !important; }
                .a5 .delivery-box .text-lg { font-size: 11px !important; }
                .a5 .delivery-box .text-base { font-size: 10px !important; }
                .a5 .delivery-box .text-sm { font-size: 9px !important; }
                .a5 .mt-10 { margin-top: 10px !important; }
                .a5 .mt-8 { margin-top: 8px !important; }
                .formal-table { width: 100%; border-collapse: collapse; margin-top: 10px; table-layout: fixed; }
                .formal-table th { text-align: left; font-size: calc(var(--base-font) * 0.85); border-bottom: 2px solid #000; padding: 5px 2px; }
                .formal-table td { padding: 6px 2px; font-size: var(--base-font); border-bottom: 1px dotted #ccc; }
                .formal-section { border-top: 2px solid #000; margin-top: 15px; padding-top: 5px; }
                .formal-label { font-size: calc(var(--base-font) * 0.75); font-weight: bold; text-transform: uppercase; }
              `}</style>

              <div className={`print-preview-container ${printFormat} text-black`}>
                {printFormat.includes('cupom') ? (
                  <div className="ticket-content">
                    <div className="text-center mb-4">
                      <p className="font-bold text-lg">{company?.nome_fantasia || 'LOJA'}</p>
                      <p className="text-[10px]">CNPJ: {company?.cnpj || '00.000.000/0000-00'}</p>
                      <p className="text-[10px]">{company?.logradouro}, {company?.numero}</p>
                      <p className="text-[10px] TEL:">{company?.telefone || '(00) 0000-0000'}</p>
                    </div>
                    <div className="border-y-2 border-black py-1 font-bold text-center uppercase my-2">ORÇAMENTO Nº {formatNumOrcamento(selectedOrcamentoForReceipt.numero_pedido)}</div>
                    <div className="text-[11px] space-y-1 mb-2">
                      <p>Data: {new Date(selectedOrcamentoForReceipt.created_at || selectedOrcamentoForReceipt.data_inicio || Date.now()).toLocaleDateString('pt-BR')} {new Date(selectedOrcamentoForReceipt.created_at || selectedOrcamentoForReceipt.data_inicio || Date.now()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                      <p className="font-bold text-destructive">Validade: {selectedOrcamentoForReceipt.validade ? selectedOrcamentoForReceipt.validade.split('T')[0].split('-').reverse().join('/') : 'Sem vencimento'}</p>
                      <p>Cliente: {selectedOrcamentoForReceipt.clientes?.nome || selectedOrcamentoForReceipt.cliente_avulso_nome || 'CONSUMIDOR'}</p>
                      {(selectedOrcamentoForReceipt.veiculo_marca || selectedOrcamentoForReceipt.veiculo_modelo) && (
                        <p className="font-bold">Veículo: {[selectedOrcamentoForReceipt.veiculo_marca, selectedOrcamentoForReceipt.veiculo_modelo, selectedOrcamentoForReceipt.veiculo_ano, selectedOrcamentoForReceipt.veiculo_motor].filter(Boolean).join(' ')}</p>
                      )}
                      <p>Vendedor: {nomeVendedorOrcamento(selectedOrcamentoForReceipt)}</p>
                    </div>
                    <div className="border-b border-black text-center font-bold text-[10px] mb-1">PRODUTOS</div>
                    <table className="w-full text-[10px]">
                      <thead>
                        <tr className="border-b border-black">
                          <th className="text-left">Item</th>
                          <th className="text-right">Qtd</th>
                          <th className="text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedOrcamentoForReceipt.itens || []).filter(Boolean).map((i: any, idx: number) => (
                          <tr key={idx}>
                            <td className="py-1">{nomeItemOrcamentoComVeiculo(selectedOrcamentoForReceipt, i, '-')}</td>
                            <td className="text-right">{i.quantidade}</td>
                            <td className="text-right">{i.subtotal?.toFixed(2) || '0.00'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="border-t-2 border-black mt-2 pt-1 flex justify-between font-bold text-lg">
                      <span>TOTAL:</span>
                      <span>R$ {selectedOrcamentoForReceipt.total.toFixed(2)}</span>
                    </div>
                    <div className="mt-4 text-[10px] text-center italic">
                      <p>Válido até {selectedOrcamentoForReceipt.validade ? selectedOrcamentoForReceipt.validade.split('T')[0].split('-').reverse().join('/') : 'a data de vencimento'}.</p>
                      <p>Este documento não é nota fiscal.</p>
                    </div>
                  </div>
                ) : (
                  <div className="formal-content">
                    <div className="formal-header">
                      <div className="flex items-center gap-3">
                        <Package className="w-10 h-10 text-black" />
                        <div>
                          <p className="font-black text-xl leading-none">{company?.nome_fantasia || 'SUA EMPRESA'}</p>
                          {company?.cnpj && <p className="text-[10px]">CNPJ: {company.cnpj}</p>}
                          <p className="text-[10px]">{company?.logradouro || ''}{company?.numero ? `, ${company.numero}` : ''}{company?.bairro ? ` - ${company.bairro}` : ''}{company?.cidade ? ` - ${company.cidade}/${company?.estado || ''}` : ''}</p>
                          {company?.telefone && <p className="text-[10px]">TEL: {company.telefone}</p>}
                          {company?.email && <p className="text-[10px]">Email: {company.email}</p>}
                          <p className="text-[10px] italic mt-1">Orçamento de Venda</p>
                        </div>
                      </div>
                      <div className="text-right text-[10px]">
                        <p className="text-lg font-black italic">ORÇAMENTO #{formatNumOrcamento(selectedOrcamentoForReceipt.numero_pedido)}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 border-b border-black py-3 text-[11px] mb-4">
                      <div>
                        <p className="formal-label">Dados do Cliente</p>
                        <p className="font-bold text-sm">{selectedOrcamentoForReceipt.clientes?.nome || selectedOrcamentoForReceipt.cliente_avulso_nome || 'CONSUMIDOR FINAL'}</p>
                        <p>CPF/CNPJ: {selectedOrcamentoForReceipt.clientes?.documento || selectedOrcamentoForReceipt.cliente_avulso_documento || '---'} {selectedOrcamentoForReceipt.clientes?.inscricao_estadual ? ` - IE: ${selectedOrcamentoForReceipt.clientes.inscricao_estadual}` : ''}</p>
                        <p>Tel: {selectedOrcamentoForReceipt.clientes?.telefone || selectedOrcamentoForReceipt.cliente_avulso_telefone || '---'}</p>
                        {selectedOrcamentoForReceipt.clientes?.endereco && (
                          <p>Endereço: {
                            selectedOrcamentoForReceipt.clientes.endereco.includes(selectedOrcamentoForReceipt.clientes.endereco_numero || 'xyz_na') || selectedOrcamentoForReceipt.clientes.endereco.includes(selectedOrcamentoForReceipt.clientes.endereco_bairro || 'xyz_na')
                              ? selectedOrcamentoForReceipt.clientes.endereco
                              : `${selectedOrcamentoForReceipt.clientes.endereco}${selectedOrcamentoForReceipt.clientes.endereco_numero ? `, ${selectedOrcamentoForReceipt.clientes.endereco_numero}` : ''}${selectedOrcamentoForReceipt.clientes.endereco_bairro ? ` - ${selectedOrcamentoForReceipt.clientes.endereco_bairro}` : ''}${selectedOrcamentoForReceipt.clientes.endereco_cidade ? ` - ${selectedOrcamentoForReceipt.clientes.endereco_cidade}/${selectedOrcamentoForReceipt.clientes.endereco_uf || ''}` : ''}`
                          }</p>
                        )}
                        {(selectedOrcamentoForReceipt.veiculo_marca || selectedOrcamentoForReceipt.veiculo_modelo) && (
                          <div className="mt-4 p-2 border-2 border-slate-300 rounded bg-slate-50">
                            <p className="formal-label">Informações do Veículo</p>
                            <p className="font-bold text-sm uppercase">
                              {[selectedOrcamentoForReceipt.veiculo_marca, selectedOrcamentoForReceipt.veiculo_modelo, selectedOrcamentoForReceipt.veiculo_ano, selectedOrcamentoForReceipt.veiculo_motor].filter(Boolean).join(' ')}
                            </p>
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="formal-label">Informações</p>
                        <p>Data Emissão: {selectedOrcamentoForReceipt.created_at || selectedOrcamentoForReceipt.data_inicio ? String(selectedOrcamentoForReceipt.created_at || selectedOrcamentoForReceipt.data_inicio).substring(0, 10).split('-').reverse().join('/') : new Date().toLocaleDateString('pt-BR')}</p>
                        <p className="text-destructive font-bold">Vencimento: {selectedOrcamentoForReceipt.validade ? selectedOrcamentoForReceipt.validade.split('T')[0].split('-').reverse().join('/') : 'Sem vencimento'}</p>
                        <p>Vendedor: {nomeVendedorOrcamento(selectedOrcamentoForReceipt)}</p>
                      </div>
                    </div>

                    <table className="formal-table">
                      <thead>
                        <tr>
                          <th style={{ width: '50%' }}>Item / Descrição</th>
                          <th style={{ width: '15%' }}>SKU</th>
                          <th style={{ width: '10%' }} className="text-center">Qtd</th>
                          <th style={{ width: '10%' }} className="text-right">Unit</th>
                          <th style={{ width: '15%' }} className="text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedOrcamentoForReceipt.itens || []).filter(Boolean).map((i: any, idx: number) => (
                          <tr key={idx}>
                            <td>{i.descricao_avulso || nomeItemOrcamentoComVeiculo(selectedOrcamentoForReceipt, i, '-')}</td>
                            <td className="font-mono text-[9px]">{i.produtos?.sku || (i.descricao_avulso ? 'Avulso' : '-')}</td>
                            <td className="text-center">{i.quantidade}</td>
                            <td className="text-right">{new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(i.preco_unitario || 0)}</td>
                            <td className="text-right font-bold">{new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(i.subtotal || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="flex justify-end mt-6">
                      <div className="w-64 border-t-2 border-black pt-2 space-y-1 text-right">
                        <div className="flex justify-between text-base font-black">
                          <span>TOTAL:</span>
                          <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(selectedOrcamentoForReceipt.total)}</span>
                        </div>
                        <p className="text-[10px] italic mt-4">Condição de Pagamento: {selectedOrcamentoForReceipt.condicao_pagamento || 'À Vista'}</p>
                        <p className="text-[10px] text-destructive font-bold uppercase mt-4 text-center border-2 border-destructive p-1">Este orçamento é válido até {selectedOrcamentoForReceipt.validade ? selectedOrcamentoForReceipt.validade.split('T')[0].split('-').reverse().join('/') : 'a data de vencimento'}.</p>
                      </div>
                    </div>

                    <div className="mt-20 text-center border-t border-black pt-2 w-1/2 mx-auto">
                      <p className="text-[10px] uppercase font-bold">{company?.nome_fantasia}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* CATEGORY LOTE MODAL */}
      <Modal
        isOpen={isCategoryLoteModalOpen}
        onClose={() => {
          setIsCategoryLoteModalOpen(false)
          setSelectedCategories([])
        }}
        title="Adicionar Peças por Categoria"
        className="max-w-4xl"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Filtrar categorias..."
                className="pl-9"
                value={searchTermCat}
                onChange={(e) => setSearchTermCat(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground whitespace-nowrap">
              {selectedCategories.length} selecionadas
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
            {(() => {
              const normalizeText = (text: string) => (text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
              const searchTerms = normalizeText(searchTermCat).split(" ").filter(Boolean);
              
              const allPossibleCats = [
                ...preservedCategories,
                ...(categorias || [])
              ].filter((c, index, self) => self.findIndex(x => x.id === c.id) === index)

              const filtered = allPossibleCats
                .filter(c => {
                  const isSelected = selectedCategories.includes(c.id)
                  if (isSelected) return true
                  if (!searchTermCat.trim()) return false
                  return searchTerms.every(term => normalizeText(c.nome || '').includes(term))
                })

              if (filtered.length === 0) {
                return (
                  <div className="col-span-full p-8 text-center text-sm text-muted-foreground italic">
                    {!searchTermCat.trim() ? "Digite para buscar categorias..." : "Nenhuma categoria encontrada."}
                  </div>
                )
              }

              return filtered.map(c => {
                  const isSelected = selectedCategories.includes(c.id)
                  return (
                    <div
                      key={c.id}
                      title={c.nome}
                      onClick={() => {
                        if (isSelected) {
                          setSelectedCategories(prev => prev.filter(id => id !== c.id))
                        } else {
                          setSelectedCategories(prev => [...prev, c.id])
                          setPreservedCategories(prev => {
                            if (prev.some(x => x.id === c.id)) return prev
                            return [...prev, c]
                          })
                        }
                      }}
                      className={`
                        cursor-pointer p-2 rounded-lg border-2 transition-all duration-200 select-none
                        flex items-center gap-2 group min-h-[52px]
                        ${isSelected
                          ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400 font-bold"
                          : "border-border hover:border-indigo-400 bg-background hover:bg-muted/30"
                        }
                      `}
                    >
                    <div className={`
                      w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0
                      ${isSelected ? "bg-indigo-600 border-indigo-600" : "border-slate-300 group-hover:border-indigo-400"}
                    `}>
                      {isSelected && <CheckCircle2 className="w-3 h-3 text-white" />}
                    </div>
                    {/* Miniatura da imagem da categoria */}
                    <div className="w-9 h-9 rounded-md overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0 flex items-center justify-center">
                      {c.imagem_url ? (
                        <img
                          src={c.imagem_url}
                          alt={c.nome}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            const target = e.currentTarget as HTMLImageElement
                            target.style.display = 'none'
                            const parent = target.parentElement
                            if (parent) {
                              parent.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`
                            }
                          }}
                        />
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="3" width="18" height="18" rx="2"/>
                          <circle cx="8.5" cy="8.5" r="1.5"/>
                          <polyline points="21 15 16 10 5 21"/>
                        </svg>
                      )}
                    </div>
                    <span className="text-[13px] leading-tight break-words whitespace-normal flex-1">{c.nome}</span>
                    </div>
                  )
                })
            })()}
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-border mt-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedCategories([])}
              disabled={selectedCategories.length === 0}
            >
              Limpar seleção
            </Button>
            <div className="flex gap-3">
              <div className="flex items-center gap-2 mr-4">
                <Label className="text-xs font-bold whitespace-nowrap text-indigo-700 dark:text-indigo-400">VALOR UNITÁRIO:</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-sm text-muted-foreground">R$</span>
                  <Input
                    type="number"
                    className="h-10 w-32 pl-9 font-bold border-indigo-200 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="0,00"
                    value={lotePreco === 0 ? '' : lotePreco}
                    onChange={e => setLotePreco(parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  setIsCategoryLoteModalOpen(false)
                  setSelectedCategories([])
                  setLotePreco(0)
                }}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleConfirmarLoteCategorias}
                className="bg-indigo-600 hover:bg-indigo-700 text-white min-w-[150px]"
                disabled={selectedCategories.length === 0}
              >
                Adicionar {selectedCategories.length} Itens
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div >
  )
}
