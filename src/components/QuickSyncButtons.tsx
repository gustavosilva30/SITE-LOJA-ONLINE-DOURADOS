
import React, { useState, useEffect } from 'react';
import { getApiBaseUrl } from '@/lib/apiBase';
import { api } from '@/lib/api';
import { ShoppingBag, Check, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { MLIcon } from './MLIcon';
import { cn } from '@/lib/utils';
import { mlListingStatusLabel } from '@/lib/mlListingStatus';
import { getAuthToken } from '@/lib/auth';

interface MLAccount {
    id: string;
    ml_nickname: string;
}

interface QuickSyncButtonsProps {
    productId: string;
    isPublished: boolean;
    productName: string;
    /** Base para public_price ao ativar a loja (paridade com RPC publish_product_to_marketplace). */
    preco: number;
    precoLojaOnline?: number | null;
    mlAccounts: MLAccount[];
    initialLinks?: any[];
    onSync?: () => void;
}

function publicPriceFromBase(base: number): number {
    if (base < 100) return base * 1.2;
    if (base < 500) return base * 1.15;
    return base * 1.1;
}

export function QuickSyncButtons({
    productId,
    isPublished,
    productName,
    preco,
    precoLojaOnline,
    mlAccounts,
    initialLinks,
    onSync
}: QuickSyncButtonsProps) {
    const [loadingStore, setLoadingStore] = useState(false);
    const [loadingAccount, setLoadingAccount] = useState<string | null>(null);
    const [linkedItems, setLinkedItems] = useState<Record<string, string>>({}); // { accountId: mlItemId }
    const [localIsPublished, setLocalIsPublished] = useState(isPublished);
    const [linksLoaded, setLinksLoaded] = useState(false);

    const fetchLinks = async (): Promise<Record<string, string>> => {
        if (linksLoaded) return linkedItems;
        const mapping: Record<string, string> = {};
        try {
            const data = await api.get(
                `/api/mercadolivre/product-links?produto_id=${encodeURIComponent(productId)}`,
            );
            const rows = Array.isArray(data) ? data : [];
            rows.forEach((l: { ml_account_id?: string; ml_item_id?: string }) => {
                if (l.ml_account_id && l.ml_item_id != null) {
                    mapping[l.ml_account_id] = String(l.ml_item_id);
                }
            });
        } catch (e) {
            console.error(e);
        }
        setLinkedItems(mapping);
        setLinksLoaded(true);
        return mapping;
    };

    useEffect(() => {
        setLocalIsPublished(isPublished);
        
        const mapping: Record<string, string> = {};
        if (Array.isArray(initialLinks) && initialLinks.length > 0) {
            initialLinks.forEach((l: any) => {
                if (l.ml_account_id && l.ml_item_id) {
                    mapping[l.ml_account_id] = String(l.ml_item_id);
                }
            });
            setLinkedItems(mapping);
            setLinksLoaded(true);
        } else {
            setLinkedItems({});
            setLinksLoaded(false);
        }
    }, [productId, isPublished, initialLinks]);

    const toggleStore = async () => {
        setLoadingStore(true);
        try {
            if (!localIsPublished) {
                const loja = Number(precoLojaOnline);
                const p = Number(preco);
                const base = loja > 0 ? loja : p > 0 ? p : 0;
                if (base <= 0) {
                    toast.error(
                        'Defina preço de venda ou preço da loja online maior que zero antes de publicar.',
                    );
                    return;
                }
                await api.put(`/api/estoque/produtos/${productId}`, {
                    is_published: true,
                    public_price: publicPriceFromBase(base),
                });
            } else {
                await api.put(`/api/estoque/produtos/${productId}`, { is_published: false });
            }
            setLocalIsPublished(!localIsPublished);
            if (onSync) onSync();
        } catch (err: unknown) {
            console.error(err);
            const msg = err instanceof Error ? err.message : String(err);
            toast.error(msg || 'Falha ao atualizar loja online');
        } finally {
            setLoadingStore(false);
        }
    };

    const handleSyncStatus = async (account: MLAccount, itemId: string) => {
        setLoadingAccount(account.id);
        try {
            const token = getAuthToken();
            const response = await fetch(`${getApiBaseUrl()}/api/mercadolivre/sync-status`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    ml_item_id: itemId,
                    account_id: account.id
                })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Erro ao sincronizar');

            const st = typeof data.status === 'string' ? data.status : null;
            const detail = typeof data.detail === 'string' ? data.detail : '';
            const label = mlListingStatusLabel(st);
            toast.success('Status do anúncio (ML)', {
                description: detail ? `${label} — ${detail}` : label,
                duration: 6000,
            });

            if (onSync) onSync();
        } catch (err: any) {
            console.error(err);
            toast.error(`Erro ao sincronizar: ${err.message}`);
        } finally {
            setLoadingAccount(null);
        }
    };

    const handleMLClick = async (account: MLAccount) => {
        const currentLinks = linksLoaded ? linkedItems : await fetchLinks();
        const mlItemId = currentLinks[account.id];
        if (mlItemId) {
            // Se já está vinculado, ao clicar fazemos a atualização instantânea do status
            await handleSyncStatus(account, mlItemId);
            return;
        }

        setLoadingAccount(account.id);
        try {
            const token = getAuthToken();
            const response = await fetch(`${getApiBaseUrl()}/api/mercadolivre/publish`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    produto_id: productId,
                    account_id: account.id,
                    listing_type_id: 'gold_special'
                })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Erro ao publicar');

            toast.success(`Anunciado na conta ${account.ml_nickname}!`);
            const newLinks = await fetchLinks();
            const newItemId = newLinks[account.id];
            if (newItemId) {
                // Sincronizar status automaticamente sem mostrar loading extra
                try {
                    const token = getAuthToken();
                    await fetch(`${getApiBaseUrl()}/api/mercadolivre/sync-status`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${token}`
                        },
                        body: JSON.stringify({ ml_item_id: newItemId, account_id: account.id })
                    });
                } catch (e) {
                    console.warn('[QuickSync] sync-status pós-publish falhou:', e);
                }
            }
            if (onSync) onSync();
        } catch (err: any) {
            console.error(err);
            toast.error(`Erro ao anunciar em ${account.ml_nickname}: ${err.message}`);
        } finally {
            setLoadingAccount(null);
        }
    };

    const getInitials = (name: string) => {
        return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    };

    return (
        <div className="flex items-center gap-1.5 p-1 bg-slate-100/50 backdrop-blur-sm rounded-full w-fit border border-slate-200 shadow-sm">
            {/* Botão Loja Online */}
            <button
                onClick={(e) => { e.stopPropagation(); toggleStore(); }}
                disabled={loadingStore}
                title={localIsPublished ? 'Publicado na Loja (Clique para desativar)' : 'Publicar na Loja'}
                className={cn(
                    "relative w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 shadow-sm",
                    localIsPublished 
                        ? "bg-emerald-500 text-white hover:bg-emerald-600 scale-105" 
                        : "bg-white text-slate-400 hover:text-emerald-500 border border-slate-200"
                )}
            >
                {loadingStore ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                    <ShoppingBag className="w-4 h-4" />
                )}
                {localIsPublished && (
                    <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-white rounded-full flex items-center justify-center border border-emerald-500">
                        <Check className="w-1.5 h-1.5 text-emerald-500" strokeWidth={3} />
                    </div>
                )}
            </button>

            {/* Separador se houver contas ML */}
            {mlAccounts.length > 0 && <div className="w-[1px] h-4 bg-slate-300 mx-0.5" />}

            {/* Botões ML */}
            {mlAccounts.map(acc => {
                const mlItemId = linkedItems[acc.id];
                const isLinked = !!mlItemId;
                const isLoading = loadingAccount === acc.id;

                return (
                    <button
                        key={acc.id}
                        onClick={(e) => { e.stopPropagation(); handleMLClick(acc); }}
                        disabled={!!loadingAccount}
                        title={isLinked ? `${acc.ml_nickname} (Publicado - Clique para atualizar status)` : `${acc.ml_nickname} (Anunciar agora)`}
                        className={cn(
                            "relative w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 shadow-sm overflow-hidden group",
                            isLinked 
                                ? "bg-white border-2 border-[#FFE600] text-slate-700 hover:scale-110 active:scale-95" 
                                : "bg-white text-slate-400 border border-slate-200 hover:border-[#FFE600] hover:text-[#FFE600]"
                        )}
                    >
                        {isLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : isLinked ? (
                            <>
                                <MLIcon size={20} className="group-hover:opacity-20" />
                                <RefreshCw className="w-3 h-3 absolute opacity-0 group-hover:opacity-100 text-slate-700 animate-spin-slow" />
                            </>
                        ) : (
                            <span className="text-[10px] font-black">{getInitials(acc.ml_nickname)}</span>
                        )}
                        
                        {isLinked && (
                            <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-[#FFE600] rounded-full flex items-center justify-center border border-white">
                                <Check className="w-1.5 h-1.5 text-slate-700" strokeWidth={3} />
                            </div>
                        )}
                    </button>
                );
            })}
        </div>
    );
}

