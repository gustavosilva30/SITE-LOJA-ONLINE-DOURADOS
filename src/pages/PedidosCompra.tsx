import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { api, compraPedidosApi, compraNotasEntradaApi, configuracoesApi, estoqueApi, localizacoesApi } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { useProdutosCache } from '@/store/produtosCache'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ClipboardList,
  Plus,
  Pencil,
  Trash2,
  FileDown,
  Printer,
  Search,
  Loader2,
  Package,
  Mic,
  Receipt,
  FileText,
  Building2,
  CheckCircle2,
  Calendar,
  Layers,
  MapPin,
  Barcode,
  Coins,
  Info,
  RefreshCw,
  FileCode,
  Upload
} from 'lucide-react'
import { toast } from 'sonner'
import { fmtDate, formatNumCompraPedido } from '@/lib/format'
import {
  buildCompraPedidoPdf,
  downloadCompraPedidoPdf,
  printCompraPedidoPdf,
  type CompraPedidoPdfEmpresa,
  type CompraPedidoPdfItem,
} from '@/lib/compraPedidoPdf'
import { logAcao } from '@/lib/systemLog'
import { cn } from '@/lib/utils'
import { VoiceOrderModal } from '@/components/VoiceOrderModal'
import type { ParsedVoiceOrder } from '@/lib/voiceParser'

type StatusCompra = 'rascunho' | 'enviado' | 'recebido' | 'cancelado'

type ItemRow = {
  _key: string
  produto_id: string | null
  codigo: string
  descricao: string
  quantidade: number
  unidade: string
  observacao: string
}

type CompraPedidoItemDb = {
  id: string
  produto_id: string | null
  codigo: string | null
  descricao: string
  quantidade: number
  unidade: string
  observacao: string | null
  ordem: number
}

type CompraPedidoRow = {
  id: string
  numero: number
  status: StatusCompra
  fornecedor_nome: string
  fornecedor_contato: string | null
  fornecedor_email: string | null
  fornecedor_cnpj: string | null
  observacoes: string | null
  atendente_id: string | null
  created_at: string
  updated_at: string
  compra_pedidos_itens?: CompraPedidoItemDb[] | null
  atendentes?: { nome: string } | { nome: string }[] | null
}

// ─── Interfaces para Nota de Entrada ─────────────────────────────────────────
type NotaEntradaItem = {
  _key: string
  produto_id: string | null
  sku: string
  part_number: string
  nome: string
  quantidade: number
  custo: number
  preco_venda: number // Sempre custo * 2
  categoria_id: string
  localizacao_id: string
  cadastrar_estoque: boolean
  quantidade_devolvida?: number
}

type NotaEntrada = {
  id: string
  numero_nota: string
  serie: string
  chave_acesso: string
  data_entrada: string
  data_emissao: string
  fornecedor_id: string
  fornecedor_nome: string
  fornecedor_cnpj: string
  valor_total: number
  observacoes: string
  itens: NotaEntradaItem[]
  criado_em: string
  criado_por: string
}

const STATUS_OPTS: { value: StatusCompra; label: string }[] = [
  { value: 'rascunho', label: 'Rascunho' },
  { value: 'enviado', label: 'Enviado' },
  { value: 'recebido', label: 'Recebido' },
  { value: 'cancelado', label: 'Cancelado' },
]

function statusBadge(status: StatusCompra) {
  const map: Record<StatusCompra, string> = {
    rascunho: 'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-800',
    enviado: 'bg-sky-50 text-sky-900 border-sky-200 dark:bg-sky-950/20 dark:text-sky-300 dark:border-sky-900/30',
    recebido: 'bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-300 dark:border-emerald-900/30',
    cancelado: 'bg-rose-50 text-rose-900 border-rose-200 dark:bg-rose-950/20 dark:text-rose-300 dark:border-rose-900/30',
  }
  const label = STATUS_OPTS.find((o) => o.value === status)?.label || status
  return <Badge variant="outline" className={cn('font-semibold rounded-full px-2.5 py-0.5 text-xs', map[status])}>{label}</Badge>
}

function emptyItem(): ItemRow {
  return {
    _key: crypto.randomUUID(),
    produto_id: null,
    codigo: '',
    descricao: '',
    quantidade: 1,
    unidade: 'UN',
    observacao: '',
  }
}

function emptyNotaItem(): NotaEntradaItem {
  return {
    _key: crypto.randomUUID(),
    produto_id: null,
    sku: '',
    part_number: '',
    nome: '',
    quantidade: 1,
    custo: 0,
    preco_venda: 0,
    categoria_id: '',
    localizacao_id: '',
    cadastrar_estoque: true,
  }
}

function rowToPdfItems(itens: CompraPedidoItemDb[]): CompraPedidoPdfItem[] {
  return [...(itens || [])]
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
    .map((i) => ({
      codigo: i.codigo || '',
      descricao: i.descricao,
      quantidade: i.quantidade,
      unidade: i.unidade || 'UN',
      observacao: i.observacao,
    }))
}

