// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from './ui/card';
import { Input } from './ui/input';
import { api } from '@/lib/api';
import { Loader2, Search, CheckCircle } from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';

interface RevisaoPendente {
  id: number;
  produto_id: string;
  texto_original: string;
  created_at: string;
}

interface VeiculoResult {
  id: number;
  descricao: string;
  codigo_interno: string;
  marca: string;
  modelo: string;
}

export function CompatibilidadeReviewPanel() {
  const [pendentes, setPendentes] = useState<RevisaoPendente[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeItem, setActiveItem] = useState<RevisaoPendente | null>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<VeiculoResult[]>([]);
  const [searching, setSearching] = useState(false);
  
  const [resolving, setResolving] = useState(false);

  const fetchPendentes = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/catalog/veiculos/compatibilidades/pendentes');
      setPendentes(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendentes();
  }, []);

  const handleSearch = async () => {
    if (searchQuery.length < 2) return;
    setSearching(true);
    try {
      const { data } = await api.get(`/api/catalog/veiculos/search?q=${encodeURIComponent(searchQuery)}`);
      setSearchResults(data);
    } catch (err) {
      console.error(err);
    } finally {
      setSearching(false);
    }
  };

  const handleResolve = async (veiculo_id: number) => {
    if (!activeItem) return;
    setResolving(true);
    try {
      await api.post('/api/catalog/veiculos/compatibilidades/resolver', {
        revisao_id: activeItem.id,
        veiculo_id: veiculo_id,
        observacao: 'Revisado e aprovado manualmente'
      });
      // Remove da lista local e limpa state
      setPendentes(prev => prev.filter(p => p.id !== activeItem.id));
      setActiveItem(null);
      setSearchResults([]);
      setSearchQuery('');
    } catch (err) {
      console.error(err);
      alert('Erro ao resolver');
    } finally {
      setResolving(false);
    }
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>Painel de Revisão da Migração</CardTitle>
        <CardDescription>
          Resolve as ambiguidades que a IA não conseguiu vincular com confiança &gt; 90%.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Coluna 1: Lista de Pendentes */}
        <div className="space-y-4">
          <h3 className="font-semibold flex items-center justify-between">
            Fila de Espera
            <Badge variant="secondary">{pendentes.length}</Badge>
          </h3>
          {loading ? (
             <Loader2 className="animate-spin w-6 h-6" />
          ) : pendentes.length === 0 ? (
            <div className="text-muted-foreground text-sm border p-4 rounded-md">
              Não há registros pendentes de revisão. 🎉
            </div>
          ) : (
            <ScrollArea className="h-[500px] border rounded-md">
              <div className="divide-y">
                {pendentes.map(p => (
                  <div 
                    key={p.id} 
                    className={`p-3 cursor-pointer hover:bg-muted/50 transition-colors ${activeItem?.id === p.id ? 'bg-primary/10 border-l-4 border-primary' : ''}`}
                    onClick={() => {
                      setActiveItem(p);
                      // Tenta jogar o texto limpo na busca inicial
                      setSearchQuery(p.texto_original);
                    }}
                  >
                    <p className="font-medium text-sm leading-tight">{p.texto_original}</p>
                    <p className="text-xs text-muted-foreground mt-1">Data: {new Date(p.created_at).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Coluna 2: Busca e Resolução */}
        <div className="space-y-4 border-l pl-6">
          <h3 className="font-semibold text-primary">Ação</h3>
          
          {activeItem ? (
            <div className="space-y-4 animate-in fade-in">
              <div className="bg-muted p-3 rounded-md">
                <p className="text-xs text-muted-foreground font-semibold">Texto do legado:</p>
                <p className="text-sm font-medium">{activeItem.texto_original}</p>
              </div>

              <div className="flex space-x-2">
                <Input 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder="Buscar veículo exato no catálogo..."
                />
                <Button onClick={handleSearch} disabled={searching}>
                  {searching ? <Loader2 className="animate-spin w-4 h-4" /> : <Search className="w-4 h-4" />}
                </Button>
              </div>

              <ScrollArea className="h-[350px]">
                <div className="space-y-2">
                  {searchResults.map(v => (
                    <div key={v.id} className="p-3 border rounded-md flex justify-between items-center bg-card">
                      <div>
                        <p className="font-semibold text-sm">{v.descricao}</p>
                        <p className="text-xs text-muted-foreground">ID Interno: {v.codigo_interno || v.id}</p>
                      </div>
                      <Button 
                        size="sm" 
                        onClick={() => handleResolve(v.id)} 
                        disabled={resolving}
                      >
                        Vincular
                      </Button>
                    </div>
                  ))}
                  {!searching && searchResults.length === 0 && searchQuery && (
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhum veículo encontrado no novo catálogo.</p>
                  )}
                </div>
              </ScrollArea>
            </div>
          ) : (
            <div className="h-[400px] flex items-center justify-center text-muted-foreground border border-dashed rounded-md">
              <p className="text-sm text-center">Selecione um registro na fila <br/> para buscar o correspondente correto.</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

