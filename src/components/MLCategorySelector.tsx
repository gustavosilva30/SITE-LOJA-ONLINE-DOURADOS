import React, { useState, useEffect, useRef } from "react";
import { Check, ChevronsUpDown, Loader2, Search, Zap } from "lucide-react";
import { mercadoLivreApi } from "@/lib/api";
import { toast } from "sonner";
import { Input } from "./ui/input";
import { Button } from "./ui/button";

interface Category {
  category_id: string;
  category_name: string;
  domain_id?: string;
  prediction_probability?: number;
}

interface MLCategorySelectorProps {
  productName: string;
  selectedCategoryId?: string;
  onSelectCategory: (categoryId: string, categoryName: string) => void;
}

export function MLCategorySelector({
  productName,
  selectedCategoryId,
  onSelectCategory,
}: MLCategorySelectorProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [query, setQuery] = useState("");
  const [predicted, setPredicted] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Fecha dropdown se clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Ao abrir ou receber um nome do produto pela primeira vez sem categoria selecionada, tenta prever
  useEffect(() => {
    if (productName && !selectedCategoryId && !predicted && !loading && categories.length === 0) {
      predictCategory(productName);
    }
  }, [productName, selectedCategoryId, predicted]);

  const predictCategory = async (title: string) => {
    setLoading(true);
    try {
      const res = await mercadoLivreApi.preverCategoria(title);
      const data = res.data || res;
      // Tratar o retorno da API do ML
      if (Array.isArray(data) && data.length > 0) {
        setCategories(data);
        setPredicted(true);
        // Autoselecionar a primeira se houver muita certeza
        if (!selectedCategoryId && data[0]?.category_id) {
            onSelectCategory(data[0].category_id, data[0].category_name);
        }
      } else if (data?.id || data?.category_id) {
        const catId = data.category_id || data.id;
        const catName = data.category_name || data.name;
        setCategories([{ category_id: catId, category_name: catName }]);
        setPredicted(true);
        if (!selectedCategoryId) {
            onSelectCategory(catId, catName);
        }
      }
    } catch (error) {
      console.error("Erro ao prever categoria", error);
    } finally {
      setLoading(false);
    }
  };

  const searchManualCategory = async (searchTerm: string) => {
    if (!searchTerm || searchTerm.length < 3) return;
    setLoading(true);
    try {
      // Usaremos a API de domain_discovery search se estiver conectada
      const res = await mercadoLivreApi.pesquisarCategorias(searchTerm);
      const data = res.data || res;
      if (Array.isArray(data)) {
        setCategories(
          data.map((c: any) => ({
            category_id: c.category_id || c.id,
            category_name: c.category_name || c.domain_name || c.name,
          }))
        );
      }
    } catch (error) {
      console.error("Erro ao buscar categorias", error);
      toast.error("Erro ao buscar categoria");
    } finally {
      setLoading(false);
    }
  };

  const selectedCategoryObj = categories.find((c) => c.category_id === selectedCategoryId) || 
      (selectedCategoryId ? { category_id: selectedCategoryId, category_name: "Categoria ID: " + selectedCategoryId } : null);

  return (
    <div className="relative w-full" ref={containerRef}>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-bold uppercase text-muted-foreground">
          Categoria no Mercado Livre
        </label>
        <div 
          onClick={() => setOpen(!open)}
          className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background cursor-pointer hover:bg-accent/50 transition-colors"
        >
          {selectedCategoryObj ? (
            <span className="truncate flex-1 font-medium flex items-center gap-2">
                {predicted && selectedCategoryId === categories[0]?.category_id && (
                    <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                )}
                {selectedCategoryObj.category_name}
            </span>
          ) : (
            <span className="text-muted-foreground">Prever ou buscar categoria...</span>
          )}
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </div>
      </div>

      {open && (
        <div className="absolute top-full left-0 z-50 w-full mt-1 rounded-md border bg-popover text-popover-foreground shadow-md outline-none animate-in fade-in-0 zoom-in-95">
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              placeholder="Pesquisar categoria manualmente..."
              className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  searchManualCategory(query);
                }
              }}
            />
            {query && (
                <Button variant="ghost" size="sm" onClick={() => searchManualCategory(query)} disabled={loading}>
                    Buscar
                </Button>
            )}
          </div>
          
          <div className="max-h-[300px] overflow-y-auto overflow-x-hidden p-1">
            {loading && (
                <div className="py-6 text-center text-sm flex justify-center text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                </div>
            )}
            
            {!loading && categories.length === 0 && (
                <div className="py-6 text-center text-sm text-muted-foreground">
                    Nenhuma categoria encontrada.
                </div>
            )}
            
            {!loading && categories.map((cat, index) => {
              const isSelected = selectedCategoryId === cat.category_id;
              const isFirstPrediction = predicted && index === 0 && query.length === 0;
              
              return (
                <div
                  key={cat.category_id}
                  onClick={() => {
                    onSelectCategory(cat.category_id, cat.category_name);
                    setOpen(false);
                  }}
                  className={`relative flex w-full cursor-pointer select-none items-center rounded-sm py-2 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground ${isSelected ? 'bg-accent/50 font-bold' : ''}`}
                >
                  <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                    {isSelected && <Check className="h-4 w-4" />}
                    {!isSelected && isFirstPrediction && <Zap className="h-3.5 w-3.5 text-amber-500" />}
                  </span>
                  <div className="flex flex-col">
                      <span>{cat.category_name}</span>
                      {isFirstPrediction && (
                          <span className="text-[10px] text-amber-600/80 font-medium">Melhor predição</span>
                      )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
