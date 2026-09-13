import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Search, History, Clock, User, Car, ShieldCheck, Info,
    FileJson, AlertTriangle, Wallet, QrCode, RefreshCw,
    CheckCircle2, Copy, ExternalLink, ChevronDown, X, CalendarDays
} from "lucide-react";
import { plateApi } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { getApiBaseUrl } from "@/lib/apiBase";
import { fmtDateTimeShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import QRCode from "qrcode";

/** Componente que renderiza QR Code em canvas usando a lib 'qrcode'. */
function QrCodeCanvas({ value, size = 200 }: { value: string; size?: number }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        if (!canvasRef.current || !value) return;
        QRCode.toCanvas(canvasRef.current, value, {
            width: size,
            margin: 2,
            color: { dark: '#000000', light: '#ffffff' }
        }).catch(console.error);
    }, [value, size]);
    return <canvas ref={canvasRef} className="border-2 rounded-xl bg-white" />;
}

interface PlateSearchRecord {
    id: string;
    placa: string;
    data_consulta: string;
    atendente_nome: string;
    dados_completos: any;
}

interface BalanceInfo {
    credits: number | null;
    raw?: any;
}

interface PixPayment {
    pixCopiaECola: string | null;
    qrCodeImageUrl: string | null;
    expireDate: string | null;
    amount: number;
    raw?: any;
}

/** Histórico pode trazer JSON como string; Object.entries(string) enumera caracteres (índice 0,1,2…). */
function normalizeDadosCompletos(raw: unknown): Record<string, any> {
    if (raw === null || raw === undefined) return {};
    if (typeof raw === "string") {
        const t = raw.trim();
        if (
            (t.startsWith("{") && t.endsWith("}")) ||
            (t.startsWith("[") && t.endsWith("]"))
        ) {
            try {
                const p = JSON.parse(t);
                if (typeof p === "object" && p !== null && !Array.isArray(p))
                    return p as Record<string, any>;
                return { _json: p };
            } catch {
                return { _texto_bruto: raw };
            }
        }
        return { _texto_bruto: raw };
    }
    if (typeof raw === "object" && !Array.isArray(raw) && raw !== null) {
        const obj = { ...(raw as Record<string, any>) };
        // Normalizações básicas para facilitar o getVal
        if (!obj.marca && obj.fabricante) obj.marca = obj.fabricante;
        if (!obj.chassi && obj.identificacao_chassi) obj.chassi = obj.identificacao_chassi;
        if (!obj.renavam && obj.numero_renavam) obj.renavam = obj.numero_renavam;
        if (!obj.motor && obj.numero_motor) obj.motor = obj.numero_motor;
        if (!obj.combustivel && obj.tipo_combustivel) obj.combustivel = obj.tipo_combustivel;
        if (!obj.anoFabricacao && obj.ano_fabricacao) obj.anoFabricacao = obj.ano_fabricacao;
        if (!obj.anoModelo && obj.ano_modelo) obj.anoModelo = obj.ano_modelo;
        return obj;
    }
    return { _valor: raw };
}

function normalizeFipeEntry(raw: unknown): Record<string, any> | null {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === "string") {
        try {
            const p = JSON.parse(raw);
            if (typeof p === "object" && p !== null && !Array.isArray(p))
                return p as Record<string, any>;
        } catch {
            return null;
        }
        return null;
    }
    if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, any>;
    return null;
}

const flattenObject = (obj: any, prefix = ''): Record<string, string> => {
    let result: Record<string, string> = {};
    if (!obj || typeof obj !== 'object') return result;
    
    for (const key in obj) {
        if (key === '_fipe') continue;
        const value = obj[key];
        
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            const nested = flattenObject(value, `${prefix}${key}_`);
            result = { ...result, ...nested };
        } else if (value !== null && value !== undefined && String(value).trim() !== '') {
            // Exclude noise fields like "sintetico", "fipeId", "faturado_documento", "fipe_codigo"
            if (['sintetico', 'fipeId', 'codigo'].includes(key)) continue;
            result[`${prefix}${key}`] = String(value);
        }
    }
    return result;
};

