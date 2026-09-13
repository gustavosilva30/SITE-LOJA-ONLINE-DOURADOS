import React, { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Wrench, ListChecks, ArrowRight, ShieldCheck, Info, MapPin, Search, X } from 'lucide-react';
import { normalizeFotoDisplayUrl } from '@/lib/imagemUrls';

interface PartTemplate {
    id: string;
    name: string;
    category: string;
    suggestedPriceFactor: number; // Factor of vehicle cost
}

const COMMON_PARTS: PartTemplate[] = [
    { id: '1', name: 'Motor Completo', category: 'Mecânica', suggestedPriceFactor: 0.4 },
    { id: '2', name: 'Câmbio / Transmissão', category: 'Mecânica', suggestedPriceFactor: 0.15 },
    { id: '3', name: 'Kit Airbag', category: 'Segurança', suggestedPriceFactor: 0.1 },
    { id: '4', name: 'Farol Dianteiro LE', category: 'Iluminação', suggestedPriceFactor: 0.03 },
    { id: '5', name: 'Farol Dianteiro LD', category: 'Iluminação', suggestedPriceFactor: 0.03 },
    { id: '6', name: 'Lanterna Traseira LE', category: 'Iluminação', suggestedPriceFactor: 0.02 },
    { id: '7', name: 'Lanterna Traseira LD', category: 'Iluminação', suggestedPriceFactor: 0.02 },
    { id: '8', name: 'Porta Dianteira LE', category: 'Lataria', suggestedPriceFactor: 0.05 },
    { id: '9', name: 'Porta Dianteira LD', category: 'Lataria', suggestedPriceFactor: 0.05 },
    { id: '10', name: 'Capô Panela', category: 'Lataria', suggestedPriceFactor: 0.04 },
];

interface DismantlingChecklistDialogProps {
    isOpen: boolean;
    onClose: () => void;
    sucata: any;
    onComplete: (selectedParts: any[]) => void;
    locations: any[];
    categorias?: any[];
}

