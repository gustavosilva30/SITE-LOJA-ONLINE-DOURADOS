import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, 
  Search, 
  Filter, 
  Package, 
  ArrowRight, 
  Trash2, 
  Pencil, 
  Settings, 
  Layers,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Settings2,
  Wand2,
  Sparkles,
  Loader2
} from 'lucide-react';
import { firstPecaCatalogImageUrl } from '@/lib/pecaCatalogImageUrls';
import { api } from "@/lib/api";
import { toast } from "sonner";
import { gerarResumoCompatibilidade } from "@/lib/nomePecaMaster";
import { ImageEditorModal } from "@/components/ImageEditor/ImageEditorModal";
import { obterSugestoesVeiculos, VeiculoSugestao } from "@/lib/sugestaoVeiculos";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

export function Catalogo() {
  const navigate = useNavigate()
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 500);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [categorias, setCategorias] = useState<any[]>([]);
  
  // Paginação
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 20
  
  // React Query
  const { data: pecasData, isLoading: loading, refetch: fetchPecas } = useQuery({
    queryKey: ['catalogo', debouncedSearch, filtroCategoria, currentPage],
    queryFn: async () => {
      const qs = new URLSearchParams()
      if (debouncedSearch) qs.set('q', debouncedSearch)
      if (filtroCategoria) qs.set('categoria_id', filtroCategoria)
      qs.set('limit', String(itemsPerPage))
      qs.set('offset', String((currentPage - 1) * itemsPerPage))
      
      const res = await api.get(`/api/catalogo/pecas-v2?${qs.toString()}`)
      return res
    },
    placeholderData: keepPreviousData,
  })

  const totalRegistros = pecasData?.total || 0
  const pecas = pecasData?.items || []
  const paginatedPecas = pecas

  // Calcular total de páginas
  const totalPages = Math.ceil(totalRegistros / itemsPerPage)
  
  // Calcular itens da página atual
  const indexOfFirstItem = (currentPage - 1) * itemsPerPage
  const indexOfLastItem = Math.min(indexOfFirstItem + itemsPerPage, totalRegistros)
  
  // Handlers de navegação
  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page)
    }
  }
  
  // Resetar página quando filtros mudarem
  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearch, filtroCategoria])
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [expandedPecaId, setExpandedPecaId] = useState<string | null>(null);

  const initialFormStateRef = React.useRef<any>(null);
  const initialSelectedVersoesRef = React.useRef<any[]>([]);

  const checkIfDirty = () => {
    if (!initialFormStateRef.current) return false;
    const keysToCompare = ['nome', 'categoria_id', 'part_number', 'preco_padrao', 'imagem_url', 'detalhes', 'detalhes_tecnicos'];
    for (const key of keysToCompare) {
      const currentVal = formPeca[key] ?? '';
      const initialVal = initialFormStateRef.current[key] ?? '';
      if (String(currentVal) !== String(initialVal)) {
        return true;
      }
    }
    const imgUrlsCurrent = formPeca.imagem_urls || [];
    const imgUrlsInitial = initialFormStateRef.current.imagem_urls || [];
    if (imgUrlsCurrent.length !== imgUrlsInitial.length) return true;
    for (let i = 0; i < imgUrlsCurrent.length; i++) {
      if (imgUrlsCurrent[i] !== imgUrlsInitial[i]) return true;
    }
    const initVers = initialSelectedVersoesRef.current || [];
    if (selectedVersoes.length !== initVers.length) return true;
    for (const v of selectedVersoes) {
      if (!initVers.some(iv => isSameVersao(iv, v))) return true;
    }
    return false;
  };

  const handleCloseModal = () => {
    if (checkIfDirty()) {
      if (confirm("Você possui alterações não salvas. Deseja realmente sair e descartar?")) {
        setIsModalOpen(false);
      }
    } else {
      setIsModalOpen(false);
    }
  };

  const [editorData, setEditorData] = useState<{
    isOpen: boolean;
    url: string;
    produtoId: string;
    allUrls: string[];
  } | null>(null);

  // Form Step 1
  const [formPeca, setFormPeca] = useState<any>({
    id: null,
    nome: "",
    categoria_id: "",
    part_number: "",
    preco_padrao: 0,
    imagem_url: "",
    imagem_urls: [],
    detalhes: "",
    detalhes_tecnicos: "",
  });

  const [searchTermCat, setSearchTermCat] = useState("");
  const [showCatSuggestions, setShowCatSuggestions] = useState(false);
  const [newPartNumber, setNewPartNumber] = useState("");

  // Fotos auxiliares
  const pecaImages = (() => {
    const list: string[] = [];
    if (formPeca.imagem_url) list.push(formPeca.imagem_url);
    if (formPeca.imagem_urls) {
      if (Array.isArray(formPeca.imagem_urls)) {
        list.push(...formPeca.imagem_urls);
      } else if (typeof formPeca.imagem_urls === "string") {
        try {
          const parsed = JSON.parse(formPeca.imagem_urls);
          if (Array.isArray(parsed)) list.push(...parsed);
        } catch {
          // ignore
        }
      }
    }
    return Array.from(new Set(list.filter(Boolean)));
  })();

  // Form Step 2
  const [marcas, setMarcas] = useState<any[]>([]);
  const [modelos, setModelos] = useState<any[]>([]);
  const [versoes, setVersoes] = useState<any[]>([]);
  const [selMarca, setSelMarca] = useState("");
  const [selModelo, setSelModelo] = useState("");
  const [selectedVersoes, setSelectedVersoes] = useState<any[]>([]);

  // Step 2 Filters
  const [fMotor, setFMotor] = useState("");
  const [fAnoIni, setFAnoIni] = useState("");
  const [fAnoFim, setFAnoFim] = useState("");

  const [sugestoes, setSugestoes] = useState<VeiculoSugestao[]>([]);
  const [loadingSugestoes, setLoadingSugestoes] = useState(false);

  // fetchPecas manual removido - React Query cuida disso

  const fetchCategorias = async () => {
    try {
      const data = await api.get('/api/configuracoes/categorias')
      console.log('[Catalogo] categorias carregadas:', data)
      setCategorias(Array.isArray(data) ? data : [])
    } catch (e) {
      setCategorias([])
    }
  };

  const fetchMarcas = async () => {
    try {
      const data = await api.get("/api/catalogo/marcas-veiculos");
      setMarcas(Array.isArray(data) ? data : data.marcas ?? data.items ?? []);
    } catch (error) {
      setMarcas([]);
    }
  };

  useEffect(() => {
    fetchCategorias();
    fetchMarcas();
  }, []);

  // Recarrega categorias ao abrir o modal
  useEffect(() => {
    if (isModalOpen) {
      fetchCategorias();
      setSearchTermCat("");
    }
  }, [isModalOpen]);

  useEffect(() => {
    if (selMarca) {
      const marcaObj = (marcas || []).find(m => m.nome === selMarca);
      if (marcaObj) {
        api.get(`/api/catalogo/modelos-veiculos?marca_id=${marcaObj.id}`)
          .then(data => setModelos(Array.isArray(data) ? data : []))
          .catch(() => setModelos([]));
      }
    } else {
      setModelos([]);
    }
  }, [selMarca, marcas]);

  useEffect(() => {
    if (selMarca) {
      const url = selModelo 
        ? `/api/catalogo/versoes-veiculos?marca=${selMarca}&modelo=${selModelo}&limit=10000`
        : `/api/catalogo/versoes-veiculos?marca=${selMarca}&limit=10000`;
      api.get(url)
        .then(data => setVersoes(Array.isArray(data) ? data : []))
        .catch(() => setVersoes([]));
    } else {
      setVersoes([]);
    }
  }, [selModelo, selMarca]);

  const handleSave = async () => {
    try {
      let pecaId = formPeca.id;
      if (pecaId) {
        await api.put(`/api/catalogo/pecas-v2/${pecaId}`, formPeca);
      } else {
        const data = await api.post("/api/catalogo/pecas-v2", formPeca);
        pecaId = data.id;
      }

      await api.post(`/api/catalogo/pecas-v2/${pecaId}/compatibilidades`, { versoes: selectedVersoes });

      toast.success("Peça salva com sucesso!");
      setIsModalOpen(false);
      fetchPecas();
    } catch (error) {
      toast.error("Erro ao salvar peça");
    }
  };

  const isSameVersao = (a: any, b: any) => {
    if (a.id && b.id && a.id === b.id) return true;
    return a.marca === b.marca && 
           a.modelo === b.modelo && 
           (a.versao||'') === (b.versao||'') && 
           (a.familia||'') === (b.familia||'') && 
           (a.motorizacao||'') === (b.motorizacao||'') && 
           String(a.ano_inicio||'') === String(b.ano_inicio||'') && 
           String(a.ano_fim||'') === String(b.ano_fim||'');
  };
  
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [lastAutoFillName, setLastAutoFillName] = useState("");

  const autoSelectVehicles = async (name: string) => {
    if (!name || name.length < 3 || name === lastAutoFillName || isAutoFilling) return;
    
    setIsAutoFilling(true);
    setLastAutoFillName(name);

    try {
      const suggestions = await obterSugestoesVeiculos(name);
      if (suggestions.length > 0) {
        const toAdd = suggestions
          .filter(s => s.matchType === "high")
          .map(s => ({
            id: s.id,
            marca: s.marca,
            modelo: s.modelo,
            familia: s.familia,
            versao: s.versao,
            motorizacao: s.motorizacao,
            ano_inicio: s.ano_inicio,
            ano_fim: s.ano_fim
          }));
        
        if (toAdd.length > 0) {
          setSelectedVersoes(prev => {
            const existing = prev || [];
            const newMatches = toAdd.filter(m => !existing.some(e => isSameVersao(e, m)));
            return [...existing, ...newMatches];
          });
          toast.success(`${toAdd.length} veículos vinculados automaticamente.`);
        } else {
          toast.info("Nenhum veículo de alta compatibilidade encontrado automaticamente.");
        }
      } else {
        toast.info("Nenhum veículo encontrado automaticamente para este nome.");
      }
    } catch (err) {
      console.error("Erro ao auto-selecionar veículos:", err);
    } finally {
      setIsAutoFilling(false);
    }
  };

  const toggleVersao = (v: any) => {
    setSelectedVersoes(prev => {
      const idx = (prev || []).findIndex(x => isSameVersao(x, v));
      if (idx >= 0) {
        return prev.filter((_, i) => i !== idx);
      } else {
        return [...(prev || []), v];
      }
    });
  };

  const filteredVersoes = (versoes || []).filter(v => {
    return (!fMotor || (v.motorizacao || "").toLowerCase().includes(fMotor.toLowerCase())) &&
           (!fAnoIni || v.ano_inicio >= parseInt(fAnoIni)) &&
           (!fAnoFim || (v.ano_fim || 9999) <= parseInt(fAnoFim));
  });

  const filteredCats = searchTermCat
    ? (categorias || []).filter(c => 
        String(c.nome || "").toLowerCase().includes(searchTermCat.toLowerCase())
      )
    : (categorias || []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.categoria-autocomplete')) {
        setShowCatSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const [compatibilidadesPeca, setCompatibilidadesPeca] = useState<Record<string, any[]>>({});

  const expandPeca = async (id: string) => {
    if (expandedPecaId === id) {
      setExpandedPecaId(null);
      return;
    }
    setExpandedPecaId(id);
    if (!compatibilidadesPeca[id]) {
      try {
        const data = await api.get(`/api/catalogo/pecas-v2/${id}/compatibilidades`);
        setCompatibilidadesPeca(prev => ({ ...prev, [id]: Array.isArray(data) ? data : [] }));
      } catch (error) {
        setCompatibilidadesPeca(prev => ({ ...prev, [id]: [] }));
      }
    }
  };

  const groupedCompat = (id: string) => {
    const list = compatibilidadesPeca[id] || [];
    const groups: Record<string, string[]> = {};
    (list || []).forEach(c => {
      const key = `${c.marca} ${c.modelo} ${c.ano}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(`${c.versao} ${c.motorizacao}`);
    });
    return groups;
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl md:text-3xl font-black flex items-center gap-2">
          <Package className="w-8 h-8 text-primary" /> Catálogo de Peças
        </h1>
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <Button
            onClick={() => {
              const newForm = { id: null, nome: "", categoria_id: "", part_number: "", preco_padrao: 0, imagem_url: "", imagem_urls: [], detalhes: "", detalhes_tecnicos: "" };
              setFormPeca(newForm);
              setNewPartNumber("");
              setSelectedVersoes([]);
              setSugestoes([]);
              setWizardStep(1);
              initialFormStateRef.current = newForm;
              initialSelectedVersoesRef.current = [];
              setIsModalOpen(true);
            }} className="flex-1 md:flex-none gap-2 bg-indigo-600 hover:bg-indigo-700 text-white h-11 rounded-xl">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nova Peça</span>
            <span className="sm:hidden">Nova</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate("/catalogo/criacao-massa")}
            className="flex-1 md:flex-none gap-2 h-11 rounded-xl"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Criação em Massa</span>
            <span className="sm:hidden">Criar Massa</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate("/catalogo/alteracao-massa")}
            className="flex-1 md:flex-none gap-2 h-11 rounded-xl"
          >
            <Settings2 className="w-4 h-4" />
            <span className="hidden sm:inline">Alteração em Massa</span>
            <span className="sm:hidden">Alt. Massa</span>
          </Button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome ou part number..." className="pl-9 h-11 rounded-xl" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <select className="h-11 rounded-xl border border-input px-3 text-sm min-w-[200px] bg-background w-full md:w-auto" value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
          <option value="">Todas as categorias</option>
          {(categorias || []).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="space-y-2">
            {loading ? (
              <div className="text-center py-10 text-muted-foreground">Carregando...</div>
            ) : (pecas || []).length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">Nenhuma peça encontrada.</div>
            ) : (paginatedPecas || []).map((p) => (
              <div key={p.id} className="border rounded-lg">
                <div 
                  className="flex flex-col md:flex-row md:items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => expandPeca(p.id)}
                >
                  <div className="flex items-center gap-3 w-full md:w-auto">
                    {/* Foto 64x64px */}
                    <div className="flex-shrink-0">
                      {(() => {
                        const displayUrl = firstPecaCatalogImageUrl(p);
                        return displayUrl ? (
                          <img
                            src={displayUrl}
                            className="w-16 h-16 object-cover rounded border"
                            alt={p.nome}
                          />
                        ) : (
                          <div className="w-16 h-16 bg-muted rounded flex items-center justify-center border">
                            <Package className="w-7 h-7 text-muted-foreground" />
                          </div>
                        );
                      })()}
                    </div>

                    {/* Nome, modelos e gerações */}
                    <div className="flex-1 min-w-0">
                      <div className="font-bold truncate text-sm md:text-base" title={p.nome}>
                        {p.nome.length > 60 ? p.nome.substring(0, 57) + "..." : p.nome}
                      </div>
                      {/* Modelos e gerações resumidos */}
                      {(p.modelos_resumo || p.geracoes_resumo) && (
                        <div className="text-[11px] md:text-xs text-muted-foreground truncate mt-0.5">
                          {[p.modelos_resumo, p.geracoes_resumo].filter(Boolean).join(" · ")}
                        </div>
                      )}
                      <div className="text-[11px] md:text-xs text-muted-foreground truncate">{p.categoria_nome}</div>
                    </div>
                  </div>

                  {/* Preço, versões e ações agrupados (alinhado horizontalmente em mobile) */}
                  <div className="flex items-center justify-between w-full md:w-auto md:ml-auto gap-3 border-t md:border-t-0 pt-2 md:pt-0">
                    <div className="flex items-center gap-2">
                      {/* Preço do produto */}
                      <span className="font-bold text-xs md:text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-1 rounded-md border border-emerald-100 dark:border-emerald-900/30">
                        R$ {(p.preco_padrao || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>

                      {/* Badge de versões */}
                      <Badge variant="secondary" className="text-[10px] md:text-xs">{p.qtd_compatibilidades} versões</Badge>
                    </div>

                    {/* Botões de ação */}
                    <div className="flex items-center gap-0.5">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (!p.imagem_url) {
                            toast.error("Esta peça não possui imagem para editar")
                            return
                          }
                          // Monta lista de todas as URLs (principal + galeria)
                          let allUrls: string[] = []
                          if (p.imagem_url) allUrls.push(p.imagem_url)
                          if (p.imagem_urls) {
                            if (Array.isArray(p.imagem_urls)) {
                              allUrls = [...allUrls, ...p.imagem_urls]
                            } else if (typeof p.imagem_urls === "string") {
                              try {
                                const parsed = JSON.parse(p.imagem_urls)
                                if (Array.isArray(parsed)) allUrls = [...allUrls, ...parsed]
                              } catch {
                                allUrls.push(p.imagem_urls)
                              }
                            }
                          }
                          
                          setEditorData({
                            isOpen: true,
                            url: p.imagem_url,
                            produtoId: p.id,
                            allUrls: Array.from(new Set(allUrls)) // remove duplicatas
                          })
                        }}
                        title="Editar imagem (IA / Filtros)"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation()
                          const parsedForm = {
                            id: p.id,
                            nome: p.nome || "",
                            categoria_id: p.categoria_id || "",
                            part_number: p.part_number || "",
                            preco_padrao: p.preco_padrao || 0,
                            imagem_url: p.imagem_url || "",
                            imagem_urls: (() => {
                              if (!p.imagem_urls) return [];
                              if (Array.isArray(p.imagem_urls)) return p.imagem_urls;
                              if (typeof p.imagem_urls === "string") {
                                try {
                                  const parsed = JSON.parse(p.imagem_urls);
                                  if (Array.isArray(parsed)) return parsed;
                                } catch {
                                  return [p.imagem_urls];
                                }
                              }
                              return [];
                            })(),
                            detalhes: p.detalhes || "",
                            detalhes_tecnicos: p.detalhes_tecnicos || "",
                          };
                          setFormPeca(parsedForm);
                          initialFormStateRef.current = parsedForm;
                          initialSelectedVersoesRef.current = [];
                          setNewPartNumber("")
                          const cat = categorias.find(c => c.id === p.categoria_id)
                          if (cat) setSearchTermCat(cat.nome)
                          
                          api.get(`/api/catalogo/pecas-v2/${p.id}/compatibilidades`)
                            .then((compatData: any) => {
                              if (Array.isArray(compatData)) {
                                const formatted = compatData.map(c => {
                                  const anos = c.ano ? String(c.ano).split('/') : [];
                                  return {
                                    id: c.id, 
                                    marca: c.marca,
                                    modelo: c.modelo,
                                    familia: c.familia,
                                    versao: c.versao,
                                    motorizacao: c.motorizacao,
                                    ano_inicio: anos[0] && anos[0] !== "null" && anos[0] !== "Atual" ? parseInt(anos[0]) : null,
                                    ano_fim: anos[1] && anos[1] !== "null" && anos[1] !== "Atual" ? parseInt(anos[1]) : null
                                  };
                                });
                                setSelectedVersoes(formatted);
                                initialSelectedVersoesRef.current = formatted;
                              } else {
                                setSelectedVersoes([]);
                                initialSelectedVersoesRef.current = [];
                              }
                            })
                            .catch(() => {
                              setSelectedVersoes([]);
                              initialSelectedVersoesRef.current = [];
                            });

                          setWizardStep(1)
                          setSugestoes([])
                          setIsModalOpen(true)
                        }}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-destructive"
                        onClick={async (e) => { 
                          e.stopPropagation(); 
                          if(confirm("Excluir peça?")) { 
                            await api.delete(`/api/catalogo/pecas-v2/${p.id}`); 
                            fetchPecas(); 
                          } 
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Expansão com compatibilidades */}
                {expandedPecaId === p.id && (
                  <div className="border-t bg-muted/30 p-4">
                    <div className="space-y-2">
                      {Object.entries(groupedCompat(p.id)).map(([key, versions]) => (
                        <div key={key} className="text-sm">
                          <span className="font-black uppercase text-primary">{key} — </span>
                          <span className="text-muted-foreground">{versions.join(" | ")}</span>
                        </div>
                      ))}
                    </div>
                    {p.detalhes && (
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-xs font-bold text-muted-foreground uppercase mb-1">Detalhes</p>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{p.detalhes}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
        
        {/* Paginação */}
        {totalRegistros > 0 && (
          <div className="px-6 py-4 border-t flex items-center justify-between bg-gray-50/50">
            <div className="text-sm text-muted-foreground">
              Mostrando {indexOfFirstItem + 1}-{indexOfLastItem} de {totalRegistros} peças
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="h-8 w-8 p-0"
              >
                &lt;
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  // Mostra páginas ao redor da atual
                  let pageNum
                  if (totalPages <= 5) {
                    pageNum = i + 1
                  } else if (currentPage <= 3) {
                    pageNum = i + 1
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i
                  } else {
                    pageNum = currentPage - 2 + i
                  }
                  return (
                    <Button
                      key={pageNum}
                      variant={currentPage === pageNum ? "default" : "outline"}
                      size="sm"
                      onClick={() => handlePageChange(pageNum)}
                      className="h-8 w-8 p-0 text-xs"
                    >
                      {pageNum}
                    </Button>
                  )
                })}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="h-8 w-8 p-0"
              >
                &gt;
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Modal title={formPeca.id ? "Editar Peça" : "Cadastro de Peça"} isOpen={isModalOpen} onClose={handleCloseModal} className="max-w-[1400px] w-[95vw]">
        <div className="space-y-6">
          <div className="flex justify-center gap-8 mb-4">
            <div className={`flex items-center gap-2 ${wizardStep >= 1 ? 'text-primary' : 'text-muted-foreground'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${wizardStep >= 1 ? 'border-primary bg-primary text-white' : 'border-muted'}`}>1</div>
              <span className="font-bold">Dados</span>
            </div>
            <div className={`flex items-center gap-2 ${wizardStep >= 2 ? 'text-primary' : 'text-muted-foreground'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${wizardStep >= 2 ? 'border-primary bg-primary text-white' : 'border-muted'}`}>2</div>
              <span className="font-bold">Veículos</span>
            </div>
            <div className={`flex items-center gap-2 ${wizardStep >= 3 ? 'text-primary' : 'text-muted-foreground'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${wizardStep >= 3 ? 'border-primary bg-primary text-white' : 'border-muted'}`}>3</div>
              <span className="font-bold">Revisão</span>
            </div>
          </div>

          {wizardStep === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome da Peça</Label>
                <div className="flex gap-2">
                  <Input 
                    value={formPeca.nome} 
                    onChange={e => setFormPeca({...formPeca, nome: e.target.value})} 
                    placeholder="Ex: Agregado Corolla 2003/2008 1.8" 
                    className="flex-1"
                    maxLength={60}
                  />
                </div>
              </div>
              <div className="space-y-2 relative categoria-autocomplete">
                <Label>Categoria</Label>
                <div className="relative">
                  <Input 
                    value={searchTermCat || (categorias.find(c => c.id === formPeca.categoria_id)?.nome || "")} 
                    onChange={e => {
                      setSearchTermCat(e.target.value);
                      setShowCatSuggestions(true);
                      if (!e.target.value) setFormPeca({...formPeca, categoria_id: ""});
                    }}
                    onFocus={() => setShowCatSuggestions(true)}
                    placeholder="Buscar categoria..."
                  />
                  {showCatSuggestions && (
                    <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-[200px] overflow-y-auto">
                      {(filteredCats || []).length > 0 ? filteredCats.map(c => (
                        <div 
                          key={c.id} 
                          className="p-2 hover:bg-muted cursor-pointer text-sm border-b last:border-0"
                          onClick={() => {
                            setFormPeca({...formPeca, categoria_id: c.id});
                            setSearchTermCat(c.nome);
                            setShowCatSuggestions(false);
                          }}
                        >
                          {c.nome}
                        </div>
                      )) : (
                        <div className="p-2 text-xs text-muted-foreground italic">Nenhuma categoria encontrada</div>
                      )}
                    </div>
                  )}
                </div>
                {showCatSuggestions && <div className="fixed inset-0 z-40" onClick={() => setShowCatSuggestions(false)} />}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex justify-between items-center">
                    <span>Part Number(s)</span>
                    {formPeca.part_number ? (
                      <span className="text-[10px] font-bold text-muted-foreground uppercase">
                        {formPeca.part_number.split(/\s*\/\s*/).filter(Boolean).length} cadastrado(s)
                      </span>
                    ) : null}
                  </Label>
                  <div 
                    onClick={() => document.getElementById("part-number-chip-input")?.focus()}
                    className="flex flex-wrap gap-1.5 p-2 min-h-10 w-full rounded-md border border-input bg-background text-sm ring-offset-background cursor-text focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-all"
                  >
                    {(formPeca.part_number || "")
                      .split(/\s*\/\s*/)
                      .map(p => p.trim())
                      .filter(Boolean)
                      .map((pn, index, arr) => (
                        <Badge 
                          key={index} 
                          variant="secondary" 
                          className="gap-1 pl-2 pr-1.5 py-0.5 text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200/50 rounded-md transition-all animate-in zoom-in-95 duration-150"
                        >
                          {pn}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const updated = arr.filter((_, i) => i !== index);
                              setFormPeca({ ...formPeca, part_number: updated.join(" / ") });
                            }}
                            className="text-indigo-400 hover:text-indigo-600 rounded-full focus:outline-none transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                    <input
                      id="part-number-chip-input"
                      type="text"
                      value={newPartNumber}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (/[;,\/]/.test(val)) {
                          const tokens = val.split(/[;,\/]/);
                          const toAdd = tokens.slice(0, -1).map(t => t.trim().toUpperCase()).filter(Boolean);
                          const remainder = tokens[tokens.length - 1];
                          
                          if (toAdd.length > 0) {
                            const currentList = (formPeca.part_number || "")
                              .split(/\s*\/\s*/)
                              .map(p => p.trim())
                              .filter(Boolean);
                            const updatedList = [...currentList];
                            toAdd.forEach(t => {
                              if (!updatedList.includes(t)) updatedList.push(t);
                            });
                            setFormPeca({ ...formPeca, part_number: updatedList.join(" / ") });
                          }
                          setNewPartNumber(remainder);
                        } else {
                          setNewPartNumber(val);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const clean = newPartNumber.trim().toUpperCase();
                          if (clean) {
                            const currentList = (formPeca.part_number || "")
                              .split(/\s*\/\s*/)
                              .map(p => p.trim())
                              .filter(Boolean);
                            if (!currentList.includes(clean)) {
                              currentList.push(clean);
                              setFormPeca({ ...formPeca, part_number: currentList.join(" / ") });
                            }
                            setNewPartNumber("");
                          }
                        } else if (e.key === "Backspace" && !newPartNumber) {
                          const currentList = (formPeca.part_number || "")
                            .split(/\s*\/\s*/)
                            .map(p => p.trim())
                            .filter(Boolean);
                          if (currentList.length > 0) {
                            const updated = currentList.slice(0, -1);
                            setFormPeca({ ...formPeca, part_number: updated.join(" / ") });
                          }
                        }
                      }}
                      onPaste={(e) => {
                        e.preventDefault();
                        const pastedText = e.clipboardData.getData("text");
                        const tokens = pastedText.split(/[;,\/\n]/).map(t => t.trim().toUpperCase()).filter(Boolean);
                        if (tokens.length > 0) {
                          const currentList = (formPeca.part_number || "")
                            .split(/\s*\/\s*/)
                            .map(p => p.trim())
                            .filter(Boolean);
                          const updatedList = [...currentList];
                          tokens.forEach(t => {
                            if (!updatedList.includes(t)) updatedList.push(t);
                          });
                          setFormPeca({ ...formPeca, part_number: updatedList.join(" / ") });
                        }
                        setNewPartNumber("");
                      }}
                      onBlur={() => {
                        const clean = newPartNumber.trim().toUpperCase();
                        if (clean) {
                          const currentList = (formPeca.part_number || "")
                            .split(/\s*\/\s*/)
                            .map(p => p.trim())
                            .filter(Boolean);
                          if (!currentList.includes(clean)) {
                            currentList.push(clean);
                            setFormPeca({ ...formPeca, part_number: currentList.join(" / ") });
                          }
                          setNewPartNumber("");
                        }
                      }}
                      placeholder={(formPeca.part_number || "").split(/\s*\/\s*/).filter(Boolean).length === 0 ? "Ex: 93380480, press Enter" : ""}
                      className="flex-1 bg-transparent outline-none border-none p-0.5 text-sm focus:ring-0 focus:outline-none min-w-[120px]"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Preço Padrão (R$)</Label>
                  <Input type="number" value={formPeca.preco_padrao} onChange={e => setFormPeca({...formPeca, preco_padrao: parseFloat(e.target.value)})} />
                </div>
              </div>

              {/* Seção de Fotos do Produto (Até 10 Imagens) */}
              <div className="space-y-3 pt-2">
                <Label className="flex justify-between items-center">
                  <span className="font-bold flex items-center gap-1.5 text-slate-700">
                    <ImageIcon className="w-4 h-4 text-indigo-500" /> Fotos da Peça ({pecaImages.length} de 10)
                  </span>
                  <span className="text-[10px] text-muted-foreground font-semibold uppercase bg-slate-100 px-2 py-0.5 rounded-full">
                    Máx. 10 Imagens
                  </span>
                </Label>
                
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {pecaImages.map((imgUrl, index) => (
                    <div 
                      key={index} 
                      className={cn(
                        "group relative aspect-square rounded-xl border overflow-hidden bg-slate-50 transition-all hover:shadow-md hover:border-indigo-200 animate-in zoom-in-95 duration-200",
                        index === 0 ? "border-indigo-400 ring-2 ring-indigo-100" : "border-slate-200"
                      )}
                    >
                      <img 
                        src={imgUrl} 
                        alt={`Foto ${index + 1}`} 
                        className="w-full h-full object-cover" 
                      />
                      
                      {/* Ações flutuantes ao passar o mouse */}
                      <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 pointer-events-none">
                        {index > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              const newList = [imgUrl, ...pecaImages.filter((_, i) => i !== index)];
                              setFormPeca(prev => ({
                                ...prev,
                                imagem_url: newList[0],
                                imagem_urls: newList.slice(1)
                              }));
                              toast.success("Foto principal alterada!");
                            }}
                            className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-transform hover:scale-105 pointer-events-auto"
                            title="Definir como principal"
                          >
                            Principal
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            const newList = pecaImages.filter((_, i) => i !== index);
                            setFormPeca(prev => ({
                              ...prev,
                              imagem_url: newList[0] || "",
                              imagem_urls: newList.slice(1)
                            }));
                            toast.info("Foto removida.");
                          }}
                          className="p-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white transition-transform hover:scale-105 pointer-events-auto"
                          title="Excluir foto"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Badge Principal */}
                      {index === 0 && (
                        <span className="absolute top-1.5 left-1.5 text-[9px] font-black uppercase text-white bg-indigo-600 px-2 py-0.5 rounded-md tracking-wider shadow-sm">
                          Principal
                        </span>
                      )}
                      
                      {/* Indicador de ordem */}
                      <span className="absolute bottom-1.5 right-1.5 text-[10px] font-bold text-white bg-slate-900/40 backdrop-blur-[2px] px-1.5 py-0.5 rounded-md">
                        {index + 1}
                      </span>
                    </div>
                  ))}

                  {/* Slot de Upload de Fotos (se menos de 10) */}
                  {pecaImages.length < 10 && (
                    <div 
                      onClick={() => document.getElementById('peca-multi-foto-input')?.click()}
                      className="aspect-square rounded-xl border-2 border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/20 cursor-pointer flex flex-col items-center justify-center text-slate-500 transition-all gap-1.5 group"
                    >
                      <div className="p-2 rounded-full bg-slate-100 group-hover:bg-indigo-100/50 group-hover:text-indigo-600 transition-colors">
                        <Plus className="w-5 h-5" />
                      </div>
                      <span className="text-[11px] font-semibold">Adicionar Foto</span>
                      <span className="text-[9px] text-muted-foreground">JPG, PNG até 5MB</span>
                    </div>
                  )}
                </div>

                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  id="peca-multi-foto-input"
                  onChange={async (e) => {
                    const files = Array.from(e.target.files || []);
                    if (files.length === 0) return;

                    const remainingSlots = 10 - pecaImages.length;
                    const filesToUpload = files.slice(0, remainingSlots);

                    if (files.length > remainingSlots) {
                      toast.warning(`Limite de 10 fotos atingido. Apenas as primeiras ${remainingSlots} fotos serão enviadas.`);
                    }

                    for (const file of filesToUpload) {
                      const localUrl = URL.createObjectURL(file);
                      
                      // 1. Adiciona preview local instantâneo
                      setFormPeca(prev => {
                        const current = [...pecaImages, localUrl];
                        return {
                          ...prev,
                          imagem_url: current[0],
                          imagem_urls: current.slice(1)
                        };
                      });

                      // 2. Faz upload para o MinIO
                      try {
                        const formData = new FormData();
                        formData.append('file', file);
                        const result = await api.postMultipart('/api/admin/upload-produto-imagem', formData);
                        
                        URL.revokeObjectURL(localUrl);

                        // 3. Substitui o preview local pela URL final do MinIO
                        setFormPeca(prev => {
                          const currentList = (() => {
                            const l = [];
                            if (prev.imagem_url) l.push(prev.imagem_url);
                            if (prev.imagem_urls) {
                              if (Array.isArray(prev.imagem_urls)) l.push(...prev.imagem_urls);
                              else if (typeof prev.imagem_urls === "string") {
                                try {
                                  const parsed = JSON.parse(prev.imagem_urls);
                                  if (Array.isArray(parsed)) l.push(...parsed);
                                } catch {}
                               }
                            }
                            return l;
                          })();
                          const updated = currentList.map(url => url === localUrl ? result.url : url);
                          return {
                            ...prev,
                            imagem_url: updated[0] || "",
                            imagem_urls: updated.slice(1)
                          };
                        });
                        
                        toast.success(`Foto "${file.name}" enviada!`);
                      } catch {
                        URL.revokeObjectURL(localUrl);
                        toast.error(`Falha no upload da foto "${file.name}"`);
                        
                        // Remove o preview local caso dê erro
                        setFormPeca(prev => {
                          const currentList = (() => {
                            const l = [];
                            if (prev.imagem_url) l.push(prev.imagem_url);
                            if (prev.imagem_urls) {
                              if (Array.isArray(prev.imagem_urls)) l.push(...prev.imagem_urls);
                              else if (typeof prev.imagem_urls === "string") {
                                try {
                                  const parsed = JSON.parse(prev.imagem_urls);
                                  if (Array.isArray(parsed)) l.push(...parsed);
                                } catch {}
                              }
                            }
                            return l;
                          })();
                          const updated = currentList.filter(url => url !== localUrl);
                          return {
                            ...prev,
                            imagem_url: updated[0] || "",
                            imagem_urls: updated.slice(1)
                          };
                        });
                      }
                    }
                    e.target.value = "";
                  }}
                />
              </div>

              {/* Campo Detalhes - fora do grid, largura total */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label>Detalhes / Descrição da Peça</Label>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-7 text-[10px] font-black uppercase gap-1 hover:bg-primary/10 text-primary"
                    onClick={() => {
                      const resumo = gerarResumoCompatibilidade(selectedVersoes);
                      if (resumo) {
                        const current = formPeca.detalhes ? formPeca.detalhes + "\n\n" : "";
                        setFormPeca({ ...formPeca, detalhes: current + "VEÍCULOS COMPATÍVEIS:\n" + resumo });
                        toast.success("Resumo gerado!");
                      } else {
                        toast.error("Nenhum veículo selecionado para o resumo.");
                      }
                    }}
                  >
                    <Settings2 className="w-3 h-3" /> Gerar Resumo de Compatibilidade
                  </Button>
                </div>
                <textarea
                  className="w-full min-h-[90px] rounded-md border border-input px-3 py-2 text-sm bg-background resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Descreva a peça: aplicações, observações, materiais, diferenciais... Ex: Agregado completo com motor e câmbio. Compatível apenas com versões com ar-condicionado."
                  value={formPeca.detalhes || ""}
                  onChange={e => setFormPeca({...formPeca, detalhes: e.target.value})}
                  maxLength={3000}
                />
                <p className="text-xs text-muted-foreground text-right">{(formPeca.detalhes || "").length}/3000</p>
              </div>

              {/* Campo Detalhes Técnicos */}
              <div className="space-y-2">
                <Label>Detalhes Técnicos</Label>
                <textarea
                  className="w-full min-h-[90px] rounded-md border border-input px-3 py-2 text-sm bg-background resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Especificações técnicas, dimensões, materiais, código OEM, torques, temperaturas de operação..."
                  value={formPeca.detalhes_tecnicos || ""}
                  onChange={e => setFormPeca({...formPeca, detalhes_tecnicos: e.target.value})}
                  maxLength={3000}
                />
                <p className="text-xs text-muted-foreground text-right">{(formPeca.detalhes_tecnicos || "").length}/3000</p>
              </div>

              <div className="flex justify-end pt-4">
                <Button onClick={async () => {
                  setWizardStep(2);
                  if (formPeca.nome) {
                    setLoadingSugestoes(true);
                    try {
                      const suggestions = await obterSugestoesVeiculos(formPeca.nome);
                      setSugestoes(suggestions);
                    } catch (e) {
                      console.error("Erro ao buscar sugestões:", e);
                    } finally {
                      setLoadingSugestoes(false);
                    }
                  }
                }}>Próximo: Vincular Veículos</Button>
              </div>
            </div>
          )}

          {wizardStep === 2 && (
            <div className="grid grid-cols-2 gap-10 h-[700px]">
              <div className="space-y-4 flex flex-col h-full">
                {/* Painel de Sugestões Inteligentes */}
                {loadingSugestoes && (
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center justify-center gap-2 mb-2 h-16 shrink-0">
                    <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider animate-pulse">Buscando sugestões compatíveis...</span>
                  </div>
                )}

                {!loadingSugestoes && sugestoes.length > 0 && (
                  <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-4 rounded-xl border border-indigo-100 space-y-3 mb-2 shadow-sm animate-in fade-in duration-200 shrink-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-indigo-600 animate-pulse" />
                        <h4 className="font-extrabold text-sm text-indigo-950 uppercase tracking-tight">
                          💡 Sugestões Inteligentes ({sugestoes.length})
                        </h4>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-7 text-[10px] font-black uppercase text-indigo-700 bg-white hover:bg-indigo-50 border-indigo-200"
                          onClick={() => {
                            const toAdd = sugestoes.map(s => ({
                              id: s.id,
                              marca: s.marca,
                              modelo: s.modelo,
                              familia: s.familia,
                              versao: s.versao,
                              motorizacao: s.motorizacao,
                              ano_inicio: s.ano_inicio,
                              ano_fim: s.ano_fim
                            }));
                            setSelectedVersoes(prev => {
                              const existing = prev || [];
                              const newMatches = toAdd.filter(m => !existing.some(e => isSameVersao(e, m)));
                              return [...existing, ...newMatches];
                            });
                            toast.success(`${toAdd.length} sugestões adicionadas com sucesso!`);
                          }}
                        >
                          Marcar Todas
                        </Button>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 max-h-[140px] overflow-y-auto pr-1">
                      {sugestoes.map((s) => {
                        const isSelected = !!(selectedVersoes || []).find(x => isSameVersao(x, s));
                        return (
                          <Badge
                            key={s.id}
                            variant="secondary"
                            className={cn(
                              "px-3 py-1.5 cursor-pointer rounded-lg font-semibold flex items-center gap-1.5 transition-all text-xs border select-none",
                              isSelected 
                                ? "bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700 animate-in zoom-in-95 duration-100" 
                                : "bg-white text-indigo-950 hover:bg-indigo-50 border-indigo-200"
                            )}
                            onClick={() => {
                              toggleVersao({
                                id: s.id,
                                marca: s.marca,
                                modelo: s.modelo,
                                familia: s.familia,
                                versao: s.versao,
                                motorizacao: s.motorizacao,
                                ano_inicio: s.ano_inicio,
                                ano_fim: s.ano_fim
                              });
                            }}
                          >
                            {isSelected ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5 text-indigo-500" />}
                            <span>
                              {s.marca} {s.modelo} {s.familia && `(${s.familia})`} {s.versao && `· ${s.versao}`} {s.motorizacao} ({s.ano_inicio}-{s.ano_fim || "at."})
                            </span>
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <select className="h-9 rounded-md border border-input px-2 text-sm" value={selMarca} onChange={e => setSelMarca(e.target.value)}>
                    <option value="">Marca</option>
                    {(marcas || []).map(m => <option key={m.id} value={m.nome}>{m.nome}</option>)}
                  </select>
                  <select className="h-9 rounded-md border border-input px-2 text-sm" value={selModelo} onChange={e => setSelModelo(e.target.value)} disabled={!selMarca}>
                    <option value="">Modelo</option>
                    {(modelos || []).map(m => <option key={m.id} value={m.nome}>{m.nome}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Input placeholder="Motor" className="h-8 text-xs" value={fMotor} onChange={e => setFMotor(e.target.value)} />
                  <Input placeholder="Ano Ini" className="h-8 text-xs" type="number" value={fAnoIni} onChange={e => setFAnoIni(e.target.value)} />
                  <Input placeholder="Ano Fim" className="h-8 text-xs" type="number" value={fAnoFim} onChange={e => setFAnoFim(e.target.value)} />
                </div>
                <div className="flex-1 border rounded-md overflow-y-auto p-3 space-y-2 bg-slate-50/50 shadow-inner">
                  {filteredVersoes.map(v => {
                    const isSelected = !!(selectedVersoes || []).find(x => isSameVersao(x, v));
                    return (
                      <label key={v.id} className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all hover:shadow-sm",
                        isSelected ? "bg-primary/10 border-primary shadow-sm" : "bg-white border-slate-200 hover:border-primary/30"
                      )}>
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
                          checked={isSelected} 
                          onChange={() => toggleVersao(v)} 
                        />
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-bold uppercase text-slate-700 truncate">{v.marca} {v.modelo}</span>
                          <span className="text-xs text-slate-500 leading-tight">
                            {v.familia && <span className="font-semibold text-slate-600">{v.familia} · </span>}
                            {v.versao} · {v.motorizacao} · {v.ano_inicio}-{v.ano_fim || "Atual"}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                  <Button variant="outline" size="sm" className="w-full text-xs font-bold border-dashed" onClick={() => filteredVersoes.forEach(v => !(selectedVersoes || []).find(x => isSameVersao(x, v)) && toggleVersao(v))}>
                    Marcar todas desta lista ({filteredVersoes.length})
                  </Button>
                </div>
              </div>
              <div className="space-y-4 flex flex-col h-full bg-muted/20 p-4 rounded-md">
                <div className="flex justify-between items-center">
                  <Label className="font-bold">Selecionadas</Label>
                  <Badge>{(selectedVersoes || []).length} versões</Badge>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                  {(selectedVersoes || []).map(v => (
                    <div key={v.id} className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-slate-200 shadow-sm transition-all hover:border-rose-200">
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-black uppercase text-slate-600">{v.marca} {v.modelo}</span>
                        <span className="text-xs text-slate-500 truncate">{v.versao} · {v.motorizacao}</span>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7 text-rose-500 hover:text-rose-600 hover:bg-rose-50"
                        onClick={() => toggleVersao(v)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between pt-2">
                  <Button variant="outline" onClick={() => setWizardStep(1)}>Voltar</Button>
                  <Button onClick={() => setWizardStep(3)}>Revisar e Salvar</Button>
                </div>
              </div>
            </div>
          )}

          {wizardStep === 3 && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 border p-4 rounded-md">
                <div>
                  <Label className="text-muted-foreground text-sm font-bold uppercase tracking-tight">Nome da Peça</Label>
                  <p className="font-bold text-lg">{formPeca.nome}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm font-bold uppercase tracking-tight">Categoria</Label>
                  <p className="font-bold text-lg">{(categorias || []).find(c=>c.id===formPeca.categoria_id)?.nome}</p>
                </div>
              </div>
              {formPeca.detalhes && (
                <div className="border p-4 rounded-md bg-muted/10">
                  <Label className="text-muted-foreground text-sm font-bold uppercase tracking-tight">Detalhes / Descrição</Label>
                  <p className="text-base mt-1 whitespace-pre-wrap">{formPeca.detalhes}</p>
                </div>
              )}
              <div className="space-y-2">
                <Label className="font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  Versões Compatíveis ({(selectedVersoes || []).length})
                </Label>
                <div className="border rounded-xl p-4 max-h-[450px] overflow-y-auto bg-slate-50/50 shadow-inner grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(selectedVersoes || []).map(v => (
                    <div key={v.id} className="text-sm p-3 bg-white border border-slate-200 rounded-lg flex flex-col gap-1 shadow-sm">
                      <span className="font-black uppercase text-primary text-xs">{v.marca} {v.modelo}</span>
                      <p className="text-slate-600 leading-tight">
                        {v.familia && <span className="font-semibold">{v.familia} · </span>}
                        {v.versao} · {v.motorizacao}
                      </p>
                      <p className="text-xs text-muted-foreground font-medium">Anos: {v.ano_inicio} a {v.ano_fim || "Atual"}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-between pt-4 border-t">
                <Button variant="outline" onClick={() => setWizardStep(2)}>Voltar</Button>
                <Button onClick={handleSave} className="gap-2"><Check className="w-4 h-4" /> Salvar Peça no Catálogo</Button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {editorData && (
        <ImageEditorModal
          isOpen={editorData.isOpen}
          imageUrl={editorData.url}
          produtoId={editorData.produtoId}
          allUrls={editorData.allUrls}
          onClose={() => setEditorData(null)}
          onSave={() => {
            setEditorData(null);
            fetchPecas();
          }}
        />
      )}
    </div>
  );
}

export default Catalogo;