export default function PlateSearch() {
    const { atendente } = useAuthStore();
    const [plate, setPlate] = useState("");
    const [loading, setLoading] = useState(false);
    const [history, setHistory] = useState<PlateSearchRecord[]>([]);
    const [historyTotal, setHistoryTotal] = useState(0);
    const [historyOffset, setHistoryOffset] = useState(0);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historySearch, setHistorySearch] = useState("");
    const [historySearchInput, setHistorySearchInput] = useState("");
    const [selectedSearch, setSelectedSearch] = useState<PlateSearchRecord | null>(null);
    const [balance, setBalance] = useState<BalanceInfo | null>(null);
    const [balanceLoading, setBalanceLoading] = useState(false);
    const [showPixModal, setShowPixModal] = useState(false);
    const [pixData, setPixData] = useState<PixPayment | null>(null);
    const [pixLoading, setPixLoading] = useState(false);
    const [rechargeValue, setRechargeValue] = useState("1000"); // R$ 10,00 = 1000 centavos
    const [copiedPix, setCopiedPix] = useState(false);

    const PAGE_SIZE = 20;

    const fetchHistory = useCallback(async (opts?: { offset?: number; placa?: string; append?: boolean }) => {
        const offset = opts?.offset ?? 0;
        const placa = opts?.placa ?? historySearch;
        const append = opts?.append ?? false;
        setHistoryLoading(true);
        try {
            const data = await plateApi.listarHistorico({ limit: PAGE_SIZE, offset, placa: placa || undefined });
            const items: PlateSearchRecord[] = Array.isArray(data?.items) ? data.items : [];
            const total: number = typeof data?.total === 'number' ? data.total : 0;
            setHistoryTotal(total);
            setHistory(prev => append ? [...prev, ...items] : items);
        } catch (e) {
            console.error('[PlateSearch] fetchHistory error:', e);
        } finally {
            setHistoryLoading(false);
        }
    }, [historySearch]);

    const fetchBalance = async () => {
        setBalanceLoading(true);
        try {
            const data = await plateApi.balance();
            console.log('[PlateSearch] Balance data:', data);
            
            // Prioriza o campo 'Saldo' (capitalizado) que vimos vir do backend
            const creditsVal = data?.credits ?? data?.dados?.Saldo ?? data?.dados?.credits ?? data?.saldo ?? data?.Saldo ?? null;
            setBalance({ credits: creditsVal, raw: data });
        } catch (e) {
            console.error('Erro ao buscar saldo:', e);
        } finally {
            setBalanceLoading(false);
        }
    };

    useEffect(() => {
        setHistoryOffset(0);
        fetchHistory({ offset: 0, placa: historySearch || undefined });
        fetchBalance();
    }, [historySearch]);

    const handleLoadMore = () => {
        const newOffset = historyOffset + PAGE_SIZE;
        setHistoryOffset(newOffset);
        fetchHistory({ offset: newOffset, append: true });
    };

    const handleHistorySearch = (e: React.FormEvent) => {
        e.preventDefault();
        setHistorySearch(historySearchInput);
    };

    const clearHistorySearch = () => {
        setHistorySearchInput("");
        setHistorySearch("");
    };

    const handleSearch = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();

        // ⚠️ Capturar o valor do input ANTES de qualquer setState
        // Isso evita que o React sobrescreva o estado antes da requisição
        const plateSnapshot = plate;
        const cleanPlate = plateSnapshot.trim().toUpperCase();

        console.log('[PlateSearch] Buscando placa:', cleanPlate, '| estado atual:', plate);

        if (!cleanPlate || loading) return;

        setLoading(true);
        setPlate(''); // Limpa o input imediatamente para evitar double-submit

        try {
            const searchData = await plateApi.decode({
                plate: cleanPlate,
                atendenteId: atendente?.id,
                atendenteNome: atendente?.nome
            });

            // Montar dados_completos igual ao que está no banco:
            // dados_brutos = objeto da API Full + _fipe = dados FIPE
            const dadosCompletos = {
                ...(searchData.dados_brutos || {}),
                _fipe: searchData.fipe || null,
            };

            // Mostrar resultado imediatamente (sem esperar salvar no banco)
            setSelectedSearch({
                id: 'new-' + Date.now(),
                placa: searchData.placa || cleanPlate,
                data_consulta: new Date().toISOString(),
                atendente_nome: atendente?.nome || 'Sistema',
                dados_completos: dadosCompletos,
            });

            // Recarregar histórico e saldo após delay (salvar no banco é async)
            setTimeout(() => { fetchHistory({ offset: 0 }); setHistoryOffset(0); fetchBalance(); }, 2000);
        } catch (error: any) {
            console.error('[PlateSearch] Erro:', error);
            alert(error.message || 'Erro de rede ao consultar a placa.');
            setPlate(cleanPlate); // Devolve a placa no input caso haja erro de rede
        } finally {
            setLoading(false);
        }
    };

    const handleGeneratePix = async () => {
        const valueCents = parseInt(rechargeValue, 10);
        if (isNaN(valueCents) || valueCents < 100) {
            alert("Valor mínimo: R$ 1,00 (100 centavos)");
            return;
        }
        setPixLoading(true);
        try {
            const data = await plateApi.payment(valueCents);
            setPixData(data);
        } catch (e: any) {
            alert("Erro ao gerar PIX: " + e.message);
        } finally {
            setPixLoading(false);
        }
    };

    const copyPix = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedPix(true);
        setTimeout(() => setCopiedPix(false), 2000);
    };

    const renderDataValue = (val: any) => {
        if (typeof val === 'object' && val !== null) return JSON.stringify(val);
        return String(val);
    };

    const pixCode = pixData?.pixCopiaECola || '';
    const qrCodeUrl = pixData?.qrCodeImageUrl || null;
    const saldoDisplayValue = balance?.credits;

    const deepFind = (obj: any, keyVariations: string[]): any => {
        if (!obj || typeof obj !== 'object') return undefined;
        
        for (const k of keyVariations) {
            const lowerK = k.toLowerCase();
            const exactKey = Object.keys(obj).find(ok => ok.toLowerCase() === lowerK);
            if (exactKey !== undefined) return obj[exactKey];
        }
        
        for (const k in obj) {
            if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
                const found = deepFind(obj[k], keyVariations);
                if (found !== undefined) return found;
            }
        }
        return undefined;
    };

    const getVal = (obj: any, key: string) => {
        if (!obj) return '--';
        
        let variations = [key];
        const snake = key.replace(/([A-Z])/g, "_$1").toLowerCase();
        if (snake !== key) variations.push(snake);
        
        const lowKey = key.toLowerCase();
        if (lowKey === 'motor') variations.push('numero_motor', 'motor_descricao');
        else if (lowKey === 'chassi') variations.push('identificacao_chassi', 'vin');
        else if (lowKey === 'renavam') variations.push('numero_renavam');
        else if (lowKey === 'marca') variations.push('fabricante');
        else if (lowKey === 'cor') variations.push('cor_veiculo');
        else if (lowKey === 'anofabricacao') variations.push('ano_fabricacao');
        else if (lowKey === 'anomodelo') variations.push('ano_modelo');
        else if (lowKey === 'cilindrada') variations.push('cilindradas', 'potencia_motor');
        else if (lowKey === 'potencia') variations.push('potencia_cv');
        else if (lowKey === 'municipio') variations.push('cidade');
        else if (lowKey === 'tipoveiculo') variations.push('tipo_veiculo');

        let val = deepFind(obj, variations);

        if (typeof val === 'object' && val !== null) {
            if (val.numero !== undefined && val.numero !== null) return String(val.numero);
            if (val.descricao !== undefined && val.descricao !== null) return String(val.descricao);
            if (val.nome !== undefined && val.nome !== null) return String(val.nome);
            if (val.valor !== undefined && val.valor !== null) return String(val.valor);
            if (val.text !== undefined && val.text !== null) return String(val.text);
            if (val.tipo !== undefined && val.tipo !== null) return String(val.tipo);
            
            const firstValid = Object.values(val).find(v => v !== null && v !== undefined && String(v).trim() !== '');
            if (firstValid !== undefined) return String(firstValid);

            return JSON.stringify(val);
        }
        
        return val !== undefined && val !== null && String(val).trim() !== '' ? String(val) : '--';
    };

    const dadosCompletosNorm = useMemo(
        () => (selectedSearch ? normalizeDadosCompletos(selectedSearch.dados_completos) : null),
        [selectedSearch],
    );
    const fipeNorm = useMemo(
        () => (dadosCompletosNorm ? normalizeFipeEntry(dadosCompletosNorm._fipe) : null),
        [dadosCompletosNorm],
    );

    return (
        <div className="p-6 space-y-6 max-w-7xl mx-auto print:p-0 print:space-y-4">
            <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                        Consulta Inteligente de Placa
                    </h1>
                    <p className="text-muted-foreground text-sm flex items-center gap-2 mt-1">
                        <ShieldCheck className="w-4 h-4 text-emerald-500" />
                        Dados oficiais via API Full — <span className="font-semibold text-foreground">R$ 0,10</span> por consulta — salvo automaticamente no histórico
                    </p>
                </div>

                {/* Widget de Saldo */}
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-card border rounded-xl shadow-sm">
                        <Wallet className="w-4 h-4 text-emerald-500" />
                        <div className="text-right">
                            <div className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Saldo API</div>
                            <div className="font-black text-xl leading-none">
                                {balanceLoading ? (
                                    <RefreshCw className="w-4 h-4 animate-spin inline" />
                                ) : saldoDisplayValue !== null ? (
                                    <span className={Number(saldoDisplayValue) < 10 ? 'text-rose-500' : 'text-emerald-600'}>
                                        {typeof saldoDisplayValue === 'number' && saldoDisplayValue % 1 !== 0 
                                            ? `R$ ${saldoDisplayValue.toFixed(2).replace('.', ',')}` 
                                            : saldoDisplayValue}
                                    </span>
                                ) : (
                                    <span className="text-muted-foreground text-xs">—</span>
                                )}
                            </div>
                            <div className="text-[9px] uppercase text-muted-foreground/60 font-black tracking-tighter">
                                {typeof saldoDisplayValue === 'number' && saldoDisplayValue % 1 !== 0 ? 'Saldo em R$' : 'Créditos'}
                            </div>
                        </div>
                        <button onClick={fetchBalance} className="p-1 rounded hover:bg-muted transition-colors ml-1" title="Atualizar saldo">
                            <RefreshCw className="w-3 h-3 text-muted-foreground" />
                        </button>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowPixModal(true)}
                        className="gap-2 border-emerald-500/40 text-emerald-700 hover:bg-emerald-50"
                    >
                        <QrCode className="w-4 h-4" />
                        Recarregar via PIX
                    </Button>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 print:block">
                {/* Coluna Esquerda */}
                <div className="lg:col-span-4 space-y-6 print:hidden">
                    <Card className="border-primary/20 shadow-lg shadow-primary/5 overflow-hidden">
                        <div className="h-1.5 bg-primary w-full"></div>
                        <CardHeader className="pb-4">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Search className="w-5 h-5 text-primary" />
                                Nova Consulta
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSearch} className="flex gap-2">
                                <Input
                                    placeholder="ABC1D23"
                                    value={plate}
                                    onChange={e => setPlate(e.target.value.toUpperCase())}
                                    className="uppercase font-mono text-lg tracking-widest h-12"
                                    maxLength={8}
                                />
                                <Button size="lg" disabled={loading || !plate.trim()} className="h-12 px-6">
                                    {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                                </Button>
                            </form>
                            <p className="text-[10px] text-muted-foreground mt-2 text-center">
                                Cada consulta custa <span className="font-bold text-foreground">R$ 0,10</span> do saldo API Full
                            </p>
                        </CardContent>
                    </Card>

                    {/* Histórico */}
                    <Card>
                        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                                <History className="w-4 h-4 shrink-0" />
                                <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                                    Histórico
                                </CardTitle>
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-bold">
                                    {historyTotal}
                                </Badge>
                            </div>
                            <button
                                onClick={() => fetchHistory({ offset: 0 })}
                                className="p-1 rounded hover:bg-muted transition-colors shrink-0"
                                title="Recarregar histórico"
                            >
                                <RefreshCw className={`w-3 h-3 text-muted-foreground ${historyLoading ? 'animate-spin' : ''}`} />
                            </button>
                        </CardHeader>

                        {/* Barra de busca */}
                        <div className="px-3 pb-2">
                            <form onSubmit={handleHistorySearch} className="relative flex items-center gap-1">
                                <div className="relative flex-1">
                                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                                    <input
                                        type="text"
                                        placeholder="Buscar placa..."
                                        value={historySearchInput}
                                        onChange={e => setHistorySearchInput(e.target.value.toUpperCase())}
                                        className="w-full h-8 pl-8 pr-7 rounded-lg border border-border/60 bg-muted/40 text-xs font-mono uppercase focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-all"
                                    />
                                    {historySearchInput && (
                                        <button
                                            type="button"
                                            onClick={clearHistorySearch}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    )}
                                </div>
                                <button
                                    type="submit"
                                    className="h-8 px-2.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold transition-colors"
                                >
                                    <Search className="w-3 h-3" />
                                </button>
                            </form>
                            {historySearch && (
                                <div className="mt-1.5 flex items-center gap-1.5">
                                    <span className="text-[10px] text-muted-foreground">Filtrando por:</span>
                                    <Badge
                                        variant="secondary"
                                        className="text-[10px] px-1.5 py-0 font-mono gap-1 cursor-pointer hover:bg-destructive/10 hover:text-destructive"
                                        onClick={clearHistorySearch}
                                    >
                                        {historySearch} <X className="w-2.5 h-2.5" />
                                    </Badge>
                                    <span className="text-[10px] text-muted-foreground">
                                        {historyTotal} resultado{historyTotal !== 1 ? 's' : ''}
                                    </span>
                                </div>
                            )}
                        </div>

                        <CardContent className="px-2 pb-3">
                            <div
                                className="space-y-1 overflow-y-auto"
                                style={{ maxHeight: 'calc(100vh - 440px)', minHeight: '120px' }}
                            >
                                {/* Agrupamento por data */}
                                {(() => {
                                    const groups = history.reduce<Record<string, PlateSearchRecord[]>>((acc, item) => {
                                        const date = new Date(item.data_consulta);
                                        const today = new Date();
                                        const yesterday = new Date();
                                        yesterday.setDate(today.getDate() - 1);

                                        let label: string;
                                        if (date.toDateString() === today.toDateString()) {
                                            label = 'Hoje';
                                        } else if (date.toDateString() === yesterday.toDateString()) {
                                            label = 'Ontem';
                                        } else {
                                            label = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
                                        }
                                        if (!acc[label]) acc[label] = [];
                                        acc[label].push(item);
                                        return acc;
                                    }, {});

                                    const entries = Object.entries(groups);

                                    if (historyLoading && history.length === 0) {
                                        return (
                                            <div className="flex items-center justify-center py-8">
                                                <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
                                            </div>
                                        );
                                    }

                                    if (entries.length === 0) {
                                        return (
                                            <div className="py-8 text-center space-y-2">
                                                <History className="w-8 h-8 text-muted-foreground/30 mx-auto" />
                                                <p className="text-xs text-muted-foreground italic">
                                                    {historySearch ? 'Nenhuma placa encontrada.' : 'Nenhuma consulta registrada.'}
                                                </p>
                                            </div>
                                        );
                                    }

                                    return entries.map(([dateLabel, items]) => (
                                        <div key={dateLabel}>
                                            {/* Separador de data */}
                                            <div className="flex items-center gap-2 px-1 py-1.5 sticky top-0 bg-background z-10">
                                                <CalendarDays className="w-3 h-3 text-muted-foreground/50" />
                                                <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/60">
                                                    {dateLabel}
                                                </span>
                                                <div className="flex-1 h-px bg-border/40" />
                                                <span className="text-[9px] text-muted-foreground/40 font-bold">{items.length}</span>
                                            </div>

                                            {/* Cards do grupo */}
                                            <div className="space-y-1 mb-1">
                                                {items.map(item => {
                                                    const info = normalizeDadosCompletos(item.dados_completos);
                                                    const marca = getVal(info, 'marca');
                                                    const modelo = getVal(info, 'modelo');
                                                    const anoFab = getVal(info, 'anoFabricacao');
                                                    const anoMod = getVal(info, 'anoModelo');
                                                    const cor = getVal(info, 'cor');
                                                    const isSelected = selectedSearch?.id === item.id;

                                                    const time = new Date(item.data_consulta).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

                                                    return (
                                                        <button
                                                            key={item.id}
                                                            onClick={() => setSelectedSearch(item)}
                                                            className={cn(
                                                                "w-full text-left rounded-xl border transition-all duration-200 group overflow-hidden",
                                                                isSelected
                                                                    ? "border-primary bg-primary/5 ring-1 ring-primary/20 shadow-sm"
                                                                    : "border-border/40 bg-card/50 hover:border-primary/40 hover:bg-primary/5 hover:shadow-md"
                                                            )}
                                                        >
                                                            {/* Faixa colorida superior */}
                                                            <div className={`h-0.5 w-full transition-all ${isSelected ? 'bg-primary' : 'bg-transparent group-hover:bg-primary/40'}`} />

                                                            <div className="px-3 py-2.5 flex items-center gap-3">
                                                                {/* Placa visual */}
                                                                <div className="shrink-0 w-14 h-9 bg-slate-100 dark:bg-slate-800 rounded border-2 border-slate-300 dark:border-slate-600 flex flex-col items-center justify-center font-mono shadow-inner">
                                                                    <div className="w-full h-1.5 bg-blue-600 rounded-t-sm" />
                                                                    <span className="text-[9px] font-black leading-none text-slate-800 dark:text-slate-200 mt-0.5 tracking-wider">
                                                                        {item.placa}
                                                                    </span>
                                                                </div>

                                                                {/* Info do veículo */}
                                                                <div className="min-w-0 flex-1">
                                                                    <div className={cn(
                                                                        "text-[11px] font-black truncate leading-tight transition-colors",
                                                                        isSelected ? 'text-primary' : 'group-hover:text-primary'
                                                                    )}>
                                                                        {[marca, modelo].filter(v => v !== '--').join(' ') || '—'}
                                                                    </div>
                                                                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                                                        {anoFab !== '--' && (
                                                                            <span className="text-[9px] font-bold text-muted-foreground/70 bg-muted px-1.5 rounded-full">
                                                                                {anoFab}{anoMod !== '--' && anoMod !== anoFab ? `/${anoMod}` : ''}
                                                                            </span>
                                                                        )}
                                                                        {cor !== '--' && (
                                                                            <span className="text-[9px] font-bold text-muted-foreground/70 bg-muted px-1.5 rounded-full truncate max-w-[70px]" title={cor}>
                                                                                {cor}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {/* Horário + atendente */}
                                                                <div className="shrink-0 text-right">
                                                                    <div className="text-[10px] font-bold text-muted-foreground/80 flex items-center gap-1 justify-end">
                                                                        <Clock className="w-2.5 h-2.5" />
                                                                        {time}
                                                                    </div>
                                                                    <div className="text-[9px] text-muted-foreground/50 truncate max-w-[72px] text-right" title={item.atendente_nome}>
                                                                        {item.atendente_nome || 'Sistema'}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ));
                                })()}

                                {/* Botão carregar mais */}
                                {history.length < historyTotal && (
                                    <button
                                        onClick={handleLoadMore}
                                        disabled={historyLoading}
                                        className="w-full mt-1 py-2 rounded-xl border border-dashed border-border/60 text-xs text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-all flex items-center justify-center gap-2 font-bold"
                                    >
                                        {historyLoading
                                            ? <><RefreshCw className="w-3 h-3 animate-spin" /> Carregando...</>
                                            : <><ChevronDown className="w-3 h-3" /> Ver mais ({historyTotal - history.length} restante{historyTotal - history.length !== 1 ? 's' : ''})</>}
                                    </button>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Coluna Direita */}
                <div className="lg:col-span-8 print:w-full print:col-span-12">
                    {selectedSearch ? (
                        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-400">
                            {/* Cabeçalho do resultado */}
                            <div className="flex items-center justify-between bg-card p-4 rounded-xl border shadow-sm">
                                <div className="flex items-center gap-4">
                                    <div className="w-16 h-12 bg-slate-100 dark:bg-slate-800 rounded border-2 border-slate-300 flex flex-col items-center justify-center font-mono font-bold shadow-inner">
                                        <div className="w-full h-2 bg-blue-600 rounded-t-sm mb-1"></div>
                                        <span className="text-xs leading-none text-slate-800 dark:text-slate-200">
                                            {selectedSearch.placa}
                                        </span>
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold uppercase tracking-tight">
                                            {[getVal(dadosCompletosNorm ?? {}, 'marca'), getVal(dadosCompletosNorm ?? {}, 'modelo')]
                                                .filter((v) => v !== '--')
                                                .join(' ') || '—'}
                                        </h2>
                                        <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                                            <span className="flex items-center gap-1">
                                                <User className="w-3 h-3" /> {selectedSearch.atendente_nome}
                                            </span>
                                            <span className="opacity-30">|</span>
                                            <span className="flex items-center gap-1">
                                                <Clock className="w-3 h-3" /> {fmtDateTimeShort(selectedSearch.data_consulta)}
                                            </span>
                                        </p>
                                    </div>
                                </div>
                                <Button variant="outline" size="sm" onClick={() => window.print()} className="hidden sm:flex gap-2 text-xs print:hidden">
                                    <ExternalLink className="w-3 h-3" /> Imprimir
                                </Button>
                            </div>

                            {/* Cards de dados */}
                            <div className="grid grid-cols-1 md:grid-cols-2 print:grid-cols-2 gap-4">
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-xs font-black uppercase text-primary flex items-center gap-2">
                                            <Car className="w-4 h-4" /> Principais Agregados
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="pt-2">
                                        {[
                                            ['Chassi', getVal(dadosCompletosNorm ?? {}, 'chassi')],
                                            ['Motor', getVal(dadosCompletosNorm ?? {}, 'motor')],
                                            ['Ano Fabricação', getVal(dadosCompletosNorm ?? {}, 'anoFabricacao')],
                                            ['Ano Modelo', getVal(dadosCompletosNorm ?? {}, 'anoModelo')],
                                            ['Cor', getVal(dadosCompletosNorm ?? {}, 'cor')],
                                            ['Combustível', getVal(dadosCompletosNorm ?? {}, 'combustivel')],
                                            ['Município/UF', `${getVal(dadosCompletosNorm ?? {}, 'municipio')} / ${getVal(dadosCompletosNorm ?? {}, 'uf')}`],
                                        ].map(([label, value]) => (
                                            <div key={String(label)} className="flex justify-between items-center py-1.5 border-b border-border/40 last:border-0">
                                                <span className="text-[10px] text-muted-foreground font-bold uppercase">{label}</span>
                                                <span className="text-xs font-bold">{String(value || '--')}</span>
                                            </div>
                                        ))}
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-xs font-black uppercase text-amber-600 flex items-center gap-2">
                                            <Info className="w-4 h-4" /> Detalhes Técnicos
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="pt-2">
                                        {[
                                            ['Cilindrada', getVal(dadosCompletosNorm ?? {}, 'cilindrada')],
                                            ['Potência', getVal(dadosCompletosNorm ?? {}, 'potencia')],
                                            ['Espécie', getVal(dadosCompletosNorm ?? {}, 'especie')],
                                            ['Tipo Veículo', getVal(dadosCompletosNorm ?? {}, 'tipoVeiculo')],
                                            ['Carroceria', getVal(dadosCompletosNorm ?? {}, 'carroceria')],
                                            ['Situação', getVal(dadosCompletosNorm ?? {}, 'situacao')],
                                        ].map(([label, value]) => (
                                            <div key={String(label)} className="flex justify-between items-center py-1.5 border-b border-border/40 last:border-0">
                                                <span className="text-[10px] text-muted-foreground font-bold uppercase">{label}</span>
                                                <span className="text-xs font-bold">{String(value || '--')}</span>
                                            </div>
                                        ))}
                                    </CardContent>
                                </Card>
                            </div>
                            {/* Card FIPE */}
                            {fipeNorm && (
                                <Card className="border-blue-500/30 bg-blue-500/[0.02]">
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-black uppercase text-blue-600 flex items-center gap-2">
                                            <Wallet className="w-5 h-5" /> Tabela FIPE
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 print:grid-cols-3 gap-3">
                                            {Object.entries(fipeNorm).map(([key, value]: [string, any]) => {
                                                if (!value || typeof value === 'object') return null;
                                                const k = key.toLowerCase();
                                                const isPrice = k.includes('valor') || k.includes('preco') || k.includes('price');
                                                
                                                return (
                                                    <div key={key} className={`space-y-0.5 p-2.5 rounded-xl border ${isPrice ? 'bg-blue-600 text-white border-blue-400' : 'bg-white border-blue-100'}`}>
                                                        <div className={`text-[9px] uppercase font-black ${isPrice ? 'text-blue-100' : 'text-muted-foreground/60'}`}>
                                                            {key.replace(/_/g, ' ')}
                                                        </div>
                                                        <div className={`text-xs font-black ${isPrice ? 'text-lg' : ''}`}>
                                                            {isPrice && (typeof value === 'number' || !isNaN(parseFloat(String(value).replace(/[^\d.,]/g, '').replace(',', '.'))))
                                                                ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseFloat(String(value).replace(/[^\d.,]/g, '').replace(',', '.')))
                                                                : String(value)}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}


                            {/* Informações Complementares */}
                            <Card className="border-emerald-500/20 bg-emerald-500/[0.02]">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-xs font-bold uppercase flex items-center gap-2 text-emerald-600">
                                        <Search className="w-4 h-4" /> Informações Complementares
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                        {Object.entries(flattenObject(dadosCompletosNorm ?? {})).map(([key, value]) => {
                                            const lowerK = key.toLowerCase();
                                            const exactSkip = [
                                                'identificacao_chassi', 'identificacao_placa', 'identificacao_placamercosul',
                                                'marca_descricao', 'modelo_descricao', 'modelo_anofabricacao', 'modelo_anomodelo',
                                                'motor_numero', 'motor_cilindradas', 'motor_potencia',
                                                'classificacao_tipoveiculo', 'classificacao_especie', 'classificacao_combustivel',
                                                'carroceria_tipo', 'cor_descricao', 'cor_alternativa',
                                                'localizacao_uf', 'localizacao_ufjurisdicao'
                                            ];
                                            if (exactSkip.includes(lowerK)) return null;

                                            const displayKey = key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim();
                                            
                                            return (
                                                <div key={key} className="space-y-0.5">
                                                    <div className="text-[9px] uppercase font-black text-muted-foreground/60">{displayKey}</div>
                                                    <div className="text-xs font-bold break-words">{String(value)}</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Resposta Bruta */}
                            <Card className="border-rose-500/20 print:hidden">
                                <CardHeader className="flex flex-row items-center justify-between pb-2">
                                    <CardTitle className="text-xs font-bold uppercase flex items-center gap-2 text-rose-600">
                                        <FileJson className="w-4 h-4" /> Resposta Bruta (API Full)
                                    </CardTitle>
                                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                                </CardHeader>
                                <CardContent>
                                    <pre className="text-[10px] bg-muted p-4 rounded-lg overflow-x-auto font-mono text-muted-foreground max-h-52 overflow-y-auto">
                                        {JSON.stringify(dadosCompletosNorm ?? {}, null, 2)}
                                    </pre>
                                </CardContent>
                            </Card>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center space-y-4 py-24 bg-muted/20 rounded-2xl border-2 border-dashed border-muted">
                            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
                                <Search className="w-8 h-8 text-muted-foreground" />
                            </div>
                            <div className="max-w-xs space-y-2">
                                <h3 className="font-bold text-lg">Nenhuma consulta selecionada</h3>
                                <p className="text-sm text-muted-foreground">
                                    Digite uma placa e clique em buscar, ou selecione uma do histórico à esquerda.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal PIX */}
            {showPixModal && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setShowPixModal(false)}>
                    <div className="bg-card border rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-bold flex items-center gap-2">
                                    <QrCode className="w-5 h-5 text-emerald-500" />
                                    Recarregar Créditos via PIX
                                </h2>
                                <p className="text-xs text-muted-foreground mt-1">Pagamento direto à API Full</p>
                            </div>
                            <button onClick={() => { setShowPixModal(false); setPixData(null); }} className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted transition-colors text-xl leading-none">×</button>
                        </div>

                        {!pixData ? (
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold uppercase text-muted-foreground">Valor (em centavos)</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {[1000, 5000, 10000].map(v => (
                                            <button key={v} onClick={() => setRechargeValue(String(v))} className={`py-2 rounded-lg text-sm font-bold border transition-all ${rechargeValue === String(v) ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'}`}>
                                                R$ {(v / 100).toFixed(2)}
                                            </button>
                                        ))}
                                    </div>
                                    <Input
                                        type="number"
                                        placeholder="Ou insira em centavos (ex: 2500 = R$25)"
                                        value={rechargeValue}
                                        onChange={e => setRechargeValue(e.target.value)}
                                        className="mt-2"
                                    />
                                    <p className="text-[10px] text-muted-foreground">
                                        Valor atual: <strong>R$ {(parseInt(rechargeValue || '0', 10) / 100).toFixed(2)}</strong>
                                    </p>
                                </div>
                                <Button onClick={handleGeneratePix} disabled={pixLoading} className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700">
                                    {pixLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
                                    Gerar QR Code PIX
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-4 text-center">
                                <div className="flex flex-col items-center gap-3">
                                    <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                                    <p className="text-sm font-semibold">PIX gerado! Escaneie ou copie o código.</p>

                                    {/* QR Code: imagem da API ou gerado localmente */}
                                    {qrCodeUrl ? (
                                        <img src={qrCodeUrl} alt="QR Code PIX" className="w-52 h-52 border-2 rounded-xl object-contain bg-white p-2" />
                                    ) : pixCode ? (
                                        <QrCodeCanvas value={pixCode} size={200} />
                                    ) : null}

                                    {pixData?.expireDate && (
                                        <p className="text-[10px] text-muted-foreground">
                                            Vence em: <strong>{new Date(pixData.expireDate).toLocaleString('pt-BR')}</strong>
                                        </p>
                                    )}
                                </div>

                                {pixCode && (
                                    <div className="space-y-2">
                                        <p className="text-xs text-muted-foreground font-bold uppercase">Pix Copia e Cola</p>
                                        <div className="flex gap-2">
                                            <div className="flex-1 p-2.5 bg-muted rounded-lg text-[10px] font-mono break-all text-left max-h-20 overflow-y-auto">
                                                {pixCode}
                                            </div>
                                            <button onClick={() => copyPix(pixCode)} className="p-2.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-colors shrink-0" title="Copiar código PIX">
                                                {copiedPix ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                                            </button>
                                        </div>
                                        {copiedPix && <p className="text-[10px] text-emerald-600 font-bold">✓ Copiado!</p>}
                                    </div>
                                )}
                                <Button variant="outline" size="sm" onClick={() => setPixData(null)} className="w-full">
                                    Gerar novo PIX
                                </Button>
                            </div>
                        )}

                        <div className="text-[10px] text-center text-muted-foreground border-t pt-3">
                            Após confirmação do pagamento, o saldo será atualizado automaticamente pela API Full.
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
