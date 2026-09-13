
import React, { useState, useEffect, useMemo } from 'react';
import { getApiBaseUrl } from '@/lib/apiBase';
import { api, mercadolivreApi } from '@/lib/api';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Modal } from './ui/modal';
import { Input } from './ui/input';
import { Upload, CheckCircle2, AlertCircle, Search, Sparkles, PauseCircle, XCircle, Link2Off } from 'lucide-react';
import { MLIcon } from './MLIcon';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { getAuthToken } from '@/lib/auth';

interface PublishMercadoLivreButtonProps {
    productId: string;
    productName: string;
    initialLinks?: any[];
}

export function PublishMercadoLivreButton({
    productId,
    productName,
    initialLinks
}: PublishMercadoLivreButtonProps) {
    const [loading, setLoading] = useState(false);
    /** Todos os vínculos produto↔ML (uma linha por conta/anúncio). */
    const [links, setLinks] = useState<any[]>(initialLinks || []);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedAccountId, setSelectedAccountId] = useState("");
    const [categoryId, setCategoryId] = useState("MLB1648");
    const [predictedCategories, setPredictedCategories] = useState<any[]>([]);
    const [parsedAttributes, setParsedAttributes] = useState<any>(null);

    const fetchStatus = async () => {
        try {
            const data = await api.get(
                `/api/mercadolivre/product-links?produto_id=${encodeURIComponent(productId)}`,
            );
            setLinks(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('mercadolivre_product_links:', error);
            setLinks([]);
        }
    };

    const fetchAccounts = async () => {
        try {
            const data = await mercadolivreApi.listarContas();
            const list = Array.isArray(data) ? data : [];
            setAccounts(list);
            if (list.length > 0) setSelectedAccountId(list[0].id);
        } catch (e) {
            console.error(e);
            setAccounts([]);
        }
    };

    useEffect(() => {
        if (initialLinks) {
            setLinks(initialLinks);
        } else {
            fetchStatus();
        }
        fetchAccounts();
    }, [productId, initialLinks]);

    const handleUnlink = async (linkId: string) => {
        if (!window.confirm("Deseja realmente desvincular este anúncio do produto? Isso não apagará o anúncio no Mercado Livre, mas permitirá publicá-lo novamente.")) {
            return;
        }
        setLoading(true);
        try {
            await api.delete(`/api/mercadolivre/product-links/${linkId}`);
            toast.success("Vínculo desfeito com sucesso!");
            await fetchStatus();
        } catch (error: any) {
            console.error("Erro ao desvincular:", error);
            toast.error("Erro ao desvincular", { description: error?.message || "Falha inesperada" });
        } finally {
            setLoading(false);
        }
    };

    const [catalogResults, setCatalogResults] = useState<any[]>([]);

    const handlePredictCategory = async () => {
        if (!productName) return;
        setLoading(true);
        try {
            const token = getAuthToken();
            const res = await fetch(`${getApiBaseUrl()}/api/mercadolivre/predict-category?title=${encodeURIComponent(productName)}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setPredictedCategories(data || []);
            if (data.length > 0) setCategoryId(data[0].id);
        } catch (err: any) {
            console.error(err);
            toast.error('Erro ao sugerir categoria', { description: err?.message || 'Falha inesperada' });
        } finally {
            setLoading(false);
        }
    };

    const handleAnalyzeTitle = async () => {
        if (!productName) return;
        setLoading(true);
        try {
            const token = getAuthToken();
            const res = await fetch(`${getApiBaseUrl()}/api/mercadolivre/analyze-title`, {
                method: "POST",
                headers: { 
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}` 
                },
                body: JSON.stringify({ title: productName })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setParsedAttributes(data);
            toast.success("Análise concluída com sucesso!");
        } catch (err: any) {
            console.error(err);
            toast.error('Erro ao analisar título', { description: err?.message || 'Falha inesperada' });
        } finally {
            setLoading(false);
        }
    };

    const handleSearchCatalog = async () => {
        if (!productName) return;
        setLoading(true);
        try {
            const token = getAuthToken();
            const res = await fetch(`${getApiBaseUrl()}/api/mercadolivre/catalog/search?q=${encodeURIComponent(productName)}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            setCatalogResults(data.results || []);
        } catch (err: any) {
            console.error(err);
            toast.error('Erro ao buscar catálogo do ML', { description: err?.message || 'Falha inesperada' });
        } finally {
            setLoading(false);
        }
    };

    const handlePublish = async () => {
        if (!selectedAccountId) {
            toast.message('Selecione uma conta do Mercado Livre.')
            return
        }
        if (accountsForModal.length === 0) {
            toast.message('Não há conta disponível para publicar.')
            return
        }

        setLoading(true);
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
                    account_id: selectedAccountId,
                    category_id: categoryId,
                    listing_type_id: 'gold_special',
                    imagem_url: (window as any).lastProductImage || undefined,
                    parsed_attributes: parsedAttributes || undefined
                })
            });

            const data = await response.json();
            if (!response.ok) {
                // Se o erro tiver detalhes, mostra de forma amigável
                throw new Error(data.error || 'Erro ao publicar');
            }

            toast.success('Publicado no Mercado Livre', { description: `"${productName}"` });
            setIsModalOpen(false);

            const [freshLinks, allAccs] = await Promise.all([
                api.get(`/api/mercadolivre/product-links?produto_id=${encodeURIComponent(productId)}`),
                mercadolivreApi.listarContas(),
            ]);
            const linkRows = Array.isArray(freshLinks) ? freshLinks : [];
            const accRows = Array.isArray(allAccs) ? allAccs : [];
            const linked = new Set(
                linkRows.map((l: { ml_account_id: string }) => l.ml_account_id).filter(Boolean),
            );
            const semAnuncio = accRows.filter((a) => a.id && !linked.has(a.id));
            if (semAnuncio.length > 0) {
                const nomes = semAnuncio.map((a) => a.ml_nickname || 'conta').join(', ');
                toast.info('Ainda há conta(s) sem anúncio neste produto', {
                    description: `O CRM publica uma conta de cada vez. Para ${nomes}, use o botão «Publicar também na outra conta» abaixo dos chips do ML.`,
                    duration: 10000,
                });
            }

            void fetchStatus();
        } catch (error: any) {
            console.error('Erro ao publicar:', error);
            toast.error('Erro ao publicar no Mercado Livre', { description: error?.message || 'Falha inesperada' });
        } finally {
            setLoading(false);
        }
    };

    const linkedAccountIds = useMemo(() => new Set(links.map((l) => l.ml_account_id).filter(Boolean)), [links]);
    const accountsSemAnuncio = useMemo(
        () => accounts.filter((a) => !linkedAccountIds.has(a.id)),
        [accounts, linkedAccountIds]
    );
    const accountsForModal = links.length > 0 ? accountsSemAnuncio : accounts;

    const statusConfigFor = (mlStatus: string) =>
        ({
            active: { icon: CheckCircle2, dotColor: 'bg-emerald-400', label: 'Anunciado' },
            paused: { icon: PauseCircle, dotColor: 'bg-amber-400', label: 'Pausado' },
            inactive: { icon: XCircle, dotColor: 'bg-slate-400', label: 'Inativo' },
            closed: { icon: XCircle, dotColor: 'bg-red-500', label: 'Encerrado' },
        }[mlStatus] || { icon: CheckCircle2, dotColor: 'bg-emerald-400', label: 'Anunciado' });

    return (
        <>
            {links.length > 0 ? (
                <div className="flex flex-col gap-1.5 w-full" onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-wrap gap-2">
                        {links.map((link) => {
                            const status = link.ml_status || 'active';
                            const hasSyncError = link.sync_status === 'error';
                            const statusConfig = statusConfigFor(status);
                            const nick = link.mercadolivre_accounts?.ml_nickname || 'Conta';
                            return (
                                <div
                                    key={`${link.ml_account_id}-${link.ml_item_id}`}
                                    className={cn(
                                        'flex items-center gap-1.5 pl-2 pr-1.5 py-0.5 rounded-xl bg-white border-2 shadow-sm hover:shadow-md transition-all max-w-[220px]',
                                        hasSyncError ? 'border-red-500' : 'border-[#FFE600]'
                                    )}
                                >
                                    <a
                                        href={`https://www.mercadolivre.com.br/p/${link.ml_item_id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title={`${nick}: ${link.ml_item_id} — ${statusConfig.label}${hasSyncError ? ' (Erro de sync)' : ''}`}
                                        className="flex items-center gap-1.5"
                                    >
                                        {hasSyncError ? (
                                            <AlertCircle size={12} className="text-red-500 shrink-0" />
                                        ) : (
                                            <MLIcon size={14} />
                                        )}
                                        <div className={`w-1.5 h-1.5 rounded-full ${statusConfig.dotColor} shrink-0`} />
                                        <span className="text-[8px] font-black text-slate-700 uppercase tracking-tight truncate max-w-[85px]">
                                            {nick}
                                        </span>
                                    </a>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-5 w-5 text-slate-400 hover:text-red-500 rounded-full shrink-0"
                                        title="Desvincular anúncio"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            handleUnlink(link.id);
                                        }}
                                        disabled={loading}
                                    >
                                        <Link2Off size={11} />
                                    </Button>
                                </div>
                            );
                        })}
                    </div>
                    {accountsSemAnuncio.length > 0 ? (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                setSelectedAccountId(accountsSemAnuncio[0]?.id || '');
                                setIsModalOpen(true);
                            }}
                            className="border-[#FFE600] text-slate-700 hover:bg-[#FFE600]/10 flex items-center gap-2 w-full h-8 text-[10px]"
                        >
                            <MLIcon size={14} />
                            Publicar também na outra conta
                        </Button>
                    ) : null}
                </div>
            ) : (
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsModalOpen(true)}
                    disabled={accounts.length === 0}
                    className="border-[#FFE600] text-slate-700 hover:bg-[#FFE600]/10 flex items-center gap-2 w-full"
                >
                    <MLIcon size={16} />
                    Publicar no ML
                </Button>
            )}

            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title="Publicar no Mercado Livre"
            >
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <label className="text-sm font-bold uppercase tracking-tight">Título do Anúncio</label>
                            <Button variant="ghost" size="sm" onClick={handleAnalyzeTitle} className="text-xs h-7 gap-1">
                                <Sparkles className="w-3 h-3 text-[#FFE600]" /> Extrair Atributos
                            </Button>
                        </div>
                        <Input value={productName} disabled />
                        {parsedAttributes && (
                            <div className="flex flex-wrap gap-1 mt-1 bg-muted/30 p-2 rounded border">
                                {parsedAttributes.marca && <Badge variant="outline" className="text-[10px]">Marca: {parsedAttributes.marca}</Badge>}
                                {parsedAttributes.modelo && <Badge variant="outline" className="text-[10px]">Modelo: {parsedAttributes.modelo}</Badge>}
                                {parsedAttributes.anos?.length > 0 && <Badge variant="outline" className="text-[10px]">Anos: {parsedAttributes.anos.join(', ')}</Badge>}
                                {parsedAttributes.motor && <Badge variant="outline" className="text-[10px]">Motor: {parsedAttributes.motor}</Badge>}
                                {parsedAttributes.lados?.length > 0 && <Badge variant="outline" className="text-[10px]">Lado: {parsedAttributes.lados.join(', ')}</Badge>}
                                {parsedAttributes.versoes?.length > 0 && <Badge variant="outline" className="text-[10px]">Versões: {parsedAttributes.versoes.join(', ')}</Badge>}
                            </div>
                        )}
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-bold uppercase tracking-tight">Conta do Mercado Livre</label>
                        <select
                            className="w-full p-2 rounded-md border bg-background"
                            value={selectedAccountId}
                            onChange={(e) => setSelectedAccountId(e.target.value)}
                        >
                            {accountsForModal.map(acc => (
                                <option key={acc.id} value={acc.id}>{acc.ml_nickname}</option>
                            ))}
                        </select>
                        {accountsForModal.length > 1 ? (
                            <p className="text-[11px] text-muted-foreground leading-snug">
                                Cada publicação cria <strong>um</strong> anúncio na conta escolhida. Para a outra loja, publique de novo (ou use «Publicar também na outra conta» depois da primeira).
                            </p>
                        ) : null}
                    </div>

                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <label className="text-sm font-bold uppercase tracking-tight">Buscar no Catálogo (Auto-Compatibilidade)</label>
                            <Button variant="ghost" size="sm" onClick={handleSearchCatalog} className="text-xs h-7 gap-1">
                                <Search className="w-3 h-3 text-[#FFE600]" /> Buscar Catálogo
                            </Button>
                        </div>
                        {catalogResults.length > 0 && (
                            <div className="space-y-1 max-h-[150px] overflow-y-auto border rounded-md p-2 bg-muted/30">
                                {catalogResults.map(prod => (
                                    <div
                                        key={prod.id}
                                        className="text-xs p-1 hover:bg-primary/10 cursor-pointer rounded border-b last:border-0"
                                        onClick={() => {
                                            toast.info('Produto do catálogo selecionado. Compatibilidade será preenchida automaticamente no ML.');
                                        }}
                                    >
                                        <p className="font-bold">{prod.name}</p>
                                        <p className="text-[10px] text-muted-foreground">{prod.brand} | {prod.model}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <label className="text-sm font-bold uppercase tracking-tight">ID da Categoria</label>
                            <Button variant="ghost" size="sm" onClick={handlePredictCategory} className="text-xs h-7 gap-1">
                                <Sparkles className="w-3 h-3 text-[#FFE600]" /> Sugerir Inteligente
                            </Button>
                        </div>
                        <Input
                            placeholder="Ex: MLB1234"
                            value={categoryId}
                            onChange={(e) => setCategoryId(e.target.value)}
                        />
                        {predictedCategories.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                                {predictedCategories.slice(0, 3).map(cat => (
                                    <Badge
                                        key={cat.id}
                                        variant="secondary"
                                        className="cursor-pointer hover:bg-primary/20"
                                        onClick={() => setCategoryId(cat.id)}
                                    >
                                        {cat.name}
                                    </Badge>
                                ))}
                            </div>
                        )}
                    </div>

                    <Button
                        onClick={handlePublish}
                        disabled={loading || accountsForModal.length === 0}
                        className="w-full bg-[#FFE600] text-black hover:bg-[#FFE600]/90 font-bold"
                    >
                        {loading ? 'Processando...' : 'Confirmar Publicação'}
                    </Button>
                </div>
            </Modal>
        </>
    );
}
