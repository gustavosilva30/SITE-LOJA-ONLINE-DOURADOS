import { useEffect, useState, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getApiBaseUrl } from '@/lib/apiBase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Search,
  ShoppingCart,
  Package,
  Filter,
  ChevronDown,
  Store,
  ShoppingBag,
  User,
  LogOut,
  Loader2,
  Menu,
  MapPin,
  Phone,
  Clock,
  Truck,
  Shield,
  BadgeCheck,
  CreditCard,
  Sparkles,
  Headphones,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { STORE_LOCATION, getStoreMapEmbedUrl, getStoreGoogleMapsUrl } from '@/lib/storeLocation';
import { useStoreAuth } from '../contexts/StoreAuthContext';
import { usePageTitle } from '../lib/usePageTitle';
import { StoreJsonLd } from '../components/StoreJsonLd';
import { StoreLoginModal } from '../components/StoreLoginModal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { StoreProduct, StoreCategory, StoreProductsFilters } from '../types/store';
import { resolveStoreImageUrl } from '../lib/resolveStoreImageUrl';
import { ProductGrid } from '../components/ProductGrid';
import { WhatsAppButton } from '../components/WhatsAppButton';
import { useCart } from '../hooks/useCart';
import {
  STORE_ACCENT,
  STORE_ACCENT_FG,
  STORE_NAVY,
  STORE_NAVY_DARK,
  STORE_NAVY_LIGHT,
  STORE_ON_DARK,
  STORE_PUBLIC_SCOPE_CLASS,
} from '../storeTheme';
import { useStoreStatus } from '../hooks/useStoreStatus';

const WhatsappIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
  </svg>
)

const FacebookIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
)

const InstagramIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
  </svg>
)