export const DismantlingChecklistDialog: React.FC<DismantlingChecklistDialogProps> = ({
    isOpen,
    onClose,
    sucata,
    onComplete,
    locations,
    categorias = []
}) => {
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [partsData, setPartsData] = useState<
        Record<string, { condition: string; price: number; locationId: string; quantity: number }>
    >({});
    const [defaultLocation, setDefaultLocation] = useState(sucata?.local_armazenagem || '');
    const [searchTerm, setSearchTerm] = useState('');
    const [previewImg, setPreviewImg] = useState<string | null>(null);

    const togglePart = (id: string) => {
        setSelectedIds(prev => {
            if (prev.includes(id)) return prev.filter(i => i !== id);
            const template = COMMON_PARTS.find(p => p.id === id);
            const suggestedPrice = (sucata?.valor_compra || 0) * (template?.suggestedPriceFactor || 0.1);
            setPartsData(d => ({
                ...d,
                [id]: {
                    condition: 'Boa',
                    price: Math.round(suggestedPrice),
                    locationId: defaultLocation,
                    quantity: 1,
                }
            }));
            return [...prev, id];
        });
    };

    const updatePart = (id: string, field: string, value: any) => {
        setPartsData(prev => ({
            ...prev,
            [id]: { ...prev[id], [field]: value }
        }));
    };

    const handleClose = () => {
        if (selectedIds.length > 0) {
            if (!window.confirm(`Você selecionou ${selectedIds.length} peça(s). Deseja realmente sair e perder as seleções?`)) return;
        }
        onClose();
    };

    const handleFinish = () => {
        const finalParts = selectedIds.map(id => {
            const template = COMMON_PARTS.find(p => p.id === id);
            const q = Math.max(1, Math.floor(Number(partsData[id]?.quantity) || 1))
            const unit = partsData[id].price
            return {
                nome: template?.name,
                condicao: partsData[id].condition,
                preco_venda: unit,
                custo_estimado: unit * 0.5 * q,
                quantidade: q,
                localizacao_id: partsData[id].locationId || defaultLocation || null,
                status: 'Disponível'
            };
        });
        onComplete(finalParts);
    };

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Checklist Rápido de Desmontagem" className="max-w-4xl">
            <div className="space-y-6 py-4">
                <div className="flex items-center gap-4 p-4 bg-amber-500/5 rounded-xl border border-amber-500/20">
                    <div className="bg-amber-500/10 p-3 rounded-full">
                        <ListChecks className="w-6 h-6 text-amber-600" />
                    </div>
                    <div className="flex-1">
                        <h3 className="font-bold text-base">Padronização de Desmonte</h3>
                        <p className="text-xs text-muted-foreground">Selecione as peças que serão aproveitadas deste veículo.</p>
                    </div>
                    <div className="min-w-[180px]">
                        <label className="text-xs uppercase font-bold text-muted-foreground">Local Padrão</label>
                        <select
                            className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
                            value={defaultLocation}
                            onChange={(e) => setDefaultLocation(e.target.value)}
                        >
                            <option value="">Sem local</option>
                            {locations.map(l => <option key={l.id} value={l.id}>{l.sigla || l.nome}</option>)}
                        </select>
                    </div>
                </div>

                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Pesquisar peça ou categoria..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full h-11 pl-9 rounded-md border border-input bg-background text-sm focus:ring-2 focus:ring-primary/20"
                    />
                </div>

                <div className="max-h-[400px] overflow-y-auto pr-2 space-y-2">
                    {(() => {
                        const normalize = (str: string) => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                        const terms = normalize(searchTerm).split(" ").filter(Boolean);
                        const filtered = COMMON_PARTS.filter(p => {
                            if (!searchTerm) return true;
                            const target = normalize(`${p.name} ${p.category}`);
                            return terms.every(t => target.includes(t));
                        });

                        if (filtered.length === 0) {
                            return <p className="text-center text-sm text-muted-foreground py-8">Nenhuma peça encontrada.</p>;
                        }

                        return filtered.map((part) => (
                        <div key={part.id} className={`p-3 rounded-xl border transition-all ${selectedIds.includes(part.id) ? 'border-primary bg-primary/5 shadow-sm' : 'border-border/50 bg-muted/20'}`}>
                            <div className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    className="w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary"
                                    checked={selectedIds.includes(part.id)}
                                    onChange={() => togglePart(part.id)}
                                />
                                <div className="flex-1">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            {(() => {
                                                const cat = categorias.find(c => c.nome.toLowerCase() === part.category.toLowerCase());
                                                if (cat?.imagem_url) {
                                                    return (
                                                        <img 
                                                            src={normalizeFotoDisplayUrl(cat.imagem_url)} 
                                                            alt="" 
                                                            className="w-10 h-10 object-cover rounded bg-muted shrink-0 cursor-zoom-in hover:scale-105 transition-transform" 
                                                            onClick={(e) => { e.stopPropagation(); setPreviewImg(cat.imagem_url); }}
                                                        />
                                                    );
                                                }
                                                return null;
                                            })()}
                                            <span className="font-bold text-sm break-words">{part.name}</span>
                                        </div>
                                        <Badge variant="outline" className="text-[9px] uppercase shrink-0">{part.category}</Badge>
                                    </div>

                                    {selectedIds.includes(part.id) && (
                                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-4 animate-in fade-in slide-in-from-top-1">
                                            <div className="space-y-1">
                                                <label className="text-xs uppercase font-bold text-muted-foreground">Condição</label>
                                                <select
                                                    className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
                                                    value={partsData[part.id]?.condition}
                                                    onChange={(e) => updatePart(part.id, 'condition', e.target.value)}
                                                >
                                                    <option value="Ótima">Ótima</option>
                                                    <option value="Boa">Boa</option>
                                                    <option value="Regular">Regular</option>
                                                </select>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs uppercase font-bold text-muted-foreground">Preço unitário (R$)</label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    step={0.01}
                                                    className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
                                                    value={partsData[part.id]?.price ?? ''}
                                                    onChange={(e) => updatePart(part.id, 'price', parseFloat(e.target.value) || 0)}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs uppercase font-bold text-muted-foreground">Quantidade</label>
                                                <input
                                                    type="number"
                                                    min={1}
                                                    step={1}
                                                    className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
                                                    value={partsData[part.id]?.quantity ?? 1}
                                                    onChange={(e) =>
                                                        updatePart(
                                                            part.id,
                                                            'quantity',
                                                            e.target.value
                                                        )
                                                    }
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                })()}
            </div>

                <div className="flex gap-3 pt-4 border-t border-border">
                    <Button variant="outline" className="flex-1" onClick={handleClose}>Cancelar</Button>
                    <Button className="flex-1 gap-2" disabled={selectedIds.length === 0} onClick={handleFinish}>
                        <Wrench className="w-4 h-4" /> Finalizar Desmonte
                        <ArrowRight className="w-4 h-4" />
                    </Button>
                </div>

                {selectedIds.length > 0 && (
                    <p className="text-center text-[10px] text-muted-foreground uppercase font-bold">
                        {(() => {
                            const unidades = selectedIds.reduce(
                                (a, id) => a + Math.max(1, Math.floor(Number(partsData[id]?.quantity) || 1)),
                                0
                            )
                            return `Isso irá gerar ${selectedIds.length} registro(s) de peças (${unidades} unidade(s) no total).`
                        })()}
                    </p>
                )}

                {/* Overlay para visualização da imagem da categoria */}
                {previewImg && (
                    <div 
                        className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm cursor-zoom-out animate-in fade-in zoom-in-95"
                        onClick={() => setPreviewImg(null)}
                    >
                        <div className="relative max-w-4xl max-h-full overflow-hidden rounded-2xl shadow-2xl bg-white p-2">
                            <img 
                                src={normalizeFotoDisplayUrl(previewImg)} 
                                alt="Preview" 
                                className="max-w-full max-h-[90vh] object-contain rounded-xl"
                            />
                            <button 
                                className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
                                onClick={() => setPreviewImg(null)}
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
};
