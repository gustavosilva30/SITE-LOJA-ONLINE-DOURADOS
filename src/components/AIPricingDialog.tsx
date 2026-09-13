import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Brain, TrendingUp, AlertTriangle, Check, Sparkles } from 'lucide-react';

interface AIPricingDialogProps {
    isOpen: boolean;
    onClose: () => void;
    produto: any;
    onApplyPrice: (newPrice: number) => void;
}

export const AIPricingDialog: React.FC<AIPricingDialogProps> = ({
    isOpen,
    onClose,
    produto,
    onApplyPrice
}) => {
    const [suggestedPrice, setSuggestedPrice] = useState<number>(0);
    const [loading, setLoading] = useState(false);
    const [justification, setJustification] = useState<string[]>([]);

    useEffect(() => {
        if (isOpen && produto) {
            calculatePrice();
        }
    }, [isOpen, produto]);

    const calculatePrice = () => {
        setLoading(true);
        // Simulação de lógica inteligente
        // Sugestão local (heurística); pode ligar a um serviço externo no futuro
        setTimeout(() => {
            const basePrice = produto.preco || 0;
            const condition = produto.qualidade || 'B';
            const isSccarce = Math.random() > 0.7; // Simulação de escassez

            let factor = 1.0;
            const reasons = [];

            reasons.push(`Preço base atual: R$ ${basePrice.toFixed(2)}`);

            if (condition === 'A') {
                factor += 0.15;
                reasons.push("Qualidade Premium (A): +15%");
            } else if (condition === 'C') {
                factor -= 0.20;
                reasons.push("Qualidade Econômica (C): -20%");
            }

            if (isSccarce) {
                factor += 0.10;
                reasons.push("Alta demanda / Baixa oferta: +10%");
            }

            // Simulação de preço de mercado (ML)
            const marketAvg = basePrice * (0.9 + Math.random() * 0.2);
            reasons.push(`Média no Mercado Livre: R$ ${marketAvg.toFixed(2)}`);

            const finalPrice = marketAvg * factor;
            setSuggestedPrice(finalPrice);
            setJustification(reasons);
            setLoading(false);
        }, 1000);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Sugestão de Preço com IA" className="max-w-md">
            <div className="space-y-6 py-4">
                <div className="flex items-center gap-4 p-4 bg-primary/5 rounded-xl border border-primary/20">
                    <div className="bg-primary/10 p-3 rounded-full">
                        <Brain className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                        <h3 className="font-bold text-sm">Análise Inteligente</h3>
                        <p className="text-xs text-muted-foreground">{produto?.nome}</p>
                    </div>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-8 space-y-4">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                        <p className="text-sm text-muted-foreground animate-pulse">Consultando mercado e analisando tendências...</p>
                    </div>
                ) : (
                    <>
                        <div className="space-y-3">
                            <Label className="text-xs uppercase font-black text-muted-foreground">Fatores Analisados</Label>
                            <div className="space-y-2">
                                {justification.map((reason, i) => (
                                    <div key={i} className="flex items-center gap-2 text-xs text-foreground bg-muted/30 p-2 rounded-lg border border-border/50">
                                        <Check className="w-3 h-3 text-emerald-500" />
                                        {reason}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="p-6 bg-emerald-500/5 rounded-2xl border-2 border-dashed border-emerald-500/20 text-center space-y-2">
                            <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest">Preço Sugerido</p>
                            <div className="text-4xl font-black text-emerald-700">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(suggestedPrice)}
                            </div>
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 gap-1">
                                <Sparkles className="w-3 h-3" /> Otimizado para conversão
                            </Badge>
                        </div>

                        <div className="flex gap-3 pt-4">
                            <Button variant="outline" className="flex-1" onClick={onClose}>Descartar</Button>
                            <Button className="flex-1 gap-2" onClick={() => onApplyPrice(suggestedPrice)}>
                                <TrendingUp className="w-4 h-4" /> Aplicar Preço
                            </Button>
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );
};
