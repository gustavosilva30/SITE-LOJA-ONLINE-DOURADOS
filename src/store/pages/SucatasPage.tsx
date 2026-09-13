import { useState, useEffect } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Package, Car, MapPin, Loader2, ArrowLeft, Info } from "lucide-react"
import { StoreLayout } from "../components/StoreLayout"
import { getApiBaseUrl } from "@/lib/apiBase"
import { STORE_LOCATION } from "@/lib/storeLocation"
import { storeSucataDetailLink } from "@/lib/storeSucataPath"
import { usePageTitle } from "../lib/usePageTitle"
import { resolveStoreImageUrl } from "../lib/resolveStoreImageUrl"

interface StoreSucata {
    id: string
    codigo: string
    marca: string
    modelo: string
    ano_fabricacao: number | null
    ano_modelo: number | null
    combustivel: string | null
    cor: string | null
    observacoes: string | null
    fotos_loja: string[]
    pecas_disponiveis: number
}

function normalizeBrandName(brand: string) {
    if (!brand) return ''
    let upper = brand.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toUpperCase().trim()
    if (upper === 'VW' || upper === 'VOLKSWAGEM') return 'VOLKSWAGEN'
    if (upper === 'GM') return 'CHEVROLET'
    if (upper === 'MERCEDES') return 'MERCEDES-BENZ'
    if (upper === 'CI') return 'CITROEN'
    if (upper === 'LANDROVER') return 'LAND ROVER'
    return upper
}

