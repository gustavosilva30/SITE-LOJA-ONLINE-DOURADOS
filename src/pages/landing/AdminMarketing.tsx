import { useEffect, useState, useMemo } from 'react'
import { api, estoqueApi } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { hasCrmPathAccess } from '@/config/crmRoutePermissions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select } from '@/components/ui/select'
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  ImageIcon,
  ExternalLink,
  Loader2,
  Package,
  Layers,
  Star,
  Car,
  Search,
} from 'lucide-react'
import type {
  LandingSlide,
  LandingPromoTile,
  LandingSlideType,
  LandingCategorySlot,
  LandingDestaqueProduto,
} from '@/lib/landingTypes'
import { toast } from 'sonner'
import { storeProductDetailLink } from '@/lib/storeProductPath'
import { getApiBaseUrl } from '@/lib/apiBase'

const MAX_SLIDES = 6
const MAX_CATEGORIES_PER_BLOCK = 12
const MAX_DESTAQUES = 12

type DestaqueRow = LandingDestaqueProduto & { sku?: string; nome?: string }

type DestaqueSearchHit = { id: string; nome: string | null; sku: string | null }

/** Evita que %, _ e vírgula em ilike / .or() quebrem o filtro PostgREST. */
function sanitizeIlikeTerm(raw: string): string {
  return raw.trim().replace(/%/g, '').replace(/_/g, '').replace(/,/g, '')
}

