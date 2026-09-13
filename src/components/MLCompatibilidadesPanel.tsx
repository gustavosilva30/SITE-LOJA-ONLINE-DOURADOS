import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Search, Trash2 } from "lucide-react";
import { mercadoLivreApi, estoqueApi } from "@/lib/api";
import { toast } from "sonner";
import { compatRowDedupeKey } from "@/lib/compatCatalogo";
import { MLCategorySelector } from "./MLCategorySelector";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";

interface MLCompatibilidadesPanelProps {
  produtoId: string;
  meliId?: string | null;
  onRefresh?: () => void;
  compatList?: CompatibilityRow[];
  onUpdateCompatList?: (newList: CompatibilityRow[]) => void;
  productMarca?: string;
  productModelo?: string;
  productAnoInicio?: number | null;
  productAnoFim?: number | null;
  productMotorizacao?: string | null;
  productName?: string;
}

export interface CompatibilityRow {
  id?: string;
  marca: string;
  modelo: string;
  ano: string | null;
  versao: string | null;
  motorizacao?: string | null;
  familia?: string | null;
  posicoes?: string[]; // Array de posicoes do lado
  observacao?: string | null;
  /** Veículo do catálogo do Mercado Livre (MLB...). Quando presente, a publicação
   *  usa esse id direto, sem tentar casar marca/modelo por texto. */
  ml_product_id?: string | null;
}

