// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Loader2, Save, RotateCw, Trash2, Image as ImageIcon } from 'lucide-react';
import { ProdutoEstoque } from '@/types/produto';
import { Card, CardContent } from '@/components/ui/card';

interface GerarCatalogoModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProducts: ProdutoEstoque[];
  onSuccess: () => void;
}

// Helper para girar imagem client-side e retornar um File
async function rotateImageUrl(url: string, rotationDeg: number = 90): Promise<File> {
  return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
          const sw = img.naturalWidth;
          const sh = img.naturalHeight;
          const dw = sh;
          const dh = sw;
          const canvas = document.createElement("canvas");
          canvas.width = dw;
          canvas.height = dh;
          const ctx = canvas.getContext("2d")!;
          ctx.translate(dw / 2, dh / 2);
          ctx.rotate((rotationDeg * Math.PI) / 180);
          ctx.drawImage(img, -sw / 2, -sh / 2, sw, sh);
          canvas.toBlob(
              (blob) => {
                  if (!blob) return reject(new Error("Blob null"));
                  const ts = new Date().toISOString().replace(/[:.]/g, "-");
                  const newFile = new File([blob], `rotated-${ts}.jpg`, { type: "image/jpeg" });
                  resolve(newFile);
              },
              "image/jpeg",
              0.9
          );
      };
      img.onerror = (err) => reject(err);
      img.src = url;
  });
}

