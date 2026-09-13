import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { 
  ChevronLeft, 
  Plus, 
  Trash2, 
  Package, 
  Check, 
  X, 
  ImageIcon, 
  Loader2,
  Car,
  Layers,
  Settings2,
  Copy,
  Sparkles,
  Search,
  CheckCircle2
} from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { gerarResumoCompatibilidade } from "@/lib/nomePecaMaster";
import { obterSugestoesVeiculos, VeiculoSugestao } from "@/lib/sugestaoVeiculos";

interface CategoryData {
  id: string;
  nome: string;
  preco_padrao: number;
  imagem_url: string;
  detalhes: string;
}

export function CatalogoCriacaoMassa() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Abas do modo de criação em massa
  const [mode, setMode] = useState<"uma_categoria" | "multi_categorias">("uma_categoria");
  
  // Wizard Steps (tanto para Modo A quanto Modo B)
  const [wizardStep, setWizardStep] = useState(1);
  
  // Categorias (todas do BD)
  const [categorias, setCategorias] = useState<any[]>([]);
  const [searchTermCat, setSearchTermCat] = useState("");
  const [showCatSuggestions, setShowCatSuggestions] = useState(false);

  // --- ESTADOS DO MODO B (Múltiplas Categorias - Comportamento Existente) ---
  const [selectedCategories, setSelectedCategories] = useState<CategoryData[]>([]);
  const [selectedVersoes, setSelectedVersoes] = useState<any[]>([]);

  // --- ESTADOS DO MODO A (Mesma Categoria - NOVO!) ---
  const [singleSelectedCat, setSingleSelectedCat] = useState<any | null>(null);
  const [productsList, setProductsList] = useState<any[]>([
    { nome: "", part_number: "", preco_padrao: 0, imagem_url: "", imagem_urls: [], detalhes: "", versoes: [] }
  ]);
  const [activeProductIdx, setActiveProductIdx] = useState<number | null>(null);
  const [isVehiclesModalOpen, setIsVehiclesModalOpen] = useState(false);
  const [tempSelectedVersoes, setTempSelectedVersoes] = useState<any[]>([]);
  
  // Veículos (Banco de Dados / Filtros para busca)
  const [marcas, setMarcas] = useState<any[]>([]);
  const [modelos, setModelos] = useState<any[]>([]);
  const [versoes, setVersoes] = useState<any[]>([]);
  const [selMarca, setSelMarca] = useState("");
  const [selModelo, setSelModelo] = useState("");
  const [fMotor, setFMotor] = useState("");
  const [fAnoIni, setFAnoIni] = useState("");
  const [fAnoFim, setFAnoFim] = useState("");

  // Sugestões inteligentes no Modal
  const [sugestoes, setSugestoes] = useState<VeiculoSugestao[]>([]);
  const [loadingSugestoes, setLoadingSugestoes] = useState(false);

  const isDirty = mode === "uma_categoria"
    ? (singleSelectedCat !== null || productsList.some(p => (p.nome || "").trim() !== "" || p.part_number || p.preco_padrao !== 0 || (p.imagem_urls && p.imagem_urls.length > 0) || p.detalhes))
    : (selectedCategories.length > 0 || selectedVersoes.length > 0);

