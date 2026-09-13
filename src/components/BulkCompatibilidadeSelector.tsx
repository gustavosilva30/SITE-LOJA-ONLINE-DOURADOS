// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';
import { ScrollArea } from './ui/scroll-area';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { api } from '@/lib/api';
import { Loader2, Search, CheckSquare, Square } from 'lucide-react';

interface VeiculoItem {
  id: number;
  nome: string;
}

interface VersaoItem {
  id: number;
  nome_versao: string;
  motor?: string;
  combustivel?: string;
}

interface GeracaoGroup {
  id: number;
  nome: string;
  ano_inicio?: number;
  ano_fim?: number;
  versoes: VersaoItem[];
}

interface BulkCompatibilidadeSelectorProps {
  onSave: (veiculosIds: number[], observacao: string) => Promise<void>;
  onCancel: () => void;
}

export function BulkCompatibilidadeSelector({ onSave, onCancel }: BulkCompatibilidadeSelectorProps) {
  const [marcas, setMarcas] = useState<VeiculoItem[]>([]);
  const [modelos, setModelos] = useState<VeiculoItem[]>([]);
  
  const [selectedMarca, setSelectedMarca] = useState<string>('');
  const [selectedModelo, setSelectedModelo] = useState<string>('');
  
  const [geracoes, setGeracoes] = useState<GeracaoGroup[]>([]);
  const [selectedVersoes, setSelectedVersoes] = useState<Set<number>>(new Set());
  
  const [observacao, setObservacao] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // 1. Carregar Marcas
  useEffect(() => {
    api.get('/api/catalog/veiculos/marcas').then(res => setMarcas(res.data)).catch(console.error);
  }, []);

  // 2. Carregar Modelos ao selecionar Marca
  useEffect(() => {
    if (!selectedMarca) {
      setModelos([]);
      return;
    }
    api.get(`/api/catalog/veiculos/modelos?marca_id=${selectedMarca}`)
       .then(res => setModelos(res.data))
       .catch(console.error);
  }, [selectedMarca]);

  // 3. Carregar Gerações e suas Versões ao selecionar Modelo
  useEffect(() => {
    if (!selectedModelo) {
      setGeracoes([]);
      return;
    }
    
    setLoading(true);
    // Para simplificar a UI em lote, buscamos gerações e depois as versões de cada uma
    const fetchTree = async () => {
      try {
        const { data: geracoesData } = await api.get(`/api/catalog/veiculos/geracoes?modelo_id=${selectedModelo}`);
        
        const tree: GeracaoGroup[] = [];
        for (const g of geracoesData) {
          const { data: versoesData } = await api.get(`/api/catalog/veiculos/versoes?geracao_id=${g.id}`);
          tree.push({ ...g, versoes: versoesData });
        }
        setGeracoes(tree);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchTree();
  }, [selectedModelo]);

  const toggleVersao = (versaoId: number) => {
    const next = new Set(selectedVersoes);
    if (next.has(versaoId)) next.delete(versaoId);
    else next.add(versaoId);
    setSelectedVersoes(next);
  };

  const selectAllDaGeracao = (geracao: GeracaoGroup) => {
    const next = new Set(selectedVersoes);
    const todosSelecionados = geracao.versoes.every(v => next.has(v.id));
    
    if (todosSelecionados) {
      // desmarcar
      geracao.versoes.forEach(v => next.delete(v.id));
    } else {
      // marcar
      geracao.versoes.forEach(v => next.add(v.id));
    }
    setSelectedVersoes(next);
  };

  const handleSave = async () => {
    if (selectedVersoes.size === 0) return;
    setSaving(true);
    try {
      await onSave(Array.from(selectedVersoes), observacao);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 border rounded-md bg-background">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Marca</Label>
          <Select value={selectedMarca} onValueChange={setSelectedMarca}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione a marca" />
            </SelectTrigger>
            <SelectContent>
              {marcas.map(m => (
                <SelectItem key={m.id} value={m.id.toString()}>{m.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div>
          <Label>Modelo</Label>
          <Select value={selectedModelo} onValueChange={setSelectedModelo} disabled={!selectedMarca}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o modelo" />
            </SelectTrigger>
            <SelectContent>
              {modelos.map(m => (
                <SelectItem key={m.id} value={m.id.toString()}>{m.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-8"><Loader2 className="animate-spin w-6 h-6" /></div>
      ) : geracoes.length > 0 ? (
        <ScrollArea className="h-[400px] border rounded-md p-4">
          <div className="space-y-6">
            {geracoes.map(geracao => (
              <div key={geracao.id} className="space-y-3">
                <div className="flex items-center justify-between border-b pb-2">
                  <h4 className="font-semibold text-lg">
                    {geracao.nome} {geracao.ano_inicio && `(${geracao.ano_inicio} - ${geracao.ano_fim || 'Atual'})`}
                  </h4>
                  <Button variant="ghost" size="sm" onClick={() => selectAllDaGeracao(geracao)}>
                    Selecionar Todos
                  </Button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-2">
                  {geracao.versoes.map(versao => (
                    <div key={versao.id} className="flex items-start space-x-2">
                      <Checkbox 
                        id={`v-${versao.id}`} 
                        checked={selectedVersoes.has(versao.id)}
                        onCheckedChange={() => toggleVersao(versao.id)}
                      />
                      <div className="grid leading-none">
                        <Label htmlFor={`v-${versao.id}`} className="font-medium cursor-pointer">
                          {versao.nome_versao}
                        </Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          Motor: {versao.motor} | Comb: {versao.combustivel}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      ) : (
        <div className="text-center p-8 text-muted-foreground border rounded-md">
          Selecione Marca e Modelo para ver as versões disponíveis.
        </div>
      )}

      {selectedVersoes.size > 0 && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
          <div>
            <Label>Observação para essas compatibilidades (Opcional)</Label>
            <Input 
              placeholder="Ex: Apenas para modelos 2 portas, Serve apenas na dianteira esquerda..." 
              value={observacao}
              onChange={e => setObservacao(e.target.value)}
            />
          </div>
          
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={onCancel} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckSquare className="w-4 h-4 mr-2" />}
              Vincular {selectedVersoes.size} Versões
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