function normalizeString(str: string): string {
  return (str || '')
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesFuzzy(name: string, query: string): boolean {
  const normName = normalizeString(name);
  const normQuery = normalizeString(query);
  if (!normQuery) return true;

  if (normName.includes(normQuery)) return true;

  const queryWords = normQuery.split(' ').filter(Boolean);
  const nameWords = normName.split(' ').filter(Boolean);

  const allWordsMatch = queryWords.every(qw => {
    return nameWords.some(nw => nw.includes(qw));
  });
  if (allWordsMatch) return true;

  const collapsedName = normName.replace(/\s+/g, '');
  const collapsedQuery = normQuery.replace(/\s+/g, '');
  if (collapsedName.includes(collapsedQuery)) return true;

  const regexParts = collapsedQuery.split('').join('.*');
  try {
    const rx = new RegExp(regexParts);
    if (rx.test(collapsedName)) return true;
  } catch (e) {}

  return false;
}

export function StoreHome() {
  const [searchParams] = useSearchParams();
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const { customer, logout } = useStoreAuth();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [newsletterPhone, setNewsletterPhone] = useState('');

  const formatPhone = (val: string) => {
    const digits = val.replace(/\D/g, '');
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  };

  const handleNewsletterSubmit = async () => {
    const cleanPhone = newsletterPhone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      alert('Por favor, insira um número de WhatsApp válido.');
      return;
    }

    const wantsOffers = window.confirm('Deseja receber ofertas exclusivas no WhatsApp?');
    if (!wantsOffers) return;

    const name = window.prompt('Por favor, informe o seu nome:');
    if (!name || name.trim() === '') {
      alert('O nome é obrigatório para cadastrar.');
      return;
    }

    try {
      const res = await fetch(`${getApiBaseUrl()}/api/store/auth/newsletter-lead`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: name.trim(), phone: cleanPhone }),
      });
      const data = await res.json();
      if (res.ok) {
        alert('Sucesso! Seu WhatsApp foi cadastrado para receber ofertas exclusivas.');
        setNewsletterPhone('');
      } else {
        alert(data.error || 'Erro ao cadastrar. Tente novamente.');
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão ao cadastrar.');
    }
  };
  const [categories, setCategories] = useState<StoreCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<StoreProductsFilters>(() => {
    try {
      const saved = sessionStorage.getItem('dourados_store_home_filters');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {
      page: 1,
      limit: 20,
      sortBy: 'created_at',
      sortOrder: 'desc'
    };
  });
  const [showFilters, setShowFilters] = useState(false);
  const [availableBrands, setAvailableBrands] = useState<string[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const { itemCount } = useCart();
  const [isStickyVisible, setIsStickyVisible] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const [localSearch, setLocalSearch] = useState(filters.search || '');
  const [failedCategoryIds, setFailedCategoryIds] = useState<Set<string>>(() => new Set());
  const abortControllerRef = useRef<AbortController | null>(null);
  const isStoreOpen = useStoreStatus();

  useEffect(() => {
    try {
      sessionStorage.setItem('dourados_store_home_filters', JSON.stringify(filters));
    } catch (e) {}
  }, [filters]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
        setIsCategoryDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Auto-scroll das categorias a cada 3 segundos
  useEffect(() => {
    if (categories.length === 0) return;
    const interval = setInterval(() => {
      setCarouselIndex(prev => (prev + 1) % Math.ceil(categories.length / 6));
    }, 3000);
    return () => clearInterval(interval);
  }, [categories]);

  useEffect(() => {
    let scrollTimeout: NodeJS.Timeout;
    const handleScroll = () => {
      setIsStickyVisible(window.scrollY > 150);
      
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        try {
          sessionStorage.setItem('dourados_store_home_scroll', String(window.scrollY));
        } catch (e) {}
      }, 150);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, []);

  useEffect(() => {
    fetchCategories();
    fetchBrands();
  }, []);

  useEffect(() => {
    const cat = searchParams.get('category') || undefined;
    const search = searchParams.get('search') || undefined;
    setFilters((prev) => {
      if (prev.category === cat && prev.search === search) return prev;
      return { ...prev, category: cat, search: search, page: 1 };
    });
    if (search !== undefined && search !== localSearch) {
      setLocalSearch(search);
    }
  }, [searchParams]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((prev) => {
        if (prev.search === (localSearch || undefined)) return prev;
        return { ...prev, search: localSearch || undefined, page: 1 };
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [localSearch]);

  useEffect(() => {
    if (filters.page === 1) {
      fetchProducts(false);
    } else {
      fetchProducts(true);
    }
  }, [filters]);

  // Restores scroll position once products have loaded
  useEffect(() => {
    if (!loading && products.length > 0) {
      try {
        const savedScroll = sessionStorage.getItem('dourados_store_home_scroll');
        if (savedScroll) {
          const scrollY = parseFloat(savedScroll);
          if (scrollY > 0) {
            setTimeout(() => {
              window.scrollTo(0, scrollY);
            }, 100);
          }
        }
      } catch (e) {}
    }
  }, [loading, products]);

  const fetchProducts = async (append = false) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    try {
      const params = new URLSearchParams({
        page: filters.page?.toString() || '1',
        limit: filters.limit?.toString() || '20',
        sortBy: filters.sortBy || 'created_at',
        sortOrder: filters.sortOrder || 'desc'
      });

      if (filters.search) {
        params.append('q', filters.search);
        params.append('search', filters.search);
      }
      if (filters.category) params.append('category', filters.category);
      if (filters.brand) params.append('brand', filters.brand);

      const response = await fetch(`${getApiBaseUrl()}/api/store/products?${params}`, {
        signal: controller.signal
      });
      const data = await response.json();

      if (response.ok) {
        const apiBase = getApiBaseUrl();
        const newProducts = (data.products || []).map((p: any) => ({
          ...p,
          imagem_url: resolveStoreImageUrl(
            p.imagem_url?.startsWith('/api') 
              ? `${apiBase}${p.imagem_url}` 
              : p.imagem_url
          ) || null
        }));
        
        const limit = filters.limit || 20;
        setHasMore(newProducts.length >= limit);

        if (append) {
          setProducts(prev => [...prev, ...newProducts]);
        } else {
          setProducts(newProducts);
        }
      } else {
        if (!append) setHasMore(false);
        console.error('Error fetching products:', data.error);
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return; // Requisição cancelada, ignora
      }
      if (!append) setHasMore(false);
      console.error('Error fetching products:', error);
    } finally {
      if (abortControllerRef.current === controller) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  };

  const loadMore = () => {
    setFilters(prev => ({ ...prev, page: (prev.page || 1) + 1 }));
  };

  const fetchCategories = async () => {
    try {
      const apiBase = getApiBaseUrl();
      const response = await fetch(`${apiBase}/api/store/categories`);
      const data = await response.json();

      if (response.ok) {
        // Prepend API base URL to proxy paths if they are relative & filter out dead/unresolvable URLs
        const processed = (data || []).map((cat: any) => ({
          ...cat,
          imagem_url: resolveStoreImageUrl(
            cat.imagem_url?.startsWith('/api') 
              ? `${apiBase}${cat.imagem_url}` 
              : cat.imagem_url
          ) || null
        }));
        setCategories(processed);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const fetchBrands = async () => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/store/brands`);
      const data = await response.json();
      if (response.ok) {
        setAvailableBrands(data);
      }
    } catch (error) {
      console.error('Error fetching brands:', error);
    }
  };

  const updateFilters = (newFilters: Partial<StoreProductsFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters, page: 1 }));
  };

  const clearFilters = () => {
    try {
      sessionStorage.removeItem('dourados_store_home_scroll');
    } catch (e) {}
    setFilters({
      page: 1,
      limit: 20,
      sortBy: 'created_at',
      sortOrder: 'desc'
    });
  };

  const waAtendimento = `https://wa.me/${STORE_LOCATION.whatsappNumber}?text=` + encodeURIComponent('Olá! Preciso de ajuda com um pedido na loja online.')

  const filteredCategories = categories.filter(cat => 
    matchesFuzzy(cat.nome, categorySearchQuery)
  );

  // SEO: título dinâmico por contexto (executa antes do return)
  const selectedCategoryName = filters.category
    ? categories.find((c) => c.id === filters.category)?.nome
    : undefined;
  const seoTitle = selectedCategoryName
    ? `${selectedCategoryName} em Dourados, MS — Dourados Auto Peças`
    : filters.search
    ? `Busca: "${filters.search}" — Dourados Auto Peças`
    : 'Dourados Auto Peças | O Maior Estoque de Peças Automotivas em Dourados - MS';
  const seoDescription = selectedCategoryName
    ? `Peças de ${selectedCategoryName} com estoque disponível em Dourados/MS. Compre online com entrega rápida ou retirada na loja.`
    : filters.search
    ? `Resultados para "${filters.search}" na Dourados Auto Peças. Peças automotivas com estoque e preço online.`
    : 'Encontre peças automotivas usadas originais na Dourados Auto Peças. O maior estoque de Dourados - MS com compra online segura e retirada expressa. Confira o catálogo!';
  usePageTitle(seoTitle, seoDescription);

  // Texto do H1 semântico (invisível visualmente mas lido pelo Google)
  const h1Text = selectedCategoryName
    ? `Peças de ${selectedCategoryName} em Dourados, MS`
    : filters.search
    ? `Resultados para "${filters.search}" — Dourados Auto Peças`
    : 'Peças Automotivas em Dourados, MS';

  return (
    <div className={`min-h-screen bg-[#F4F7F9] text-slate-900 ${STORE_PUBLIC_SCOPE_CLASS} overflow-x-hidden`}>
      <StoreJsonLd />
      {/* H1 semântico para SEO — visualmente oculto mas lido pelo Googlebot */}
      {(filters.search || filters.category) && <h1 className="sr-only">{h1Text}</h1>}
      
      {/* Sticky Search Bar - PitStop Inspired */}
      <div className={`fixed top-0 left-0 right-0 z-[100] bg-[#001A54]/95 backdrop-blur-lg border-b border-white/10 transform transition-all duration-500 shadow-[0_10px_40px_rgba(0,0,0,0.3)] ${isStickyVisible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'}`}>
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-3 flex items-center gap-4 lg:gap-8">
          {/* Small Logo for Sticky */}
          <Link to="/" className="hidden sm:flex items-center gap-2 shrink-0 group" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
             <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-white shadow-lg group-hover:scale-110 transition-transform p-1">
                <img src="/assets/logo-dourados.png" alt="Dourados Auto Peças" className="h-full w-full object-contain" />
             </div>
             <div className="hidden md:block leading-none">
                <p className="font-black text-sm tracking-tighter text-white uppercase italic">
                  Dourados<span style={{ color: STORE_ACCENT }}>Auto</span>
                </p>
                <p className="text-[8px] text-white/40 font-bold uppercase tracking-widest mt-0.5">Premium</p>
             </div>
          </Link>

          {/* Sticky Search Input */}
          <form 
            className="flex-1 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            <div className="relative flex-1 group">
               <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 group-focus-within:text-[#B6D433] transition-colors" />
               <Input 
                 placeholder="Busque por peça, modelo ou SKU..."
                 value={localSearch}
                 onChange={(e) => setLocalSearch(e.target.value)}
                 className="w-full h-11 pl-11 pr-4 bg-white/10 border-white/10 text-white placeholder:text-white/30 text-sm rounded-xl focus-visible:ring-[#B6D433]/30 focus-visible:border-[#B6D433]/50 transition-all font-medium"
               />
            </div>
            <Button 
              type="submit"
              className="h-11 px-6 rounded-xl font-black uppercase italic tracking-tighter shrink-0 shadow-lg hover:brightness-110 transition-all active:scale-95"
              style={{ backgroundColor: STORE_ACCENT, color: STORE_ACCENT_FG }}
            >
              Buscar
            </Button>
          </form>

          {/* Sticky Actions */}
          <div className="flex items-center gap-3 shrink-0">
             <Link to="/checkout" className="relative group">
                <Button
                  size="icon"
                  className="h-11 w-11 rounded-xl bg-white/10 border border-white/10 text-white hover:bg-[#B6D433] hover:text-[#001A54] hover:border-transparent transition-all shadow-lg"
                >
                   <ShoppingCart className="w-5 h-5" strokeWidth={2.5} />
                   {itemCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 bg-[#B6D433] text-[#001A54] text-[10px] font-black w-6 h-6 rounded-full flex items-center justify-center border-2 border-[#001A54] shadow-xl animate-pulse">
                         {itemCount > 99 ? '99' : itemCount}
                      </span>
                   )}
                </Button>
             </Link>
             {customer && (
               <div className="hidden md:block w-8 h-8 rounded-full bg-[#B6D433] flex items-center justify-center text-[#001A54] shadow-lg">
                  <User className="w-4 h-4" />
               </div>
             )}
          </div>
        </div>
      </div>

      {/* Top Bar - Utilitária */}
      <div className="bg-[#000D2B] text-white/80 py-2 border-b border-white/5">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 flex justify-between items-center text-[10px] sm:text-xs font-bold uppercase tracking-widest">
          <div className="hidden lg:flex items-center gap-6">
            <span className="flex items-center gap-1.5 hover:text-white transition-colors cursor-default">
              <Shield className="h-3 w-3 text-[#B6D433]" />
              Compra 100% segura
            </span>
            <span className={`flex items-center gap-1.5 hover:text-white transition-colors cursor-default ${isStoreOpen ? 'text-[#B6D433]' : 'text-red-400'}`}>
              <Store className="h-3 w-3" />
              Loja Física {isStoreOpen ? 'Aberta' : 'Fechada'} | Horário de funcionamento: Seg a Sex 07:30 às 11:00 e 13:00 às 17:30 - Sáb 08:00 às 12:00
            </span>
          </div>
          <div className="flex items-center gap-4 sm:gap-6 ml-auto">
            <Link to="/sucatas" className="hover:text-[#B6D433] transition-colors">Veículos para Desmanche</Link>
            <Link to="/meus-pedidos" className="hover:text-white transition-colors">Meus Pedidos</Link>
            <a href={waAtendimento} target="_blank" rel="noreferrer" className="hover:text-white transition-colors flex items-center gap-1">
              Atendimento
            </a>
          </div>
        </div>
      </div>

      {/* Header Principal - Agora rola para fora para dar lugar ao sticky slim */}
      <header className="bg-[#001A54] relative z-40 shadow-2xl transition-all duration-500">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 lg:py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-3 shrink-0 group self-center lg:self-auto">
              <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl flex items-center justify-center bg-white shadow-[0_0_20px_rgba(182,212,51,0.3)] group-hover:scale-105 transition-transform p-1.5">
                <img src="/assets/logo-dourados.png" alt="Dourados Auto Peças" className="h-full w-full object-contain" />
              </div>
              <div className="leading-tight">
                <p className="font-black text-xl sm:text-2xl tracking-tighter text-white uppercase italic">
                  Dourados<span style={{ color: STORE_ACCENT }}>AutoPeças</span>
                </p>
                <div className="flex items-center gap-2">
                  <div className="h-1 w-8 rounded-full" style={{ backgroundColor: STORE_ACCENT }} />
                  <p className="text-[10px] sm:text-[11px] text-white/60 font-bold uppercase tracking-[0.2em]">
                    Premium Store
                  </p>
                </div>
              </div>
            </Link>

            {/* Barra de Busca - PitStop Style */}
            <form
              className="flex-1 flex justify-center w-full min-w-0"
              onSubmit={(e) => {
                e.preventDefault()
                document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth' })
              }}
            >
              <div className="flex w-full max-w-4xl rounded-2xl overflow-hidden border-2 border-white/10 bg-white/5 backdrop-blur-md shadow-inner group focus-within:border-[#B6D433]/50 transition-all">
                <div className="hidden sm:flex items-center px-4 border-r border-white/10">
                  <Filter className="h-4 w-4 text-[#B6D433]" />
                </div>
                <Input
                  placeholder="O que seu carro precisa hoje? (Ex: Amortecedor, SKU, Marca...)"
                  value={localSearch}
                  onChange={(e) => setLocalSearch(e.target.value)}
                  className="flex-1 border-0 rounded-none h-14 sm:h-16 text-sm sm:text-base shadow-none focus-visible:ring-0 min-w-0 bg-transparent text-white placeholder:text-white/40 font-medium"
                />
                <Button
                  type="submit"
                  className={`h-14 sm:h-16 rounded-none px-6 sm:px-10 shrink-0 gap-3 font-black border-0 hover:brightness-110 active:scale-95 transition-all ${STORE_ON_DARK}`}
                  style={{ backgroundColor: STORE_ACCENT, color: STORE_ACCENT_FG }}
                >
                  <Search className="h-5 w-5" strokeWidth={3} />
                  <span className="hidden md:inline uppercase italic tracking-tighter">Buscar</span>
                </Button>
              </div>
            </form>

            {/* User & Cart */}
            <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-5 shrink-0">
              <div className="hidden xl:flex flex-col text-right pr-4 border-r border-white/10">
                <span className="text-[11px] font-black uppercase text-white/50 tracking-widest leading-none mb-1">Status</span>
                <span className="text-xs text-[#B6D433] font-bold flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#B6D433] animate-pulse" />
                  Loja Online Ativa
                </span>
              </div>
              
              {customer ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="lg"
                      className="gap-2.5 rounded-2xl border-2 border-white/10 bg-white/5 hover:bg-white/10 text-white font-black h-14 px-5"
                    >
                      <div className="w-8 h-8 rounded-full bg-[#B6D433] flex items-center justify-center text-[#001A54]">
                        <User className="w-4 h-4" />
                      </div>
                      <span className="max-w-[100px] truncate uppercase tracking-tighter">{(customer.name || 'Conta').split(' ')[0]}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 mt-2 rounded-2xl shadow-2xl border-white/10">
                    <Link to="/meus-pedidos">
                      <DropdownMenuItem className="gap-2.5 p-3 cursor-pointer">
                        <ShoppingBag className="w-4 h-4 text-[#001A54]" />
                        <span className="font-bold">Meus Pedidos</span>
                      </DropdownMenuItem>
                    </Link>
                    <DropdownMenuItem className="gap-2.5 p-3 text-red-600 cursor-pointer" onClick={logout}>
                      <LogOut className="w-4 h-4" />
                      <span className="font-bold">Sair da Conta</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button
                  size="lg"
                  className="gap-2.5 rounded-2xl border-2 border-white/10 bg-white/5 hover:bg-white/10 text-white font-black h-14 px-6 uppercase tracking-tighter italic"
                  onClick={() => setIsLoginModalOpen(true)}
                >
                  <User className="w-5 h-5 text-[#B6D433]" />
                  Entrar
                </Button>
              )}

              <Link to="/checkout" className="relative group">
                <Button
                  size="lg"
                  className="gap-2.5 h-14 px-6 rounded-2xl border-0 shadow-[0_0_25px_rgba(182,212,51,0.2)] font-black hover:scale-105 active:scale-95 transition-all"
                  style={{ backgroundColor: STORE_ACCENT, color: STORE_ACCENT_FG }}
                >
                  <ShoppingCart className="w-5 h-5" strokeWidth={2.5} />
                  <span className="hidden md:inline uppercase italic tracking-tighter">Carrinho</span>
                  {itemCount > 0 && (
                    <span
                      className="absolute -top-2 -right-2 text-[11px] font-black rounded-full h-6 min-w-6 px-1 flex items-center justify-center bg-white text-[#001A54] border-2 border-[#B6D433] shadow-lg animate-bounce"
                    >
                      {itemCount > 99 ? '99+' : itemCount}
                    </span>
                  )}
                </Button>
              </Link>
            </div>
          </div>
        </div>


      </header>

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-12">
        
        {/* Banner de Impacto - Enterprise Style */}
        {!filters.search && !filters.category && (
          <section className="relative group h-[280px] sm:h-[350px] lg:h-[400px] rounded-[2rem] overflow-hidden shadow-2xl">
            <div
              className="absolute inset-0 bg-cover lg:bg-cover bg-center bg-no-repeat transition-transform duration-700 animate-camera-pan group-hover:scale-105"
              style={{ backgroundColor: STORE_NAVY, backgroundImage: "url('/images/hero-loja-bg.jpg')" }}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#000D2B] via-[#001A54]/90 to-transparent" />
            
            <div className="relative h-full flex flex-col justify-center p-6 sm:p-10 lg:p-12 max-w-3xl space-y-4 lg:space-y-5">
              <Badge className="bg-[#B6D433] text-[#001A54] font-black px-4 py-1.5 text-xs uppercase tracking-[0.2em] w-fit italic">
                Promoção de Lançamento
              </Badge>
              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white leading-[0.95] tracking-tighter uppercase italic">
                Sua máquina em<br/>
                <span style={{ color: STORE_ACCENT }}>Alto Desempenho</span>
              </h2>
              <p className="text-base sm:text-lg lg:text-xl text-white/80 font-medium max-w-xl">
                O maior estoque de peças automotivas usadas da região, agora com a conveniência da compra online e retirada expressa.
              </p>
              <div className="flex flex-wrap gap-4 pt-2">
                <Button
                  size="lg"
                  className="rounded-2xl px-10 h-14 font-black shadow-xl hover:scale-105 transition-all text-lg uppercase tracking-tighter italic"
                  style={{ backgroundColor: STORE_ACCENT, color: STORE_ACCENT_FG }}
                  onClick={() => document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth' })}
                >
                  Explorar Catálogo
                </Button>
                <WhatsAppButton size="lg" className="rounded-2xl h-14 px-8 border-2 border-white/20 bg-white/5 backdrop-blur-md text-white font-black hover:bg-white/10 uppercase tracking-tighter italic" />
              </div>
            </div>
            
            {/* Floating Trust Indicators */}
            <div className="absolute bottom-12 right-12 hidden lg:grid grid-cols-1 gap-3">
              {[
                { icon: Package, label: "Peças Usadas" },
                { icon: Shield, label: "Garantia Total" },
                { icon: MapPin, label: "Retirada na Loja" },
                { icon: CreditCard, label: "5x no Cartão" }
              ].map((item, idx) => (
                <div key={idx} className="bg-white/10 backdrop-blur-md border border-white/10 p-4 rounded-2xl flex items-center gap-3">
                  <item.icon className="w-5 h-5 text-[#B6D433]" />
                  <span className="text-white text-xs font-black uppercase tracking-tighter">{item.label}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Bloco institucional de SEO + prova de loja física.
            Texto à esquerda dá ao Googlebot o conteúdo indexável com as
            palavras-chave locais; a coluna da direita mostra a fachada, o mapa
            e os dados do Perfil da Empresa, para quem chega pelo site ver que
            existe loja de verdade. Segue a condição do Hero — sobre resultado
            de busca este conteúdo não teria a ver com a tela. */}
        {!filters.search && !filters.category && (
          <section className="w-full py-4">
            <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-6 items-stretch">

              {/* Texto institucional */}
              <div className="bg-white rounded-3xl border border-slate-200/70 shadow-sm px-6 sm:px-10 pt-10 pb-12 sm:py-12">
                <h1
                  className="text-2xl sm:text-3xl font-black tracking-tight leading-tight"
                  style={{ color: STORE_NAVY }}
                >
                  Dourados Auto Peças: O Maior Estoque de Peças Automotivas Usadas em Dourados - MS
                </h1>

                <div
                  className="mt-6 h-1 w-16 rounded-full"
                  style={{ backgroundColor: STORE_ACCENT }}
                />

                <div className="mt-8 space-y-5 text-slate-600 leading-relaxed text-sm sm:text-base">
                  <p>
                    Procurando peças automotivas com procedência, garantia e preço justo? Na
                    Dourados Auto Peças, você encontra o catálogo mais completo de peças usadas
                    originais da região. Trabalhamos com uma ampla variedade de marcas e modelos
                    para garantir que a sua máquina continue operando em alto desempenho.
                  </p>
                  <p>
                    Seja para motor, suspensão, lataria ou acabamento, nosso estoque é
                    rigorosamente catalogado. Agora, com a nossa plataforma digital, você tem a
                    conveniência de comprar peças online com total segurança. Navegue pelo nosso
                    site, encontre a peça exata que você precisa e aproveite a nossa retirada
                    expressa diretamente em nossa loja física na Avenida Marcelino Pires, ou
                    consulte nossas opções de entrega.
                  </p>
                  <p className="font-bold text-base sm:text-lg" style={{ color: STORE_NAVY }}>
                    Qualidade, agilidade e o melhor atendimento para o seu veículo em Dourados e
                    região.
                  </p>
                </div>
              </div>

              {/* Loja física: fachada, mapa e dados do Perfil da Empresa */}
              <aside className="bg-white rounded-3xl border border-slate-200/70 shadow-sm overflow-hidden flex flex-col">
                {/* A foto some sozinha se o arquivo não existir, para não deixar
                    ícone de imagem quebrada no lugar mais visível da página. */}
                <img
                  src="/images/loja-fachada.jpg"
                  alt="Fachada da loja Dourados Auto Peças na Av. Marcelino Pires, 5235, em Dourados - MS"
                  className="w-full aspect-[16/9] object-cover"
                  loading="lazy"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                />

                <div className="p-6 sm:p-7 flex flex-col gap-5 flex-1">
                  <div>
                    <h2
                      className="text-lg sm:text-xl font-black tracking-tight"
                      style={{ color: STORE_NAVY }}
                    >
                      Nossa loja física em Dourados
                    </h2>
                    <div className="mt-2 flex items-center gap-2 text-sm">
                      <span className="font-black" style={{ color: STORE_NAVY }}>
                        {STORE_LOCATION.googleNota.toFixed(1).replace('.', ',')}
                      </span>
                      <span className="text-amber-400 tracking-tight" aria-hidden="true">★★★★☆</span>
                      <a
                        href={getStoreGoogleMapsUrl()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-500 hover:text-slate-800 underline underline-offset-2"
                      >
                        {STORE_LOCATION.googleAvaliacoes} avaliações no Google
                      </a>
                    </div>
                  </div>

                  <div className="rounded-2xl overflow-hidden border border-slate-200">
                    <iframe
                      src={getStoreMapEmbedUrl()}
                      title="Mapa da Dourados Auto Peças na Av. Marcelino Pires, 5235"
                      className="w-full h-44 sm:h-48 block"
                      style={{ border: 0 }}
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      allowFullScreen
                    />
                  </div>

                  <dl className="space-y-3 text-sm">
                    <div className="flex gap-3">
                      <MapPin className="w-4 h-4 mt-0.5 shrink-0" style={{ color: STORE_NAVY }} />
                      <div>
                        <dt className="sr-only">Endereço</dt>
                        <dd className="text-slate-600">{STORE_LOCATION.fullAddress}</dd>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <Phone className="w-4 h-4 mt-0.5 shrink-0" style={{ color: STORE_NAVY }} />
                      <div>
                        <dt className="sr-only">Telefone</dt>
                        <dd>
                          <a href="tel:+5567999100220" className="text-slate-600 hover:text-slate-900">
                            (67) 99910-0220
                          </a>
                          <span className="text-slate-300"> · </span>
                          <a href="tel:+556734243068" className="text-slate-600 hover:text-slate-900">
                            (67) 3424-3068
                          </a>
                        </dd>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <Clock className="w-4 h-4 mt-0.5 shrink-0" style={{ color: STORE_NAVY }} />
                      <div>
                        <dt className="sr-only">Horário de funcionamento</dt>
                        <dd className="text-slate-600">
                          <span className={`font-black ${isStoreOpen ? 'text-emerald-600' : 'text-red-500'}`}>
                            {isStoreOpen ? 'Aberto agora' : 'Fechado agora'}
                          </span>
                          <br />
                          {STORE_LOCATION.horarioSemana}
                          <br />
                          {STORE_LOCATION.horarioSabado}
                        </dd>
                      </div>
                    </div>
                  </dl>

                  <a
                    href={getStoreGoogleMapsUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-auto inline-flex items-center justify-center gap-2 rounded-2xl h-12 font-black uppercase tracking-tighter italic text-sm transition-transform hover:scale-[1.02]"
                    style={{ backgroundColor: STORE_NAVY, color: '#fff' }}
                  >
                    <MapPin className="w-4 h-4" />
                    Como chegar
                  </a>
                </div>
              </aside>

            </div>
          </section>
        )}

        {/* Banner Clickable Veículos para Desmontagem */}
        {!filters.search && !filters.category && (
          <section className="relative w-full">
            <Link to="/sucatas" className="block relative w-full rounded-2xl overflow-hidden shadow-xl hover:shadow-[0_20px_50px_rgba(0,26,84,0.15)] transition-all duration-500 hover:-translate-y-1 group">
              <img
                src="/images/veiculos-desmontagem-v3.jpg"
                alt="Veículos para Desmontagem"
                className="w-full h-auto block"
              />
              <div className="absolute inset-0 bg-black/10 group-hover:bg-black/30 transition-colors duration-500" />
              
              {/* Botão flutuante animado indicando clique */}
              <div className="absolute bottom-4 right-4 md:bottom-8 md:right-8 flex items-center justify-center pointer-events-none">
                <div className="animate-bounce bg-[#0ea5e9] text-white font-black px-5 py-2.5 md:px-6 md:py-3 rounded-full shadow-[0_10px_25px_rgba(14,165,233,0.6)] border-2 border-white/30 flex items-center gap-2 text-xs md:text-sm backdrop-blur-sm transition-transform group-hover:scale-110">
                  <svg className="w-5 h-5 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                  </svg>
                  CLIQUE AQUI
                </div>
              </div>
            </Link>
          </section>
        )}

        {/* Categorias / Departamentos - Carrossel Animado */}
        {categories.length > 0 && !filters.category && (
          <section className="space-y-8 py-4">
            <div className="flex flex-col md:flex-row items-center md:items-end justify-between px-2 gap-4">
              <div className="text-center md:text-left space-y-1">
                <h2 className="text-3xl sm:text-4xl font-black uppercase italic tracking-tighter" style={{ color: STORE_NAVY }}>
                  Navegue por <span className="text-[#B6D433] bg-[#001A54] px-4 py-1.5 rounded-2xl shadow-xl">Departamentos</span>
                </h2>
                <p className="text-slate-500 font-bold text-sm">Encontre exatamente o que seu veículo precisa</p>
              </div>

              {/* Caixa de Pesquisa de Categorias */}
              <div className="relative w-full md:max-w-xs shrink-0">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Pesquisar departamento..."
                  value={categorySearchQuery}
                  onChange={(e) => {
                    setCategorySearchQuery(e.target.value);
                    setCarouselIndex(0);
                  }}
                  className="pl-10 h-11 bg-white border-slate-200 text-slate-800 placeholder:text-slate-400 text-xs font-bold rounded-xl focus-visible:ring-[#001A54]/20 focus-visible:border-[#001A54]/30"
                />
              </div>

              <div className={`flex gap-2 transition-all ${categorySearchQuery ? 'opacity-0 pointer-events-none w-0 overflow-hidden' : 'opacity-100'}`}>
                 <Button 
                   variant="outline" 
                   size="icon" 
                   className="rounded-xl border-2 border-slate-200 bg-white text-[#001A54] hover:bg-[#001A54] hover:border-[#001A54] hover:text-white transition-all h-11 w-11 shadow-sm"
                   onClick={() => setCarouselIndex(prev => (prev - 1 + Math.ceil(filteredCategories.length / 6)) % Math.ceil(filteredCategories.length / 6))}
                   disabled={filteredCategories.length === 0}
                 >
                   <ChevronLeft className="w-5 h-5" />
                 </Button>
                 <Button 
                   variant="outline" 
                   size="icon" 
                   className="rounded-xl border-2 border-slate-200 bg-white text-[#001A54] hover:bg-[#001A54] hover:border-[#001A54] hover:text-white transition-all h-11 w-11 shadow-sm"
                   onClick={() => setCarouselIndex(prev => (prev + 1) % Math.ceil(filteredCategories.length / 6))}
                   disabled={filteredCategories.length === 0}
                 >
                   <ChevronRight className="w-5 h-5" />
                 </Button>
              </div>
            </div>
            
            {categorySearchQuery ? (
              filteredCategories.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 sm:gap-6 px-2">
                  {filteredCategories.map((category) => (
                    <button
                      key={category.id}
                      onClick={() => updateFilters({ category: category.id })}
                      className="group relative flex flex-col items-center p-4 bg-white border-2 border-slate-100 rounded-[2.5rem] shadow-lg hover:shadow-2xl hover:border-[#B6D433] transition-all duration-500 overflow-hidden"
                    >
                      <div className="relative w-full aspect-square rounded-3xl overflow-hidden mb-4 bg-slate-50 flex items-center justify-center">
                         {category.imagem_url && !failedCategoryIds.has(category.id) ? (
                           <img 
                             src={resolveStoreImageUrl(category.imagem_url)} 
                             alt={category.nome}
                             className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                             loading="lazy"
                             decoding="async"
                             onError={() => {
                               setFailedCategoryIds(prev => new Set(prev).add(category.id));
                             }}
                           />
                         ) : (
                           <div className="w-full h-full bg-slate-100 flex items-center justify-center group-hover:bg-[#001A54] transition-colors duration-500">
                             <Package className="w-16 h-16 text-slate-300 group-hover:text-[#B6D433] transition-colors" />
                           </div>
                         )}
                         <div className="absolute inset-0 bg-gradient-to-t from-white/20 to-transparent" />
                      </div>
                      <h3 className="font-black text-center text-xs sm:text-sm text-[#001A54] uppercase tracking-tighter line-clamp-2 leading-tight px-2 min-h-[2.5rem] flex items-center justify-center">
                        {category.nome}
                      </h3>
                      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-1.5 w-0 group-hover:w-1/2 bg-[#B6D433] transition-all duration-300 rounded-full mb-2" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 bg-white rounded-[2.5rem] border-2 border-dashed border-slate-100 shadow-md">
                  <Package className="w-12 h-12 mx-auto text-slate-300 mb-2" />
                  <p className="text-sm font-black uppercase text-slate-500 tracking-tighter italic">Nenhum departamento encontrado para "{categorySearchQuery}"</p>
                </div>
              )
            ) : filteredCategories.length > 0 ? (
              <>
                <div className="relative overflow-hidden px-2">
                  <motion.div 
                    className="flex transition-all duration-700 ease-in-out"
                    animate={{ x: `-${carouselIndex * 100}%` }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  >
                    {Array.from({ length: Math.ceil(filteredCategories.length / 6) }).map((_, pageIdx) => (
                      <div key={pageIdx} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 sm:gap-6 w-full shrink-0">
                        {filteredCategories.slice(pageIdx * 6, (pageIdx * 6) + 6).map((category) => (
                          <button
                            key={category.id}
                            onClick={() => updateFilters({ category: category.id })}
                            className="group relative flex flex-col items-center p-4 bg-white border-2 border-slate-100 rounded-[2.5rem] shadow-lg hover:shadow-2xl hover:border-[#B6D433] transition-all duration-500 overflow-hidden"
                          >
                            <div className="relative w-full aspect-square rounded-3xl overflow-hidden mb-4 bg-slate-50 flex items-center justify-center">
                               {category.imagem_url && !failedCategoryIds.has(category.id) ? (
                                 <img 
                                   src={resolveStoreImageUrl(category.imagem_url)} 
                                   alt={category.nome}
                                   className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                                   loading="lazy"
                                   decoding="async"
                                   onError={() => {
                                     setFailedCategoryIds(prev => new Set(prev).add(category.id));
                                   }}
                                 />
                               ) : (
                                 <div className="w-full h-full bg-slate-100 flex items-center justify-center group-hover:bg-[#001A54] transition-colors duration-500">
                                   <Package className="w-16 h-16 text-slate-300 group-hover:text-[#B6D433] transition-colors" />
                                 </div>
                               )}
                               <div className="absolute inset-0 bg-gradient-to-t from-white/20 to-transparent" />
                            </div>
                            <h3 className="font-black text-center text-xs sm:text-sm text-[#001A54] uppercase tracking-tighter line-clamp-2 leading-tight px-2 min-h-[2.5rem] flex items-center justify-center">
                              {category.nome}
                            </h3>
                            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-1.5 w-0 group-hover:w-1/2 bg-[#B6D433] transition-all duration-300 rounded-full mb-2" />
                          </button>
                        ))}
                      </div>
                    ))}
                  </motion.div>
                </div>

                {/* Indicadores de página do carrossel */}
                <div className="flex justify-center gap-2 pt-4">
                   {Array.from({ length: Math.ceil(filteredCategories.length / 6) }).map((_, idx) => (
                     <button
                       key={idx}
                       onClick={() => setCarouselIndex(idx)}
                       className={`h-2 rounded-full transition-all duration-300 ${carouselIndex === idx ? 'w-8 bg-[#001A54]' : 'w-2 bg-slate-200 hover:bg-slate-300'}`}
                     />
                   ))}
                </div>
              </>
            ) : (
              <div className="text-center py-12 bg-white rounded-[2.5rem] border-2 border-dashed border-slate-100 shadow-md">
                <Package className="w-12 h-12 mx-auto text-slate-300 mb-2" />
                <p className="text-sm font-black uppercase text-slate-500 tracking-tighter italic">Nenhum departamento encontrado para "{categorySearchQuery}"</p>
              </div>
            )}
          </section>
        )}

        {/* Área Principal de Produtos */}
        <section id="catalogo" className="scroll-mt-32 space-y-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-2">
            <div className="space-y-2">
              <h2 className="text-3xl font-black uppercase italic tracking-tighter" style={{ color: STORE_NAVY }}>
                Produtos em <span style={{ color: STORE_ACCENT }}>Destaque</span>
              </h2>
              <p className="text-slate-500 font-bold text-sm">
                Mostrando <span className="text-[#001A54]">{products.length}</span> itens de alta qualidade
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={() => setShowFilters(!showFilters)}
                className={`h-12 rounded-2xl border-2 font-black uppercase tracking-tighter italic gap-2 transition-all ${
                  showFilters ? 'bg-[#001A54] text-white border-[#001A54]' : 'bg-white text-[#001A54] border-slate-200 hover:border-[#001A54]'
                }`}
              >
                <Filter className="w-4 h-4" />
                Filtros Avançados
                <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
              </Button>
            </div>
          </div>

          {showFilters && (
            <Card className="p-8 border-2 border-[#001A54]/10 shadow-2xl rounded-[2.5rem] bg-white animate-in fade-in slide-in-from-top-4 duration-300 relative z-30">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                <div className="space-y-2 relative" ref={categoryDropdownRef}>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Departamento</label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                      className="w-full h-12 bg-slate-50 border-2 border-slate-100 rounded-xl px-4 text-sm font-bold text-[#001A54] flex items-center justify-between hover:border-[#001A54]/20 transition-all outline-none"
                    >
                      <span className="truncate">
                        {filters.category 
                          ? categories.find(c => c.id === filters.category)?.nome || 'Todos'
                          : 'Todos'}
                      </span>
                      <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${isCategoryDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isCategoryDropdownOpen && (
                      <div className="absolute left-0 right-0 mt-2 bg-white border-2 border-slate-100 rounded-2xl shadow-2xl p-3 z-50 flex flex-col gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <Input
                            placeholder="Buscar categoria..."
                            value={categorySearchQuery}
                            onChange={(e) => setCategorySearchQuery(e.target.value)}
                            className="h-10 pl-9 pr-4 text-xs font-semibold rounded-xl bg-slate-50 border-slate-100 text-[#001A54] placeholder:text-slate-400 focus-visible:ring-0 focus-visible:border-slate-300"
                          />
                        </div>
                        <div className="overflow-y-auto max-h-48 space-y-1 pr-1">
                          <button
                            type="button"
                            onClick={() => {
                              updateFilters({ category: undefined });
                              setIsCategoryDropdownOpen(false);
                              setCategorySearchQuery('');
                            }}
                            className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                              !filters.category 
                                ? 'bg-[#001A54] text-white' 
                                : 'text-[#001A54] hover:bg-slate-50'
                            }`}
                          >
                            Todos
                          </button>
                          {categories
                            .filter(cat => cat.nome.toLowerCase().includes(categorySearchQuery.toLowerCase()))
                            .map((cat) => (
                              <button
                                key={cat.id}
                                type="button"
                                onClick={() => {
                                  updateFilters({ category: cat.id });
                                  setIsCategoryDropdownOpen(false);
                                  setCategorySearchQuery('');
                                }}
                                className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                                  filters.category === cat.id 
                                    ? 'bg-[#001A54] text-white' 
                                    : 'text-[#001A54] hover:bg-slate-50'
                                }`}
                              >
                                {cat.nome}
                              </button>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Marca</label>
                  <select
                    value={filters.brand || ''}
                    onChange={(e) => updateFilters({ brand: e.target.value })}
                    className="w-full h-12 bg-slate-50 border-2 border-slate-100 rounded-xl px-4 text-sm font-bold text-[#001A54] focus:border-[#B6D433] focus:ring-0 transition-all outline-none"
                  >
                    <option value="">Todas</option>
                    {availableBrands.map((brand) => (
                      <option key={brand} value={brand}>{brand}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ordenar por</label>
                  <select
                    value={`${filters.sortBy}-${filters.sortOrder}`}
                    onChange={(e) => {
                      const [sortBy, sortOrder] = e.target.value.split('-')
                      updateFilters({ sortBy: sortBy as any, sortOrder: sortOrder as any })
                    }}
                    className="w-full h-12 bg-slate-50 border-2 border-slate-100 rounded-xl px-4 text-sm font-bold text-[#001A54] focus:border-[#B6D433] focus:ring-0 transition-all outline-none"
                  >
                    <option value="created_at-desc">Lançamentos</option>
                    <option value="public_price-asc">Menor Preço</option>
                    <option value="public_price-desc">Maior Preço</option>
                    <option value="nome-asc">Nome A-Z</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <Button
                    variant="ghost"
                    onClick={clearFilters}
                    className="w-full h-12 font-black uppercase tracking-tighter italic text-red-500 hover:bg-red-50 rounded-xl"
                  >
                    Resetar Filtros
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Grid de Produtos - Ajustado para ser 100% Responsivo */}
          <div className="relative min-h-[400px]">
            {loading && !loadingMore ? (
              <div className="flex flex-col items-center justify-center h-64 gap-4">
                <Loader2 className="w-12 h-12 animate-spin text-[#B6D433]" />
                <p className="font-black uppercase tracking-widest text-[#001A54] italic">Acelerando estoque...</p>
              </div>
            ) : products.length > 0 ? (
              <>
                <ProductGrid products={products} loading={loading} showAddToCart={true} />
                
                {hasMore && (
                  <div className="flex justify-center mt-16">
                    <Button
                      size="lg"
                      onClick={loadMore}
                      disabled={loadingMore}
                      className="group relative h-16 px-12 rounded-[2rem] font-black uppercase tracking-tighter italic text-xl shadow-2xl hover:scale-105 active:scale-95 transition-all overflow-hidden"
                      style={{ backgroundColor: STORE_NAVY, color: 'white' }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                      {loadingMore ? (
                        <>
                          <Loader2 className="w-6 h-6 animate-spin mr-3" />
                          Carregando...
                        </>
                      ) : (
                        <>
                          Carregar Mais
                          <ChevronDown className="w-6 h-6 ml-3 group-hover:translate-y-1 transition-transform" />
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-white border-2 border-dashed border-slate-200 rounded-[3rem] p-20 flex flex-col items-center text-center space-y-6">
                <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center">
                  <Search className="w-12 h-12 text-slate-300" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-black uppercase tracking-tighter text-[#001A54]">Nenhum item encontrado</h3>
                  <p className="text-slate-500 font-medium">Tente ajustar seus filtros ou buscar por outro termo.</p>
                </div>
                <Button 
                  onClick={clearFilters}
                  className="rounded-xl px-8 h-12 font-black uppercase tracking-tighter italic"
                  style={{ backgroundColor: STORE_ACCENT, color: STORE_ACCENT_FG }}
                >
                  Ver Todos os Produtos
                </Button>
              </div>
            )}
          </div>
        </section>

        {/* Footer Institucional / Links Rápidos */}
        <footer className="mt-20 pt-20 border-t border-slate-200">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
            <div className="space-y-6">
              <Link to="/" className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-white border border-slate-100 p-1 shadow-sm">
                  <img src="/assets/logo-dourados.png" alt="Dourados Auto Peças" className="h-full w-full object-contain" />
                </div>
                <span className="font-black text-xl tracking-tighter italic uppercase text-[#001A54]">
                  Dourados<span className="text-[#B6D433]">AutoPeças</span>
                </span>
              </Link>
              <p className="text-sm text-slate-500 font-medium leading-relaxed">
                Referência em peças automotivas de alta performance e durabilidade. Qualidade garantida para quem não abre mão do melhor para o seu veículo.
              </p>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-[#001A54] flex items-center justify-center text-[#B6D433] hover:scale-110 transition-transform cursor-pointer">
                  <Shield className="w-5 h-5" />
                </div>
                <div className="w-10 h-10 rounded-full bg-[#001A54] flex items-center justify-center text-[#B6D433] hover:scale-110 transition-transform cursor-pointer">
                  <Truck className="w-5 h-5" />
                </div>
                <div className="w-10 h-10 rounded-full bg-[#001A54] flex items-center justify-center text-[#B6D433] hover:scale-110 transition-transform cursor-pointer">
                  <CreditCard className="w-5 h-5" />
                </div>
              </div>
              <div className="flex items-center gap-4 pt-2">
                <a 
                  href={`https://wa.me/${STORE_LOCATION.whatsappNumber}?text=${encodeURIComponent('Olá, tenho uma dúvida sobre a loja Dourados Auto Peças')}`}
                  target="_blank" rel="noreferrer"
                  className="w-12 h-12 rounded-full flex items-center justify-center bg-white border border-slate-100 hover:scale-110 transition-all shadow-[0_4px_15px_rgba(37,211,102,0.2)] hover:shadow-[0_8px_25px_rgba(37,211,102,0.4)] animate-pulse"
                >
                  <WhatsappIcon className="w-7 h-7 text-[#25D366]" />
                </a>
                <a 
                  href="https://www.facebook.com/profile.php?id=100063577480841" 
                  target="_blank" rel="noreferrer"
                  className="w-12 h-12 rounded-full flex items-center justify-center bg-white border border-slate-100 hover:scale-110 transition-all shadow-[0_4px_15px_rgba(24,119,242,0.2)] hover:shadow-[0_8px_25px_rgba(24,119,242,0.4)]"
                >
                  <FacebookIcon className="w-7 h-7 text-[#1877F2]" />
                </a>
                <a 
                  href="https://instagram.com/" 
                  target="_blank" rel="noreferrer"
                  className="w-12 h-12 rounded-full flex items-center justify-center bg-white border border-slate-100 hover:scale-110 transition-all shadow-[0_4px_15px_rgba(225,48,108,0.2)] hover:shadow-[0_8px_25px_rgba(225,48,108,0.4)]"
                >
                  <InstagramIcon className="w-7 h-7 text-[#E1306C]" />
                </a>
              </div>
            </div>
            
            <div className="space-y-6">
              <h4 className="font-black uppercase tracking-widest text-[10px] text-slate-400">Atendimento</h4>
              <ul className="space-y-4">
                <li className="flex items-center gap-3 group cursor-pointer">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center group-hover:bg-[#B6D433] transition-colors">
                    <Headphones className="w-4 h-4 text-[#001A54]" />
                  </div>
                  <span className="text-sm font-bold text-[#001A54] tracking-tighter">(67) 3424-3068</span>
                </li>
                <li>
                  <a 
                    href="https://maps.google.com/?q=Av.+Marcelino+Pires,+5235,+Vila+São+Francisco,+Dourados+-+MS" 
                    target="_blank" 
                    rel="noreferrer"
                    className="flex items-center gap-3 group cursor-pointer hover:opacity-80 transition-opacity"
                  >
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center group-hover:bg-[#B6D433] transition-colors shrink-0">
                      <MapPin className="w-4 h-4 text-[#001A54]" />
                    </div>
                    <span className="text-sm font-bold text-[#001A54] tracking-tighter hover:underline">Av. Marcelino Pires, 5235, Vila São Francisco, Dourados - MS</span>
                  </a>
                </li>
              </ul>
            </div>

            <div className="space-y-6">
              <h4 className="font-black uppercase tracking-widest text-[10px] text-slate-400">Institucional & Legal</h4>
              <ul className="space-y-3 text-sm font-bold text-slate-500">
                <li><Link to="/legal/terms" className="hover:text-[#001A54] transition-colors">Termos de Uso</Link></li>
                <li><Link to="/legal/privacy" className="hover:text-[#001A54] transition-colors">Política de Privacidade</Link></li>
                <li><Link to="/legal/deletion" className="hover:text-[#001A54] transition-colors">LGPD & Cookies</Link></li>
              </ul>
            </div>



            <div className="bg-[#001A54] p-8 rounded-[2.5rem] text-white flex flex-col justify-center items-center text-center space-y-4">
              <Badge className="bg-[#B6D433] text-[#001A54] font-black text-[9px] tracking-[0.2em] uppercase">Newsletter</Badge>
              <h4 className="text-xl font-black uppercase italic tracking-tighter">Receba Ofertas Exclusivas</h4>
              <div className="w-full flex gap-2">
                <Input
                  type="tel"
                  placeholder="(00) 00000-0000"
                  value={newsletterPhone}
                  onChange={(e) => setNewsletterPhone(formatPhone(e.target.value))}
                  className="h-12 rounded-xl bg-white/10 border-white/10 text-white placeholder:text-white/30 text-sm"
                />
                <Button
                  onClick={handleNewsletterSubmit}
                  size="icon"
                  className="h-12 w-12 rounded-xl bg-[#B6D433] text-[#001A54] hover:brightness-110"
                >
                  <Sparkles className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </div>
          
          <div className="mt-20 py-8 border-t border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">
              © 2026 Dourados Auto Peças - Todos os direitos reservados
            </p>
            <div className="flex items-center gap-6 grayscale opacity-50">
              <img src="https://raw.githubusercontent.com/aaronfagan/svg-credit-card-payment-icons/master/flat/visa.svg" alt="Visa" className="h-4" />
              <img src="https://raw.githubusercontent.com/aaronfagan/svg-credit-card-payment-icons/master/flat/mastercard.svg" alt="Mastercard" className="h-5" />
              <img src="https://upload.wikimedia.org/wikipedia/commons/a/a2/Logo_Pix.svg" alt="Pix" className="h-4" />
            </div>
          </div>
        </footer>
      </main>

      {/* Floating Action Button - WhatsApp */}
      <div className="fixed bottom-8 right-8 z-[60] flex flex-col items-center gap-4">
        <div className="bg-white px-4 py-2 rounded-2xl shadow-2xl border border-slate-100 animate-bounce hidden md:block">
          <p className="text-[10px] font-black uppercase tracking-widest text-[#001A54]">Fale conosco agora!</p>
        </div>
        <a 
          href={`https://wa.me/${STORE_LOCATION.whatsappNumber}?text=${encodeURIComponent('Olá, tenho uma dúvida sobre a loja Dourados Auto Peças')}`} 
          target="_blank" 
          rel="noreferrer"
          className="relative w-16 h-16 rounded-full flex items-center justify-center bg-[#25D366] text-white border-2 border-white hover:scale-110 transition-all shadow-[0_15px_40px_rgba(37,211,102,0.4)] hover:shadow-[0_20px_50px_rgba(37,211,102,0.6)] animate-[wiggle_3s_ease-in-out_infinite] z-50"
        >
          <WhatsappIcon className="w-9 h-9 drop-shadow-sm" />
        </a>
      </div>

      <StoreLoginModal isOpen={isLoginModalOpen} onClose={() => setIsLoginModalOpen(false)} />
      
      {/* Estilos Globais Adicionais para Melhorar o UX */}
      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        
        .${STORE_PUBLIC_SCOPE_CLASS} {
          font-family: 'Outfit', sans-serif;
        }

        @keyframes pulse-soft {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        
        @keyframes wiggle {
          0%, 100% { transform: rotate(-5deg) scale(1); }
          50% { transform: rotate(5deg) scale(1.1); }
        }
      `}</style>
    </div>
  );
}