export function SucatasPage() {
    // A página já ranqueia para "desmanche dourados" (posição 6,6 no Search
    // Console) mas não tinha título próprio — herdava o do index.html.
    usePageTitle(
        "Desmanche em Dourados - MS | Veículos para Desmonte — Dourados Auto Peças",
        "Veja os veículos em desmanche na Dourados Auto Peças e as peças usadas originais disponíveis de cada um. Desmanche próprio em Dourados - MS, com retirada na loja.",
    )

    const navigate = useNavigate()
    const [sucatas, setSucatas] = useState<StoreSucata[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [selectedBrand, setSelectedBrand] = useState<string | null>(null)
    const [currentPage, setCurrentPage] = useState(1)
    const ITEMS_PER_PAGE = 18

    const resolveImageUrl = resolveStoreImageUrl;

    useEffect(() => {
        let isMounted = true
        async function fetchSucatas() {
            try {
                const res = await fetch(`${getApiBaseUrl()}/api/store/sucatas?limit=1000`)
                if (!res.ok) throw new Error("Erro ao carregar sucatas")
                const data = await res.json()
                if (isMounted) {
                    setSucatas(data.data || [])
                }
            } catch (err: any) {
                if (isMounted) setError(err.message)
            } finally {
                if (isMounted) setLoading(false)
            }
        }
        fetchSucatas()
        return () => { isMounted = false }
    }, [])

    const unifiedBrandsMap = new Map<string, boolean>()
    sucatas.forEach(s => {
        if (!s.marca) return
        const upper = normalizeBrandName(s.marca)
        if (upper) unifiedBrandsMap.set(upper, true)
    })

    const brands = Array.from(unifiedBrandsMap.keys()).sort()

    const filteredSucatas = selectedBrand 
        ? sucatas.filter(s => normalizeBrandName(s.marca || '') === selectedBrand)
        : sucatas

    const totalPages = Math.ceil(filteredSucatas.length / ITEMS_PER_PAGE)
    const paginatedSucatas = filteredSucatas.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)

    const BrandLogo = ({ marca }: { marca: string }) => {
        const [imgError, setImgError] = useState(false)
        const isSelected = selectedBrand === marca

        return (
            <button 
                onClick={() => {
                    setSelectedBrand(isSelected ? null : marca)
                    setCurrentPage(1)
                }}
                className={`flex flex-col items-center gap-2 min-w-[80px] p-2 rounded-2xl transition-all border-2 ${isSelected ? 'border-primary bg-primary/5 shadow-sm' : 'border-transparent hover:bg-slate-50'}`}
            >
                <div className={`w-14 h-14 rounded-full flex items-center justify-center bg-white shadow-sm border ${isSelected ? 'border-primary' : 'border-slate-200'} overflow-hidden p-2.5`}>
                    {!imgError ? (
                        <img 
                            src={`/logos/${marca.toLowerCase()}.png`}
                            alt={marca}
                            className="w-full h-full object-contain"
                            onError={() => setImgError(true)}
                        />
                    ) : (
                        <span className="text-xl font-black text-slate-400 uppercase">{marca.substring(0, 2)}</span>
                    )}
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${isSelected ? 'text-primary' : 'text-slate-500'}`}>
                    {marca}
                </span>
            </button>
        )
    }

    return (
        <StoreLayout>
            <div className="max-w-7xl mx-auto px-4 py-8 sm:pt-12 min-h-screen">
                <div className="flex flex-col md:flex-row md:items-start justify-between mb-8 gap-4">
                    <div>
                        <div className="flex items-center gap-2 text-primary">
                            <Car className="w-6 h-6" />
                            <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tighter text-slate-900">Veículos para Desmanche em Dourados - MS</h1>
                        </div>
                        <p className="text-sm text-slate-500 mt-1 font-medium">Veja nossos veículos e as peças disponíveis para cada um</p>
                    </div>
                    <div className="flex flex-col items-start md:items-end gap-3">

                        <button
                            onClick={() => navigate('/')}
                            className="text-sm font-bold text-primary flex items-center gap-1.5 hover:underline"
                        >
                            <ArrowLeft className="w-4 h-4" /> Voltar para Loja
                        </button>
                    </div>
                </div>

                {!loading && !error && brands.length > 0 && (
                    <div className="mb-8">
                        <div className="flex items-center gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x">
                            <button
                                onClick={() => {
                                    setSelectedBrand(null)
                                    setCurrentPage(1)
                                }}
                                className={`flex flex-col items-center gap-2 min-w-[80px] p-2 rounded-2xl transition-all border-2 snap-start ${!selectedBrand ? 'border-primary bg-primary/5 shadow-sm' : 'border-transparent hover:bg-slate-50'}`}
                            >
                                <div className={`w-14 h-14 rounded-full flex items-center justify-center bg-white shadow-sm border ${!selectedBrand ? 'border-primary' : 'border-slate-200'} overflow-hidden`}>
                                    <span className="text-xs font-black text-slate-400 uppercase text-center leading-tight">Todas</span>
                                </div>
                                <span className={`text-[10px] font-bold uppercase tracking-wider ${!selectedBrand ? 'text-primary' : 'text-slate-500'}`}>
                                    Marcas
                                </span>
                            </button>
                            {brands.map(marca => (
                                <div key={marca} className="snap-start">
                                    <BrandLogo marca={marca} />
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                        <Loader2 className="w-8 h-8 animate-spin mb-4" />
                        <p className="text-sm font-bold animate-pulse">Buscando sucatas...</p>
                    </div>
                ) : error ? (
                    <div className="bg-red-50 text-red-600 p-4 rounded-lg text-sm text-center font-bold border border-red-200">
                        {error}
                    </div>
                ) : filteredSucatas.length === 0 ? (
                    <div className="bg-white border rounded-2xl p-12 text-center shadow-sm">
                        <Car className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                        <h2 className="text-lg font-black text-slate-800 mb-1">Nenhuma sucata disponível</h2>
                        <p className="text-sm text-slate-500">
                            {selectedBrand ? `Não temos veículos da marca ${selectedBrand} no momento.` : 'No momento não temos veículos cadastrados para desmanche na loja.'}
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                            {paginatedSucatas.map(sucata => (
                                <div 
                                    key={sucata.id} 
                                    onClick={() => navigate(storeSucataDetailLink(sucata))}
                                    className="group bg-white rounded-2xl border overflow-hidden hover:shadow-lg hover:border-primary/30 transition-all flex flex-col cursor-pointer"
                                >
                                    <div className="aspect-[4/3] bg-slate-100 relative overflow-hidden">
                                        {sucata.fotos_loja?.[0] ? (
                                            <img 
                                                src={resolveImageUrl(sucata.fotos_loja[0])} 
                                                alt={`${sucata.marca} ${sucata.modelo}`}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-slate-400 bg-slate-100">
                                                <Car className="w-12 h-12 opacity-50" />
                                            </div>
                                        )}
                                        <div className="absolute top-3 left-3 bg-white/90 backdrop-blur text-xs font-black px-2.5 py-1 rounded-full text-primary shadow-sm">
                                            {sucata.codigo}
                                        </div>
                                        <div className="absolute bottom-3 right-3 bg-emerald-500/90 backdrop-blur text-xs font-black px-2.5 py-1 rounded-full text-white shadow-sm flex items-center gap-1.5">
                                            <Package className="w-3.5 h-3.5" />
                                            {sucata.pecas_disponiveis === 0 ? 'Aguardando desmontagem' : `${sucata.pecas_disponiveis} peças`}
                                        </div>
                                    </div>
                                    <div className="p-5 flex flex-col flex-1">
                                        <div className="text-xs font-bold text-slate-500 mb-1 uppercase tracking-widest">{sucata.marca}</div>
                                        <h3 className="text-lg font-black text-slate-800 leading-tight mb-2 group-hover:text-primary transition-colors">
                                            {sucata.modelo} {sucata.ano_modelo ? ` ${sucata.ano_modelo}` : ''}
                                        </h3>
                                        
                                        <div className="flex flex-wrap gap-2 mt-auto pt-4">
                                            {sucata.combustivel && (
                                                <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border">
                                                    {sucata.combustivel}
                                                </span>
                                            )}
                                            {sucata.cor && (
                                                <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border">
                                                    Cor: {sucata.cor}
                                                </span>
                                            )}
                                        </div>
                                        
                                        <div className="mt-4 pt-4 border-t">
                                            <a 
                                                href={`https://wa.me/${STORE_LOCATION.whatsappNumber}?text=` + encodeURIComponent(`Olá, tenho interesse em peças da sucata ${sucata.modelo} - Código ${sucata.codigo}`)}
                                                target="_blank"
                                                rel="noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                                className="flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1DA851] text-white px-4 py-2.5 rounded-xl font-bold transition-all shadow-sm"
                                            >
                                                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
                                                Chamar no WhatsApp
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {totalPages > 1 && (
                            <div className="mt-12 flex justify-center gap-2">
                                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                                    <button
                                        key={page}
                                        onClick={() => {
                                            setCurrentPage(page)
                                            window.scrollTo({ top: 0, behavior: 'smooth' })
                                        }}
                                        className={`w-10 h-10 rounded-full font-bold transition-all ${currentPage === page ? 'bg-primary text-white shadow-md' : 'bg-white text-slate-600 hover:bg-slate-100 border'}`}
                                    >
                                        {page}
                                    </button>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </StoreLayout>
    )
}