export function MLCompatibilidadesPanel({
  produtoId,
  meliId,
  onRefresh,
  compatList: externalCompatList,
  onUpdateCompatList,
  productName = "",
  productMarca = "",
  productModelo = "",
  productAnoInicio,
  productAnoFim,
  productMotorizacao,
}: MLCompatibilidadesPanelProps) {
  const usesExternalState = !!(externalCompatList && onUpdateCompatList);
  const [internalRows, setInternalRows] = useState<CompatibilityRow[]>([]);
  const localRows = usesExternalState ? (externalCompatList as CompatibilityRow[]) : internalRows;
  const setLocalRows = (rows: CompatibilityRow[] | ((prev: CompatibilityRow[]) => CompatibilityRow[])) => {
    if (usesExternalState && onUpdateCompatList) {
      const newRows = typeof rows === 'function' ? rows(externalCompatList as CompatibilityRow[]) : rows;
      onUpdateCompatList(newRows);
    } else {
      setInternalRows(rows);
    }
  };

  const [loadingLocal, setLoadingLocal] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Categoria ML (Para posicoes)
  const [categoryId, setCategoryId] = useState<string>("");
  const [categoryName, setCategoryName] = useState<string>("");
  const [categoryAttributes, setCategoryAttributes] = useState<any[]>([]);

  // Pesquisa Catalog ML
  const [filterBrand, setFilterBrand] = useState(productMarca || "");
  const [filterModel, setFilterModel] = useState(productModelo || "");
  const [filterYear, setFilterYear] = useState(productAnoInicio ? String(productAnoInicio) : "");
  const [filterYearEnd, setFilterYearEnd] = useState(productAnoFim ? String(productAnoFim) : "");
  const [filterMotorizacao, setFilterMotorizacao] = useState(productMotorizacao || "");

  useEffect(() => {
    if (productMarca && !filterBrand) setFilterBrand(productMarca);
    if (productModelo && !filterModel) setFilterModel(productModelo);
    if (productAnoInicio && !filterYear) setFilterYear(String(productAnoInicio));
    if (productAnoFim && !filterYearEnd) setFilterYearEnd(String(productAnoFim));
    if (productMotorizacao && !filterMotorizacao) setFilterMotorizacao(productMotorizacao);
  }, [productMarca, productModelo, productAnoInicio, productAnoFim, productMotorizacao]);

  const [searchResults, setSearchResults] = useState<CompatibilityRow[]>([]);
  const [loadingSearchML, setLoadingSearchML] = useState(false);
  const [loadingAutoAnalyze, setLoadingAutoAnalyze] = useState(false);

  // Auto-análise do título: preenche filtros automaticamente se Marca/Modelo estiverem vazios
  // NÃO dispara busca automaticamente — usuário clica em "Filtrar Catálogo ML"
  useEffect(() => {
    if (!productName || filterBrand || filterModel) return;
    const analyze = async () => {
      setLoadingAutoAnalyze(true);
      try {
        const res = await mercadoLivreApi.analisarTitulo(productName);
        const parsed = res.data || res;
        const marca = parsed?.marca || "";
        const modelo = parsed?.modelo || "";
        const anos: number[] = parsed?.anos || [];
        const motor = parsed?.motor || "";

        if (marca) setFilterBrand(marca);
        if (modelo) setFilterModel(modelo);
        if (anos.length > 0) {
          setFilterYear(String(Math.min(...anos)));
          if (anos.length > 1) setFilterYearEnd(String(Math.max(...anos)));
        }
        if (motor && !filterMotorizacao) setFilterMotorizacao(motor);
      } catch {
        // silencioso
      } finally {
        setLoadingAutoAnalyze(false);
      }
    };
    void analyze();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productName]);


  // Selecao da Tabela (Checkbox)
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(new Set());

  // Modal de Posicoes
  const [posicoesModalOpen, setPosicoesModalOpen] = useState(false);
  const [availablePositions, setAvailablePositions] = useState<string[]>([]);
  const [selectedPositions, setSelectedPositions] = useState<Set<string>>(new Set());

  // 1. Fetch Local
  const loadLocalCompatibilities = useCallback(async () => {
    if (!produtoId) return;
    setLoadingLocal(true);
    try {
      const data = await estoqueApi.listarCompatibilidadeProduto(produtoId);
      // Aqui o ideal era a API retornar ml_category_id do produto, mas assumimos que tem ou o user preenche
      setLocalRows(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error("Erro ao carregar compatibilidades locais.");
    } finally {
      setLoadingLocal(false);
    }
  }, [produtoId]);

  useEffect(() => {
    if (!usesExternalState) {
      void loadLocalCompatibilities();
    }
  }, [loadLocalCompatibilities, usesExternalState]);

  /** Busca no catálogo oficial de veículos do Mercado Livre.
   *  Diferente do Banco de Veículos interno, cada linha volta com o product_id
   *  do ML — que é o que o marketplace realmente indexa como compatibilidade. */
  const handleSearchML = async () => {
    if (!filterBrand && !filterModel) {
      toast.info("Informe ao menos a marca ou o modelo para buscar no catálogo do ML.");
      return;
    }
    setLoadingSearchML(true);
    try {
      const res = await mercadoLivreApi.buscarVeiculosPorCampos({
        marca: filterBrand,
        modelo: filterModel,
        ano_inicio: filterYear ? parseInt(filterYear.substring(0, 4), 10) : null,
        ano_fim: filterYearEnd ? parseInt(filterYearEnd.substring(0, 4), 10) : null,
        motorizacao: filterMotorizacao || null,
      });
      // api.post devolve o JSON já parseado; o endpoint responde { results: [...] }.
      const encontrados = ((res as any)?.results || []) as any[];
      const mapped: CompatibilityRow[] = encontrados.map((v) => ({
        marca: v.marca,
        modelo: v.modelo,
        ano: v.ano || null,
        versao: v.versao || null,
        motorizacao: v.motorizacao || null,
        familia: null,
        ml_product_id: v.ml_product_id || null,
      }));
      setSearchResults(mapped);

      const vinculados = mapped.filter((r) => r.ml_product_id).length;
      if (!mapped.length) {
        toast.info("Nenhum veículo encontrado no catálogo do Mercado Livre.");
      } else if (!vinculados) {
        // Sem product_id o ML não indexa — melhor o usuário saber antes de salvar.
        toast.warning(`${mapped.length} veículos, mas nenhum reconhecido no catálogo do ML.`);
      } else {
        toast.success(`${vinculados} de ${mapped.length} veículos vinculados ao catálogo do ML.`);
      }
    } catch (e) {
      toast.error("Erro ao buscar no catálogo do Mercado Livre.");
    } finally {
      setLoadingSearchML(false);
    }
  };

  const handleSelectCategory = async (id: string, name: string) => {
    setCategoryId(id);
    setCategoryName(name);
    // Buscar atributos da categoria
    try {
      const res = await mercadoLivreApi.obterAtributosCategoria(id);
      const attrs = res.data || res;
      setCategoryAttributes(Array.isArray(attrs) ? attrs : []);
      
      // Procurar atributo de posicao/lado
      const posAttr = (Array.isArray(attrs) ? attrs : []).find(a => 
        a.id === 'POSITION' || a.id === 'SIDE' || a.name.toLowerCase().includes('posição') || a.name.toLowerCase().includes('lado')
      );
      if (posAttr && posAttr.values) {
         setAvailablePositions(posAttr.values.map((v:any) => v.name));
      } else {
         // Default if API doesn't specify nicely
         setAvailablePositions(["Dianteira Esquerda", "Dianteira Direita", "Traseira Esquerda", "Traseira Direita"]);
      }
    } catch(e) {
      console.error(e);
    }
  };

  // Actions
  const toggleRowSelection = (key: string) => {
    const newSet = new Set(selectedRowKeys);
    if (newSet.has(key)) newSet.delete(key);
    else newSet.add(key);
    setSelectedRowKeys(newSet);
  };
  
  const toggleAll = (keys: string[]) => {
    if (selectedRowKeys.size === keys.length) {
      setSelectedRowKeys(new Set());
    } else {
      setSelectedRowKeys(new Set(keys));
    }
  };

  const handleAddResultsToSaved = () => {
    if (selectedRowKeys.size === 0) return;
    const toAdd = searchResults.filter(r => selectedRowKeys.has(compatRowDedupeKey(r)));
    
    let imported = 0;
    const nextList = [...localRows];
    toAdd.forEach(newC => {
        const k = compatRowDedupeKey(newC);
        if (!nextList.some(x => compatRowDedupeKey(x) === k)) {
            nextList.push({...newC, posicoes: []});
            imported++;
        }
    });

    if (imported > 0) {
        saveList(nextList);
        setSelectedRowKeys(new Set());
        setSearchResults([]);
        toast.success(`Adicionados ${imported} veículos com sucesso!`);
    } else {
        toast.info("Veículos já estão na lista de salvos.");
    }
  };

  const handleDeleteSaved = () => {
    if (selectedRowKeys.size === 0) return;
    if (!confirm("Remover selecionados?")) return;
    const nextList = localRows.filter(r => !selectedRowKeys.has(compatRowDedupeKey(r)));
    saveList(nextList);
    setSelectedRowKeys(new Set());
  };

  const openPositionsModal = () => {
    if (selectedRowKeys.size === 0) {
        toast.warning("Selecione veículos na tabela primeiro");
        return;
    }
    // Pre-fill selected pos if only 1 item is selected or use empty
    setSelectedPositions(new Set());
    setPosicoesModalOpen(true);
  };

  const confirmPositions = () => {
    const nextList = localRows.map(r => {
        if (selectedRowKeys.has(compatRowDedupeKey(r))) {
            return { ...r, posicoes: Array.from(selectedPositions) };
        }
        return r;
    });
    saveList(nextList);
    setPosicoesModalOpen(false);
    setSelectedRowKeys(new Set());
    toast.success("Posições atualizadas");
  };

  const saveList = async (list: CompatibilityRow[]) => {
    setLocalRows(list);
    if (!produtoId) return; // Only update state if external
    setSaving(true);
    try {
        await estoqueApi.substituirCompatibilidadeProduto(produtoId, list);
        if (onRefresh) onRefresh();
    } catch(e) {
        toast.error("Erro ao salvar no banco.");
    } finally {
        setSaving(false);
    }
  };

  // Rendering logic for combined/split tables
  const showSearchResults = searchResults.length > 0;
  const displayRows = showSearchResults ? searchResults : localRows;
  const allDisplayKeys = displayRows.map(r => compatRowDedupeKey(r));

  return (
    <div className="space-y-6">
      {/* Categoria Selector */}
      <div className="bg-muted/30 p-4 rounded-xl border space-y-2">
         <MLCategorySelector 
           productName={productName}
           selectedCategoryId={categoryId}
           onSelectCategory={handleSelectCategory}
         />
      </div>

      {/* ML Headers Filters */}
      <div className="bg-background rounded-xl border p-4">
        {loadingAutoAnalyze && (
          <div className="flex items-center gap-2 text-xs text-blue-600 font-medium mb-3 animate-pulse">
            <Loader2 className="w-3 h-3 animate-spin" />
            Analisando título do produto...
          </div>
        )}
        <div className="flex flex-wrap items-end gap-3 mb-4">
            <div className="flex flex-col gap-1 w-full max-w-[180px]">
                <label className="text-xs font-bold text-muted-foreground">Marca</label>
                <input type="text" className="flex h-9 w-full rounded-full border border-blue-200 bg-blue-50/30 px-3 py-1 text-sm text-blue-700 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                   value={filterBrand} onChange={(e) => setFilterBrand(e.target.value)} placeholder="Ex: Fiat" />
            </div>
            <div className="flex flex-col gap-1 w-full max-w-[180px]">
                <label className="text-xs font-bold text-muted-foreground">Modelo</label>
                <input type="text" className="flex h-9 w-full rounded-full border border-blue-200 bg-blue-50/30 px-3 py-1 text-sm text-blue-700 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                   value={filterModel} onChange={(e) => setFilterModel(e.target.value)} placeholder="Ex: Palio" />
            </div>
            <div className="flex flex-col gap-1 w-full max-w-[100px]">
                <label className="text-xs font-bold text-muted-foreground">Ano Início</label>
                <input type="number" className="flex h-9 w-full rounded-full border border-blue-200 bg-blue-50/30 px-3 py-1 text-sm text-blue-700 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                   value={filterYear} onChange={(e) => setFilterYear(e.target.value)} placeholder="2010" />
            </div>
            <div className="flex flex-col gap-1 w-full max-w-[100px]">
                <label className="text-xs font-bold text-muted-foreground">Ano Fim</label>
                <input type="number" className="flex h-9 w-full rounded-full border border-blue-200 bg-blue-50/30 px-3 py-1 text-sm text-blue-700 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                   value={filterYearEnd} onChange={(e) => setFilterYearEnd(e.target.value)} placeholder="2015" />
            </div>
            <div className="flex flex-col gap-1 w-full max-w-[140px]">
                <label className="text-xs font-bold text-muted-foreground">Motorização</label>
                <input type="text" className="flex h-9 w-full rounded-full border border-blue-200 bg-blue-50/30 px-3 py-1 text-sm text-blue-700 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                   value={filterMotorizacao} onChange={(e) => setFilterMotorizacao(e.target.value)} placeholder="Ex: 1.6" />
            </div>
            <Button type="button" onClick={handleSearchML} disabled={loadingSearchML} variant="outline" className="h-9 rounded-full px-5 ml-auto border-yellow-300 text-yellow-800 font-bold hover:bg-yellow-50">
                {loadingSearchML ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
                Buscar no catálogo do Mercado Livre
            </Button>
        </div>

        {/* Action Bar */}
        <div className="flex items-center justify-between border-b pb-3 mb-3">
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground bg-muted px-3 py-1 rounded-md">
                    <input type="checkbox" className="rounded border-gray-300" 
                      checked={selectedRowKeys.size > 0 && selectedRowKeys.size === displayRows.length}
                      onChange={() => toggleAll(allDisplayKeys)} />
                    {selectedRowKeys.size} selecionados
                </div>
                {!showSearchResults && (
                   <span className="text-sm font-medium text-muted-foreground">({localRows.length}) compatibilidades salvas</span>
                )}
            </div>
            <div className="flex items-center gap-2">
                {showSearchResults ? (
                    <Button type="button" size="sm" onClick={handleAddResultsToSaved} disabled={selectedRowKeys.size === 0} className="bg-blue-600 hover:bg-blue-700 font-bold rounded-md">
                        Adicionar Veículos aos Salvos
                    </Button>
                ) : (
                    <>
                        <Button type="button" variant="ghost" size="sm" className="text-red-500 font-bold hover:text-red-600 hover:bg-red-50" disabled={selectedRowKeys.size===0} onClick={handleDeleteSaved}>
                            Excluir
                        </Button>
                        <Button type="button" size="sm" onClick={openPositionsModal} disabled={selectedRowKeys.size===0 || !categoryId} className="bg-blue-600 hover:bg-blue-700 font-bold rounded-md">
                            Adicionar as posições
                        </Button>
                    </>
                )}
            </div>
        </div>

        {/* Table Area */}
        <div className="rounded-md border bg-white overflow-hidden overflow-x-auto">
           {displayRows.length === 0 ? (
               <div className="p-8 text-center text-muted-foreground text-sm">
                   {showSearchResults ? "Nenhum veículo encontrado para o filtro." : "Nenhum veículo compatível salvo."}
               </div>
           ) : (
               <table className="w-full text-sm text-left">
                   <thead className="bg-gray-100 text-gray-700 font-bold border-b">
                       <tr>
                           <th className="px-4 py-3 w-[40px]">
                               <input type="checkbox" className="rounded border-gray-300"
                                  checked={selectedRowKeys.size > 0 && selectedRowKeys.size === displayRows.length}
                                  onChange={() => toggleAll(allDisplayKeys)} />
                           </th>
                           <th className="px-4 py-3">Marca</th>
                           <th className="px-4 py-3">Modelo</th>
                           <th className="px-4 py-3">Ano</th>
                           <th className="px-4 py-3">Versão</th>
                           <th className="px-4 py-3">Motor</th>
                           {!showSearchResults && <th className="px-4 py-3">Posições</th>}
                       </tr>
                   </thead>
                   <tbody>
                       {displayRows.map((row, idx) => {
                           const key = compatRowDedupeKey(row);
                           const isSelected = selectedRowKeys.has(key);
                           return (
                               <tr key={key + idx} className={`border-b last:border-0 hover:bg-blue-50/40 ${isSelected ? 'bg-blue-50' : ''}`} onClick={() => toggleRowSelection(key)}>
                                   <td className="px-4 py-2" onClick={e => e.stopPropagation()}>
                                       <input type="checkbox" className="rounded border-gray-300"
                                          checked={isSelected}
                                          onChange={() => toggleRowSelection(key)} />
                                   </td>
                                   <td className="px-4 py-2">{row.marca}</td>
                                   <td className="px-4 py-2 font-semibold">{row.modelo}</td>
                                   <td className="px-4 py-2">{row.ano || '-'}</td>
                                   <td className="px-4 py-2 truncate max-w-[200px]">{row.versao || '-'}</td>
                                   <td className="px-4 py-2">{row.motorizacao || '-'}</td>
                                   {!showSearchResults && (
                                       <td className="px-4 py-2">
                                           {Array.isArray(row.posicoes) && row.posicoes.length > 0 ? (
                                               <div className="flex flex-wrap gap-1">
                                                   {row.posicoes.map(p => <span key={p} className="bg-muted text-[10px] px-1.5 py-0.5 rounded font-medium border">{p}</span>)}
                                               </div>
                                           ) : (
                                               <span className="text-muted-foreground text-xs italic">-</span>
                                           )}
                                       </td>
                                   )}
                               </tr>
                           )
                       })}
                   </tbody>
               </table>
           )}
        </div>
      </div>

      {/* Modal Posicoes */}
      <Dialog open={posicoesModalOpen} onOpenChange={setPosicoesModalOpen}>
        <DialogContent className="max-w-md">
            <DialogHeader>
                <DialogTitle className="text-xl">Adicione as posições</DialogTitle>
                <p className="text-sm text-muted-foreground">Serão salvas em {selectedRowKeys.size} veículos compatíveis.</p>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3 py-4">
                {availablePositions.map(pos => {
                    const isChecked = selectedPositions.has(pos);
                    return (
                        <div key={pos} 
                            onClick={() => {
                                const newSet = new Set(selectedPositions);
                                if (isChecked) newSet.delete(pos); else newSet.add(pos);
                                setSelectedPositions(newSet);
                            }}
                            className={`border rounded-md p-3 flex items-center gap-3 cursor-pointer select-none transition-colors ${isChecked ? 'border-blue-500 bg-blue-50' : 'hover:bg-muted'}`}
                        >
                            <input type="checkbox" checked={isChecked} onChange={() => {}} className="rounded border-gray-300 w-4 h-4 text-blue-600 focus:ring-blue-600" />
                            <span className="text-sm font-medium">{pos}</span>
                        </div>
                    )
                })}
            </div>
            <DialogFooter className="border-t pt-4">
                <Button type="button" variant="default" className="w-full bg-blue-600 hover:bg-blue-700" onClick={confirmPositions}>
                    Adicionar
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
