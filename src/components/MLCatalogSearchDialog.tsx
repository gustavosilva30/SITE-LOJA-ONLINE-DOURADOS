import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Modal } from './ui/modal';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Search, Package, Check, Loader2, ZoomIn, X } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/apiBase';
import { getAuthToken } from '@/lib/auth';

const ML_AUTOSEARCH_MIN_LEN = 3;

function httpsUrl(u: string) {
    return (u || '').replace(/^http:\/\//i, 'https://');
}

/** Catálogo e anúncios devolvem miniaturas em campos diferentes (`pictures`, `thumbnail`, etc.). */
function getMlSearchResultImageUrl(item: any): string {
    if (!item) return '';
    const pics = item.pictures;
    if (Array.isArray(pics) && pics.length > 0) {
        const p = pics[0];
        const u = p?.secure_url || p?.url || p?.secure_thumbnail;
        if (u) return httpsUrl(String(u));
    }
    const direct =
        item.secure_thumbnail ||
        item.thumbnail ||
        (typeof item.picture === 'string' ? item.picture : '');
    return httpsUrl(typeof direct === 'string' ? direct : '');
}

/** Miniaturas ML costumam terminar em `-I.jpg`; trocar por `-O` melhora a resolução na visualização. */
function upgradeMlThumbToLarge(url: string): string {
    if (!url) return url;
    let u = httpsUrl(url);
    u = u.replace(/-I\.(jpg|jpeg|png|webp)$/i, '-O.$1');
    u = u.replace(/-V\.(jpg|jpeg|png|webp)$/i, '-O.$1');
    return u;
}

interface MLCatalogSearchDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (data: any) => void;
    initialTerm?: string;
    /** Ao abrir, se true e initialTerm tiver tamanho mínimo, dispara busca automática */
    autoSearchOnOpen?: boolean;
    /** Canal da busca automática ao abrir (anúncios = listings) */
    defaultSearchType?: 'catalog' | 'listings';
}

