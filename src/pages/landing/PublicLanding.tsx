import { useEffect, useState, useCallback, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  ShoppingCart,
  Store,
  ChevronLeft,
  ChevronRight,
  Shield,
  Truck,
  CreditCard,
  BadgeCheck,
  Package,
  Phone,
  Instagram,
  Facebook,
  Cookie,
  MapPin,
  ExternalLink,
  Car,
  Mail,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api'
import type { LandingSlide, LandingPromoTile } from '@/lib/landingTypes'
import { getStoreGoogleMapsUrl, getStoreMapEmbedUrl, STORE_LOCATION } from '@/lib/storeLocation'
import { cn } from '@/lib/utils'
import { storeProductDetailLink } from '@/lib/storeProductPath'
import { toast } from 'sonner'
import { getApiBaseUrl } from '@/lib/apiBase'
import {
  STORE_ACCENT,
  STORE_ACCENT_FG,
  STORE_NAVY,
  STORE_NAVY_DARK,
  STORE_NAVY_LIGHT,
  STORE_PUBLIC_SCOPE_CLASS
} from '@/store/storeTheme'

/** Tema vitrine: Padrão PitStop — Marinho e Verde Limão */
const ACCENT = STORE_ACCENT
const PAGE_BG = '#F4F7F9'
const SURFACE = '#FFFFFF'
const PRIMARY = STORE_NAVY
const NAVY_DARK = STORE_NAVY_DARK

/** Dados resolvidos da API da loja para slide tipo produto */
type SlideProductInfo = {
  id: string
  nome: string
  slug?: string | null
  imagem_url?: string | null
  descricao?: string | null
  public_price?: number
  preco?: number
}

const TRUST_DEFAULT = [
  { icon: Truck, text: 'Entrega combinada com a loja' },
  { icon: CreditCard, text: 'Parcelamento no cartão' },
  { icon: Shield, text: 'Compra segura' },
  { icon: BadgeCheck, text: 'Peças com garantia' },
  { icon: Package, text: 'Grandes marcas' },
]

/** Dados cadastrais exibidos no rodapé (LGPD / transparência) */
const STORE_LEGAL = {
  nomeFantasia: 'Dourados Auto Peças',
  razaoSocial: 'Leandro B Leal Auto Peças Eireli Ltda',
  logradouro: 'Av. Marcelino Pires, 5235',
  cidadeUf: 'Dourados/MS',
  /** CNPJ sem máscara → exibição formatada */
  cnpjFormatado: '21.894.110/0001-14',
  emailContato: 'pecasdourados@hotmail.com',
} as const

/** Nome da cidade em destaque no hero (painel “conheça a loja”) */
const STORE_CITY_HERO = STORE_LEGAL.cidadeUf.split('/')[0]?.trim().toUpperCase() || 'DOURADOS'

function formatStoreAddressLines(full: string): { line1: string; line2: string } {
  const parts = full.split(/\s-\s/).map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) return { line1: full, line2: '' }
  if (parts.length === 1) return { line1: parts[0]!, line2: '' }
  return { line1: parts[0]!, line2: parts.slice(1).join(' · ') }
}

export type SucataVitrineItem = {
  id: string
  codigo: string
  marca: string
  modelo: string
  ano_fabricacao: number | null
  ano_modelo: number | null
  cor: string | null
  combustivel: string | null
  status: string
  foto_url: string | null
  local_armazenagem: string | null
  condicao: string | null
  km_entrada: number | null
}

/** Direção do carrossel: avanço (imagem sai à esquerda) ou retrocesso. */
function carouselStepDirection(from: number, to: number, len: number): 1 | -1 {
  if (len <= 1) return 1
  const forward = (to - from + len) % len
  const backward = (from - to + len) % len
  return forward <= backward ? 1 : -1
}