export function GerarCatalogoModal({ isOpen, onClose, selectedProducts, onSuccess }: GerarCatalogoModalProps) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [categorias, setCategorias] = useState<any[]>([]);
  
  // Controle do modal secundário de imagens
  const [editingImagesIndex, setEditingImagesIndex] = useState<number | null>(null);
  const [rotatingIndex, setRotatingIndex] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      setItems(selectedProducts.map(p => {
        // Extrai todas as imagens do produto
        let urls: string[] = [];
        if (Array.isArray(p.imagem_urls) && p.imagem_urls.length > 0) {
          urls = [...p.imagem_urls].filter(Boolean);
        } else if (p.imagem_url) {
          urls = [p.imagem_url];
        }

        return {
          estoque_id: p.id,
          nome: p.nome || '',
          preco_padrao: p.preco || 0,
          categoria_id: p.categoria_id || '',
          part_number: p.part_number || '',
          imagem_urls: urls,
          marca: p.marca || '',
          modelo: p.modelo || '',
          ano_inicio: p.ano_inicio || '',
          ano_fim: p.ano_fim || '',
          motorizacao: p.motorizacao || '',
          update_estoque: false
        };
      }));
      
      api.get('/api/configuracoes/categorias').then(data => {
        setCategorias(Array.isArray(data) ? data : []);
      }).catch(console.error);
    } else {
      setEditingImagesIndex(null);
    }
  }, [isOpen, selectedProducts]);

  const handleFieldChange = (index: number, field: string, value: any) => {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);
  };

  const handleRotateImage = async (itemIndex: number, imgIndex: number) => {
    try {
      setRotatingIndex(imgIndex);
      const url = items[itemIndex].imagem_urls[imgIndex];
      if (!url) return;
      
      const file = await rotateImageUrl(url, 90);
      const formData = new FormData();
      formData.append("file", file);
      
      const res = await api.postMultipart("/api/admin/upload-produto-imagem", formData);
      if (res && res.url) {
        const newUrls = [...items[itemIndex].imagem_urls];
        newUrls[imgIndex] = res.url;
        handleFieldChange(itemIndex, "imagem_urls", newUrls);
      }
    } catch (e) {
      console.error(e);
      toast.error("Erro ao girar imagem");
    } finally {
      setRotatingIndex(null);
    }
  };

  const handleDeleteImage = (itemIndex: number, imgIndex: number) => {
    const newUrls = [...items[itemIndex].imagem_urls];
    newUrls.splice(imgIndex, 1);
    handleFieldChange(itemIndex, "imagem_urls", newUrls);
  };

  const handleSave = async () => {
    setLoading(true);
    let successCount = 0;
    
    try {
      for (const item of items) {
        // Envia a primeira imagem como principal, caso exista
        const mainImage = item.imagem_urls && item.imagem_urls.length > 0 ? item.imagem_urls[0] : null;
        
        // 1. Criar produto no catálogo
        const catalogoPayload = {
          nome: item.nome,
          preco_padrao: item.preco_padrao,
          categoria_id: item.categoria_id,
          part_number: item.part_number,
          imagem_url: mainImage,
          imagem_urls: item.imagem_urls, // Manda o array de imagens caso o backend suporte
          detalhes: "Gerado a partir do estoque",
        };
        
        const catRes = await api.post("/api/catalogo/pecas-v2", catalogoPayload);
        const pecaId = catRes.id || catRes.peca_id; 
        
        // 2. Adicionar compatibilidade
        if (pecaId && (item.marca || item.modelo || item.ano_inicio)) {
          const compatPayload = {
            versoes: [{
              marca: item.marca,
              modelo: item.modelo,
              ano_inicio: item.ano_inicio ? parseInt(item.ano_inicio) : null,
              ano_fim: item.ano_fim ? parseInt(item.ano_fim) : null,
              motorizacao: item.motorizacao
            }]
          };
          try {
            await api.post(`/api/catalogo/pecas-v2/${pecaId}/compatibilidades`, compatPayload);
          } catch (e) {
            console.error("Erro ao salvar compatibilidade", e);
          }
        }
        
        // 3. Atualizar estoque se selecionado
        if (item.update_estoque && item.estoque_id) {
          const estoquePayload = {
            nome: item.nome,
            preco: item.preco_padrao,
            categoria_id: item.categoria_id,
            part_number: item.part_number,
            marca: item.marca,
            modelo: item.modelo,
            ano_inicio: item.ano_inicio,
            ano_fim: item.ano_fim,
            motorizacao: item.motorizacao,
            // Atualiza o estoque com as imagens se foram editadas
            imagem_url: mainImage,
            imagem_urls: item.imagem_urls
          };
          try {
            await api.put(`/api/produtos/${item.estoque_id}`, estoquePayload);
          } catch (e) {
            console.error("Erro ao atualizar estoque", e);
          }
        }
        
        successCount++;
      }
      
      toast.success(`${successCount} produto(s) gerado(s) no catálogo com sucesso!`);
      onSuccess();
      onClose();
    } catch (error) {
      console.error(error);
      toast.error("Erro ao gerar produtos no catálogo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="Gerar Catálogo a partir do Estoque" className="max-w-4xl">
        <div className="flex flex-col h-full max-h-[80vh]">
          <p className="text-sm text-muted-foreground mb-4">
            Revise os dados abaixo. As edições serão salvas no Catálogo.
            Você também pode optar por atualizar o produto no estoque simultaneamente.
          </p>

          <div className="flex-1 overflow-y-auto pr-2 space-y-6">
            {items.map((item, index) => (
              <Card key={item.estoque_id || index} className="border shadow-sm">
                <CardContent className="p-4 flex flex-col md:flex-row gap-6">
                  {/* Image Preview */}
                  <div className="flex-shrink-0 flex flex-col gap-2 items-center">
                    <div 
                      className="relative w-32 h-32 rounded-md border overflow-hidden cursor-pointer group bg-muted flex items-center justify-center transition-all hover:ring-2 hover:ring-primary/50"
                      onClick={() => setEditingImagesIndex(index)}
                    >
                      {item.imagem_urls && item.imagem_urls.length > 0 ? (
                        <>
                          <img 
                            src={item.imagem_urls[0]} 
                            alt="Preview" 
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <span className="text-white text-xs font-semibold px-2 text-center flex flex-col items-center gap-1">
                              <ImageIcon className="w-5 h-5" />
                              Ver {item.imagem_urls.length} foto{item.imagem_urls.length > 1 ? 's' : ''}
                            </span>
                          </div>
                        </>
                      ) : (
                        <div className="text-muted-foreground text-xs text-center p-2 flex flex-col items-center gap-1">
                          <ImageIcon className="w-6 h-6 opacity-50" />
                          Sem Imagem
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground text-center">Clique para editar fotos</span>
                  </div>

                  {/* Form Fields */}
                  <div className="flex-1 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label className="text-xs">Título / Nome</Label>
                        <Input 
                          value={item.nome} 
                          onChange={(e) => handleFieldChange(index, 'nome', e.target.value)} 
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Preço</Label>
                          <Input 
                            type="number" 
                            step="0.01"
                            value={item.preco_padrao} 
                            onChange={(e) => handleFieldChange(index, 'preco_padrao', parseFloat(e.target.value))} 
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Part Number</Label>
                          <Input 
                            value={item.part_number} 
                            onChange={(e) => handleFieldChange(index, 'part_number', e.target.value)} 
                            className="h-8 text-sm"
                          />
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-1">
                      <Label className="text-xs">Categoria</Label>
                      <select 
                        className="w-full h-8 rounded-md border border-input px-2 text-sm"
                        value={item.categoria_id}
                        onChange={(e) => handleFieldChange(index, 'categoria_id', e.target.value)}
                      >
                        <option value="">Selecione uma categoria...</option>
                        {categorias.map(c => (
                          <option key={c.id} value={c.id}>{c.nome}</option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                      <div className="space-y-1 col-span-2 md:col-span-1">
                        <Label className="text-xs">Marca</Label>
                        <Input 
                          value={item.marca} 
                          onChange={(e) => handleFieldChange(index, 'marca', e.target.value)} 
                          className="h-8 text-sm"
                          placeholder="Ex: Fiat"
                        />
                      </div>
                      <div className="space-y-1 col-span-2 md:col-span-1">
                        <Label className="text-xs">Modelo</Label>
                        <Input 
                          value={item.modelo} 
                          onChange={(e) => handleFieldChange(index, 'modelo', e.target.value)} 
                          className="h-8 text-sm"
                          placeholder="Ex: Uno"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Ano Ini</Label>
                        <Input 
                          type="number"
                          value={item.ano_inicio} 
                          onChange={(e) => handleFieldChange(index, 'ano_inicio', e.target.value)} 
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Ano Fim</Label>
                        <Input 
                          type="number"
                          value={item.ano_fim} 
                          onChange={(e) => handleFieldChange(index, 'ano_fim', e.target.value)} 
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1 col-span-2 md:col-span-1">
                        <Label className="text-xs">Motor</Label>
                        <Input 
                          value={item.motorizacao} 
                          onChange={(e) => handleFieldChange(index, 'motorizacao', e.target.value)} 
                          className="h-8 text-sm"
                          placeholder="Ex: 1.0"
                        />
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 pt-2 border-t mt-2">
                      <input 
                        type="checkbox"
                        id={`update-estoque-${index}`} 
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                        checked={item.update_estoque}
                        onChange={(e) => handleFieldChange(index, 'update_estoque', e.target.checked)}
                      />
                      <label 
                        htmlFor={`update-estoque-${index}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        Atualizar dados deste produto no estoque também
                      </label>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t flex justify-end gap-2 shrink-0">
            <Button variant="outline" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={loading || items.length === 0} className="gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Gerar {items.length} Produto(s)
            </Button>
          </div>
        </div>
      </Modal>

      {/* Editor de Imagens (Sub-modal) */}
      {editingImagesIndex !== null && (
        <Modal 
          isOpen={true} 
          onClose={() => setEditingImagesIndex(null)} 
          title="Editar Fotos do Produto" 
          className="max-w-4xl z-[150]"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-h-[60vh] overflow-y-auto p-2">
            {items[editingImagesIndex]?.imagem_urls?.map((url: string, imgIndex: number) => (
              <div key={imgIndex} className="relative group border rounded-lg overflow-hidden flex flex-col items-center justify-center bg-muted h-48 shadow-sm">
                <img src={url} alt={`Foto ${imgIndex + 1}`} className="max-h-full max-w-full object-contain" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-3 transition-opacity">
                  <button
                    onClick={() => handleRotateImage(editingImagesIndex, imgIndex)}
                    disabled={rotatingIndex !== null}
                    className="p-2 bg-white/20 hover:bg-white/40 disabled:opacity-50 rounded-full text-white backdrop-blur-sm transition-colors"
                    title="Girar Imagem 90°"
                  >
                    {rotatingIndex === imgIndex ? <Loader2 className="w-6 h-6 animate-spin" /> : <RotateCw className="w-6 h-6" />}
                  </button>
                  <button
                    onClick={() => handleDeleteImage(editingImagesIndex, imgIndex)}
                    disabled={rotatingIndex !== null}
                    className="p-2 bg-red-500/80 hover:bg-red-500 disabled:opacity-50 rounded-full text-white backdrop-blur-sm transition-colors"
                    title="Excluir Imagem"
                  >
                    <Trash2 className="w-6 h-6" />
                  </button>
                </div>
              </div>
            ))}
            {(!items[editingImagesIndex]?.imagem_urls || items[editingImagesIndex].imagem_urls.length === 0) && (
              <div className="col-span-full text-center py-10 text-muted-foreground flex flex-col items-center gap-2">
                <ImageIcon className="w-10 h-10 opacity-20" />
                Nenhuma imagem disponível.
              </div>
            )}
          </div>
          <div className="mt-4 pt-4 border-t flex justify-end">
            <Button onClick={() => setEditingImagesIndex(null)}>
              Concluir Edição de Fotos
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