export function PedidosCompra() {
  const { atendente } = useAuthStore()
  const [activeTab, setActiveTab] = useState<'pedidos' | 'notas_entrada'>('pedidos')
  
  // ─── States Comuns e Originais ─────────────────────────────────────────────
  const [lista, setLista] = useState<CompraPedidoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [company, setCompany] = useState<CompraPedidoPdfEmpresa | null>(null)
  const [search, setSearch] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [numeroAtual, setNumeroAtual] = useState<number | null>(null)
  const [status, setStatus] = useState<StatusCompra>('rascunho')
  const [fornecedorNome, setFornecedorNome] = useState('')
  const [fornecedorContato, setFornecedorContato] = useState('')
  const [fornecedorEmail, setFornecedorEmail] = useState('')
  const [fornecedorCnpj, setFornecedorCnpj] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [itens, setItens] = useState<ItemRow[]>([emptyItem()])

  const [voiceModalOpen, setVoiceModalOpen] = useState(false)

  const [prodSearchIdx, setProdSearchIdx] = useState<number | null>(null)
  const [prodQuery, setProdQuery] = useState('')
  const [prodHits, setProdHits] = useState<{ id: string; sku: string | null; nome: string }[]>([])
  const [prodLoading, setProdLoading] = useState(false)

  // ─── States Novas de Notas de Entrada ──────────────────────────────────────
  const [notasEntrada, setNotasEntrada] = useState<NotaEntrada[]>([])
  const [searchNota, setSearchNota] = useState('')
  const [notaModalOpen, setNotaModalOpen] = useState(false)
  const [selectedNota, setSelectedNota] = useState<NotaEntrada | null>(null)
  const [isViewNotaModalOpen, setIsViewNotaModalOpen] = useState(false)
  const [isReturningMode, setIsReturningMode] = useState(false)
  const [itensDevolucao, setItensDevolucao] = useState<Record<string, number>>({})
  
  // Fornecedores para sugestão e preenchimento
  const [fornecedores, setFornecedores] = useState<any[]>([])
  const [fornecedorSearchText, setFornecedorSearchText] = useState('')
  const [fornecedoresSugeridos, setFornecedoresSugeridos] = useState<any[]>([])
  const [fornecedorIdSelecionado, setFornecedorIdSelecionado] = useState('')

  // Recursos de Estoque estáticos
  const categorias = useProdutosCache(state => state.categorias) || []
  const locais = useProdutosCache(state => state.locais) || []

  // Nova Nota Form
  const [notaNumero, setNotaNumero] = useState('')
  const [notaSerie, setNotaSerie] = useState('')
  const [notaChave, setNotaChave] = useState('')
  const [notaDataEntrada, setNotaDataEntrada] = useState(new Date().toISOString().split('T')[0])
  const [notaDataEmissao, setNotaDataEmissao] = useState(new Date().toISOString().split('T')[0])
  const [notaObservacoes, setNotaObservacoes] = useState('')
  const [notaItens, setNotaItens] = useState<NotaEntradaItem[]>([emptyNotaItem()])
  const [notaFornecedorNome, setNotaFornecedorNome] = useState('')
  const [notaFornecedorCnpj, setNotaFornecedorCnpj] = useState('')

  // Procura de produtos em Nota de Entrada
  const [notaProdSearchIdx, setNotaProdSearchIdx] = useState<number | null>(null)
  const [notaProdQuery, setNotaProdQuery] = useState('')
  const [notaProdHits, setNotaProdHits] = useState<any[]>([])
  const [notaProdLoading, setNotaProdLoading] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchLista = useCallback(async () => {
    setLoading(true)
    try {
      const data = await compraPedidosApi.listar()
      setLista((Array.isArray(data) ? data : []) as CompraPedidoRow[])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao carregar pedidos'
      if (msg.includes('compra_pedidos') || msg.includes('does not exist') || msg.includes('não existe')) {
        toast.error('Tabela compra_pedidos ausente — aplique backend/migrations ou updates_v117_pedidos_compra.sql.')
      } else {
        toast.error(msg)
      }
      setLista([])
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchRecursosNota = async () => {
    try {
      const fornList = await configuracoesApi.listarFornecedores().catch(() => [])
      setFornecedores(Array.isArray(fornList) ? fornList : [])
    } catch (e) {
      console.error('[NotasEntrada] erro ao buscar recursos estáticos:', e)
    }
  }

  // Carrega notas salvas no Banco de Dados
  const loadNotasSalvas = useCallback(async () => {
    try {
      const data = await compraNotasEntradaApi.listar()
      setNotasEntrada(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error('Falha ao carregar notas de entrada do banco de dados:', e)
    }
  }, [])

  useEffect(() => {
    fetchLista()
    loadNotasSalvas()
    fetchRecursosNota()
    api
      .get('/api/configuracoes/empresa')
      .then((data) => setCompany(mapConfigToPdfEmpresa(data as Record<string, unknown>)))
      .catch(() => setCompany(null))
  }, [fetchLista, loadNotasSalvas])

  // Busca de produto no Pedido de Compra original
  useEffect(() => {
    if (prodSearchIdx == null || prodQuery.trim().length < 2) {
      setProdHits([])
      return
    }
    const t = window.setTimeout(async () => {
      setProdLoading(true)
      const q = prodQuery.trim().replace(/%/g, '')
      try {
        const data = await api.get(`/api/estoque/produtos/busca?q=${encodeURIComponent(q)}&limit=18`)
        setProdHits(Array.isArray(data) ? data : [])
      } catch {
        setProdHits([])
      } finally {
        setProdLoading(false)
      }
    }, 280)
    return () => window.clearTimeout(t)
  }, [prodQuery, prodSearchIdx])

  // Busca de produto em Nota de Entrada
  useEffect(() => {
    if (notaProdSearchIdx == null || notaProdQuery.trim().length < 2) {
      setNotaProdHits([])
      return
    }
    const t = window.setTimeout(async () => {
      setNotaProdLoading(true)
      const q = notaProdQuery.trim().replace(/%/g, '')
      try {
        const data = await api.get(`/api/estoque/produtos/busca?q=${encodeURIComponent(q)}&limit=10`)
        setNotaProdHits(Array.isArray(data) ? data : [])
      } catch {
        setNotaProdHits([])
      } finally {
        setNotaProdLoading(false)
      }
    }, 280)
    return () => window.clearTimeout(t)
  }, [notaProdQuery, notaProdSearchIdx])

  // Fornecedor Auto-Suggest
  useEffect(() => {
    if (!fornecedorSearchText.trim()) {
      setFornecedoresSugeridos([])
      return
    }
    const q = fornecedorSearchText.toLowerCase()
    const qClean = q.replace(/\D/g, '')
    const match = fornecedores.filter(f => 
      (f.nome || '').toLowerCase().includes(q) || 
      (f.razao_social || '').toLowerCase().includes(q) ||
      (qClean ? (f.cnpj || f.documento || '').replace(/\D/g, '').includes(qClean) : false)
    )
    setFornecedoresSugeridos(match.slice(0, 5))
  }, [fornecedorSearchText, fornecedores])

  const filtrada = useMemo(() => {
    const s = search.trim().toLowerCase()
    if (!s) return lista
    return lista.filter(
      (p) =>
        String(p.numero).includes(s) ||
        (p.fornecedor_nome || '').toLowerCase().includes(s) ||
        (p.fornecedor_cnpj || '').toLowerCase().includes(s)
    )
  }, [lista, search])

  const filtradaNotas = useMemo(() => {
    const s = searchNota.trim().toLowerCase()
    if (!s) return notasEntrada
    return notasEntrada.filter(
      (n) =>
        (n.numero_nota || '').toLowerCase().includes(s) ||
        (n.fornecedor_nome || '').toLowerCase().includes(s) ||
        (n.fornecedor_cnpj || '').toLowerCase().includes(s) ||
        (n.chave_acesso || '').includes(s)
    )
  }, [notasEntrada, searchNota])

  const openNovo = () => {
    setEditingId(null)
    setNumeroAtual(null)
    setStatus('rascunho')
    setFornecedorNome('')
    setFornecedorContato('')
    setFornecedorEmail('')
    setFornecedorCnpj('')
    setObservacoes('')
    setItens([emptyItem()])
    setProdSearchIdx(null)
    setProdQuery('')
    setModalOpen(true)
  }

  const openEditar = (row: CompraPedidoRow) => {
    setEditingId(row.id)
    setNumeroAtual(row.numero)
    setStatus(row.status)
    setFornecedorNome(row.fornecedor_nome || '')
    setFornecedorContato(row.fornecedor_contato || '')
    setFornecedorEmail(row.fornecedor_email || '')
    setFornecedorCnpj(row.fornecedor_cnpj || '')
    setObservacoes(row.observacoes || '')
    const sorted = [...(row.compra_pedidos_itens || [])].sort((a, b) => a.ordem - b.ordem)
    setItens(
      sorted.length
        ? sorted.map((i) => ({
            _key: i.id,
            produto_id: i.produto_id,
            codigo: i.codigo || '',
            descricao: i.descricao,
            quantidade: i.quantidade,
            unidade: i.unidade || 'UN',
            observacao: i.observacao || '',
          }))
        : [emptyItem()]
    )
    setProdSearchIdx(null)
    setProdQuery('')
    setModalOpen(true)
  }

  const applyProduto = (idx: number, p: { id: string; sku: string | null; nome: string }) => {
    const next = [...itens]
    next[idx] = {
      ...next[idx],
      produto_id: p.id,
      codigo: p.sku || next[idx].codigo,
      descricao: p.nome,
    }
    setItens(next)
    setProdSearchIdx(null)
    setProdQuery('')
    setProdHits([])
  }

  const handleVoiceConfirm = (parsed: ParsedVoiceOrder, _audioBlob: Blob | null) => {
    if (parsed.fornecedorNome) setFornecedorNome(parsed.fornecedorNome)
    if (parsed.observacoes) setObservacoes(parsed.observacoes)
    if (parsed.itens.length > 0) {
      setItens(
        parsed.itens.map((item) => ({
          _key: crypto.randomUUID(),
          produto_id: null,
          codigo: '',
          descricao: item.descricao,
          quantidade: item.quantidade,
          unidade: item.unidade,
          observacao: '',
        }))
      )
    }
    setVoiceModalOpen(false)
    setModalOpen(true)
  }

  const buildPdfForRow = async (row: CompraPedidoRow) => {
    const it = rowToPdfItems(row.compra_pedidos_itens || [])
    const a = row.atendentes
    const nomeAt = Array.isArray(a) ? a[0]?.nome : a && typeof a === 'object' && 'nome' in a ? (a as { nome: string }).nome : null
    return buildCompraPedidoPdf({
      numero: row.numero,
      status: row.status,
      createdAt: row.created_at,
      fornecedorNome: row.fornecedor_nome,
      fornecedorContato: row.fornecedor_contato,
      fornecedorEmail: row.fornecedor_email,
      fornecedorCnpj: row.fornecedor_cnpj,
      observacoes: row.observacoes,
      empresa: company,
      itens: it,
      solicitanteNome: nomeAt || atendente?.nome || null,
    })
  }

  const handlePdfLista = async (row: CompraPedidoRow) => {
    const doc = await buildPdfForRow(row)
    downloadCompraPedidoPdf(doc, row.numero)
  }

  const handlePrintLista = async (row: CompraPedidoRow) => {
    const doc = await buildPdfForRow(row)
    printCompraPedidoPdf(doc)
  }

  const validarItens = () => {
    const ok = itens.filter((i) => i.descricao.trim() && i.quantidade > 0)
    if (ok.length === 0) {
      toast.error('Adicione pelo menos uma linha com descrição e quantidade.')
      return false
    }
    if (!fornecedorNome.trim()) {
      toast.error('Informe o nome do fornecedor.')
      return false
    }
    return true
  }

  const salvar = async () => {
    if (!validarItens()) return
    setSaving(true)
    try {
      const pedidoPayload: Record<string, unknown> = {
        status,
        fornecedor_nome: fornecedorNome.trim(),
        fornecedor_contato: fornecedorContato.trim() || null,
        fornecedor_email: fornecedorEmail.trim() || null,
        fornecedor_cnpj: fornecedorCnpj.trim() || null,
        observacoes: observacoes.trim() || null,
        atendente_id: atendente?.id || null,
      }

      const itensPayload = itens
        .filter((i) => i.descricao.trim() && i.quantidade > 0)
        .map((i) => ({
          produto_id: i.produto_id,
          codigo: i.codigo.trim() || null,
          descricao: i.descricao.trim(),
          quantidade: Math.floor(i.quantidade),
          unidade: (i.unidade || 'UN').trim() || 'UN',
          observacao: i.observacao.trim() || null,
        }))

      let num = numeroAtual

      if (!editingId) {
        const data = (await compraPedidosApi.criar({
          ...pedidoPayload,
          itens: itensPayload,
        })) as { id: string; numero: number }
        num = data.numero
        logAcao('compra_pedido.criar', `Pedido de compra #${formatNumCompraPedido(num!)} — ${fornecedorNome.trim()}`, atendente?.id)
      } else {
        await compraPedidosApi.atualizar(editingId, { ...pedidoPayload, itens: itensPayload })
        logAcao('compra_pedido.atualizar', `Pedido #${formatNumCompraPedido(num!)} atualizado`, atendente?.id)
      }

      toast.success(editingId ? 'Pedido atualizado.' : `Pedido #${formatNumCompraPedido(num!)} criado.`)
      setModalOpen(false)
      fetchLista()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao guardar'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const excluir = async (row: CompraPedidoRow) => {
    if (!window.confirm(`Eliminar o pedido #${formatNumCompraPedido(row.numero)}?`)) return
    try {
      await compraPedidosApi.deletar(row.id)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao eliminar')
      return
    }
    logAcao('compra_pedido.excluir', `Pedido #${formatNumCompraPedido(row.numero)} eliminado`, atendente?.id)
    toast.success('Pedido eliminado.')
    fetchLista()
  }

  const pdfFromForm = async () => {
    if (!validarItens()) return
    const it: CompraPedidoPdfItem[] = itens
      .filter((i) => i.descricao.trim() && i.quantidade > 0)
      .map((i) => ({
        codigo: i.codigo,
        descricao: i.descricao.trim(),
        quantidade: Math.floor(i.quantidade),
        unidade: i.unidade || 'UN',
        observacao: i.observacao,
      }))
    const doc = await buildCompraPedidoPdf({
      numero: numeroAtual ?? 0,
      status,
      createdAt: new Date().toISOString(),
      fornecedorNome: fornecedorNome.trim(),
      fornecedorContato: fornecedorContato.trim() || null,
      fornecedorEmail: fornecedorEmail.trim() || null,
      fornecedorCnpj: fornecedorCnpj.trim() || null,
      observacoes: observacoes.trim() || null,
      empresa: company,
      itens: it,
      solicitanteNome: atendente?.nome || null,
    })
    downloadCompraPedidoPdf(doc, numeroAtual ?? 0)
  }

  const printFromForm = async () => {
    if (!validarItens()) return
    const it: CompraPedidoPdfItem[] = itens
      .filter((i) => i.descricao.trim() && i.quantidade > 0)
      .map((i) => ({
        codigo: i.codigo,
        descricao: i.descricao.trim(),
        quantidade: Math.floor(i.quantidade),
        unidade: i.unidade || 'UN',
        observacao: i.observacao,
      }))
    const doc = await buildCompraPedidoPdf({
      numero: numeroAtual ?? 0,
      status,
      createdAt: new Date().toISOString(),
      fornecedorNome: fornecedorNome.trim(),
      fornecedorContato: fornecedorContato.trim() || null,
      fornecedorEmail: fornecedorEmail.trim() || null,
      fornecedorCnpj: fornecedorCnpj.trim() || null,
      observacoes: observacoes.trim() || null,
      empresa: company,
      itens: it,
      solicitanteNome: atendente?.nome || null,
    })
    printCompraPedidoPdf(doc)
  }

  // ─── Logica para Nota de Entrada ───────────────────────────────────────────
  const openNovaNota = () => {
    setNotaNumero('')
    setNotaSerie('')
    setNotaChave('')
    setNotaDataEntrada(new Date().toISOString().split('T')[0])
    setNotaDataEmissao(new Date().toISOString().split('T')[0])
    setNotaObservacoes('')
    setNotaFornecedorNome('')
    setNotaFornecedorCnpj('')
    setFornecedorSearchText('')
    setFornecedorIdSelecionado('')
    setNotaItens([emptyNotaItem()])
    setNotaProdSearchIdx(null)
    setNotaProdQuery('')
    setNotaModalOpen(true)
  }

  const handleImportXml = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (event) => {
      const toastId = toast.loading("Analisando arquivo XML...")
      try {
        const xmlText = event.target?.result as string
        const parser = new DOMParser()
        const xmlDoc = parser.parseFromString(xmlText, "text/xml")

        const getTagValue = (parent: Element | Document, tagName: string): string => {
          const el = parent.getElementsByTagName(tagName)[0]
          return el ? el.textContent || '' : ''
        }

        const infNFe = xmlDoc.getElementsByTagName("infNFe")[0]
        if (!infNFe) {
          toast.error("XML inválido. Certifique-se de que é um XML de NF-e válido.", { id: toastId })
          return
        }

        const numero = getTagValue(xmlDoc, "nNF")
        const serie = getTagValue(xmlDoc, "serie")
        
        let chave = getTagValue(xmlDoc, "chNFe")
        if (!chave) {
          const infNFeId = infNFe.getAttribute("Id")
          if (infNFeId) {
            chave = infNFeId.replace(/\D/g, '')
          }
        }

        let dataEmi = getTagValue(xmlDoc, "dhEmi") || getTagValue(xmlDoc, "dEmi")
        if (dataEmi) {
          dataEmi = dataEmi.substring(0, 10)
        } else {
          dataEmi = new Date().toISOString().split('T')[0]
        }

        const emit = xmlDoc.getElementsByTagName("emit")[0]
        let emitNome = ''
        let emitCnpj = ''
        if (emit) {
          emitNome = getTagValue(emit, "xFant") || getTagValue(emit, "xNome")
          emitCnpj = getTagValue(emit, "CNPJ") || getTagValue(emit, "CPF")
        }

        setNotaNumero(numero)
        setNotaSerie(serie)
        setNotaChave(chave)
        setNotaDataEmissao(dataEmi)
        setNotaDataEntrada(new Date().toISOString().split('T')[0])
        setNotaFornecedorNome(emitNome)
        setNotaFornecedorCnpj(emitCnpj)
        setFornecedorSearchText(emitNome)

        if (emitCnpj) {
          const cleanEmitCnpj = emitCnpj.replace(/\D/g, '')
          const matchedForn = fornecedores.find(f => {
            const docClean = (f.cnpj || f.documento || '').replace(/\D/g, '')
            return docClean === cleanEmitCnpj
          })
          if (matchedForn) {
            setFornecedorIdSelecionado(matchedForn.id)
            setNotaFornecedorNome(matchedForn.razao_social || matchedForn.nome)
            setFornecedorSearchText(matchedForn.razao_social || matchedForn.nome)
            toast.success(`Fornecedor "${matchedForn.nome}" identificado automaticamente!`)
          } else {
            setFornecedorIdSelecionado('')
            toast.info("Fornecedor não localizado. Preenchido para criação/vínculo automático.")
          }
        }

        const detList = xmlDoc.getElementsByTagName("det")
        toast.loading("Buscando produtos no estoque em tempo real...", { id: toastId })

        const itemPromises = Array.from(detList).map(async (det) => {
          const prod = det.getElementsByTagName("prod")[0]
          if (!prod) return null

          const cProd = getTagValue(prod, "cProd")
          const xProd = getTagValue(prod, "xProd")
          const qCom = parseFloat(getTagValue(prod, "qCom")) || 1
          const vUnCom = parseFloat(getTagValue(prod, "vUnCom")) || 0

          let matchedProductId: string | null = null
          let matchedSku = ''
          let matchedName = xProd
          let matchedCatId = ''
          let matchedLocId = ''

          if (cProd) {
            try {
              const res = await api.get(`/api/estoque/produtos/busca?q=${encodeURIComponent(cProd.trim())}&limit=5`)
              if (Array.isArray(res) && res.length > 0) {
                const match = res.find(p => p.sku === cProd.trim() || p.part_number === cProd.trim()) || res[0]
                matchedProductId = match.id
                matchedSku = match.sku || ''
                matchedName = xProd
                matchedCatId = match.categoria_id || ''
                matchedLocId = match.localizacao_id || ''
              }
            } catch (err) {
              console.error("Error searching product from XML item:", err)
            }
          }

          return {
            _key: crypto.randomUUID(),
            produto_id: matchedProductId,
            sku: matchedSku || '',
            part_number: cProd || '',
            nome: matchedName,
            quantidade: qCom,
            custo: vUnCom,
            preco_venda: Number((vUnCom * 2).toFixed(2)),
            categoria_id: matchedCatId,
            localizacao_id: matchedLocId,
            cadastrar_estoque: true
          } as NotaEntradaItem
        })

        const results = await Promise.all(itemPromises)
        const validItens = results.filter((i): i is NotaEntradaItem => i !== null)

        setNotaItens(validItens.length > 0 ? validItens : [emptyNotaItem()])
        toast.success(`XML importado! ${validItens.length} itens carregados.`, { id: toastId })
      } catch (err) {
        console.error("Failed to parse XML:", err)
        toast.error("Falha ao analisar o arquivo XML da nota.", { id: toastId })
      }

      if (fileInputRef.current) fileInputRef.current.value = ''
    }

    reader.readAsText(file)
  }

  const applyProdutoNota = (idx: number, p: any) => {
    const next = [...notaItens]
    next[idx] = {
      ...next[idx],
      produto_id: p.id,
      sku: p.sku || '',
      part_number: p.part_number || '',
      nome: p.nome || '',
      custo: Number(p.custo || 0),
      preco_venda: Number((p.custo || 0) * 2), // O dobro por padrão
      categoria_id: p.categoria_id || '',
      localizacao_id: p.localizacao_id || ''
    }
    setNotaItens(next)
    setNotaProdSearchIdx(null)
    setNotaProdQuery('')
    setNotaProdHits([])
  }

  const handleCustoChange = (idx: number, val: number) => {
    const next = [...notaItens]
    next[idx] = {
      ...next[idx],
      custo: val,
      preco_venda: Number((val * 2).toFixed(2)) // Regra rigorosa: venda = custo * 2
    }
    setNotaItens(next)
  }

  const handleSalvarNota = async () => {
    if (!notaNumero.trim()) {
      toast.error('Informe o número da nota.')
      return
    }
    if (!notaFornecedorNome.trim()) {
      toast.error('Informe o fornecedor.')
      return
    }
    const validItens = notaItens.filter(i => i.nome.trim() && i.quantidade > 0 && i.custo > 0)
    if (validItens.length === 0) {
      toast.error('Adicione pelo menos um item válido na nota (com descrição, quantidade e custo).')
      return
    }

    setSaving(true)
    const toastId = toast.loading('Processando nota de entrada e atualizando estoque...')
    
    try {
      // 1. Processar itens para o estoque (se cadastrar_estoque estiver ativo)
      for (const item of validItens) {
        if (item.cadastrar_estoque) {
          const payload = {
            sku: item.sku.trim() || undefined,
            part_number: item.part_number.trim() || undefined,
            nome: item.nome.trim(),
            custo: item.custo,
            preco: item.preco_venda, // Dobro do valor de compra
            public_price: item.preco_venda,
            categoria_id: item.categoria_id || null,
            localizacao_id: item.localizacao_id || null,
            ativo: true
          }

          if (item.produto_id) {
            // Atualizar produto existente: obter produto atual, somar estoque e atualizar custo/preco
            const currentProd = await estoqueApi.detalheProduto(item.produto_id).catch(() => null)
            const currentStock = Number(currentProd?.estoque_atual || 0)
            
            await estoqueApi.atualizarProduto(item.produto_id, {
              ...payload,
              estoque_atual: currentStock + item.quantidade
            })
            console.log(`[NotaEntrada] Produto ${item.sku} atualizado. Estoque: ${currentStock} -> ${currentStock + item.quantidade}`)
          } else {
            // Criar novo produto: buscar SKU se não fornecido
            let skuToUse = item.sku.trim()
            if (!skuToUse) {
              try {
                const nextSkuRes = await estoqueApi.nextSku()
                skuToUse = String(nextSkuRes?.sku || '25100')
              } catch {
                skuToUse = '25100'
              }
            }

            await estoqueApi.criarProduto({
              ...payload,
              sku: skuToUse,
              estoque_atual: item.quantidade
            })
            console.log(`[NotaEntrada] Novo produto criado. SKU: ${skuToUse}, Estoque: ${item.quantidade}`)
          }
        }
      }

      // 2. Criar a nota de entrada
      const totalNota = validItens.reduce((acc, i) => acc + (i.quantidade * i.custo), 0)
      const novaNotaPayload = {
        numero_nota: notaNumero,
        serie: notaSerie || '1',
        chave_acesso: notaChave,
        data_entrada: notaDataEntrada,
        data_emissao: notaDataEmissao,
        fornecedor_id: fornecedorIdSelecionado || null,
        fornecedor_nome: notaFornecedorNome,
        fornecedor_cnpj: notaFornecedorCnpj || null,
        valor_total: Number(totalNota.toFixed(2)),
        observacoes: notaObservacoes || null,
        criado_por: atendente?.nome || 'Atendente',
        itens: validItens.map(i => ({
          produto_id: i.produto_id || null,
          sku: i.sku || "",
          part_number: i.part_number || "",
          nome: i.nome,
          quantidade: i.quantidade,
          custo: i.custo,
          preco_venda: i.preco_venda,
          categoria_id: i.categoria_id || null,
          localizacao_id: i.localizacao_id || null,
          cadastrar_estoque: i.cadastrar_estoque,
          quantidade_devolvida: i.quantidade_devolvida || 0
        }))
      }

      await compraNotasEntradaApi.criar(novaNotaPayload)
      await loadNotasSalvas()

      logAcao('fiscal.nota_entrada', `Nota de entrada #${notaNumero} cadastrada — Fornecedor: ${notaFornecedorNome}`, atendente?.id)
      
      toast.success(`Nota de Entrada #${notaNumero} processada e cadastrada com sucesso!`, { id: toastId })
      setNotaModalOpen(false)
    } catch (err: any) {
      console.error(err)
      toast.error(`Erro ao salvar nota: ${err.message || 'Verifique os dados.'}`, { id: toastId })
    } finally {
      setSaving(false)
    }
  }

  const excluirNota = async (id: string, numero: string) => {
    if (!window.confirm(`Deseja realmente remover a Nota de Entrada #${numero} do histórico? (Isso não altera os produtos que já foram adicionados ao estoque)`)) return
    try {
      await compraNotasEntradaApi.deletar(id)
      await loadNotasSalvas()
      toast.success('Nota removida do histórico.')
    } catch (e: any) {
      console.error(e)
      toast.error('Falha ao remover a nota do histórico.')
    }
  }

  const handleProcessarDevolucao = async () => {
    if (!selectedNota) return
    const validDevs = Object.entries(itensDevolucao).filter(([_, qty]) => qty > 0)
    if (validDevs.length === 0) {
      toast.error('Informe pelo menos um item com quantidade a devolver maior que zero.')
      return
    }

    setSaving(true)
    const toastId = toast.loading('Processando devolução no estoque...')

    try {
      // 1. Atualizar estoque de cada item devolvido
      for (const [key, qty] of validDevs) {
        const item = selectedNota.itens.find(i => i._key === key)
        if (item && item.produto_id) {
          const currentProd = await estoqueApi.detalheProduto(item.produto_id).catch(() => null)
          if (currentProd) {
            const currentStock = Number(currentProd.estoque_atual || 0)
            const nextStock = Math.max(0, currentStock - qty)
            await estoqueApi.atualizarProduto(item.produto_id, {
              estoque_atual: nextStock
            })
            console.log(`[NotaEntrada - Devolução] Produto ${item.sku} atualizado no estoque. Estoque: ${currentStock} -> ${nextStock}`)
          }
        }
      }

      // 2. Atualizar o registro da Nota no banco de dados
      const res = await compraNotasEntradaApi.atualizarDevolucao(selectedNota.id, { devolucoes: itensDevolucao })
      await loadNotasSalvas()
      
      // Atualizar o selectedNota para exibir os dados corretos no modal
      if (res) {
        setSelectedNota(res)
      }

      logAcao('fiscal.devolucao_compra_nota', `Devolvido itens da Nota de Entrada #${selectedNota.numero_nota} — Fornecedor: ${selectedNota.fornecedor_nome}`, atendente?.id)
      
      toast.success('Devolução gravada com sucesso! Estoque atualizado.', { id: toastId })
      
      toast.info(`Dica Fiscal: Use a chave de acesso original (${selectedNota.chave_acesso}) no módulo Fiscal para emitir a NF-e de Devolução para o fornecedor.`, {
        duration: 12000
      })

      setIsReturningMode(false)
      setItensDevolucao({})
    } catch (e: any) {
      console.error(e)
      toast.error(`Erro ao processar devolução: ${e.message || 'Erro inesperado.'}`, { id: toastId })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ClipboardList className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Compras & Pedidos de Compra</h1>
            <p className="text-sm text-muted-foreground max-w-xl">
              Monte listas para fornecedores, exporte PDF ou gerencie a entrada de mercadorias com o sistema de Notas Fiscais de Entrada de Compra.
            </p>
          </div>
        </div>
        
        {/* Abas Premium */}
        <div className="flex bg-muted/60 p-1 rounded-xl border border-border/40 max-w-sm">
          <button
            onClick={() => setActiveTab('pedidos')}
            className={cn(
              "px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2",
              activeTab === 'pedidos' ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <FileText className="w-3.5 h-3.5" />
            Pedidos de Compra
          </button>
          <button
            onClick={() => setActiveTab('notas_entrada')}
            className={cn(
              "px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2",
              activeTab === 'notas_entrada' ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Receipt className="w-3.5 h-3.5" />
            Notas de Entrada (Compras)
          </button>
        </div>
      </div>

      {activeTab === 'pedidos' ? (
        // ─── ABA 1: PEDIDOS DE COMPRA ORIGINAL ────────────────────────────────
        <>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => { setEditingId(null); setNumeroAtual(null); setStatus('rascunho'); setFornecedorNome(''); setFornecedorContato(''); setFornecedorEmail(''); setFornecedorCnpj(''); setObservacoes(''); setItens([emptyItem()]); setProdSearchIdx(null); setProdQuery(''); setVoiceModalOpen(true) }}
              className="gap-2"
            >
              <Mic className="h-4 w-4" />
              Pedido por voz
            </Button>
            <Button onClick={openNovo} className="gap-2">
              <Plus className="h-4 w-4" />
              Novo pedido
            </Button>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base">Histórico de Pedidos</CardTitle>
                <div className="relative max-w-sm w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Buscar por nº, fornecedor ou CNPJ..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-16 text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : filtrada.length === 0 ? (
                <p className="text-center py-12 text-muted-foreground text-sm">
                  Nenhum pedido de compra encontrado.
                </p>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[100px]">Nº</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Fornecedor</TableHead>
                        <TableHead className="text-center">Itens</TableHead>
                        <TableHead>Situação</TableHead>
                        <TableHead className="text-right w-[280px]">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtrada.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-mono font-bold">{formatNumCompraPedido(row.numero)}</TableCell>
                          <TableCell className="text-muted-foreground whitespace-nowrap">{fmtDate(row.created_at)}</TableCell>
                          <TableCell className="font-medium max-w-[min(320px,40vw)] truncate">{row.fornecedor_nome || '—'}</TableCell>
                          <TableCell className="text-center">{row.compra_pedidos_itens?.length ?? 0}</TableCell>
                          <TableCell>{statusBadge(row.status)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-wrap justify-end gap-1">
                              <Button type="button" variant="outline" size="sm" className="h-8 gap-1" onClick={() => openEditar(row)}>
                                <Pencil className="h-3.5 w-3.5" />
                                Editar
                              </Button>
                              <Button type="button" variant="outline" size="sm" className="h-8 gap-1" onClick={() => handlePdfLista(row)}>
                                <FileDown className="h-3.5 w-3.5" />
                                PDF
                              </Button>
                              <Button type="button" variant="outline" size="sm" className="h-8 gap-1" onClick={() => handlePrintLista(row)}>
                                <Printer className="h-3.5 w-3.5" />
                                Imprimir
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 text-destructive hover:text-destructive"
                                onClick={() => excluir(row)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        // ─── ABA 2: NOVO SISTEMA DE NOTAS DE ENTRADA ──────────────────────────
        <>
          <div className="flex justify-end">
            <Button onClick={openNovaNota} className="gap-2">
              <Plus className="h-4 w-4" />
              Adicionar Nota de Entrada
            </Button>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-muted-foreground" />
                  Histórico de Notas de Entrada (Compras)
                </CardTitle>
                <div className="relative max-w-sm w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Nº da Nota, Fornecedor ou Chave..."
                    value={searchNota}
                    onChange={(e) => setSearchNota(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filtradaNotas.length === 0 ? (
                <div className="p-12 text-center border-2 border-dashed rounded-xl text-muted-foreground">
                  <p className="text-sm">Nenhuma nota fiscal de entrada adicionada.</p>
                  <p className="text-xs mt-1">Insira a primeira clicando em &quot;Adicionar Nota de Entrada&quot;.</p>
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Número / Série</TableHead>
                        <TableHead>Data Emissão</TableHead>
                        <TableHead>Fornecedor</TableHead>
                        <TableHead>Chave de Acesso</TableHead>
                        <TableHead className="text-right">Itens</TableHead>
                        <TableHead className="text-right">Valor Total</TableHead>
                        <TableHead className="text-right w-[150px]">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtradaNotas.map((nota) => (
                        <TableRow key={nota.id} className="hover:bg-muted/30 transition-colors">
                          <TableCell>
                            <span className="font-bold">{nota.numero_nota}</span>
                            <span className="block text-[10px] text-muted-foreground">Série {nota.serie}</span>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs">{fmtDate(nota.data_emissao)}</TableCell>
                          <TableCell>
                            <div className="font-medium text-xs max-w-[200px] truncate">{nota.fornecedor_nome}</div>
                            <span className="block text-[9px] text-muted-foreground font-mono">{nota.fornecedor_cnpj || '—'}</span>
                          </TableCell>
                          <TableCell className="font-mono text-[10px] tracking-tight max-w-[150px] truncate" title={nota.chave_acesso}>
                            {nota.chave_acesso || '—'}
                          </TableCell>
                          <TableCell className="text-right text-xs font-bold">{nota.itens?.length || 0}</TableCell>
                          <TableCell className="text-right font-mono font-bold text-xs text-primary">R$ {Number(nota.valor_total).toFixed(2)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs font-semibold"
                                onClick={() => {
                                  setSelectedNota(nota)
                                  setIsViewNotaModalOpen(true)
                                }}
                              >
                                Detalhes
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                                onClick={() => excluirNota(nota.id, nota.numero_nota)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ─── MODAL EMISSÃO ORIGINAL COMPRA PEDIDO ────────────────────────────── */}
      <Modal
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editingId ? `Editar pedido #${formatNumCompraPedido(numeroAtual ?? 0)}` : 'Novo pedido de compra'}
        alignTop
        className="max-w-[min(1320px,calc(100vw-1.5rem))] w-full rounded-2xl border-border/60 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)]"
        contentClassName="max-h-[min(88vh,920px)] p-6 sm:p-8 md:p-10 !pt-6 sm:!pt-8"
      >
        <div className="space-y-8">
          <section className="rounded-2xl border border-border/80 bg-gradient-to-b from-muted/30 to-muted/10 p-6 sm:p-8 shadow-sm space-y-6">
            <div className="space-y-3">
              <Label className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Nome do fornecedor *
              </Label>
              <Input
                value={fornecedorNome}
                onChange={(e) => setFornecedorNome(e.target.value)}
                placeholder="Nome fantasia ou razão social completa"
                className="h-14 sm:h-16 text-base sm:text-lg font-medium px-4 sm:px-5 rounded-xl border-input/90 shadow-inner bg-background"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="space-y-2">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Situação</Label>
                <Select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as StatusCompra)}
                  className="h-11 rounded-lg"
                >
                  {STATUS_OPTS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">CNPJ</Label>
                <Input
                  value={fornecedorCnpj}
                  onChange={(e) => setFornecedorCnpj(e.target.value)}
                  placeholder="Opcional"
                  className="h-11 rounded-lg"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Telefone / WhatsApp</Label>
                <Input
                  value={fornecedorContato}
                  onChange={(e) => setFornecedorContato(e.target.value)}
                  placeholder="Opcional"
                  className="h-11 rounded-lg"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">E-mail do fornecedor</Label>
              <Input
                type="email"
                value={fornecedorEmail}
                onChange={(e) => setFornecedorEmail(e.target.value)}
                placeholder="Opcional — para envio do PDF"
                className="h-11 rounded-lg"
              />
            </div>
          </section>

          <div className="space-y-2">
            <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Observações gerais (aparecem no PDF)
            </Label>
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Prazo de entrega, frete, referência de cotação, condições..."
              rows={3}
              className="flex min-h-[88px] w-full rounded-xl border border-input bg-background px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"
            />
          </div>

          <div className="rounded-2xl border-2 border-border/70 overflow-hidden bg-card shadow-sm">
            <div className="bg-muted/60 px-5 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 border-b border-border/80">
              <span className="text-xs font-black uppercase tracking-[0.15em] text-foreground/80">Itens do pedido</span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-9 gap-1.5 rounded-lg font-semibold"
                onClick={() => setItens([...itens, emptyItem()])}
              >
                <Plus className="h-4 w-4" />
                Adicionar linha
              </Button>
            </div>
            <div className="overflow-x-auto px-1 sm:px-2 pb-2">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-border/60">
                    <TableHead className="w-[220px] min-w-[200px] h-12 text-[11px] font-bold uppercase tracking-wide text-muted-foreground bg-muted/40">
                      Produto (estoque)
                    </TableHead>
                    <TableHead className="w-[130px] min-w-[110px] h-12 text-[11px] font-bold uppercase tracking-wide text-muted-foreground bg-muted/40">
                      Código
                    </TableHead>
                    <TableHead className="min-w-[220px] h-12 text-[11px] font-bold uppercase tracking-wide text-muted-foreground bg-muted/40">
                      Descrição *
                    </TableHead>
                    <TableHead className="w-[76px] h-12 text-[11px] font-bold uppercase tracking-wide text-muted-foreground bg-muted/40">
                      Un.
                    </TableHead>
                    <TableHead className="w-[88px] h-12 text-[11px] font-bold uppercase tracking-wide text-muted-foreground bg-muted/40">
                      Qtd *
                    </TableHead>
                    <TableHead className="min-w-[140px] h-12 text-[11px] font-bold uppercase tracking-wide text-muted-foreground bg-muted/40">
                      Obs.
                    </TableHead>
                    <TableHead className="w-12 bg-muted/40" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itens.map((line, idx) => (
                    <TableRow key={line._key} className="border-border/50">
                      <TableCell className="align-top py-3">
                        <div className="relative min-w-[180px]">
                          <div className="flex gap-1.5">
                            <Input
                              className="h-10 text-sm rounded-lg"
                              placeholder="Buscar..."
                              value={prodSearchIdx === idx ? prodQuery : ''}
                              onFocus={() => {
                                setProdSearchIdx(idx)
                                setProdQuery('')
                              }}
                              onChange={(e) => {
                                setProdSearchIdx(idx)
                                setProdQuery(e.target.value)
                              }}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-10 w-10 shrink-0 rounded-lg"
                              title="Limpar vínculo"
                              onClick={() => {
                                const n = [...itens]
                                n[idx] = { ...n[idx], produto_id: null }
                                setItens(n)
                              }}
                            >
                              <Package className="h-4 w-4 opacity-60" />
                            </Button>
                          </div>
                          {prodSearchIdx === idx && (prodQuery.length >= 2 || prodLoading) && (
                            <div className="absolute z-20 mt-1.5 w-full max-h-52 overflow-auto rounded-lg border border-border/80 bg-popover text-popover-foreground shadow-lg text-sm">
                              {prodLoading ? (
                                <div className="p-2 flex justify-center">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                </div>
                              ) : prodHits.length === 0 ? (
                                <div className="p-2 text-muted-foreground">Sem resultados</div>
                              ) : (
                                  prodHits.map((p) => (
                                  <button
                                    key={p.id}
                                    type="button"
                                    className="w-full text-left px-2 py-1.5 hover:bg-muted border-b last:border-0"
                                    onClick={() => applyProduto(idx, p)}
                                  >
                                    <span className="font-medium line-clamp-1">{p.nome}</span>
                                    <span className="text-muted-foreground block text-[10px]">{p.sku || 'sem SKU'}</span>
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="align-top py-3">
                        <Input
                          className="h-10 text-sm font-mono rounded-lg"
                          value={line.codigo}
                          onChange={(e) => {
                            const n = [...itens]
                            n[idx] = { ...n[idx], codigo: e.target.value }
                            setItens(n)
                          }}
                        />
                      </TableCell>
                      <TableCell className="align-top py-3">
                        <Input
                          className="h-10 text-sm rounded-lg"
                          value={line.descricao}
                          onChange={(e) => {
                            const n = [...itens]
                            n[idx] = { ...n[idx], descricao: e.target.value }
                            setItens(n)
                          }}
                        />
                      </TableCell>
                      <TableCell className="align-top py-3">
                        <Input
                          className="h-10 text-sm rounded-lg"
                          value={line.unidade}
                          onChange={(e) => {
                            const n = [...itens]
                            n[idx] = { ...n[idx], unidade: e.target.value }
                            setItens(n)
                          }}
                        />
                      </TableCell>
                      <TableCell className="align-top py-3">
                        <Input
                          type="number"
                          min={1}
                          className="h-10 text-sm rounded-lg tabular-nums"
                          value={line.quantidade}
                          onChange={(e) => {
                            const n = [...itens]
                            n[idx] = { ...n[idx], quantidade: Math.max(1, parseInt(e.target.value, 10) || 1) }
                            setItens(n)
                          }}
                        />
                      </TableCell>
                      <TableCell className="align-top py-3">
                        <Input
                          className="h-10 text-sm rounded-lg"
                          value={line.observacao}
                          onChange={(e) => {
                            const n = [...itens]
                            n[idx] = { ...n[idx], observacao: e.target.value }
                            setItens(n)
                          }}
                        />
                      </TableCell>
                      <TableCell className="align-top py-3">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10 rounded-lg text-destructive"
                          disabled={itens.length <= 1}
                          onClick={() => setItens(itens.filter((_, i) => i !== idx))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/25 px-4 py-5 sm:px-6 flex flex-col-reverse sm:flex-row sm:justify-between sm:items-center gap-4">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="gap-2 h-11 rounded-lg border-border/80" onClick={pdfFromForm}>
                <FileDown className="h-4 w-4" />
                Descarregar PDF
              </Button>
              <Button type="button" variant="outline" className="gap-2 h-11 rounded-lg border-border/80" onClick={printFromForm}>
                <Printer className="h-4 w-4" />
                Imprimir
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              <Button type="button" variant="ghost" className="h-11 rounded-lg" onClick={() => setModalOpen(false)} disabled={saving}>
                Fechar
              </Button>
              <Button type="button" onClick={salvar} disabled={saving} className="gap-2 min-w-[160px] h-11 rounded-lg font-bold px-6">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Guardar pedido
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* ─── MODAL 2: CADASTRO DE NOTA DE ENTRADA (COMPRA) ────────────────────── */}
      <Modal
        isOpen={notaModalOpen}
        onClose={() => !saving && setNotaModalOpen(false)}
        title="Lançamento de Nota de Entrada de Compra"
        alignTop
        className="max-w-[min(1320px,calc(100vw-1.5rem))] w-full rounded-2xl border-border/60 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)]"
        contentClassName="max-h-[min(90vh,950px)] p-6 sm:p-8 md:p-10 !pt-6 sm:!pt-8"
      >
        <div className="space-y-6">
          {/* Box de Importação de XML */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 rounded-2xl border-2 border-dashed border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-500/5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                <FileCode className="w-6 h-6 animate-pulse" />
              </div>
              <div className="text-left">
                <h4 className="text-sm font-black text-emerald-800 dark:text-emerald-300">Importação Rápida via XML (NF-e)</h4>
                <p className="text-xs text-muted-foreground font-medium">Preencha fornecedor, valores e itens de forma automática a partir do XML da nota fiscal.</p>
              </div>
            </div>
            <div>
              <input
                type="file"
                accept=".xml"
                ref={fileInputRef}
                onChange={handleImportXml}
                className="hidden"
              />
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-11 px-5 rounded-xl shadow-md transition-all active:scale-95 shrink-0"
              >
                <Upload className="w-4 h-4" />
                Selecionar XML da Nota
              </Button>
            </div>
          </div>

          {/* Dados Cabecalho da Nota */}
          <section className="rounded-2xl border border-border/80 bg-gradient-to-b from-muted/30 to-muted/10 p-6 sm:p-8 shadow-sm space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
              {/* Auto suggest fornecedor */}
              <div className="md:col-span-2 space-y-2 relative">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5" /> Fornecedor *
                </Label>
                <Input
                  value={fornecedorSearchText}
                  onChange={(e) => {
                    setFornecedorSearchText(e.target.value)
                    setNotaFornecedorNome(e.target.value)
                  }}
                  placeholder="Pesquise ou digite o nome do fornecedor..."
                  className="h-11 rounded-lg bg-background"
                />
                {fornecedoresSugeridos.length > 0 && (
                  <div className="absolute z-30 mt-1 w-full bg-popover text-popover-foreground rounded-lg border border-border shadow-lg text-sm max-h-48 overflow-auto">
                    {fornecedoresSugeridos.map(f => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => {
                          setFornecedorIdSelecionado(f.id)
                          setNotaFornecedorNome(f.razao_social || f.nome)
                          setNotaFornecedorCnpj(f.cnpj || f.documento || '')
                          setFornecedorSearchText(f.razao_social || f.nome)
                          setFornecedoresSugeridos([])
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-muted border-b last:border-0 text-xs"
                      >
                        <span className="font-bold block">{f.razao_social || f.nome}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">CNPJ: {f.cnpj || f.documento || '—'}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">CNPJ Fornecedor</Label>
                <Input
                  value={notaFornecedorCnpj}
                  onChange={(e) => setNotaFornecedorCnpj(e.target.value)}
                  placeholder="CNPJ ou Documento"
                  className="h-11 rounded-lg bg-background"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Número da Nota *</Label>
                <Input
                  value={notaNumero}
                  onChange={(e) => setNotaNumero(e.target.value)}
                  placeholder="Ex: 004123"
                  className="h-11 rounded-lg bg-background font-bold"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
              <div className="space-y-2">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Série da Nota</Label>
                <Input
                  value={notaSerie}
                  onChange={(e) => setNotaSerie(e.target.value)}
                  placeholder="Ex: 1"
                  className="h-11 rounded-lg bg-background"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Chave de Acesso (44 dígitos)</Label>
                <Input
                  value={notaChave}
                  onChange={(e) => setNotaChave(e.target.value.replace(/\D/g, '').slice(0, 44))}
                  placeholder="Ex: 3522..."
                  className="h-11 rounded-lg bg-background font-mono text-xs"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Data de Emissão</Label>
                <Input
                  type="date"
                  value={notaDataEmissao}
                  onChange={(e) => setNotaDataEmissao(e.target.value)}
                  className="h-11 rounded-lg bg-background"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Data de Entrada</Label>
                <Input
                  type="date"
                  value={notaDataEntrada}
                  onChange={(e) => setNotaDataEntrada(e.target.value)}
                  className="h-11 rounded-lg bg-background"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Observações da Nota</Label>
              <Input
                value={notaObservacoes}
                onChange={(e) => setNotaObservacoes(e.target.value)}
                placeholder="Detalhes adicionais, informações fiscais, centro de custo..."
                className="h-11 rounded-lg bg-background"
              />
            </div>
          </section>

          {/* Itens Comprados Grade */}
          <div className="rounded-2xl border-2 border-border/70 overflow-hidden bg-card shadow-sm">
            <div className="bg-muted/60 px-5 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 border-b border-border/80">
              <span className="text-xs font-black uppercase tracking-[0.15em] text-foreground/80 flex items-center gap-1.5">
                <Package className="w-4 h-4 text-primary" /> Itens / Produtos da Nota de Entrada
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-9 gap-1.5 rounded-lg font-semibold"
                onClick={() => setNotaItens([...notaItens, emptyNotaItem()])}
              >
                <Plus className="h-4 w-4" />
                Adicionar Item
              </Button>
            </div>
            
            <div className="overflow-x-auto px-1 sm:px-2 pb-2">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-border/60">
                    <TableHead className="w-[180px] h-12 text-[11px] font-bold uppercase tracking-wide text-muted-foreground bg-muted/40">
                      Vincular Item (Estoque)
                    </TableHead>
                    <TableHead className="w-[90px] h-12 text-[11px] font-bold uppercase tracking-wide text-muted-foreground bg-muted/40">
                      SKU
                    </TableHead>
                    <TableHead className="w-[120px] h-12 text-[11px] font-bold uppercase tracking-wide text-muted-foreground bg-muted/40">
                      Part Number
                    </TableHead>
                    <TableHead className="min-w-[180px] h-12 text-[11px] font-bold uppercase tracking-wide text-muted-foreground bg-muted/40">
                      Descrição / Nome *
                    </TableHead>
                    <TableHead className="w-[80px] h-12 text-[11px] font-bold uppercase tracking-wide text-muted-foreground bg-muted/40">
                      Qtd *
                    </TableHead>
                    <TableHead className="w-[100px] h-12 text-[11px] font-bold uppercase tracking-wide text-muted-foreground bg-muted/40">
                      Custo Unit. *
                    </TableHead>
                    <TableHead className="w-[100px] h-12 text-[11px] font-bold uppercase tracking-wide text-muted-foreground bg-muted/40 text-emerald-600 font-black">
                      Venda Balcão (2x)
                    </TableHead>
                    <TableHead className="w-[120px] h-12 text-[11px] font-bold uppercase tracking-wide text-muted-foreground bg-muted/40">
                      Categoria / Local
                    </TableHead>
                    <TableHead className="w-[60px] h-12 text-[11px] font-bold uppercase tracking-wide text-muted-foreground bg-muted/40 text-center">
                      Estoque?
                    </TableHead>
                    <TableHead className="w-12 bg-muted/40" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notaItens.map((line, idx) => (
                    <TableRow key={line._key} className="border-border/50">
                      {/* Vínculo de produto */}
                      <TableCell className="align-top py-3">
                        <div className="relative">
                          <div className="flex gap-1">
                            <Input
                              className="h-10 text-xs rounded-lg"
                              placeholder="Pesquisar..."
                              value={notaProdSearchIdx === idx ? notaProdQuery : ''}
                              onFocus={() => {
                                setNotaProdSearchIdx(idx)
                                setNotaProdQuery('')
                              }}
                              onChange={(e) => {
                                setNotaProdSearchIdx(idx)
                                setNotaProdQuery(e.target.value)
                              }}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-10 w-10 shrink-0 rounded-lg"
                              title="Limpar vínculo"
                              onClick={() => {
                                const n = [...notaItens]
                                n[idx] = { ...n[idx], produto_id: null }
                                setNotaItens(n)
                              }}
                            >
                              <Package className="h-4 w-4 opacity-60" />
                            </Button>
                          </div>
                          {notaProdSearchIdx === idx && (notaProdQuery.length >= 2 || notaProdLoading) && (
                            <div className="absolute z-30 mt-1 w-full max-h-52 overflow-auto rounded-lg border border-border/80 bg-popover text-popover-foreground shadow-lg text-[11px]">
                              {notaProdLoading ? (
                                <div className="p-2 flex justify-center">
                                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                </div>
                              ) : notaProdHits.length === 0 ? (
                                <div className="p-2 text-muted-foreground">Sem resultados</div>
                              ) : (
                                notaProdHits.map((p) => (
                                  <button
                                    key={p.id}
                                    type="button"
                                    className="w-full text-left px-2 py-1.5 hover:bg-muted border-b last:border-0"
                                    onClick={() => applyProdutoNota(idx, p)}
                                  >
                                    <span className="font-bold block line-clamp-1">{p.nome}</span>
                                    <span className="text-muted-foreground text-[9px] font-mono">SKU: {p.sku || 'sem SKU'} · PN: {p.part_number || 'sem PN'}</span>
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      </TableCell>

                      {/* SKU */}
                      <TableCell className="align-top py-3">
                        <Input
                          className="h-10 text-xs font-mono rounded-lg bg-background"
                          placeholder="Gerado se vazio"
                          value={line.sku}
                          onChange={(e) => {
                            const n = [...notaItens]
                            n[idx] = { ...n[idx], sku: e.target.value }
                            setNotaItens(n)
                          }}
                        />
                      </TableCell>

                      {/* Part Number */}
                      <TableCell className="align-top py-3">
                        <Input
                          className="h-10 text-xs font-mono rounded-lg bg-background"
                          value={line.part_number}
                          onChange={(e) => {
                            const n = [...notaItens]
                            n[idx] = { ...n[idx], part_number: e.target.value }
                            setNotaItens(n)
                          }}
                        />
                      </TableCell>

                      {/* Descricao */}
                      <TableCell className="align-top py-3">
                        <Input
                          className="h-10 text-xs rounded-lg bg-background"
                          value={line.nome}
                          onChange={(e) => {
                            const n = [...notaItens]
                            n[idx] = { ...n[idx], nome: e.target.value }
                            setNotaItens(n)
                          }}
                        />
                      </TableCell>

                      {/* Qtd */}
                      <TableCell className="align-top py-3">
                        <Input
                          type="number"
                          min={1}
                          className="h-10 text-xs rounded-lg bg-background"
                          value={line.quantidade}
                          onChange={(e) => {
                            const n = [...notaItens]
                            n[idx] = { ...n[idx], quantidade: Math.max(1, parseInt(e.target.value, 10) || 1) }
                            setNotaItens(n)
                          }}
                        />
                      </TableCell>

                      {/* Custo */}
                      <TableCell className="align-top py-3">
                        <div className="relative">
                          <span className="absolute left-2.5 top-2.5 text-xs text-muted-foreground font-semibold">R$</span>
                          <Input
                            type="number"
                            step="0.01"
                            className="h-10 text-xs pl-8 rounded-lg bg-background font-mono font-bold"
                            value={line.custo || ''}
                            onChange={(e) => handleCustoChange(idx, Number(e.target.value) || 0)}
                          />
                        </div>
                      </TableCell>

                      {/* Venda (Auto 2x) */}
                      <TableCell className="align-top py-3">
                        <div className="relative">
                          <span className="absolute left-2.5 top-2.5 text-xs text-emerald-600 font-black">R$</span>
                          <Input
                            type="number"
                            readOnly
                            className="h-10 text-xs pl-8 rounded-lg bg-emerald-500/5 border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-mono font-black select-all"
                            value={line.preco_venda || ''}
                          />
                        </div>
                      </TableCell>

                      {/* Categoria / Local */}
                      <TableCell className="align-top py-3 space-y-1">
                        <select
                          className="w-full text-[11px] h-8 bg-background border border-input rounded-md px-1.5"
                          value={line.categoria_id}
                          onChange={(e) => {
                            const n = [...notaItens]
                            n[idx] = { ...n[idx], categoria_id: e.target.value }
                            setNotaItens(n)
                          }}
                        >
                          <option value="">Sem categoria</option>
                          {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                        </select>
                        
                        <select
                          className="w-full text-[11px] h-8 bg-background border border-input rounded-md px-1.5"
                          value={line.localizacao_id}
                          onChange={(e) => {
                            const n = [...notaItens]
                            n[idx] = { ...n[idx], localizacao_id: e.target.value }
                            setNotaItens(n)
                          }}
                        >
                          <option value="">Sem local</option>
                          {locais.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                        </select>
                      </TableCell>

                      {/* Cadastrar no Estoque Checkbox */}
                      <TableCell className="align-top py-3 text-center">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary mt-3 cursor-pointer"
                          checked={line.cadastrar_estoque}
                          onChange={(e) => {
                            const n = [...notaItens]
                            n[idx] = { ...n[idx], cadastrar_estoque: e.target.checked }
                            setNotaItens(n)
                          }}
                        />
                      </TableCell>

                      {/* Remove Row Button */}
                      <TableCell className="align-top py-3">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10 rounded-lg text-destructive"
                          disabled={notaItens.length <= 1}
                          onClick={() => setNotaItens(notaItens.filter((_, i) => i !== idx))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Footer Lançar Nota */}
          <div className="rounded-xl border border-border/60 bg-muted/25 px-4 py-5 sm:px-6 flex justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <Coins className="w-5 h-5 text-emerald-600" />
              <div className="text-xs">
                <span className="text-muted-foreground">Valor Total da Nota: </span>
                <span className="font-mono font-black text-sm text-emerald-600">
                  R$ {notaItens.reduce((acc, i) => acc + ((i.quantidade || 0) * (i.custo || 0)), 0).toFixed(2)}
                </span>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="ghost" className="h-11 rounded-lg" onClick={() => setNotaModalOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button type="button" onClick={handleSalvarNota} disabled={saving} className="gap-2 min-w-[200px] h-11 rounded-lg font-black bg-emerald-600 hover:bg-emerald-700 text-white px-6">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Lançar Nota no Estoque
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* ─── MODAL 3: VISUALIZAR DETALHES DE NOTA DE ENTRADA ──────────────────── */}
      <Modal
        isOpen={isViewNotaModalOpen}
        onClose={() => setIsViewNotaModalOpen(false)}
        title={selectedNota ? `Nota de Entrada #${selectedNota.numero_nota}` : 'Detalhes da Nota'}
        alignTop
        className="max-w-4xl"
      >
        {selectedNota && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 border rounded-xl bg-muted/10 text-xs">
              <div>
                <span className="text-muted-foreground block">Fornecedor</span>
                <span className="font-bold text-sm block">{selectedNota.fornecedor_nome}</span>
                <span className="font-mono text-[10px] block opacity-70">CNPJ: {selectedNota.fornecedor_cnpj || '—'}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Série / Número</span>
                <span className="font-bold text-sm block">Série {selectedNota.serie} · {selectedNota.numero_nota}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Datas</span>
                <span className="block">Emissão: {fmtDate(selectedNota.data_emissao)}</span>
                <span className="block">Entrada: {fmtDate(selectedNota.data_entrada)}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Valor Total</span>
                <span className="font-mono font-black text-sm text-primary block">R$ {Number(selectedNota.valor_total).toFixed(2)}</span>
              </div>
            </div>

            {selectedNota.chave_acesso && (
              <div className="p-3 border rounded-xl bg-muted/5 font-mono text-[11px] flex justify-between items-center">
                <div>
                  <span className="text-muted-foreground block text-[9px] uppercase font-sans">Chave de Acesso da NF-e</span>
                  <span>{selectedNota.chave_acesso}</span>
                </div>
              </div>
            )}

            {selectedNota.observacoes && (
              <div className="p-3 border rounded-xl bg-muted/5 text-xs">
                <span className="text-muted-foreground block text-[9px] uppercase font-sans">Observações</span>
                <p>{selectedNota.observacoes}</p>
              </div>
            )}

            {isReturningMode && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-700 dark:text-amber-400 text-xs flex items-center gap-2">
                <Info className="w-4 h-4 shrink-0" />
                <span><strong>Modo Devolução Ativo:</strong> Especifique as quantidades a serem devolvidas. O estoque correspondente será baixado automaticamente.</span>
              </div>
            )}

            <div className="border rounded-xl overflow-hidden bg-card">
              <div className="bg-muted/40 p-3 font-bold text-xs flex justify-between items-center">
                <span>Produtos / Itens Comprados</span>
                {isReturningMode && <span className="text-amber-600 font-bold text-[11px] uppercase">Selecione as Quantidades</span>}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Part Number</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Qtd Comprada</TableHead>
                    <TableHead className="text-right">Já Devolvida</TableHead>
                    <TableHead className="text-right">Custo Unitário</TableHead>
                    <TableHead className="text-right">{isReturningMode ? 'Qtd a Devolver' : 'Venda Balcão (2x)'}</TableHead>
                    <TableHead className="text-right">Valor Restante</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedNota.itens?.map((it, idx) => {
                    const maxDevoluvel = it.quantidade - (it.quantidade_devolvida || 0);
                    return (
                      <TableRow key={idx}>
                        <TableCell className="font-mono text-xs">{it.sku || '—'}</TableCell>
                        <TableCell className="font-mono text-xs">{it.part_number || '—'}</TableCell>
                        <TableCell className="text-xs font-medium">{it.nome}</TableCell>
                        <TableCell className="text-right font-bold text-xs">{it.quantidade}</TableCell>
                        <TableCell className="text-right text-xs">
                          {it.quantidade_devolvida ? (
                            <Badge variant="outline" className="border-amber-500/30 text-amber-700 bg-amber-500/5 font-bold">{it.quantidade_devolvida}</Badge>
                          ) : (
                            <span className="text-muted-foreground opacity-50">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">R$ {Number(it.custo).toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {isReturningMode ? (
                            <Input
                              type="number"
                              min={0}
                              max={maxDevoluvel}
                              disabled={maxDevoluvel <= 0}
                              placeholder={maxDevoluvel > 0 ? "0" : "Esgotado"}
                              className="h-8 w-20 text-xs text-right bg-background inline-block font-bold border-amber-500/30 focus-visible:ring-amber-500/20"
                              value={itensDevolucao[it._key] || ''}
                              onChange={(e) => {
                                const val = Math.min(maxDevoluvel, Math.max(0, parseInt(e.target.value, 10) || 0));
                                setItensDevolucao(prev => ({ ...prev, [it._key]: val }));
                              }}
                            />
                          ) : (
                            <span className="text-emerald-600 font-bold">R$ {Number(it.preco_venda).toFixed(2)}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          R$ {Number((it.quantidade - (it.quantidade_devolvida || 0)) * it.custo).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-between items-center p-2 border-t pt-4">
              <div>
                {!isReturningMode && selectedNota.itens.some(i => i.quantidade - (i.quantidade_devolvida || 0) > 0) && (
                  <Button
                    variant="outline"
                    className="border-amber-500/20 text-amber-700 hover:bg-amber-500/5 font-bold text-xs gap-1.5 h-10"
                    onClick={() => {
                      setIsReturningMode(true);
                      setItensDevolucao({});
                    }}
                  >
                    <RefreshCw className="w-3.5 h-3.5 animate-none" /> Devolver Itens da Nota
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                {isReturningMode ? (
                  <>
                    <Button
                      variant="ghost"
                      className="h-10 text-xs font-semibold"
                      onClick={() => {
                        setIsReturningMode(false);
                        setItensDevolucao({});
                      }}
                      disabled={saving}
                    >
                      Cancelar
                    </Button>
                    <Button
                      className="bg-amber-600 hover:bg-amber-700 text-white font-black text-xs h-10 px-5 gap-1.5"
                      onClick={handleProcessarDevolucao}
                      disabled={saving}
                    >
                      {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Confirmar Devolução
                    </Button>
                  </>
                ) : (
                  <Button
                    className="h-10 text-xs font-bold px-6"
                    onClick={() => {
                      setIsViewNotaModalOpen(false);
                      setIsReturningMode(false);
                      setItensDevolucao({});
                    }}
                  >
                    Fechar
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

    </div>
  )
}

function mapConfigToPdfEmpresa(row: Record<string, unknown> | null | undefined): CompraPedidoPdfEmpresa | null {
  if (!row || typeof row !== 'object') return null
  const nome = (row.nome_empresa as string | undefined) ?? null
  return {
    nome_fantasia: nome,
    razao_social: nome,
    telefone: (row.telefone as string | undefined) ?? null,
    email: (row.email as string | undefined) ?? null,
    endereco: (row.endereco as string | undefined) ?? null,
    cnpj: (row.cnpj as string | undefined) ?? null,
  }
}