// beforeunload listener is retained below to warn on reload/tab close.

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty && !saving) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty, saving]);

  useEffect(() => {
    fetchCategorias();
    fetchMarcas();
  }, []);

  const fetchCategorias = async () => {
    try {
      const data = await api.get('/api/configuracoes/categorias');
      setCategorias(Array.isArray(data) ? data : data.items ?? data.categorias ?? []);
    } catch (e) {
      setCategorias([]);
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
    if (selMarca) {
      const marcaObj = marcas.find(m => m.nome === selMarca);
      if (marcaObj) {
        api.get(`/api/catalogo/modelos-veiculos?marca_id=${marcaObj.id}`)
          .then(data => setModelos(Array.isArray(data) ? data : data.items ?? data.modelos ?? []))
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
        .then(data => setVersoes(Array.isArray(data) ? data : data.items ?? []))
        .catch(() => setVersoes([]));
    } else {
      setVersoes([]);
    }
  }, [selModelo, selMarca]);

  // Autocomplete de categorias
  const filteredCats = searchTermCat
    ? (categorias || []).filter(c => 
        String(c.nome || "").toLowerCase().includes(searchTermCat.toLowerCase())
      )
    : (categorias || []);

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

  const toggleVersaoTemp = (v: any) => {
    const idx = tempSelectedVersoes.findIndex(x => isSameVersao(x, v));
    if (idx >= 0) {
      setTempSelectedVersoes(tempSelectedVersoes.filter((_, i) => i !== idx));
    } else {
      setTempSelectedVersoes([...tempSelectedVersoes, v]);
    }
  };

  const toggleVersaoBulk = (v: any) => {
    const idx = selectedVersoes.findIndex(x => isSameVersao(x, v));
    if (idx >= 0) {
      setSelectedVersoes(selectedVersoes.filter((_, i) => i !== idx));
    } else {
      setSelectedVersoes([...selectedVersoes, v]);
    }
  };

  const filteredVersoes = versoes.filter(v => {
    return (!fMotor || (v.motorizacao || "").toLowerCase().includes(fMotor.toLowerCase())) &&
           (!fAnoIni || v.ano_inicio >= parseInt(fAnoIni, 10)) &&
           (!fAnoFim || (v.ano_fim || 9999) <= parseInt(fAnoFim, 10));
  });

  // --- MÉTODOS MODO B (Múltiplas Categorias) ---
  const addCategoryB = (cat: any) => {
    if (selectedCategories.length >= 20) {
      toast.error("Máximo de 20 categorias permitido");
      return;
    }
    setSelectedCategories([...selectedCategories, {
      id: cat.id,
      nome: cat.nome,
      preco_padrao: cat.preco_padrao || 0,
      imagem_url: cat.imagem_url || "",
      detalhes: cat.detalhes || ""
    }]);
    setSearchTermCat("");
    setShowCatSuggestions(false);
  };

  const removeCategoryB = (id: string) => {
    setSelectedCategories(selectedCategories.filter(c => c.id !== id));
  };

  const updateCategoryDataB = (id: string, field: keyof CategoryData, value: any) => {
    setSelectedCategories(selectedCategories.map(c => 
      c.id === id ? { ...c, [field]: value } : c
    ));
  };

  // --- MÉTODOS MODO A (Mesma Categoria) ---
  const handleAddProductRow = () => {
    setProductsList([...productsList, {
      nome: singleSelectedCat?.nome ? `${singleSelectedCat.nome} ` : "",
      part_number: "",
      preco_padrao: singleSelectedCat?.preco_padrao || 0,
      imagem_url: "",
      imagem_urls: [],
      detalhes: "",
      versoes: []
    }]);
  };

  const handleDuplicateProductRow = (index: number) => {
    const origin = productsList[index];
    const duplicated = {
      ...origin,
      nome: origin.nome ? `${origin.nome} (Cópia)` : "",
      versoes: [...origin.versoes], // Clona compatibilidades
      imagem_urls: [...(origin.imagem_urls || [])] // Clona imagens
    };
    const newList = [...productsList];
    newList.splice(index + 1, 0, duplicated);
    setProductsList(newList);
    toast.success("Produto duplicado com sucesso!");
  };

  const handleRemoveProductRow = (index: number) => {
    setProductsList(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdateProductField = (index: number, field: string, value: any) => {
    setProductsList(prev => prev.map((p, i) => 
      i === index ? { ...p, [field]: value } : p
    ));
  };

  const openVehiclesModal = async (index: number) => {
    setActiveProductIdx(index);
    const prod = productsList[index];
    setTempSelectedVersoes(prod.versoes || []);
    setIsVehiclesModalOpen(true);
    setSugestoes([]);
    
    // Dispara a busca de sugestões inteligentes com base no nome do produto
    if (prod.nome && prod.nome.trim().length >= 3) {
      setLoadingSugestoes(true);
      try {
        const list = await obterSugestoesVeiculos(prod.nome);
        setSugestoes(list);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingSugestoes(false);
      }
    }
  };

  const handleConfirmVehicles = () => {
    if (activeProductIdx !== null) {
      handleUpdateProductField(activeProductIdx, "versoes", tempSelectedVersoes);
      setIsVehiclesModalOpen(false);
      setActiveProductIdx(null);
      toast.success("Compatibilidades atualizadas!");
    }
  };

  // --- SALVAMENTO FINAL ---
  const handleSaveAll = async () => {
    if (mode === "multi_categorias") {
      if (selectedCategories.length === 0) return toast.error("Selecione ao menos uma categoria");
      if (selectedVersoes.length === 0) return toast.error("Selecione ao menos um veículo");

      setSaving(true);
      try {
        await api.post("/api/catalogo/pecas-v2/bulk-create-master", {
          categories: selectedCategories,
          versoes: selectedVersoes
        });
        toast.success(`${selectedCategories.length} peças master criadas com sucesso!`);
        navigate("/catalogo");
      } catch (error) {
        toast.error("Erro ao realizar criação em massa");
      } finally {
        setSaving(false);
      }
    } else {
      // Modo A (Mesma Categoria)
      if (!singleSelectedCat) return toast.error("Selecione uma categoria");
      const validProducts = productsList.filter(p => p.nome && p.nome.trim());
      if (validProducts.length === 0) return toast.error("Preencha o nome de pelo menos um produto");
      
      setSaving(true);
      try {
        await api.post("/api/catalogo/pecas-v2/bulk-create-by-category", {
          categoria_id: singleSelectedCat.id,
          produtos: validProducts
        });
        toast.success(`${validProducts.length} peças criadas com sucesso no catálogo!`);
        navigate("/catalogo");
      } catch (error) {
        toast.error("Erro ao realizar criação em massa");
      } finally {
        setSaving(false);
      }
    }
  };

  // Switch de Modos
  const handleModeChange = (newMode: "uma_categoria" | "multi_categorias") => {
    setMode(newMode);
    setWizardStep(1);
    setSingleSelectedCat(null);
    setSelectedCategories([]);
    setSelectedVersoes([]);
    setProductsList([{ nome: "", part_number: "", preco_padrao: 0, imagem_url: "", imagem_urls: [], detalhes: "", versoes: [] }]);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/catalogo")} className="hover:bg-slate-100">
            <ChevronLeft className="w-5 h-5 text-slate-700" />
          </Button>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
              <Package className="w-8 h-8 text-indigo-600" /> Criação em Massa no Catálogo
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">Cadastre múltiplos produtos master no catálogo de forma ágil e inteligente</p>
          </div>
        </div>

        {/* Tab Selector premium */}
        <div className="bg-slate-100 p-1.5 rounded-xl flex items-center shadow-inner gap-1 shrink-0">
          <button
            onClick={() => handleModeChange("uma_categoria")}
            className={cn(
              "px-4 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all",
              mode === "uma_categoria"
                ? "bg-white text-indigo-600 shadow-md font-bold scale-105"
                : "text-slate-500 hover:text-slate-900"
            )}
          >
            Várias peças da Mesma Categoria
          </button>
          <button
            onClick={() => handleModeChange("multi_categorias")}
            className={cn(
              "px-4 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all",
              mode === "multi_categorias"
                ? "bg-white text-indigo-600 shadow-md font-bold scale-105"
                : "text-slate-500 hover:text-slate-900"
            )}
          >
            Uma peça por Categoria
          </button>
        </div>
      </div>

      {/* --- MODO A: Várias peças de uma mesma categoria --- */}
      {mode === "uma_categoria" && (
        <div className="space-y-6">
          {/* Steps indicator */}
          <div className="flex items-center gap-2 justify-center max-w-md mx-auto bg-slate-100/50 p-2 rounded-full border border-slate-200/50 shadow-sm">
            {[
              { step: 1, label: "Categoria", icon: Layers },
              { step: 2, label: "Produtos", icon: Settings2 },
              { step: 3, label: "Revisão", icon: CheckCircle2 }
            ].map((s, idx) => (
              <React.Fragment key={s.step}>
                <div className={cn(
                  "flex items-center gap-1.5 px-4 py-1.5 rounded-full transition-all text-xs font-bold",
                  wizardStep === s.step ? "bg-indigo-600 text-white shadow-md scale-105" :
                  wizardStep > s.step ? "text-indigo-600 bg-indigo-50" : "text-slate-400"
                )}>
                  <s.icon className="w-3.5 h-3.5" />
                  <span>{s.label}</span>
                </div>
                {idx < 2 && <div className="w-6 h-px bg-slate-200" />}
              </React.Fragment>
            ))}
          </div>

          {/* PASSO A1: Selecionar 1 Categoria */}
          {wizardStep === 1 && (
            <Card className="border shadow-lg">
              <CardHeader className="bg-slate-50/50 border-b">
                <CardTitle className="flex items-center gap-2 text-slate-800">
                  <Layers className="w-5 h-5 text-indigo-600" />
                  Selecione a Categoria Pai
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div className="relative categoria-autocomplete max-w-2xl mx-auto py-6">
                  <Label className="text-slate-700 font-bold block mb-2 text-center text-sm">Pesquise e selecione a categoria desejada</Label>
                  <div className="relative">
                    <Input 
                      value={searchTermCat} 
                      onChange={e => {
                        setSearchTermCat(e.target.value);
                        setShowCatSuggestions(true);
                      }}
                      onFocus={() => setShowCatSuggestions(true)}
                      placeholder="Ex: Alternador, Motor de Partida, Caixa de Direção..."
                      className="h-12 text-base pl-12 shadow-sm rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 border-slate-200"
                    />
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    
                    {showCatSuggestions && (
                      <div className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-[300px] overflow-y-auto p-2">
                        {filteredCats.length > 0 ? filteredCats.map(c => (
                          <div 
                            key={c.id} 
                            className="p-3 hover:bg-indigo-50 rounded-lg cursor-pointer text-sm transition-colors flex items-center justify-between group"
                            onClick={() => {
                              setSingleSelectedCat(c);
                              setSearchTermCat("");
                              setShowCatSuggestions(false);
                            }}
                          >
                            <span className="font-bold text-slate-700">{c.nome}</span>
                            <Plus className="w-4 h-4 text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        )) : (
                          <div className="p-4 text-center text-slate-400 italic text-sm">Nenhuma categoria encontrada</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {singleSelectedCat ? (
                  <div className="max-w-xl mx-auto bg-gradient-to-r from-indigo-50/50 to-purple-50/50 border border-indigo-100 p-6 rounded-2xl flex items-center justify-between shadow-sm animate-in zoom-in-95 duration-200">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold">
                        <Package className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="font-black text-slate-800 text-lg uppercase tracking-tight">{singleSelectedCat.nome}</h4>
                        <p className="text-xs text-slate-500 font-medium">Preço sugerido: R$ {singleSelectedCat.preco_padrao || 0}</p>
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-rose-500 hover:bg-rose-50 rounded-full h-10 w-10 shrink-0"
                      onClick={() => setSingleSelectedCat(null)}
                    >
                      <X className="w-5 h-5" />
                    </Button>
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-400 italic text-sm border-2 border-dashed rounded-2xl border-slate-200">
                    Nenhuma categoria selecionada. Use o campo acima para buscar.
                  </div>
                )}

                <div className="flex justify-end pt-6 border-t">
                  <Button 
                    size="lg" 
                    disabled={!singleSelectedCat} 
                    onClick={() => {
                      // Configura preços padrão e nome inicial nas linhas
                      setProductsList(productsList.map(p => {
                        const catNome = singleSelectedCat?.nome || "";
                        let novoNome = p.nome || "";
                        if (!novoNome) {
                          novoNome = catNome ? `${catNome} ` : "";
                        } else if (catNome && !novoNome.toLowerCase().startsWith(catNome.toLowerCase())) {
                          novoNome = `${catNome} ${novoNome}`;
                        }
                        return {
                          ...p,
                          nome: novoNome,
                          preco_padrao: p.preco_padrao || singleSelectedCat?.preco_padrao || 0
                        };
                      }));
                      setWizardStep(2);
                    }}
                    className="gap-2 px-8 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/10"
                  >
                    Próximo: Cadastrar Produtos <ChevronLeft className="w-4 h-4 rotate-180" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* PASSO A2: Configurar múltiplos produtos da mesma categoria */}
          {wizardStep === 2 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Produtos da Categoria: <span className="text-indigo-600 font-black">{singleSelectedCat?.nome}</span></h3>
                  <p className="text-xs text-slate-500 mt-0.5">Preencha os dados de cada produto. O nome do produto será usado para buscar sugestões inteligentes de veículos.</p>
                </div>
                <div className="flex items-center gap-2">
<Button 
                    onClick={handleAddProductRow} 
                    className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase"
                    size="sm"
                  >
                    <Plus className="w-4 h-4" /> Adicionar Produto
                  </Button>
                </div>
              </div>

              <div className="space-y-4">
                {productsList.map((prod, index) => (
                  <Card key={index} className="border hover:border-slate-300 transition-all shadow-sm">
                    <CardContent className="p-5 space-y-4">
                      {/* Grid de Inputs básicos */}
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                        {/* Nome do Produto */}
                        <div className="md:col-span-4 space-y-1.5">
                          <Label className="text-xs uppercase font-extrabold text-slate-600">Nome do Produto Master</Label>
                          <Input 
                            value={prod.nome} 
                            onChange={e => handleUpdateProductField(index, "nome", e.target.value)} 
                            placeholder="Ex: Alternador Gol G5 G6 1.0 1.6 2008/2015 90a" 
                            className="h-10 text-sm font-semibold text-slate-800"
                          />
                        </div>

                        {/* Part Number */}
                        <div className="md:col-span-2 space-y-1.5">
                          <Label className="text-xs uppercase font-extrabold text-slate-600">Part Number</Label>
                          <Input 
                            value={prod.part_number || ""} 
                            onChange={e => handleUpdateProductField(index, "part_number", e.target.value)} 
                            placeholder="Ex: 5U0903025" 
                            className="h-10 text-sm font-semibold text-slate-800"
                          />
                        </div>

                        {/* Preço Padrão */}
                        <div className="md:col-span-2 space-y-1.5">
                          <Label className="text-xs uppercase font-extrabold text-slate-600">Preço Padrão (R$)</Label>
                          <Input 
                            type="number"
                            value={prod.preco_padrao} 
                            onChange={e => handleUpdateProductField(index, "preco_padrao", parseFloat(e.target.value) || 0)} 
                            className="h-10 text-sm font-mono font-bold text-slate-800"
                          />
                        </div>

                        {/* Compatibilidades */}
                        <div className="md:col-span-3 space-y-1.5">
                          <Label className="text-xs uppercase font-extrabold text-slate-600">Compatibilidades</Label>
                          <Button 
                            type="button"
                            onClick={() => openVehiclesModal(index)}
                            variant="outline"
                            className={cn(
                              "h-10 w-full gap-2 font-bold text-xs uppercase border border-dashed rounded-lg transition-all",
                              prod.versoes?.length > 0 
                                ? "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100/50" 
                                : "bg-slate-50 text-indigo-600 border-slate-300 hover:bg-slate-100"
                            )}
                          >
                            <Car className="w-4 h-4 shrink-0" />
                            <span className="truncate">
                              {prod.versoes?.length > 0 ? `${prod.versoes.length} veículos` : "Vincular Veículos"}
                            </span>
                          </Button>
                        </div>

                        {/* Ações (Duplicar / Excluir) */}
                        <div className="md:col-span-1 flex items-center justify-end gap-1.5 pt-7">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-9 w-9 text-slate-500 hover:bg-slate-100 hover:text-slate-800 rounded-lg shrink-0"
                            onClick={() => handleDuplicateProductRow(index)}
                            title="Duplicar linha"
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-9 w-9 text-rose-500 hover:bg-rose-50 hover:text-rose-600 rounded-lg shrink-0"
                            onClick={() => handleRemoveProductRow(index)}
                            disabled={productsList.length === 1}
                            title="Remover linha"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Expandable Image and Details Row */}
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 pt-2 border-t border-slate-100 items-start">
                        {/* Imagem do Produto */}
                        <div className="md:col-span-6 space-y-1.5">
                          <Label className="text-xs uppercase font-extrabold text-slate-600 flex items-center justify-between">
                            <span>Imagens ({prod.imagem_urls?.length || 0})</span>
                            <span className="text-[10px] font-normal text-slate-400">A primeira será a principal</span>
                          </Label>
                          <div className="flex flex-wrap gap-2 items-center bg-slate-50 p-2.5 rounded-xl border border-slate-200/50 min-h-[64px]">
                            {/* Thumbnails */}
                            {(prod.imagem_urls || []).map((url: string, imgIdx: number) => (
                              <div key={imgIdx} className="relative w-12 h-12 shrink-0 group border border-slate-300 rounded-lg overflow-hidden shadow-sm hover:ring-2 hover:ring-indigo-500 transition-all bg-white">
                                <img
                                  src={url}
                                  className="w-full h-full object-cover"
                                  alt={`Foto ${imgIdx + 1}`}
                                />
                                {imgIdx === 0 && (
                                  <span className="absolute bottom-0 left-0 right-0 bg-indigo-600/90 text-white text-[8px] font-bold text-center py-0.5 uppercase tracking-wider">
                                    Principal
                                  </span>
                                )}
                                <button
                                  type="button"
                                  className="absolute top-0.5 right-0.5 bg-rose-600 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center text-[10px] font-bold shadow-md hover:bg-rose-700 transition-colors"
                                  onClick={() => {
                                    const updated = (prod.imagem_urls || []).filter((_: any, i: number) => i !== imgIdx);
                                    handleUpdateProductField(index, "imagem_urls", updated);
                                    handleUpdateProductField(index, "imagem_url", updated[0] || "");
                                  }}
                                  title="Remover foto"
                                >
                                  ×
                                </button>
                              </div>
                            ))}

                            {/* Se não houver imagens */}
                            {(!prod.imagem_urls || prod.imagem_urls.length === 0) && (
                              <div className="text-slate-400 text-xs italic px-2 py-1 flex items-center gap-1.5 font-medium">
                                <ImageIcon className="w-4 h-4 text-slate-300" /> Nenhuma imagem adicionada
                              </div>
                            )}

                            {/* Botões de Ação de Imagem */}
                            <div className="ml-auto flex gap-1.5 items-center pl-2 border-l border-slate-200">
                              <input
                                type="file"
                                accept="image/*"
                                multiple
                                className="hidden"
                                id={`peca-foto-massa-${index}`}
                                onChange={async (e) => {
                                  const files = Array.from(e.target.files || []);
                                  if (files.length === 0) return;
                                  
                                  const tempUrls = files.map(file => URL.createObjectURL(file));
                                  const currentUrls = prod.imagem_urls || [];
                                  
                                  const updatedLocalUrls = [...currentUrls, ...tempUrls];
                                  handleUpdateProductField(index, "imagem_urls", updatedLocalUrls);
                                  handleUpdateProductField(index, "imagem_url", updatedLocalUrls[0] || "");
                                  
                                  toast.info(`Enviando ${files.length} foto(s)...`);
                                  
                                  const uploadedUrls: string[] = [];
                                  for (let i = 0; i < files.length; i++) {
                                    const file = files[i];
                                    try {
                                      const formData = new FormData();
                                      formData.append('file', file);
                                      const result = await api.postMultipart('/api/admin/upload-produto-imagem', formData);
                                      uploadedUrls.push(result.url);
                                    } catch {
                                      toast.error(`Falha no upload da foto ${i + 1}.`);
                                    }
                                  }
                                  
                                  tempUrls.forEach(url => URL.revokeObjectURL(url));
                                  
                                  const finalUrls = [...currentUrls, ...uploadedUrls];
                                  handleUpdateProductField(index, "imagem_urls", finalUrls);
                                  handleUpdateProductField(index, "imagem_url", finalUrls[0] || "");
                                  
                                  if (uploadedUrls.length > 0) {
                                    toast.success(`${uploadedUrls.length} foto(s) enviada(s) com sucesso!`);
                                  }
                                  e.target.value = "";
                                }}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 text-[10px] font-bold px-2.5 rounded-lg hover:bg-slate-100 border-indigo-200 text-indigo-700 bg-indigo-50/50 hover:bg-indigo-50"
                                onClick={() => document.getElementById(`peca-foto-massa-${index}`)?.click()}
                              >
                                + Foto(s)
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 text-[10px] text-slate-500 hover:text-slate-800 px-2 rounded-lg hover:bg-slate-100"
                                onClick={() => {
                                  const url = prompt(`Insira a URL da imagem:`);
                                  if (url) {
                                    const currentUrls = prod.imagem_urls || [];
                                    const finalUrls = [...currentUrls, url];
                                    handleUpdateProductField(index, "imagem_urls", finalUrls);
                                    handleUpdateProductField(index, "imagem_url", finalUrls[0] || "");
                                  }
                                }}
                              >
                                + Link
                              </Button>
                            </div>
                          </div>
                        </div>

                        {/* Detalhes / Descrição */}
                        <div className="md:col-span-6 space-y-1.5">
                          <Label className="text-xs uppercase font-extrabold text-slate-600">Descrição / Detalhes Adicionais</Label>
                          <textarea
                            className="w-full min-h-[64px] max-h-[120px] rounded-xl border border-slate-200 px-3 py-2 text-xs bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-y font-medium text-slate-700"
                            placeholder="Especificações, diferenciais..."
                            value={prod.detalhes}
                            onChange={e => handleUpdateProductField(index, "detalhes", e.target.value)}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Ações de Rodapé */}
              <div className="flex justify-between pt-6 border-t">
                <Button variant="outline" onClick={() => setWizardStep(1)} className="px-6">Voltar</Button>
                <Button 
                  onClick={() => {
                    const filled = productsList.filter(p => p.nome && p.nome.trim());
                    if (filled.length === 0) return toast.error("Insira pelo menos um produto com nome.");
                    setWizardStep(3);
                  }} 
                  className="gap-2 px-8 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/10 font-bold"
                >
                  Próximo: Revisar e Salvar <ChevronLeft className="w-4 h-4 rotate-180" />
                </Button>
              </div>
            </div>
          )}

          {/* PASSO A3: Revisão e Salvar */}
          {wizardStep === 3 && (
            <div className="space-y-6">
              <Card className="border shadow-lg">
                <CardHeader className="bg-indigo-600 text-white p-6 rounded-t-xl">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-2xl font-black uppercase tracking-tight">Revisão Final</CardTitle>
                      <p className="text-indigo-100 text-xs mt-0.5">Confira os produtos e compatibilidades vinculadas antes de salvar no Catálogo</p>
                    </div>
                    <CheckCircle2 className="w-10 h-10 opacity-30 animate-pulse" />
                  </div>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  <div className="bg-slate-50 p-4 rounded-xl border flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">
                        <Layers className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-extrabold text-slate-800 uppercase text-sm">Categoria Pai das Peças</h4>
                        <p className="text-slate-600 font-bold text-xs">{singleSelectedCat?.nome}</p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="px-3 py-1 font-mono font-bold">{productsList.filter(p=>p.nome).length} produtos</Badge>
                  </div>

                  <div className="space-y-3">
                    <h5 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">Resumo das Peças a Criar</h5>
                    {productsList.filter(p => p.nome).map((p, idx) => (
                      <div key={idx} className="bg-white border rounded-xl p-4 flex items-center justify-between hover:border-indigo-200 transition-all shadow-sm">
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="w-14 h-14 rounded-lg bg-slate-50 border overflow-hidden flex-shrink-0 flex items-center justify-center">
                            {p.imagem_url ? (
                              <img src={p.imagem_url} alt={p.nome} className="w-full h-full object-cover" />
                            ) : (
                              <Package className="w-6 h-6 text-slate-400" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h6 className="font-bold text-slate-800 uppercase text-sm truncate max-w-[400px]">{p.nome}</h6>
                              {p.part_number && (
                                <Badge variant="outline" className="text-[10px] border-indigo-200 text-indigo-700 bg-indigo-50 font-mono">
                                  {p.part_number}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-0.5">
                              <Badge className="bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 border-emerald-500/20 font-mono text-[10px]">
                                R$ {p.preco_padrao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </Badge>
                              {p.detalhes && <span className="text-xs text-slate-400 truncate max-w-[200px]">{p.detalhes}</span>}
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <Badge variant="outline" className="border-indigo-200 text-indigo-700 bg-indigo-50 font-bold px-2 py-0.5">
                            {p.versoes?.length || 0} veículos vinculados
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-between items-center pt-6 border-t mt-6">
                    <Button variant="outline" onClick={() => setWizardStep(2)} className="px-6">Voltar</Button>
                    <div className="flex items-center gap-3">
                      <Button variant="ghost" onClick={() => { if(confirm("Descartar criação?")) navigate("/catalogo") }} className="text-slate-500 hover:text-slate-800">
                        Cancelar
                      </Button>
                      <Button 
                        size="lg" 
                        onClick={handleSaveAll} 
                        disabled={saving}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-wider px-10 h-12 shadow-md shadow-emerald-600/10 gap-2"
                      >
                        {saving ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" /> Salvando...
                          </>
                        ) : (
                          <>
                            <Check className="w-4 h-4" /> Salvar Peças no Catálogo
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* --- MODO B: Múltiplas Categorias (Comportamento Existente) --- */}
      {mode === "multi_categorias" && (
        <div className="space-y-6">
          {/* Steps indicator */}
          <div className="flex items-center gap-2 justify-center max-w-md mx-auto bg-slate-100/50 p-2 rounded-full border border-slate-200/50 shadow-sm">
            {[
              { step: 1, label: "Categorias", icon: Layers },
              { step: 2, label: "Veículos", icon: Car },
              { step: 3, label: "Detalhes", icon: Settings2 },
              { step: 4, label: "Revisão", icon: Check }
            ].map((s, idx) => (
              <React.Fragment key={s.step}>
                <div className={cn(
                  "flex items-center gap-1.5 px-4 py-1.5 rounded-full transition-all text-xs font-bold",
                  wizardStep === s.step ? "bg-indigo-600 text-white shadow-md scale-105" :
                  wizardStep > s.step ? "text-indigo-600 bg-indigo-50" : "text-slate-400"
                )}>
                  <s.icon className="w-3.5 h-3.5" />
                  <span>{s.label}</span>
                </div>
                {idx < 3 && <div className="w-6 h-px bg-slate-200" />}
              </React.Fragment>
            ))}
          </div>

          {/* PASSO B1: Categorias */}
          {wizardStep === 1 && (
            <Card className="border shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-indigo-600" />
                  Selecione as Categorias (até 20)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="relative categoria-autocomplete max-w-2xl">
                  <div className="relative">
                    <Input 
                      value={searchTermCat} 
                      onChange={e => {
                        setSearchTermCat(e.target.value);
                        setShowCatSuggestions(true);
                      }}
                      onFocus={() => setShowCatSuggestions(true)}
                      placeholder="Buscar categoria..."
                      className="h-12 text-base pl-12 rounded-xl"
                    />
                    <Plus className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    
                    {showCatSuggestions && (
                      <div className="absolute z-50 w-full mt-2 bg-white border rounded-xl shadow-2xl max-h-[300px] overflow-y-auto p-2">
                        {filteredCats.length > 0 ? filteredCats.filter(c => !selectedCategories.find(sc => sc.id === c.id)).map(c => (
                          <div 
                            key={c.id} 
                            className="p-3 hover:bg-indigo-50 rounded-lg cursor-pointer text-sm transition-colors flex items-center justify-between group"
                            onClick={() => addCategoryB(c)}
                          >
                            <span className="font-bold text-slate-700">{c.nome}</span>
                            <Plus className="w-4 h-4 text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        )) : (
                          <div className="p-4 text-center text-slate-400 italic">Nenhuma categoria disponível</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {selectedCategories.map(cat => (
                    <div key={cat.id} className="bg-white border p-4 rounded-xl flex items-center justify-between group hover:border-indigo-400 transition-all shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                          <Package className="w-4 h-4" />
                        </div>
                        <span className="font-bold text-slate-700 truncate max-w-[150px]">{cat.nome}</span>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 hover:bg-rose-50"
                        onClick={() => removeCategoryB(cat.id)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  {selectedCategories.length === 0 && (
                    <div className="col-span-full py-12 text-center border-2 border-dashed rounded-2xl border-slate-200 text-slate-400 italic">
                      Nenhuma categoria selecionada
                    </div>
                  )}
                </div>

                <div className="flex justify-end pt-6 border-t">
                  <Button 
                    size="lg" 
                    disabled={selectedCategories.length === 0} 
                    onClick={() => setWizardStep(2)}
                    className="gap-2 px-8 bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                  >
                    Próximo: Vincular Veículos <ChevronLeft className="w-4 h-4 rotate-180" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* PASSO B2: Vincular Veículos */}
          {wizardStep === 2 && (
            <Card className="border shadow-lg">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Car className="w-5 h-5 text-indigo-600" />
                  Vincular Veículos Compatíveis
                </CardTitle>
                <Badge variant="secondary" className="px-3 py-1 font-bold">
                  {selectedVersoes.length} veículos selecionados
                </Badge>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-[550px]">
                  {/* Selector */}
                  <div className="flex flex-col h-full space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs uppercase font-extrabold text-slate-500">Marca</Label>
                        <select 
                          className="w-full h-10 rounded-lg border bg-white px-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" 
                          value={selMarca} 
                          onChange={e => setSelMarca(e.target.value)}
                        >
                          <option value="">Selecione...</option>
                          {marcas.map(m => <option key={m.id} value={m.nome}>{m.nome}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs uppercase font-extrabold text-slate-500">Modelo</Label>
                        <select 
                          className="w-full h-10 rounded-lg border bg-white px-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-50" 
                          value={selModelo} 
                          onChange={e => setSelModelo(e.target.value)}
                          disabled={!selMarca}
                        >
                          <option value="">Selecione...</option>
                          {modelos.map(m => <option key={m.id} value={m.nome}>{m.nome}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <Input placeholder="Motor" className="h-9 text-xs" value={fMotor} onChange={e => setFMotor(e.target.value)} />
                      <Input placeholder="Ano Ini" className="h-9 text-xs" type="number" value={fAnoIni} onChange={e => setFAnoIni(e.target.value)} />
                      <Input placeholder="Ano Fim" className="h-9 text-xs" type="number" value={fAnoFim} onChange={e => setFAnoFim(e.target.value)} />
                    </div>

                    <div className="flex-1 border rounded-xl overflow-hidden bg-slate-50 flex flex-col shadow-inner">
                      <div className="p-2 border-b bg-white flex justify-between items-center">
                        <span className="text-[10px] font-black uppercase text-slate-500 ml-2">Resultados</span>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 text-[10px] font-black uppercase hover:bg-slate-100"
                          onClick={() => filteredVersoes.forEach(v => !selectedVersoes.find(x => isSameVersao(x, v)) && toggleVersaoBulk(v))}
                        >
                          Marcar Todos
                        </Button>
                      </div>
                      <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {filteredVersoes.map(v => (
                          <label key={v.id} className="flex items-center gap-3 p-3 bg-white hover:bg-indigo-50 rounded-lg cursor-pointer text-xs border border-slate-200 transition-all">
                            <input 
                              type="checkbox" 
                              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                              checked={!!selectedVersoes.find(x => isSameVersao(x, v))} 
                              onChange={() => toggleVersaoBulk(v)} 
                            />
                            <div className="flex flex-col min-w-0">
                              <span className="font-bold uppercase text-slate-700 truncate">{v.familia || v.modelo} — {v.versao}</span>
                              <span className="text-slate-500 font-medium">{v.motorizacao} | {v.ano_inicio}-{v.ano_fim || "Atual"}</span>
                            </div>
                          </label>
                        ))}
                        {filteredVersoes.length === 0 && (
                          <div className="h-full flex items-center justify-center text-slate-400 italic text-sm">
                            Nenhum veículo encontrado
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Selected List */}
                  <div className="bg-slate-50 rounded-2xl p-6 flex flex-col h-full border border-dashed border-slate-300">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-black uppercase tracking-wider text-xs text-indigo-950">Veículos Selecionados</h3>
                      <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200">{selectedVersoes.length}</Badge>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                      {selectedVersoes.map(v => (
                        <div key={v.id} className="flex items-center justify-between bg-white p-3 rounded-xl border hover:border-indigo-300 transition-all shadow-sm">
                          <div className="flex flex-col min-w-0">
                            <span className="font-bold text-xs uppercase text-slate-700 truncate">{v.marca} {v.modelo}</span>
                            <span className="text-[10px] text-slate-500 truncate font-semibold">{v.versao} | {v.motorizacao}</span>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-rose-500 hover:bg-rose-50 hover:text-rose-600 rounded-full shrink-0"
                            onClick={() => toggleVersaoBulk(v)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                      {selectedVersoes.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4 opacity-70 italic text-sm">
                          <Car className="w-12 h-12 text-slate-300 animate-bounce" />
                          <p>Nenhum veículo selecionado</p>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-between pt-6 mt-4 border-t border-slate-200">
                      <Button variant="outline" size="lg" onClick={() => setWizardStep(1)}>Voltar</Button>
                      <Button size="lg" disabled={selectedVersoes.length === 0} onClick={() => setWizardStep(3)} className="gap-2 px-8 bg-indigo-600 hover:bg-indigo-700 font-bold">
                        Próximo: Configurar Detalhes <ChevronLeft className="w-4 h-4 rotate-180" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* PASSO B3: Configurar Detalhes */}
          {wizardStep === 3 && (
            <div className="space-y-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-black uppercase tracking-tight text-slate-800">Configurar Detalhes por Categoria</h2>
                <Button 
                  variant="outline" 
                  className="gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-black uppercase text-xs"
                  onClick={() => {
                    const resumo = gerarResumoCompatibilidade(selectedVersoes);
                    if (resumo) {
                      setSelectedCategories(selectedCategories.map(c => {
                        const current = c.detalhes ? c.detalhes + "\n\n" : "";
                        return { ...c, detalhes: current + "VEÍCULOS COMPATÍVEIS:\n" + resumo };
                      }));
                      toast.success("Resumo aplicado a todas as categorias!");
                    } else {
                      toast.error("Selecione veículos primeiro");
                    }
                  }}
                >
                  <Settings2 className="w-4 h-4" /> Gerar Resumo para Todas
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {selectedCategories.map((cat, idx) => (
                  <Card key={cat.id} className="overflow-hidden border hover:border-slate-300 transition-all bg-slate-50/20 shadow-sm animate-in fade-in duration-200">
                    <div className="bg-slate-50 p-4 border-b flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="bg-white">{idx + 1}</Badge>
                        <h3 className="font-black text-slate-800 uppercase tracking-tight text-sm">{cat.nome}</h3>
                      </div>
                      <Package className="w-4 h-4 text-indigo-600" />
                    </div>
                    <CardContent className="p-5 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-xs uppercase font-extrabold text-slate-600">Preço Padrão (R$)</Label>
                          <Input 
                            type="number" 
                            value={cat.preco_padrao} 
                            onChange={e => updateCategoryDataB(cat.id, "preco_padrao", parseFloat(e.target.value) || 0)} 
                            className="h-10 font-mono font-bold text-slate-800"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs uppercase font-extrabold text-slate-600">Imagem do Produto</Label>
                          <div className="flex items-center gap-3 bg-white p-2 rounded-xl border border-slate-200 min-h-[56px]">
                            {cat.imagem_url ? (
                              <div className="relative w-10 h-10 shrink-0">
                                <img
                                  src={cat.imagem_url}
                                  className="w-10 h-10 object-cover rounded-lg border shadow-sm"
                                  alt="Preview"
                                />
                                <button
                                  type="button"
                                  className="absolute -top-1 -right-1 bg-rose-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold shadow-md hover:bg-rose-700"
                                  onClick={() => updateCategoryDataB(cat.id, "imagem_url", "")}
                                >
                                  ×
                                </button>
                              </div>
                            ) : (
                              <div className="w-10 h-10 shrink-0 border border-dashed border-slate-300 rounded-lg flex items-center justify-center text-slate-400 bg-slate-50">
                                <ImageIcon className="w-5 h-5" />
                              </div>
                            )}
                            <div className="flex-1 flex gap-1.5 items-center">
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                id={`peca-foto-input-b-${cat.id}`}
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  
                                  const localUrl = URL.createObjectURL(file);
                                  updateCategoryDataB(cat.id, "imagem_url", localUrl);
                                  
                                  try {
                                    const formData = new FormData();
                                    formData.append('file', file);
                                    const result = await api.postMultipart('/api/admin/upload-produto-imagem', formData);
                                    
                                    URL.revokeObjectURL(localUrl);
                                    updateCategoryDataB(cat.id, "imagem_url", result.url);
                                    toast.success(`Imagem de ${cat.nome} enviada!`);
                                  } catch {
                                    URL.revokeObjectURL(localUrl);
                                    toast.error(`Falha no upload.`);
                                    updateCategoryDataB(cat.id, "imagem_url", "");
                                  }
                                  e.target.value = "";
                                }}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 text-[10px] font-bold px-2 rounded-md hover:bg-slate-100"
                                onClick={() => document.getElementById(`peca-foto-input-b-${cat.id}`)?.click()}
                              >
                                Escolher
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 text-[10px] text-slate-500 hover:text-slate-800 px-2 rounded-md hover:bg-slate-100"
                                onClick={() => {
                                  const url = prompt(`Insira a URL:`);
                                  if (url) {
                                    updateCategoryDataB(cat.id, "imagem_url", url);
                                  }
                                }}
                              >
                                Link
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <Label className="text-xs uppercase font-extrabold text-slate-600">Descrição / Detalhes</Label>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-6 text-[9px] font-black uppercase text-indigo-700 hover:bg-indigo-50 p-1"
                            onClick={() => {
                              const resumo = gerarResumoCompatibilidade(selectedVersoes);
                              if (resumo) {
                                const current = cat.detalhes ? cat.detalhes + "\n\n" : "";
                                updateCategoryDataB(cat.id, "detalhes", current + "VEÍCULOS COMPATÍVEIS:\n" + resumo);
                                toast.success("Resumo gerado!");
                              } else {
                                toast.error("Selecione veículos primeiro");
                              }
                            }}
                          >
                            Gerar Resumo
                          </Button>
                        </div>
                        <textarea
                          className="w-full min-h-[80px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium text-slate-700"
                          placeholder="Detalhes desta peça master..."
                          value={cat.detalhes}
                          onChange={e => updateCategoryDataB(cat.id, "detalhes", e.target.value)}
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              
              <div className="flex justify-between pt-8 border-t mt-6">
                <Button variant="outline" size="lg" onClick={() => setWizardStep(2)}>Voltar</Button>
                <Button size="lg" onClick={() => setWizardStep(4)} className="gap-2 px-8 bg-indigo-600 hover:bg-indigo-700 font-bold">
                  Próximo: Revisar e Salvar <ChevronLeft className="w-4 h-4 rotate-180" />
                </Button>
              </div>
            </div>
          )}

          {/* PASSO B4: Revisão */}
          {wizardStep === 4 && (
            <div className="space-y-8 animate-in fade-in duration-300">
              <Card className="border shadow-2xl">
                <CardHeader className="bg-indigo-600 text-white p-6 rounded-t-2xl">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-2xl font-black uppercase tracking-tight">Revisão Final</CardTitle>
                      <p className="text-indigo-100 text-xs mt-0.5">Confira os dados antes de processar a criação em massa</p>
                    </div>
                    <Check className="w-10 h-10 opacity-20" />
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="grid grid-cols-1 lg:grid-cols-3 divide-x divide-slate-100">
                    <div className="p-8 space-y-8 bg-slate-50/50">
                      <div className="space-y-4">
                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">Resumo</h4>
                        <div className="grid grid-cols-1 gap-4">
                          <div className="bg-white p-4 rounded-xl border flex items-center gap-4 shadow-sm">
                            <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                              <Layers className="w-6 h-6" />
                            </div>
                            <div>
                              <p className="text-xl font-black text-slate-800">{selectedCategories.length}</p>
                              <p className="text-[10px] text-slate-400 font-bold uppercase">Categorias</p>
                            </div>
                          </div>
                          <div className="bg-white p-4 rounded-xl border flex items-center gap-4 shadow-sm">
                            <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                              <Car className="w-6 h-6" />
                            </div>
                            <div>
                              <p className="text-xl font-black text-slate-800">{selectedVersoes.length}</p>
                              <p className="text-[10px] text-slate-400 font-bold uppercase">Veículos</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="p-5 bg-indigo-50/50 rounded-xl border border-indigo-100">
                        <p className="text-xs text-indigo-950 font-medium leading-relaxed italic">
                          Ao salvar, o sistema criará <strong>{selectedCategories.length}</strong> peças no catálogo master. 
                          Cada peça será vinculada a <strong>{selectedVersoes.length}</strong> veículos, 
                          totalizando <strong>{selectedCategories.length * selectedVersoes.length}</strong> compatibilidades.
                        </p>
                      </div>
                    </div>

                    <div className="col-span-2 p-8 space-y-6 max-h-[600px] overflow-y-auto">
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">Peças a serem criadas</h4>
                      <div className="space-y-3">
                        {selectedCategories.map(cat => (
                          <div key={cat.id} className="group bg-white border p-4 rounded-2xl flex items-center justify-between hover:border-indigo-400 transition-all shadow-sm">
                            <div className="flex items-center gap-4">
                              <div className="w-14 h-14 rounded-xl bg-slate-50 overflow-hidden border flex items-center justify-center">
                                {cat.imagem_url ? (
                                  <img src={cat.imagem_url} alt={cat.nome} className="w-full h-full object-cover" />
                                ) : (
                                  <Package className="w-6 h-6 text-slate-400" />
                                )}
                              </div>
                              <div>
                                <h5 className="font-extrabold uppercase text-slate-800 text-sm tracking-tight">{cat.nome}</h5>
                                <div className="flex items-center gap-4 mt-1">
                                  <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 font-mono text-[10px]">
                                    R$ {cat.preco_padrao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                  </Badge>
                                  {cat.detalhes && (
                                    <span className="text-[11px] text-slate-400 truncate max-w-[250px]">
                                      {cat.detalhes}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-between items-center pt-4 mt-6">
                <Button variant="outline" size="lg" className="px-8" onClick={() => setWizardStep(3)}>Voltar</Button>
                <div className="flex items-center gap-4">
                  <Button 
                    variant="ghost" 
                    size="lg" 
                    className="text-slate-400 hover:text-slate-800"
                    onClick={() => { if(confirm("Descartar tudo?")) navigate("/catalogo") }}
                  >
                    Cancelar
                  </Button>
                  <Button 
                    size="lg" 
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-12 h-14 text-lg font-black uppercase tracking-wider gap-3 shadow-xl shadow-emerald-600/10"
                    onClick={handleSaveAll}
                    disabled={saving}
                  >
                    {saving ? (
                      <Loader2 className="w-6 h-6 animate-spin" />
                    ) : (
                      <>
                        <Check className="w-6 h-6" />
                        Finalizar e Criar Peças
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* --- MODAL DE SELEÇÃO DE VEÍCULOS COMPATÍVEIS COM AUTO-SUGESTÃO --- */}
      <Modal 
        title="Compatibilidade do Veículo" 
        isOpen={isVehiclesModalOpen} 
        onClose={() => {
          const currentProd = activeProductIdx !== null ? productsList[activeProductIdx] : null;
          const currentVersoes = currentProd?.versoes || [];
          const isDifferent = tempSelectedVersoes.length !== currentVersoes.length ||
                              tempSelectedVersoes.some(t => !currentVersoes.some(c => isSameVersao(c, t)));
          if (isDifferent) {
            if (confirm("Você possui alterações nas compatibilidades de veículos. Deseja realmente fechar e descartá-las?")) {
              setIsVehiclesModalOpen(false);
            }
          } else {
            setIsVehiclesModalOpen(false);
          }
        }}
        className="max-w-[1200px] w-[90vw]"
      >
        <div className="space-y-6">
          <div>
            <h4 className="font-extrabold text-slate-800 text-base">Veículos compatíveis para:</h4>
            <p className="text-indigo-600 font-bold text-sm uppercase mt-0.5">
              {activeProductIdx !== null ? productsList[activeProductIdx]?.nome || "Peça sem nome" : ""}
            </p>
          </div>

          {/* Painel de Sugestões Inteligentes */}
          {loadingSugestoes && (
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center justify-center gap-2 h-16 shadow-inner shrink-0">
              <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider animate-pulse">Analisando nome e buscando sugestões inteligentes...</span>
            </div>
          )}

          {!loadingSugestoes && sugestoes.length > 0 && (
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-5 rounded-2xl border border-indigo-100 space-y-3 shadow-sm animate-in fade-in duration-200 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-indigo-600 animate-pulse" />
                  <h4 className="font-black text-xs uppercase text-indigo-950 tracking-wider">
                    💡 Sugestões Inteligentes Baseadas no Nome ({sugestoes.length})
                  </h4>
                </div>
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
                    setTempSelectedVersoes(prev => {
                      const existing = prev || [];
                      const newMatches = toAdd.filter(m => !existing.some(e => isSameVersao(e, m)));
                      return [...existing, ...newMatches];
                    });
                    toast.success(`${toAdd.length} sugestões vinculadas.`);
                  }}
                >
                  Marcar Todas as Sugestões
                </Button>
              </div>
              
              <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto pr-1">
                {sugestoes.map((s) => {
                  const isSelected = !!tempSelectedVersoes.find(x => isSameVersao(x, s));
                  return (
                    <Badge
                      key={s.id}
                      variant="secondary"
                      className={cn(
                        "px-3 py-1.5 cursor-pointer rounded-lg font-semibold flex items-center gap-1.5 transition-all text-xs border select-none",
                        isSelected 
                          ? "bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700" 
                          : "bg-white text-indigo-950 hover:bg-indigo-50 border-indigo-200"
                      )}
                      onClick={() => toggleVersaoTemp(s)}
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

          {/* Grid de Busca Manual e Selecionados */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-[450px]">
            {/* Lado Esquerdo: Busca e Lista do Banco */}
            <div className="flex flex-col h-full space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <select 
                  className="h-9 rounded-md border bg-white px-2 text-xs focus:ring-1 focus:ring-indigo-500 outline-none" 
                  value={selMarca} 
                  onChange={e => setSelMarca(e.target.value)}
                >
                  <option value="">Marca</option>
                  {marcas.map(m => <option key={m.id} value={m.nome}>{m.nome}</option>)}
                </select>
                <select 
                  className="h-9 rounded-md border bg-white px-2 text-xs focus:ring-1 focus:ring-indigo-500 outline-none disabled:opacity-50" 
                  value={selModelo} 
                  onChange={e => setSelModelo(e.target.value)}
                  disabled={!selMarca}
                >
                  <option value="">Modelo</option>
                  {modelos.map(m => <option key={m.id} value={m.nome}>{m.nome}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <Input placeholder="Motor" className="h-8 text-xs" value={fMotor} onChange={e => setFMotor(e.target.value)} />
                <Input placeholder="Ano Ini" className="h-8 text-xs" type="number" value={fAnoIni} onChange={e => setFAnoIni(e.target.value)} />
                <Input placeholder="Ano Fim" className="h-8 text-xs" type="number" value={fAnoFim} onChange={e => setFAnoFim(e.target.value)} />
              </div>

              <div className="flex-1 border rounded-xl overflow-hidden bg-slate-50 flex flex-col shadow-inner">
                <div className="p-2 border-b bg-white flex justify-between items-center shrink-0">
                  <span className="text-[10px] font-black uppercase text-slate-500 ml-2">Resultados ({filteredVersoes.length})</span>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-7 text-[10px] font-black uppercase hover:bg-slate-100"
                    onClick={() => filteredVersoes.forEach(v => !tempSelectedVersoes.find(x => isSameVersao(x, v)) && toggleVersaoTemp(v))}
                  >
                    Marcar Todos
                  </Button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {filteredVersoes.map(v => {
                    const isSelected = !!tempSelectedVersoes.find(x => isSameVersao(x, v));
                    return (
                      <label key={v.id} className={cn(
                        "flex items-center gap-3 p-3.5 rounded-xl cursor-pointer text-xs border transition-all hover:shadow-sm",
                        isSelected ? "bg-indigo-50/50 border-indigo-300" : "bg-white border-slate-200 hover:border-slate-300"
                      )}>
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                          checked={isSelected} 
                          onChange={() => toggleVersaoTemp(v)} 
                        />
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold uppercase text-slate-700 truncate">{v.marca} {v.modelo}</span>
                          <span className="text-slate-500 leading-tight">
                            {v.familia && <span className="font-semibold">{v.familia} · </span>}
                            {v.versao} · {v.motorizacao} · {v.ano_inicio}-{v.ano_fim || "Atual"}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                  {filteredVersoes.length === 0 && (
                    <div className="h-full flex items-center justify-center text-slate-400 italic text-sm">
                      Sem resultados disponíveis. Busque por Marca e Modelo.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Lado Direito: Selecionados Atuais */}
            <div className="bg-slate-50 rounded-2xl p-5 flex flex-col h-full border border-dashed border-slate-300">
              <div className="flex items-center justify-between mb-3 shrink-0">
                <h3 className="font-black uppercase tracking-wider text-xs text-indigo-950">Veículos Vinculados</h3>
                <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200">{tempSelectedVersoes.length}</Badge>
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                {tempSelectedVersoes.map(v => (
                  <div key={v.id} className="flex items-center justify-between bg-white p-2.5 rounded-xl border hover:border-rose-200 transition-all shadow-sm">
                    <div className="flex flex-col min-w-0">
                      <span className="font-bold text-xs uppercase text-slate-700 truncate">{v.marca} {v.modelo}</span>
                      <span className="text-[10px] text-slate-500 truncate font-semibold">{v.versao} | {v.motorizacao}</span>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7 text-rose-500 hover:bg-rose-50 hover:text-rose-600 rounded-full shrink-0"
                      onClick={() => toggleVersaoTemp(v)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
                {tempSelectedVersoes.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-3 opacity-70 italic text-xs">
                    <Car className="w-10 h-10 text-slate-300" />
                    <p>Nenhum veículo selecionado para este produto.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t gap-2">
            <Button variant="outline" onClick={() => setIsVehiclesModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleConfirmVehicles} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 shadow-md shadow-indigo-600/10">
              Confirmar Veículos ({tempSelectedVersoes.length})
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