const heroSlideImgVariants = {
  enter: (dir: 1 | -1) => ({
    x: dir === 1 ? '100%' : '-100%',
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (dir: 1 | -1) => ({
    x: dir === 1 ? '-100%' : '100%',
    opacity: 0,
  }),
}

const GROUP_IMAGES: Record<string, string> = {
  'Motor': '/images/groups/motor.png',
  'Injeção': '/images/groups/injecao.png',
  'Arrefecimento': '/images/groups/arrefecimento.png',
  'Transmissão': '/images/groups/transmissao.png',
  'Suspensão': '/images/groups/suspensao.png',
  'Elétrica': '/images/groups/eletrica.png',
  'Freios': '/images/groups/freios.png',
  'Lataria': '/images/groups/lataria.png',
  'Carroceria': '/images/groups/carroceria.png',
  'Ar Condicionado': '/images/groups/ar-condicionado.png',
  'Direção': '/images/groups/direcao.png',
  'Peças Exterior': '/images/groups/exterior.png',
  'Peças Interior': '/images/groups/interior.png',
  'Outro': '/images/groups/outro.png',
}

type CategoryGroup = {
  nome: string
  imagem: string
  categories: { id: string; nome: string; imagem_url?: string }[]
}

function whatsappHref(): string {
  const raw = import.meta.env.VITE_WHATSAPP_CONTACT || STORE_LOCATION.whatsappNumber
  const d = String(raw).replace(/\D/g, '')
  const text = encodeURIComponent('Olá! Vim pelo site Auto Peças Dourados.')
  return `https://wa.me/${d}?text=${text}`
}

function CategoryGridSection({
  title,
  groups,
  subtleBg,
}: {
  title: string
  groups: CategoryGroup[]
  subtleBg?: boolean
}) {
  const [selectedGroup, setSelectedGroup] = useState<CategoryGroup | null>(null)

  if (groups.length === 0) return null

  return (
    <section
      className={cn(
        'max-w-[1400px] mx-auto px-4 py-24',
        subtleBg ? 'bg-[#F9F9F9] border-y border-gray-100' : 'bg-transparent'
      )}
    >
      <div className="flex flex-col items-center mb-16">
        <h2 className="text-center font-black italic uppercase tracking-tighter text-4xl mb-4" style={{ color: PRIMARY }}>
          {selectedGroup ? (
            <>
              Grupo <span style={{ color: ACCENT }}>{selectedGroup.nome}</span>
            </>
          ) : (
            <>
              Navegue por <span style={{ color: ACCENT }}>Categorias</span>
            </>
          )}
        </h2>
        <div className="h-1.5 w-24 rounded-full" style={{ backgroundColor: ACCENT }} />
        {selectedGroup && (
          <button
            onClick={() => setSelectedGroup(null)}
            className="mt-6 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-primary transition-colors flex items-center gap-2"
          >
            <ChevronLeft className="w-4 h-4" />
            Voltar para Grupos
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {!selectedGroup ? (
          <motion.div
            key="groups"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-8"
          >
            {groups.map((g) => (
              <button
                key={g.nome}
                onClick={() => setSelectedGroup(g)}
                className="flex flex-col items-center group"
              >
                <div className="relative w-full aspect-square rounded-[2.5rem] bg-white border-2 border-white shadow-lg group-hover:shadow-2xl group-hover:border-accent group-hover:-translate-y-2 transition-all duration-500 overflow-hidden mb-6 flex items-center justify-center p-4">
                  <img
                    src={g.imagem}
                    alt={g.nome}
                    className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-700"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/images/groups/outro.png'
                    }}
                  />
                </div>
                <span className="text-xs font-black text-center text-slate-600 uppercase tracking-[0.1em] group-hover:text-primary transition-colors">
                  {g.nome}
                </span>
              </button>
            ))}
          </motion.div>
        ) : (
          <motion.div
            key="categories"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-6"
          >
            {selectedGroup.categories.map((c) => (
              <Link
                key={c.id}
                to={`/?category=${encodeURIComponent(c.id)}`}
                className="flex flex-col items-center p-6 rounded-[2rem] border-2 border-white bg-white shadow-sm hover:shadow-2xl hover:border-accent hover:-translate-y-2 transition-all duration-300 group"
              >
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 bg-slate-50 group-hover:bg-accent/10 transition-colors overflow-hidden p-1.5">
                  {c.imagem_url ? (
                    <img 
                      src={c.imagem_url} 
                      alt={c.nome} 
                      className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-500" 
                    />
                  ) : (
                    <Package className="w-6 h-6 text-primary group-hover:scale-110 transition-transform" />
                  )}
                </div>
                <span className="text-[10px] font-black text-center text-slate-500 uppercase tracking-widest leading-tight group-hover:text-primary">
                  {c.nome}
                </span>
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

export function PublicLanding() {
  const [slides, setSlides] = useState<LandingSlide[]>([])
  const [tiles, setTiles] = useState<LandingPromoTile[]>([])
  const [slideIdx, setSlideIdx] = useState(0)
  const [slideDir, setSlideDir] = useState<1 | -1>(1)
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([])
  const [categoriesTop, setCategoriesTop] = useState<{ id: string; nome: string }[]>([])
  const [categoriesBottom, setCategoriesBottom] = useState<{ id: string; nome: string }[]>([])
  const [catTitles, setCatTitles] = useState({ titulo1: 'Departamentos', titulo2: 'Linhas de produto' })
  const [sectionTitles, setSectionTitles] = useState({
    destaque: 'Destaques da loja',
    sucatas: 'Sucatas no pátio',
  })
  const [landingTab, setLandingTab] = useState<'inicio' | 'sucatas'>('inicio')
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [visibleCards, setVisibleCards] = useState(4)
  const [isPaused, setIsPaused] = useState(false)
  const [sucatasList, setSucatasList] = useState<SucataVitrineItem[]>([])
  const [loadingSucatas, setLoadingSucatas] = useState(false)
  const [news, setNews] = useState({ nome: '', email: '', telefone: '', lgpd: false })
  const [slideProducts, setSlideProducts] = useState<Record<string, SlideProductInfo>>({})

  const carouselItems = useMemo(() => {
    const list = products.slice(0, 5)
    if (list.length > 0) {
      return [...list, { id: 'banner-card', isBanner: true }]
    }
    return list
  }, [products])

  const resolveImageUrl = useCallback((url?: string | null) => {
    if (!url) return ''
    let resolved = url
    if (resolved.includes('minio') || resolved.includes('douradosap.com.br') || resolved.includes('easypanel')) {
      if (!resolved.startsWith('/api')) {
        resolved = `/api/store/media?url=${encodeURIComponent(resolved)}`
      }
    }
    if (resolved.startsWith('/api')) {
      return `${getApiBaseUrl()}${resolved}`
    }
    return resolved
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [slidesList, tilesList, slotsList, cfgRow, catsAll] = await Promise.all([
        api.get('/api/landing/slides'),
        api.get('/api/landing/promo-tiles'),
        api.get('/api/landing/category-slots'),
        api.get('/api/landing/marketing-config'),
        api.get('/api/configuracoes/categorias'),
      ])
      setSlides((Array.isArray(slidesList) ? slidesList : []) as LandingSlide[])
      setTiles((Array.isArray(tilesList) ? tilesList : []) as LandingPromoTile[])

      if (cfgRow && typeof cfgRow === 'object') {
        const c = cfgRow as Record<string, string | undefined>
        setCatTitles({
          titulo1: c.titulo_categorias_grupo1?.trim() || 'Departamentos',
          titulo2: c.titulo_categorias_grupo2?.trim() || 'Linhas de produto',
        })
        setSectionTitles({
          destaque: c.titulo_destaque_loja?.trim() || 'Destaques da loja',
          sucatas: c.titulo_sucatas_landing?.trim() || 'Sucatas no pátio',
        })
      }

      const slots = Array.isArray(slotsList) ? slotsList : []
      const g1 = slots.filter((x: { grupo: number }) => x.grupo === 1).sort((a: { ordem: number }, b: { ordem: number }) => a.ordem - b.ordem)
      const g2 = slots.filter((x: { grupo: number }) => x.grupo === 2).sort((a: { ordem: number }, b: { ordem: number }) => a.ordem - b.ordem)
      const ids = [...new Set([...g1.map((x: { categoria_id: string }) => x.categoria_id), ...g2.map((x: { categoria_id: string }) => x.categoria_id)])]

      const allCats = ((Array.isArray(catsAll) ? catsAll : []) as { id: string; nome: string; grupo?: string; imagem_url?: string }[]).map(c => ({
        ...c,
        imagem_url: resolveImageUrl(c.imagem_url)
      }))
      
      // Agrupamento por campo 'grupo'
      const groupsMap: Record<string, { id: string; nome: string; imagem_url?: string }[]> = {}
      allCats.forEach(c => {
        const g = c.grupo?.trim() || 'Outro'
        if (!groupsMap[g]) groupsMap[g] = []
        groupsMap[g].push(c)
      })

      const mainGroups: CategoryGroup[] = Object.keys(groupsMap)
        .map(g => ({
          nome: g,
          imagem: GROUP_IMAGES[g] || GROUP_IMAGES['Outro'],
          categories: groupsMap[g].sort((a, b) => a.nome.localeCompare(b.nome))
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome))

      setCategoryGroups(mainGroups)

      const fallback = allCats.slice(0, 8)
      if (ids.length === 0) {
        setCategoriesTop(fallback)
        setCategoriesBottom([])
      } else {
        const map = new Map(allCats.map((c) => [c.id, c]))
        setCategoriesTop(
          g1.length > 0
            ? (g1.map((s: { categoria_id: string }) => map.get(s.categoria_id)).filter(Boolean) as { id: string; nome: string }[])
            : fallback
        )
        setCategoriesBottom(
          g2.length > 0
            ? (g2.map((s: { categoria_id: string }) => map.get(s.categoria_id)).filter(Boolean) as { id: string; nome: string }[])
            : []
        )
      }
    } catch (e) {
      console.warn('Landing: tabelas podem não existir ainda — execute a migration SQL.', e)
      try {
        const cats = await api.get('/api/configuracoes/categorias')
        const arr = ((Array.isArray(cats) ? cats : []) as { id: string; nome: string; grupo?: string; imagem_url?: string }[]).map(c => ({
          ...c,
          imagem_url: resolveImageUrl(c.imagem_url)
        }))
        
        const groupsMap: Record<string, { id: string; nome: string; imagem_url?: string }[]> = {}
        arr.forEach(c => {
          const g = c.grupo?.trim() || 'Outro'
          if (!groupsMap[g]) groupsMap[g] = []
          groupsMap[g].push(c)
        })

        const mainGroups: CategoryGroup[] = Object.keys(groupsMap)
          .map(g => ({
            nome: g,
            imagem: GROUP_IMAGES[g] || GROUP_IMAGES['Outro'],
            categories: groupsMap[g].sort((a, b) => a.nome.localeCompare(b.nome))
          }))
          .sort((a, b) => a.nome.localeCompare(b.nome))

        setCategoryGroups(mainGroups)
        setCategoriesTop(arr.slice(0, 8))
        setCategoriesBottom([])
      } catch {
        /* ignore */
      }
    }
    try {
      let orderedIds: string[] = []
      try {
        const destRows = await api.get('/api/landing/destaque-produtos')
        if (Array.isArray(destRows) && destRows.length) {
          orderedIds = (destRows as { produto_id: string }[]).map((r) => r.produto_id)
        }
      } catch {
        orderedIds = []
      }
      
      let fetchedProducts: any[] = []
      if (orderedIds.length > 0) {
        const q = orderedIds.map(encodeURIComponent).join(',')
        const res = await fetch(`${getApiBaseUrl()}/api/store/products/featured?ids=${q}`)
        const json = await res.json()
        if (res.ok && json.products?.length) {
          fetchedProducts = json.products
        }
      }
      
      if (fetchedProducts.length === 0) {
        const res = await fetch(`${getApiBaseUrl()}/api/store/products?limit=40&page=1`)
        const json = await res.json()
        if (res.ok && json.products) {
          fetchedProducts = json.products
        }
      }

      // Filter products: only price > 0 (resolve image URLs)
      const filtered = fetchedProducts.map((p: any) => ({
        ...p,
        imagem_url: resolveImageUrl(p.imagem_url)
      })).filter((p: any) => {
        const price = Number(p.public_price || p.preco || 0)
        return price > 0
      })
      setProducts(filtered)
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Adjust visible cards on resize
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 640) {
        setVisibleCards(1)
      } else if (window.innerWidth < 768) {
        setVisibleCards(2)
      } else if (window.innerWidth < 1024) {
        setVisibleCards(3)
      } else {
        setVisibleCards(4)
      }
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Auto-play product carousel
  useEffect(() => {
    if (carouselItems.length <= visibleCards || isPaused) return
    const interval = setInterval(() => {
      setCurrentIndex((prev) => {
        const maxIndex = carouselItems.length - visibleCards
        if (prev >= maxIndex) {
          return 0
        }
        return prev + 1
      })
    }, 4000)
    return () => clearInterval(interval)
  }, [carouselItems.length, visibleCards, isPaused])

  // Reset index if out of bounds on product changes
  useEffect(() => {
    if (carouselItems.length > 0) {
      const maxIndex = Math.max(0, carouselItems.length - visibleCards)
      if (currentIndex > maxIndex) {
        setCurrentIndex(maxIndex)
      }
    }
  }, [carouselItems.length, visibleCards, currentIndex])

  useEffect(() => {
    if (landingTab !== 'sucatas') return
    let cancelled = false
    ;(async () => {
      setLoadingSucatas(true)
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/store/sucatas-vitrine`)
        const json = await res.json()
        if (!cancelled && res.ok) setSucatasList(json.sucatas || [])
        else if (!cancelled) setSucatasList([])
      } catch {
        if (!cancelled) setSucatasList([])
      } finally {
        if (!cancelled) setLoadingSucatas(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [landingTab])

  /** Carrega dados dos produtos usados nos slides (tipo produto) */
  useEffect(() => {
    const ids = [
      ...new Set(
        slides
          .filter((s) => (s.slide_type ?? 'image') === 'product' && s.produto_id)
          .map((s) => s.produto_id as string)
      ),
    ]
    if (ids.length === 0) {
      setSlideProducts({})
      return
    }
    let cancelled = false
    ;(async () => {
      const next: Record<string, SlideProductInfo> = {}
      await Promise.all(
        ids.map(async (id) => {
          try {
            const res = await fetch(`${getApiBaseUrl()}/api/store/products/${encodeURIComponent(id)}`)
            if (!res.ok) return
            const p = await res.json()
            next[id] = {
              id: p.id,
              nome: p.nome,
              slug: p.slug,
              imagem_url: resolveImageUrl(p.imagem_url),
              descricao: p.descricao,
              public_price: p.public_price ?? p.preco,
              preco: p.preco,
            }
          } catch {
            /* ignore */
          }
        })
      )
      if (!cancelled) setSlideProducts(next)
    })()
    return () => {
      cancelled = true
    }
  }, [slides])

  useEffect(() => {
    setSlideIdx((i) => (slides.length === 0 ? 0 : Math.min(i, Math.max(0, slides.length - 1))))
  }, [slides.length])

  const intervalMs = slides[slideIdx]?.intervalo_segundos
    ? slides[slideIdx]!.intervalo_segundos * 1000
    : 6000

  useEffect(() => {
    if (slides.length <= 1) return
    const len = slides.length
    const t = window.setInterval(() => {
      setSlideDir(1)
      setSlideIdx((i) => (i + 1) % len)
    }, intervalMs)
    return () => clearInterval(t)
  }, [slides.length, intervalMs, slideIdx])

  const submitNews = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!news.email.trim()) {
      toast.error('Informe o e-mail.')
      return
    }
    if (!news.lgpd) {
      toast.error('Marque a caixa de aceite (acima do botão Cadastrar) para continuar.')
      return
    }
    try {
      await api.post('/api/landing/newsletter-leads', {
        nome: news.nome.trim() || null,
        email: news.email.trim(),
        telefone: news.telefone.replace(/\D/g, '') || null,
        lgpd_aceito: true,
      })
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao cadastrar')
      return
    }
    toast.success('Inscrição registrada!')
    setNews({ nome: '', email: '', telefone: '', lgpd: false })
  }


  const hero = slides.length > 0 && slideIdx < slides.length ? slides[slideIdx] : null
  const heroProduct = hero?.produto_id ? slideProducts[hero.produto_id] : undefined
  const isProductSlide = (hero?.slide_type ?? 'image') === 'product' && !!hero?.produto_id
  const heroBgUrl =
    isProductSlide && heroProduct?.imagem_url
      ? heroProduct.imagem_url
      : resolveImageUrl(hero?.imagem_url || '')
  
  const heroTitle = (isProductSlide ? heroProduct?.nome : hero?.titulo) || 'Auto Peças Dourados'
  const heroSub =
    (isProductSlide && heroProduct?.descricao
      ? String(heroProduct.descricao).slice(0, 160) + (String(heroProduct.descricao).length > 160 ? '…' : '')
      : hero?.subtitulo) || null

  const heroPrice =
    isProductSlide && heroProduct && (heroProduct.public_price != null || heroProduct.preco != null)
      ? Number(heroProduct.public_price ?? heroProduct.preco ?? 0)
      : null
  const heroLink =
    hero?.cta_link?.trim() ||
    (isProductSlide && heroProduct ? storeProductDetailLink(heroProduct) : '/')

  const storeAddressFmt = formatStoreAddressLines(STORE_LOCATION.fullAddress)
  const storeTelHref = `tel:+55${STORE_LOCATION.phoneDisplay.replace(/\D/g, '')}`

  return (
    <div
      className={`min-h-screen font-sans text-gray-900 ${STORE_PUBLIC_SCOPE_CLASS}`}
      style={{ backgroundColor: PAGE_BG }}
    >
      {/* Header Estilo Premium */}
      <header
        className="sticky top-0 z-50 border-b border-white/5 shadow-2xl transition-all duration-300"
        style={{ backgroundColor: NAVY_DARK }}
      >
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-20 sm:h-24 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-3 shrink-0 group">
            <div
              className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center bg-white shadow-[0_0_20px_rgba(182,212,51,0.2)] group-hover:scale-105 transition-transform p-1.5"
            >
              <img src="/assets/logo-dourados.png" alt="Dourados Auto Peças" className="h-full w-full object-contain" />
            </div>
            <div className="leading-tight">
              <p className="font-black text-white text-xl sm:text-2xl tracking-tighter uppercase italic">
                Dourados<span style={{ color: ACCENT }}>AutoPeças</span>
              </p>
              <div className="flex items-center gap-2">
                <div className="h-1 w-8 rounded-full" style={{ backgroundColor: ACCENT }} />
                <p className="text-[10px] text-white/40 uppercase font-bold tracking-[0.2em]">Premium Store</p>
              </div>
            </div>
          </Link>

          {/* Nav Central */}
          <nav className="hidden lg:flex items-center gap-8 text-sm font-bold uppercase tracking-widest text-white/90">
            <Link to="/" className="hover:text-accent transition-colors">
              Peças Online
            </Link>
            <a href={whatsappHref()} target="_blank" rel="noreferrer" className="hover:text-accent transition-colors">
              Fale Conosco
            </a>
          </nav>

          <div className="flex items-center gap-4">
            <Link to="/checkout">
              <Button
                size="lg"
                className="gap-2 bg-accent hover:bg-white text-primary font-black rounded-full transition-all px-6 border-none"
              >
                <ShoppingCart className="w-5 h-5" />
                <span className="hidden sm:inline">Carrinho</span>
              </Button>
            </Link>
            <Link to="/login" className="text-xs font-bold text-white/50 hover:text-accent hidden sm:inline uppercase tracking-widest">
              Login
            </Link>
          </div>
        </div>
      </header>

      <nav
        className="sticky top-16 z-30 border-b border-white/10 backdrop-blur-md"
        style={{ backgroundColor: 'rgba(0,0,0,0.95)' }}
        aria-label="Seções do site"
      >
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap gap-2 py-2">
          <button
            type="button"
            onClick={() => setLandingTab('inicio')}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-black transition-colors',
              landingTab === 'inicio' ? 'text-black' : 'text-white/75 hover:text-white'
            )}
            style={landingTab === 'inicio' ? { backgroundColor: ACCENT } : { backgroundColor: 'transparent' }}
          >
            Início
          </button>
          <button
            type="button"
            onClick={() => setLandingTab('sucatas')}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-black transition-colors',
              landingTab === 'sucatas' ? 'text-black' : 'text-white/75 hover:text-white'
            )}
            style={landingTab === 'sucatas' ? { backgroundColor: ACCENT } : { backgroundColor: 'transparent' }}
          >
            <Car className="w-4 h-4 shrink-0" />
            {sectionTitles.sucatas}
          </button>
        </div>
      </nav>

      {landingTab === 'inicio' ? (
        <>
          {/* Hero — carrossel Estilo PitStop */}
          <section className="relative overflow-hidden text-white" style={{ backgroundColor: PRIMARY }}>
            {loading ? (
              <div className="h-[340px] flex items-center justify-center text-white/70">Carregando…</div>
            ) : hero ? (
              <>
                <div className="relative z-[1] grid min-h-[380px] sm:min-h-[420px] md:min-h-[460px] lg:min-h-[500px] grid-cols-1 md:grid-cols-[minmax(300px,42%)_1fr]">
                  {/* Painel informações (Navy Blue) */}
                  <div className="relative z-20 order-2 md:order-1 flex flex-col justify-center px-5 sm:px-8 md:pl-10 lg:pl-14 py-10 md:py-12" style={{ backgroundColor: PRIMARY }}>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-6">
                      <span className="inline-block font-black text-[10px] sm:text-xs uppercase tracking-[0.15em] text-[#001A54] px-4 py-2 -skew-x-12 shadow-2xl" style={{ backgroundColor: ACCENT }}>
                        Performance & Qualidade
                      </span>
                    </div>
                    <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black italic text-white leading-[0.85] tracking-tighter mb-6 uppercase">
                      SUA LOJA <br />
                      <span style={{ color: ACCENT }}>DE PEÇAS</span>
                    </h1>
                    
                    {(isProductSlide || (hero?.titulo && hero.titulo.trim())) && (
                      <p className="text-xl sm:text-2xl font-bold text-white mt-2 mb-2 leading-snug">
                        {heroTitle}
                      </p>
                    )}
                    
                    {isProductSlide && heroPrice != null && heroPrice > 0 && (
                      <div className="flex flex-col mb-6">
                        <span className="text-accent font-black text-3xl">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(heroPrice)}
                        </span>
                        <span className="text-white/60 text-xs font-bold uppercase tracking-widest">Preço imbatível no PIX</span>
                      </div>
                    )}
                    
                    {heroSub && (isProductSlide ? true : Boolean(hero?.subtitulo?.trim())) && (
                      <p className="text-sm text-white/70 mb-8 line-clamp-3 max-w-md leading-relaxed">{heroSub}</p>
                    )}

                    <div className="flex flex-wrap gap-4">
                      <Link to={heroLink}>
                        <Button size="lg" className="rounded-full font-black px-10 bg-accent hover:bg-white text-primary border-none shadow-xl transition-all scale-105">
                          {hero.cta_texto || (isProductSlide ? 'Comprar Agora' : 'Confira')}
                        </Button>
                      </Link>
                      <a href={whatsappHref()} target="_blank" rel="noreferrer">
                        <Button variant="outline" size="lg" className="rounded-full font-bold px-8 border-white/20 text-white hover:bg-white/10">
                          WhatsApp
                        </Button>
                      </a>
                    </div>
                  </div>

                  {/* Coluna imagem */}
                  <div className="relative order-1 md:order-2 min-h-[240px] sm:min-h-[320px] md:min-h-0 md:min-h-full w-full overflow-hidden bg-[#0a0a0a]">
                    {heroBgUrl ? (
                      <AnimatePresence initial={false} custom={slideDir} mode="sync">
                        <motion.div
                          key={slideIdx}
                          custom={slideDir}
                          variants={heroSlideImgVariants}
                          initial="enter"
                          animate="center"
                          exit="exit"
                          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                          className="absolute inset-0"
                        >
                          <img src={heroBgUrl} alt="" className="absolute inset-0 h-full w-full object-cover object-center" />
                          <div className="absolute inset-y-0 left-0 w-[min(100%,52%)] md:w-[48%] pointer-events-none z-[1]" style={{ background: 'linear-gradient(90deg, #000000 0%, rgba(0,0,0,0.92) 18%, rgba(0,0,0,0.45) 55%, transparent 100%)' }} />
                          <div className="absolute inset-y-0 left-0 w-[42%] md:w-[38%] z-[2] pointer-events-none backdrop-blur-md md:backdrop-blur-xl" style={{ WebkitMaskImage: 'linear-gradient(90deg, #000 0%, #000 42%, transparent 100%)', maskImage: 'linear-gradient(90deg, #000 0%, #000 42%, transparent 100%)' }} />
                        </motion.div>
                      </AnimatePresence>
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a] via-black to-[#111]" aria-hidden />
                    )}
                  </div>
                </div>

                {slides.length > 1 && (
                  <>
                    <button type="button" className="absolute left-2 top-1/2 -translate-y-1/2 z-[30] p-2 rounded-full bg-black/50 hover:bg-black/70 border border-white/15 text-white" aria-label="Anterior" onClick={() => { setSlideDir(-1); setSlideIdx((i) => (i - 1 + slides.length) % slides.length); }}>
                      <ChevronLeft className="w-6 h-6" />
                    </button>
                    <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 z-[30] p-2 rounded-full bg-black/50 hover:bg-black/70 border border-white/15 text-white" aria-label="Próximo" onClick={() => { setSlideDir(1); setSlideIdx((i) => (i + 1) % slides.length); }}>
                      <ChevronRight className="w-6 h-6" />
                    </button>
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[30] flex gap-2">
                      {slides.map((_, i) => (
                        <button key={i} type="button" className={cn('w-2 h-2 rounded-full transition-colors', i === slideIdx ? '' : 'bg-white/40')} style={i === slideIdx ? { backgroundColor: ACCENT } : undefined} onClick={() => { setSlideDir(carouselStepDirection(slideIdx, i, slides.length)); setSlideIdx(i); }} aria-label={`Slide ${i + 1}`} />
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="max-w-7xl mx-auto px-4 py-16 text-center">
                <h1 className="text-3xl sm:text-4xl font-black mb-4 text-white">Auto Peças Dourados</h1>
                <p className="text-white/90 mb-8 max-w-lg mx-auto">Configure os slides em Marketing no painel interno.</p>
                <Link to="/"><Button size="lg" className="rounded-full font-black border-0 text-black hover:opacity-90" style={{ backgroundColor: ACCENT }}>Ir à loja</Button></Link>
              </div>
            )}
          </section>

          {/* Trust */}
          <div className="py-6 border-b border-black/5" style={{ backgroundColor: NAVY_DARK }}>
            <div className="max-w-[1400px] mx-auto px-4 flex flex-wrap justify-center gap-8 sm:gap-16 text-[10px] sm:text-xs font-black uppercase tracking-[0.2em]">
              {TRUST_DEFAULT.map((t, i) => (
                <div key={i} className="flex items-center gap-3 text-white/90 group cursor-default">
                  <div className="p-2 rounded-lg bg-white/5 group-hover:bg-accent/20 transition-colors">
                    <t.icon className="w-5 h-5 shrink-0" style={{ color: ACCENT }} />
                  </div>
                  <span className="group-hover:text-white transition-colors">{t.text}</span>
                </div>
              ))}
            </div>
          </div>

          <CategoryGridSection title={catTitles.titulo1} groups={categoryGroups} />

          {/* Promo dupla */}
          {tiles.filter((x) => x.imagem_url).length > 0 && (
            <section className="max-w-[1400px] mx-auto px-4 py-8 grid md:grid-cols-2 gap-6">
              {tiles.filter((x) => x.imagem_url).slice(0, 2).map((tile) => (
                <Link key={tile.id} to={tile.cta_link || '/'} className="relative rounded-[2.5rem] overflow-hidden min-h-[240px] group border-4 border-white shadow-xl">
                  <img src={tile.imagem_url!} alt="" className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#001A54] via-[#001A54]/40 to-transparent opacity-80" />
                  <div className="absolute inset-0 p-8 flex flex-col justify-end">
                    {tile.titulo && <h3 className="font-black italic uppercase tracking-tighter text-white text-3xl mb-2">{tile.titulo}</h3>}
                    {tile.subtitulo && <p className="text-sm font-bold text-white/80 mb-6 uppercase tracking-widest">{tile.subtitulo}</p>}
                    <div className="flex">
                      <span className="inline-block rounded-full text-[10px] font-black uppercase tracking-widest px-8 py-3 text-[#001A54] shadow-2xl group-hover:scale-105 transition-transform" style={{ backgroundColor: ACCENT }}>{tile.cta_texto || 'Confira Agora'}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </section>
          )}

          {/* Produtos */}
          <section className="max-w-[1400px] mx-auto px-4 py-20">
            <div className="flex flex-col items-center mb-16">
               <h2 className="text-center font-black italic uppercase tracking-tighter text-4xl mb-4" style={{ color: PRIMARY || '#001A54' }}>
                 {(sectionTitles.destaque || 'Destaques').split(' ')[0]} <span style={{ color: ACCENT }}>{(sectionTitles.destaque || '').split(' ').slice(1).join(' ')}</span>
               </h2>
               <div className="h-1.5 w-24 rounded-full" style={{ backgroundColor: ACCENT }} />
            </div>

            {/* Carousel Wrapper */}
            <div 
              className="relative px-4 sm:px-8"
              onMouseEnter={() => setIsPaused(true)}
              onMouseLeave={() => setIsPaused(false)}
            >
              {/* Overflow Hidden cont                 <div 
                  className="flex transition-transform duration-500 ease-out"
                  style={{ 
                    transform: `translateX(-${currentIndex * (100 / visibleCards)}%)`,
                    width: `${(carouselItems.length / visibleCards) * 100}%`
                  }}
                >
                  {carouselItems.map((item) => {
                    if ('isBanner' in item && item.isBanner) {
                      return (
                        <div 
                          key="banner-card" 
                          style={{ width: `${100 / carouselItems.length}%` }} 
                          className="px-3"
                        >
                          <Link 
                            to="/" 
                            className="group flex flex-col bg-white rounded-[2.5rem] h-full overflow-hidden border border-slate-100 shadow-lg hover:shadow-2xl hover:-translate-y-2 transition-all duration-300"
                          >
                            <div className="relative aspect-[4/3] bg-slate-50 overflow-hidden flex items-center justify-center flex-1">
                              <img 
                                src="/assets/banner-loja.png" 
                                alt="Ir para a loja online" 
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                              />
                            </div>
                          </Link>
                        </div>
                      )
                    }

                    const p = item as any
                    return (
                      <div 
                        key={p.id} 
                        style={{ width: `${100 / carouselItems.length}%` }} 
                        className="px-3"
                      >
                        <Link 
                          to={storeProductDetailLink(p)} 
                          className="group flex flex-col bg-white rounded-[2.5rem] h-full overflow-hidden border border-slate-100 shadow-lg hover:shadow-2xl hover:-translate-y-2 transition-all duration-300"
                        >
                          <div className="relative aspect-[4/3] bg-slate-50 overflow-hidden p-6 flex items-center justify-center">
                            {p.imagem_url ? (
                              <img 
                                src={p.imagem_url} 
                                alt="" 
                                className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-500" 
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-slate-200">
                                <Package className="w-12 h-12" />
                              </div>
                            )}
                            <div className="absolute top-4 left-4">
                              <Badge className="bg-[#001A54] text-white font-black border-none text-[9px] uppercase tracking-widest px-3 py-1 rounded-full shadow-md">
                                Premium
                              </Badge>
                            </div>
                          </div>
                          <div className="p-8 flex flex-col flex-1">
                            <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mb-2">
                              {p.marca || 'Original'}
                            </p>
                            <h3 className="text-base font-black text-slate-800 line-clamp-2 leading-tight mb-6 group-hover:text-primary transition-colors uppercase italic tracking-tight">
                              {p.nome}
                            </h3>
                            <div className="mt-auto">
                              <div className="flex items-baseline gap-1">
                                 <span className="text-xs font-bold text-slate-400">R$</span>
                                 <p className="text-3xl font-black text-[#001A54] tracking-tighter">
                                   {(() => {
                                     const val = Number(p.public_price || p.preco || 0);
                                     const fmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(val);
                                     const [int, dec] = fmt.split(',');
                                     return <>{int}<span className="text-lg">,{dec || '00'}</span></>;
                                   })()}
                                 </p>
                              </div>
                              <div className="mt-6 pt-6 border-t border-slate-50 flex items-center justify-between">
                                 <div className="flex items-center gap-2 text-[#B6D433] font-black text-[9px] uppercase tracking-widest">
                                   <Truck className="w-3.5 h-3.5" />
                                   Pronta Entrega
                                 </div>
                                 <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-[#B6D433] transition-all">
                                   <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-[#001A54] transition-colors" />
                                 </div>
                              </div>
                            </div>
                          </div>
                        </Link>
                      </div>
                    )
                  })}
                </div>
              </div>
  
              {/* Navigation Controls */}
              {carouselItems.length > visibleCards && (
                <>
                  <button
                    onClick={() => {
                      setCurrentIndex((prev) => (prev === 0 ? carouselItems.length - visibleCards : prev - 1))
                    }}
                    className="absolute -left-2 sm:-left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white shadow-xl border border-slate-100 flex items-center justify-center hover:bg-[#B6D433] hover:text-[#001A54] hover:scale-110 active:scale-95 text-slate-600 transition-all z-10"
                    aria-label="Anterior"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <button
                    onClick={() => {
                      setCurrentIndex((prev) => (prev >= carouselItems.length - visibleCards ? 0 : prev + 1))
                    }}
                    className="absolute -right-2 sm:-right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white shadow-xl border border-slate-100 flex items-center justify-center hover:bg-[#B6D433] hover:text-[#001A54] hover:scale-110 active:scale-95 text-slate-600 transition-all z-10"
                    aria-label="Próximo"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </>
              )}
            </div>
  
            {/* Dots indicators */}
            {carouselItems.length > visibleCards && (
              <div className="flex justify-center gap-2 mt-8">
                {Array.from({ length: Math.ceil(carouselItems.length / visibleCards) }).map((_, idx) => {
                  const targetIndex = Math.min(idx * visibleCards, carouselItems.length - visibleCards)
                  const currentPage = Math.floor(currentIndex / visibleCards)
                  const isActive = currentPage === idx || (idx === Math.ceil(carouselItems.length / visibleCards) - 1 && currentIndex === carouselItems.length - visibleCards)
                  return (
                    <button
                      key={idx}
                      onClick={() => setCurrentIndex(targetIndex)}
                      className={cn(
                        "h-2.5 rounded-full transition-all duration-300",
                        isActive ? "w-8 bg-[#001A54]" : "w-2.5 bg-slate-300 hover:bg-slate-400"
                      )}
                      aria-label={`Página ${idx + 1}`}
                    />
                  )
                })}
              </div>
            )}

            <div className="text-center mt-20">
              <a href="https://www.autopecasdourados.com.br/" target="_blank" rel="noopener noreferrer">
                <Button size="lg" className="h-14 rounded-full px-12 bg-[#001A54] hover:bg-[#B6D433] hover:text-[#001A54] text-white font-black uppercase italic tracking-tighter transition-all shadow-2xl scale-110 active:scale-100">
                  Ver Catálogo Completo
                </Button>
              </a>
            </div>
          </section>

          {/* Mapa */}
          <section className="py-20 bg-white">
            <div className="max-w-[1400px] mx-auto px-4">
              <div className="grid lg:grid-cols-2 gap-16 items-center">
                <div className="space-y-10">
                  <div className="space-y-4">
                    <h2 className="font-black italic uppercase tracking-tighter text-[#001A54] text-5xl flex items-center gap-4">VISITE NOSSA <br /><span style={{ color: ACCENT }}>UNIDADE</span></h2>
                    <div className="h-1.5 w-20 rounded-full" style={{ backgroundColor: ACCENT }} />
                  </div>
                  <div className="space-y-8">
                    <div className="flex items-start gap-5">
                       <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center shrink-0 shadow-inner"><MapPin className="w-6 h-6 text-[#001A54]" /></div>
                       <div><p className="font-black text-[#001A54] text-xl uppercase italic tracking-tight">{STORE_LOCATION.name}</p><p className="text-slate-500 font-bold text-sm mt-1 leading-relaxed max-w-sm">{STORE_LOCATION.fullAddress}</p></div>
                    </div>
                    <div className="flex items-start gap-5">
                       <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center shrink-0 shadow-inner"><Phone className="w-6 h-6 text-[#001A54]" /></div>
                       <div><p className="font-black text-slate-400 text-[10px] uppercase tracking-widest">Atendimento Direto</p><a href={storeTelHref} className="text-[#001A54] font-black text-xl hover:text-[#B6D433] transition-colors">{STORE_LOCATION.phoneDisplay}</a></div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-4 pt-4">
                    <a href={getStoreGoogleMapsUrl()} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-3 px-8 py-4 bg-[#001A54] text-white rounded-full font-black uppercase italic tracking-tighter hover:bg-[#B6D433] hover:text-[#001A54] transition-all shadow-xl"><ExternalLink className="w-5 h-5 shrink-0" />Como Chegar</a>
                  </div>
                </div>
                <div className="relative rounded-[3rem] overflow-hidden border-8 border-white shadow-[0_20px_50px_rgba(0,0,0,0.1)] aspect-video sm:aspect-square lg:aspect-[4/5]">
                  <iframe title={`Mapa — ${STORE_LOCATION.name}`} src={getStoreMapEmbedUrl()} className="absolute inset-0 w-full h-full border-0 grayscale hover:grayscale-0 transition-all duration-700" loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
                </div>
              </div>
            </div>
          </section>

          {/* Newsletter */}
          <section className="py-20 border-t border-black/5" style={{ backgroundColor: NAVY_DARK }}>
            <div className="max-w-[1400px] mx-auto px-4 text-center">
              <div className="max-w-3xl mx-auto">
                <h2 className="font-black italic uppercase tracking-tighter text-3xl mb-4 text-white">FIQUE POR DENTRO DAS <span style={{ color: ACCENT }}>OFERTAS</span></h2>
                <p className="text-white/60 font-bold text-sm mb-10 uppercase tracking-widest">Receba promoções exclusivas e novidades direto no seu e-mail.</p>
                <form onSubmit={submitNews} className="flex flex-col gap-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Input placeholder="Nome Completo" value={news.nome} onChange={(e) => setNews((n) => ({ ...n, nome: e.target.value }))} className="h-14 bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-2xl focus-visible:ring-accent/30" />
                    <Input type="email" placeholder="Seu melhor e-mail" value={news.email} onChange={(e) => setNews((n) => ({ ...n, email: e.target.value }))} className="h-14 bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-2xl focus-visible:ring-accent/30" required />
                    <Button type="submit" className="h-14 rounded-2xl font-black uppercase italic tracking-tighter transition-all shadow-xl" style={{ backgroundColor: ACCENT, color: PRIMARY }}>Cadastrar Agora</Button>
                  </div>
                  <div className="flex items-center justify-center gap-3 text-left">
                    <input id="landing-news-lgpd" type="checkbox" checked={news.lgpd} onChange={(e) => setNews((n) => ({ ...n, lgpd: e.target.checked }))} className="h-5 w-5 rounded-lg border-white/20 bg-white/5 accent-accent" />
                    <label htmlFor="landing-news-lgpd" className="text-xs font-bold text-white/40 uppercase tracking-widest cursor-pointer hover:text-white transition-colors">Aceito receber comunicações conforme a <Link to="/legal/privacy" className="text-accent underline">Política de Privacidade</Link></label>
                  </div>
                </form>
              </div>
            </div>
          </section>
        </>
      ) : (
        <section className="max-w-[1400px] mx-auto px-4 py-20 min-h-[50vh]">
          <div className="flex flex-col items-center mb-16">
             <h2 className="text-center font-black italic uppercase tracking-tighter text-primary text-4xl mb-4 flex items-center gap-4"><Car className="w-10 h-10" style={{ color: ACCENT }} />{sectionTitles.sucatas}</h2>
             <div className="h-1.5 w-24 rounded-full" style={{ backgroundColor: ACCENT }} />
             <p className="text-center text-slate-500 font-bold text-sm mt-6 max-w-2xl uppercase tracking-widest">Veículos no pátio para retirada de peças. Fale conosco para consultar disponibilidade.</p>
          </div>
          
          {loadingSucatas ? (
            <div className="text-center text-slate-400 py-16 font-bold uppercase tracking-widest animate-pulse">Carregando estoque…</div>
          ) : sucatasList.length === 0 ? (
            <div className="text-center text-slate-400 py-16 font-bold uppercase tracking-widest">Nenhuma sucata disponível no momento.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {sucatasList.map((s) => {
                const anoBits = [s.ano_fabricacao, s.ano_modelo].filter((x): x is number => typeof x === 'number').join(' / ')
                return (
                  <div key={s.id} className="group rounded-[2.5rem] border-2 border-white overflow-hidden bg-white shadow-lg hover:shadow-2xl transition-all duration-500 flex flex-col">
                    <div className="aspect-video bg-slate-50 relative overflow-hidden">
                      {s.foto_url ? <img src={s.foto_url} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" /> : <div className="w-full h-full flex items-center justify-center text-slate-200"><Car className="w-16 h-16" /></div>}
                      {s.status && <div className="absolute top-4 right-4"><span className="px-4 py-1.5 rounded-full bg-primary text-white text-[9px] font-black uppercase tracking-widest shadow-lg">{s.status}</span></div>}
                    </div>
                    <div className="p-8 flex-1">
                      <h3 className="font-black text-[#001A54] text-xl uppercase italic tracking-tighter mb-4 line-clamp-1">{[s.marca, s.modelo].filter(Boolean).join(' · ') || 'Veículo'}</h3>
                      <div className="grid grid-cols-2 gap-4 text-[10px] font-black uppercase tracking-widest text-slate-400 mb-6">
                        {s.codigo && <div><p className="text-slate-300 mb-1">CÓDIGO</p><p className="text-primary">{s.codigo}</p></div>}
                        {anoBits && <div><p className="text-slate-300 mb-1">ANO</p><p className="text-primary">{anoBits}</p></div>}
                        {s.cor && <div><p className="text-slate-300 mb-1">COR</p><p className="text-primary">{s.cor}</p></div>}
                        {s.combustivel && <div><p className="text-slate-300 mb-1">MOTOR</p><p className="text-primary">{s.combustivel}</p></div>}
                      </div>
                      <a href={whatsappHref()} target="_blank" rel="noreferrer" className="block w-full text-center py-4 rounded-2xl bg-slate-50 text-primary font-black uppercase italic tracking-tighter hover:bg-accent transition-colors shadow-sm">Consultar Peças</a>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <div className="text-center mt-20">
            <a href={whatsappHref()} target="_blank" rel="noreferrer">
              <Button className="h-14 rounded-full px-12 bg-primary text-white font-black uppercase italic tracking-tighter hover:bg-accent hover:text-primary transition-all shadow-2xl" style={{ backgroundColor: PRIMARY }}>Falar com Atendente</Button>
            </a>
          </div>
        </section>
      )}

      {/* Footer Premium */}
      <footer className="pt-20 pb-10" style={{ backgroundColor: '#000D2B' }}>
        <div className="max-w-[1400px] mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-16 mb-20">
            <div className="space-y-6">
              <Link to="/" className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center shadow-lg p-1.5">
                  <img src="/assets/logo-dourados.png" alt="Dourados Auto Peças" className="h-full w-full object-contain" />
                </div>
                <p className="font-black text-white text-xl uppercase italic tracking-tighter">Dourados<span style={{ color: ACCENT }}>AutoPeças</span></p>
              </Link>
              <p className="text-white/40 text-sm font-medium leading-relaxed uppercase tracking-wider">Referência em autopeças premium. Qualidade, garantia e entrega rápida.</p>
              <div className="flex gap-4 pt-2">
                <a href="https://www.instagram.com/douradosautopecas/" target="_blank" rel="noreferrer" className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center hover:bg-accent hover:text-primary transition-all text-white"><Instagram className="w-5 h-5" /></a>
                <a href="https://www.facebook.com/p/Dourados-Auto-Pe%C3%A7as-100063577480841/" target="_blank" rel="noreferrer" className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center hover:bg-accent hover:text-primary transition-all text-white"><Facebook className="w-5 h-5" /></a>
              </div>
            </div>
            <div>
              <h4 className="font-black text-white uppercase italic tracking-widest text-sm mb-8 border-l-4 border-accent pl-4">Institucional</h4>
              <nav className="flex flex-col gap-4 text-white/50 text-xs font-black uppercase tracking-widest">
                <Link to="/legal/terms" className="hover:text-accent transition-colors">Termos de Uso</Link>
                <Link to="/legal/privacy" className="hover:text-accent transition-colors">Privacidade</Link>
                <Link to="/legal/deletion" className="hover:text-accent transition-colors">LGPD</Link>
                <a href={whatsappHref()} target="_blank" rel="noreferrer" className="hover:text-accent transition-colors">Fale Conosco</a>
              </nav>
            </div>
            <div>
              <h4 className="font-black text-white uppercase italic tracking-widest text-sm mb-8 border-l-4 border-accent pl-4">Contato</h4>
              <div className="space-y-6">
                <div className="flex items-center gap-4"><Phone className="w-5 h-5 text-accent" /><p className="text-white font-black text-lg tracking-tighter">{STORE_LOCATION.phoneDisplay}</p></div>
                <div className="flex items-center gap-4"><Mail className="w-5 h-5 text-accent" /><p className="text-white/60 font-bold text-xs uppercase tracking-widest truncate">{STORE_LEGAL.emailContato}</p></div>
              </div>
            </div>
          </div>
          <div className="pt-10 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="text-center md:text-left">
               <p className="text-white/20 text-[10px] font-black uppercase tracking-[0.3em]">© {new Date().getFullYear()} {STORE_LEGAL.razaoSocial}</p>
               <p className="text-white/10 text-[9px] font-bold uppercase tracking-widest mt-1">CNPJ: {STORE_LEGAL.cnpjFormatado} | {STORE_LEGAL.logradouro}, {STORE_LEGAL.cidadeUf}</p>
            </div>
            <div className="flex items-center gap-6 grayscale opacity-20"><CreditCard className="w-6 h-6 text-white" /><Truck className="w-6 h-6 text-white" /><Shield className="w-6 h-6 text-white" /></div>
          </div>
        </div>
      </footer>

      {/* WhatsApp flutuante */}
      <a href={whatsappHref()} target="_blank" rel="noreferrer" className="fixed bottom-8 right-8 z-50 w-16 h-16 rounded-2xl bg-[#25D366] shadow-[0_10px_30px_rgba(37,211,102,0.4)] flex items-center justify-center hover:scale-110 transition-transform active:scale-95" aria-label="WhatsApp">
        <Phone className="w-8 h-8 text-white fill-white" />
      </a>

    </div>
  )
}

