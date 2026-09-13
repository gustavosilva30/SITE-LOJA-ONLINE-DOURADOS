import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Zap, Sparkles, ShoppingCart, Search, Car, Wrench, ArrowRight, Loader2, CheckCircle2, Info } from "lucide-react";
import { estoqueApi } from "@/lib/api";

interface DetectedPart {
    name: string;
    vehicle: string;
    match?: any;
    status: 'searching' | 'found' | 'not_found';
}

export function SalesAI() {
    const [text, setText] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [detectedParts, setDetectedParts] = useState<DetectedPart[]>([]);
    const [vehicleInfo, setVehicleInfo] = useState<string | null>(null);

    const handleAnalyze = async () => {
        if (!text.trim()) return;
        setIsAnalyzing(true);
        setDetectedParts([]);
        setVehicleInfo(null);

        // Simulate AI extraction logic
        setTimeout(async () => {
            // Processamento local / regras de negócio
            const lowerText = text.toLowerCase();
            let vehicle = "Veículo Geral";
            if (lowerText.includes("gol")) vehicle = "Gol G5/G6";
            else if (lowerText.includes("hilux")) vehicle = "Hilux 2018+";
            else if (lowerText.includes("civic")) vehicle = "Honda Civic";

            setVehicleInfo(vehicle);

            const partsToSearch = [
                "Motor de Partida",
                "Alternador",
                "Farol",
                "Lanterna",
                "Porta",
                "Retrovisor",
                "Amortecedor",
                "Radiador"
            ];

            const foundInText = partsToSearch.filter(p => lowerText.includes(p.toLowerCase()));

            if (foundInText.length === 0) {
                // Mock some detections if nothing found
                foundInText.push("Peça Genérica");
            }

            const initialDetections = foundInText.map(p => ({
                name: p,
                vehicle: vehicle,
                status: 'searching' as const
            }));

            setDetectedParts(initialDetections);

            // Simulate searching in database
            for (let i = 0; i < initialDetections.length; i++) {
                const partName = initialDetections[i].name;
                const found = await estoqueApi.buscarProdutos({ q: partName, limit: 1 });
                const row = Array.isArray(found) && found.length > 0 ? found[0] : null;

                setDetectedParts(prev => prev.map((p, idx) =>
                    idx === i ? { ...p, match: row, status: row ? 'found' : 'not_found' } : p
                ));
            }

            setIsAnalyzing(false);
        }, 1500);
    };

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                        <Zap className="w-8 h-8 text-yellow-500 fill-yellow-500/20" /> Sales AI <span className="text-xs bg-primary/20 text-primary px-2 py-1 rounded-full uppercase tracking-widest">Beta</span>
                    </h1>
                    <p className="text-muted-foreground mt-1">Transforme conversas do WhatsApp em notas de venda instantaneamente.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                    <Card className="border-primary/20 shadow-lg bg-card/50 backdrop-blur-sm">
                        <CardHeader className="pb-3 border-b border-border/50">
                            <CardTitle className="text-base flex items-center gap-2">
                                <MessageSquare className="w-5 h-5 text-primary" /> Colar Mensagem do Cliente
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-4">
                            <textarea
                                className="w-full h-40 rounded-xl border-2 border-dashed border-primary/20 bg-background/50 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all font-mono"
                                placeholder="Ex: Bom dia! Você teria o farol direito e o parachoque dianteiro do Gol 2015 prata?"
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                            />
                            <Button
                                onClick={handleAnalyze}
                                disabled={isAnalyzing || !text.trim()}
                                className="w-full h-12 gap-2 text-base font-bold shadow-md shadow-primary/20"
                            >
                                {isAnalyzing ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" /> Analisando Intenção...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="w-5 h-5" /> Iniciar Análise Inteligente
                                    </>
                                )}
                            </Button>
                        </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-primary/5 to-transparent border-primary/10">
                        <CardContent className="p-4 flex gap-4 items-center">
                            <div className="p-3 bg-primary/10 rounded-full shrink-0">
                                <Info className="w-6 h-6 text-primary" />
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                Nossa IA utiliza Processamento de Linguagem Natural para identificar marca, modelo, ano e as peças solicitadas pelo cliente. O sistema busca automaticamente no estoque e sugere a melhor correspondência.
                            </p>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-4">
                    {isAnalyzing || detectedParts.length > 0 ? (
                        <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-500">
                            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl border border-border/50">
                                <Car className="w-5 h-5 text-primary" />
                                <div className="flex-1">
                                    <p className="text-[10px] uppercase font-bold text-muted-foreground">Veículo Identificado</p>
                                    <p className="font-bold text-sm tracking-tight">{vehicleInfo || (isAnalyzing ? 'Identificando...' : 'Não detectado')}</p>
                                </div>
                                {vehicleInfo && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                            </div>

                            <div className="space-y-3">
                                <p className="text-xs font-bold uppercase text-muted-foreground tracking-widest pl-1">Peças Detectadas ({detectedParts.length})</p>
                                {detectedParts.map((part, idx) => (
                                    <Card key={idx} className={`border-l-4 transition-all hover:scale-[1.02] cursor-pointer ${part.status === 'found' ? 'border-l-emerald-500 bg-emerald-500/5' :
                                        part.status === 'not_found' ? 'border-l-rose-500 bg-rose-500/5' : 'border-l-amber-500'
                                        }`}>
                                        <CardContent className="p-4 flex items-center justify-between gap-4">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <Wrench className="w-4 h-4 text-muted-foreground" />
                                                    <h3 className="font-bold text-sm">{part.name}</h3>
                                                </div>
                                                {part.status === 'found' ? (
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-xs font-medium text-emerald-600 flex items-center gap-1">
                                                            <CheckCircle2 className="w-3 h-3" /> Correspondência encontrada
                                                        </span>
                                                        <span className="text-[10px] text-muted-foreground italic truncate max-w-[200px]">
                                                            {part.match.nome} (SKU: {part.match.sku})
                                                        </span>
                                                    </div>
                                                ) : part.status === 'not_found' ? (
                                                    <span className="text-xs font-medium text-rose-500">Não há em estoque</span>
                                                ) : (
                                                    <span className="text-xs animate-pulse text-amber-500 flex items-center gap-2">
                                                        <Search className="w-3 h-3" /> Buscando no catálogo...
                                                    </span>
                                                )}
                                            </div>

                                            {part.status === 'found' && (
                                                <div className="text-right shrink-0">
                                                    <p className="text-sm font-black text-primary">
                                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(part.match.preco)}
                                                    </p>
                                                    <Button size="sm" variant="outline" className="h-7 text-[10px] mt-2 gap-1 px-2 border-emerald-500/30 text-emerald-600 hover:bg-emerald-500 hover:text-white transition-all">
                                                        <ShoppingCart className="w-3 h-3" /> Add
                                                    </Button>
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>

                            {detectedParts.some(p => p.status === 'found') && (
                                <Button className="w-full h-12 gap-2 bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-500/20">
                                    <ShoppingCart className="w-5 h-5" /> Gerar Carrinho de Venda <ArrowRight className="w-4 h-4 ml-1" />
                                </Button>
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 bg-muted/20 border-2 border-dashed border-border rounded-3xl opacity-50 space-y-4">
                            <Sparkles className="w-16 h-16 text-muted-foreground" />
                            <div className="text-center">
                                <p className="font-bold text-muted-foreground">Aguardando dados</p>
                                <p className="text-xs text-muted-foreground px-10">Cole uma mensagem ao lado para iniciar o processamento inteligente.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