export function MLCatalogSearchDialog({
    isOpen,
    onClose,
    onSelect,
    initialTerm = "",
    autoSearchOnOpen = false,
    defaultSearchType = 'catalog',
}: MLCatalogSearchDialogProps) {
    const [searchTerm, setSearchTerm] = useState(() => String(initialTerm ?? ""));
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState<any[]>([]);
    const [searchType, setSearchType] = useState<'catalog' | 'listings'>('catalog');
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [mlSearchNotice, setMlSearchNotice] = useState<string | null>(null);
    const openedForSession = useRef(false);

    useEffect(() => {
        if (!previewUrl) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setPreviewUrl(null);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [previewUrl]);

    const runSearch = useCallback(async (term: string, type: 'catalog' | 'listings') => {
        const q = String(term ?? "").trim();
        if (!q) return;
        setLoading(true);
        setSearchType(type);
        try {
            const token = getAuthToken();
            const res = await fetch(`${getApiBaseUrl()}/api/mercadolivre/catalog/search?q=${encodeURIComponent(q)}&type=${type}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (!res.ok) {
                console.error('ML Search API Error:', data);
                const detail = data?.detail || data?.error || '';
                let notice = "Erro ao buscar no Mercado Livre.";
                if (detail.toLowerCase().includes("403") || 
                    detail.toLowerCase().includes("acesso negado")) {
                    notice = 
                        "Sua aplicação ML ainda não tem acesso ao catálogo oficial. " +
                        "Use a aba 'Anúncios Gerais' enquanto isso.";
                } else if (detail) {
                    notice = `Erro ML: ${detail.slice(0, 200)}`;
                }
                setMlSearchNotice(notice);
                setResults([]);
                return;
            }
            setResults(data.results || []);
            if (data.listingsFallback || (type === 'listings' && data.type === 'catalog')) {
                setSearchType('catalog');
                setMlSearchNotice(typeof data.message === 'string' ? data.message : null);
            } else {
                setMlSearchNotice(null);
            }
        } catch (err) {
            console.error('ML Search Error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!isOpen) {
            openedForSession.current = false;
            return;
        }
        if (openedForSession.current) return;
        openedForSession.current = true;

        setSearchTerm(String(initialTerm ?? ""));
        const type = defaultSearchType;
        setSearchType(type);
        setResults([]);
        setMlSearchNotice(null);

        const q = String(initialTerm ?? "").trim();
        if (autoSearchOnOpen && q.length >= ML_AUTOSEARCH_MIN_LEN) {
            void runSearch(q, type);
        }
    }, [isOpen, initialTerm, autoSearchOnOpen, defaultSearchType, runSearch]);

    const handleSearch = async (overrideType?: 'catalog' | 'listings') => {
        const type = overrideType ?? searchType;
        await runSearch(searchTerm, type);
    };

    const processSelection = async (item: any) => {
        setLoading(true);
        try {
            const token = getAuthToken();
            const isListing = searchType === 'listings';
            const res = await fetch(`${getApiBaseUrl()}/api/mercadolivre/catalog/product/${item.id}?isListing=${isListing}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const details = await res.json();

            console.log('ML ProcessSelection Details:', details);

            const attrs = details.attributes || item.attributes || [];

            // Helper robusto para encontrar atributos
            const findAttr = (ids: string[]) => {
                const attr = attrs.find((a: any) => ids.includes(a.id.toUpperCase()));
                return attr ? (attr.value_name || attr.value_struct?.number || '') : '';
            };

            // Mapear compatibilidades se existirem
            const rawCompats = details.compatibilities || [];
            const mappedCompats = rawCompats.map((c: any) => {
                const cAttrs = c.attributes || [];
                const f = (ids: string[]) => {
                    const attr = cAttrs.find((a: any) => ids.includes(a.id.toUpperCase()));
                    return attr ? (attr.value_name || attr.value_struct?.number || '') : '';
                };
                return {
                    marca: f(['BRAND', 'VEHICLE_BRAND', 'VEHICLE_MANUFACTURER', 'MARCA', 'FABRICANTE']),
                    modelo: f(['MODEL', 'VEHICLE_MODEL', 'CAR_MODEL', 'MODELO']),
                    ano: f(['VEHICLE_YEAR', 'YEAR', 'MANUFACTURE_YEAR', 'ANO']),
                    versao: f(['VERSION', 'VEHICLE_VERSION', 'CAR_VERSION', 'VERSAO', 'TRIM'])
                };
            }).filter((c: any) => c.marca || c.modelo);

            const result = {
                nome: details.title || details.name || item.name || item.title,
                meli_id: item.id,
                marca: findAttr(['BRAND', 'VEHICLE_BRAND', 'VEHICLE_MANUFACTURER', 'MARCA', 'FABRICANTE']),
                modelo: findAttr(['MODEL', 'VEHICLE_MODEL', 'CAR_MODEL', 'MODELO']),
                ano: findAttr(['VEHICLE_YEAR', 'YEAR', 'MANUFACTURE_YEAR', 'ANO']),
                versao: findAttr(['VERSION', 'VEHICLE_VERSION', 'CAR_VERSION', 'VERSAO', 'TRIM']),
                part_number: findAttr(['PART_NUMBER', 'OEM_PART_NUMBER', 'CODIGO_PECA', 'SKU']),
                categoria_id: details.category_id || item.category_id,
                imagem_url: details.pictures?.[0]?.url || item.thumbnail || item.secure_thumbnail,
                compatibilidades: mappedCompats
            };

            console.log('ML Mapped Result:', result);
            onSelect(result);
            onClose();
        } catch (err) {
            console.error('Error processing ML selection:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Sincronizar com Mercado Livre"
            className="max-w-3xl"
        >
            <div className="space-y-4 py-4">
                <div className="flex flex-col gap-4">
                    <div className="flex gap-2">
                        <Input
                            placeholder="Nome da peça, Part Number ou SKU..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            className="h-11 border-primary/20 bg-muted/30 focus-visible:ring-primary/30"
                        />
                        <Button onClick={() => handleSearch()} disabled={loading} className="bg-[#FFE600] text-black h-11 px-6 font-bold hover:bg-[#FFE600]/90">
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-5 h-5" />}
                        </Button>
                    </div>

                    <div className="flex border-b">
                        <button
                            className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${searchType === 'catalog' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}
                            onClick={() => handleSearch('catalog')}
                        >
                            Catálogo Oficial (Ficha Técnica)
                        </button>
                        <button
                            className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${searchType === 'listings' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}
                            onClick={() => handleSearch('listings')}
                        >
                            Anúncios Gerais (Sugestões de Vendedores)
                        </button>
                    </div>
                    {mlSearchNotice && (
                        <p className="text-xs text-amber-800 dark:text-amber-200/90 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800 rounded-lg px-3 py-2 leading-snug">
                            {mlSearchNotice}
                        </p>
                    )}
                </div>

                <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                    {results.length === 0 && !loading && (
                        <div className="text-center py-16 text-muted-foreground flex flex-col items-center gap-2">
                            <Package className="w-12 h-12 opacity-10" />
                            <p className="italic text-sm">Pesquise por um termo para ver resultados do Mercado Livre.</p>
                        </div>
                    )}

                    {results.map((item) => {
                        const thumbUrl = getMlSearchResultImageUrl(item);
                        const largePreviewUrl = upgradeMlThumbToLarge(thumbUrl || '');

                        return (
                            <div
                                key={item.id}
                                className="flex items-center gap-4 p-3 border rounded-2xl hover:bg-muted/50 transition-all cursor-pointer group hover:border-primary/50"
                                onClick={() => processSelection(item)}
                            >
                                <button
                                    type="button"
                                    title="Ampliar foto"
                                    className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-xl bg-white border flex-shrink-0 overflow-hidden shadow-sm flex items-center justify-center cursor-zoom-in group/thumb"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (largePreviewUrl) setPreviewUrl(largePreviewUrl);
                                    }}
                                >
                                    {thumbUrl ? (
                                        <>
                                            <img
                                                src={thumbUrl}
                                                alt={item.name || item.title}
                                                className="w-full h-full object-contain"
                                                loading="lazy"
                                                decoding="async"
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).src = 'https://placehold.co/400x400?text=Sem+Foto';
                                                }}
                                            />
                                            <span className="absolute bottom-1 right-1 rounded-full bg-black/55 p-1 text-white opacity-0 group-hover/thumb:opacity-100 transition-opacity pointer-events-none">
                                                <ZoomIn className="w-3.5 h-3.5" aria-hidden />
                                            </span>
                                        </>
                                    ) : (
                                        <Package className="w-8 h-8 text-muted-foreground/20" />
                                    )}
                                </button>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${searchType === 'catalog' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'}`}>
                                            {searchType === 'catalog' ? 'Catálogo' : 'Anúncio'}
                                        </span>
                                        {item.id.length > 5 && <span className="text-[9px] font-mono text-muted-foreground">{item.id}</span>}
                                    </div>
                                    <h4 className="font-bold text-sm truncate group-hover:text-primary transition-colors">{item.name || item.title}</h4>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        {(item.attributes || []).slice(0, 4).map((attr: any) => (
                                            <span key={attr.id} className="text-[8px] bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                                                {attr.name}: <span className="text-foreground font-medium">{attr.value_name}</span>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <Button size="sm" variant="outline" className="opacity-0 group-hover:opacity-100 transition-all rounded-full border-primary/30 text-primary h-8">
                                    <Check className="w-4 h-4 mr-1" /> Selecionar
                                </Button>
                            </div>
                        );
                    })}
                </div>
            </div>
        </Modal>
        {previewUrl &&
            createPortal(
                <div
                    className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/88 p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Pré-visualização da foto"
                    onClick={() => setPreviewUrl(null)}
                >
                    <button
                        type="button"
                        className="absolute top-4 right-4 rounded-full bg-white/15 p-2.5 text-white hover:bg-white/25 z-[101] transition-colors"
                        onClick={() => setPreviewUrl(null)}
                        aria-label="Fechar"
                    >
                        <X className="w-5 h-5" />
                    </button>
                    <img
                        src={previewUrl}
                        alt="Pré-visualização do anúncio ou catálogo Mercado Livre"
                        className="max-h-[min(90vh,900px)] max-w-[min(95vw,1200px)] object-contain rounded-lg shadow-2xl select-none"
                        onClick={(e) => e.stopPropagation()}
                    />
                    <p className="mt-3 text-center text-xs text-white/65">Clique fora da imagem ou Esc para fechar</p>
                </div>,
                document.body
            )}
        </>
    );
}