export function AdminMarketing() {
  const { atendente } = useAuthStore()
  const canEdit = useMemo(
    () => hasCrmPathAccess("/admin/marketing", atendente),
    [atendente]
  )

  const [slides, setSlides] = useState<LandingSlide[]>([])
  const [tiles, setTiles] = useState<LandingPromoTile[]>([])
  const [loading, setLoading] = useState(true)
  /** Rascunho do campo ID/slug por slide (antes de clicar em Carregar) */
  const [draftProdutoRef, setDraftProdutoRef] = useState<Record<string, string>>({})
  const [loadingProductId, setLoadingProductId] = useState<string | null>(null)

  const [categorySlots, setCategorySlots] = useState<LandingCategorySlot[]>([])
  const [allCategories, setAllCategories] = useState<{ id: string; nome: string }[]>([])
  const [marketingConfig, setMarketingConfig] = useState({
    titulo_categorias_grupo1: 'Departamentos',
    titulo_categorias_grupo2: 'Linhas de produto',
    titulo_destaque_loja: 'Destaques da loja',
    titulo_sucatas_landing: 'Sucatas no pátio',
  })
  const [pickCatG1, setPickCatG1] = useState('')
  const [pickCatG2, setPickCatG2] = useState('')
  const [featuredRows, setFeaturedRows] = useState<DestaqueRow[]>([])
  const [draftFeaturedRef, setDraftFeaturedRef] = useState('')
  const [loadingFeaturedAdd, setLoadingFeaturedAdd] = useState(false)
  const [destaqueSearch, setDestaqueSearch] = useState('')
  const [destaqueHits, setDestaqueHits] = useState<DestaqueSearchHit[]>([])
  const [destaqueSearching, setDestaqueSearching] = useState(false)
  /** Só após uma pesquisa concluída (evita “nenhum resultado” antes do debounce). */
  const [destaqueNoResults, setDestaqueNoResults] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [s, t, slotsList, catsList, cfgRow, destList] = await Promise.all([
        api.get('/api/landing/slides?incluir_inativos=true'),
        api.get('/api/landing/promo-tiles?incluir_inativos=true'),
        api.get('/api/landing/category-slots'),
        api.get('/api/configuracoes/categorias'),
        api.get('/api/landing/marketing-config'),
        api.get('/api/landing/destaque-produtos'),
      ])
      setSlides((Array.isArray(s) ? s : []) as LandingSlide[])
      setTiles((Array.isArray(t) ? t : []) as LandingPromoTile[])
      setCategorySlots((Array.isArray(slotsList) ? slotsList : []) as LandingCategorySlot[])
      setAllCategories((Array.isArray(catsList) ? catsList : []) as { id: string; nome: string }[])
      if (cfgRow && typeof cfgRow === 'object') {
        const c = cfgRow as Record<string, string | undefined>
        setMarketingConfig({
          titulo_categorias_grupo1: c.titulo_categorias_grupo1 || 'Departamentos',
          titulo_categorias_grupo2: c.titulo_categorias_grupo2 || 'Linhas de produto',
          titulo_destaque_loja: c.titulo_destaque_loja || 'Destaques da loja',
          titulo_sucatas_landing: c.titulo_sucatas_landing || 'Sucatas no pátio',
        })
      }
      const rows = (Array.isArray(destList) ? destList : []) as LandingDestaqueProduto[]
      if (rows.length) {
        const pids = rows.map((r) => r.produto_id)
        const prods = await Promise.all(
          pids.map((id) => estoqueApi.detalheProduto(id).catch(() => null))
        )
        const pm = new Map(
          prods.filter(Boolean).map((p: any) => [p.id as string, p as { id: string; sku?: string; nome?: string }])
        )
        setFeaturedRows(
          rows.map((r) => ({
            ...r,
            sku: pm.get(r.produto_id)?.sku,
            nome: pm.get(r.produto_id)?.nome,
          }))
        )
      } else {
        setFeaturedRows([])
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao carregar marketing')
      setSlides([])
      setTiles([])
      setCategorySlots([])
    }
    setLoading(false)
  }

  useEffect(() => {
    if (canEdit) load()
  }, [canEdit])

  useEffect(() => {
    const q = destaqueSearch.trim()
    if (q.length < 2) {
      setDestaqueHits([])
      setDestaqueSearching(false)
      setDestaqueNoResults(false)
      return
    }
    const safe = sanitizeIlikeTerm(q)
    if (safe.length < 2) {
      setDestaqueHits([])
      setDestaqueSearching(false)
      setDestaqueNoResults(false)
      return
    }
    setDestaqueNoResults(false)
    const t = window.setTimeout(() => {
      ;(async () => {
        setDestaqueSearching(true)
        try {
          const res = await estoqueApi.listarProdutos({
            q: safe,
            limit: 25,
            painel: true,
            loja: 'sim',
          })
          const items = res && typeof res === 'object' && 'items' in res ? (res as { items: any[] }).items : []
          const rows: DestaqueSearchHit[] = (items || []).map((p: any) => ({
            id: p.id,
            nome: p.nome ?? null,
            sku: p.sku ?? null,
          }))
          setDestaqueHits(rows)
          setDestaqueNoResults(rows.length === 0)
        } finally {
          setDestaqueSearching(false)
        }
      })()
    }, 350)
    return () => clearTimeout(t)
  }, [destaqueSearch])

  const uploadFile = async (file: File): Promise<string | null> => {
    const formData = new FormData()
    formData.append('file', file)
    try {
      const result = await api.postForm('/api/admin/upload-produto-imagem', formData)
      if (!result?.url) {
        toast.error('Upload sem URL na resposta')
        return null
      }
      return result.url
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(msg)
      return null
    }
  }

  const addSlide = async () => {
    if (slides.length >= MAX_SLIDES) {
      toast.error(`Máximo de ${MAX_SLIDES} slides no carrossel.`)
      return
    }
    const url = window.prompt('URL da imagem (ou deixe vazio para enviar ficheiro depois no Storage manualmente):')
    if (url === null) return
    const imagem = url.trim() || 'https://placehold.co/1200x400/002b5c/ccff33?text=Slide'
    try {
      await api.post('/api/landing/slides', {
        ordem: slides.length,
        titulo: 'Novo slide',
        subtitulo: '',
        imagem_url: imagem,
        ativo: true,
        slide_type: 'image',
        produto_id: null,
      })
      toast.success('Slide criado')
      load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao criar slide')
    }
  }

  const updateSlide = async (id: string, patch: Partial<LandingSlide>) => {
    try {
      await api.put(`/api/landing/slides/${id}`, patch as Record<string, unknown>)
      load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao atualizar')
    }
  }

  const removeSlide = async (id: string) => {
    if (!confirm('Remover este slide?')) return
    try {
      await api.delete(`/api/landing/slides/${id}`)
      load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao remover')
    }
  }

  const moveSlide = async (idx: number, dir: -1 | 1) => {
    const next = idx + dir
    if (next < 0 || next >= slides.length) return
    const a = slides[idx]
    const b = slides[next]
    try {
      await api.put(`/api/landing/slides/${a.id}`, { ordem: b.ordem })
      await api.put(`/api/landing/slides/${b.id}`, { ordem: a.ordem })
      load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao reordenar')
    }
  }

  const onSlideFile = async (slideId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const url = await uploadFile(f)
    if (url) await updateSlide(slideId, { imagem_url: url })
  }

  const applyProductToSlide = async (slideId: string) => {
    const s = slides.find((x) => x.id === slideId)
    const raw = (draftProdutoRef[slideId] ?? s?.produto_id ?? '').trim()
    if (!raw) {
      toast.error('Informe o UUID ou o slug do produto.')
      return
    }
    setLoadingProductId(slideId)
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/store/products/${encodeURIComponent(raw)}`)
      if (!res.ok) {
        toast.error('Produto não encontrado ou não publicado na loja.')
        return
      }
      const p = await res.json()
      const price = p.public_price ?? p.preco ?? 0
      const sub =
        p.descricao && String(p.descricao).length > 0
          ? String(p.descricao).slice(0, 200) + (String(p.descricao).length > 200 ? '…' : '')
          : ''
      await updateSlide(slideId, {
        slide_type: 'product',
        produto_id: p.id,
        imagem_url: p.imagem_url || s?.imagem_url || 'https://placehold.co/1200x400/002b5c/ccff33?text=Produto',
        titulo: p.nome || s?.titulo,
        subtitulo: sub || s?.subtitulo,
        cta_texto: 'Ver produto',
        cta_link: storeProductDetailLink({ id: p.id, slug: p.slug }),
      })
      toast.success('Produto aplicado ao slide.')
    } catch {
      toast.error('Erro ao buscar produto. Verifique VITE_API_URL.')
    } finally {
      setLoadingProductId(null)
    }
  }

  const setSlideType = async (slideId: string, type: LandingSlideType) => {
    if (type === 'image') {
      await updateSlide(slideId, { slide_type: 'image', produto_id: null })
    } else {
      await updateSlide(slideId, { slide_type: 'product' })
    }
  }

  const addTile = async (pos: 'left' | 'right') => {
    try {
      await api.post('/api/landing/promo-tiles', {
        posicao: pos,
        titulo: 'Promoção',
        imagem_url: 'https://placehold.co/800x300/002b5c/ffffff?text=Banner',
        ativo: true,
        ordem: tiles.filter((t) => t.posicao === pos).length,
      })
      load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao criar banner')
    }
  }

  const updateTile = async (id: string, patch: Partial<LandingPromoTile>) => {
    try {
      await api.put(`/api/landing/promo-tiles/${id}`, patch as Record<string, unknown>)
      load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao atualizar banner')
    }
  }

  const removeTile = async (id: string) => {
    if (!confirm('Remover banner?')) return
    try {
      await api.delete(`/api/landing/promo-tiles/${id}`)
      load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao remover')
    }
  }

  const saveMarketingConfig = async () => {
    try {
      await api.put('/api/landing/marketing-config', {
        titulo_categorias_grupo1: marketingConfig.titulo_categorias_grupo1.trim() || 'Departamentos',
        titulo_categorias_grupo2: marketingConfig.titulo_categorias_grupo2.trim() || 'Linhas de produto',
        titulo_destaque_loja: marketingConfig.titulo_destaque_loja.trim() || 'Destaques da loja',
        titulo_sucatas_landing: marketingConfig.titulo_sucatas_landing.trim() || 'Sucatas no pátio',
      })
      toast.success('Configurações da landing guardadas.')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao guardar')
    }
  }

  const insertFeaturedProductId = async (productId: string): Promise<boolean> => {
    if (featuredRows.length >= MAX_DESTAQUES) {
      toast.error(`Máximo de ${MAX_DESTAQUES} produtos em destaque.`)
      return false
    }
    if (featuredRows.some((r) => r.produto_id === productId)) {
      toast.error('Este produto já está na lista.')
      return false
    }
    try {
      await api.post('/api/landing/destaque-produtos', {
        produto_id: productId,
        ordem: featuredRows.length,
      })
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao adicionar destaque')
      return false
    }
    toast.success('Produto adicionado aos destaques.')
    return true
  }

  const addFeaturedProduct = async () => {
    const raw = draftFeaturedRef.trim()
    if (!raw) {
      toast.error('Informe o UUID ou o slug do produto.')
      return
    }
    setLoadingFeaturedAdd(true)
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/store/products/${encodeURIComponent(raw)}`)
      if (!res.ok) {
        toast.error('Produto não encontrado ou não publicado na loja.')
        return
      }
      const p = await res.json()
      const ok = await insertFeaturedProductId(p.id)
      if (ok) {
        setDraftFeaturedRef('')
        load()
      }
    } catch {
      toast.error('Erro ao buscar produto. Verifique VITE_API_URL.')
    } finally {
      setLoadingFeaturedAdd(false)
    }
  }

  const addFeaturedFromSearch = async (productId: string) => {
    setLoadingFeaturedAdd(true)
    try {
      const ok = await insertFeaturedProductId(productId)
      if (ok) {
        setDestaqueSearch('')
        setDestaqueHits([])
        load()
      }
    } finally {
      setLoadingFeaturedAdd(false)
    }
  }

  const removeFeatured = async (id: string) => {
    if (!confirm('Remover este destaque?')) return
    try {
      await api.delete(`/api/landing/destaque-produtos/${id}`)
      toast.success('Removido.')
      load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao remover')
    }
  }

  const moveFeatured = async (idx: number, dir: -1 | 1) => {
    const list = [...featuredRows]
    const next = idx + dir
    if (next < 0 || next >= list.length) return
    const a = list[idx]!
    const b = list[next]!
    try {
      await api.put(`/api/landing/destaque-produtos/${a.id}`, { ordem: b.ordem })
      await api.put(`/api/landing/destaque-produtos/${b.id}`, { ordem: a.ordem })
      load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao reordenar')
    }
  }

  const slotsForGrupo = (grupo: 1 | 2) =>
    categorySlots.filter((x) => x.grupo === grupo).sort((a, b) => a.ordem - b.ordem)

  const nomeCategoria = (id: string) => allCategories.find((c) => c.id === id)?.nome || id

  const addCategorySlot = async (grupo: 1 | 2) => {
    const categoriaId = grupo === 1 ? pickCatG1 : pickCatG2
    if (!categoriaId) {
      toast.error('Escolha uma categoria na lista.')
      return
    }
    const list = slotsForGrupo(grupo)
    if (list.length >= MAX_CATEGORIES_PER_BLOCK) {
      toast.error(`Máximo de ${MAX_CATEGORIES_PER_BLOCK} categorias por bloco.`)
      return
    }
    if (list.some((x) => x.categoria_id === categoriaId)) {
      toast.error('Esta categoria já está neste bloco.')
      return
    }
    try {
      await api.post('/api/landing/category-slots', {
        categoria_id: categoriaId,
        grupo,
        ordem: list.length,
      })
      toast.success('Categoria adicionada.')
      if (grupo === 1) setPickCatG1('')
      else setPickCatG2('')
      load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao adicionar')
    }
  }

  const moveCategorySlot = async (grupo: 1 | 2, idx: number, dir: -1 | 1) => {
    const list = slotsForGrupo(grupo)
    const next = idx + dir
    if (next < 0 || next >= list.length) return
    const a = list[idx]!
    const b = list[next]!
    try {
      await api.put(`/api/landing/category-slots/${a.id}`, { ordem: b.ordem })
      await api.put(`/api/landing/category-slots/${b.id}`, { ordem: a.ordem })
      load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao reordenar')
    }
  }

  const removeCategorySlot = async (id: string) => {
    if (!confirm('Remover esta categoria da landing?')) return
    try {
      await api.delete(`/api/landing/category-slots/${id}`)
      load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao remover')
    }
  }

  const renderCategoryBlock = (grupo: 1 | 2, label: string, description: string) => {
    const list = slotsForGrupo(grupo)
    const used = new Set(list.map((x) => x.categoria_id))
    const available = allCategories.filter((c) => !used.has(c.id))
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="w-4 h-4" /> {label}
          </CardTitle>
          <p className="text-xs text-muted-foreground">{description}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="text-[10px] font-bold uppercase text-muted-foreground">Adicionar categoria</label>
              <Select
                className="mt-1 w-full"
                value={grupo === 1 ? pickCatG1 : pickCatG2}
                onChange={(e) => (grupo === 1 ? setPickCatG1(e.target.value) : setPickCatG2(e.target.value))}
              >
                <option value="">Selecione…</option>
                {available.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={list.length >= MAX_CATEGORIES_PER_BLOCK}
              onClick={() => void addCategorySlot(grupo)}
            >
              <Plus className="w-4 h-4 mr-1" /> Adicionar
            </Button>
          </div>
          {list.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              Nenhuma categoria — na landing será usada a lista automática (primeiras 8) só no bloco superior, se o grupo 1
              estiver vazio.
            </p>
          ) : (
            <ul className="space-y-2">
              {list.map((row, idx) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 bg-muted/20"
                >
                  <span className="text-sm font-medium truncate">{nomeCategoria(row.categoria_id)}</span>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" type="button" onClick={() => void moveCategorySlot(grupo, idx, -1)}>
                      <ChevronUp className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" type="button" onClick={() => void moveCategorySlot(grupo, idx, 1)}>
                      <ChevronDown className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="destructive" type="button" onClick={() => void removeCategorySlot(row.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    )
  }

  if (!canEdit) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Sem permissão para Marketing. Peça permissão de administrador (perm_config).
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Marketing — site público</h1>
          <p className="text-sm text-muted-foreground">
            Edita o conteúdo da página institucional, em <strong>autopecasdourados.com.br/institucional</strong> (a raiz do domínio agora vai direto pra loja, ver <code className="text-xs bg-muted px-1 rounded">vercel.json</code>).
          </p>
        </div>
        <Button
          variant="outline"
          className="gap-2"
          type="button"
          onClick={() => window.open('/site', '_blank', 'noopener,noreferrer')}
        >
          <ExternalLink className="w-4 h-4" /> Ver landing
        </Button>
      </div>

      <Tabs defaultValue="slides">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="slides">Carrossel (hero)</TabsTrigger>
          <TabsTrigger value="tiles">Banners duplos</TabsTrigger>
          <TabsTrigger value="destaques" className="gap-1">
            <Star className="w-3.5 h-3.5" /> Destaques loja
          </TabsTrigger>
          <TabsTrigger value="categories">Categorias na landing</TabsTrigger>
        </TabsList>

        <TabsContent value="slides" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Carrossel no topo do <code className="text-xs bg-muted px-1 rounded">/site</code> — até{' '}
              <strong>{MAX_SLIDES}</strong> itens (imagens ou produtos da loja).
            </p>
            <Button onClick={addSlide} className="gap-2" disabled={slides.length >= MAX_SLIDES}>
              <Plus className="w-4 h-4" /> Novo slide
            </Button>
          </div>
          {loading ? (
            <p className="text-sm text-muted-foreground">A carregar…</p>
          ) : (
            slides.map((s, idx) => (
              <Card key={s.id}>
                <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
                  <CardTitle className="text-base">Slide {idx + 1}</CardTitle>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => moveSlide(idx, -1)}>
                      <ChevronUp className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => moveSlide(idx, 1)}>
                      <ChevronDown className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => updateSlide(s.id, { ativo: !s.ativo })}>
                      {s.ativo ? 'On' : 'Off'}
                    </Button>
                    <Button size="icon" variant="destructive" onClick={() => removeSlide(s.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold">Tipo do slide</label>
                    <Select
                      value={(s.slide_type ?? 'image') as string}
                      onChange={(e) => void setSlideType(s.id, e.target.value as LandingSlideType)}
                      className="w-full max-w-xs"
                    >
                      <option value="image">Só imagem (banner)</option>
                      <option value="product">Produto da loja</option>
                    </Select>
                    {(s.slide_type ?? 'image') === 'product' && (
                      <div className="rounded-lg border border-border p-3 space-y-2 bg-muted/30">
                        <p className="text-xs font-bold flex items-center gap-1">
                          <Package className="w-3.5 h-3.5" /> Destacar produto
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Cole o <strong>UUID</strong> ou o <strong>slug</strong> do produto (publicado na loja) e clique em Carregar.
                        </p>
                        <div className="flex flex-wrap gap-2 items-center">
                          <Input
                            placeholder="ex.: uuid ou slug-do-produto"
                            className="text-xs flex-1 min-w-[200px]"
                            value={draftProdutoRef[s.id] ?? s.produto_id ?? ''}
                            onChange={(e) =>
                              setDraftProdutoRef((prev) => ({ ...prev, [s.id]: e.target.value }))
                            }
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={loadingProductId === s.id}
                            onClick={() => void applyProductToSlide(s.id)}
                          >
                            {loadingProductId === s.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              'Carregar produto'
                            )}
                          </Button>
                        </div>
                      </div>
                    )}
                    <label className="text-xs font-bold">Título</label>
                    <Input
                      value={s.titulo || ''}
                      onChange={(e) => setSlides((prev) => prev.map((x) => (x.id === s.id ? { ...x, titulo: e.target.value } : x)))}
                      onBlur={(e) => void updateSlide(s.id, { titulo: e.target.value })}
                    />
                    <label className="text-xs font-bold">Subtítulo</label>
                    <Input
                      value={s.subtitulo || ''}
                      onChange={(e) => setSlides((prev) => prev.map((x) => (x.id === s.id ? { ...x, subtitulo: e.target.value } : x)))}
                      onBlur={(e) => void updateSlide(s.id, { subtitulo: e.target.value })}
                    />
                    <label className="text-xs font-bold">CTA / link</label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Texto botão"
                        value={s.cta_texto || ''}
                        onChange={(e) => setSlides((prev) => prev.map((x) => (x.id === s.id ? { ...x, cta_texto: e.target.value } : x)))}
                        onBlur={(e) => void updateSlide(s.id, { cta_texto: e.target.value })}
                      />
                      <Input
                        placeholder="/loja"
                        value={s.cta_link || ''}
                        onChange={(e) => setSlides((prev) => prev.map((x) => (x.id === s.id ? { ...x, cta_link: e.target.value } : x)))}
                        onBlur={(e) => void updateSlide(s.id, { cta_link: e.target.value })}
                      />
                    </div>
                    <label className="text-xs font-bold">Intervalo (segundos)</label>
                    <Input
                      type="number"
                      min={3}
                      value={s.intervalo_segundos}
                      onChange={(e) => setSlides((prev) => prev.map((x) => (x.id === s.id ? { ...x, intervalo_segundos: Number(e.target.value) } : x)))}
                      onBlur={(e) => void updateSlide(s.id, { intervalo_segundos: Math.max(3, Number(e.target.value) || 6) })}
                    />
                  </div>
                  <div>
                    <p className="text-xs font-bold mb-2">
                      {(s.slide_type ?? 'image') === 'product' ? 'Imagem (sincronizada do produto; pode substituir)' : 'Imagem'}
                    </p>
                    <img src={s.imagem_url} alt="" className="w-full max-h-40 object-cover rounded border mb-2" />
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <ImageIcon className="w-4 h-4" />
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => onSlideFile(s.id, e)} />
                      <span className="underline">Enviar imagem</span>
                    </label>
                    <Input
                      className="mt-2 text-xs"
                      value={s.imagem_url}
                      onChange={(e) => setSlides((prev) => prev.map((x) => (x.id === s.id ? { ...x, imagem_url: e.target.value } : x)))}
                      onBlur={(e) => void updateSlide(s.id, { imagem_url: e.target.value })}
                    />
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="tiles" className="space-y-4">
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => addTile('left')}>
              + Banner esquerda
            </Button>
            <Button variant="outline" onClick={() => addTile('right')}>
              + Banner direita
            </Button>
          </div>
          {tiles.map((t) => (
            <Card key={t.id}>
              <CardHeader className="flex flex-row justify-between items-center py-2">
                <span className="text-sm font-bold">{t.posicao.toUpperCase()}</span>
                <Button size="icon" variant="destructive" onClick={() => removeTile(t.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </CardHeader>
              <CardContent className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Input
                    placeholder="Título"
                    value={t.titulo || ''}
                    onChange={(e) => setTiles((prev) => prev.map((x) => (x.id === t.id ? { ...x, titulo: e.target.value } : x)))}
                    onBlur={(e) => void updateTile(t.id, { titulo: e.target.value })}
                  />
                  <Input
                    placeholder="Subtítulo"
                    value={t.subtitulo || ''}
                    onChange={(e) => setTiles((prev) => prev.map((x) => (x.id === t.id ? { ...x, subtitulo: e.target.value } : x)))}
                    onBlur={(e) => void updateTile(t.id, { subtitulo: e.target.value })}
                  />
                  <Input
                    placeholder="CTA"
                    value={t.cta_texto || ''}
                    onChange={(e) => setTiles((prev) => prev.map((x) => (x.id === t.id ? { ...x, cta_texto: e.target.value } : x)))}
                    onBlur={(e) => void updateTile(t.id, { cta_texto: e.target.value })}
                  />
                  <Input
                    placeholder="Link"
                    value={t.cta_link || ''}
                    onChange={(e) => setTiles((prev) => prev.map((x) => (x.id === t.id ? { ...x, cta_link: e.target.value } : x)))}
                    onBlur={(e) => void updateTile(t.id, { cta_link: e.target.value })}
                  />
                </div>
                <div>
                  <img src={t.imagem_url || ''} alt="" className="w-full max-h-32 object-cover rounded border mb-2" />
                  <label className="text-xs underline cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const f = e.target.files?.[0]
                        if (!f) return
                        const url = await uploadFile(f)
                        if (url) updateTile(t.id, { imagem_url: url })
                      }}
                    />
                    Substituir imagem
                  </label>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="destaques" className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Escolhe até <strong>{MAX_DESTAQUES}</strong> produtos <strong>publicados na loja</strong> para a grelha &quot;Destaques&quot; em{' '}
            <code className="text-xs bg-muted px-1 rounded">/site</code>. Se a lista estiver vazia, o site continua a mostrar os 8 primeiros
            produtos da API (comportamento antigo).
          </p>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Car className="w-4 h-4" /> Títulos na landing
              </CardTitle>
              <p className="text-xs text-muted-foreground">Secção de produtos e o separador de sucatas no site público.</p>
            </CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold">Título destaques (grelha de produtos)</label>
                <Input
                  value={marketingConfig.titulo_destaque_loja}
                  onChange={(e) => setMarketingConfig((m) => ({ ...m, titulo_destaque_loja: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold">Título separador sucatas</label>
                <Input
                  value={marketingConfig.titulo_sucatas_landing}
                  onChange={(e) => setMarketingConfig((m) => ({ ...m, titulo_sucatas_landing: e.target.value }))}
                />
              </div>
              <div className="sm:col-span-2">
                <Button type="button" onClick={() => void saveMarketingConfig()}>
                  Guardar títulos
                </Button>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Star className="w-4 h-4" /> Produtos em destaque
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold flex items-center gap-2">
                  <Search className="w-3.5 h-3.5" />
                  Buscar por nome ou SKU (só produtos publicados na loja)
                </label>
                <Input
                  placeholder="Ex.: volante, ABC-123… (mín. 2 caracteres)"
                  className="text-sm"
                  value={destaqueSearch}
                  onChange={(e) => setDestaqueSearch(e.target.value)}
                  disabled={loadingFeaturedAdd}
                />
                {destaqueSearching ? (
                  <p className="text-xs text-muted-foreground flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> A pesquisar…
                  </p>
                ) : destaqueNoResults ? (
                  <p className="text-xs text-muted-foreground">Nenhum resultado. Confirme que o produto está publicado na loja.</p>
                ) : null}
                {destaqueHits.length > 0 && (
                  <ul className="max-h-56 overflow-y-auto rounded-lg border border-border bg-muted/30 text-sm divide-y divide-border">
                    {destaqueHits.map((h) => {
                      const already = featuredRows.some((r) => r.produto_id === h.id)
                      return (
                        <li key={h.id} className="flex items-center justify-between gap-2 px-3 py-2">
                          <div className="min-w-0">
                            <p className="font-medium truncate">{h.nome || '(sem nome)'}</p>
                            <p className="text-[11px] text-muted-foreground font-mono truncate">{h.sku || h.id}</p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="shrink-0"
                            disabled={loadingFeaturedAdd || already}
                            onClick={() => void addFeaturedFromSearch(h.id)}
                          >
                            {already ? 'Já na lista' : loadingFeaturedAdd ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Adicionar'}
                          </Button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Ou cole identificador direto:</p>
              <div className="flex flex-wrap gap-2 items-center">
                <Input
                  placeholder="UUID ou slug do produto (publicado)"
                  className="text-xs flex-1 min-w-[220px]"
                  value={draftFeaturedRef}
                  onChange={(e) => setDraftFeaturedRef(e.target.value)}
                />
                <Button type="button" variant="secondary" disabled={loadingFeaturedAdd} onClick={() => void addFeaturedProduct()}>
                  {loadingFeaturedAdd ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Adicionar'}
                </Button>
              </div>
              {loading ? (
                <p className="text-sm text-muted-foreground">A carregar…</p>
              ) : featuredRows.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">Nenhum produto fixo — a landing usa os 8 primeiros da loja.</p>
              ) : (
                <ul className="space-y-2">
                  {featuredRows.map((row, idx) => (
                    <li
                      key={row.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 bg-muted/20"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{row.nome || row.produto_id}</p>
                        <p className="text-[11px] text-muted-foreground font-mono truncate">{row.sku || row.produto_id}</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button size="icon" variant="ghost" type="button" onClick={() => void moveFeatured(idx, -1)}>
                          <ChevronUp className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" type="button" onClick={() => void moveFeatured(idx, 1)}>
                          <ChevronDown className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="destructive" type="button" onClick={() => void removeFeatured(row.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="categories" className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Escolhe quais <strong>categorias de peças</strong> aparecem no site público <code className="text-xs bg-muted px-1 rounded">/site</code>:
            um bloco após a faixa de confiança e outro <strong>abaixo do mapa</strong>. Até {MAX_CATEGORIES_PER_BLOCK} por bloco.
          </p>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Títulos das secções</CardTitle>
              <p className="text-xs text-muted-foreground">Textos dos títulos visíveis na landing (ex.: Departamentos, Linhas de produto).</p>
            </CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold">Bloco 1 (após confiança)</label>
                <Input
                  value={marketingConfig.titulo_categorias_grupo1}
                  onChange={(e) => setMarketingConfig((m) => ({ ...m, titulo_categorias_grupo1: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold">Bloco 2 (abaixo do mapa)</label>
                <Input
                  value={marketingConfig.titulo_categorias_grupo2}
                  onChange={(e) => setMarketingConfig((m) => ({ ...m, titulo_categorias_grupo2: e.target.value }))}
                />
              </div>
              <div className="sm:col-span-2">
                <Button type="button" onClick={() => void saveMarketingConfig()}>
                  Guardar títulos
                </Button>
              </div>
            </CardContent>
          </Card>
          {loading ? (
            <p className="text-sm text-muted-foreground">A carregar categorias…</p>
          ) : (
            <div className="grid lg:grid-cols-2 gap-6">
              {renderCategoryBlock(
                1,
                'Bloco 1 — Departamentos',
                'Aparece no topo do conteúdo, depois da faixa verde/azul de confiança. Se ficar vazio, a landing usa automaticamente as primeiras 8 categorias (ordem alfabética).'
              )}
              {renderCategoryBlock(
                2,
                'Bloco 2 — Abaixo da localização',
                'Secção extra de categorias depois do mapa “Onde estamos”. Só aparece no site se tiver pelo menos uma categoria aqui.'
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground">
        SQL base: <code className="bg-muted px-1 rounded">supabase/migrations/20260322120000_landing_marketing.sql</code>. Slides produto:{' '}
        <code className="bg-muted px-1 rounded">20260323120000_landing_slides_product_type.sql</code>. Categorias curadas:{' '}
        <code className="bg-muted px-1 rounded">20260324120000_landing_marketing_categories.sql</code>. Destaques + sucatas:{' '}
        <code className="bg-muted px-1 rounded">updates_v111_landing_destaques_sucatas.sql</code>.
      </p>
    </div>
  )
}
