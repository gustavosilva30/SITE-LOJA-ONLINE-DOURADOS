import { useState, useEffect } from "react"
import { useParams, Link, useNavigate } from "react-router-dom"
import { Package, Car, ArrowLeft, Loader2, Info, Search, X } from "lucide-react"
import { StoreLayout } from "../components/StoreLayout"
import { getApiBaseUrl } from "@/lib/apiBase"
import { ProductCard } from "../components/ProductCard"
import { StoreProduct } from "../types/store"
import { Button } from "@/components/ui/button"
import { STORE_LOCATION } from "@/lib/storeLocation"
import { storeSucataDetailLink, isSucataDetailUuidSegment } from "@/lib/storeSucataPath"
import { resolveStoreImageUrl } from "../lib/resolveStoreImageUrl"

export function SucataDetailPage() {
    const { slug } = useParams<{ slug: string }>()
    const navigate = useNavigate()
    const [sucata, setSucata] = useState<any>(null)
    const [produtos, setProdutos] = useState<StoreProduct[]>([])
    const [loading, setLoading] = useState(true)
    const [productsLoading, setProductsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [activeImage, setActiveImage] = useState(0)

    // Estado da Paginação e Busca
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)
    const [totalProducts, setTotalProducts] = useState(0)
    const [search, setSearch] = useState("")
    const [debouncedSearch, setDebouncedSearch] = useState("")

    // Debounce the search input
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search)
            setPage(1)
        }, 300)
        return () => clearTimeout(timer)
    }, [search])

    const waAtendimento = sucata ? `https://wa.me/${STORE_LOCATION.whatsappNumber}?text=` + encodeURIComponent(`Olá, tenho interesse em peças da sucata ${sucata.modelo} - Código ${sucata.codigo}`) : "#"

    const resolveImageUrl = resolveStoreImageUrl;

    // 1. Carrega dados básicos da sucata (por slug, com fallback em UUID no backend)
    useEffect(() => {
        let isMounted = true
        async function fetchSucataData() {
            try {
                const segment = encodeURIComponent(slug!)
                const res = await fetch(`${getApiBaseUrl()}/api/store/sucatas/${segment}`)
                if (!res.ok) {
                    throw new Error("Sucata não encontrada")
                }
                const data = await res.json()
                if (!isMounted) return

                // Redirecionamento canônico: link antigo com UUID vai para o slug.
                const canonicalLink = storeSucataDetailLink({ id: data.id, slug: data.slug })
                if (
                    data.slug?.trim() &&
                    isSucataDetailUuidSegment(slug!) &&
                    canonicalLink !== `/sucatas/${slug}`
                ) {
                    navigate(canonicalLink, { replace: true })
                    return
                }

                setSucata(data)
            } catch (err: any) {
                if (isMounted) setError(err.message)
            } finally {
                if (isMounted) setLoading(false)
            }
        }
        if (slug) fetchSucataData()
        return () => { isMounted = false }
    }, [slug, navigate])

    // 2. Carrega produtos da sucata (roda ao mudar de página, ID ou termo de busca)
    useEffect(() => {
        let isMounted = true
        async function fetchProducts() {
            setProductsLoading(true)
            try {
                const limit = 24
                const queryParam = debouncedSearch ? `&q=${encodeURIComponent(debouncedSearch)}` : ""
                const resProdutos = await fetch(`${getApiBaseUrl()}/api/store/sucatas/${encodeURIComponent(slug!)}/produtos?page=${page}&limit=${limit}${queryParam}`)
                if (!resProdutos.ok) {
                    throw new Error("Erro ao carregar peças")
                }
                const dataProdutos = await resProdutos.json()
                if (isMounted) {
                    setProdutos(dataProdutos.data || [])
                    setTotalPages(dataProdutos.total_pages || 1)
                    setTotalProducts(dataProdutos.total || 0)
                }
            } catch (err: any) {
                console.error("Erro ao buscar produtos da sucata:", err)
            } finally {
                if (isMounted) setProductsLoading(false)
            }
        }
        if (slug) fetchProducts()
        return () => { isMounted = false }
    }, [slug, page, debouncedSearch])

    return (
        <StoreLayout>
            <div className="max-w-7xl mx-auto px-4 py-8 mt-16 sm:mt-24 min-h-screen">
                <button
                    onClick={() => navigate('/sucatas')}
                    className="text-sm font-bold text-slate-500 flex items-center gap-1.5 hover:text-primary mb-6 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" /> Voltar para Sucatas
                </button>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                        <Loader2 className="w-8 h-8 animate-spin mb-4" />
                        <p className="text-sm font-bold animate-pulse">Carregando detalhes...</p>
                    </div>
                ) : error || !sucata ? (
                    <div className="bg-red-50 text-red-600 p-8 rounded-2xl text-center shadow-sm border border-red-100">
                        <Car className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <h2 className="text-lg font-black mb-1">{error || "Sucata não encontrada"}</h2>
                        <p className="text-sm">O veículo pode não estar mais disponível para desmanche online.</p>
                        <button onClick={() => navigate('/sucatas')} className="mt-4 px-4 py-2 bg-red-100 text-red-700 font-bold rounded-lg hover:bg-red-200 transition-colors">Ver outras sucatas</button>
                    </div>
                ) : (
                    <div className="space-y-12">
                        {/* Header & Galeria */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
                            {/* Galeria */}
                            <div className="space-y-4">
                                <div className="aspect-[4/3] bg-slate-100 rounded-2xl overflow-hidden border">
                                    {sucata.fotos_loja?.[activeImage] ? (
                                        <img 
                                            src={resolveImageUrl(sucata.fotos_loja[activeImage])} 
                                            alt={`${sucata.marca} ${sucata.modelo}`}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-slate-400">
                                            <Car className="w-16 h-16" />
                                        </div>
                                    )}
                                </div>
                                {sucata.fotos_loja?.length > 1 && (
                                    <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 sm:gap-3">
                                        {sucata.fotos_loja.map((url: string, idx: number) => (
                                            <button
                                                key={idx}
                                                onClick={() => setActiveImage(idx)}
                                                className={`aspect-square rounded-lg overflow-hidden border-2 transition-all ${activeImage === idx ? 'border-primary ring-2 ring-primary/30' : 'border-transparent hover:border-primary/50'}`}
                                            >
                                                <img src={resolveImageUrl(url)} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Informações */}
                            <div className="flex flex-col justify-center">
                                <div className="text-sm font-bold text-primary uppercase tracking-widest mb-2 flex items-center gap-2">
                                    <Car className="w-4 h-4" /> {sucata.marca}
                                </div>
                                <h1 className="text-3xl sm:text-4xl font-black text-slate-800 mb-4 leading-tight">
                                    {sucata.modelo} {sucata.ano_modelo ? ` ${sucata.ano_modelo}` : ''}
                                </h1>
                                
                                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 mb-6 text-slate-900">
                                    <h3 className="text-sm font-black uppercase text-slate-500 mb-4 flex items-center gap-2">
                                        <Info className="w-4 h-4 text-primary" /> Detalhes do Veículo
                                    </h3>
                                    <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
                                        <div>
                                            <span className="block text-slate-500 font-bold mb-1">Código</span>
                                            <strong className="text-slate-900 font-black">{sucata.codigo}</strong>
                                        </div>
                                        {sucata.ano_fabricacao && (
                                            <div>
                                                <span className="block text-slate-500 font-bold mb-1">Ano Fabricação</span>
                                                <strong className="text-slate-900 font-black">{sucata.ano_fabricacao}</strong>
                                            </div>
                                        )}
                                        {sucata.cor && (
                                            <div>
                                                <span className="block text-slate-500 font-bold mb-1">Cor</span>
                                                <strong className="text-slate-900 font-black">{sucata.cor}</strong>
                                            </div>
                                        )}
                                        {sucata.combustivel && (
                                            <div>
                                                <span className="block text-slate-500 font-bold mb-1">Combustível</span>
                                                <strong className="text-slate-900 font-black">{sucata.combustivel}</strong>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                
                                <div className="mt-auto pt-6 border-t flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                                            <Package className="w-6 h-6" />
                                        </div>
                                        <div>
                                            {totalProducts === 0 ? (
                                                <div className="text-xl font-black text-slate-800 uppercase">Aguardando desmontagem</div>
                                            ) : (
                                                <>
                                                    <div className="text-2xl font-black text-slate-800">{totalProducts}</div>
                                                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Peças Disponíveis</div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <a 
                                        href={waAtendimento}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex items-center gap-2 bg-[#25D366] hover:bg-[#1DA851] text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg shadow-[#25D366]/20"
                                    >
                                        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
                                        Chamar no WhatsApp
                                    </a>
                                </div>
                            </div>
                        </div>

                        {/* Produtos da Sucata */}
                        <div className="pt-8 border-t">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                                <h2 className="text-2xl font-black flex items-center gap-2 text-slate-800">
                                    <Package className="w-6 h-6 text-primary" /> Peças Deste Veículo
                                </h2>
                                
                                {/* Caixa de Pesquisa */}
                                <div className="relative w-full sm:w-80">
                                    <input
                                        type="text"
                                        placeholder="Pesquisar peça..."
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm"
                                    />
                                    <span className="absolute left-3 top-2.5 text-slate-400">
                                        <Search className="w-4 h-4" />
                                    </span>
                                    {search && (
                                        <button
                                            onClick={() => setSearch("")}
                                            className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 transition-colors"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                            
                            {productsLoading ? (
                                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                                    <Loader2 className="w-8 h-8 animate-spin mb-2 text-primary" />
                                    <p className="text-sm font-bold">Carregando peças...</p>
                                </div>
                            ) : produtos.length === 0 ? (
                                <div className="bg-slate-50 border border-dashed rounded-2xl p-12 text-center">
                                    <Package className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                                    <p className="text-slate-500 font-medium">
                                        {search 
                                            ? "Nenhuma peça encontrada correspondente à sua pesquisa." 
                                            : "Nenhuma peça disponível no momento para esta sucata."}
                                    </p>
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
                                        {produtos.map((p) => (
                                            <ProductCard key={p.id} product={p} />
                                        ))}
                                    </div>

                                    {/* Controles de Paginação */}
                                    {totalPages > 1 && (
                                        <div className="flex justify-center items-center gap-4 mt-12 pt-6 border-t">
                                            <Button
                                                variant="outline"
                                                onClick={() => {
                                                    setPage(p => Math.max(1, p - 1))
                                                    window.scrollTo({ top: 400, behavior: 'smooth' })
                                                }}
                                                disabled={page === 1}
                                                className="font-black border-2 border-slate-200 bg-white text-[#001A54] hover:bg-[#001A54] hover:text-white hover:border-[#001A54] transition-all disabled:opacity-50 disabled:bg-slate-100 disabled:text-slate-400"
                                            >
                                                Anterior
                                            </Button>
                                            <span className="text-sm font-bold text-slate-600">
                                                Página {page} de {totalPages}
                                            </span>
                                            <Button
                                                variant="outline"
                                                onClick={() => {
                                                    setPage(p => Math.min(totalPages, p + 1))
                                                    window.scrollTo({ top: 400, behavior: 'smooth' })
                                                }}
                                                disabled={page === totalPages}
                                                className="font-black border-2 border-slate-200 bg-white text-[#001A54] hover:bg-[#001A54] hover:text-white hover:border-[#001A54] transition-all disabled:opacity-50 disabled:bg-slate-100 disabled:text-slate-400"
                                            >
                                                Próxima
                                            </Button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </StoreLayout>
    )
}
